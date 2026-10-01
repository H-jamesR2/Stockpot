# Stockpot

A kitchen agent: pantry tracking, recipe search, and meal planning over SQL, vector, and graph data.

## Run locally

Requires Node 22+ and Docker.

```bash
cp .env.example .env
npm install
docker compose up -d                          # Postgres (runs migrations), Neo4j
docker compose --profile seed run --rm seed   # 200-ingredient dev catalog
npm run dev:api                               # http://localhost:3000, docs at /docs
```

Ollama: `docker compose --profile ollama up -d` on Linux or Windows, or install it natively on macOS.

## Test

```bash
npm test
```

Tests start a throwaway pgvector container through Testcontainers. To reuse a running
Postgres instead, set `TEST_DATABASE_URL` (that database is wiped on every run).

## Layout

| Path                     | What                                                                   |
| ------------------------ | ---------------------------------------------------------------------- |
| `packages/shared`        | Zod schemas shared by the API and the Angular app                      |
| `apps/api`               | Fastify API. `src/modules/*` holds routes and repositories per feature |
| `apps/api/db/migrations` | dbmate SQL migrations                                                  |
| `apps/api/db/seeds`      | Dev catalog (200 ingredients, USDA-backed) and the small test fixture  |

## API

| Method           | Path                      | Notes                                                                                         |
| ---------------- | ------------------------- | --------------------------------------------------------------------------------------------- |
| GET              | `/health`                 | Checks the database                                                                           |
| GET              | `/ingredients`            | Filter by `category`                                                                          |
| GET              | `/ingredients/resolve?q=` | Fuzzy match free text, flags ambiguous terms                                                  |
| GET              | `/ingredients/:slug`      |                                                                                               |
| GET POST         | `/pantry`                 | Auth. Filter by `location`, `expiringWithinDays`. Unit and expiry default from the ingredient |
| GET PATCH DELETE | `/pantry/:id`             | Auth                                                                                          |
| GET              | `/recipes`                | Filter by `q`, `cuisine`, `method`, `usesIngredient`                                          |
| GET              | `/recipes/pantry-matches` | Auth. Ranked by expiring items used, then pantry coverage                                     |
| GET              | `/recipes/review-queue`   | Ingredient lines that failed normalization                                                    |
| GET              | `/recipes/:slug`          | Detail with ingredients and steps                                                             |

Auth is a local dev provider that treats every request as `DEV_USER_EMAIL`
(or the `x-dev-user-email` header). Cognito replaces it in the AWS phase.
