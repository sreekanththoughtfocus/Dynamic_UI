import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { BankingStateService } from '../../../core/services/banking.service';

interface AllocationSlice {
  accountId: string;
  name: string;
  amount: number;
  reason: string;
}

@Component({
  selector: 'bank-allocation-widget',
  imports: [CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="insight-card">
      <header>
        <h4>Place {{ amount() | currency: 'USD' }}</h4>
        <p>From {{ fromAccount() }}</p>
      </header>
      @for (slice of slices(); track slice.accountId) {
        <div class="row">
          <div>
            <strong>{{ slice.name }}</strong>
            <span>{{ slice.reason }}</span>
          </div>
          <strong>{{ slice.amount | currency: 'USD' }}</strong>
        </div>
      }
      @if (done()) {
        <p class="ok">Both transfers posted.</p>
      } @else {
        <button type="button" class="primary" [disabled]="busy()" (click)="authorize()">Authorize both transfers</button>
      }
    </section>
  `,
  styles: `
    .insight-card { color: #f8fafc; display: flex; flex-direction: column; gap: 8px; }
    h4 { margin: 0; color: #34d399; }
    p, span { margin: 0; color: #94a3b8; font-size: 0.75rem; }
    .row { display: flex; justify-content: space-between; gap: 8px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,.08); }
    .row div { display: flex; flex-direction: column; }
    .primary { background: #059669; color: white; border: 0; border-radius: 8px; padding: 8px 12px; font-weight: 700; cursor: pointer; }
    .ok { color: #34d399; font-weight: 700; }
    button:focus-visible { outline: 2px solid #22d3ee; outline-offset: 2px; }
  `,
})
export class AllocationWidgetComponent {
  private readonly banking = inject(BankingStateService);
  readonly amount = input(0);
  readonly fromAccountId = input('acc-chk-01');
  readonly fromAccount = input('Checking');
  readonly slices = input<AllocationSlice[]>([]);
  protected readonly busy = signal(false);
  protected readonly done = signal(false);

  protected async authorize(): Promise<void> {
    this.busy.set(true);
    let ok = true;
    for (const slice of this.slices()) {
      const posted = await this.banking.transferFunds(
        this.fromAccountId(),
        slice.name,
        slice.amount,
        'Allocation',
      );
      ok = ok && posted;
    }
    this.busy.set(false);
    this.done.set(ok);
  }
}
