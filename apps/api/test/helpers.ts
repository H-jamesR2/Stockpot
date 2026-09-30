import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, inject } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDatabase, type Database } from '../src/db/index.js';
import { runSeed } from './db-utils.js';

/**
 * Builds the app against the test database and reseeds before every test,
 * so each test starts from the same known pantry and recipes.
 */
export function useTestApp() {
  const ctx = {} as { app: FastifyInstance; db: Database };
  const databaseUrl = inject('databaseUrl');

  beforeAll(async () => {
    ctx.db = createDatabase(databaseUrl);
    ctx.app = await buildApp({
      config: loadConfig({ NODE_ENV: 'test', DATABASE_URL: databaseUrl, LOG_LEVEL: 'silent' }),
      db: ctx.db,
    });
    await ctx.app.ready();
  });

  beforeEach(async () => {
    await runSeed(databaseUrl);
  });

  afterAll(async () => {
    await ctx.app?.close();
    await ctx.db?.destroy();
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
