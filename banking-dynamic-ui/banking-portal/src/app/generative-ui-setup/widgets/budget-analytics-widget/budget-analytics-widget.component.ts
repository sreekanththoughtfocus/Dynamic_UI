import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { BankingStateService } from '../../../core/services/banking.service';

export interface BudgetItem {
  category: string;
  spent: number;
  limit: number;
  icon: string;
}

@Component({
  selector: 'bank-budget-analytics-widget',
  imports: [CurrencyPipe, DecimalPipe],
  template: `
    <div class="budget-card">
      <!-- Header -->
      <div class="card-header">
        <div class="header-left">
          <span class="badge-icon">🎯</span>
          <div>
            <h4 class="card-title">{{ title() }}</h4>
            <span class="card-sub">{{ month() }} Spending Limits</span>
          </div>
        </div>
        <div class="header-right">
          <span class="status-pill" [class.warning]="overallUsage() > 80">
            {{ overallUsage() | number: '1.0-0' }}% Used
          </span>
        </div>
      </div>

      <!-- Overall Summary Progress -->
      <div class="overall-progress-box">
        <div class="progress-labels">
          <span class="spent-label">
            Spent: <strong>{{ totalSpent() | currency: currency() }}</strong>
          </span>
          <span class="limit-label">
            Limit: {{ totalLimit() | currency: currency() }}
          </span>
        </div>
        <div class="progress-bar-container">
          <div
            class="progress-fill"
            [style.width.%]="overallUsage()"
            [class.high]="overallUsage() > 80"
            [class.exceeded]="overallUsage() >= 100"
          ></div>
        </div>
        <div class="remaining-row">
          <span>Remaining Allowance:</span>
          <strong class="remaining-val">
            {{ remainingBudget() | currency: currency() }}
          </strong>
        </div>
      </div>

      <!-- Categories List -->
      <div class="category-list">
        @for (item of processedItems(); track item.category) {
          <div class="category-row">
            <div class="category-info">
              <span class="cat-icon">{{ item.icon }}</span>
              <div class="cat-meta">
                <span class="cat-name">{{ item.category }}</span>
                <span class="cat-fraction">
                  {{ item.spent | currency: currency() }} / {{ item.limit | currency: currency() }}
                </span>
              </div>
            </div>
            <div class="cat-meter-wrap">
              <div class="meter-bar">
                <div
                  class="meter-fill"
                  [style.width.%]="item.pct"
                  [class.warning]="item.pct > 75 && item.pct <= 100"
                  [class.danger]="item.pct > 100"
                ></div>
              </div>
              <span
                class="status-tag"
                [class.tag-ok]="item.pct <= 75"
                [class.tag-warn]="item.pct > 75 && item.pct <= 100"
                [class.tag-danger]="item.pct > 100"
              >
                {{ item.statusText }}
              </span>
            </div>
          </div>
        }
      </div>

      <!-- Footer -->
      <div class="card-footer">
        <button type="button" class="action-btn" (click)="onAutoOptimize()">
          ⚡ Auto-Optimize Allocations
        </button>
        <button type="button" class="action-btn primary" (click)="onSaveBudget()">
          💾 Save Limits
        </button>
      </div>
    </div>
  `,
  styles: `
    .budget-card {
      padding: 16px;
      color: #f8fafc;
      font-family: inherit;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .badge-icon {
      font-size: 1.4rem;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.3);
      padding: 6px;
      border-radius: 10px;
    }
    .card-title {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 700;
      color: #34d399;
    }
    .card-sub {
      font-size: 0.72rem;
      color: #94a3b8;
    }
    .status-pill {
      font-size: 0.72rem;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 12px;
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .status-pill.warning {
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      border-color: rgba(245, 158, 11, 0.3);
    }

    /* Overall progress */
    .overall-progress-box {
      margin: 12px 0 16px;
      padding: 12px;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 10px;
    }
    .progress-labels {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      margin-bottom: 6px;
    }
    .spent-label strong {
      color: #38bdf8;
    }
    .limit-label {
      color: #94a3b8;
    }
    .progress-bar-container {
      height: 8px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 8px;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #10b981, #0ea5e9);
      border-radius: 4px;
      transition: width 0.3s ease;
    }
    .progress-fill.high {
      background: linear-gradient(90deg, #f59e0b, #ef4444);
    }
    .progress-fill.exceeded {
      background: #ef4444;
    }
    .remaining-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.72rem;
      color: #94a3b8;
    }
    .remaining-val {
      color: #34d399;
    }

    /* Category list */
    .category-list {
      display: flex;
      flex-direction: column;
      gap: 9px;
    }
    .category-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 10px;
      background: rgba(15, 23, 42, 0.45);
      border-radius: 8px;
      gap: 12px;
    }
    .category-info {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 140px;
    }
    .cat-icon {
      font-size: 1.1rem;
    }
    .cat-meta {
      display: flex;
      flex-direction: column;
    }
    .cat-name {
      font-size: 0.75rem;
      font-weight: 600;
      color: #f1f5f9;
    }
    .cat-fraction {
      font-size: 0.68rem;
      color: #94a3b8;
    }
    .cat-meter-wrap {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .meter-bar {
      flex: 1;
      height: 6px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 3px;
      overflow: hidden;
    }
    .meter-fill {
      height: 100%;
      background: #10b981;
      border-radius: 3px;
      transition: width 0.3s;
    }
    .meter-fill.warning {
      background: #f59e0b;
    }
    .meter-fill.danger {
      background: #ef4444;
    }
    .status-tag {
      font-size: 0.65rem;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 600;
      white-space: nowrap;
    }
    .tag-ok {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
    }
    .tag-warn {
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
    }
    .tag-danger {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
    }

    /* Footer */
    .card-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 14px;
      padding-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }
    .action-btn {
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 0.74rem;
      font-weight: 600;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.06);
      color: #cbd5e1;
      cursor: pointer;
      transition: all 0.2s;
    }
    .action-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #ffffff;
    }
    .action-btn.primary {
      background: rgba(16, 185, 129, 0.2);
      border-color: rgba(16, 185, 129, 0.4);
      color: #34d399;
    }
    .action-btn.primary:hover {
      background: rgba(16, 185, 129, 0.3);
      color: #a7f3d0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BudgetAnalyticsWidgetComponent {
  private readonly banking = inject(BankingStateService);

  public readonly title = input<string>('Monthly Budget Tracker');
  public readonly month = input<string>('Current Cycle');
  public readonly currency = input<string>('USD');
  public readonly items = input<BudgetItem[]>([
    { category: 'Tech & Cloud', spent: 2841.5, limit: 3500.0, icon: '💻' },
    { category: 'Travel & Flights', spent: 1240.0, limit: 1500.0, icon: '✈️' },
    { category: 'Groceries & Market', spent: 485.2, limit: 600.0, icon: '🛒' },
    { category: 'Health & Wellness', spent: 280.0, limit: 300.0, icon: '🧘' },
    { category: 'Dining & Out', spent: 245.8, limit: 250.0, icon: '🍽️' },
    { category: 'Utilities & Telecom', spent: 195.0, limit: 250.0, icon: '⚡' },
  ]);

  protected readonly totalSpent = computed(() => {
    return this.items().reduce((sum, i) => sum + i.spent, 0);
  });

  protected readonly totalLimit = computed(() => {
    return this.items().reduce((sum, i) => sum + i.limit, 0);
  });

  protected readonly remainingBudget = computed(() => {
    return Math.max(0, this.totalLimit() - this.totalSpent());
  });

  protected readonly overallUsage = computed(() => {
    const lim = this.totalLimit();
    if (!lim) return 0;
    return Math.min(100, (this.totalSpent() / lim) * 100);
  });

  protected readonly processedItems = computed(() => {
    return this.items().map((item) => {
      const pct = item.limit > 0 ? (item.spent / item.limit) * 100 : 0;
      let statusText = 'On Track';
      if (pct > 100) statusText = 'Exceeded';
      else if (pct > 75) statusText = 'Near Limit';
      return {
        ...item,
        pct: Math.min(100, pct),
        statusText,
      };
    });
  });

  protected onAutoOptimize(): void {
    this.banking.showToast(
      '⚡ AI Budget Optimizer: Rebalanced unused utility headroom into Travel reserve!',
    );
  }

  protected onSaveBudget(): void {
    this.banking.showToast('💾 Updated monthly budget targets saved to core banking.');
  }
}
