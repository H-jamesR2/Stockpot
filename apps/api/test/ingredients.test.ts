import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers.js';

describe('ingredients', () => {
  const ctx = useTestApp();

  it('reports healthy', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', database: 'ok' });
  });

  it('resolves a plural, differently cased alias to the canonical ingredient', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/ingredients/resolve?q=Green%20Onions' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ambiguous).toBe(false);
    expect(body.matches[0].ingredient.slug).toBe('scallion');
    expect(body.matches[0].matchedAlias).toBe('green onion');
  });

  it('tolerates typos', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/ingredients/resolve?q=scalion' });
    expect(res.json().matches[0].ingredient.slug).toBe('scallion');
  });

  it('flags ambiguous terms instead of guessing', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/ingredients/resolve?q=pepper' });
    const body = res.json();
    expect(body.ambiguous).toBe(true);
    const slugs = body.matches.slice(0, 2).map((m: { ingredient: { slug: string } }) => m.ingredient.slug);
    expect(slugs.sort()).toEqual(['bell-pepper', 'black-pepper']);
  });

  it('lists each ingredient once even when several aliases match', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/ingredients/resolve?q=pepper&limit=10' });
    const ids = res.json().matches.map((m: { ingredient: { id: string } }) => m.ingredient.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rejects an empty query', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/ingredients/resolve?q=%20%20' });
    expect(res.statusCode).toBe(400);
  });

  it('filters the list by category and 404s unknown slugs', async () => {
    const list = await ctx.app.inject({ method: 'GET', url: '/ingredients?category=dairy' });
    expect(list.json().items.map((i: { slug: string }) => i.slug).sort()).toEqual(['unsalted-butter', 'whole-milk']);

    const missing = await ctx.app.inject({ method: 'GET', url: '/ingredients/unobtainium' });
    expect(missing.statusCode).toBe(404);
  });
});
