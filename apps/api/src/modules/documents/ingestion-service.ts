import { createHash, randomUUID } from 'node:crypto';
import type { CreateDocument } from '@stockpot/shared';
import type { Database } from '../../db/index.js';
import type { LlmProvider } from '../../llm/index.js';
import type { FileStorage } from '../../storage/index.js';
import { RecipeRepository } from '../recipes/repository.js';
import { chunkMarkdown, type TextChunk } from './chunker.js';
import { renderRecipe } from './render-recipe.js';

/** Keeps each embedding request small enough to finish well inside the provider timeout on a CPU. */
const EMBED_BATCH_SIZE = 16;

export class DuplicateDocumentError extends Error {
  constructor(readonly existingTitle: string) {
    super(`This file was already uploaded as "${existingTitle}"`);
    this.name = 'DuplicateDocumentError';
  }
}

export interface RecipeSyncResult {
  ingested: number;
  unchanged: number;
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function toVectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

function contentTypeFor(filename: string): string {
  return /\.(md|markdown)$/i.test(filename) ? 'text/markdown' : 'text/plain';
}

/**
 * Turns text into embedded chunks. Embedding is slow on a CPU, so it always happens before any
 * transaction opens. A failure leaves nothing behind in the database or in file storage.
 */
export class IngestionService {
  constructor(
    private readonly db: Database,
    private readonly llm: LlmProvider,
    private readonly storage: FileStorage,
  ) {}

  async ingestUpload(input: CreateDocument, userId: string): Promise<string> {
    const hash = sha256(input.content);
    const duplicate = await this.db
      .selectFrom('documents')
      .select('title')
      .where('content_hash', '=', hash)
      .where('recipe_id', 'is', null)
      .executeTakeFirst();
    if (duplicate) throw new DuplicateDocumentError(duplicate.title);

    const chunks = chunkMarkdown(input.content, input.title);
    const vectors = await this.embed(chunks);

    const id = randomUUID();
    const contentType = contentTypeFor(input.filename);
    const storageKey = `documents/${id}${contentType === 'text/markdown' ? '.md' : '.txt'}`;
    const bytes = Buffer.from(input.content, 'utf8');
    await this.storage.put(storageKey, bytes);

    try {
      await this.db.transaction().execute(async (trx) => {
        await trx
          .insertInto('documents')
          .values({
            id,
            kind: input.kind,
            title: input.title,
            storage_key: storageKey,
            content_type: contentType,
            byte_size: bytes.byteLength,
            content_hash: hash,
            ingested_at: new Date(),
            created_by: userId,
          })
          .execute();
        await this.insertChunks(trx, id, chunks, vectors);
      });
    } catch (error) {
      await this.storage.delete(storageKey);
      throw error;
    }
    return id;
  }

  /** Renders every recipe and re-embeds only the ones whose text changed since the last sync. */
  async syncRecipes(): Promise<RecipeSyncResult> {
    const recipes = new RecipeRepository(this.db);
    const slugs = await this.db.selectFrom('recipes').select('slug').orderBy('slug').execute();
    const result: RecipeSyncResult = { ingested: 0, unchanged: 0 };

    for (const { slug } of slugs) {
      const recipe = await recipes.getBySlug(slug);
      if (!recipe) continue;
      const text = renderRecipe(recipe);
      const hash = sha256(text);
      const existing = await this.db
        .selectFrom('documents')
        .select(['id', 'content_hash', 'ingested_at'])
        .where('recipe_id', '=', recipe.id)
        .executeTakeFirst();
      if (existing && existing.content_hash === hash && existing.ingested_at) {
        result.unchanged++;
        continue;
      }

      const chunks = chunkMarkdown(text, recipe.title);
      const vectors = await this.embed(chunks);
      await this.db.transaction().execute(async (trx) => {
        const values = {
          kind: 'recipe' as const,
          title: recipe.title,
          recipe_id: recipe.id,
          content_type: 'text/markdown',
          byte_size: Buffer.byteLength(text, 'utf8'),
          content_hash: hash,
          ingested_at: new Date(),
        };
        let documentId = existing?.id;
        if (documentId) {
          await trx.updateTable('documents').set(values).where('id', '=', documentId).execute();
          await trx.deleteFrom('chunks').where('document_id', '=', documentId).execute();
        } else {
          documentId = (await trx.insertInto('documents').values(values).returning('id').executeTakeFirstOrThrow()).id;
        }
        await this.insertChunks(trx, documentId, chunks, vectors);
      });
      result.ingested++;
    }
    return result;
  }

  /** Embeds chunks that have no embedding or were embedded by a different model. Returns how many changed. */
  async reembedStale(): Promise<number> {
    let updated = 0;
    for (;;) {
      const batch = await this.db
        .selectFrom('chunks')
        .select(['id', 'content'])
        .where((eb) => eb.or([eb('embedding_model', 'is', null), eb('embedding_model', '!=', this.llm.embeddingModel)]))
        .orderBy('id')
        .limit(EMBED_BATCH_SIZE)
        .execute();
      if (batch.length === 0) return updated;

      const vectors = await this.llm.embed(
        batch.map((c) => c.content),
        'document',
      );
      await this.db.transaction().execute(async (trx) => {
        for (const [index, chunk] of batch.entries()) {
          await trx
            .updateTable('chunks')
            .set({ embedding: toVectorLiteral(vectors[index]!), embedding_model: this.llm.embeddingModel })
            .where('id', '=', chunk.id)
            .execute();
        }
      });
      updated += batch.length;
    }
  }

  private async embed(chunks: TextChunk[]): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let start = 0; start < chunks.length; start += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(start, start + EMBED_BATCH_SIZE).map((c) => c.content);
      vectors.push(...(await this.llm.embed(batch, 'document')));
    }
    return vectors;
  }

  private async insertChunks(trx: Database, documentId: string, chunks: TextChunk[], vectors: number[][]) {
    if (chunks.length === 0) return;
    await trx
      .insertInto('chunks')
      .values(
        chunks.map((chunk, position) => ({
          document_id: documentId,
          position,
          content: chunk.content,
          token_count: chunk.tokenCount,
          embedding: toVectorLiteral(vectors[position]!),
          embedding_model: this.llm.embeddingModel,
          metadata: { headings: chunk.headings },
        })),
      )
      .execute();
  }
}
