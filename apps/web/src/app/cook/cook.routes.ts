import type { Routes } from '@angular/router';

export const cookRoutes: Routes = [
  { path: '', title: 'What can I cook', loadComponent: () => import('./cook-page').then((m) => m.CookPage) },
];
