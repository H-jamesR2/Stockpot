import { sql } from 'kysely';
import { beforeEach, describe, expect, inject, it } from 'vitest';
import { runSeed } from './db-utils.js';
import { useTestApp } from './helpers.js';

describe('dev catalog seed', () => {
  const ctx = useTestApp();

  beforeEach(async () => {
    await runSeed(inject('databaseUrl'), 'dev_seed.sql');
  });

  it('resolves "green onions" to scallion without ambiguity', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/ingredients/resolve?q=green%20onions' });
    const body = res.json();
    expect(body.ambiguous).toBe(false);
    expect(body.matches[0].ingredient.slug).toBe('scallion');
  });

  it.each([
    ['pepper', ['bell-pepper', 'black-pepper']],
    ['coriander', ['cilantro', 'ground-coriander']],
  ])('flags "%s" as ambiguous between its two meanings', async (term, expected) => {
    const res = await ctx.app.inject({ method: 'GET', url: `/ingredients/resolve?q=${term}` });
    const body = res.json();
    expect(body.ambiguous).toBe(true);
    const slugs = body.matches.slice(0, 2).map((m: { ingredient: { slug: string } }) => m.ingredient.slug);
    expect(slugs.sort()).toEqual(expected);
  });

  it('shares no alias between ingredients except the intentional ones', async () => {
    const { rows } = await sql<{ alias: string }>`
      select alias from ingredient_aliases group by alias having count(*) > 1 order by alias
    `.execute(ctx.db);
    expect(rows.map((r) => r.alias)).toEqual(['coriander', 'pepper']);
  });

  it('cites a MyPlate Kitchen page and contributor for every recipe', async () => {
    const recipes = await ctx.db.selectFrom('recipes').select(['slug', 'source', 'source_url']).execute();
    expect(recipes.length).toBeGreaterThan(0);
    for (const recipe of recipes) {
      expect(recipe.source_url).toBe(`https://www.myplate.gov/recipes/${recipe.slug}`);
      expect(recipe.source).toMatch(/^USDA MyPlate Kitchen\. Recipe source: .+/);
    }
  });

  it('gives every recipe ingredient lines and steps', async () => {
    const { rows } = await sql<{ slug: string; lines: number; steps: number }>`
      select r.slug,
             (select count(*)::int from recipe_ingredients ri where ri.recipe_id = r.id) as lines,
             (select count(*)::int from recipe_steps rs where rs.recipe_id = r.id) as steps
      from recipes r
    `.execute(ctx.db);
    expect(rows.filter((r) => r.lines === 0 || r.steps === 0)).toEqual([]);
  });

  it('includes braises to filter by', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/recipes?method=braise' });
    const slugs = res.json().items.map((r: { slug: string }) => r.slug);
    expect(slugs).toContain('braised-chicken-thighs-spinach');
    expect(slugs.length).toBeGreaterThanOrEqual(3);
  });
});
