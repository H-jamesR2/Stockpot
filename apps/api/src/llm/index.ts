import type { Config } from '../config.js';
import type { LlmProvider } from './llm-provider.js';
import { OllamaProvider } from './ollama-provider.js';

export * from './llm-provider.js';

export function createLlmProvider(config: Config): LlmProvider {
  switch (config.LLM_PROVIDER) {
    case 'ollama':
      return new OllamaProvider({
        baseUrl: config.OLLAMA_BASE_URL,
        embeddingModel: config.EMBED_MODEL,
        chatModel: config.CHAT_MODEL,
        timeoutMs: config.LLM_TIMEOUT_MS,
        keepAlive: config.OLLAMA_KEEP_ALIVE,
      });
  }
}
