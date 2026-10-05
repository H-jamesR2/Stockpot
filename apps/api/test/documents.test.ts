import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { IngestionService } from '../src/modules/documents/ingestion-service.js';
import { renderRecipe } from '../src/modules/documents/render-recipe.js';
import { RecipeRepository } from '../src/modules/recipes/repository.js';
import { LocalDiskStorage } from '../src/storage/local-disk-storage.js';
import { FakeLlmProvider } from './fake-llm.js';
import { useTestApp } from './helpers.js';

const braisingNotes = `# Braising

Braising cooks tough cuts slowly in a little liquid until the connective tissue melts.

## Liquids

Use stock, wine, or water. The liquid should come about a third of the way up the meat.

## Timing

Chuck roast needs about three hours at 300 F. Check that a fork slides in easily.
`;

const upload = (overrides: Record<string, unknown> = {}) => ({
  title: 'Braising notes',
  kind: 'technique',
  filename: 'braising.md',
  content: braisingNotes,
  ...overrides,
});

describe('documents', () => {
  const ctx = useTestApp();

  async function storedFiles(): Promise<string[]> {
    try {
      return await readdir(path.join(ctx.storageDir, 'documents'));
    } catch {
      return [];
    }
  }

  it('chunks, embeds, and stores an uploaded Markdown file', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/documents', payload: upload() });
    expect(res.statusCode).toBe(201);
    const doc = res.json();
    expect(doc).toMatchObject({
      kind: 'technique',
      title: 'Braising notes',
      recipeSlug: null,
      contentType: 'text/markdown',
      byteSize: Buffer.byteLength(braisingNotes),
      chunkCount: 3,
      embeddingModel: 'fake-embed',
    });
    expect(doc.ingestedAt).not.toBeNull();
    expect(ctx.llm.embedCalls.every((call) => call.purpose === 'document')).toBe(true);
    expect(await storedFiles()).toEqual([`${doc.id}.md`]);

    const detail = (await ctx.app.inject({ method: 'GET', url: `/documents/${doc.id}` })).json();
    expect(detail.chunks.map((c: { headings: string[] }) => c.headings)).toEqual([
      ['Braising'],
      ['Braising', 'Liquids'],
      ['Braising', 'Timing'],
    ]);
    expect(detail.chunks[2].content).toBe(
      'Braising notes > Braising > Timing\n\nChuck roast needs about three hours at 300 F. Check that a fork slides in easily.',
    );
  });

  it('rejects the same file uploaded twice', async () => {
    await ctx.app.inject({ method: 'POST', url: '/documents', payload: upload() });
    const again = await ctx.app.inject({ method: 'POST', url: '/documents', payload: upload({ title: 'Copy' }) });
    expect(again.statusCode).toBe(409);
    expect(again.json().message).toBe('This file was already uploaded as "Braising notes"');
  });

  it('validates the upload', async () => {
    const cases = [
      upload({ content: '   \n ' }),
      upload({ filename: 'notes.pdf' }),
      upload({ kind: 'recipe' }),
      upload({ title: '' }),
    ];
    for (const payload of cases) {
      const res = await ctx.app.inject({ method: 'POST', url: '/documents', payload });
      expect(res.statusCode, JSON.stringify(payload).slice(0, 60)).toBe(400);
    }
  });

  it('requires a user to upload', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/documents',
      payload: upload(),
      headers: { 'x-dev-user-email': 'nobody@stockpot.local' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('leaves nothing behind when the embedding model is down', async () => {
    ctx.llm.failEmbed = true;
    const res = await ctx.app.inject({ method: 'POST', url: '/documents', payload: upload() });
    expect(res.statusCode).toBe(502);
    expect(res.json().message).toContain('Could not reach Ollama');
    expect((await ctx.app.inject({ method: 'GET', url: '/documents' })).json().items).toEqual([]);
    expect(await storedFiles()).toEqual([]);
  });

  it('deletes an upload with its chunks and file, but only for its creator', async () => {
    const doc = (await ctx.app.inject({ method: 'POST', url: '/documents', payload: upload() })).json();

    await ctx.db.insertInto('users').values({ email: 'other@stockpot.local' }).execute();
    const otherUser = await ctx.app.inject({
      method: 'DELETE',
      url: `/documents/${doc.id}`,
      headers: { 'x-dev-user-email': 'other@stockpot.local' },
    });
    expect(otherUser.statusCode).toBe(404);

    const res = await ctx.app.inject({ method: 'DELETE', url: `/documents/${doc.id}` });
    expect(res.statusCode).toBe(204);
    expect((await ctx.app.inject({ method: 'GET', url: `/documents/${doc.id}` })).statusCode).toBe(404);
    expect(await ctx.db.selectFrom('chunks').select('id').execute()).toEqual([]);
    expect(await storedFiles()).toEqual([]);
  });

  describe('ingestion service', () => {
    const service = () => new IngestionService(ctx.db, ctx.llm, new LocalDiskStorage(ctx.storageDir));

    it('renders a recipe as Markdown with ingredients, steps, and source', async () => {
      const recipe = await new RecipeRepository(ctx.db).getBySlug('red-wine-braised-chuck');
      const text = renderRecipe(recipe!);
      expect(text).toContain('# Red Wine Braised Chuck');
      expect(text).toContain('Serves 4. Total time 200 minutes. Cuisine: french. Methods: sear, braise.');
      expect(text).toContain('## Ingredients\n\n- 3 lb beef chuck, cut into 3 pieces');
      expect(text).toContain('## Steps\n\n1. Season and sear the chuck on all sides, then remove.');
    });

    it('ingests every recipe once and skips unchanged ones on the next sync', async () => {
      expect(await service().syncRecipes()).toEqual({ ingested: 2, unchanged: 0 });
      const embedCallsAfterFirstSync = ctx.llm.embedCalls.length;

      expect(await service().syncRecipes()).toEqual({ ingested: 0, unchanged: 2 });
      expect(ctx.llm.embedCalls.length).toBe(embedCallsAfterFirstSync);

      const recipes = (await ctx.app.inject({ method: 'GET', url: '/documents?kind=recipe' })).json().items;
      expect(recipes.map((d: { recipeSlug: string }) => d.recipeSlug).sort()).toEqual([
        'red-wine-braised-chuck',
        'scallion-ginger-fried-rice',
      ]);
    });

    it('re-ingests a recipe whose text changed, keeping its document id', async () => {
      await service().syncRecipes();
      const before = await ctx.db.selectFrom('documents').select(['id', 'recipe_id']).execute();

      await ctx.db
        .updateTable('recipes')
        .set({ description: 'Now with more garlic.' })
        .where('slug', '=', 'red-wine-braised-chuck')
        .execute();
      expect(await service().syncRecipes()).toEqual({ ingested: 1, unchanged: 1 });

      const after = await ctx.db.selectFrom('documents').select(['id', 'recipe_id']).execute();
      expect(after.sort((a, b) => a.id.localeCompare(b.id))).toEqual(before.sort((a, b) => a.id.localeCompare(b.id)));
      const chunk = await ctx.db
        .selectFrom('chunks')
        .select('content')
        .where('content', 'like', '%more garlic%')
        .execute();
      expect(chunk).toHaveLength(1);
    });

    it('re-embeds chunks made by a different model and leaves current ones alone', async () => {
      await service().syncRecipes();
      const chunkCount = (await ctx.db.selectFrom('chunks').select('id').execute()).length;

      const newModel = new FakeLlmProvider('fake-embed-v2');
      const reembed = new IngestionService(ctx.db, newModel, new LocalDiskStorage(ctx.storageDir));
      expect(await reembed.reembedStale()).toBe(chunkCount);
      expect(await reembed.reembedStale()).toBe(0);

      const models = await ctx.db.selectFrom('chunks').select('embedding_model').distinct().execute();
      expect(models).toEqual([{ embedding_model: 'fake-embed-v2' }]);
    });
  });
});
