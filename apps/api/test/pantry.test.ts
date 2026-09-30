import { describe, expect, it } from 'vitest';
import { dbDatePlus, ingredientId, useTestApp } from './helpers.js';

describe('pantry', () => {
  const ctx = useTestApp();

  it('lists the seeded pantry with soonest expiry first', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/pantry' });
    expect(res.statusCode).toBe(200);
    const items = res.json().items;
    expect(items).toHaveLength(6);
    expect(items[0].ingredient.slug).toBe('scallion');
    expect(items[0].daysUntilExpiry).toBe(2);
  });

  it('filters to items expiring soon', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/pantry?expiringWithinDays=3' });
    expect(res.json().items.map((i: { ingredient: { slug: string } }) => i.ingredient.slug)).toEqual(['scallion']);
  });

  it('defaults unit and expiry from the ingredient on create', async () => {
    const carrot = await ingredientId(ctx.db, 'carrot');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/pantry',
      payload: { ingredientId: carrot, quantity: 3, location: 'fridge' },
    });
    expect(res.statusCode).toBe(201);
    const item = res.json();
    expect(item.unit).toBe('each');
    expect(item.expiresAt).toBe(await dbDatePlus(ctx.db, 21));
    expect(item.daysUntilExpiry).toBe(21);
  });

  it('allows an explicit null expiry', async () => {
    const salt = await ingredientId(ctx.db, 'kosher-salt');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/pantry',
      payload: { ingredientId: salt, quantity: 500, unit: 'g', expiresAt: null },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().expiresAt).toBeNull();
  });

  it('rejects unknown units and ingredients with 400', async () => {
    const carrot = await ingredientId(ctx.db, 'carrot');
    const badUnit = await ctx.app.inject({
      method: 'POST',
      url: '/pantry',
      payload: { ingredientId: carrot, quantity: 1, unit: 'furlong' },
    });
    expect(badUnit.statusCode).toBe(400);

    const badIngredient = await ctx.app.inject({
      method: 'POST',
      url: '/pantry',
      payload: { ingredientId: '00000000-0000-4000-8000-000000000000', quantity: 1 },
    });
    expect(badIngredient.statusCode).toBe(400);
  });

  it('rejects an expiry before the purchase date', async () => {
    const carrot = await ingredientId(ctx.db, 'carrot');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/pantry',
      payload: { ingredientId: carrot, quantity: 1, purchasedAt: '2026-09-10', expiresAt: '2026-09-01' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('updates and deletes an item', async () => {
    const [first] = (await ctx.app.inject({ method: 'GET', url: '/pantry' })).json().items;

    const patched = await ctx.app.inject({
      method: 'PATCH',
      url: `/pantry/${first.id}`,
      payload: { quantity: 2, location: 'freezer' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({ quantity: 2, location: 'freezer' });

    const deleted = await ctx.app.inject({ method: 'DELETE', url: `/pantry/${first.id}` });
    expect(deleted.statusCode).toBe(204);

    const gone = await ctx.app.inject({ method: 'GET', url: `/pantry/${first.id}` });
    expect(gone.statusCode).toBe(404);
  });

  it("rejects an empty patch and keeps users' pantries separate", async () => {
    const [first] = (await ctx.app.inject({ method: 'GET', url: '/pantry' })).json().items;

    const empty = await ctx.app.inject({ method: 'PATCH', url: `/pantry/${first.id}`, payload: {} });
    expect(empty.statusCode).toBe(400);

    await ctx.db.insertInto('users').values({ email: 'other@stockpot.local' }).execute();
    const other = { 'x-dev-user-email': 'other@stockpot.local' };
    const list = await ctx.app.inject({ method: 'GET', url: '/pantry', headers: other });
    expect(list.json().items).toEqual([]);
    const steal = await ctx.app.inject({ method: 'DELETE', url: `/pantry/${first.id}`, headers: other });
    expect(steal.statusCode).toBe(404);
  });

  it('returns 401 for an unknown user', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/pantry',
      headers: { 'x-dev-user-email': 'nobody@stockpot.local' },
    });
    expect(res.statusCode).toBe(401);
  });
});
