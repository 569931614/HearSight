import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/index.js';
import { getQdrantClient } from '../services/qdrant.js';
import { getEmbeddingService } from '../services/embedding.js';

// Request schemas
const searchSchema = z.object({
  query: z.string().min(1),
  n_results: z.number().default(10),
});

const syncSchema = z.object({
  transcript_id: z.number().nullable().optional(),
});

export async function knowledgeRoutes(fastify: FastifyInstance) {
  const qdrantClient = getQdrantClient();
  const embeddingService = getEmbeddingService();

  /**
   * POST /api/knowledge/search - 搜索知识库
   */
  fastify.post('/api/knowledge/search', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = searchSchema.parse(request.body);

    if (!await qdrantClient.checkConnection()) {
      return reply.status(503).send({
        detail: 'Qdrant 连接不可用',
        code: 'QDRANT_UNAVAILABLE',
      });
    }

    // Generate embedding
    const queryEmbedding = await embeddingService.embed(body.query);

    // Search
    const results = await qdrantClient.searchSimilar(
      queryEmbedding,
      body.n_results,
      0.5 // lower threshold for broader results
    );

    return {
      results: results.map(r => ({
        chunk_id: r.chunk_id,
        video_title: r.video_title,
        chunk_text: r.chunk_text,
        summary: r.paragraph_summary,
        start_time: r.start_time,
        end_time: r.end_time,
        score: r.score,
        language: r.language,
        source_type: r.source_type,
      })),
    };
  });

  /**
   * POST /api/knowledge/sync - 同步数据到向量库
   * 注意：Node.js 版本不执行同步，仅返回提示
   */
  fastify.post('/api/knowledge/sync', async (request: FastifyRequest) => {
    const body = syncSchema.parse(request.body);

    return {
      success: false,
      message: 'Node.js 版本不支持同步操作，请使用 pyvideotrans 导出数据到 Qdrant',
      transcript_id: body.transcript_id,
    };
  });

  /**
   * GET /api/knowledge/videos - 获取知识库视频列表
   */
  fastify.get('/api/knowledge/videos', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!await qdrantClient.checkConnection()) {
      return reply.status(503).send({
        detail: 'Qdrant 连接不可用',
        code: 'QDRANT_UNAVAILABLE',
      });
    }

    const videos = await qdrantClient.listAllVideos();

    return {
      videos: videos.map(v => ({
        video_id: v.video_id,
        video_path: v.video_path,
        video_title: v.video_title,
        topic: v.topic,
        video_summary: v.video_summary,
        total_segments: v.total_segments,
        total_duration: v.total_duration,
        language: v.language,
        source_type: v.source_type,
        folder: v.folder,
        folder_id: v.folder_id,
      })),
    };
  });

  /**
   * GET /api/knowledge/chat/history/:sessionId - 获取对话历史
   */
  fastify.get('/api/knowledge/chat/history/:sessionId', async (request: FastifyRequest) => {
    const { sessionId } = request.params as { sessionId: string };
    const query = request.query as { limit?: string };
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50', 10)));

    const history = await prisma.chatHistory.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return {
      session_id: sessionId,
      history: history.map(h => ({
        id: h.id,
        session_id: h.sessionId,
        role: h.role,
        content: h.content,
        metadata: h.metadata,
        created_at: h.createdAt.toISOString(),
      })),
    };
  });

  /**
   * DELETE /api/knowledge/chat/history/:sessionId - 删除对话历史
   */
  fastify.delete('/api/knowledge/chat/history/:sessionId', async (request: FastifyRequest) => {
    const { sessionId } = request.params as { sessionId: string };

    const result = await prisma.chatHistory.deleteMany({
      where: { sessionId },
    });

    return {
      success: result.count > 0,
      session_id: sessionId,
      message: result.count > 0 ? '删除成功' : '会话不存在或已被删除',
    };
  });
}
