import { sql } from 'kysely';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Database } from '../../db/index.js';

const HealthResponse = z.object({
  status: z.enum(['ok', 'degraded']),
  database: z.enum(['ok', 'unreachable']),
});

export const healthRoutes: FastifyPluginAsyncZod<{ db: Database }> = async (app, { db }) => {
  app.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        response: { 200: HealthResponse, 503: HealthResponse },
      },
    },
    async (request, reply) => {
      try {
        await sql`select 1`.execute(db);
        return { status: 'ok' as const, database: 'ok' as const };
      } catch (err) {
        request.log.error({ err }, 'Health check database query failed');
        return reply.status(503).send({ status: 'degraded', database: 'unreachable' });
      }
    },
  );
};
