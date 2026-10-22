import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';

interface InsightTx {
  id: string;
  date: string;
  description: string;
  amount: number;
}

@Component({
  selector: 'bank-merchant-insight-widget',
  imports: [CurrencyPipe, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="insight-card">
      <header>
        <h4>{{ merchant() }}</h4>
        <p>{{ count() }} posts · average {{ averageAmount() | currency: 'USD' }} · latest {{ latestAmount() | currency: 'USD' }} on {{ latestDate() | date: 'mediumDate' }}</p>
      </header>
      @for (tx of transactions(); track tx.id) {
        <div class="row">
          <span>{{ tx.date | date: 'mediumDate' }}</span>
          <strong>{{ tx.amount | currency: 'USD' }}</strong>
        </div>
      }
    </section>
  `,
  styles: `
    .insight-card { color: #f8fafc; display: flex; flex-direction: column; gap: 6px; }
    h4 { margin: 0; color: #7dd3fc; }
    p, span { margin: 0; color: #94a3b8; font-size: 0.75rem; }
    .row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,.08); }
  `,
})
export class MerchantInsightWidgetComponent {
  readonly merchant = input('Merchant');
  readonly count = input(0);
  readonly latestAmount = input(0);
  readonly averageAmount = input(0);
  readonly latestDate = input('');
  readonly transactions = input<InsightTx[]>([]);
}
