import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, inject } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDatabase, type Database } from '../src/db/index.js';
import { LocalDiskStorage } from '../src/storage/local-disk-storage.js';
import { runSeed } from './db-utils.js';
import { FakeLlmProvider } from './fake-llm.js';

/**
 * Builds the app against the test database and reseeds before every test,
 * so each test starts from the same known pantry and recipes. The model provider is a fake and
 * file storage is a temporary folder, so no test needs a model server or touches real uploads.
 */
export function useTestApp() {
  const ctx = {} as { app: FastifyInstance; db: Database; llm: FakeLlmProvider; storageDir: string };
  const databaseUrl = inject('databaseUrl');

  beforeAll(async () => {
    ctx.db = createDatabase(databaseUrl);
    ctx.llm = new FakeLlmProvider();
    ctx.storageDir = await mkdtemp(path.join(tmpdir(), 'stockpot-test-storage-'));
    ctx.app = await buildApp({
      config: loadConfig({ NODE_ENV: 'test', DATABASE_URL: databaseUrl, LOG_LEVEL: 'silent' }),
      db: ctx.db,
      llm: ctx.llm,
      storage: new LocalDiskStorage(ctx.storageDir),
    });
    await ctx.app.ready();
  });

  beforeEach(async () => {
    await runSeed(databaseUrl);
    // The seed resets the database, so reset stored files with it.
    await rm(ctx.storageDir, { recursive: true, force: true });
    await mkdir(ctx.storageDir);
    ctx.llm.failEmbed = false;
    ctx.llm.embedCalls = [];
    ctx.llm.chatCalls = [];
  });

  afterAll(async () => {
    await ctx.app?.close();
    await ctx.db?.destroy();
    if (ctx.storageDir) await rm(ctx.storageDir, { recursive: true, force: true });
  });

  return ctx;
}

export async function ingredientId(db: Database, slug: string): Promise<string> {
  const row = await db.selectFrom('ingredients').select('id').where('slug', '=', slug).executeTakeFirstOrThrow();
  return row.id;
}

/** Today's date plus n days as YYYY-MM-DD, computed by the database to match its clock. */
export async function dbDatePlus(db: Database, days: number): Promise<string> {
  const { sql } = await import('kysely');
  const { rows } = await sql<{ d: string }>`select (current_date + ${days}::int)::date as d`.execute(db);
  return rows[0]!.d;
}
