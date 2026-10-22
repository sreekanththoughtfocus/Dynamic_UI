import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { GenUiService } from 'generative-ui';

interface SubscriptionRow {
  merchant: string;
  category: string;
  typicalAmount: number;
  occurrences: number;
  cadence: string;
  lastDate: string;
}

@Component({
  selector: 'bank-subscription-widget',
  imports: [CurrencyPipe, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="insight-card">
      <header>
        <h4>Recurring charges</h4>
        <p>Monthly {{ monthlyTotal() | currency: 'USD' }} · about {{ yearlyTotal() | currency: 'USD' }} a year</p>
      </header>
      @if (items().length === 0) {
        <p class="muted">No stable repeating merchants on this account.</p>
      } @else {
        @for (item of items(); track item.merchant) {
          <div class="row">
            <div>
              <strong>{{ item.merchant }}</strong>
              <span class="muted">{{ item.category }} · {{ item.cadence }} · {{ item.occurrences }} posts · last {{ item.lastDate | date: 'mediumDate' }}</span>
            </div>
            <strong>{{ item.typicalAmount | currency: 'USD' }}</strong>
          </div>
        }
      }
      <button type="button" class="linkish" (click)="ask()">Review unusual charges</button>
    </section>
  `,
  styles: `
    .insight-card { color: #f8fafc; display: flex; flex-direction: column; gap: 8px; }
    .insight-card h4 { margin: 0; color: #7dd3fc; font-size: 0.95rem; }
    .insight-card p { margin: 0; color: #cbd5e1; font-size: 0.78rem; }
    .row { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,.08); }
    .row div { display: flex; flex-direction: column; gap: 2px; }
    .muted { color: #94a3b8; font-size: 0.72rem; }
    .linkish { align-self: flex-start; background: transparent; color: #7dd3fc; border: 1px solid rgba(125,211,252,.35); border-radius: 8px; padding: 8px 12px; font-weight: 700; cursor: pointer; }
    button:focus-visible { outline: 2px solid #22d3ee; outline-offset: 2px; }
  `,
})
export class SubscriptionWidgetComponent {
  private readonly genUi = inject(GenUiService);
  readonly monthlyTotal = input(0);
  readonly yearlyTotal = input(0);
  readonly items = input<SubscriptionRow[]>([]);

  protected ask(): void {
    void this.genUi.sendMessage('Anything unusual on my checking account?');
  }
}
