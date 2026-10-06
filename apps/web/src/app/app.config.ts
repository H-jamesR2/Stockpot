import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Anchor scrolling lets citation links land on the cited chunk (#chunk-n).
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ anchorScrolling: 'enabled' })),
    provideHttpClient(withFetch()),
  ],
};
