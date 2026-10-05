// Renders every recipe as a document and embeds the ones whose text changed:
// `npm run ingest:recipes -w @stockpot/api`. Needs the database and the embedding model running.
import { loadConfig } from '../config.js';
import { createDatabase } from '../db/index.js';
import { createLlmProvider } from '../llm/index.js';
import { IngestionService } from '../modules/documents/ingestion-service.js';
import { createFileStorage } from '../storage/index.js';

const config = loadConfig();
const db = createDatabase(config.DATABASE_URL);
const service = new IngestionService(db, createLlmProvider(config), createFileStorage(config));

try {
  const started = performance.now();
  const result = await service.syncRecipes();
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`Ingested ${result.ingested} recipes, ${result.unchanged} unchanged, in ${seconds}s`);
} finally {
  await db.destroy();
}
