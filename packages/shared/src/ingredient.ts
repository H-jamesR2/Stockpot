import { z } from 'zod';
import { Pagination, Slug, UnitCode, Uuid } from './common.js';

export const IngredientCategory = z.enum([
  'produce',
  'herb',
  'spice',
  'protein',
  'seafood',
  'dairy',
  'egg',
  'grain',
  'legume',
  'nut_seed',
  'baking',
  'oil_fat',
  'condiment',
  'beverage',
  'other',
]);
export type IngredientCategory = z.infer<typeof IngredientCategory>;

export const Ingredient = z.object({
  id: Uuid,
  slug: Slug,
  canonicalName: z.string(),
  category: IngredientCategory,
  defaultUnit: UnitCode,
  shelfLifeDays: z.number().int().nullable(),
});
export type Ingredient = z.infer<typeof Ingredient>;

/** The compact form embedded in pantry items and recipe lines. */
export const IngredientRef = Ingredient.pick({
  id: true,
  slug: true,
  canonicalName: true,
  category: true,
});
export type IngredientRef = z.infer<typeof IngredientRef>;

export const ListIngredientsQuery = Pagination.extend({
  category: IngredientCategory.optional(),
});
export type ListIngredientsQuery = z.infer<typeof ListIngredientsQuery>;

export const ResolveIngredientQuery = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});
export type ResolveIngredientQuery = z.infer<typeof ResolveIngredientQuery>;

export const IngredientMatch = z.object({
  ingredient: Ingredient,
  matchedAlias: z.string(),
  score: z.number(),
  exact: z.boolean(),
});
export type IngredientMatch = z.infer<typeof IngredientMatch>;

export const ResolveIngredientResponse = z.object({
  query: z.string(),
  /** True when the top matches are too close to pick one automatically ("pepper"). */
  ambiguous: z.boolean(),
  matches: z.array(IngredientMatch),
});
export type ResolveIngredientResponse = z.infer<typeof ResolveIngredientResponse>;
