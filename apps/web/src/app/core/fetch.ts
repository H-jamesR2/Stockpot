import { InjectionToken } from '@angular/core';

/**
 * The browser fetch, injectable so tests can stand in a fake. HttpClient cannot hand back a
 * stream as it arrives, which reading Server-Sent Events from a POST needs.
 */
export const FETCH = new InjectionToken<typeof fetch>('FETCH', { factory: () => fetch.bind(globalThis) });
