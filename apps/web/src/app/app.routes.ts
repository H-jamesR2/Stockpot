import type { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'recipes' },
  { path: 'recipes', loadChildren: () => import('./recipes/recipes.routes').then((m) => m.recipeRoutes) },
  { path: 'pantry', loadChildren: () => import('./pantry/pantry.routes').then((m) => m.pantryRoutes) },
  { path: 'documents', loadChildren: () => import('./documents/documents.routes').then((m) => m.documentRoutes) },
  { path: 'ask', loadChildren: () => import('./ask/ask.routes').then((m) => m.askRoutes) },
  { path: 'cook', loadChildren: () => import('./cook/cook.routes').then((m) => m.cookRoutes) },
];
