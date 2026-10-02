import type { Routes } from '@angular/router';

export const pantryRoutes: Routes = [
  { path: '', title: 'Pantry', loadComponent: () => import('./pantry-page').then((m) => m.PantryPage) },
];
