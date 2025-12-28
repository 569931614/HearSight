import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/index.js';
import {
  createToken,
  hashPassword,
  verifyPassword,
  requireAuth,
} from '../utils/auth.js';

// ==================== 请求验证 Schema ====================

const loginSchema = z.object({
  username: z.string().min(1, '用户名不能为空'),
  password: z.string().min(1, '密码不能为空'),
});

const registerSchema = z.object({
  username: z.string()
    .min(3, '用户名至少3个字符')
    .max(50, '用户名最多50个字符')
    .regex(/^[a-zA-Z0-9_]+$/, '用户名只能包含字母、数字和下划线'),
  password: z.string()
    .min(6, '密码至少6个字符')
    .max(100, '密码最多100个字符'),
  email: z.string().email('邮箱格式不正确').optional().nullable(),
});

const changePasswordSchema = z.object({
  old_password: z.string().min(1, '旧密码不能为空'),
  new_password: z.string()
    .min(6, '新密码至少6个字符')
    .max(100, '新密码最多100个字符'),
});

const updateProfileSchema = z.object({
  email: z.string().email('邮箱格式不正确').optional().nullable(),
});

// ==================== 路由定义 ====================

export async function authRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/auth/login - 用户登录
   */
  fastify.post('/api/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = loginSchema.parse(request.body);

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { username: body.username },
    });

    if (!user) {
      return reply.status(401).send({
        detail: '用户名或密码错误',
        code: 'INVALID_CREDENTIALS',
      });
    }

    // 检查账户状态
    if (!user.isActive) {
      return reply.status(401).send({
        detail: '账户已被禁用，请联系管理员',
        code: 'ACCOUNT_DISABLED',
      });
    }

    // 验证密码
    const passwordValid = await verifyPassword(body.password, user.passwordHash);
    if (!passwordValid) {
      return reply.status(401).send({
        detail: '用户名或密码错误',
        code: 'INVALID_CREDENTIALS',
      });
    }

    // 更新最后登录时间
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    // 生成 Token
    const token = createToken(user);

    return {
      access_token: token,
      token_type: 'bearer',
      expires_in: 7 * 24 * 60 * 60, // 7 天（秒）
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        is_admin: user.isAdmin,
        created_at: user.createdAt.toISOString(),
      },
    };
  });

  /**
   * POST /api/auth/register - 用户注册
   */
  fastify.post('/api/auth/register', async (request: FastifyRequest, reply: FastifyReply) => {
    // 检查是否允许注册
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'allow_registration' },
    });

    if (setting?.value !== 'true') {
      return reply.status(403).send({
        detail: '注册功能已关闭，请联系管理员',
        code: 'REGISTRATION_DISABLED',
      });
    }

    const body = registerSchema.parse(request.body);

    // 检查用户名是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { username: body.username },
    });

    if (existingUser) {
      return reply.status(400).send({
        detail: '用户名已存在',
        code: 'USERNAME_EXISTS',
      });
    }

    // 检查邮箱是否已被使用
    if (body.email) {
      const existingEmail = await prisma.user.findFirst({
        where: { email: body.email },
      });

      if (existingEmail) {
        return reply.status(400).send({
          detail: '邮箱已被使用',
          code: 'EMAIL_EXISTS',
        });
      }
    }

    // 创建用户
    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({
      data: {
        username: body.username,
        passwordHash,
        email: body.email || null,
        isAdmin: false,
        isActive: true,
      },
    });

    // 生成 Token
    const token = createToken(user);

    return {
      access_token: token,
      token_type: 'bearer',
      expires_in: 7 * 24 * 60 * 60,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        is_admin: user.isAdmin,
        created_at: user.createdAt.toISOString(),
      },
    };
  });

  /**
   * GET /api/auth/me - 获取当前用户信息
   */
  fastify.get('/api/auth/me', {
    preHandler: requireAuth,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = parseInt(request.user!.sub, 10);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        isAdmin: true,
        isActive: true,
        createdAt: true,
        lastLogin: true,
      },
    });

    if (!user) {
      return reply.status(404).send({
        detail: '用户不存在',
        code: 'USER_NOT_FOUND',
      });
    }

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      is_admin: user.isAdmin,
      is_active: user.isActive,
      created_at: user.createdAt.toISOString(),
      last_login: user.lastLogin?.toISOString() || null,
    };
  });

  /**
   * PUT /api/auth/me - 更新当前用户资料
   */
  fastify.put('/api/auth/me', {
    preHandler: requireAuth,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = parseInt(request.user!.sub, 10);
    const body = updateProfileSchema.parse(request.body);

    // 检查邮箱是否已被其他用户使用
    if (body.email) {
      const existingEmail = await prisma.user.findFirst({
        where: {
          email: body.email,
          id: { not: userId },
        },
      });

      if (existingEmail) {
        return reply.status(400).send({
          detail: '邮箱已被其他用户使用',
          code: 'EMAIL_EXISTS',
        });
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        email: body.email,
      },
      select: {
        id: true,
        username: true,
        email: true,
        isAdmin: true,
        isActive: true,
        createdAt: true,
        lastLogin: true,
      },
    });

    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        is_admin: user.isAdmin,
        is_active: user.isActive,
        created_at: user.createdAt.toISOString(),
        last_login: user.lastLogin?.toISOString() || null,
      },
    };
  });

  /**
   * POST /api/auth/change-password - 修改密码
   */
  fastify.post('/api/auth/change-password', {
    preHandler: requireAuth,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = parseInt(request.user!.sub, 10);
    const body = changePasswordSchema.parse(request.body);

    // 获取当前用户
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return reply.status(404).send({
        detail: '用户不存在',
        code: 'USER_NOT_FOUND',
      });
    }

    // 验证旧密码
    const oldPasswordValid = await verifyPassword(body.old_password, user.passwordHash);
    if (!oldPasswordValid) {
      return reply.status(400).send({
        detail: '旧密码错误',
        code: 'INVALID_OLD_PASSWORD',
      });
    }

    // 更新密码
    const newPasswordHash = await hashPassword(body.new_password);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    return {
      success: true,
      message: '密码修改成功',
    };
  });

  /**
   * POST /api/auth/refresh - 刷新 Token
   */
  fastify.post('/api/auth/refresh', {
    preHandler: requireAuth,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = parseInt(request.user!.sub, 10);

    // 获取最新用户信息
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return reply.status(404).send({
        detail: '用户不存在',
        code: 'USER_NOT_FOUND',
      });
    }

    if (!user.isActive) {
      return reply.status(401).send({
        detail: '账户已被禁用',
        code: 'ACCOUNT_DISABLED',
      });
    }

    // 生成新 Token
    const token = createToken(user);

    return {
      access_token: token,
      token_type: 'bearer',
      expires_in: 7 * 24 * 60 * 60,
    };
  });

  /**
   * POST /api/auth/logout - 登出（客户端清除 token 即可，这里只是占位）
   */
  fastify.post('/api/auth/logout', async () => {
    return {
      success: true,
      message: '登出成功',
    };
  });

  /**
   * GET /api/auth/check - 检查登录状态（供前端使用）
   */
  fastify.get('/api/auth/check', {
    preHandler: requireAuth,
  }, async (request: FastifyRequest) => {
    return {
      authenticated: true,
      user: {
        id: parseInt(request.user!.sub, 10),
        username: request.user!.username,
        is_admin: request.user!.is_admin,
      },
    };
  });

  /**
   * POST /api/auth/verify - 验证 Token（供前端使用）
   */
  fastify.post('/api/auth/verify', {
    preHandler: requireAuth,
  }, async (request: FastifyRequest) => {
    return {
      valid: true,
      user_id: request.user!.sub,
      username: request.user!.username,
    };
  });

  // ==================== 用户历史记录 API ====================

  /**
   * GET /api/auth/me/chat-history - 获取当前用户的对话历史
   */
  fastify.get('/api/auth/me/chat-history', {
    preHandler: requireAuth,
  }, async (request: FastifyRequest) => {
    const userId = parseInt(request.user!.sub, 10);
    const query = request.query as { limit?: string; offset?: string };
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50', 10)));
    const offset = Math.max(0, parseInt(query.offset || '0', 10));

    // 获取用户的所有对话会话（按会话分组）
    const sessions = await prisma.chatHistory.groupBy({
      by: ['sessionId'],
      where: { userId },
      _max: { createdAt: true },
      _count: { id: true },
      orderBy: { _max: { createdAt: 'desc' } },
      skip: offset,
      take: limit,
    });

    // 获取每个会话的第一条用户消息作为标题
    const sessionDetails = await Promise.all(
      sessions.map(async (s) => {
        const firstMessage = await prisma.chatHistory.findFirst({
          where: { sessionId: s.sessionId, role: 'user' },
          orderBy: { createdAt: 'asc' },
          select: { content: true },
        });
        return {
          session_id: s.sessionId,
          title: firstMessage?.content?.substring(0, 50) || '新对话',
          message_count: s._count.id,
          last_updated: s._max.createdAt?.toISOString(),
        };
      })
    );

    return {
      sessions: sessionDetails,
      total: sessions.length,
    };
  });

  /**
   * GET /api/auth/me/video-history - 获取当前用户的视频浏览历史
   */
  fastify.get('/api/auth/me/video-history', {
    preHandler: requireAuth,
  }, async (request: FastifyRequest) => {
    const userId = parseInt(request.user!.sub, 10);
    const query = request.query as { limit?: string; offset?: string };
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
    const offset = Math.max(0, parseInt(query.offset || '0', 10));

    // 获取用户的视频浏览记录（按视频分组，最近观看）
    const views = await prisma.videoView.groupBy({
      by: ['videoId'],
      where: { userId },
      _max: { viewedAt: true },
      _count: { id: true },
      orderBy: { _max: { viewedAt: 'desc' } },
      skip: offset,
      take: limit,
    });

    return {
      videos: views.map(v => ({
        video_id: v.videoId,
        view_count: v._count.id,
        last_viewed: v._max.viewedAt?.toISOString(),
      })),
      total: views.length,
    };
  });
}
