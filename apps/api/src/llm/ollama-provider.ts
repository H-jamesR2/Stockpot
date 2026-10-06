import { type ChatMessage, type ChatOptions, type EmbedPurpose, LlmError, type LlmProvider } from './llm-provider.js';

export interface OllamaProviderOptions {
  baseUrl: string;
  embeddingModel: string;
  chatModel: string;
  /** How long Ollama may go without sending anything before the request is abandoned. */
  timeoutMs: number;
  /** How long Ollama keeps a model in memory after a request, as a duration like "30m". */
  keepAlive?: string;
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
  private readonly keepAlive: string | undefined;
  private readonly fetch: typeof fetch;

  constructor(options: OllamaProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.embeddingModel = options.embeddingModel;
    this.chatModel = options.chatModel;
    this.timeoutMs = options.timeoutMs;
    this.keepAlive = options.keepAlive;
    this.fetch = options.fetch ?? fetch;
  }

  async embed(texts: string[], purpose: EmbedPurpose): Promise<number[][]> {
    if (texts.length === 0) return [];
    const prefix = this.embeddingModel.startsWith('nomic-embed') ? NOMIC_PREFIXES[purpose] : '';
    const body = await this.post<{ embeddings?: number[][] }>('/api/embed', {
      model: this.embeddingModel,
      input: texts.map((text) => prefix + text),
      ...this.keepAliveField(),
    });
    if (!Array.isArray(body.embeddings) || body.embeddings.length !== texts.length) {
      throw new LlmError(`Ollama returned ${body.embeddings?.length ?? 0} embeddings for ${texts.length} inputs`);
    }
    return body.embeddings;
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const body = await this.post<{ message?: { content?: string } }>(
      '/api/chat',
      this.chatPayload(messages, options, false),
      options.signal,
    );
    const content = body.message?.content;
    if (typeof content !== 'string') throw new LlmError('Ollama chat response had no message content');
    return content;
  }

  async *chatStream(messages: ChatMessage[], options: ChatOptions = {}): AsyncIterable<string> {
    const idle = new IdleTimeout(this.timeoutMs);
    try {
      const response = await this.send('/api/chat', this.chatPayload(messages, options, true), idle, options.signal);
      if (!response.body) throw new LlmError('Ollama returned no stream');

      // Ollama streams one JSON object per line: { message: { content }, done }.
      const decoder = new TextDecoder();
      let buffered = '';
      for await (const bytes of response.body) {
        // A long answer is fine as long as Ollama keeps sending. Only silence times out.
        idle.touch();
        buffered += decoder.decode(bytes, { stream: true });
        const lines = buffered.split('\n');
        buffered = lines.pop() ?? '';
        for (const line of lines) {
          const piece = parseStreamLine(line);
          if (piece) yield piece;
        }
      }
      const last = parseStreamLine(buffered + decoder.decode());
      if (last) yield last;
    } catch (error) {
      throw this.explain(error, idle, options.signal);
    } finally {
      idle.clear();
    }
  }

  private chatPayload(messages: ChatMessage[], options: ChatOptions, stream: boolean) {
    return {
      model: this.chatModel,
      messages,
      stream,
      options: { temperature: options.temperature ?? 0 },
      ...this.keepAliveField(),
    };
  }

  private keepAliveField(): { keep_alive?: string } {
    return this.keepAlive ? { keep_alive: this.keepAlive } : {};
  }

  private async post<T>(path: string, payload: unknown, signal?: AbortSignal): Promise<T> {
    const idle = new IdleTimeout(this.timeoutMs);
    try {
      return (await (await this.send(path, payload, idle, signal)).json()) as T;
    } catch (error) {
      throw this.explain(error, idle, signal);
    } finally {
      idle.clear();
    }
  }

  private async send(path: string, payload: unknown, idle: IdleTimeout, signal?: AbortSignal): Promise<Response> {
    const response = await this.fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: signal ? AbortSignal.any([signal, idle.signal]) : idle.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new LlmError(`Ollama ${path} failed with ${response.status}: ${detail.slice(0, 300)}`);
    }
    return response;
  }

  /** Turns a low-level failure into a message that says what actually went wrong. */
  private explain(error: unknown, idle: IdleTimeout, signal?: AbortSignal): unknown {
    if (signal?.aborted || error instanceof LlmError) return error;
    if (idle.fired) {
      const seconds = Math.round(this.timeoutMs / 1000);
      return new LlmError(
        `Ollama did not respond within ${seconds} s. Loading a model on a CPU can take minutes, so try again or raise LLM_TIMEOUT_MS.`,
        { cause: error },
      );
    }
    return new LlmError(`Could not reach Ollama at ${this.baseUrl}. Is it running?`, { cause: error });
  }
}

/** Aborts after ms of silence. touch() restarts the countdown whenever something arrives. */
class IdleTimeout {
  private readonly controller = new AbortController();
  private timer: ReturnType<typeof setTimeout>;

  constructor(private readonly ms: number) {
    this.timer = this.arm();
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get fired(): boolean {
    return this.controller.signal.aborted;
  }

  touch(): void {
    clearTimeout(this.timer);
    this.timer = this.arm();
  }

  clear(): void {
    clearTimeout(this.timer);
  }

  private arm(): ReturnType<typeof setTimeout> {
    return setTimeout(
      () => this.controller.abort(new DOMException('No response from Ollama', 'TimeoutError')),
      this.ms,
    );
  }
}

function parseStreamLine(line: string): string | null {
  if (!line.trim()) return null;
  let parsed: { message?: { content?: string }; error?: string };
  try {
    parsed = JSON.parse(line) as typeof parsed;
  } catch (error) {
    throw new LlmError(`Ollama sent an unreadable stream line: ${line.slice(0, 100)}`, { cause: error });
  }
  if (parsed.error) throw new LlmError(`Ollama stopped mid-answer: ${parsed.error}`);
  return parsed.message?.content || null;
}
