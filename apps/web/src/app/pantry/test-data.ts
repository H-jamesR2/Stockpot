import type { Ingredient, IngredientMatch, PantryItem } from '@stockpot/shared';

export const scallion: Ingredient = {
  id: '00000000-0000-4000-8000-000000000001',
  slug: 'scallion',
  canonicalName: 'scallion',
  category: 'produce',
  defaultUnit: 'each',
  shelfLifeDays: 7,
  isStaple: false,
};

export const blackPepper: Ingredient = {
  id: '00000000-0000-4000-8000-000000000002',
  slug: 'black-pepper',
  canonicalName: 'black pepper',
  category: 'spice',
  defaultUnit: 'tsp',
  shelfLifeDays: 730,
  isStaple: true,
};

export const bellPepper: Ingredient = {
  id: '00000000-0000-4000-8000-000000000003',
  slug: 'bell-pepper',
  canonicalName: 'bell pepper',
  category: 'produce',
  defaultUnit: 'each',
  shelfLifeDays: 10,
  isStaple: false,
};

export function match(ingredient: Ingredient, matchedAlias: string, exact = false): IngredientMatch {
  return { ingredient, matchedAlias, score: exact ? 1 : 0.6, exact };
}

export function pantryItem(overrides: Partial<PantryItem> = {}): PantryItem {
  return {
    id: '00000000-0000-4000-8000-0000000000aa',
    ingredient: { id: scallion.id, slug: scallion.slug, canonicalName: 'scallion', category: 'produce' },
    quantity: 6,
    unit: 'each',
    location: 'fridge',
    purchasedAt: '2026-09-27',
    expiresAt: '2026-10-04',
    daysUntilExpiry: 2,
    notes: null,
    ...overrides,
  };
}
