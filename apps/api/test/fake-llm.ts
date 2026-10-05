import type { ChatMessage, EmbedPurpose, LlmProvider } from '../src/llm/index.js';
import { LlmError } from '../src/llm/index.js';

const DIMENSIONS = 768;

/** FNV-1a, so the same word always lands in the same dimension. */
function bucket(word: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < word.length; i++) {
    hash ^= word.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % DIMENSIONS;
}

/**
 * Deterministic stand-in for a model server. Embeddings are normalized bags of words, so texts
 * that share words land close together and retrieval tests behave the way a real model would.
 */
export class FakeLlmProvider implements LlmProvider {
  readonly embeddingModel: string;
  readonly chatModel = 'fake-chat';
  embedCalls: { texts: string[]; purpose: EmbedPurpose }[] = [];
  chatCalls: ChatMessage[][] = [];
  /** Set to make the next embed call fail as if the model server were down. */
  failEmbed = false;
  chatReply = 'Fake reply.';

  constructor(embeddingModel = 'fake-embed') {
    this.embeddingModel = embeddingModel;
  }

  async embed(texts: string[], purpose: EmbedPurpose): Promise<number[][]> {
    this.embedCalls.push({ texts, purpose });
    if (this.failEmbed) throw new LlmError('Could not reach Ollama at http://fake. Is it running?');
    return texts.map((text) => {
      const vector = new Array<number>(DIMENSIONS).fill(0);
      for (const word of text.toLowerCase().match(/[a-z]+/g) ?? []) {
        vector[bucket(word.replace(/s$/, ''))]! += 1;
      }
      const length = Math.hypot(...vector);
      if (length === 0) vector[0] = 1;
      return length === 0 ? vector : vector.map((v) => v / length);
    });
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    this.chatCalls.push(messages);
    return this.chatReply;
  }
}
