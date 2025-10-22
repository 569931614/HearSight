-- HearSight 数据库初始化脚本
-- 请使用 postgres 超级用户执行此脚本

-- 1. 创建数据库用户
CREATE USER hearsight_user WITH PASSWORD 'HearSight2025!Secure';

-- 2. 创建数据库
CREATE DATABASE hearsight OWNER hearsight_user;

-- 3. 授予权限
GRANT ALL PRIVILEGES ON DATABASE hearsight TO hearsight_user;

-- 4. 连接到新数据库并授予schema权限
\c hearsight

-- 授予 public schema 的权限
GRANT ALL ON SCHEMA public TO hearsight_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO hearsight_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO hearsight_user;

-- 确保未来创建的对象也有权限
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO hearsight_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO hearsight_user;

-- 完成
SELECT 'Database hearsight created successfully!' AS status;
