import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CurrencyPipe } from '@angular/common';

@Component({
  selector: 'bank-forecast-widget',
  imports: [CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="insight-card">
      <header>
        <h4>{{ accountName() }} month-end</h4>
        <p class="projected">{{ projectedEndBalance() | currency: 'USD' }}</p>
      </header>
      <div class="stats">
        <span>Balance now<strong>{{ currentBalance() | currency: 'USD' }}</strong></span>
        <span>In this month<strong>{{ incomeThisMonth() | currency: 'USD' }}</strong></span>
        <span>Out this month<strong>{{ spentThisMonth() | currency: 'USD' }}</strong></span>
        <span>Still expected<strong>{{ projectedExtraSpend() | currency: 'USD' }}</strong></span>
      </div>
      <p>{{ daysRemaining() }} days left in the month. The projection uses the prior two months of posted activity on this account.</p>
    </section>
  `,
  styles: `
    .insight-card { color: #f8fafc; display: flex; flex-direction: column; gap: 8px; }
    h4 { margin: 0; color: #7dd3fc; }
    .projected { margin: 0; font-size: 1.6rem; font-weight: 800; }
    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .stats span { display: flex; flex-direction: column; font-size: 0.7rem; color: #94a3b8; background: rgba(15,23,42,.65); border-radius: 8px; padding: 8px; }
    .stats strong { color: #f8fafc; font-size: 0.95rem; }
    p { margin: 0; color: #94a3b8; font-size: 0.75rem; }
  `,
})
export class ForecastWidgetComponent {
  readonly accountName = input('Checking');
  readonly currentBalance = input(0);
  readonly projectedEndBalance = input(0);
  readonly incomeThisMonth = input(0);
  readonly spentThisMonth = input(0);
  readonly projectedExtraSpend = input(0);
  readonly daysRemaining = input(0);
}
