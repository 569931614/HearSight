import OpenAI from 'openai';
import { config } from '../utils/config.js';
import type { QdrantSearchResult } from '../types/index.js';

/**
 * LLM Service - OpenAI compatible API
 */
export class LlmService {
  private client: OpenAI;
  private model: string;

  constructor() {
    this.client = new OpenAI({
      apiKey: config.openaiApiKey,
      baseURL: config.openaiBaseUrl,
    });
    this.model = config.openaiModel;
  }

  /**
   * Format RAG context from search results
   */
  formatRagContext(results: QdrantSearchResult[], includeSummaries: boolean = true): string {
    if (results.length === 0) {
      return '没有找到相关的视频内容。';
    }

    const contextParts: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      let part = `【来源 ${i + 1}】\n`;
      part += `视频: ${r.video_title}\n`;
      part += `时间: ${r.start_time.toFixed(1)}s - ${r.end_time.toFixed(1)}s\n`;
      part += `内容: ${r.chunk_text}\n`;

      if (includeSummaries && r.paragraph_summary) {
        part += `摘要: ${r.paragraph_summary}\n`;
      }

      contextParts.push(part);
    }

    return contextParts.join('\n---\n');
  }

  /**
   * Build system prompt with RAG context
   */
  formatRagSystemPrompt(basePrompt: string, context: string): string {
    return `${basePrompt}

## 参考资料
以下是从视频库中检索到的相关内容，请基于这些内容回答用户的问题：

${context}

## 回答要求
1. 基于提供的视频内容准确回答问题
2. 在回答中引用具体的来源（如"根据来源1..."）
3. 如果内容不足以回答问题，请如实说明
4. 使用中文回答`;
  }

  /**
   * Generate RAG-enhanced chat response
   */
  async chat(
    query: string,
    ragContext: string,
    systemPrompt?: string
  ): Promise<string> {
    const basePrompt = systemPrompt ||
      '你是一个专业的视频内容问答助手。请基于提供的视频内容回答用户的问题，并在回答中引用相关来源。';

    const fullSystemPrompt = this.formatRagSystemPrompt(basePrompt, ragContext);

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: fullSystemPrompt },
        { role: 'user', content: query },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    return completion.choices[0]?.message?.content || '抱歉，无法生成回答。';
  }

  /**
   * Simple chat without RAG
   */
  async simpleChat(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: 0.7,
      max_tokens: 2000,
    });

    return completion.choices[0]?.message?.content || '';
  }
}

// Singleton instance
let llmService: LlmService | null = null;

export function getLlmService(): LlmService {
  if (!llmService) {
    llmService = new LlmService();
  }
  return llmService;
}
