import { AskRequest, type AskEvent, ErrorResponse } from '@stockpot/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { LlmError } from '../../llm/index.js';
import type { AnswerService } from './answer-service.js';

function sse(event: AskEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export const askRoutes: FastifyPluginAsyncZod<{ answers: AnswerService }> = async (app, { answers }) => {
  app.post(
    '/',
    {
      schema: {
        tags: ['ask'],
        summary: 'Answer a question from the documents, streamed as Server-Sent Events (sources, token, done, error)',
        body: AskRequest,
        response: { 400: ErrorResponse },
      },
    },
    async (request, reply) => {
      // Local models take a minute or more, so stop generating if the client goes away.
      const controller = new AbortController();
      reply.raw.on('close', () => {
        if (!reply.raw.writableFinished) controller.abort();
      });

      // hijack() skips Fastify's reply pipeline, so carry over headers plugins already set (CORS).
      const headers = Object.fromEntries(
        Object.entries(reply.getHeaders()).filter(
          (entry): entry is [string, string | number | string[]] => entry[1] !== undefined,
        ),
      );
      reply.hijack();
      reply.raw.writeHead(200, {
        ...headers,
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });

      try {
        for await (const event of answers.ask(request.body, controller.signal)) {
          reply.raw.write(sse(event));
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          request.log.error({ err: error }, 'Answer failed');
          const message = error instanceof LlmError ? error.message : 'Could not finish the answer.';
          reply.raw.write(sse({ type: 'error', message }));
        }
      } finally {
        reply.raw.end();
      }
    },
  );
};
