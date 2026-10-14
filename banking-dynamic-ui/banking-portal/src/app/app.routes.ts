import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard',
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then(
        (m) => m.DashboardComponent,
      ),
  },
  {
    path: 'statements',
    loadComponent: () =>
      import('./features/statements/statements.component').then(
        (m) => m.StatementsComponent,
      ),
  },
  {
    path: 'cards',
    loadComponent: () =>
      import('./features/cards/cards.component').then((m) => m.CardsComponent),
  },
  {
    path: 'security',
    loadComponent: () =>
      import('./features/security/security.component').then(
        (m) => m.SecurityComponent,
      ),
  },
  {
    path: 'transfers',
    loadComponent: () =>
      import('./features/transfers/transfers.component').then(
        (m) => m.TransfersComponent,
      ),
  },
  {
    path: 'admin',
    loadComponent: () =>
      import('./features/admin/admin.component').then((m) => m.AdminComponent),
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
