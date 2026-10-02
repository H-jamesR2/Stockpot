import type { CreatePantryItem, PantryItem, PantryLocation, UpdatePantryItem } from '@stockpot/shared';

/** How the user wants expiry handled. "estimate" lets the API use the ingredient's shelf life. */
export type ExpiryMode = 'estimate' | 'date' | 'none';

export interface PantryItemFormValue {
  quantity: number | null;
  unit: string;
  location: PantryLocation;
  /** Empty means today, decided by the API. */
  purchasedAt: string;
  expiryMode: ExpiryMode;
  expiresAt: string;
  notes: string;
}

export function emptyFormValue(): PantryItemFormValue {
  return {
    quantity: 1,
    unit: '',
    location: 'pantry',
    purchasedAt: '',
    expiryMode: 'estimate',
    expiresAt: '',
    notes: '',
  };
}

export function formValueFromItem(item: PantryItem): PantryItemFormValue {
  return {
    quantity: item.quantity,
    unit: item.unit,
    location: item.location,
    purchasedAt: item.purchasedAt,
    expiryMode: item.expiresAt ? 'date' : 'none',
    expiresAt: item.expiresAt ?? '',
    notes: item.notes ?? '',
  };
}

export function toCreateBody(ingredientId: string, value: PantryItemFormValue): CreatePantryItem {
  const body: CreatePantryItem = {
    ingredientId,
    quantity: value.quantity ?? 0,
    location: value.location,
  };
  if (value.unit) body.unit = value.unit;
  if (value.purchasedAt) body.purchasedAt = value.purchasedAt;
  if (value.expiryMode === 'none') body.expiresAt = null;
  if (value.expiryMode === 'date') body.expiresAt = value.expiresAt;
  const notes = value.notes.trim();
  if (notes) body.notes = notes;
  return body;
}

export function toUpdateBody(value: PantryItemFormValue): UpdatePantryItem {
  const body: UpdatePantryItem = {
    quantity: value.quantity ?? 0,
    unit: value.unit,
    location: value.location,
    expiresAt: value.expiryMode === 'date' ? value.expiresAt : null,
    notes: value.notes.trim() || null,
  };
  if (value.purchasedAt) body.purchasedAt = value.purchasedAt;
  return body;
}
