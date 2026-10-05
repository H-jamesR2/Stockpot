import { beforeEach, describe, expect, it } from 'vitest';
import { IngestionService } from '../src/modules/documents/ingestion-service.js';
import { RRF_K } from '../src/modules/search/search-service.js';
import { LocalDiskStorage } from '../src/storage/local-disk-storage.js';
import { useTestApp } from './helpers.js';

const notes = {
  braising: `# Braising

## Cuts

Chuck roast and short ribs are tough cuts full of connective tissue. Braising melts it.

## Liquid

Pour stock or wine about a third of the way up the meat, then cover the pot.

## Time

Braise chuck roast for about three hours at 300 F, until a fork slides in easily.
`,
  knives: `# Knife skills

Keep your knife sharp. A dull knife slips and cuts fingers. Curl your fingertips when you dice an onion.
`,
  safety: `# Food safety

Refrigerate leftovers within two hours. Reheat soup until it boils. When in doubt, throw it out.
`,
};

interface Result {
  documentTitle: string;
  documentId: string;
  documentKind: string;
  headings: string[];
  score: number;
  vectorRank: number | null;
  textRank: number | null;
}

describe('search', () => {
  const ctx = useTestApp();

  beforeEach(async () => {
    const ingestion = new IngestionService(ctx.db, ctx.llm, new LocalDiskStorage(ctx.storageDir));
    const user = await ctx.db.selectFrom('users').select('id').executeTakeFirstOrThrow();
    for (const [name, content] of Object.entries(notes)) {
      const title = content.split('\n')[0]!.replace('# ', '');
      await ingestion.ingestUpload({ title, kind: 'technique', filename: `${name}.md`, content }, user.id);
    }
    await ingestion.syncRecipes();
    ctx.llm.embedCalls = [];
  });

  async function search(params: string): Promise<{ status: number; results: Result[] }> {
    const res = await ctx.app.inject({ method: 'GET', url: `/search?${params}` });
    return { status: res.statusCode, results: res.json().results };
  }

  it('ranks chunks found by both meaning and keywords above chunks found by only one', async () => {
    const { status, results } = await search('q=how long to braise chuck roast');
    expect(status).toBe(200);

    // The braising note and the braised chuck recipe both match. Their fused scores are close, so
    // the test checks the ranking rule instead of which of the two good answers comes first.
    const [first, second, ...rest] = results;
    expect([first!.documentTitle, second!.documentTitle].sort()).toEqual(['Braising', 'Red Wine Braised Chuck']);
    for (const top of [first!, second!]) {
      expect(top.vectorRank).not.toBeNull();
      expect(top.textRank).not.toBeNull();
      expect(top.score).toBeCloseTo(1 / (RRF_K + top.vectorRank!) + 1 / (RRF_K + top.textRank!), 5);
    }
    expect(results.find((r) => r.documentTitle === 'Braising')?.headings).toEqual(['Braising', 'Time']);
    for (const other of rest) expect(other.score).toBeLessThan(second!.score);
  });

  it('embeds the search text as a query, not a document', async () => {
    await search('q=sharp knife');
    expect(ctx.llm.embedCalls).toEqual([{ texts: ['sharp knife'], purpose: 'query' }]);
  });

  it('returns one chunk per document by default and more when asked', async () => {
    const one = await search('q=braise chuck roast stock pot&limit=20');
    const ids = one.results.map((r) => r.documentId);
    expect(new Set(ids).size).toBe(ids.length);

    const three = await search('q=braise chuck roast stock pot&limit=20&perDocument=3');
    const braising = three.results.filter((r) => r.documentTitle === 'Braising');
    expect(braising.length).toBeGreaterThan(1);
  });

  it('orders results by fused score', async () => {
    const { results } = await search('q=chuck&limit=20&perDocument=5');
    const scores = results.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('falls back to meaning alone when no query word survives full-text parsing', async () => {
    const { results } = await search('q=the and of');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.textRank === null && r.vectorRank !== null)).toBe(true);
  });

  it('ignores vectors from another embedding model but still matches their keywords', async () => {
    const knives = await ctx.db
      .selectFrom('documents')
      .select('id')
      .where('title', '=', 'Knife skills')
      .executeTakeFirstOrThrow();
    await ctx.db
      .updateTable('chunks')
      .set({ embedding_model: 'old-model' })
      .where('document_id', '=', knives.id)
      .execute();

    const { results } = await search('q=sharp knife fingertips&limit=20');
    const hit = results.find((r) => r.documentTitle === 'Knife skills');
    expect(hit).toMatchObject({ vectorRank: null });
    expect(hit!.textRank).not.toBeNull();
  });

  it('filters by document kind', async () => {
    const { results } = await search('q=chuck&kind=recipe&limit=20');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.documentKind === 'recipe')).toBe(true);
  });

  it.each(['q=', 'q=%20%20', 'q=chuck&limit=21', 'q=chuck&perDocument=0', 'q=chuck&kind=video'])(
    'rejects %s',
    async (params) => {
      expect((await search(params)).status).toBe(400);
    },
  );

  it('reports a model outage instead of returning keyword-only results', async () => {
    ctx.llm.failEmbed = true;
    const res = await ctx.app.inject({ method: 'GET', url: '/search?q=chuck' });
    expect(res.statusCode).toBe(502);
  });
});
