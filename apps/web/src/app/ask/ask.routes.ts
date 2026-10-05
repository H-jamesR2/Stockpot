import type { Routes } from '@angular/router';

export const askRoutes: Routes = [
  { path: '', title: 'Ask', loadComponent: () => import('./ask-page').then((m) => m.AskPage) },
];
