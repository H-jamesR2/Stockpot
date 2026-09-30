import {
  ErrorResponse,
  Ingredient,
  ListIngredientsQuery,
  ResolveIngredientQuery,
  ResolveIngredientResponse,
  SlugParams,
} from '@stockpot/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Database } from '../../db/index.js';
import { IngredientRepository } from './repository.js';

export const ingredientRoutes: FastifyPluginAsyncZod<{ db: Database }> = async (app, { db }) => {
  const repo = new IngredientRepository(db);

  app.get(
    '/',
    {
      schema: {
        tags: ['ingredients'],
        summary: 'List canonical ingredients',
        querystring: ListIngredientsQuery,
        response: { 200: z.object({ items: z.array(Ingredient) }) },
      },
    },
    async (request) => ({ items: await repo.list(request.query) }),
  );

  app.get(
    '/resolve',
    {
      schema: {
        tags: ['ingredients'],
        summary: 'Resolve free text like "green onions" to canonical ingredients',
        querystring: ResolveIngredientQuery,
        response: { 200: ResolveIngredientResponse },
      },
    },
    async (request) => {
      const { q, limit } = request.query;
      const result = await repo.resolve(q, limit);
      return { query: q, ...result };
    },
  );

  app.get(
    '/:slug',
    {
      schema: {
        tags: ['ingredients'],
        summary: 'Get one ingredient by slug',
        params: SlugParams,
        response: { 200: Ingredient, 404: ErrorResponse },
      },
    },
    async (request, reply) => {
      const ingredient = await repo.getBySlug(request.params.slug);
      if (!ingredient) return reply.notFound(`No ingredient with slug "${request.params.slug}"`);
      return ingredient;
    },
  );
};
