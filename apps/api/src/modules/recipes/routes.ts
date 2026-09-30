import {
  ErrorResponse,
  ListRecipesQuery,
  PantryMatches,
  PantryMatchesQuery,
  RecipeDetail,
  RecipeList,
  ReviewQueue,
  SlugParams,
} from '@stockpot/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Database } from '../../db/index.js';
import { requireUser } from '../../plugins/auth.js';
import { RecipeRepository } from './repository.js';

export const recipeRoutes: FastifyPluginAsyncZod<{ db: Database }> = async (app, { db }) => {
  const repo = new RecipeRepository(db);

  app.get(
    '/',
    {
      schema: {
        tags: ['recipes'],
        summary: 'List recipes with optional filters',
        querystring: ListRecipesQuery,
        response: { 200: RecipeList },
      },
    },
    async (request) => ({ items: await repo.list(request.query) }),
  );

  app.get(
    '/pantry-matches',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['recipes'],
        summary: "Recipes ranked by how well the current user's pantry covers them",
        querystring: PantryMatchesQuery,
        response: { 200: PantryMatches, 401: ErrorResponse },
      },
    },
    async (request) => ({ items: await repo.pantryMatches(requireUser(request).id, request.query) }),
  );

  app.get(
    '/review-queue',
    {
      schema: {
        tags: ['recipes'],
        summary: 'Recipe ingredient lines that failed normalization',
        response: { 200: ReviewQueue },
      },
    },
    async () => ({ items: await repo.reviewQueue() }),
  );

  app.get(
    '/:slug',
    {
      schema: {
        tags: ['recipes'],
        summary: 'Recipe detail with ingredients and steps',
        params: SlugParams,
        response: { 200: RecipeDetail, 404: ErrorResponse },
      },
    },
    async (request, reply) => {
      const recipe = await repo.getBySlug(request.params.slug);
      return recipe ?? reply.notFound(`No recipe with slug "${request.params.slug}"`);
    },
  );
};
