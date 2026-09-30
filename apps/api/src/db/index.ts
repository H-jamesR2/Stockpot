import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { DB } from './types.js';

export type Database = Kysely<DB>;

// numeric -> number. Kitchen quantities never need arbitrary precision.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number.parseFloat(v));
// date -> 'YYYY-MM-DD' string. The default parser builds a local-midnight Date,
// which shifts days depending on the server's timezone.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export function createDatabase(connectionString: string): Database {
  return new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString, max: 10 }),
    }),
  });
}

/** Maps Postgres constraint errors to HTTP-friendly categories. */
export function pgErrorCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string') {
    return err.code;
  }
  return undefined;
}
