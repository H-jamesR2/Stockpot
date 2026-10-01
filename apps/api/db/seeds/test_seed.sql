-- Test fixture loaded before every test. Safe to re-run: it clears seed data first.
-- Tests assert on this exact data, so change it only alongside the tests.
-- The browsable dev catalog lives in dev_seed.sql.

BEGIN;

TRUNCATE recipe_steps, recipe_ingredients, recipes, pantry_items,
         ingredient_unit_conversions, ingredient_aliases, ingredients, users
         CASCADE;

INSERT INTO users (email, display_name)
VALUES ('dev@stockpot.local', 'Dev User');

INSERT INTO ingredients (slug, canonical_name, category, default_unit, shelf_life_days) VALUES
  ('scallion',          'scallion',          'produce',   'each',  7),
  ('garlic',            'garlic',            'produce',   'clove', 60),
  ('yellow-onion',      'yellow onion',      'produce',   'each',  30),
  ('carrot',            'carrot',            'produce',   'each',  21),
  ('ginger',            'ginger',            'produce',   'g',     21),
  ('chuck-roast',       'chuck roast',       'protein',   'lb',    4),
  ('large-egg',         'large egg',         'egg',       'each',  35),
  ('unsalted-butter',   'unsalted butter',   'dairy',     'g',     60),
  ('whole-milk',        'whole milk',        'dairy',     'cup',   7),
  ('all-purpose-flour', 'all-purpose flour', 'baking',    'cup',   240),
  ('jasmine-rice',      'jasmine rice',      'grain',     'cup',   365),
  ('soy-sauce',         'soy sauce',         'condiment', 'tbsp',  730),
  ('kosher-salt',       'kosher salt',       'spice',     'tsp',   NULL),
  ('black-pepper',      'black pepper',      'spice',     'tsp',   730),
  ('bell-pepper',       'bell pepper',       'produce',   'each',  10);

-- Canonical names are added automatically by trigger. These are the extra aliases.
INSERT INTO ingredient_aliases (alias, ingredient_id)
SELECT a.alias, i.id
FROM (VALUES
  ('green onion',       'scallion'),
  ('spring onion',      'scallion'),
  ('garlic clove',      'garlic'),
  ('onion',             'yellow-onion'),
  ('brown onion',       'yellow-onion'),
  ('fresh ginger',      'ginger'),
  ('ginger root',       'ginger'),
  ('beef chuck',        'chuck-roast'),
  ('chuck',             'chuck-roast'),
  ('egg',               'large-egg'),
  ('butter',            'unsalted-butter'),
  ('milk',              'whole-milk'),
  ('flour',             'all-purpose-flour'),
  ('ap flour',          'all-purpose-flour'),
  ('plain flour',       'all-purpose-flour'),
  ('rice',              'jasmine-rice'),
  ('shoyu',             'soy-sauce'),
  ('salt',              'kosher-salt'),
  ('pepper',            'black-pepper'),
  ('pepper',            'bell-pepper'),   -- intentionally ambiguous
  ('capsicum',          'bell-pepper')
) AS a(alias, slug)
JOIN ingredients i ON i.slug = a.slug;

INSERT INTO ingredient_unit_conversions (ingredient_id, unit_code, grams)
SELECT i.id, c.unit_code, c.grams
FROM (VALUES
  ('garlic',            'clove', 5),
  ('garlic',            'head',  50),
  ('scallion',          'each',  15),
  ('scallion',          'bunch', 100),
  ('yellow-onion',      'each',  150),
  ('carrot',            'each',  60),
  ('large-egg',         'each',  50),
  ('all-purpose-flour', 'cup',   120),
  ('jasmine-rice',      'cup',   185),
  ('unsalted-butter',   'tbsp',  14),
  ('whole-milk',        'cup',   245)
) AS c(slug, unit_code, grams)
JOIN ingredients i ON i.slug = c.slug;

INSERT INTO recipes (slug, title, description, servings, prep_min, cook_min, cuisine, methods) VALUES
  ('scallion-ginger-fried-rice', 'Scallion Ginger Fried Rice',
   'Weeknight fried rice built for day-old rice and whatever needs using up.',
   2, 10, 12, 'chinese', '{stir_fry}'),
  ('red-wine-braised-chuck', 'Red Wine Braised Chuck',
   'Low and slow chuck roast with onion and carrot.',
   4, 20, 180, 'french', '{sear,braise}');

