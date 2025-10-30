# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import get_config, load_config
from backend.db.pg_store import init_db, claim_next_pending_job, finish_job_success, finish_job_failed, save_summaries
from backend.utils.vedio_utils.download_video.download_bilibili import download_bilibili
from backend.audio2text.asr_sentence_segments import process as asr_process
from backend.routers.media import router as media_router
from backend.routers.knowledge import router as knowledge_router
from backend.routers.admin import router as admin_router



APP_DIR = Path(__file__).parent.resolve()

cfg = get_config()
# 同时读取原始的 .env dict（若有更复杂的 app_datas 配置可以放在这里）
raw_cfg = load_config()
app_datas = raw_cfg.get("app_datas", {}) if isinstance(raw_cfg, dict) else {}

# 共享视频静态目录（默认指向 app_datas/download_videos）
shared_media_dir_cfg = os.environ.get("HEARSIGHT_SHARED_MEDIA_DIR") or app_datas.get("download_video_path", "app_datas/download_videos")
download_video_path = Path(shared_media_dir_cfg)
if not download_video_path.is_absolute():
    download_video_path = (APP_DIR / download_video_path).resolve()
download_video_path.mkdir(parents=True, exist_ok=True)

# 共享向量库目录
vector_db_dir_cfg = os.environ.get("HEARSIGHT_VECTOR_DB_DIR") or app_datas.get("vector_db_path", "app_datas/vector_db")
vector_db_dir = Path(vector_db_dir_cfg)
if not vector_db_dir.is_absolute():
    vector_db_dir = (APP_DIR / vector_db_dir).resolve()
vector_db_dir.mkdir(parents=True, exist_ok=True)

# Build database URL from environment variables
# 直接使用 None，在 pg_store.py 中从环境变量构建连接参数
db_url = None

init_db(db_url)

# 创建应用
app = FastAPI(title="HearSight API")

# CORS（开发阶段放开）
# 支持通过环境变量在 docker 部署时显式设置允许来源，例如 FRONTEND_HOST/FRONTEND_PORT 或 ALLOW_ORIGINS
allow_origins_env = os.environ.get('ALLOW_ORIGINS')
if allow_origins_env:
    # 支持逗号分隔的 origin 列表
    allow_origins = [s.strip() for s in allow_origins_env.split(',') if s.strip()]
else:
    frontend_host = os.environ.get('FRONTEND_HOST')
    frontend_port = os.environ.get('FRONTEND_PORT')
    if frontend_host and frontend_port:
        allow_origins = [f"http://{frontend_host}:{frontend_port}"]
    else:
        # 默认开放，便于开发（如需生产收紧，请通过 ALLOW_ORIGINS 设置）
        allow_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载静态目录（下载的视频存放于此，前端通过 /static/xxx 访问）
app.mount("/static", StaticFiles(directory=str(download_video_path)), name="static")
app.state.static_dir = download_video_path
app.state.db_url = db_url
app.state.vector_db_dir = vector_db_dir
app.state.shared_media_dir = download_video_path

# 注册路由
app.include_router(media_router)
app.include_router(knowledge_router)
app.include_router(admin_router)


