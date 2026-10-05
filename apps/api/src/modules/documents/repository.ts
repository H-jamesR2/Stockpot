import type { DocumentChunk, DocumentDetail, DocumentSummary, ListDocumentsQuery } from '@stockpot/shared';
import { sql } from 'kysely';
import type { Database } from '../../db/index.js';

interface SummaryRow {
  id: string;
  kind: DocumentSummary['kind'];
  title: string;
  recipe_slug: string | null;
  content_type: string;
  byte_size: number;
  chunk_count: number;
  embedding_model: string | null;
  ingested_at: Date | null;
  created_at: Date;
}

function toSummary(row: SummaryRow): DocumentSummary {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    recipeSlug: row.recipe_slug,
    contentType: row.content_type,
    byteSize: row.byte_size,
    chunkCount: row.chunk_count,
    embeddingModel: row.embedding_model,
    ingestedAt: row.ingested_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

export class DocumentRepository {
  constructor(private readonly db: Database) {}

  private summaries() {
    return this.db
      .selectFrom('documents as d')
      .leftJoin('recipes as r', 'r.id', 'd.recipe_id')
      .select([
        'd.id',
        'd.kind',
        'd.title',
        'r.slug as recipe_slug',
        'd.content_type',
        'd.byte_size',
        'd.ingested_at',
        'd.created_at',
        sql<number>`(select count(*)::int from chunks c where c.document_id = d.id)`.as('chunk_count'),
        // A document's chunks share one model unless a re-embed is half done. Show the newest.
        sql<string | null>`(select max(c.embedding_model) from chunks c where c.document_id = d.id)`.as(
          'embedding_model',
        ),
      ]);
  }

  async list(query: ListDocumentsQuery): Promise<DocumentSummary[]> {
    let q = this.summaries().orderBy('d.kind').orderBy('d.title');
    if (query.kind) q = q.where('d.kind', '=', query.kind);
    return (await q.execute()).map(toSummary);
  }

  async getSummary(id: string): Promise<DocumentSummary | undefined> {
    const row = await this.summaries().where('d.id', '=', id).executeTakeFirst();
    return row && toSummary(row);
  }

  async getById(id: string): Promise<DocumentDetail | undefined> {
    const summary = await this.getSummary(id);
    if (!summary) return undefined;
    const chunks = await this.db
      .selectFrom('chunks')
      .select(['id', 'position', 'content', 'token_count', 'metadata'])
      .where('document_id', '=', id)
      .orderBy('position')
      .execute();
    return {
      ...summary,
      chunks: chunks.map((c): DocumentChunk => ({
        id: c.id,
        position: c.position,
        content: c.content,
        tokenCount: c.token_count,
        headings: Array.isArray(c.metadata['headings']) ? (c.metadata['headings'] as string[]) : [],
      })),
    };
  }

  /** Deletes an upload the user created. Returns its storage key, or undefined when there is no such upload. */
  async deleteUpload(id: string, userId: string): Promise<string | undefined> {
    const row = await this.db
      .deleteFrom('documents')
      .where('id', '=', id)
      .where('created_by', '=', userId)
      .where('recipe_id', 'is', null)
      .returning('storage_key')
      .executeTakeFirst();
    return row?.storage_key ?? undefined;
  }
}