INSERT INTO recipe_ingredients (recipe_id, position, ingredient_id, quantity, unit, preparation, raw_text, is_optional)
SELECT r.id, x.position, i.id, x.quantity, x.unit, x.preparation, x.raw_text, x.is_optional
FROM (VALUES
  ('scallion-ginger-fried-rice', 1, 'jasmine-rice', 2::numeric,   'cup',   'cooked, day-old',   '2 cups cooked jasmine rice, day-old', false),
  ('scallion-ginger-fried-rice', 2, 'scallion',     4,            'each',  'thinly sliced',     '4 scallions, thinly sliced',          false),
  ('scallion-ginger-fried-rice', 3, 'ginger',       15,           'g',     'minced',            '1 tbsp minced fresh ginger',          false),
  ('scallion-ginger-fried-rice', 4, 'garlic',       2,            'clove', 'minced',            '2 garlic cloves, minced',             false),
  ('scallion-ginger-fried-rice', 5, 'large-egg',    2,            'each',  'beaten',            '2 eggs, beaten',                      false),
  ('scallion-ginger-fried-rice', 6, 'soy-sauce',    2,            'tbsp',  NULL,                '2 tbsp soy sauce',                    false),
  ('red-wine-braised-chuck',     1, 'chuck-roast',  3,            'lb',    'cut into 3 pieces', '3 lb beef chuck, cut into 3 pieces',  false),
  ('red-wine-braised-chuck',     2, 'yellow-onion', 1,            'each',  'chopped',           '1 onion, chopped',                    false),
  ('red-wine-braised-chuck',     3, 'carrot',       2,            'each',  'chopped',           '2 carrots, chopped',                  false),
  ('red-wine-braised-chuck',     4, 'garlic',       4,            'clove', 'smashed',           '4 cloves garlic, smashed',            false),
  ('red-wine-braised-chuck',     5, 'kosher-salt',  NULL,         NULL,    NULL,                'salt to taste',                       false),
  ('red-wine-braised-chuck',     6, NULL,           1,            'cup',   NULL,                '1 cup dry red wine',                  false)  -- unresolved on purpose
) AS x(recipe_slug, position, ingredient_slug, quantity, unit, preparation, raw_text, is_optional)
JOIN recipes r ON r.slug = x.recipe_slug
LEFT JOIN ingredients i ON i.slug = x.ingredient_slug;

INSERT INTO recipe_steps (recipe_id, step_number, text)
SELECT r.id, s.step_number, s.text
FROM (VALUES
  ('scallion-ginger-fried-rice', 1, 'Scramble the eggs in a hot oiled wok and set aside.'),
  ('scallion-ginger-fried-rice', 2, 'Fry ginger, garlic, and scallion whites until fragrant.'),
  ('scallion-ginger-fried-rice', 3, 'Add rice, toss until hot and slightly crisp, then add soy sauce, eggs, and scallion greens.'),
  ('red-wine-braised-chuck',     1, 'Season and sear the chuck on all sides, then remove.'),
  ('red-wine-braised-chuck',     2, 'Soften onion, carrot, and garlic in the same pot.'),
  ('red-wine-braised-chuck',     3, 'Deglaze with wine, return the beef, cover, and braise at 300F for about 3 hours.')
) AS s(recipe_slug, step_number, text)
JOIN recipes r ON r.slug = s.recipe_slug;

INSERT INTO pantry_items (user_id, ingredient_id, quantity, unit, location, purchased_at, expires_at)
SELECT u.id, i.id, p.quantity, p.unit, p.location::pantry_location,
       current_date - p.bought_days_ago, current_date + p.expires_in_days
FROM (VALUES
  ('scallion',     6::numeric, 'each',  'fridge',  5, 2),
  ('garlic',       1,          'head',  'pantry', 10, 50),
  ('large-egg',    8,          'each',  'fridge', 12, 23),
  ('jasmine-rice', 4,          'cup',   'pantry', 30, 335),
  ('soy-sauce',    20,         'tbsp',  'pantry', 60, 670),
  ('chuck-roast',  3,          'lb',    'freezer', 3, 90)
) AS p(slug, quantity, unit, location, bought_days_ago, expires_in_days)
JOIN ingredients i ON i.slug = p.slug
CROSS JOIN users u
WHERE u.email = 'dev@stockpot.local';

COMMIT;
