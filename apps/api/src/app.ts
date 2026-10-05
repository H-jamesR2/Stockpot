import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Config } from './config.js';
import { createDatabase, type Database } from './db/index.js';
import { healthRoutes } from './modules/health/routes.js';
import { ingredientRoutes } from './modules/ingredients/routes.js';
import { pantryRoutes } from './modules/pantry/routes.js';
import { recipeRoutes } from './modules/recipes/routes.js';
import { unitRoutes } from './modules/units/routes.js';
import { authPlugin } from './plugins/auth.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { createLlmProvider, type LlmProvider } from './llm/index.js';
import { documentRoutes } from './modules/documents/routes.js';
import { AnswerService } from './modules/ask/answer-service.js';
import { askRoutes } from './modules/ask/routes.js';
import { searchRoutes } from './modules/search/routes.js';
import { SearchService } from './modules/search/search-service.js';
import { IngestionService } from './modules/documents/ingestion-service.js';
import { createFileStorage, type FileStorage } from './storage/index.js';

export interface BuildAppOptions {
  config: Config;
  /** Pass an existing database (tests). Otherwise one is created and closed with the app. */
  db?: Database;
  /** Tests pass a fake so they never need a model server. */
  llm?: LlmProvider;
  storage?: FileStorage;
}

export async function buildApp({
  config,
  db: injectedDb,
  llm = createLlmProvider(config),
  storage = createFileStorage(config),
}: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(config.NODE_ENV === 'development' && {
        transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
      }),
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  const db = injectedDb ?? createDatabase(config.DATABASE_URL);
  if (!injectedDb) {
    app.addHook('onClose', async () => {
      await db.destroy();
    });
  }

  await app.register(sensible);
  await app.register(cors, { origin: config.CORS_ORIGIN });

  if (config.NODE_ENV !== 'production') {
    await app.register(swagger, {
      openapi: { info: { title: 'Stockpot API', version: '0.1.0' } },
      transform: jsonSchemaTransform,
    });
    await app.register(swaggerUi, { routePrefix: '/docs' });
  }

  await app.register(authPlugin, { config, db });

  await app.register(healthRoutes, { db });
  await app.register(ingredientRoutes, { db, prefix: '/ingredients' });
  await app.register(pantryRoutes, { db, prefix: '/pantry' });
  await app.register(recipeRoutes, { db, prefix: '/recipes' });
  await app.register(unitRoutes, { db, prefix: '/units' });
  await app.register(documentRoutes, {
    db,
    ingestion: new IngestionService(db, llm, storage),
    storage,
    prefix: '/documents',
  });
  const search = new SearchService(db, llm);
  await app.register(searchRoutes, { search, prefix: '/search' });
  const answers = new AnswerService(search, llm, {
    maxDistance: config.ASK_MAX_DISTANCE,
    maxSourceTokens: config.ASK_MAX_SOURCE_TOKENS,
  });
  await app.register(askRoutes, { answers, prefix: '/ask' });

  return app;
}
