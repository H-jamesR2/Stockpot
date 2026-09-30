import type { CreatePantryItem, ListPantryQuery, PantryItem, PantryLocation, UpdatePantryItem } from '@stockpot/shared';
import { sql, type Updateable } from 'kysely';
import type { Database } from '../../db/index.js';
import type { IngredientCategory, PantryItemsTable } from '../../db/types.js';

interface PantryRow {
  id: string;
  quantity: number;
  unit: string;
  location: PantryLocation;
  purchased_at: string;
  expires_at: string | null;
  days_until_expiry: number | null;
  notes: string | null;
  ingredient_id: string;
  ingredient_slug: string;
  ingredient_name: string;
  ingredient_category: IngredientCategory;
}

function toPantryItem(row: PantryRow): PantryItem {
  return {
    id: row.id,
    ingredient: {
      id: row.ingredient_id,
      slug: row.ingredient_slug,
      canonicalName: row.ingredient_name,
      category: row.ingredient_category,
    },
    quantity: row.quantity,
    unit: row.unit,
    location: row.location,
    purchasedAt: row.purchased_at,
    expiresAt: row.expires_at,
    daysUntilExpiry: row.days_until_expiry,
    notes: row.notes,
  };
}

export class PantryRepository {
  constructor(private readonly db: Database) {}

  private baseQuery(userId: string) {
    return this.db
      .selectFrom('pantry_items as p')
      .innerJoin('ingredients as i', 'i.id', 'p.ingredient_id')
      .select([
        'p.id',
        'p.quantity',
        'p.unit',
        'p.location',
        'p.purchased_at',
        'p.expires_at',
        sql<number | null>`p.expires_at - current_date`.as('days_until_expiry'),
        'p.notes',
        'i.id as ingredient_id',
        'i.slug as ingredient_slug',
        'i.canonical_name as ingredient_name',
        'i.category as ingredient_category',
      ])
      .where('p.user_id', '=', userId);
  }

  async list(userId: string, query: ListPantryQuery): Promise<PantryItem[]> {
    let q = this.baseQuery(userId);
    if (query.location) q = q.where('p.location', '=', query.location);
    if (query.expiringWithinDays !== undefined) {
      q = q.where(sql<boolean>`p.expires_at <= current_date + ${query.expiringWithinDays}::int`);
    }
    const rows = await q
      .orderBy(sql`p.expires_at asc nulls last`)
      .orderBy('i.canonical_name')
      .execute();
    return rows.map(toPantryItem);
  }

  async get(userId: string, id: string): Promise<PantryItem | undefined> {
    const row = await this.baseQuery(userId).where('p.id', '=', id).executeTakeFirst();
    return row && toPantryItem(row);
  }

  /**
   * Inserts by selecting from the ingredient row so unit and expiry can fall
   * back to the ingredient's defaults in one statement.
   * Returns undefined if the ingredient does not exist.
   */
  async create(userId: string, input: CreatePantryItem): Promise<PantryItem | undefined> {
    const purchased = input.purchasedAt ? sql<string>`${input.purchasedAt}::date` : sql<string>`current_date`;
    const expires =
      input.expiresAt === undefined
        ? sql<string | null>`${purchased} + i.shelf_life_days`
        : sql<string | null>`${input.expiresAt}::date`;

    const inserted = await this.db
      .insertInto('pantry_items')
      .columns(['user_id', 'ingredient_id', 'quantity', 'unit', 'location', 'purchased_at', 'expires_at', 'notes'])
      .expression((eb) =>
        eb
          .selectFrom('ingredients as i')
          .select([
            sql<string>`${userId}::uuid`.as('user_id'),
            'i.id as ingredient_id',
            sql<number>`${input.quantity}::numeric`.as('quantity'),
            sql<string>`coalesce(${input.unit ?? null}::text, i.default_unit)`.as('unit'),
            sql<PantryLocation>`${input.location}::pantry_location`.as('location'),
            purchased.as('purchased_at'),
            expires.as('expires_at'),
            sql<string | null>`${input.notes ?? null}::text`.as('notes'),
          ])
          .where('i.id', '=', input.ingredientId),
      )
      .returning('id')
      .executeTakeFirst();

    return inserted && this.get(userId, inserted.id);
  }

  async update(userId: string, id: string, patch: UpdatePantryItem): Promise<PantryItem | undefined> {
    const values: Updateable<PantryItemsTable> = {};
    if (patch.quantity !== undefined) values.quantity = patch.quantity;
    if (patch.unit !== undefined) values.unit = patch.unit;
    if (patch.location !== undefined) values.location = patch.location;
    if (patch.purchasedAt !== undefined) values.purchased_at = patch.purchasedAt;
    if (patch.expiresAt !== undefined) values.expires_at = patch.expiresAt;
    if (patch.notes !== undefined) values.notes = patch.notes;

    const result = await this.db
      .updateTable('pantry_items')
      .set(values)
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (result.numUpdatedRows === 0n) return undefined;
    return this.get(userId, id);
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('pantry_items')
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
