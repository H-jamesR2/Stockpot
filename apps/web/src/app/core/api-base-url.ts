import { InjectionToken } from '@angular/core';

/** Prefix for API calls. The dev server proxies it to Fastify, and the AWS phase routes it the same way. */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', { factory: () => '/api' });