# 启动后台worker：简单串行处理下载+ASR+摘要，避免阻塞请求线程
def _job_worker(app: FastAPI) -> None:
    import time
    import logging
    from pathlib import Path

    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger("job_worker")

    static_dir: Path = app.state.static_dir
    while True:
        job = claim_next_pending_job(db_url)
        if not job:
            time.sleep(1.0)
            continue
        job_id = int(job["id"])
        url = str(job["url"])
        logger.info(f"开始处理任务 #{job_id}: {url}")
        try:
            # 读取当前任务的 result，用于阶段性恢复
            from backend.db.pg_store import get_job, update_job_result, save_transcript  # 局部导入避免循环
            from backend.text_process.summarize import summarize_segments
            from config import get_config
            import os

            info = get_job(db_url, job_id) or {}
            res = dict(info.get("result") or {})

            # Step A: 下载阶段（若无 media_path 或文件不存在，则执行下载并写入进度）
            media_path = res.get("media_path")
            if not media_path or not Path(str(media_path)).exists():
                logger.info(f"任务 #{job_id}: 开始下载视频...")
                update_job_result(db_url, job_id, {"progress": 10, "stage": "下载视频中..."})
                files = download_bilibili(url=url, out_dir=str(static_dir), use_nopart=True, simple_filename=True)
                if not files:
                    raise RuntimeError("下载结果为空")
                media_path = str(Path(files[0]).resolve())
                basename = Path(media_path).name
                logger.info(f"任务 #{job_id}: 视频下载完成: {basename}")
                res.update({
                    "media_path": media_path,
                    "basename": basename,
                    "static_url": f"/static/{basename}",
                    "progress": 30,
                    "stage": "下载完成"
                })
                update_job_result(db_url, job_id, {
                    "media_path": media_path,
                    "basename": basename,
                    "static_url": f"/static/{basename}",
                    "progress": 30,
                    "stage": "下载完成"
                })
            else:
                basename = Path(str(media_path)).name
                logger.info(f"任务 #{job_id}: 使用已下载的视频: {basename}")

            # Step B: ASR 阶段（若无 transcript_id，则执行识别与保存）
            if not res.get("transcript_id"):
                logger.info(f"任务 #{job_id}: 开始语音识别...")
                update_job_result(db_url, job_id, {"progress": 40, "stage": "语音识别中..."})
                segs = asr_process(str(media_path))
                logger.info(f"任务 #{job_id}: 识别完成，共 {len(segs)} 个分句")
                transcript_id = save_transcript(db_url, str(media_path), segs)
                logger.info(f"任务 #{job_id}: 转写记录已保存，ID={transcript_id}")
                res.update({"transcript_id": transcript_id, "segments": segs, "progress": 70, "stage": "语音识别完成"})
                update_job_result(db_url, job_id, {"transcript_id": transcript_id, "progress": 70, "stage": "语音识别完成"})
            else:
                # 如果已有 transcript_id，需要读取 segments
                from backend.db.pg_store import get_transcript_by_id
                transcript_data = get_transcript_by_id(db_url, res.get("transcript_id"))
                segs = transcript_data.get("segments", []) if transcript_data else []
                res["segments"] = segs
                logger.info(f"任务 #{job_id}: 使用已有转写记录 ID={res.get('transcript_id')}, {len(segs)} 个分句")

            # Step C: 生成摘要（若无 summaries，则执行摘要生成）
            if not res.get("summaries") and segs:
                logger.info(f"任务 #{job_id}: 开始生成摘要...")
                update_job_result(db_url, job_id, {"progress": 80, "stage": "生成摘要中..."})
                try:
                    cfg = get_config()
                    api_key = cfg.OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY")
                    base_url = cfg.OPENAI_BASE_URL or os.environ.get("OPENAI_BASE_URL")
                    model = cfg.OPENAI_CHAT_MODEL or os.environ.get("OPENAI_CHAT_MODEL")

                    # 从配置或环境读取 CHAT_MAX_WINDOWS
                    chat_max = None
                    if hasattr(cfg, 'CHAT_MAX_WINDOWS') and cfg.CHAT_MAX_WINDOWS:
                        try:
                            chat_max = int(cfg.CHAT_MAX_WINDOWS)
                        except Exception:
                            chat_max = None
                    if chat_max is None:
                        try:
                            chat_max = int(os.environ.get('CHAT_MAX_WINDOWS') or '1000000')
                        except Exception:
                            chat_max = 1000000

                    if api_key and base_url and model:
                        logger.info(f"任务 #{job_id}: 调用 LLM 生成摘要...")
                        summaries = summarize_segments(
                            segments=segs,
                            api_key=api_key,
                            base_url=base_url,
                            model=model,
                            chat_max_windows=chat_max,
                        )
                        logger.info(f"任务 #{job_id}: 摘要生成完成，共 {len(summaries)} 条")
                        # 保存摘要到专门的 summaries 表
                        transcript_id = res.get("transcript_id")
                        if transcript_id:
                            logger.info(f"任务 #{job_id}: 保存摘要到数据库...")
                            summary_id = save_summaries(db_url, transcript_id, summaries)
                            logger.info(f"任务 #{job_id}: 摘要已保存到数据库，summary_id={summary_id}")
                            res.update({"summaries": summaries, "summary_id": summary_id, "progress": 95, "stage": "摘要生成完成"})
                            update_job_result(db_url, job_id, {"summaries": summaries, "summary_id": summary_id, "progress": 95, "stage": "摘要生成完成"})
                        else:
                            logger.warning(f"任务 #{job_id}: 没有 transcript_id，摘要未保存到库")
                            res.update({"summaries": summaries, "progress": 95, "stage": "摘要生成完成（未保存到库）"})
                            update_job_result(db_url, job_id, {"summaries": summaries, "progress": 95, "stage": "摘要生成完成（未保存到库）"})
                    else:
                        logger.warning(f"任务 #{job_id}: 未配置 API，跳过摘要生成")
                        res.update({"progress": 95, "stage": "跳过摘要生成（未配置API）"})
                        update_job_result(db_url, job_id, {"progress": 95, "stage": "跳过摘要生成（未配置API）"})
                except Exception as e:
                    # 摘要生成失败不影响整体流程
                    logger.error(f"任务 #{job_id}: 摘要生成失败: {e}", exc_info=True)
                    res.update({"progress": 95, "stage": f"摘要生成失败: {str(e)}"})
                    update_job_result(db_url, job_id, {"progress": 95, "stage": f"摘要生成失败: {str(e)}"})

            # Step D: 同步到向量库（可选，如果转写和摘要都完成）
            if res.get("transcript_id") and res.get("summaries"):
                try:
                    logger.info(f"任务 #{job_id}: 开始同步到向量库...")
                    from backend.knowledge.knowledge_service import sync_transcript_to_vector_db
                    # 使用与 pyvideotrans 共享的向量库路径
                    vector_db_dir = getattr(app.state, "vector_db_dir", Path(app.state.static_dir).parent / "vector_db")
                    sync_success = sync_transcript_to_vector_db(
                        db_url=db_url,
                        transcript_id=res.get("transcript_id"),
                        persist_directory=str(vector_db_dir)
                    )
                    if sync_success:
                        logger.info(f"任务 #{job_id}: 成功同步到向量库")
                        res.update({"vector_synced": True})
                    else:
                        logger.warning(f"任务 #{job_id}: 向量库同步失败")
                        res.update({"vector_synced": False})
                except Exception as e:
                    logger.error(f"任务 #{job_id}: 向量库同步出错: {e}", exc_info=True)
                    res.update({"vector_synced": False, "vector_sync_error": str(e)})

            # Step E: 完成任务（写入完整结果）
            res.update({"progress": 100, "stage": "处理完成"})
            finish_job_success(db_url, job_id, res)
            logger.info(f"任务 #{job_id}: 处理完成")
        except Exception as e:
            logger.error(f"任务 #{job_id}: 处理失败: {e}", exc_info=True)
            finish_job_failed(db_url, job_id, str(e))


def _start_worker(app: FastAPI) -> None:
    import threading
    t = threading.Thread(target=_job_worker, args=(app,), daemon=True)
    t.start()

_start_worker(app)

if __name__ == "__main__":
    import uvicorn
    # 启动端口优先级：环境变量 PORT > config.yaml(server.backend_port) > 8000
    env_port = os.environ.get("PORT")
    if env_port is not None:
        port = int(env_port)
    else:
        # 优先使用 pydantic Config 的 BACKEND_PORT 字段，其次回退到 8000
        port = int(cfg.BACKEND_PORT) if getattr(cfg, "BACKEND_PORT", None) else 8000
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
