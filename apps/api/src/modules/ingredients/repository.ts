import type { Ingredient, IngredientMatch, ListIngredientsQuery } from '@stockpot/shared';
import { sql, type Selectable } from 'kysely';
import type { Database } from '../../db/index.js';
import type { IngredientsTable } from '../../db/types.js';

/** Scores closer than this are treated as a tie the caller must disambiguate. */
const AMBIGUITY_MARGIN = 0.05;

type IngredientRow = Pick<
  Selectable<IngredientsTable>,
  'id' | 'slug' | 'canonical_name' | 'category' | 'default_unit' | 'shelf_life_days' | 'is_staple'
>;

export function toIngredient(row: IngredientRow): Ingredient {
  return {
    id: row.id,
    slug: row.slug,
    canonicalName: row.canonical_name,
    category: row.category,
    defaultUnit: row.default_unit,
    shelfLifeDays: row.shelf_life_days,
    isStaple: row.is_staple,
  };
}

const ingredientColumns = [
  'i.id',
  'i.slug',
  'i.canonical_name',
  'i.category',
  'i.default_unit',
  'i.shelf_life_days',
  'i.is_staple',
] as const;

export function normalizeTerm(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

export class IngredientRepository {
  constructor(private readonly db: Database) {}

  async list(query: ListIngredientsQuery): Promise<Ingredient[]> {
    let q = this.db.selectFrom('ingredients as i').select(ingredientColumns);
    if (query.category) q = q.where('i.category', '=', query.category);
    const rows = await q.orderBy('i.canonical_name').limit(query.limit).offset(query.offset).execute();
    return rows.map(toIngredient);
  }

  async getBySlug(slug: string): Promise<Ingredient | undefined> {
    const row = await this.db
      .selectFrom('ingredients as i')
      .select(ingredientColumns)
      .where('i.slug', '=', slug)
      .executeTakeFirst();
    return row && toIngredient(row);
  }

  /**
   * Fuzzy-matches free text against ingredient aliases with pg_trgm.
   * Exact alias hits rank first, then trigram similarity. Each ingredient
   * appears once, under its best-scoring alias.
   */
  async resolve(input: string, limit: number): Promise<{ ambiguous: boolean; matches: IngredientMatch[] }> {
    const term = normalizeTerm(input);

    const rows = await this.db
      .selectFrom('ingredient_aliases as a')
      .innerJoin('ingredients as i', 'i.id', 'a.ingredient_id')
      .select([
        ...ingredientColumns,
        'a.alias',
        sql<number>`similarity(a.alias, ${term})::float8`.as('score'),
        sql<boolean>`a.alias = ${term}`.as('exact'),
      ])
      .where(sql<boolean>`a.alias % ${term}`)
      .orderBy(sql`a.alias = ${term}`, 'desc')
      .orderBy(sql`similarity(a.alias, ${term})`, 'desc')
      .orderBy('i.canonical_name')
      .limit(limit * 4)
      .execute();

    const seen = new Set<string>();
    const matches: IngredientMatch[] = [];
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      matches.push({
        ingredient: toIngredient(row),
        matchedAlias: row.alias,
        score: Math.round(row.score * 1000) / 1000,
        exact: row.exact,
      });
      if (matches.length === limit) break;
    }

    const [first, second] = matches;
    const ambiguous =
      first !== undefined &&
      second !== undefined &&
      first.exact === second.exact &&
      first.score - second.score < AMBIGUITY_MARGIN;

    return { ambiguous, matches };
  }
}
