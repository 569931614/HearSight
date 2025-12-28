// HearSight Type Definitions

export interface Segment {
  index: number;
  spk_id: string | null;
  sentence: string;
  start_time: number; // milliseconds
  end_time: number;   // milliseconds
}

export interface SummaryItem {
  text: string;
  summary: string;
  start_time: number;
  end_time: number;
}

export interface VideoMeta {
  id: number;
  media_path: string;
  created_at: string;
  segment_count: number;
  static_url?: string;
}

export interface TranscriptDetail {
  id: number;
  media_path: string;
  created_at: string;
  segments: Segment[];
  static_url?: string;
}

// Qdrant search result
export interface QdrantSearchResult {
  chunk_id: string;
  score: number;
  chunk_text: string;
  paragraph_summary: string | null;
  video_title: string;
  video_path: string | null;
  video_id: string | null;
  language: string;
  start_time: number;
  end_time: number;
  source_type: string;
}

// RAG chat request/response
export interface RagChatRequest {
  query: string;
  session_id?: string;
  n_results?: number;
  score_threshold?: number;
  language_filter?: string;
  folder_id?: string;
}

export interface RagChatResponse {
  answer: string;
  references: {
    chunk_text: string;
    score: number;
    metadata: {
      video_title: string;
      video_path: string | null;
      video_id: string | null;
      start_time: number;
      end_time: number;
      summary: string | null;
      language: string;
      source_type: string;
    };
  }[];
  query: string;
  session_id: string;
}

// Video from Qdrant
export interface QdrantVideo {
  video_id: string;
  video_path: string | null;
  video_title: string | null;
  topic: string | null;
  video_summary: string | null;
  total_segments: number;
  total_duration: number;
  language: string;
  source_type: string;
  folder: string;
  folder_id: string | null;
  thumbnail_url: string | null;
}

// JWT payload
export interface JwtPayload {
  sub: string;
  username: string;
  is_admin: boolean;
  exp: number;
}

// Config
export interface AppConfig {
  port: number;
  postgresUrl: string;
  qdrantUrl: string;
  qdrantApiKey?: string;
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
  embeddingApiUrl: string;
  embeddingApiKey: string;
  embeddingModel: string;
  ossEnabled: boolean;
  ossAccessKeyId?: string;
  ossAccessKeySecret?: string;
  ossBucket?: string;
  ossEndpoint?: string;
  ossRegion?: string;
  jwtSecret: string;
  staticDir: string;
}
