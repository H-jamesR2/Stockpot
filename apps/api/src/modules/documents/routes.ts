import {
  CreateDocument,
  DocumentDetail,
  DocumentList,
  DocumentSummary,
  ErrorResponse,
  IdParams,
  ListDocumentsQuery,
} from '@stockpot/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Database } from '../../db/index.js';
import { requireUser } from '../../plugins/auth.js';
import type { FileStorage } from '../../storage/index.js';
import { DuplicateDocumentError, type IngestionService } from './ingestion-service.js';
import { DocumentRepository } from './repository.js';

export interface DocumentRoutesOptions {
  db: Database;
  ingestion: IngestionService;
  storage: FileStorage;
}

export const documentRoutes: FastifyPluginAsyncZod<DocumentRoutesOptions> = async (app, { db, ingestion, storage }) => {
  const repo = new DocumentRepository(db);

  app.get(
    '/',
    {
      schema: {
        tags: ['documents'],
        summary: 'List ingested documents',
        querystring: ListDocumentsQuery,
        response: { 200: DocumentList },
      },
    },
    async (request) => ({ items: await repo.list(request.query) }),
  );

  app.get(
    '/:id',
    {
      schema: {
        tags: ['documents'],
        summary: 'Get a document with its chunks',
        params: IdParams,
        response: { 200: DocumentDetail, 404: ErrorResponse },
      },
    },
    async (request, reply) => {
      const document = await repo.getById(request.params.id);
      return document ?? reply.notFound('Document not found');
    },
  );

  app.post(
    '/',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['documents'],
        summary: 'Upload a Markdown or text file, then chunk and embed it',
        body: CreateDocument,
        response: {
          201: DocumentSummary,
          400: ErrorResponse,
          401: ErrorResponse,
          409: ErrorResponse,
          502: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      try {
        const id = await ingestion.ingestUpload(request.body, requireUser(request).id);
        return reply.status(201).send((await repo.getSummary(id))!);
      } catch (error) {
        if (error instanceof DuplicateDocumentError) return reply.conflict(error.message);
        throw error;
      }
    },
  );

  app.delete(
    '/:id',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['documents'],
        summary: 'Delete an upload you created, with its chunks and stored file',
        params: IdParams,
        response: { 204: z.null(), 401: ErrorResponse, 404: ErrorResponse },
      },
    },
    async (request, reply) => {
      const storageKey = await repo.deleteUpload(request.params.id, requireUser(request).id);
      if (storageKey === undefined) return reply.notFound('Document not found');
      await storage.delete(storageKey);
      return reply.status(204).send(null);
    },
  );
};
