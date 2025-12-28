import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/index.js';
import { requireAdmin, hashPassword } from '../utils/auth.js';
import { getOssService } from '../services/oss.js';

// ==================== 自然排序工具函数 ====================

/**
 * 自然排序比较函数 - 支持数字按值大小排序
 */
function naturalSort(a: string, b: string): number {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;

  const regex = /(\d+)|(\D+)/g;
  const chunksA = a.toLowerCase().match(regex) || [];
  const chunksB = b.toLowerCase().match(regex) || [];

  const maxLength = Math.max(chunksA.length, chunksB.length);

  for (let i = 0; i < maxLength; i++) {
    const chunkA = chunksA[i];
    const chunkB = chunksB[i];

    if (chunkA === undefined) return -1;
    if (chunkB === undefined) return 1;

    const numA = parseInt(chunkA, 10);
    const numB = parseInt(chunkB, 10);

    const isNumA = !isNaN(numA);
    const isNumB = !isNaN(numB);

    if (isNumA && isNumB) {
      if (numA !== numB) return numA - numB;
    } else if (isNumA) {
      return -1;
    } else if (isNumB) {
      return 1;
    } else {
      const cmp = chunkA.localeCompare(chunkB, 'zh-CN');
      if (cmp !== 0) return cmp;
    }
  }

  return 0;
}

/**
 * 对视频列表进行自然排序
 */
function sortVideosNaturally<T extends { video_title?: string; topic?: string }>(videos: T[]): T[] {
  return [...videos].sort((a, b) => {
    const titleA = a.video_title || a.topic || '';
    const titleB = b.video_title || b.topic || '';
    return naturalSort(titleA, titleB);
  });
}

// ==================== 请求验证 Schema ====================

const userCreateSchema = z.object({
  username: z.string()
    .min(3, '用户名至少3个字符')
    .max(50, '用户名最多50个字符'),
  password: z.string().min(6, '密码至少6个字符'),
  email: z.string().email().optional().nullable(),
  is_admin: z.boolean().default(false),
});

const userImportSchema = z.object({
  usernames: z.array(z.string().min(3, '用户名至少3个字符').max(50, '用户名最多50个字符')),
  default_password: z.string().min(6, '密码至少6个字符').default('123456'),
});

const userUpdateSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  email: z.string().email().optional().nullable(),
  is_admin: z.boolean().optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

const configUpdateSchema = z.object({
  config_key: z.string(),
  config_value: z.string(),
});

const settingUpdateSchema = z.object({
  key: z.string(),
  value: z.string(),
});

// ==================== 路由定义 ====================

