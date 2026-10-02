-- migrate:up

-- Basics most kitchens always have (salt, pepper, oil, water). Pantry matching
-- assumes them instead of counting them as required.
ALTER TABLE ingredients ADD COLUMN is_staple boolean NOT NULL DEFAULT false;

-- migrate:down

ALTER TABLE ingredients DROP COLUMN is_staple;
