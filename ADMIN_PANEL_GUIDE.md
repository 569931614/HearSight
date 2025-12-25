# 管理后台使用说明

## 功能概览

HearSight 管理后台提供了完整的用户管理和视频管理功能，基于 PostgreSQL 数据库实现。

## 主要功能

### 1. 用户管理
- 用户列表查看（支持搜索、分页）
- 创建新用户
- 编辑用户信息（用户名、邮箱、密码、权限）
- 删除用户
- 启用/禁用用户账号
- 设置管理员权限

### 2. 视频管理
- 视频列表查看（支持搜索、分页）
- 查看视频详情（分句数、摘要状态）
- 删除视频（会级联删除相关摘要数据）

### 3. 系统统计
- 用户统计：总用户数、活跃用户数、管理员数
- 视频统计：总视频数
- 任务统计：总任务数、待处理任务、失败任务

## 默认管理员账号

系统会在数据库初始化时自动创建默认管理员账号：

- **用户名**: `admin`
- **密码**: `admin123`
- **权限**: 管理员

**重要提示**：首次登录后请立即修改默认密码！

## 访问管理后台

### 方式一：通过前端入口

1. 访问 HearSight 主页
2. 点击页面右上角的"管理后台"按钮
3. 如未登录，系统会跳转到登录页面
4. 输入管理员账号和密码登录
5. 登录成功后自动进入管理后台

### 方式二：直接 API 调用

管理后台提供完整的 RESTful API 接口，可通过 HTTP 请求直接调用。

## API 接口文档

### 认证接口

#### 用户登录
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}

Response:
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGci...",
  "token_type": "bearer",
  "user_id": 1,
  "username": "admin",
  "is_admin": true
}
```

#### 获取当前用户信息
```http
GET /api/auth/me
Authorization: Bearer <token>

Response:
{
  "id": 1,
  "username": "admin",
  "email": "admin@hearsight.com",
  "is_admin": true,
  "is_active": true,
  "created_at": "2025-01-01T00:00:00"
}
```

### 用户管理接口

#### 获取用户列表
```http
GET /api/admin-panel/users?page=1&page_size=10&search=keyword
Authorization: Bearer <token>

