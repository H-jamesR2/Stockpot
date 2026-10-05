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
  // Local models on a CPU can take minutes for a long answer.
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).default(180_000),
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
