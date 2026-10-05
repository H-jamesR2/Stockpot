-- migrate:up

-- Source material for retrieval: uploaded notes and technique pages, plus recipes
-- rendered as text. Raw uploads live in file storage under storage_key.
CREATE TYPE document_kind AS ENUM ('recipe', 'technique', 'note');

CREATE TABLE documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind           document_kind NOT NULL,
  title          text NOT NULL CHECK (btrim(title) <> ''),
  recipe_id      uuid UNIQUE REFERENCES recipes (id) ON DELETE CASCADE,
  storage_key    text UNIQUE,  -- NULL for recipes, which are rendered from their rows
  content_type   text NOT NULL,
  byte_size      integer NOT NULL CHECK (byte_size >= 0),
  content_hash   text NOT NULL,  -- sha256 hex of the source text, to spot re-uploads
  ingested_at    timestamptz,    -- NULL until every chunk is embedded
  created_by     uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'recipe') = (recipe_id IS NOT NULL))
);

CREATE TRIGGER documents_updated_at BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 768 dimensions matches nomic-embed-text. A model with a different size needs a
-- new migration and a re-embed, which embedding_model makes safe to do per row.
CREATE TABLE chunks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      uuid NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  position         integer NOT NULL CHECK (position >= 0),
  content          text NOT NULL CHECK (btrim(content) <> ''),
  token_count      integer NOT NULL CHECK (token_count > 0),
  embedding        vector(768),  -- NULL until embedded
  embedding_model  text,
  tsv              tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  metadata         jsonb NOT NULL DEFAULT '{}',  -- heading path, character offsets
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, position),
  CHECK ((embedding IS NULL) = (embedding_model IS NULL))
);

CREATE INDEX chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX chunks_tsv_idx ON chunks USING gin (tsv);
CREATE INDEX chunks_embedding_model_idx ON chunks (embedding_model);

-- migrate:down

DROP TABLE IF EXISTS chunks;
DROP TABLE IF EXISTS documents;
DROP TYPE IF EXISTS document_kind;
