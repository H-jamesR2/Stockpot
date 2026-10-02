import type { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'recipes' },
  { path: 'recipes', loadChildren: () => import('./recipes/recipes.routes').then((m) => m.recipeRoutes) },
  { path: 'pantry', loadChildren: () => import('./pantry/pantry.routes').then((m) => m.pantryRoutes) },
];
