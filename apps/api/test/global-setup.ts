import type { TestProject } from 'vitest/node';
import { resetAndMigrate } from './db-utils.js';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/**
 * Uses TEST_DATABASE_URL if set (fast, for local loops against a running
 * Postgres). WARNING: that database is wiped. Otherwise starts a throwaway
 * pgvector container with Testcontainers, which needs Docker.
 */
export default async function setup(project: TestProject) {
  let databaseUrl = process.env.TEST_DATABASE_URL;
  let stop: (() => Promise<unknown>) | undefined;

  if (!databaseUrl) {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
    const container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
    databaseUrl = container.getConnectionUri();
    stop = () => container.stop();
  }

  await resetAndMigrate(databaseUrl);
  project.provide('databaseUrl', databaseUrl);

  return async () => {
    await stop?.();
  };
}
