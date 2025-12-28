import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/index.js';
import { getOssService } from '../services/oss.js';
import path from 'path';

// Request schemas
const importRequestSchema = z.object({
  media_path: z.string(),
  segments: z.array(z.object({
    start_time: z.number(),
    end_time: z.number(),
    text: z.string(),
  })),
  paragraphs: z.array(z.object({
    start_time: z.number(),
    end_time: z.number(),
    text: z.string(),
    summary: z.string(),
  })),
  summary: z.object({
    topic: z.string(),
    summary: z.string(),
    paragraph_count: z.number(),
    total_duration: z.number(),
  }),
  metadata: z.record(z.any()).optional(),
});

export async function transcriptRoutes(fastify: FastifyInstance) {
  const ossService = getOssService();
  const staticDir = process.env.STATIC_DIR || 'app_datas/download_videos';

  // Helper to build static URL
  function buildStaticUrl(mediaPath: string | null): string | null {
    if (!mediaPath) return null;

    // If it's an HTTP URL, return as-is (will be signed by OSS if needed)
    if (mediaPath.startsWith('http://') || mediaPath.startsWith('https://')) {
      return mediaPath;
    }

    // Local file: convert to /static/ path
    const basename = path.basename(mediaPath);
    return `/static/${basename}`;
  }

  // List transcripts
  fastify.get('/api/transcripts', async (request: FastifyRequest) => {
    const query = request.query as { limit?: string; offset?: string };
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50', 10)));
    const offset = Math.max(0, parseInt(query.offset || '0', 10));

    const [total, transcripts] = await Promise.all([
      prisma.transcript.count(),
      prisma.transcript.findMany({
        orderBy: { id: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          mediaPath: true,
          segmentsJson: true,
          createdAt: true,
        },
      }),
    ]);

    const items = transcripts.map(t => {
      let segmentCount = 0;
      try {
        const segments = JSON.parse(t.segmentsJson);
        segmentCount = Array.isArray(segments) ? segments.length : 0;
      } catch {}

      return {
        id: t.id,
        media_path: t.mediaPath,
        created_at: t.createdAt.toISOString(),
        segment_count: segmentCount,
        static_url: buildStaticUrl(t.mediaPath),
      };
    });

    return { total, items };
  });

  // Get transcript by ID
  fastify.get('/api/transcripts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const transcriptId = parseInt(id, 10);

    const transcript = await prisma.transcript.findUnique({
      where: { id: transcriptId },
    });

    if (!transcript) {
      return reply.status(404).send({ detail: `Transcript not found: ${transcriptId}` });
    }

    let segments: Array<{
      index: number;
      spk_id: string | null;
      sentence: string;
      start_time: number;
      end_time: number;
    }> = [];

    try {
      const rawSegments = JSON.parse(transcript.segmentsJson);
      segments = rawSegments.map((seg: any, idx: number) => {
        // Normalize timestamps (convert seconds to milliseconds if needed)
        let startTime = parseFloat(seg.start_time || 0);
        let endTime = parseFloat(seg.end_time || 0);

        if (startTime > 0 && startTime < 100000) {
          startTime = startTime * 1000;
        }
        if (endTime > 0 && endTime < 100000) {
          endTime = endTime * 1000;
        }

        return {
          index: seg.index ?? idx,
          spk_id: seg.spk_id ?? null,
          sentence: seg.sentence || seg.text || '',
          start_time: startTime,
          end_time: endTime,
        };
      });
    } catch {}

    return {
      id: transcript.id,
      media_path: transcript.mediaPath,
      created_at: transcript.createdAt.toISOString(),
      segments,
      static_url: buildStaticUrl(transcript.mediaPath),
    };
  });

  // Lookup transcript by media_path
  fastify.get('/api/lookup/transcript', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { media_path: string };

    if (!query.media_path) {
      return reply.status(400).send({ detail: 'media_path is required' });
    }

    // Exact match first
    let transcript = await prisma.transcript.findFirst({
      where: { mediaPath: query.media_path },
      orderBy: { id: 'desc' },
      select: { id: true },
    });

    // Fuzzy match by filename
    if (!transcript) {
      const filename = path.basename(query.media_path);
      transcript = await prisma.transcript.findFirst({
        where: { mediaPath: { contains: filename } },
        orderBy: { id: 'desc' },
        select: { id: true },
      });
    }

    if (!transcript) {
      return reply.status(422).send({ detail: '未找到对应的转写记录' });
    }

    return {
      transcript_id: transcript.id,
      media_path: query.media_path,
    };
  });

  // Delete transcript
  fastify.delete('/api/transcripts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const transcriptId = parseInt(id, 10);

    const transcript = await prisma.transcript.findUnique({
      where: { id: transcriptId },
    });

    if (!transcript) {
      return reply.status(404).send({ detail: `Transcript not found: ${transcriptId}` });
    }

    const deletedFiles: string[] = [];
    const errors: string[] = [];

    // Delete OSS file if applicable
    if (transcript.mediaPath && ossService.isOssUrl(transcript.mediaPath)) {
      try {
        const deleted = await ossService.deleteByUrl(transcript.mediaPath);
        if (deleted) {
          deletedFiles.push(`OSS: ${transcript.mediaPath}`);
        }
      } catch (error: any) {
        errors.push(`删除 OSS 文件失败: ${error.message}`);
      }
    }

    // Delete from database (summaries will cascade)
    await prisma.transcript.delete({
      where: { id: transcriptId },
    });

    return {
      success: true,
      message: '转写记录删除成功',
      transcript_id: transcriptId,
      deleted_files: deletedFiles.length > 0 ? deletedFiles : undefined,
      errors: errors.length > 0 ? errors : undefined,
    };
  });

  // Import from pyvideotrans
  fastify.post('/api/import/pyvideotrans', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = importRequestSchema.parse(request.body);

    // Save transcript
    const transcript = await prisma.transcript.create({
      data: {
        mediaPath: body.media_path,
        segmentsJson: JSON.stringify(body.segments),
      },
    });

    // Save summaries
    if (body.paragraphs.length > 0) {
      await prisma.summary.create({
        data: {
          transcriptId: transcript.id,
          summariesJson: JSON.stringify(body.paragraphs.map(p => ({
            text: p.text,
            summary: p.summary,
            start_time: p.start_time,
            end_time: p.end_time,
          }))),
        },
      });
    }

    return {
      success: true,
      transcript_id: transcript.id,
      message: `Successfully imported from pyvideotrans, transcript_id=${transcript.id}`,
    };
  });

  // Get summaries
  fastify.get('/api/summaries', async (request: FastifyRequest) => {
    const query = request.query as { limit?: string; offset?: string };
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50', 10)));
    const offset = Math.max(0, parseInt(query.offset || '0', 10));

    const summaries = await prisma.summary.findMany({
      orderBy: { id: 'desc' },
      take: limit,
      skip: offset,
    });

    return {
      items: summaries.map(s => {
        let summaryCount = 0;
        try {
          const data = JSON.parse(s.summariesJson);
          summaryCount = Array.isArray(data) ? data.length : 0;
        } catch {}

        return {
          id: s.id,
          transcript_id: s.transcriptId,
          created_at: s.createdAt.toISOString(),
          summary_count: summaryCount,
        };
      }),
    };
  });

  // Get summaries by transcript ID
  fastify.get('/api/summaries/transcript/:transcriptId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { transcriptId } = request.params as { transcriptId: string };
    const tid = parseInt(transcriptId, 10);

    const summary = await prisma.summary.findFirst({
      where: { transcriptId: tid },
      orderBy: { id: 'desc' },
    });

    if (!summary) {
      return reply.status(404).send({ detail: `Summaries not found for transcript: ${tid}` });
    }

    let summaries: any[] = [];
    try {
      summaries = JSON.parse(summary.summariesJson);
    } catch {}

    return { summaries };
  });
}
