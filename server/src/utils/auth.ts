import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { config } from './config.js';

// JWT Payload 接口
export interface JwtPayload {
  sub: string;        // 用户 ID
  username: string;   // 用户名
  is_admin: boolean;  // 是否管理员
  iat: number;        // 签发时间
  exp: number;        // 过期时间
}

// 扩展 FastifyRequest 类型
declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

/**
 * 创建 JWT Token
 */
export function createToken(user: {
  id: number;
  username: string;
  isAdmin: boolean;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    sub: String(user.id),
    username: user.username,
    is_admin: user.isAdmin,
    iat: now,
    exp: now + 7 * 24 * 60 * 60, // 7 天有效期
  };
  return jwt.sign(payload, config.jwtSecret);
}

/**
 * 验证 JWT Token
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    return payload;
  } catch (error) {
    return null;
  }
}

/**
 * 从请求头提取 Token
 */
export function extractToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;
  if (!authHeader) return null;

  // 支持 "Bearer <token>" 格式
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return authHeader;
}

/**
 * 密码哈希
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * 验证密码
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * 认证中间件 - 要求登录
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = extractToken(request);

  if (!token) {
    return reply.status(401).send({
      detail: '未提供认证令牌',
      code: 'MISSING_TOKEN',
    });
  }

  const payload = verifyToken(token);

  if (!payload) {
    return reply.status(401).send({
      detail: '无效或过期的认证令牌',
      code: 'INVALID_TOKEN',
    });
  }

  // 检查 token 是否过期
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    return reply.status(401).send({
      detail: '认证令牌已过期，请重新登录',
      code: 'TOKEN_EXPIRED',
    });
  }

  // 将用户信息附加到请求
  request.user = payload;
}

/**
 * 认证中间件 - 要求管理员权限
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // 先验证登录
  await requireAuth(request, reply);

  // 如果已经发送响应（认证失败），直接返回
  if (reply.sent) return;

  // 检查管理员权限
  if (!request.user?.is_admin) {
    return reply.status(403).send({
      detail: '需要管理员权限',
      code: 'ADMIN_REQUIRED',
    });
  }
}

/**
 * 可选认证中间件 - 不强制要求登录，但如果有 token 会解析
 */
export async function optionalAuth(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const token = extractToken(request);

  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      request.user = payload;
    }
  }
}
