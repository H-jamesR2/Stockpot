// Embeds chunks that have no embedding or came from a different model than EMBED_MODEL:
// `npm run reembed -w @stockpot/api`. Run it after changing EMBED_MODEL.
import { loadConfig } from '../config.js';
import { createDatabase } from '../db/index.js';
import { createLlmProvider } from '../llm/index.js';
import { IngestionService } from '../modules/documents/ingestion-service.js';
import { createFileStorage } from '../storage/index.js';

const config = loadConfig();
const db = createDatabase(config.DATABASE_URL);
const service = new IngestionService(db, createLlmProvider(config), createFileStorage(config));

try {
  const updated = await service.reembedStale();
  console.log(`Re-embedded ${updated} chunks with ${config.EMBED_MODEL}`);
} finally {
  await db.destroy();
}
