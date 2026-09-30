/**
 * Hand-written table types for Kysely, mirroring db/migrations.
 * Once the schema settles, consider generating this with kysely-codegen.
 *
 * Conventions set in db/index.ts:
 *   numeric columns come back as JS numbers
 *   date columns come back as 'YYYY-MM-DD' strings
 */
import type { ColumnType, Generated } from 'kysely';

type CreatedAt = ColumnType<Date, never, never>;
type UpdatedAt = ColumnType<Date, never, never>;
type GeneratedUuid = ColumnType<string, string | undefined, never>;

export type UnitKind = 'mass' | 'volume' | 'count';
export type PantryLocation = 'fridge' | 'freezer' | 'pantry';
export type IngredientCategory =
  | 'produce'
  | 'herb'
  | 'spice'
  | 'protein'
  | 'seafood'
  | 'dairy'
  | 'egg'
  | 'grain'
  | 'legume'
  | 'nut_seed'
  | 'baking'
  | 'oil_fat'
  | 'condiment'
  | 'beverage'
  | 'other';

export interface UsersTable {
  id: GeneratedUuid;
  email: string;
  display_name: string | null;
  password_hash: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface UnitsTable {
  code: string;
  name: string;
  kind: UnitKind;
  to_base: number | null;
}

export interface IngredientsTable {
  id: GeneratedUuid;
  slug: string;
  canonical_name: string;
  category: IngredientCategory;
  default_unit: string;
  shelf_life_days: number | null;
  fdc_id: number | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface IngredientAliasesTable {
  alias: string;
  ingredient_id: string;
}

export interface IngredientUnitConversionsTable {
  ingredient_id: string;
  unit_code: string;
  grams: number;
}

export interface PantryItemsTable {
  id: GeneratedUuid;
  user_id: string;
  ingredient_id: string;
  quantity: number;
  unit: string;
  location: Generated<PantryLocation>;
  purchased_at: Generated<string>;
  expires_at: string | null;
  notes: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface RecipesTable {
  id: GeneratedUuid;
  slug: string;
  title: string;
  description: string | null;
  source: string | null;
  source_url: string | null;
  servings: number;
  prep_min: number | null;
  cook_min: number | null;
  cuisine: string | null;
  methods: Generated<string[]>;
  created_by: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface RecipeIngredientsTable {
  id: GeneratedUuid;
  recipe_id: string;
  position: number;
  ingredient_id: string | null;
  quantity: number | null;
  unit: string | null;
  preparation: string | null;
  raw_text: string;
  is_optional: Generated<boolean>;
}

export interface RecipeStepsTable {
  recipe_id: string;
  step_number: number;
  text: string;
}

export interface DB {
  users: UsersTable;
  units: UnitsTable;
  ingredients: IngredientsTable;
  ingredient_aliases: IngredientAliasesTable;
  ingredient_unit_conversions: IngredientUnitConversionsTable;
  pantry_items: PantryItemsTable;
  recipes: RecipesTable;
  recipe_ingredients: RecipeIngredientsTable;
  recipe_steps: RecipeStepsTable;
}
