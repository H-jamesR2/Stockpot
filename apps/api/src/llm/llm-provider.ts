/** Whether text is being stored for retrieval or used to search. Some embedding models embed these differently. */
export type EmbedPurpose = 'document' | 'query';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  /** 0 keeps answers as deterministic as the model allows. */
  temperature?: number;
  /** Aborting stops generation, for example when the client disconnects mid-answer. */
  signal?: AbortSignal;
}

/**
 * The only way the rest of the app talks to a language model. Ollama now, Bedrock in the AWS phase.
 * Nothing outside src/llm should import a model SDK or call a model API directly.
 */
export interface LlmProvider {
  /** Recorded on every stored vector so a model change can trigger a re-embed. */
  readonly embeddingModel: string;
  readonly chatModel: string;
  embed(texts: string[], purpose: EmbedPurpose): Promise<number[][]>;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
  /** Yields the reply in pieces as the model writes it. */
  chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string>;
}

export class LlmError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LlmError';
  }
}