export async function adminRoutes(fastify: FastifyInstance) {
  const ossService = getOssService();

  // ==================== 系统统计 ====================

  /**
   * GET /api/admin-panel/stats - 获取系统统计数据
   */
  fastify.get('/api/admin-panel/stats', {
    preHandler: requireAdmin,
  }, async () => {
    // 获取 Qdrant 视频数量
    let totalQdrantVideos = 0;
    try {
      const { getQdrantClient } = await import('../services/qdrant.js');
      const qdrantClient = getQdrantClient();
      if (await qdrantClient.checkConnection()) {
        const videos = await qdrantClient.listAllVideos();
        totalQdrantVideos = videos.length;
      }
    } catch (error) {
      console.warn('Failed to get Qdrant video count:', error);
    }

    const [
      totalUsers,
      activeUsers,
      adminUsers,
      totalVideos,
      totalJobs,
      pendingJobs,
      runningJobs,
      successJobs,
      failedJobs,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isAdmin: true } }),
      prisma.transcript.count(),
      prisma.job.count(),
      prisma.job.count({ where: { status: 'pending' } }),
      prisma.job.count({ where: { status: 'running' } }),
      prisma.job.count({ where: { status: 'success' } }),
      prisma.job.count({ where: { status: 'failed' } }),
    ]);

    return {
      total_users: totalUsers,
      active_users: activeUsers,
      admin_users: adminUsers,
      total_videos: totalVideos,
      total_qdrant_videos: totalQdrantVideos,
      total_jobs: totalJobs,
      pending_jobs: pendingJobs,
      running_jobs: runningJobs,
      success_jobs: successJobs,
      failed_jobs: failedJobs,
    };
  });

  // ==================== 用户管理 ====================

  /**
   * GET /api/admin-panel/users - 获取用户列表
   */
  fastify.get('/api/admin-panel/users', {
    preHandler: requireAdmin,
  }, async (request: FastifyRequest) => {
    const query = request.query as {
      page?: string;
      page_size?: string;
      search?: string;
      is_admin?: string;
      is_active?: string;
    };

    const page = Math.max(1, parseInt(query.page || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.page_size || '10', 10)));
    const search = query.search;
    const isAdmin = query.is_admin === 'true' ? true : query.is_admin === 'false' ? false : undefined;
    const isActive = query.is_active === 'true' ? true : query.is_active === 'false' ? false : undefined;

    const where: any = {};

    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (isAdmin !== undefined) where.isAdmin = isAdmin;
    if (isActive !== undefined) where.isActive = isActive;

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          username: true,
          email: true,
          isAdmin: true,
          isActive: true,
          createdAt: true,
          lastLogin: true,
        },
      }),
    ]);

    return {
      users: users.map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        is_admin: u.isAdmin,
        is_active: u.isActive,
        created_at: u.createdAt.toISOString(),
        last_login: u.lastLogin?.toISOString() || null,
      })),
      total,
      page,
      page_size: pageSize,
      total_pages: Math.ceil(total / pageSize),
    };
  });

  /**
   * POST /api/admin-panel/users - 创建用户
   */
  fastify.post('/api/admin-panel/users', {
    preHandler: requireAdmin,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = userCreateSchema.parse(request.body);

    // 检查用户名是否已存在
    const existing = await prisma.user.findUnique({
      where: { username: body.username },
    });

    if (existing) {
      return reply.status(400).send({
        detail: '用户名已存在',
        code: 'USERNAME_EXISTS',
      });
    }

    // 检查邮箱
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

    const passwordHash = await hashPassword(body.password);

    const user = await prisma.user.create({
      data: {
        username: body.username,
        passwordHash,
        email: body.email || null,
        isAdmin: body.is_admin,
        isActive: true,
      },
      select: {
        id: true,
        username: true,
        email: true,
        isAdmin: true,
        isActive: true,
        createdAt: true,
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
      },
    };
  });

  /**
   * POST /api/admin-panel/users/import - 批量导入用户
   */
  fastify.post('/api/admin-panel/users/import', {
    preHandler: requireAdmin,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = userImportSchema.parse(request.body);
    const { usernames, default_password } = body;

    const results = {
      total: usernames.length,
      created: 0,
      skipped: 0,
      errors: [] as string[],
    };

    // 预先哈希默认密码
    const passwordHash = await hashPassword(default_password);

    // 获取已存在的用户名
    const existingUsers = await prisma.user.findMany({
      where: { username: { in: usernames } },
      select: { username: true },
    });
    const existingUsernames = new Set(existingUsers.map(u => u.username));

    // 过滤出需要创建的用户名
    const newUsernames = usernames.filter(username => {
      if (existingUsernames.has(username)) {
        results.skipped++;
        return false;
      }
      return true;
    });

    // 批量创建用户
    if (newUsernames.length > 0) {
      try {
        const createData = newUsernames.map(username => ({
          username,
          passwordHash,
          email: null,
          isAdmin: false,
          isActive: true,
        }));

        await prisma.user.createMany({
          data: createData,
          skipDuplicates: true,
        });

        results.created = newUsernames.length;
      } catch (error: any) {
        results.errors.push(`批量创建失败: ${error.message}`);
      }
    }

    return {
      success: true,
      message: `导入完成: 创建 ${results.created} 个用户, 跳过 ${results.skipped} 个已存在用户`,
      results,
    };
  });

  /**
   * GET /api/admin-panel/users/:id - 获取用户详情
   */
  fastify.get('/api/admin-panel/users/:id', {
    preHandler: requireAdmin,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);

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
   * PUT /api/admin-panel/users/:id - 更新用户
   */
  fastify.put('/api/admin-panel/users/:id', {
    preHandler: requireAdmin,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);
    const body = userUpdateSchema.parse(request.body);

    // 检查用户是否存在
    const existing = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existing) {
      return reply.status(404).send({
        detail: '用户不存在',
        code: 'USER_NOT_FOUND',
      });
    }

    // 检查用户名唯一性
    if (body.username && body.username !== existing.username) {
      const conflict = await prisma.user.findUnique({
        where: { username: body.username },
      });
      if (conflict) {
        return reply.status(400).send({
          detail: '用户名已存在',
          code: 'USERNAME_EXISTS',
        });
      }
    }

    // 检查邮箱唯一性
    if (body.email && body.email !== existing.email) {
      const conflict = await prisma.user.findFirst({
        where: { email: body.email, id: { not: userId } },
      });
      if (conflict) {
        return reply.status(400).send({
          detail: '邮箱已被使用',
          code: 'EMAIL_EXISTS',
        });
      }
    }

    const updateData: any = {};
    if (body.username !== undefined) updateData.username = body.username;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.is_admin !== undefined) updateData.isAdmin = body.is_admin;
    if (body.is_active !== undefined) updateData.isActive = body.is_active;
    if (body.password) updateData.passwordHash = await hashPassword(body.password);

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
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
   * DELETE /api/admin-panel/users/:id - 删除用户
   */
  fastify.delete('/api/admin-panel/users/:id', {
    preHandler: requireAdmin,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);
    const currentUserId = parseInt(request.user!.sub, 10);

    // 防止删除自己
    if (userId === currentUserId) {
      return reply.status(400).send({
        detail: '不能删除自己',
        code: 'CANNOT_DELETE_SELF',
      });
    }

    const result = await prisma.user.delete({
      where: { id: userId },
    }).catch(() => null);

    if (!result) {
      return reply.status(404).send({
        detail: '用户不存在',
        code: 'USER_NOT_FOUND',
      });
    }

    return {
      success: true,
      message: '用户已删除',
    };
  });

  // ==================== 视频管理 ====================

  /**
   * GET /api/admin-panel/videos - 获取视频列表 (从 Qdrant)
   */
  fastify.get('/api/admin-panel/videos', {
    preHandler: requireAdmin,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      page?: string;
      page_size?: string;
      search?: string;
    };

    const page = Math.max(1, parseInt(query.page || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.page_size || '10', 10)));
    const search = query.search?.toLowerCase();

    try {
      const { getQdrantClient } = await import('../services/qdrant.js');
      const qdrantClient = getQdrantClient();

      if (!await qdrantClient.checkConnection()) {
        return reply.status(503).send({ detail: 'Qdrant 连接不可用' });
      }

      // 获取所有视频（含统计信息）
      let allVideos = await qdrantClient.getVideosWithStats();

      // 自然排序（与用户端保持一致）
      allVideos = sortVideosNaturally(allVideos);

      // 搜索过滤
      if (search) {
        allVideos = allVideos.filter(v =>
          (v.video_title?.toLowerCase().includes(search)) ||
          (v.video_path?.toLowerCase().includes(search)) ||
          (v.video_id?.toLowerCase().includes(search))
        );
      }

      const total = allVideos.length;

      // 分页
      const startIndex = (page - 1) * pageSize;
      const paginatedVideos = allVideos.slice(startIndex, startIndex + pageSize);

      // 获取点击次数
      const videoIds = paginatedVideos.map(v => v.video_id);
      const viewCounts = await prisma.videoViewCount.findMany({
        where: { videoId: { in: videoIds } },
      });
      const viewCountMap = new Map(viewCounts.map(vc => [vc.videoId, vc.viewCount]));

      return {
        videos: paginatedVideos.map((v, idx) => ({
          id: startIndex + idx + 1,
          video_id: v.video_id,
          video_title: v.video_title || v.topic || '未命名视频',
          video_path: v.video_path,
          folder: v.folder || '未分类',
          folder_id: v.folder_id,
          total_segments: v.total_segments || 0,
          total_duration: v.total_duration || 0,
          language: v.language || '',
          source_type: v.source_type || '',
          has_summary: !!v.video_summary,
          thumbnail_url: v.thumbnail_url,
          view_count: viewCountMap.get(v.video_id) || 0,
        })),
        total,
        page,
        page_size: pageSize,
        total_pages: Math.ceil(total / pageSize),
      };
    } catch (error: any) {
      console.error('Failed to fetch videos from Qdrant:', error);
      return reply.status(500).send({
        detail: `获取视频列表失败: ${error.message}`,
        code: 'FETCH_VIDEOS_FAILED',
      });
    }
  });

  /**
   * GET /api/admin-panel/videos/:id - 获取视频详情
   */
  fastify.get('/api/admin-panel/videos/:id', {
    preHandler: requireAdmin,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const videoId = parseInt(id, 10);

    const video = await prisma.transcript.findUnique({
      where: { id: videoId },
      include: {
        summaries: {
          take: 1,
          orderBy: { id: 'desc' },
        },
      },
    });

    if (!video) {
      return reply.status(404).send({
        detail: '视频不存在',
        code: 'VIDEO_NOT_FOUND',
      });
    }

    let segments: any[] = [];
    let summaries: any[] = [];

    try {
      segments = JSON.parse(video.segmentsJson);
    } catch {}

    if (video.summaries.length > 0) {
      try {
        summaries = JSON.parse(video.summaries[0].summariesJson);
      } catch {}
    }

    return {
      id: video.id,
      media_path: video.mediaPath,
      created_at: video.createdAt.toISOString(),
      segments,
      summaries,
      segment_count: segments.length,
      summary_count: summaries.length,
    };
  });

  /**
   * DELETE /api/admin-panel/videos/:id - 删除视频
   */
  fastify.delete('/api/admin-panel/videos/:id', {
    preHandler: requireAdmin,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const videoId = parseInt(id, 10);

    const video = await prisma.transcript.findUnique({
      where: { id: videoId },
    });

    if (!video) {
      return reply.status(404).send({
        detail: '视频不存在',
        code: 'VIDEO_NOT_FOUND',
      });
    }

    const deletedFiles: string[] = [];
    const errors: string[] = [];

    // 删除 OSS 文件
    if (video.mediaPath && ossService.isOssUrl(video.mediaPath)) {
      try {
        const deleted = await ossService.deleteByUrl(video.mediaPath);
        if (deleted) {
          deletedFiles.push(`OSS: ${video.mediaPath}`);
        }
      } catch (error: any) {
        errors.push(`删除 OSS 文件失败: ${error.message}`);
      }
    }

    // 删除数据库记录（包括关联的摘要）
    await prisma.transcript.delete({
      where: { id: videoId },
    });

    return {
      success: true,
      message: '视频已删除',
      deleted_files: deletedFiles.length > 0 ? deletedFiles : undefined,
      errors: errors.length > 0 ? errors : undefined,
    };
  });

  /**
   * DELETE /api/admin-panel/qdrant-videos/:video_id - 从 Qdrant 删除视频
   */
  fastify.delete('/api/admin-panel/qdrant-videos/:video_id', {
    preHandler: requireAdmin,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { video_id } = request.params as { video_id: string };

    try {
      const { getQdrantClient } = await import('../services/qdrant.js');
      const qdrantClient = getQdrantClient();

      if (!await qdrantClient.checkConnection()) {
        return reply.status(503).send({ detail: 'Qdrant 连接不可用' });
      }

      // 删除 Qdrant 中的数据
      const result = await qdrantClient.deleteVideo(video_id);

      // 同时删除 PostgreSQL 中的相关数据
      const deletedItems: string[] = [];

      // 删除思维导图
      const mindmapDeleted = await prisma.videoMindmap.delete({
        where: { videoId: video_id },
      }).catch(() => null);
      if (mindmapDeleted) {
        deletedItems.push('思维导图');
      }

      // 删除点击统计
      const viewCountDeleted = await prisma.videoViewCount.delete({
        where: { videoId: video_id },
      }).catch(() => null);
      if (viewCountDeleted) {
        deletedItems.push('点击统计');
      }

      // 删除点击详情
      await prisma.videoView.deleteMany({
        where: { videoId: video_id },
      }).catch(() => null);

      return {
        success: true,
        message: `视频已从 Qdrant 删除`,
        deleted_chunks: result.deleted_chunks,
        deleted_metadata: result.deleted_metadata,
        deleted_pg_items: deletedItems.length > 0 ? deletedItems : undefined,
      };
    } catch (error: any) {
      console.error('Failed to delete video from Qdrant:', error);
      return reply.status(500).send({
        detail: `删除视频失败: ${error.message}`,
        code: 'DELETE_VIDEO_FAILED',
      });
    }
  });

  /**
   * PUT /api/admin-panel/qdrant-videos/:video_id/folder - 移动视频到文件夹
   */
  fastify.put('/api/admin-panel/qdrant-videos/:video_id/folder', {
    preHandler: requireAdmin,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { video_id } = request.params as { video_id: string };
    const body = request.body as { folder_id: string | null };

    try {
      const { getQdrantClient } = await import('../services/qdrant.js');
      const qdrantClient = getQdrantClient();

      if (!await qdrantClient.checkConnection()) {
        return reply.status(503).send({ detail: 'Qdrant 连接不可用' });
      }

      const success = await qdrantClient.assignVideoToFolder(video_id, body.folder_id);

      if (!success) {
        return reply.status(404).send({
          detail: '移动视频失败（视频或文件夹不存在）',
          code: 'MOVE_VIDEO_FAILED',
        });
      }

      return {
        success: true,
        message: body.folder_id ? '视频已移动到指定文件夹' : '视频已移动到未分类',
      };
    } catch (error: any) {
      console.error('Failed to move video:', error);
      return reply.status(500).send({
        detail: `移动视频失败: ${error.message}`,
        code: 'MOVE_VIDEO_FAILED',
      });
    }
  });

  // ==================== 任务管理 ====================

  /**
   * GET /api/admin-panel/jobs - 获取任务列表
   */
  fastify.get('/api/admin-panel/jobs', {
    preHandler: requireAdmin,
  }, async (request: FastifyRequest) => {
    const query = request.query as {
      page?: string;
      page_size?: string;
      status?: string;
    };

    const page = Math.max(1, parseInt(query.page || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.page_size || '10', 10)));
    const status = query.status;

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const [total, jobs] = await Promise.all([
      prisma.job.count({ where }),
      prisma.job.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      jobs: jobs.map(j => {
        let result = null;
        try {
          result = j.resultJson ? JSON.parse(j.resultJson) : null;
        } catch {}

        return {
          id: j.id,
          url: j.url,
          status: j.status,
          created_at: j.createdAt.toISOString(),
          started_at: j.startedAt?.toISOString() || null,
          finished_at: j.finishedAt?.toISOString() || null,
          result,
          error: j.error,
        };
      }),
      total,
      page,
      page_size: pageSize,
      total_pages: Math.ceil(total / pageSize),
    };
  });

  /**
   * GET /api/admin-panel/jobs/:id - 获取任务详情
   */
  fastify.get('/api/admin-panel/jobs/:id', {
    preHandler: requireAdmin,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const jobId = parseInt(id, 10);

    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return reply.status(404).send({
        detail: '任务不存在',
        code: 'JOB_NOT_FOUND',
      });
    }

    let result = null;
    try {
      result = job.resultJson ? JSON.parse(job.resultJson) : null;
    } catch {}

    return {
      id: job.id,
      url: job.url,
      status: job.status,
      created_at: job.createdAt.toISOString(),
      started_at: job.startedAt?.toISOString() || null,
      finished_at: job.finishedAt?.toISOString() || null,
      result,
      error: job.error,
    };
  });

  /**
   * DELETE /api/admin-panel/jobs/:id - 删除任务
   */
  fastify.delete('/api/admin-panel/jobs/:id', {
    preHandler: requireAdmin,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const jobId = parseInt(id, 10);

    const result = await prisma.job.delete({
      where: { id: jobId },
    }).catch(() => null);

    if (!result) {
      return reply.status(404).send({
        detail: '任务不存在',
        code: 'JOB_NOT_FOUND',
      });
    }

    return {
      success: true,
      message: '任务已删除',
    };
  });

  /**
   * POST /api/admin-panel/jobs/:id/retry - 重试任务
   */
  fastify.post('/api/admin-panel/jobs/:id/retry', {
    preHandler: requireAdmin,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const jobId = parseInt(id, 10);

    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return reply.status(404).send({
        detail: '任务不存在',
        code: 'JOB_NOT_FOUND',
      });
    }

    // 只能重试失败的任务
    if (job.status !== 'failed') {
      return reply.status(400).send({
        detail: '只能重试失败的任务',
        code: 'INVALID_JOB_STATUS',
      });
    }

    // 重置任务状态
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'pending',
        startedAt: null,
        finishedAt: null,
        error: null,
      },
    });

    return {
      success: true,
      message: '任务已重置为待处理状态',
    };
  });

  // ==================== 系统配置 ====================

  /**
   * GET /api/admin/config - 获取所有配置
   */
  fastify.get('/api/admin/config', async () => {
    const configs = await prisma.systemConfig.findMany();

    const result: Record<string, string> = {};
    for (const c of configs) {
      // 不返回敏感配置
      if (c.configKey === 'admin_password') continue;
      result[c.configKey] = c.configValue;
    }

    return result;
  });

  /**
   * PUT /api/admin/config - 更新配置
   */
  fastify.put('/api/admin/config', {
    preHandler: requireAdmin,
  }, async (request: FastifyRequest) => {
    const body = configUpdateSchema.parse(request.body);

    await prisma.systemConfig.upsert({
      where: { configKey: body.config_key },
      update: { configValue: body.config_value },
      create: { configKey: body.config_key, configValue: body.config_value },
    });

    return {
      success: true,
      message: '配置已更新',
    };
  });

  /**
   * GET /api/admin/config/:key - 获取单个配置
   */
  fastify.get('/api/admin/config/:key', async (request: FastifyRequest, reply: FastifyReply) => {
    const { key } = request.params as { key: string };

    const config = await prisma.systemConfig.findUnique({
      where: { configKey: key },
    });

    if (!config) {
      return reply.status(404).send({
        detail: '配置不存在',
        code: 'CONFIG_NOT_FOUND',
      });
    }

    return {
      key: config.configKey,
      value: config.configValue,
      updated_at: config.updatedAt.toISOString(),
    };
  });

  // ==================== 系统设置 ====================

  /**
   * GET /api/admin/settings - 获取所有设置
   */
  fastify.get('/api/admin/settings', async () => {
    const settings = await prisma.systemSetting.findMany();

    const result: Record<string, string> = {};
    for (const s of settings) {
      result[s.key] = s.value;
    }

    return result;
  });

  /**
   * PUT /api/admin/settings - 更新设置
   */
  fastify.put('/api/admin/settings', {
    preHandler: requireAdmin,
  }, async (request: FastifyRequest) => {
    const body = settingUpdateSchema.parse(request.body);

    await prisma.systemSetting.upsert({
      where: { key: body.key },
      update: { value: body.value },
      create: { key: body.key, value: body.value },
    });

    return {
      success: true,
      message: '设置已更新',
    };
  });

  /**
   * GET /api/admin/settings/:key - 获取单个设置
   */
  fastify.get('/api/admin/settings/:key', async (request: FastifyRequest, reply: FastifyReply) => {
    const { key } = request.params as { key: string };

    const setting = await prisma.systemSetting.findUnique({
      where: { key },
    });

    if (!setting) {
      return reply.status(404).send({
        detail: '设置不存在',
        code: 'SETTING_NOT_FOUND',
      });
    }

    return {
      key: setting.key,
      value: setting.value,
      updated_at: setting.updatedAt.toISOString(),
    };
  });

  // ==================== 兼容前端的 API ====================

  /**
   * POST /api/admin/login - 管理员简化登录（兼容旧前端）
   * 使用密码直接登录，返回 admin 用户的 token
   */
  fastify.post('/api/admin/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { password?: string };

    if (!body.password) {
      return reply.status(400).send({
        detail: '密码不能为空',
        code: 'PASSWORD_REQUIRED',
      });
    }

    // 获取配置的管理员密码
    const adminPasswordConfig = await prisma.systemConfig.findUnique({
      where: { configKey: 'admin_password' },
    });

    const configuredPassword = adminPasswordConfig?.configValue || 'admin123';

    if (body.password !== configuredPassword) {
      return reply.status(401).send({
        detail: '密码错误',
        code: 'INVALID_PASSWORD',
      });
    }

    // 获取或创建 admin 用户
    let adminUser = await prisma.user.findUnique({
      where: { username: 'admin' },
    });

    if (!adminUser) {
      const { hashPassword } = await import('../utils/auth.js');
      const passwordHash = await hashPassword('admin123');
      adminUser = await prisma.user.create({
        data: {
          username: 'admin',
          passwordHash,
          email: 'admin@hearsight.com',
          isAdmin: true,
          isActive: true,
        },
      });
    }

    const { createToken } = await import('../utils/auth.js');
    const token = createToken(adminUser);

    return {
      success: true,
      token,
    };
  });

  /**
   * GET /api/admin/configs - 获取所有配置（返回 configs 对象）
   */
  fastify.get('/api/admin/configs', {
    preHandler: requireAdmin,
  }, async () => {
    const configs = await prisma.systemConfig.findMany();

    const result: Record<string, string> = {};
    for (const c of configs) {
      if (c.configKey === 'admin_password') continue;
      result[c.configKey] = c.configValue;
    }

    return { configs: result };
  });

  /**
   * POST /api/admin/configs - 更新配置（兼容旧前端）
   */
  fastify.post('/api/admin/configs', {
    preHandler: requireAdmin,
  }, async (request: FastifyRequest) => {
    const body = request.body as { config_key?: string; config_value?: string };

    if (!body.config_key || body.config_value === undefined) {
      return { success: false, message: '缺少配置键或值' };
    }

    await prisma.systemConfig.upsert({
      where: { configKey: body.config_key },
      update: { configValue: body.config_value },
      create: { configKey: body.config_key, configValue: body.config_value },
    });

    return {
      success: true,
      message: '配置已更新',
    };
  });

  // ==================== 思维导图批量管理 (存储在 PostgreSQL) ====================

  /**
   * POST /api/admin-panel/mindmaps/generate-all - 批量生成所有视频的思维导图
   */
  fastify.post('/api/admin-panel/mindmaps/generate-all', {
    preHandler: requireAdmin,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { overwrite?: boolean };
    const overwrite = body.overwrite === true;

    try {
      const { getQdrantClient } = await import('../services/qdrant.js');
      const { getLlmService } = await import('../services/llm.js');

      const qdrantClient = getQdrantClient();
      const llmService = getLlmService();

      if (!await qdrantClient.checkConnection()) {
        return reply.status(503).send({ detail: 'Qdrant 连接不可用' });
      }

      // 获取所有视频
      const videos = await qdrantClient.listAllVideos();

      const results = {
        total: videos.length,
        generated: 0,
        skipped: 0,
        failed: 0,
        errors: [] as string[],
      };

      // 获取思维导图提示词
      let mindmapPrompt: string;
      try {
        const promptConfig = await prisma.systemConfig.findUnique({
          where: { configKey: 'mindmap_prompt' },
        });
        mindmapPrompt = promptConfig?.configValue || getDefaultMindmapPromptForAdmin();
      } catch {
        mindmapPrompt = getDefaultMindmapPromptForAdmin();
      }

      for (const video of videos) {
        try {
          // 检查是否已有思维导图 (从 PostgreSQL 查询)
          if (!overwrite) {
            const existingMindmap = await prisma.videoMindmap.findUnique({
              where: { videoId: video.video_id },
            });
            if (existingMindmap) {
              results.skipped++;
              continue;
            }
          }

          // 获取视频内容
          const videoData = await qdrantClient.getVideoParagraphsByVideoId(video.video_id);
          if (!videoData) {
            results.failed++;
            results.errors.push(`Video not found: ${video.video_id}`);
            continue;
          }

          // 构建视频内容
          const segments = videoData.segments || [];
          let videoContent = `视频标题: ${video.video_title || video.video_id}\n\n视频内容:\n`;

          for (let i = 0; i < Math.min(segments.length, 50); i++) {
            const seg = segments[i];
            if (seg.sentence) {
              videoContent += `${i + 1}. ${seg.sentence}\n`;
            }
          }

          if (videoContent.length > 4000) {
            videoContent = videoContent.substring(0, 4000) + '\n...(内容过长，已截断)';
          }

          // 调用 LLM 生成思维导图
          const mindmapMarkdown = await llmService.simpleChat([
            { role: 'system', content: '你是一个专业的思维导图生成助手，擅长从视频内容中提取关键信息并组织成清晰的思维导图结构。' },
            { role: 'user', content: `${mindmapPrompt}\n\n${videoContent}` },
          ]);

          // 保存到 PostgreSQL
          await prisma.videoMindmap.upsert({
            where: { videoId: video.video_id },
            update: {
              mindmapMarkdown,
              videoTitle: video.video_title,
              version: '1.0',
            },
            create: {
              videoId: video.video_id,
              videoTitle: video.video_title,
              mindmapMarkdown,
              version: '1.0',
            },
          });
          results.generated++;

        } catch (error: any) {
          results.failed++;
          results.errors.push(`${video.video_id}: ${error.message}`);
        }
      }

      return {
        success: true,
        message: `批量生成完成: 生成 ${results.generated}, 跳过 ${results.skipped}, 失败 ${results.failed}`,
        results,
      };
    } catch (error: any) {
      return reply.status(500).send({
        detail: `批量生成失败: ${error.message}`,
        code: 'BATCH_GENERATE_FAILED',
      });
    }
  });

  /**
   * GET /api/admin-panel/mindmaps/status - 获取思维导图生成状态
   */
  fastify.get('/api/admin-panel/mindmaps/status', {
    preHandler: requireAdmin,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { getQdrantClient } = await import('../services/qdrant.js');
      const qdrantClient = getQdrantClient();

      if (!await qdrantClient.checkConnection()) {
        return reply.status(503).send({ detail: 'Qdrant 连接不可用' });
      }

      // 从 Qdrant 获取所有视频
      const videos = await qdrantClient.listAllVideos();

      // 从 PostgreSQL 统计已有思维导图数量
      const mindmapCount = await prisma.videoMindmap.count();

      // 获取有思维导图的视频 ID 列表
      const mindmaps = await prisma.videoMindmap.findMany({
        select: { videoId: true },
      });
      const mindmapVideoIds = new Set(mindmaps.map(m => m.videoId));

      // 统计
      let withMindmap = 0;
      let withoutMindmap = 0;

      for (const video of videos) {
        if (mindmapVideoIds.has(video.video_id)) {
          withMindmap++;
        } else {
          withoutMindmap++;
        }
      }

      return {
        total_videos: videos.length,
        with_mindmap: withMindmap,
        without_mindmap: withoutMindmap,
        coverage_percent: videos.length > 0 ? Math.round((withMindmap / videos.length) * 100) : 0,
      };
    } catch (error: any) {
      return reply.status(500).send({
        detail: `获取状态失败: ${error.message}`,
        code: 'GET_STATUS_FAILED',
      });
    }
  });

  /**
   * GET /api/admin-panel/mindmaps - 获取所有思维导图列表
   */
  fastify.get('/api/admin-panel/mindmaps', {
    preHandler: requireAdmin,
  }, async (request: FastifyRequest) => {
    const query = request.query as { page?: string; page_size?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.page_size || '20', 10)));

    const [total, mindmaps] = await Promise.all([
      prisma.videoMindmap.count(),
      prisma.videoMindmap.findMany({
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      mindmaps: mindmaps.map(m => ({
        id: m.id,
        video_id: m.videoId,
        video_title: m.videoTitle,
        version: m.version,
        content_length: m.mindmapMarkdown.length,
        created_at: m.createdAt.toISOString(),
        updated_at: m.updatedAt.toISOString(),
      })),
      total,
      page,
      page_size: pageSize,
      total_pages: Math.ceil(total / pageSize),
    };
  });

  /**
   * DELETE /api/admin-panel/mindmaps/:video_id - 删除指定视频的思维导图
   */
  fastify.delete('/api/admin-panel/mindmaps/:video_id', {
    preHandler: requireAdmin,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { video_id } = request.params as { video_id: string };

    const result = await prisma.videoMindmap.delete({
      where: { videoId: video_id },
    }).catch(() => null);

    if (!result) {
      return reply.status(404).send({
        detail: '思维导图不存在',
        code: 'MINDMAP_NOT_FOUND',
      });
    }

    return {
      success: true,
      message: '思维导图已删除',
    };
  });

  // ==================== Admin Panel 配置 API ====================

  /**
   * GET /api/admin-panel/configs - 获取所有系统配置
   */
  fastify.get('/api/admin-panel/configs', {
    preHandler: requireAdmin,
  }, async () => {
    const configs = await prisma.systemConfig.findMany();

    const result: Record<string, string> = {};
    for (const c of configs) {
      // 不返回敏感配置
      if (c.configKey === 'admin_password') continue;
      result[c.configKey] = c.configValue;
    }

    return { configs: result };
  });

  /**
   * POST /api/admin-panel/configs - 更新系统配置
   */
  fastify.post('/api/admin-panel/configs', {
    preHandler: requireAdmin,
  }, async (request: FastifyRequest) => {
    const body = request.body as { config_key?: string; config_value?: string };

    if (!body.config_key || body.config_value === undefined) {
      return { success: false, message: '缺少配置键或值' };
    }

    await prisma.systemConfig.upsert({
      where: { configKey: body.config_key },
      update: { configValue: body.config_value },
      create: { configKey: body.config_key, configValue: body.config_value },
    });

    return {
      success: true,
      message: '配置已更新',
    };
  });

  /**
   * GET /api/admin-panel/settings - 获取所有系统设置
   */
  fastify.get('/api/admin-panel/settings', {
    preHandler: requireAdmin,
  }, async () => {
    const settings = await prisma.systemSetting.findMany();

    const result: Record<string, string> = {};
    for (const s of settings) {
      result[s.key] = s.value;
    }

    return { settings: result };
  });

  /**
   * POST /api/admin-panel/settings - 更新系统设置
   */
  fastify.post('/api/admin-panel/settings', {
    preHandler: requireAdmin,
  }, async (request: FastifyRequest) => {
    const body = request.body as { key?: string; value?: string };

    if (!body.key || body.value === undefined) {
      return { success: false, message: '缺少设置键或值' };
    }

    await prisma.systemSetting.upsert({
      where: { key: body.key },
      update: { value: body.value },
      create: { key: body.key, value: body.value },
    });

    return {
      success: true,
      message: '设置已更新',
    };
  });
}

// 默认思维导图提示词
function getDefaultMindmapPromptForAdmin(): string {
  return `请根据以下视频内容，生成一个清晰、结构化的思维导图（Markdown 格式）：

要求：
1. 提取视频的主要主题作为根节点（一级标题，使用 #）
2. 识别2-5个核心分支作为二级标题（使用 ##）
3. 每个分支下列出2-4个关键要点作为三级标题（使用 ###）
4. 使用中文输出
5. 保持层次清晰，逻辑连贯
6. 每个节点内容简洁明了

请基于视频内容生成思维导图：`;
}
