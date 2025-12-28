import 'dotenv/config';
import type { AppConfig } from '../types/index.js';

export function getConfig(): AppConfig {
  return {
    port: parseInt(process.env.PORT || '9999', 10),
    postgresUrl: process.env.DATABASE_URL ||
      `postgresql://${process.env.POSTGRES_USER || 'postgres'}:${process.env.POSTGRES_PASSWORD || 'postgres'}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || '5432'}/${process.env.POSTGRES_DB || 'hearsight'}`,

    qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
    qdrantApiKey: process.env.QDRANT_API_KEY,

    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    openaiModel: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',

    embeddingApiUrl: process.env.QDRANT_EMBEDDING_API_URL || 'https://api.siliconflow.cn/v1',
    embeddingApiKey: process.env.QDRANT_EMBEDDING_API_KEY || '',
    embeddingModel: process.env.QDRANT_EMBEDDING_MODEL || 'BAAI/bge-large-zh-v1.5',

    ossEnabled: process.env.OSS_ENABLED === 'true',
    ossAccessKeyId: process.env.OSS_ACCESS_KEY_ID,
    ossAccessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    ossBucket: process.env.OSS_BUCKET,
    ossEndpoint: process.env.OSS_ENDPOINT,
    ossRegion: process.env.OSS_REGION,

    jwtSecret: process.env.JWT_SECRET || 'hearsight-secret-key-change-in-production',
    staticDir: process.env.STATIC_DIR || 'app_datas/download_videos',
  };
}

export const config = getConfig();
