import { z } from 'zod';
import { Slug, Uuid } from './common.js';
import { DocumentKind } from './document.js';

export const AskRequest = z.object({
  question: z.string().trim().min(1).max(500),
  kind: DocumentKind.optional(),
});
export type AskRequest = z.infer<typeof AskRequest>;

/** A retrieved chunk given to the model, numbered the way the answer cites it. */
export const AskSource = z.object({
  n: z.number().int().min(1),
  chunkId: Uuid,
  documentId: Uuid,
  documentTitle: z.string(),
  documentKind: DocumentKind,
  recipeSlug: Slug.nullable(),
  headings: z.array(z.string()),
  content: z.string(),
  vectorDistance: z.number(),
});
export type AskSource = z.infer<typeof AskSource>;

export const AskResult = z.object({
  /** Final text with citations that pointed at no source removed. Replaces the streamed text. */
  answer: z.string(),
  /** True when nothing relevant was found or the model said the sources do not answer the question. */
  declined: z.boolean(),
  /** True when the answer cites at least one source. An undeclined answer with no citations is not grounded. */
  grounded: z.boolean(),
  /** Source numbers the answer cites, in order of first use. */
  citations: z.array(z.number().int()),
  /** Numbers the model cited that matched no source. They are removed from answer. */
  invalidCitations: z.array(z.number().int()),
  model: z.string(),
  elapsedMs: z.number().int(),
});
export type AskResult = z.infer<typeof AskResult>;

/** POST /ask streams these as Server-Sent Events, with the event name equal to type. */
export const AskEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('sources'), sources: z.array(AskSource) }),
  z.object({ type: z.literal('token'), text: z.string() }),
  z.object({ type: z.literal('done'), result: AskResult }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type AskEvent = z.infer<typeof AskEvent>;
