import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers.js';

const DIMENSIONS = 768;

/** A unit vector pointing along one axis, so cosine distances are easy to reason about. */
function axis(index: number, dimensions = DIMENSIONS): string {
  return `[${Array.from({ length: dimensions }, (_, i) => (i === index ? 1 : 0)).join(',')}]`;
}

describe('documents and chunks schema', () => {
  const ctx = useTestApp();

  async function insertNote(title = 'Braising notes') {
    return ctx.db
      .insertInto('documents')
      .values({
        kind: 'note',
        title,
        storage_key: `documents/${title}.md`,
        content_type: 'text/markdown',
        byte_size: 100,
        content_hash: 'abc123',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
  }

  async function insertChunk(documentId: string, position: number, content: string, embedding: string | null) {
    return ctx.db
      .insertInto('chunks')
      .values({
        document_id: documentId,
        position,
        content,
        token_count: 10,
        embedding,
        embedding_model: embedding ? 'nomic-embed-text' : null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
  }

  it('stores chunks with an embedding and a generated full-text vector', async () => {
    const doc = await insertNote();
    await insertChunk(doc.id, 0, 'Braise chuck slowly in stock until tender.', axis(0));

    const { rows } = await sql<{ matches: boolean; lexemes: string }>`
      select tsv @@ plainto_tsquery('english', 'braising tender') as matches, tsv::text as lexemes
      from chunks
    `.execute(ctx.db);
    expect(rows[0]?.matches).toBe(true);
    expect(rows[0]?.lexemes).toContain("'brais'");
  });

  it('orders chunks by cosine distance to a query vector', async () => {
    const doc = await insertNote();
    await insertChunk(doc.id, 0, 'about searing', axis(0));
    await insertChunk(doc.id, 1, 'about braising', axis(1));
    await insertChunk(doc.id, 2, 'not embedded yet', null);

    const { rows } = await sql<{ content: string; distance: number }>`
      select content, embedding <=> ${axis(1)}::vector as distance
      from chunks where embedding is not null
      order by distance limit 2
    `.execute(ctx.db);
    expect(rows.map((r) => r.content)).toEqual(['about braising', 'about searing']);
    expect(rows[0]?.distance).toBeCloseTo(0);
    expect(rows[1]?.distance).toBeCloseTo(1);
  });

  it('rejects an embedding with the wrong number of dimensions', async () => {
    const doc = await insertNote();
    await expect(insertChunk(doc.id, 0, 'too short', axis(0, 3))).rejects.toThrow(/expected 768 dimensions/);
  });

  it('requires an embedding model whenever there is an embedding', async () => {
    const doc = await insertNote();
    const insert = ctx.db
      .insertInto('chunks')
      .values({ document_id: doc.id, position: 0, content: 'x', token_count: 1, embedding: axis(0) })
      .execute();
    await expect(insert).rejects.toThrow(/check constraint/);
  });

  it('ties recipe documents to a recipe and nothing else', async () => {
    const recipe = await ctx.db
      .selectFrom('recipes')
      .select('id')
      .where('slug', '=', 'red-wine-braised-chuck')
      .executeTakeFirstOrThrow();
    const base = { title: 'Red Wine Braised Chuck', content_type: 'text/plain', byte_size: 1, content_hash: 'h' };

    await expect(
      ctx.db
        .insertInto('documents')
        .values({ ...base, kind: 'recipe' })
        .execute(),
    ).rejects.toThrow(/check constraint/);
    await expect(
      ctx.db
        .insertInto('documents')
        .values({ ...base, kind: 'note', recipe_id: recipe.id })
        .execute(),
    ).rejects.toThrow(/check constraint/);
    await ctx.db
      .insertInto('documents')
      .values({ ...base, kind: 'recipe', recipe_id: recipe.id })
      .execute();
  });

  it('removes chunks with their document, and recipe documents with their recipe', async () => {
    const note = await insertNote();
    await insertChunk(note.id, 0, 'goes away', null);
    await ctx.db.deleteFrom('documents').where('id', '=', note.id).execute();

    const recipe = await ctx.db
      .selectFrom('recipes')
      .select('id')
      .where('slug', '=', 'red-wine-braised-chuck')
      .executeTakeFirstOrThrow();
    const recipeDoc = await ctx.db
      .insertInto('documents')
      .values({
        kind: 'recipe',
        recipe_id: recipe.id,
        title: 'Red Wine Braised Chuck',
        content_type: 'text/plain',
        byte_size: 1,
        content_hash: 'h',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await insertChunk(recipeDoc.id, 0, 'recipe text', null);
    await ctx.db.deleteFrom('recipes').where('id', '=', recipe.id).execute();

    const counts = await sql<{ documents: number; chunks: number }>`
      select (select count(*)::int from documents) as documents, (select count(*)::int from chunks) as chunks
    `.execute(ctx.db);
    expect(counts.rows[0]).toEqual({ documents: 0, chunks: 0 });
  });
});
