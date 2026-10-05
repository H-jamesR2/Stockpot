// Confirms the configured models respond on this machine: `npm run llm:check -w @stockpot/api`.
import { loadConfig } from '../config.js';
import { createLlmProvider } from '../llm/index.js';

const config = loadConfig({ DATABASE_URL: 'unused-by-this-check', ...process.env });
const llm = createLlmProvider(config);

async function timed<T>(label: string, run: () => Promise<T>): Promise<T> {
  const started = performance.now();
  const result = await run();
  console.log(`${label} took ${((performance.now() - started) / 1000).toFixed(1)}s`);
  return result;
}

console.log(`Provider ${config.LLM_PROVIDER} at ${config.OLLAMA_BASE_URL}`);

const [vector] = await timed(`Embedding with ${llm.embeddingModel}`, () =>
  llm.embed(['Braising cooks tough cuts slowly in a little liquid.'], 'document'),
);
console.log(`  ${vector?.length ?? 0} dimensions`);

const reply = await timed(`Chat with ${llm.chatModel}`, () =>
  llm.chat([{ role: 'user', content: 'In one short sentence, what is braising?' }]),
);
console.log(`  ${reply.trim()}`);
