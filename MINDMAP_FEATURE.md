# 思维导图自动生成功能说明

## ✨ 功能概述

已成功实现视频思维导图的自动生成功能。当用户访问视频详情页面时，如果该视频还没有思维导图，系统会自动调用**阿里云通义千问大模型（qwen-plus）**生成结构化的思维导图。

## 🔧 技术实现

### 1. 后端 API

**端点**: `GET /api/qdrant/videos/{video_id}/mindmap`

**参数**:
- `video_id`: 视频ID（必需）
- `auto_generate`: 是否自动生成思维导图（默认: true）

**返回**:
```json
{
  "video_id": "1ac6597dce977202",
  "mind_map_markdown": "# 主题\n## 分支1\n### 要点1.1\n...",
  "generated_at": "2025-12-20T00:18:54.271368",
  "version": "1.0",
  "auto_generated": true  // true=刚生成, false=已存在
}
```

### 2. 自动生成流程

```
1. 用户请求思维导图
   ↓
2. 检查 Qdrant 是否已有思维导图
   ↓ (如果没有)
3. 获取视频内容（标题、总结、段落文本）
   ↓
4. 调用通义千问 API 生成思维导图
   ↓
5. 保存到 Qdrant 数据库
   ↓
6. 返回生成的思维导图
```

### 3. AI 配置

**模型**: 阿里云通义千问 qwen-plus

**API 配置**:
```python
# 环境变量配置（可选）
DASHSCOPE_API_KEY=sk-f3a33d4760514c9fbe73783e8d245e8f

# 如果未设置环境变量，代码中已硬编码 API Key
```

**生成提示词**:
- 可通过数据库配置 `mindmap_prompt` 自定义
- 默认提示词要求生成3-4级层次的 Markdown 结构

## 📝 使用示例

### 前端调用

```typescript
// 获取视频思维导图（自动生成）
const response = await fetch(`/api/qdrant/videos/${videoId}/mindmap`)
const data = await response.json()

if (data.auto_generated) {
  console.log('思维导图刚刚自动生成')
} else {
  console.log('使用已存在的思维导图')
}

// 在 MindMapViewer 组件中渲染
<MindMapViewer markdown={data.mind_map_markdown} />
```

### 命令行测试

```bash
# 测试自动生成功能
python3.8 test_mindmap_generation.py [video_id]

# 如果不提供 video_id，将自动获取第一个视频进行测试
python3.8 test_mindmap_generation.py
```

## 🎯 功能特点

### ✅ 已实现

1. **自动生成**: 首次访问自动调用 AI 生成
2. **智能缓存**: 生成后保存到 Qdrant，后续访问直接返回
3. **内容丰富**: 基于视频标题、总结和段落文本生成
4. **结构化输出**: 支持 3-4 级 Markdown 层次结构
5. **错误处理**: 完善的异常处理和日志记录
6. **可视化展示**: 前端使用 markmap 渲染交互式思维导图

### 🔒 安全限制

- 内容长度限制: 最多4000字符（避免token超限）
- 段落数量限制: 最多50个段落
- 思维导图大小: 最大10MB

## 📊 生成效果示例

```markdown
# 骨的血液供应与哈弗斯系统解剖

## 骨的血液供应来源
### 骨膜动脉
#### 主要来自周围软组织血管
#### 营养骨外层1/3
### 滋养动脉
#### 穿入骨干内部供血
#### 分为上升支和下降支

## 哈弗斯系统结构
### 中央管（哈弗斯管）
#### 含血管和神经
#### 纵向贯穿骨单位
### 哈弗斯骨板
#### 同心圆排列的骨层
#### 提供机械强度

...
```

## 🚀 性能优化

1. **首次生成**: ~10-30秒（取决于视频长度和 API 响应时间）
2. **缓存访问**: < 1秒（直接从 Qdrant 读取）
3. **并发处理**: 支持多个视频同时生成思维导图

## 🐛 故障排查

### 问题1: "No module named 'openai'"
**解决方案**:
```bash
pip3 install openai>=1.0.0
# 或
pip3.8 install openai>=1.0.0
```

### 问题2: API Key 无效
**解决方案**:
- 检查环境变量 `DASHSCOPE_API_KEY`
- 或在代码中更新硬编码的 API Key（backend/routers/qdrant_rag.py:142）

### 问题3: 生成失败
**检查步骤**:
1. 查看后端日志: `tail -f backend.log | grep mindmap`
2. 确认视频有内容数据（segments 不为空）
3. 测试 API 连接: `curl http://localhost:9999/api/qdrant/health`

## 📦 依赖项

已添加到 `requirements.txt`:
```
openai>=1.0.0  # OpenAI SDK (兼容阿里云 DashScope API)
```

## 🔮 未来改进

1. **批量生成**: 支持为所有视频批量生成思维导图
2. **自定义模板**: 允许用户自定义思维导图风格
3. **多语言支持**: 根据视频语言选择不同的提示词
4. **增量更新**: 视频内容更新时自动重新生成
5. **性能监控**: 添加生成时间和质量指标追踪

## 📝 更新日志

### 2025-12-20
- ✅ 实现思维导图自动生成功能
- ✅ 集成阿里云通义千问 API
- ✅ 添加智能缓存机制
- ✅ 创建测试脚本
- ✅ 更新 requirements.txt

## 🙋 常见问题

**Q: 如何禁用自动生成？**
A: 访问时添加参数 `?auto_generate=false`

**Q: 如何手动重新生成思维导图？**
A: 目前需要先删除旧的思维导图（通过数据库），然后重新访问

**Q: 思维导图存储在哪里？**
A: 存储在 Qdrant 向量数据库的 `video_metadata` 集合中

**Q: 如何自定义生成提示词？**
A: 在数据库中设置 `mindmap_prompt` 配置项，或修改 `get_default_mindmap_prompt()` 函数

---

**作者**: Claude Code
**日期**: 2025-12-20
**版本**: 1.0.0
