import { z } from 'zod';
import { Slug, Uuid } from './common.js';

export const DocumentKind = z.enum(['recipe', 'technique', 'note']);
export type DocumentKind = z.infer<typeof DocumentKind>;

/** Recipes become documents through ingestion, so uploads are technique pages or notes. */
export const UploadKind = z.enum(['technique', 'note']);
export type UploadKind = z.infer<typeof UploadKind>;

/** Uploads are plain text, so the body stays JSON and well under Fastify's 1 MB default. */
export const MAX_UPLOAD_CHARS = 200_000;

export const CreateDocument = z.object({
  title: z.string().trim().min(1).max(200),
  kind: UploadKind,
  filename: z
    .string()
    .trim()
    .max(255)
    .regex(/\.(md|markdown|txt)$/i, 'Upload a .md, .markdown, or .txt file'),
  content: z
    .string()
    .max(MAX_UPLOAD_CHARS)
    .refine((text) => text.trim().length > 0, 'The file is empty'),
});
export type CreateDocument = z.infer<typeof CreateDocument>;

export const DocumentSummary = z.object({
  id: Uuid,
  kind: DocumentKind,
  title: z.string(),
  /** Set for recipe documents. */
  recipeSlug: Slug.nullable(),
  contentType: z.string(),
  byteSize: z.number().int(),
  chunkCount: z.number().int(),
  /** Null until embedded. */
  embeddingModel: z.string().nullable(),
  ingestedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type DocumentSummary = z.infer<typeof DocumentSummary>;

export const DocumentChunk = z.object({
  id: Uuid,
  position: z.number().int(),
  content: z.string(),
  tokenCount: z.number().int(),
  /** Heading path the chunk sits under, outermost first. */
  headings: z.array(z.string()),
});
export type DocumentChunk = z.infer<typeof DocumentChunk>;

export const DocumentDetail = DocumentSummary.extend({ chunks: z.array(DocumentChunk) });
export type DocumentDetail = z.infer<typeof DocumentDetail>;

export const ListDocumentsQuery = z.object({ kind: DocumentKind.optional() });
export type ListDocumentsQuery = z.infer<typeof ListDocumentsQuery>;

export const DocumentList = z.object({ items: z.array(DocumentSummary) });
export type DocumentList = z.infer<typeof DocumentList>;
