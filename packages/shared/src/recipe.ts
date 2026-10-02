import { z } from 'zod';
import { Pagination, Slug, UnitCode, Uuid } from './common.js';
import { IngredientRef } from './ingredient.js';

export const RecipeSummary = z.object({
  id: Uuid,
  slug: Slug,
  title: z.string(),
  description: z.string().nullable(),
  servings: z.number().int(),
  prepMin: z.number().int().nullable(),
  cookMin: z.number().int().nullable(),
  totalMin: z.number().int().nullable(),
  cuisine: z.string().nullable(),
  methods: z.array(z.string()),
});
export type RecipeSummary = z.infer<typeof RecipeSummary>;

export const RecipeIngredientLine = z.object({
  position: z.number().int(),
  /** Null when normalization could not resolve rawText. */
  ingredient: IngredientRef.nullable(),
  quantity: z.number().nullable(),
  unit: UnitCode.nullable(),
  preparation: z.string().nullable(),
  rawText: z.string(),
  isOptional: z.boolean(),
});
export type RecipeIngredientLine = z.infer<typeof RecipeIngredientLine>;

export const RecipeStep = z.object({
  stepNumber: z.number().int(),
  text: z.string(),
});

export const RecipeDetail = RecipeSummary.extend({
  source: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  ingredients: z.array(RecipeIngredientLine),
  steps: z.array(RecipeStep),
});
export type RecipeDetail = z.infer<typeof RecipeDetail>;

export const ListRecipesQuery = Pagination.extend({
  q: z.string().trim().min(1).max(100).optional(),
  cuisine: z.string().trim().min(1).optional(),
  method: z.string().trim().min(1).optional(),
  /** Ingredient slug the recipe must use. */
  usesIngredient: Slug.optional(),
});
export type ListRecipesQuery = z.infer<typeof ListRecipesQuery>;

export const RecipeList = z.object({ items: z.array(RecipeSummary) });
export type RecipeList = z.infer<typeof RecipeList>;

export const ReviewQueueItem = z.object({
  recipeId: Uuid,
  recipeSlug: Slug,
  recipeTitle: z.string(),
  position: z.number().int(),
  rawText: z.string(),
});
export const ReviewQueue = z.object({ items: z.array(ReviewQueueItem) });
export type ReviewQueue = z.infer<typeof ReviewQueue>;

export const PantryMatchesQuery = z.object({
  /** Pantry items expiring within this window count toward "use it up" ranking. */
  expiringWithinDays: z.coerce.number().int().min(0).max(30).default(3),
  minCoverage: z.coerce.number().min(0).max(1).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type PantryMatchesQuery = z.infer<typeof PantryMatchesQuery>;

export const PantryMatch = z.object({
  recipe: RecipeSummary,
  requiredCount: z.number().int(),
  haveCount: z.number().int(),
  /** haveCount / requiredCount, from 0 to 1. */
  coverage: z.number(),
  /** Required ingredients you have that expire soon. */
  expiringCount: z.number().int(),
  missing: z.array(z.string()),
  /** Staple ingredients the recipe uses that were assumed rather than counted, sorted by name. */
  assumedStaples: z.array(z.string()),
});
export type PantryMatch = z.infer<typeof PantryMatch>;

export const PantryMatches = z.object({ items: z.array(PantryMatch) });
export type PantryMatches = z.infer<typeof PantryMatches>;
