import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const dbDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../db');

/** Extracts the "-- migrate:up" section of a dbmate migration file. */
function upSection(contents: string): string {
  const start = contents.indexOf('-- migrate:up');
  const end = contents.indexOf('-- migrate:down');
  if (start === -1) throw new Error('Migration is missing "-- migrate:up"');
  return contents.slice(start, end === -1 ? undefined : end);
}

/**
 * Wipes the public schema and applies every migration in order.
 * Mirrors what dbmate does, without needing the dbmate binary in CI.
 */
export async function resetAndMigrate(connectionString: string): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query('drop schema if exists public cascade; create schema public;');
    const files = (await readdir(path.join(dbDir, 'migrations'))).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = upSection(await readFile(path.join(dbDir, 'migrations', file), 'utf8'));
      await client.query('begin');
      await client.query(sql);
      await client.query('commit');
    }
  } finally {
    await client.end();
  }
}

export async function runSeed(connectionString: string, file = 'test_seed.sql'): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query(await readFile(path.join(dbDir, 'seeds', file), 'utf8'));
  } finally {
    await client.end();
  }
}
