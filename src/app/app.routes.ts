import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'deals' },
  { path: 'deals', loadComponent: () => import('./demo/deals-list/deals-list').then((m) => m.DealsList) },
  { path: 'deals/new', loadComponent: () => import('./demo/deal-form/deal-form').then((m) => m.DealForm) },
  { path: 'deals/:id', loadComponent: () => import('./demo/deal-detail/deal-detail').then((m) => m.DealDetail) },
];
