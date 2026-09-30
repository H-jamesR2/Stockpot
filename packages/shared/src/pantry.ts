import { z } from 'zod';
import { IsoDate, UnitCode, Uuid } from './common.js';
import { IngredientRef } from './ingredient.js';

export const PantryLocation = z.enum(['fridge', 'freezer', 'pantry']);
export type PantryLocation = z.infer<typeof PantryLocation>;

export const PantryItem = z.object({
  id: Uuid,
  ingredient: IngredientRef,
  quantity: z.number(),
  unit: UnitCode,
  location: PantryLocation,
  purchasedAt: IsoDate,
  expiresAt: IsoDate.nullable(),
  /** Negative once expired. Null when the item has no expiry. */
  daysUntilExpiry: z.number().int().nullable(),
  notes: z.string().nullable(),
});
export type PantryItem = z.infer<typeof PantryItem>;

export const CreatePantryItem = z.object({
  ingredientId: Uuid,
  quantity: z.number().positive(),
  /** Defaults to the ingredient's default unit. */
  unit: UnitCode.optional(),
  location: PantryLocation.default('pantry'),
  /** Defaults to today. */
  purchasedAt: IsoDate.optional(),
  /**
   * Omit to estimate from the ingredient's shelf life.
   * Send null to record an item with no expiry.
   */
  expiresAt: IsoDate.nullable().optional(),
  notes: z.string().trim().max(500).optional(),
});
export type CreatePantryItem = z.infer<typeof CreatePantryItem>;

export const UpdatePantryItem = z
  .object({
    quantity: z.number().positive(),
    unit: UnitCode,
    location: PantryLocation,
    purchasedAt: IsoDate,
    expiresAt: IsoDate.nullable(),
    notes: z.string().trim().max(500).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'At least one field is required');
export type UpdatePantryItem = z.infer<typeof UpdatePantryItem>;

export const ListPantryQuery = z.object({
  location: PantryLocation.optional(),
  /** Include items expiring within this many days, already expired items included. */
  expiringWithinDays: z.coerce.number().int().min(0).max(365).optional(),
});
export type ListPantryQuery = z.infer<typeof ListPantryQuery>;

export const PantryList = z.object({ items: z.array(PantryItem) });
export type PantryList = z.infer<typeof PantryList>;