Response:
{
  "users": [
    {
      "id": 1,
      "username": "admin",
      "email": "admin@hearsight.com",
      "is_admin": true,
      "is_active": true,
      "created_at": "2025-01-01T00:00:00",
      "last_login": "2025-01-01T12:00:00"
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 10
}
```

#### 创建用户
```http
POST /api/admin-panel/users
Authorization: Bearer <token>
Content-Type: application/json

{
  "username": "newuser",
  "password": "password123",
  "email": "user@example.com",
  "is_admin": false
}

Response:
{
  "success": true,
  "user": {
    "id": 2,
    "username": "newuser",
    "email": "user@example.com",
    "is_admin": false,
    "is_active": true,
    "created_at": "2025-01-01T00:00:00"
  }
}
```

#### 更新用户
```http
PUT /api/admin-panel/users/{user_id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "newemail@example.com",
  "is_admin": true,
  "is_active": true,
  "password": "newpassword"  // 可选，留空则不修改
}

Response:
{
  "success": true,
  "user": { ... }
}
```

#### 删除用户
```http
DELETE /api/admin-panel/users/{user_id}
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "用户已删除"
}
```

### 视频管理接口

#### 获取视频列表
```http
GET /api/admin-panel/videos?page=1&page_size=10&search=keyword
Authorization: Bearer <token>

Response:
{
  "videos": [
    {
      "id": 1,
      "media_path": "/static/video.mp4",
      "segment_count": 150,
      "has_summary": true,
      "created_at": "2025-01-01T00:00:00"
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 10
}
```

#### 获取视频详情
```http
GET /api/admin-panel/videos/{video_id}
Authorization: Bearer <token>

Response:
{
  "id": 1,
  "media_path": "/static/video.mp4",
  "created_at": "2025-01-01T00:00:00",
  "segments_json": "[...]",
  "summaries_json": "[...]"
}
```

#### 删除视频
```http
DELETE /api/admin-panel/videos/{video_id}
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "视频已删除"
}
```

### 系统统计接口

#### 获取系统统计
```http
GET /api/admin-panel/stats
Authorization: Bearer <token>

Response:
{
  "total_users": 10,
  "active_users": 8,
  "admin_users": 2,
  "total_videos": 50,
  "total_jobs": 100,
  "pending_jobs": 5,
  "failed_jobs": 2
}
```

## 数据库结构

### users 表
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100),
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT (now()),
    last_login TIMESTAMP
);
```

### system_settings 表
```sql
CREATE TABLE system_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) NOT NULL UNIQUE,
    value TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT (now())
);
```

## 安全注意事项

1. **修改默认密码**：首次部署后立即修改默认管理员密码
2. **Token 安全**：
   - Token 有效期为 24 小时
   - 使用 JWT 进行认证
   - 生产环境需修改 SECRET_KEY（在 `backend/routers/auth.py`）
3. **密码加密**：
   - 当前使用 SHA256 哈希
   - 生产环境建议升级为 bcrypt
4. **权限控制**：
   - 所有管理接口都需要管理员权限
   - 普通用户无法访问管理后台
5. **HTTPS**：生产环境务必启用 HTTPS

## 前端组件说明

### 新增组件

1. **AdminPanel.tsx** - 管理后台主页面
   - 位置：`frontend/src/components/AdminPanel.tsx`
   - 功能：用户管理、视频管理、系统统计

2. **LoginPage.tsx** - 登录页面
   - 位置：`frontend/src/components/LoginPage.tsx`
   - 功能：用户登录、Token 管理

### 修改的组件

1. **App.tsx** - 主应用组件
   - 添加了认证状态管理
   - 添加了权限控制逻辑
   - 添加了管理后台路由

2. **services/api.ts** - API 服务
   - 添加了用户认证相关 API
   - 添加了 Token 验证接口

## 后端文件说明

### 新增文件

1. **backend/routers/admin_panel.py** - 管理后台路由
   - 用户管理 CRUD 接口
   - 视频管理接口
   - 系统统计接口

### 修改的文件

1. **backend/db/pg_store.py** - 数据库操作
   - 添加了 users 表初始化
   - 添加了 system_settings 表
   - 创建默认管理员账号

2. **main.py** - 应用入口
   - 注册了 auth_router
   - 注册了 admin_panel_router

3. **backend/routers/auth.py** - 已存在，无需修改
   - 提供了完整的 JWT 认证功能

## 部署说明

### 1. 数据库初始化

系统启动时会自动初始化数据库表和默认管理员账号。

### 2. 环境变量

确保以下环境变量已正确配置：

```bash
# PostgreSQL 配置
POSTGRES_HOST=localhost
POSTGRES_PORT=5433
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_DB=hearsight
```

### 3. 启动服务

```bash
# 后端
uvicorn main:app --host 0.0.0.0 --port 8000

# 前端
cd frontend
npm install
npm run dev
```

### 4. 访问管理后台

打开浏览器访问：`http://localhost:5173`

点击右上角"管理后台"按钮，使用默认账号登录。

## 常见问题

### 1. 无法登录管理后台

- 检查用户是否具有管理员权限（`is_admin = true`）
- 检查账号是否已启用（`is_active = true`）
- 检查 Token 是否过期

### 2. API 返回 401 Unauthorized

- 检查 Authorization header 是否正确设置
- 检查 Token 格式：`Bearer <token>`
- 检查 Token 是否有效（未过期）

### 3. 删除用户失败

- 不能删除自己（当前登录的管理员）
- 检查用户是否存在

### 4. 视频删除后相关数据未清理

视频删除会自动级联删除相关的 summaries 数据，这是通过数据库外键约束实现的。

## 技术栈

- **后端**: FastAPI + PostgreSQL + psycopg2
- **前端**: React 19 + TypeScript + Ant Design 5
- **认证**: JWT (JSON Web Token)
- **密码加密**: SHA256（建议生产环境升级为 bcrypt）

## 后续优化建议

1. **安全性**：
   - 升级密码哈希算法为 bcrypt
   - 添加登录失败次数限制
   - 添加操作日志记录
   - 实现更细粒度的权限控制（RBAC）

2. **功能增强**：
   - 添加用户注册审核功能
   - 添加批量操作功能
   - 添加数据导出功能
   - 添加系统监控仪表盘

3. **性能优化**：
   - 添加 Redis 缓存
   - 实现 Token 刷新机制
   - 优化数据库查询

4. **用户体验**：
   - 添加操作确认提示
   - 优化错误提示信息
   - 添加操作历史记录
   - 实现更友好的搜索过滤

## 更新日志

### 2025-01-XX - v1.0.0

- ✅ 实现用户管理功能（CRUD）
- ✅ 实现视频管理功能
- ✅ 实现系统统计功能
- ✅ 实现 JWT 认证和权限控制
- ✅ 创建管理后台前端界面
- ✅ 集成到现有前端应用

## 联系方式

如有问题或建议，请通过以下方式联系：

- 项目 Issues: https://github.com/your-repo/issues
- 邮箱: admin@hearsight.com
