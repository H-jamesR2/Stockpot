import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { Config } from '../config.js';
import type { Database } from '../db/index.js';

export interface AuthUser {
  id: string;
  email: string;
}

/**
 * Anything that can turn a request into a user. The local provider is for
 * development only. A Cognito provider that verifies JWTs replaces it in the AWS phase.
 */
export interface AuthProvider {
  authenticate(request: FastifyRequest): Promise<AuthUser | null>;
}

/**
 * Treats every request as DEV_USER_EMAIL, or as the email in the
 * x-dev-user-email header so tests can act as different users.
 */
export class LocalDevAuthProvider implements AuthProvider {
  constructor(
    private readonly db: Database,
    private readonly defaultEmail: string,
  ) {}

  async authenticate(request: FastifyRequest): Promise<AuthUser | null> {
    const header = request.headers['x-dev-user-email'];
    const email = typeof header === 'string' && header.length > 0 ? header : this.defaultEmail;
    const user = await this.db
      .selectFrom('users')
      .select(['id', 'email'])
      .where('email', '=', email)
      .executeTakeFirst();
    return user ?? null;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export interface AuthPluginOptions {
  config: Config;
  db: Database;
}

export const authPlugin = fp<AuthPluginOptions>(
  async (app, { config, db }) => {
    if (config.AUTH_PROVIDER === 'local' && config.NODE_ENV === 'production') {
      throw new Error('The local dev auth provider must not run in production');
    }
    const provider: AuthProvider = new LocalDevAuthProvider(db, config.DEV_USER_EMAIL);

    app.decorateRequest('user', null);
    app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await provider.authenticate(request);
      if (!user) {
        return reply.unauthorized('Not authenticated');
      }
      request.user = user;
    });
  },
  { name: 'auth', dependencies: ['@fastify/sensible'] },
);

/** For handlers behind app.authenticate, where a user is guaranteed. */
export function requireUser(request: FastifyRequest): AuthUser {
  if (!request.user) {
    throw new Error('requireUser called on a route without app.authenticate');
  }
  return request.user;
}
