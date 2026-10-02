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

export interface BuildAppOptions {
  config: Config;
  /** Pass an existing database (tests). Otherwise one is created and closed with the app. */
  db?: Database;
}

export async function buildApp({ config, db: injectedDb }: BuildAppOptions): Promise<FastifyInstance> {
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

  return app;
}
