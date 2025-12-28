import { config } from '../utils/config.js';

/**
 * Embedding Service - Calls SiliconFlow API (or compatible)
 * Same as pyvideotrans uses BAAI/bge-large-zh-v1.5
 */
export class EmbeddingService {
  private apiUrl: string;
  private apiKey: string;
  private model: string;

  constructor(
    apiUrl: string = config.embeddingApiUrl,
    apiKey: string = config.embeddingApiKey,
    model: string = config.embeddingModel
  ) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
    this.model = model;
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.apiUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
        encoding_format: 'float',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Embedding API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[] }>;
    };

    if (!data.data || !data.data[0] || !data.data[0].embedding) {
      throw new Error('Invalid embedding response');
    }

    return data.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.apiUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        encoding_format: 'float',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Embedding API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[] }>;
    };

    return data.data.map(d => d.embedding);
  }
}

// Singleton instance
let embeddingService: EmbeddingService | null = null;

export function getEmbeddingService(): EmbeddingService {
  if (!embeddingService) {
    embeddingService = new EmbeddingService();
  }
  return embeddingService;
}
