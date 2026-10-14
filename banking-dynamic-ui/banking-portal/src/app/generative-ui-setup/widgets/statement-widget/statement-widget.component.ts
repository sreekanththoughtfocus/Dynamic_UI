import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BankingStateService } from '../../../core/services/banking.service';

interface WidgetTransaction {
  id: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  type: string;
}

@Component({
  selector: 'bank-statement-widget',
  imports: [CurrencyPipe, DatePipe, FormsModule],
  template: `
    <div class="statement-card">
      <!-- Header -->
      <div class="card-header">
        <div class="header-left">
          <span class="badge-icon">📑</span>
          <div>
            <h4 class="account-title">{{ accountName() }}</h4>
            <span class="account-sub">Account #{{ accountNumber() }}</span>
          </div>
        </div>
        <div class="header-right">
          <span class="balance-label">Current Balance</span>
          <span class="balance-val">{{ balance() | currency: currency() }}</span>
        </div>
      </div>

      <!-- Filter Controls -->
      <div class="controls-row">
        <div class="search-wrap">
          <input
            type="text"
            class="filter-input"
            [(ngModel)]="searchQuery"
            placeholder="Search transactions or category..."
          />
        </div>
        <button class="export-btn" (click)="onExport()" title="Download PDF Statement">
          ⬇ Export PDF
        </button>
      </div>

      <!-- Transactions List -->
      <div class="transactions-table-wrap">
        <table class="tx-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th class="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            @for (tx of filteredTransactions(); track tx.id) {
              <tr class="tx-row">
                <td class="date-cell">{{ tx.date | date: 'MMM dd, yyyy' }}</td>
                <td class="desc-cell">
                  <strong>{{ tx.description }}</strong>
                </td>
                <td>
                  <span class="cat-pill">{{ tx.category }}</span>
                </td>
                <td
                  class="amount-cell text-right"
                  [class.is-credit]="tx.amount > 0"
                  [class.is-debit]="tx.amount < 0"
                >
                  {{ tx.amount > 0 ? '+' : '' }}{{ tx.amount | currency: currency() }}
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="4" class="empty-cell">No transactions matching filter.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <!-- Footer Info -->
      <div class="card-footer">
        <span>Verified by Core Banking Ledger</span>
        <span class="security-tag">🔒 End-to-End Encrypted</span>
      </div>
    </div>
  `,
  styles: `
    .statement-card {
      background: linear-gradient(180deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95));
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: 14px;
      padding: 16px;
      color: #f8fafc;
      font-size: 0.85rem;
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
    }
    .account-title {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 700;
      color: #38bdf8;
    }
    .account-sub {
      font-size: 0.72rem;
      color: #94a3b8;
    }
    .header-right {
      text-align: right;
    }
    .balance-label {
      display: block;
      font-size: 0.68rem;
      text-transform: uppercase;
      color: #94a3b8;
      letter-spacing: 0.04em;
    }
    .balance-val {
      font-size: 1.1rem;
      font-weight: 800;
      color: #10b981;
    }

    .controls-row {
      display: flex;
      gap: 8px;
      margin: 12px 0;
    }
    .search-wrap {
      flex: 1;
    }
    .filter-input {
      width: 100%;
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      padding: 6px 12px;
      color: #f8fafc;
      font-size: 0.78rem;
      outline: none;
    }
    .filter-input:focus {
      border-color: #38bdf8;
    }
    .export-btn {
      background: rgba(14, 165, 233, 0.15);
      border: 1px solid rgba(14, 165, 233, 0.3);
      color: #38bdf8;
      border-radius: 8px;
      padding: 6px 12px;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
    }
    .export-btn:hover {
      background: #0ea5e9;
      color: #fff;
    }

    .transactions-table-wrap {
      max-height: 220px;
      overflow-y: auto;
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 8px;
      background: rgba(11, 19, 38, 0.6);
    }
    .tx-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.76rem;
    }
    .tx-table th {
      position: sticky;
      top: 0;
      background: #0f172a;
      text-align: left;
      padding: 8px 10px;
      color: #64748b;
      font-weight: 600;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .tx-table td {
      padding: 8px 10px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    }
    .date-cell {
      color: #94a3b8;
      white-space: nowrap;
    }
    .desc-cell strong {
      color: #e2e8f0;
    }
    .cat-pill {
      display: inline-block;
      padding: 2px 6px;
      background: rgba(255, 255, 255, 0.06);
      border-radius: 4px;
      font-size: 0.68rem;
      color: #cbd5e1;
    }
    .text-right {
      text-align: right;
    }
    .amount-cell {
      font-weight: 700;
      white-space: nowrap;
    }
    .is-credit {
      color: #34d399;
    }
    .is-debit {
      color: #f87171;
    }
    .empty-cell {
      text-align: center;
      padding: 18px;
      color: #64748b;
    }

    .card-footer {
      display: flex;
      justify-content: space-between;
      margin-top: 10px;
      font-size: 0.68rem;
      color: #64748b;
    }
    .security-tag {
      color: #34d399;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatementWidgetComponent {
  private readonly banking = inject(BankingStateService);

  public readonly accountName = input<string>('Premier Checking');
  public readonly accountNumber = input<string>('CHK-98214-01');
  public readonly balance = input<number>(24890.75);
  public readonly currency = input<string>('USD');
  public readonly transactions = input<WidgetTransaction[]>([]);

  protected readonly searchQuery = signal('');

  protected readonly filteredTransactions = computed(() => {
    const list = this.transactions() ?? [];
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return list;
    return list.filter(
      (tx) =>
        tx.description.toLowerCase().includes(q) ||
        tx.category.toLowerCase().includes(q),
    );
  });

  protected onExport(): void {
    this.banking.showToast(
      `📥 Downloaded official statement PDF for ${this.accountName()}!`,
    );
  }
}
