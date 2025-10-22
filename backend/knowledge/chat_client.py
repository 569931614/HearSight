"""
OpenAI兼容的聊天客户端

支持所有OpenAI API兼容的服务（ChatGPT、DeepSeek、Gemini等）
"""
from typing import List, Dict, Any, Optional
import requests
import json
import logging

logger = logging.getLogger(__name__)


def chat_with_openai(
    messages: List[Dict[str, str]],
    api_key: str,
    base_url: str = "https://api.openai.com/v1",
    model: str = "gpt-3.5-turbo",
    temperature: float = 0.3,
    timeout: int = 60,
    **kwargs
) -> str:
    """
    调用OpenAI兼容的Chat Completion API

    Args:
        messages: 消息列表，格式 [{"role": "user", "content": "..."}]
        api_key: API密钥
        base_url: API基础URL
        model: 模型名称
        temperature: 温度参数（0-1）
        timeout: 超时时间（秒）
        **kwargs: 其他API参数

    Returns:
        str: AI返回的文本内容

    Raises:
        requests.HTTPError: API调用失败
        ValueError: 参数错误
    """
    if not api_key:
        raise ValueError("api_key不能为空")

    if not messages:
        raise ValueError("messages不能为空")

    # 构造请求URL
    url = f"{base_url.rstrip('/')}/chat/completions"

    # 请求头
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    # 请求体
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
    }

    # 合并额外参数
    if kwargs:
        payload.update(kwargs)

    try:
        logger.info(f"调用 LLM API: {url}, model={model}")

        # 发送请求
        response = requests.post(
            url,
            json=payload,
            headers=headers,
            timeout=timeout
        )

        # 检查响应状态
        if not response.ok:
            raise requests.HTTPError(
                f"API调用失败: {response.status_code} {response.reason}\n"
                f"响应内容: {response.text}"
            )

        # 解析响应
        data = response.json()

        # 提取返回内容
        choices = data.get("choices", [])
        if not choices:
            raise ValueError("API返回的choices为空")

        message = choices[0].get("message", {})
        content = message.get("content", "")

        logger.info(f"LLM API 调用成功，返回长度: {len(content)}")
        return content.strip()

    except requests.Timeout:
        raise TimeoutError(f"API调用超时（{timeout}秒）")
    except requests.RequestException as e:
        raise requests.HTTPError(f"网络请求失败: {str(e)}")
    except json.JSONDecodeError as e:
        raise ValueError(f"API返回的JSON格式错误: {str(e)}")


def chat_simple(
    prompt: str,
    api_key: str,
    base_url: str = "https://api.openai.com/v1",
    model: str = "gpt-3.5-turbo",
    system_message: Optional[str] = None,
    **kwargs
) -> str:
    """
    简化版聊天接口，直接传入prompt

    Args:
        prompt: 用户提示词
        api_key: API密钥
        base_url: API基础URL
        model: 模型名称
        system_message: 可选的系统消息
        **kwargs: 其他参数

    Returns:
        str: AI返回的文本
    """
    messages = []

    # 添加系统消息
    if system_message:
        messages.append({
            "role": "system",
            "content": system_message
        })

    # 添加用户消息
    messages.append({
        "role": "user",
        "content": prompt
    })

    return chat_with_openai(
        messages=messages,
        api_key=api_key,
        base_url=base_url,
        model=model,
        **kwargs
    )


def chat_with_rag(
    query: str,
    context_documents: List[Dict[str, Any]],
    api_key: str,
    base_url: str,
    model: str,
    system_prompt: Optional[str] = None,
    **kwargs
) -> Dict[str, Any]:
    """
    带 RAG（检索增强生成）的对话

    Args:
        query: 用户查询
        context_documents: 检索到的相关文档列表
        api_key: API密钥
        base_url: API基础URL
        model: 模型名称
        system_prompt: 系统提示词
        **kwargs: 其他参数

    Returns:
        Dict: 包含答案和引用的字典
    """
    # 默认系统提示
    if not system_prompt:
        system_prompt = """你是一个视频内容分析助手。用户会向你提问关于视频内容的问题，我会提供相关的视频片段和摘要作为参考。

请根据提供的视频片段内容来回答用户的问题。如果答案在提供的内容中，请详细回答并引用相关片段。如果提供的内容不足以回答问题，请诚实地说明。

在回答时，请：
1. 优先使用提供的视频内容进行回答
2. 如果引用了特定片段，可以提到"根据视频 X 的 Y 秒到 Z 秒..."
3. 保持回答简洁、准确
4. 如果有多个相关片段支持答案，可以综合说明"""

    # 构建上下文
    context_parts = []
    for i, doc in enumerate(context_documents, 1):
        meta = doc.get("metadata", {})
        content = doc.get("document", "")

        video_path = meta.get("video_path", "未知视频")
        video_name = video_path.split("/")[-1].split("\\")[-1] if video_path else "未知"

        if meta.get("type") == "paragraph":
            start_time = meta.get("start_time", 0)
            end_time = meta.get("end_time", 0)
            context_parts.append(
                f"[片段 {i}] 视频: {video_name}, 时间: {start_time:.1f}s - {end_time:.1f}s\n{content}\n"
            )
        else:
            context_parts.append(
                f"[片段 {i}] 视频: {video_name} (整体摘要)\n{content}\n"
            )

    context_text = "\n".join(context_parts)

    # 构建用户消息
    user_message = f"""参考视频内容：
{context_text}

用户问题：{query}

请根据上面提供的视频内容回答用户的问题。"""

    # 调用 LLM
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message}
    ]

    try:
        answer = chat_with_openai(
            messages=messages,
            api_key=api_key,
            base_url=base_url,
            model=model,
            **kwargs
        )

        return {
            "answer": answer,
            "references": context_documents,
            "query": query
        }

    except Exception as e:
        logger.error(f"RAG 对话失败: {e}")
        raise
