import type {
  ListRecipesQuery,
  PantryMatch,
  PantryMatchesQuery,
  RecipeDetail,
  RecipeSummary,
  ReviewQueue,
} from '@stockpot/shared';
import { sql } from 'kysely';
import type { Database } from '../../db/index.js';

interface RecipeSummaryRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  servings: number;
  prep_min: number | null;
  cook_min: number | null;
  cuisine: string | null;
  methods: string[];
}

function toSummary(row: RecipeSummaryRow): RecipeSummary {
  const total = row.prep_min === null && row.cook_min === null ? null : (row.prep_min ?? 0) + (row.cook_min ?? 0);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    servings: row.servings,
    prepMin: row.prep_min,
    cookMin: row.cook_min,
    totalMin: total,
    cuisine: row.cuisine,
    methods: row.methods,
  };
}

const summaryColumns = [
  'r.id',
  'r.slug',
  'r.title',
  'r.description',
  'r.servings',
  'r.prep_min',
  'r.cook_min',
  'r.cuisine',
  'r.methods',
] as const;

export class RecipeRepository {
  constructor(private readonly db: Database) {}

  async list(query: ListRecipesQuery): Promise<RecipeSummary[]> {
    let q = this.db.selectFrom('recipes as r').select(summaryColumns);

    if (query.cuisine) q = q.where('r.cuisine', '=', query.cuisine.toLowerCase());
    if (query.method) q = q.where(sql<boolean>`${query.method.toLowerCase()} = any(r.methods)`);
    if (query.q) q = q.where('r.title', 'ilike', `%${escapeLike(query.q)}%`);
    if (query.usesIngredient) {
      const slug = query.usesIngredient;
      q = q.where(({ exists, selectFrom }) =>
        exists(
          selectFrom('recipe_ingredients as ri')
            .innerJoin('ingredients as i', 'i.id', 'ri.ingredient_id')
            .select(sql`1`.as('one'))
            .whereRef('ri.recipe_id', '=', 'r.id')
            .where('i.slug', '=', slug),
        ),
      );
    }

    const rows = await q.orderBy('r.title').limit(query.limit).offset(query.offset).execute();
    return rows.map(toSummary);
  }

  async getBySlug(slug: string): Promise<RecipeDetail | undefined> {
    const recipe = await this.db
      .selectFrom('recipes as r')
      .select([...summaryColumns, 'r.source', 'r.source_url'])
      .where('r.slug', '=', slug)
      .executeTakeFirst();
    if (!recipe) return undefined;

    const [lines, steps] = await Promise.all([
      this.db
        .selectFrom('recipe_ingredients as ri')
        .leftJoin('ingredients as i', 'i.id', 'ri.ingredient_id')
        .select([
          'ri.position',
          'ri.quantity',
          'ri.unit',
          'ri.preparation',
          'ri.raw_text',
          'ri.is_optional',
          'i.id as ingredient_id',
          'i.slug as ingredient_slug',
          'i.canonical_name as ingredient_name',
          'i.category as ingredient_category',
        ])
        .where('ri.recipe_id', '=', recipe.id)
        .orderBy('ri.position')
        .execute(),
      this.db
        .selectFrom('recipe_steps')
        .select(['step_number', 'text'])
        .where('recipe_id', '=', recipe.id)
        .orderBy('step_number')
        .execute(),
    ]);

    return {
      ...toSummary(recipe),
      source: recipe.source,
      sourceUrl: recipe.source_url,
      ingredients: lines.map((l) => ({
        position: l.position,
        ingredient:
          l.ingredient_id && l.ingredient_slug && l.ingredient_name && l.ingredient_category
            ? {
                id: l.ingredient_id,
                slug: l.ingredient_slug,
                canonicalName: l.ingredient_name,
                category: l.ingredient_category,
              }
            : null,
        quantity: l.quantity,
        unit: l.unit,
        preparation: l.preparation,
        rawText: l.raw_text,
        isOptional: l.is_optional,
      })),
      steps: steps.map((s) => ({ stepNumber: s.step_number, text: s.text })),
    };
  }

  /** Recipe lines whose ingredient could not be resolved and need a human (or later, the LLM) to map. */
  async reviewQueue(): Promise<ReviewQueue['items']> {
    const rows = await this.db
      .selectFrom('recipe_ingredients as ri')
      .innerJoin('recipes as r', 'r.id', 'ri.recipe_id')
      .select(['r.id as recipe_id', 'r.slug', 'r.title', 'ri.position', 'ri.raw_text'])
      .where('ri.ingredient_id', 'is', null)
      .orderBy('r.title')
      .orderBy('ri.position')
      .execute();
    return rows.map((r) => ({
      recipeId: r.recipe_id,
      recipeSlug: r.slug,
      recipeTitle: r.title,
      position: r.position,
      rawText: r.raw_text,
    }));
  }

  /**
   * Ranks recipes by how well the user's pantry covers them, favoring recipes
   * that use up items about to expire.
   *
   * Presence only for now: having any amount counts as having it. Lines with no
   * quantity ("salt to taste") and optional lines are not required. Unresolved
   * lines count as missing, shown by their raw text.
   * Quantity-aware matching comes once unit conversion lands in the API.
   */
  async pantryMatches(userId: string, query: PantryMatchesQuery): Promise<PantryMatch[]> {
    const result = await sql<RecipeSummaryRow & {
      required_count: number;
      have_count: number;
      expiring_count: number;
      missing: string[];
    }>`
      with have as (
        select ingredient_id, min(expires_at) as expires_at
        from pantry_items
        where user_id = ${userId}
        group by ingredient_id
      ),
      lines as (
        select
          ri.recipe_id,
          coalesce(i.canonical_name, ri.raw_text) as name,
          h.ingredient_id is not null as have,
          coalesce(h.expires_at <= current_date + ${query.expiringWithinDays}::int, false) as expiring
        from recipe_ingredients ri
        left join ingredients i on i.id = ri.ingredient_id
        left join have h on h.ingredient_id = ri.ingredient_id
        where not ri.is_optional
          and ri.quantity is not null
      ),
      scored as (
        select
          recipe_id,
          count(*)::int as required_count,
          count(*) filter (where have)::int as have_count,
          count(*) filter (where expiring)::int as expiring_count,
          coalesce(array_agg(name order by name) filter (where not have), '{}') as missing
        from lines
        group by recipe_id
      )
      select
        r.id, r.slug, r.title, r.description, r.servings, r.prep_min, r.cook_min, r.cuisine, r.methods,
        s.required_count, s.have_count, s.expiring_count, s.missing
      from scored s
      join recipes r on r.id = s.recipe_id
      where s.have_count::float8 / s.required_count >= ${query.minCoverage}
      order by
        s.expiring_count desc,
        s.have_count::float8 / s.required_count desc,
        r.title
      limit ${query.limit}
    `.execute(this.db);

    return result.rows.map((row) => ({
      recipe: toSummary(row),
      requiredCount: row.required_count,
      haveCount: row.have_count,
      coverage: Math.round((row.have_count / row.required_count) * 1000) / 1000,
      expiringCount: row.expiring_count,
      missing: row.missing,
    }));
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

