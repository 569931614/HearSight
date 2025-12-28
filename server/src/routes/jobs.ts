import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/index.js';

// Request schemas
const createJobSchema = z.object({
  url: z.string().url('请提供有效的 URL'),
});

export async function jobRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/jobs - 创建任务
   * 注意：Node.js 版本不处理任务，仅记录到数据库
   * 实际处理由 pyvideotrans 完成
   */
  fastify.post('/api/jobs', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createJobSchema.parse(request.body);

    const job = await prisma.job.create({
      data: {
        url: body.url,
        status: 'pending',
      },
    });

    return {
      id: job.id,
      url: job.url,
      status: job.status,
      created_at: job.createdAt.toISOString(),
      message: '任务已创建，请使用 pyvideotrans 处理视频',
    };
  });

  /**
   * GET /api/jobs - 获取任务列表
   */
  fastify.get('/api/jobs', async (request: FastifyRequest) => {
    const query = request.query as {
      status?: string;
      limit?: string;
      offset?: string;
    };

    const status = query.status;
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50', 10)));
    const offset = Math.max(0, parseInt(query.offset || '0', 10));

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const [total, jobs] = await Promise.all([
      prisma.job.count({ where }),
      prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);

    return {
      total,
      items: jobs.map(j => ({
        id: j.id,
        url: j.url,
        status: j.status,
        created_at: j.createdAt.toISOString(),
        started_at: j.startedAt?.toISOString() || null,
        finished_at: j.finishedAt?.toISOString() || null,
        error: j.error,
      })),
    };
  });

  /**
   * GET /api/jobs/:id - 获取任务详情
   */
  fastify.get('/api/jobs/:id', async (request: FastifyRequest, reply: FastifyReply) => {
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
   * DELETE /api/jobs/:id - 删除任务
   */
  fastify.delete('/api/jobs/:id', async (request: FastifyRequest, reply: FastifyReply) => {
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
}
