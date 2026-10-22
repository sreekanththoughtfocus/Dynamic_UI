import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { GenUiService } from 'generative-ui';

interface AnomalyRow {
  transactionId: string;
  date: string;
  description: string;
  amount: number;
  reason: string;
}

@Component({
  selector: 'bank-activity-review-widget',
  imports: [CurrencyPipe, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="insight-card">
      <header>
        <h4>Unusual activity</h4>
        <p>Compared with this account's own posted history.</p>
      </header>
      @if (items().length === 0) {
        <p class="muted">Nothing stood out.</p>
      } @else {
        @for (item of items(); track item.transactionId) {
          <div class="row">
            <div>
              <strong>{{ item.description }}</strong>
              <span class="muted">{{ item.date | date: 'mediumDate' }} · {{ item.reason }}</span>
            </div>
            <div class="actions">
              <strong>{{ item.amount | currency: 'USD' }}</strong>
              <button type="button" class="linkish" (click)="dispute(item)">Dispute</button>
            </div>
          </div>
        }
      }
    </section>
  `,
  styles: `
    .insight-card { color: #f8fafc; display: flex; flex-direction: column; gap: 8px; }
    .insight-card h4 { margin: 0; color: #fbbf24; font-size: 0.95rem; }
    .insight-card p, .muted { margin: 0; color: #94a3b8; font-size: 0.75rem; }
    .row { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,.08); }
    .row div { display: flex; flex-direction: column; gap: 4px; }
    .actions { align-items: flex-end; }
    .linkish { background: transparent; color: #7dd3fc; border: 1px solid rgba(125,211,252,.35); border-radius: 8px; padding: 4px 8px; cursor: pointer; font-weight: 700; }
    button:focus-visible { outline: 2px solid #22d3ee; outline-offset: 2px; }
  `,
})
export class ActivityReviewWidgetComponent {
  private readonly genUi = inject(GenUiService);
  readonly items = input<AnomalyRow[]>([]);

  protected dispute(item: AnomalyRow): void {
    void this.genUi.sendMessage(`Dispute the ${item.description} charge`);
  }
}
