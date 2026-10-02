import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers.js';

describe('recipes', () => {
  const ctx = useTestApp();

  it('lists and filters recipes', async () => {
    const all = await ctx.app.inject({ method: 'GET', url: '/recipes' });
    expect(all.json().items).toHaveLength(2);

    const braises = await ctx.app.inject({ method: 'GET', url: '/recipes?method=braise' });
    expect(braises.json().items.map((r: { slug: string }) => r.slug)).toEqual(['red-wine-braised-chuck']);

    const withGinger = await ctx.app.inject({ method: 'GET', url: '/recipes?usesIngredient=ginger' });
    expect(withGinger.json().items.map((r: { slug: string }) => r.slug)).toEqual(['scallion-ginger-fried-rice']);
  });

  it('returns detail with ordered lines, steps, and unresolved lines as null ingredients', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/recipes/red-wine-braised-chuck' });
    expect(res.statusCode).toBe(200);
    const recipe = res.json();
    expect(recipe.totalMin).toBe(200);
    expect(recipe.ingredients.map((l: { position: number }) => l.position)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(recipe.ingredients[5]).toMatchObject({ ingredient: null, rawText: '1 cup dry red wine' });
    expect(recipe.steps).toHaveLength(3);
  });

  it('exposes the normalization review queue', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/recipes/review-queue' });
    expect(res.json().items).toEqual([
      expect.objectContaining({ recipeSlug: 'red-wine-braised-chuck', rawText: '1 cup dry red wine' }),
    ]);
  });

  it('ranks pantry matches by expiring items, then coverage', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/recipes/pantry-matches' });
    expect(res.statusCode).toBe(200);
    const [first, second] = res.json().items;

    expect(first.recipe.slug).toBe('scallion-ginger-fried-rice');
    expect(first).toMatchObject({ requiredCount: 6, haveCount: 5, expiringCount: 1, missing: ['ginger'] });

    // Salt "to taste" is not required. The unresolved wine counts as missing.
    expect(second.recipe.slug).toBe('red-wine-braised-chuck');
    expect(second).toMatchObject({ requiredCount: 5, haveCount: 2, expiringCount: 0 });
    expect(second.missing).toEqual(['1 cup dry red wine', 'carrot', 'yellow onion']);
  });

  it('assumes staple ingredients instead of counting them as missing', async () => {
    await ctx.db.updateTable('ingredients').set({ is_staple: true }).where('slug', '=', 'ginger').execute();

    const res = await ctx.app.inject({ method: 'GET', url: '/recipes/pantry-matches' });
    const friedRice = res
      .json()
      .items.find((m: { recipe: { slug: string } }) => m.recipe.slug === 'scallion-ginger-fried-rice');

    expect(friedRice).toMatchObject({
      requiredCount: 5,
      haveCount: 5,
      coverage: 1,
      missing: [],
      assumedStaples: ['ginger'],
    });
  });

  it('respects minCoverage', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/recipes/pantry-matches?minCoverage=0.5' });
    expect(res.json().items.map((m: { recipe: { slug: string } }) => m.recipe.slug)).toEqual([
      'scallion-ginger-fried-rice',
    ]);
  });
});
