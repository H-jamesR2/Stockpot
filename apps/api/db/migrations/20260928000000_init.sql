-- migrate:up

-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- fuzzy ingredient matching
CREATE EXTENSION IF NOT EXISTS vector;   -- pgvector, used starting in phase two
CREATE EXTENSION IF NOT EXISTS citext;   -- case-insensitive emails

-- Shared trigger function that keeps updated_at current
CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Enums
CREATE TYPE unit_kind AS ENUM ('mass', 'volume', 'count');

CREATE TYPE ingredient_category AS ENUM (
  'produce', 'herb', 'spice', 'protein', 'seafood', 'dairy', 'egg',
  'grain', 'legume', 'nut_seed', 'baking', 'oil_fat', 'condiment',
  'beverage', 'other'
);

CREATE TYPE pantry_location AS ENUM ('fridge', 'freezer', 'pantry');

-- Users
CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          citext NOT NULL UNIQUE,
  display_name   text,
  password_hash  text,  -- local dev auth only, Cognito replaces this in the AWS phase
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Units
-- to_base converts to grams (mass), milliliters (volume), or each (count).
-- NULL means the unit only converts through an ingredient-specific row
-- in ingredient_unit_conversions (a clove, a bunch, a can).
CREATE TABLE units (
  code     text PRIMARY KEY,
  name     text NOT NULL,
  kind     unit_kind NOT NULL,
  to_base  numeric CHECK (to_base IS NULL OR to_base > 0)
);

INSERT INTO units (code, name, kind, to_base) VALUES
  ('g',       'gram',          'mass',   1),
  ('kg',      'kilogram',      'mass',   1000),
  ('oz',      'ounce',         'mass',   28.3495),
  ('lb',      'pound',         'mass',   453.592),
  ('ml',      'milliliter',    'volume', 1),
  ('l',       'liter',         'volume', 1000),
  ('tsp',     'teaspoon',      'volume', 4.92892),
  ('tbsp',    'tablespoon',    'volume', 14.7868),
  ('cup',     'cup',           'volume', 236.588),
  ('fl_oz',   'fluid ounce',   'volume', 29.5735),
  ('pinch',   'pinch',         'volume', 0.308),
  ('each',    'each',          'count',  1),
  ('dozen',   'dozen',         'count',  12),
  ('clove',   'clove',         'count',  NULL),
  ('bunch',   'bunch',         'count',  NULL),
  ('head',    'head',          'count',  NULL),
  ('stalk',   'stalk',         'count',  NULL),
  ('sprig',   'sprig',         'count',  NULL),
  ('slice',   'slice',         'count',  NULL),
  ('can',     'can',           'count',  NULL),
  ('package', 'package',       'count',  NULL);

-- Ingredients
CREATE TABLE ingredients (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  canonical_name   text NOT NULL UNIQUE,
  category         ingredient_category NOT NULL,
  default_unit     text NOT NULL REFERENCES units (code),
  shelf_life_days  integer CHECK (shelf_life_days > 0),
  fdc_id           integer,  -- USDA FoodData Central id, optional
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER ingredients_updated_at BEFORE UPDATE ON ingredients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Aliases are stored lowercased and trimmed so matching stays simple.
-- One alias can point at several ingredients ("pepper") and the resolver ranks them.
CREATE TABLE ingredient_aliases (
  alias          text NOT NULL CHECK (alias = lower(btrim(alias)) AND alias <> ''),
  ingredient_id  uuid NOT NULL REFERENCES ingredients (id) ON DELETE CASCADE,
  PRIMARY KEY (alias, ingredient_id)
);

CREATE INDEX ingredient_aliases_trgm_idx
  ON ingredient_aliases USING gin (alias gin_trgm_ops);
CREATE INDEX ingredient_aliases_ingredient_idx
  ON ingredient_aliases (ingredient_id);

-- Every canonical name is automatically also an alias
CREATE FUNCTION add_canonical_alias() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO ingredient_aliases (alias, ingredient_id)
  VALUES (lower(btrim(NEW.canonical_name)), NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ingredients_canonical_alias
  AFTER INSERT OR UPDATE OF canonical_name ON ingredients
  FOR EACH ROW EXECUTE FUNCTION add_canonical_alias();

-- How much one unit of a given ingredient weighs, with grams as the bridge
-- between kinds. Examples: 1 clove garlic = 5 g, 1 cup flour = 120 g,
-- 1 each yellow onion = 150 g.
CREATE TABLE ingredient_unit_conversions (
  ingredient_id  uuid NOT NULL REFERENCES ingredients (id) ON DELETE CASCADE,
  unit_code      text NOT NULL REFERENCES units (code),
  grams          numeric NOT NULL CHECK (grams > 0),
  PRIMARY KEY (ingredient_id, unit_code)
);

-- Pantry
CREATE TABLE pantry_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  ingredient_id  uuid NOT NULL REFERENCES ingredients (id),
  quantity       numeric(10, 3) NOT NULL CHECK (quantity > 0),
  unit           text NOT NULL REFERENCES units (code),
  location       pantry_location NOT NULL DEFAULT 'pantry',
  purchased_at   date NOT NULL DEFAULT current_date,
  expires_at     date,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR expires_at >= purchased_at)
);

