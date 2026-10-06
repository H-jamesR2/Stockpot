import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGIN: z.string().default('http://localhost:4200'),
  AUTH_PROVIDER: z.enum(['local']).default('local'),
  DEV_USER_EMAIL: z.email().default('dev@stockpot.local'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LLM_PROVIDER: z.enum(['ollama']).default('ollama'),
  OLLAMA_BASE_URL: z.url().default('http://localhost:11434'),
  EMBED_MODEL: z.string().min(1).default('nomic-embed-text'),
  CHAT_MODEL: z.string().min(1).default('qwen2.5:3b'),
  // How long Ollama may go silent before a request is abandoned. Streams reset it on every piece.
  // On the dev CPU a cold qwen2.5:3b took 2 minutes to load plus 1.5 minutes to read a 1,000-token prompt.
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).default(600_000),
  // Ollama unloads idle models after 5 minutes by default, and reloading costs minutes on a CPU.
  OLLAMA_KEEP_ALIVE: z.string().min(1).default('30m'),
  // Questions whose closest chunk is farther than this (cosine distance) are declined without
  // calling the chat model. Measured on nomic-embed-text: answerable 0.11 to 0.25, unanswerable 0.40+.
  ASK_MAX_DISTANCE: z.coerce.number().min(0).max(2).default(0.35),
  // Keeps the prompt inside qwen2.5:3b's 4,096 token window in Ollama.
  ASK_MAX_SOURCE_TOKENS: z.coerce.number().int().min(100).default(2000),
  STORAGE_DRIVER: z.enum(['local']).default('local'),
  // Relative paths resolve from the API's working directory (apps/api in dev).
  STORAGE_DIR: z.string().min(1).default('data/uploads'),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
