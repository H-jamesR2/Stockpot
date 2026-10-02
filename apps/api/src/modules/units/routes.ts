import { UnitList } from '@stockpot/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Database } from '../../db/index.js';
import { UnitRepository } from './repository.js';

export const unitRoutes: FastifyPluginAsyncZod<{ db: Database }> = async (app, { db }) => {
  const repo = new UnitRepository(db);

  app.get(
    '/',
    {
      schema: {
        tags: ['units'],
        summary: 'List units of measure',
        response: { 200: UnitList },
      },
    },
    async () => ({ items: await repo.list() }),
  );
};
