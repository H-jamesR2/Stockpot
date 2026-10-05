import { z } from 'zod';
import { Slug, Uuid } from './common.js';
import { DocumentKind } from './document.js';

export const SearchQuery = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(20).default(8),
  /** Most chunks to return from any one document, so one long recipe cannot crowd out the rest. */
  perDocument: z.coerce.number().int().min(1).max(5).default(1),
  kind: DocumentKind.optional(),
});
export type SearchQuery = z.infer<typeof SearchQuery>;

export const SearchResult = z.object({
  chunkId: Uuid,
  documentId: Uuid,
  documentTitle: z.string(),
  documentKind: DocumentKind,
  /** Set for recipe documents. */
  recipeSlug: Slug.nullable(),
  headings: z.array(z.string()),
  content: z.string(),
  /** Reciprocal rank fusion score. Higher is better. Only meaningful relative to other results. */
  score: z.number(),
  /** 1-based rank in vector search, or null when the chunk was not among the vector candidates. */
  vectorRank: z.number().int().nullable(),
  /** Cosine distance to the query (0 is identical, 2 is opposite), or null when vectorRank is null. */
  vectorDistance: z.number().nullable(),
  /** 1-based rank in full-text search, or null when no query word matched. */
  textRank: z.number().int().nullable(),
});
export type SearchResult = z.infer<typeof SearchResult>;

export const SearchResponse = z.object({
  query: z.string(),
  results: z.array(SearchResult),
});
export type SearchResponse = z.infer<typeof SearchResponse>;
