import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers.js';

describe('units', () => {
  const ctx = useTestApp();

  it('lists units grouped by kind, smallest first, ingredient-specific units last', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/units' });
    expect(res.statusCode).toBe(200);
    const codes = res.json().items.map((u: { code: string }) => u.code);

    expect(codes.slice(0, 4)).toEqual(['g', 'oz', 'lb', 'kg']);
    expect(codes.indexOf('tsp')).toBeLessThan(codes.indexOf('cup'));
    expect(codes.indexOf('dozen')).toBeLessThan(codes.indexOf('clove'));
    expect(res.json().items).toContainEqual({ code: 'clove', name: 'clove', kind: 'count' });
  });
});
