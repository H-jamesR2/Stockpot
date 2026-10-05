import { type ChatMessage, type ChatOptions, type EmbedPurpose, LlmError, type LlmProvider } from './llm-provider.js';

export interface OllamaProviderOptions {
  baseUrl: string;
  embeddingModel: string;
  chatModel: string;
  timeoutMs: number;
  /** Injected so tests can run without a model server. */
  fetch?: typeof fetch;
}

// nomic-embed-text is trained with these task prefixes and retrieves noticeably worse without them.
const NOMIC_PREFIXES: Record<EmbedPurpose, string> = {
  document: 'search_document: ',
  query: 'search_query: ',
};

/** Talks to Ollama's REST API (https://github.com/ollama/ollama/blob/main/docs/api.md). */
export class OllamaProvider implements LlmProvider {
  readonly embeddingModel: string;
  readonly chatModel: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetch: typeof fetch;

  constructor(options: OllamaProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.embeddingModel = options.embeddingModel;
    this.chatModel = options.chatModel;
    this.timeoutMs = options.timeoutMs;
    this.fetch = options.fetch ?? fetch;
  }

  async embed(texts: string[], purpose: EmbedPurpose): Promise<number[][]> {
    if (texts.length === 0) return [];
    const prefix = this.embeddingModel.startsWith('nomic-embed') ? NOMIC_PREFIXES[purpose] : '';
    const body = await this.post<{ embeddings?: number[][] }>('/api/embed', {
      model: this.embeddingModel,
      input: texts.map((text) => prefix + text),
    });
    if (!Array.isArray(body.embeddings) || body.embeddings.length !== texts.length) {
      throw new LlmError(`Ollama returned ${body.embeddings?.length ?? 0} embeddings for ${texts.length} inputs`);
    }
    return body.embeddings;
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const body = await this.post<{ message?: { content?: string } }>('/api/chat', {
      model: this.chatModel,
      messages,
      stream: false,
      options: { temperature: options.temperature ?? 0 },
    });
    const content = body.message?.content;
    if (typeof content !== 'string') throw new LlmError('Ollama chat response had no message content');
    return content;
  }

  private async post<T>(path: string, payload: unknown): Promise<T> {
    let response: Response;
    try {
      response = await this.fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new LlmError(`Could not reach Ollama at ${this.baseUrl}. Is it running?`, { cause: error });
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new LlmError(`Ollama ${path} failed with ${response.status}: ${detail.slice(0, 300)}`);
    }
    return (await response.json()) as T;
  }
}
