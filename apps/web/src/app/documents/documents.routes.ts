import type { Routes } from '@angular/router';

export const documentRoutes: Routes = [
  { path: '', title: 'Documents', loadComponent: () => import('./document-list-page').then((m) => m.DocumentListPage) },
  { path: ':id', loadComponent: () => import('./document-detail-page').then((m) => m.DocumentDetailPage) },
];
