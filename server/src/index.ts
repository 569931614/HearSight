import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { config } from './utils/config.js';
import { initDb, closeDb } from './db/index.js';
import { getQdrantClient } from './services/qdrant.js';
import { qdrantRoutes } from './routes/qdrant.js';
import { transcriptRoutes } from './routes/transcripts.js';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { jobRoutes } from './routes/jobs.js';
import { knowledgeRoutes } from './routes/knowledge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║         HearSight Server (Node.js Edition)               ║');
  console.log('║              AI Video RAG Service                        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  // Initialize database
  console.log('📦 Initializing database...');
  await initDb();

  // Check Qdrant connection
  console.log('🔍 Checking Qdrant connection...');
  const qdrantClient = getQdrantClient();
  const qdrantHealthy = await qdrantClient.checkConnection();

  // Create Fastify instance
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  // CORS configuration
  const allowOrigins = process.env.ALLOW_ORIGINS
    ? process.env.ALLOW_ORIGINS.split(',').map(s => s.trim())
    : ['*'];

  await fastify.register(cors, {
    origin: allowOrigins.includes('*') ? true : allowOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  // Static files (videos)
  const staticDir = path.resolve(process.cwd(), config.staticDir);
  console.log(`📁 Static directory: ${staticDir}`);

  // Ensure static directory exists
  if (!fs.existsSync(staticDir)) {
    fs.mkdirSync(staticDir, { recursive: true });
    console.log('   Created static directory');
  }

  await fastify.register(fastifyStatic, {
    root: staticDir,
    prefix: '/static/',
    decorateReply: false,
  });

  // ==================== Register Routes ====================

  console.log('🔗 Registering routes...');

  // Auth routes
  await authRoutes(fastify);
  console.log('   ✓ Auth routes registered');

  // Admin routes
  await adminRoutes(fastify);
  console.log('   ✓ Admin routes registered');

  // Transcript routes
  await transcriptRoutes(fastify);
  console.log('   ✓ Transcript routes registered');

  // Qdrant RAG routes
  await qdrantRoutes(fastify);
  console.log('   ✓ Qdrant RAG routes registered');

  // Job routes
  await jobRoutes(fastify);
  console.log('   ✓ Job routes registered');

  // Knowledge routes
  await knowledgeRoutes(fastify);
  console.log('   ✓ Knowledge routes registered');

  // ==================== Utility Endpoints ====================

  // Health check
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: {
        database: 'connected',
        qdrant: qdrantHealthy ? 'connected' : 'disconnected',
      },
    };
  });

  // Root endpoint
  fastify.get('/', async () => {
    return {
      name: 'HearSight API',
      version: '1.0.0',
      description: 'AI Video RAG Service',
      endpoints: {
        health: '/health',
        auth: '/api/auth/*',
        admin: '/api/admin/*',
        admin_panel: '/api/admin-panel/*',
        transcripts: '/api/transcripts/*',
        qdrant: '/api/qdrant/*',
        static: '/static/*',
      },
    };
  });

  // API info
  fastify.get('/api', async () => {
    return {
      version: '1.0.0',
      rag_enabled: process.env.RAG_ENABLED !== 'false',
      qdrant_status: qdrantHealthy ? 'healthy' : 'unavailable',
    };
  });

  // ==================== Error Handling ====================

  fastify.setErrorHandler((error, request, reply) => {
    // Log error
    fastify.log.error(error);

    // Zod validation error
    if (error.name === 'ZodError') {
      return reply.status(400).send({
        detail: '请求参数验证失败',
        code: 'VALIDATION_ERROR',
        errors: (error as any).errors?.map((e: any) => ({
          field: e.path?.join('.'),
          message: e.message,
        })),
      });
    }

    // Prisma error
    if (error.name === 'PrismaClientKnownRequestError') {
      const prismaError = error as any;
      if (prismaError.code === 'P2002') {
        return reply.status(400).send({
          detail: '数据已存在',
          code: 'DUPLICATE_ENTRY',
        });
      }
      if (prismaError.code === 'P2025') {
        return reply.status(404).send({
          detail: '数据不存在',
          code: 'NOT_FOUND',
        });
      }
    }

    // JWT error
    if (error.name === 'JsonWebTokenError') {
      return reply.status(401).send({
        detail: '无效的认证令牌',
        code: 'INVALID_TOKEN',
      });
    }

    if (error.name === 'TokenExpiredError') {
      return reply.status(401).send({
        detail: '认证令牌已过期',
        code: 'TOKEN_EXPIRED',
      });
    }

    // Generic error
    const statusCode = error.statusCode || 500;
    return reply.status(statusCode).send({
      detail: statusCode >= 500 ? '服务器内部错误' : error.message,
      code: statusCode >= 500 ? 'INTERNAL_ERROR' : 'ERROR',
    });
  });

  // 404 handler
  fastify.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      detail: `路径不存在: ${request.method} ${request.url}`,
      code: 'NOT_FOUND',
    });
  });

  // ==================== Graceful Shutdown ====================

  const shutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
    try {
      await fastify.close();
      await closeDb();
      console.log('✅ Server closed');
      process.exit(0);
    } catch (err) {
      console.error('❌ Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // ==================== Start Server ====================

  try {
    await fastify.listen({
      port: config.port,
      host: '0.0.0.0',
    });

    console.log('');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║                    Server Started                        ║');
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log(`║  🌐 URL:      http://localhost:${config.port.toString().padEnd(24)}║`);
    console.log(`║  📊 Qdrant:   ${config.qdrantUrl.padEnd(36)}║`);
    console.log(`║  🗄️  Database: PostgreSQL                                 ║`);
    console.log(`║  🔐 OSS:      ${(config.ossEnabled ? 'Enabled' : 'Disabled').padEnd(36)}║`);
    console.log(`║  🤖 RAG:      ${(process.env.RAG_ENABLED !== 'false' ? 'Enabled' : 'Disabled').padEnd(36)}║`);
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('📝 Default admin account: admin / admin123');
    console.log('');

  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

main().catch(console.error);
