import { ErrorResponse, SearchQuery, SearchResponse } from '@stockpot/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { SearchService } from './search-service.js';

export const searchRoutes: FastifyPluginAsyncZod<{ search: SearchService }> = async (app, { search }) => {
  app.get(
    '/',
    {
      schema: {
        tags: ['search'],
        summary: 'Hybrid search over document chunks (vector similarity fused with full-text rank)',
        querystring: SearchQuery,
        response: { 200: SearchResponse, 400: ErrorResponse, 502: ErrorResponse },
      },
    },
    async (request) => ({ query: request.query.q, results: await search.search(request.query) }),
  );
};
