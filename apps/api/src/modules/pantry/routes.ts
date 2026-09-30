import {
  CreatePantryItem,
  ErrorResponse,
  IdParams,
  ListPantryQuery,
  PantryItem,
  PantryList,
  UpdatePantryItem,
} from '@stockpot/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Database } from '../../db/index.js';
import { requireUser } from '../../plugins/auth.js';
import { PantryRepository } from './repository.js';

export const pantryRoutes: FastifyPluginAsyncZod<{ db: Database }> = async (app, { db }) => {
  const repo = new PantryRepository(db);

  // Every pantry route is per-user
  app.addHook('preHandler', app.authenticate);

  app.get(
    '/',
    {
      schema: {
        tags: ['pantry'],
        summary: "List the current user's pantry, soonest expiry first",
        querystring: ListPantryQuery,
        response: { 200: PantryList, 401: ErrorResponse },
      },
    },
    async (request) => ({ items: await repo.list(requireUser(request).id, request.query) }),
  );

  app.get(
    '/:id',
    {
      schema: {
        tags: ['pantry'],
        params: IdParams,
        response: { 200: PantryItem, 401: ErrorResponse, 404: ErrorResponse },
      },
    },
    async (request, reply) => {
      const item = await repo.get(requireUser(request).id, request.params.id);
      return item ?? reply.notFound('Pantry item not found');
    },
  );

  app.post(
    '/',
    {
      schema: {
        tags: ['pantry'],
        summary: 'Add an item. Unit and expiry default from the ingredient when omitted.',
        body: CreatePantryItem,
        response: { 201: PantryItem, 400: ErrorResponse, 401: ErrorResponse },
      },
    },
    async (request, reply) => {
      const item = await repo.create(requireUser(request).id, request.body);
      if (!item) return reply.badRequest('Unknown ingredientId');
      return reply.status(201).send(item);
    },
  );

  app.patch(
    '/:id',
    {
      schema: {
        tags: ['pantry'],
        params: IdParams,
        body: UpdatePantryItem,
        response: { 200: PantryItem, 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse },
      },
    },
    async (request, reply) => {
      const item = await repo.update(requireUser(request).id, request.params.id, request.body);
      return item ?? reply.notFound('Pantry item not found');
    },
  );

  app.delete(
    '/:id',
    {
      schema: {
        tags: ['pantry'],
        params: IdParams,
        response: { 204: z.null(), 401: ErrorResponse, 404: ErrorResponse },
      },
    },
    async (request, reply) => {
      const deleted = await repo.delete(requireUser(request).id, request.params.id);
      if (!deleted) return reply.notFound('Pantry item not found');
      return reply.status(204).send(null);
    },
  );
};
