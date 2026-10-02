import type { Routes } from '@angular/router';

export const recipeRoutes: Routes = [
  { path: '', title: 'Recipes', loadComponent: () => import('./recipe-list-page').then((m) => m.RecipeListPage) },
  { path: ':slug', loadComponent: () => import('./recipe-detail-page').then((m) => m.RecipeDetailPage) },
];
