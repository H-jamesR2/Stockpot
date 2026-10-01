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
});
