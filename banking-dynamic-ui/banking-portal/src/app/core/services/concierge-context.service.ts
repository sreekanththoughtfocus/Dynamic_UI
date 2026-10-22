import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BankingStateService } from './banking.service';

export interface ConciergePageContext {
  route: string;
  accountId: string | null;
  cardId: string | null;
  transactionId: string | null;
}

@Injectable({ providedIn: 'root' })
export class ConciergeContextService {
  private readonly router = inject(Router);
  private readonly banking = inject(BankingStateService);

  readonly cardId = signal<string | null>(null);
  readonly transactionId = signal<string | null>(null);

  snapshot(): ConciergePageContext {
    return {
      route: this.router.url,
      accountId: this.banking.selectedAccountId(),
      cardId: this.cardId(),
      transactionId: this.transactionId(),
    };
  }
}
