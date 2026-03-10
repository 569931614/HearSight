# 思维导图管理员配置功能说明

## ✨ 功能概述

已成功将 DashScope API Key 从硬编码改为**管理员后台配置**，管理员可以在后台设置页面修改 API Key，无需修改代码。

## 🔧 实现内容

### 1. 后端修改

**文件**: `backend/routers/qdrant_rag.py`

- ❌ 移除硬编码的 API Key
- ✅ 从数据库配置表读取 `dashscope_api_key`
- ✅ 添加完善的错误提示

```python
# 从数据库配置读取 API Key
api_key = get_config(None, "dashscope_api_key")

if not api_key or not api_key.strip():
    raise HTTPException(
        status_code=500,
        detail="DashScope API Key not configured. Please set it in Admin Settings."
    )
```

### 2. 前端管理界面

**文件**: `frontend/src/components/AdminSettings.tsx`

在 **AI 配置** 标签页添加了新配置项：

```
┌─────────────────────────────────────────┐
│ 管理员设置                               │
├─────────────────────────────────────────┤
│ [基本设置] [AI 配置]                     │
├─────────────────────────────────────────┤
│                                          │
│ 阿里云 DashScope API Key                 │
│ ┌─────────────────────────────────────┐│
│ │ sk-xxxxxx (输入框，密码类型)         ││
│ └─────────────────────────────────────┘│
│ 💡 用于思维导图生成的通义千问 API Key    │
│                                          │
│ 对话系统提示词                           │
│ ┌─────────────────────────────────────┐│
│ │ (多行文本框)                          ││
│ └─────────────────────────────────────┘│
│                                          │
│ 思维导图生成提示词                       │
│ ┌─────────────────────────────────────┐│
│ │ (多行文本框)                          ││
│ └─────────────────────────────────────┘│
│                                          │
│ [保存配置] [退出登录]                    │
└─────────────────────────────────────────┘
```

### 3. 初始化脚本

**文件**: `init_dashscope_config.py`

用于首次设置或重置 API Key：

```bash
python3.8 init_dashscope_config.py
```

## 📝 使用方式

### 方式一：使用初始化脚本（推荐首次设置）

```bash
# 1. 编辑脚本，修改 API Key
nano init_dashscope_config.py

# 2. 运行初始化脚本
python3.8 init_dashscope_config.py

# 输出:
# ✅ DashScope API Key 已成功写入数据库！
```

### 方式二：通过管理员后台修改（推荐日常使用）

1. 访问网站，点击左下角 ⚙️ 设置图标
2. 输入管理员密码登录
3. 切换到 **AI 配置** 标签页
4. 在 **阿里云 DashScope API Key** 字段输入或修改 API Key
5. 点击 **保存配置** 按钮
6. 系统提示：✅ 配置已更新

## 🎯 配置字段说明

| 配置项 | 字段名 | 说明 | 必填 |
|--------|--------|------|------|
| DashScope API Key | `dashscope_api_key` | 阿里云通义千问 API密钥，格式：sk-xxxxx | ✅ 是 |
| 对话系统提示词 | `system_prompt` | AI 对话时的系统提示词 | ❌ 否 |
| 思维导图提示词 | `mindmap_prompt` | 生成思维导图的提示词模板 | ❌ 否 |

## 🧪 测试验证

### 测试 1: 验证数据库配置

```bash
# 查看配置是否写入成功
psql -h localhost -p 5433 -U postgres -d hearsight -c "SELECT * FROM system_config WHERE config_key='dashscope_api_key';"
```

### 测试 2: 测试思维导图生成

```bash
# 使用测试脚本生成思维导图
python3.8 test_mindmap_generation.py [video_id]

# 预期输出:
# ✅ 思维导图获取成功!
# 自动生成: True
```

### 测试 3: 前端界面测试

1. 登录管理员后台
2. 查看 API Key 是否显示为 `sk-f3a33d4...`（前20位）
3. 修改 API Key 为其他值
4. 保存并重新测试思维导图生成

## ✅ 测试结果

```bash
📹 视频 ID: 1077e3a98c4a007b
✅ 思维导图获取成功!
自动生成: True
生成时间: 2025-12-20T00:28:10

# 骨骼肌、心肌、平滑肌比较
## 结构特征对比
### 骨骼肌为长圆柱形多核细胞
### 心肌呈短分支状有闰盘
...
```

## 🔒 安全性

1. **前端显示**: API Key 使用密码输入框（`Input.Password`），不明文显示
2. **数据传输**: HTTPS 加密传输（生产环境）
3. **数据库存储**: 存储在 `system_config` 表中
4. **权限控制**: 只有管理员登录后才能查看和修改

## 📊 数据库表结构

```sql
CREATE TABLE system_config (
    config_key VARCHAR(255) PRIMARY KEY,
    config_value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 示例数据
INSERT INTO system_config (config_key, config_value)
VALUES ('dashscope_api_key', 'sk-f3a33d4760514c9fbe73783e8d245e8f');
```

## 🔧 故障排查

### 问题1: "DashScope API Key not configured"

**原因**: 数据库中未设置 API Key

**解决方案**:
```bash
python3.8 init_dashscope_config.py
# 或在管理员后台手动设置
```

### 问题2: 管理员后台看不到 API Key 字段

**原因**: 前端代码未更新

**解决方案**:
```bash
cd frontend
npm run build
# 或重启前端开发服务器
```

### 问题3: API Key 修改后不生效

**原因**: 可能需要重启后端服务

**解决方案**:
```bash
# 后端会自动从数据库读取最新配置
# 如果问题持续，重启后端服务
pkill -f "uvicorn main:app"
python3.8 -m uvicorn main:app --host 0.0.0.0 --port 9999 --reload
```

## 📁 修改的文件列表

1. ✅ `backend/routers/qdrant_rag.py` - 后端逻辑
2. ✅ `frontend/src/components/AdminSettings.tsx` - 管理界面
3. ✅ `init_dashscope_config.py` - 初始化脚本（新增）
4. ✅ `requirements.txt` - 添加 openai 依赖

## 🔮 未来改进

1. **批量管理**: 支持管理多个 API Key（用于负载均衡）
2. **使用统计**: 记录 API 调用次数和费用
3. **Key 验证**: 在保存前验证 API Key 是否有效
4. **加密存储**: 对敏感配置进行加密存储

## 📝 更新日志

### 2025-12-20 v2.0
- ✅ 移除硬编码的 API Key
- ✅ 添加管理员后台配置界面
- ✅ 创建初始化脚本
- ✅ 完成测试验证

---

**作者**: Claude Code
**日期**: 2025-12-20
**版本**: 2.0.0
