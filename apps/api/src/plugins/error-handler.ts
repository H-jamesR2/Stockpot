import { STATUS_CODES } from 'node:http';
import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';
import { pgErrorCode } from '../db/index.js';
import { LlmError } from '../llm/index.js';

// Postgres SQLSTATE codes we translate into client errors
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_UNIQUE_VIOLATION = '23505';
const PG_CHECK_VIOLATION = '23514';
const PG_INVALID_TEXT_REPRESENTATION = '22P02';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      const message = err.validation
        .map((v) => `${v.instancePath || '/'} ${v.message ?? 'is invalid'}`.trim())
        .join(', ');
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message });
    }

    if (isResponseSerializationError(err)) {
      // Our own response did not match its schema. That's a server bug, not a client error.
      request.log.error({ err, issues: err.cause.issues }, 'Response failed schema validation');
      return reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Internal error' });
    }

    if (err instanceof LlmError) {
      // The model server is down or misbehaving. Say so instead of hiding it behind a generic 500.
      request.log.error({ err }, 'Model provider failed');
      return reply.status(502).send({ statusCode: 502, error: 'Bad Gateway', message: err.message });
    }

    switch (pgErrorCode(err)) {
      case PG_FOREIGN_KEY_VIOLATION:
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'References an unknown value (check unit or ingredient)',
        });
      case PG_UNIQUE_VIOLATION:
        return reply.status(409).send({ statusCode: 409, error: 'Conflict', message: 'That record already exists' });
      case PG_CHECK_VIOLATION:
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Values violate a data rule (for example, expiry before purchase)',
        });
      case PG_INVALID_TEXT_REPRESENTATION:
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Malformed value' });
    }

    const statusCode = err.statusCode ?? 500;
    if (statusCode >= 500) {
      request.log.error({ err }, 'Unhandled error');
      return reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Internal error' });
    }
    return reply.status(statusCode).send({
      statusCode,
      error: STATUS_CODES[statusCode] ?? 'Error',
      message: err.message,
    });
  });
}