CREATE TRIGGER pantry_items_updated_at BEFORE UPDATE ON pantry_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX pantry_items_user_expiry_idx ON pantry_items (user_id, expires_at);
CREATE INDEX pantry_items_ingredient_idx ON pantry_items (ingredient_id);

-- Recipes
CREATE TABLE recipes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title        text NOT NULL,
  description  text,
  source       text,
  source_url   text,
  servings     integer NOT NULL CHECK (servings > 0),
  prep_min     integer CHECK (prep_min >= 0),
  cook_min     integer CHECK (cook_min >= 0),
  cuisine      text,
  methods      text[] NOT NULL DEFAULT '{}',  -- braise, roast, stir_fry, bake
  created_by   uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER recipes_updated_at BEFORE UPDATE ON recipes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX recipes_methods_idx ON recipes USING gin (methods);
CREATE INDEX recipes_cuisine_idx ON recipes (cuisine);

-- ingredient_id stays NULL when normalization could not resolve raw_text.
-- Those rows form a review queue instead of silently failing.
CREATE TABLE recipe_ingredients (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id      uuid NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
  position       integer NOT NULL CHECK (position > 0),
  ingredient_id  uuid REFERENCES ingredients (id),
  quantity       numeric(10, 3) CHECK (quantity IS NULL OR quantity > 0),
  unit           text REFERENCES units (code),
  preparation    text,  -- "thinly sliced", "room temperature"
  raw_text       text NOT NULL,
  is_optional    boolean NOT NULL DEFAULT false,
  UNIQUE (recipe_id, position)
);

CREATE INDEX recipe_ingredients_ingredient_idx ON recipe_ingredients (ingredient_id);
CREATE INDEX recipe_ingredients_unresolved_idx
  ON recipe_ingredients (recipe_id) WHERE ingredient_id IS NULL;

CREATE TABLE recipe_steps (
  recipe_id    uuid NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
  step_number  integer NOT NULL CHECK (step_number > 0),
  text         text NOT NULL,
  PRIMARY KEY (recipe_id, step_number)
);


-- migrate:down

DROP TABLE IF EXISTS recipe_steps;
DROP TABLE IF EXISTS recipe_ingredients;
DROP TABLE IF EXISTS recipes;
DROP TABLE IF EXISTS pantry_items;
DROP TABLE IF EXISTS ingredient_unit_conversions;
DROP TABLE IF EXISTS ingredient_aliases;
DROP TABLE IF EXISTS ingredients;
DROP TABLE IF EXISTS units;
DROP TABLE IF EXISTS users;

DROP FUNCTION IF EXISTS add_canonical_alias();
DROP FUNCTION IF EXISTS set_updated_at();

DROP TYPE IF EXISTS pantry_location;
DROP TYPE IF EXISTS ingredient_category;
DROP TYPE IF EXISTS unit_kind;

DROP EXTENSION IF EXISTS citext;
DROP EXTENSION IF EXISTS vector;
DROP EXTENSION IF EXISTS pg_trgm;
