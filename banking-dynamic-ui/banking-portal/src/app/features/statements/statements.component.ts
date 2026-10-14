import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BankingStateService } from '../../core/services/banking.service';
import { GenUiService } from 'generative-ui';

@Component({
  selector: 'bank-statements',
  imports: [CurrencyPipe, DatePipe, FormsModule],
  template: `
    <div class="statements-page">
      <div class="page-header">
        <div>
          <h1 class="page-title">Accounts & Statements</h1>
          <p class="page-sub">Export certified monthly statements and review verified ledger transactions.</p>
        </div>
        <div class="header-btns">
          <button class="ai-filter-btn" (click)="askAiSummary()">
            🤖 Ask AI to Analyze Spending
          </button>
        </div>
      </div>

      <!-- Account Selector Tabs -->
      <div class="account-tabs">
        @for (acc of banking.accounts(); track acc.id) {
          <button
            class="tab-btn"
            [class.active]="selectedAccount()?.id === acc.id"
            (click)="selectAccount(acc.id)"
          >
            <span class="tab-type">{{ acc.accountType }}</span>
            <span class="tab-bal">{{ acc.balance | currency: acc.currency }}</span>
          </button>
        }
      </div>

      <!-- Filter Controls Bar -->
      <div class="filter-bar">
        <div class="search-field">
          <input
            type="text"
            class="search-input"
            [(ngModel)]="searchQuery"
            placeholder="Search transactions, merchants, categories..."
          />
        </div>
        <select class="category-select" [(ngModel)]="selectedCategory">
          <option value="all">All Categories</option>
          <option value="Cloud & Tech">Cloud & Tech</option>
          <option value="Groceries">Groceries</option>
          <option value="Income">Income / Payroll</option>
          <option value="Travel">Travel & Airlines</option>
          <option value="Dining">Dining</option>
          <option value="Electronics">Electronics</option>
        </select>
        <button class="export-pdf-btn" (click)="exportStatement()">
          ⬇ Download Official PDF
        </button>
      </div>

      <!-- Statements Table -->
      <div class="table-container">
        <table class="statements-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Transaction Date</th>
              <th>Description / Merchant</th>
              <th>Category</th>
              <th>Type</th>
              <th class="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            @for (tx of filteredTransactions(); track tx.id) {
              <tr class="data-row">
                <td>
                  <span class="status-pill">{{ tx.status }}</span>
                </td>
                <td class="date-col">{{ tx.date | date: 'mediumDate' }}</td>
                <td class="desc-col">
                  <strong>{{ tx.description }}</strong>
                </td>
                <td>
                  <span class="category-tag">{{ tx.category }}</span>
                </td>
                <td class="type-col">{{ tx.type }}</td>
                <td class="text-right amount-col" [class.pos]="tx.amount > 0" [class.neg]="tx.amount < 0">
                  {{ tx.amount > 0 ? '+' : '' }}{{ tx.amount | currency: 'USD' }}
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="6" class="no-results">
                  No transaction records matched your filter criteria.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: `
    .statements-page {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      flex-wrap: wrap;
      gap: 12px;
    }
    .page-title {
      margin: 0;
      font-size: 1.6rem;
      font-weight: 800;
      color: #f8fafc;
    }
    .page-sub {
      margin: 4px 0 0;
      font-size: 0.88rem;
      color: #94a3b8;
    }
    .ai-filter-btn {
      background: linear-gradient(135deg, #0284c7, #2563eb);
      color: #fff;
      border: none;
      padding: 10px 18px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(14, 165, 233, 0.4);
      transition: all 0.2s;
    }
    .ai-filter-btn:hover {
      transform: translateY(-1px);
    }

    /* Tabs */
    .account-tabs {
      display: flex;
      gap: 12px;
      overflow-x: auto;
      padding-bottom: 4px;
    }
    .tab-btn {
      flex: 1;
      min-width: 200px;
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 14px 16px;
      text-align: left;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 4px;
      transition: all 0.2s;
    }
    .tab-btn.active {
      background: rgba(14, 165, 233, 0.12);
      border-color: #38bdf8;
      box-shadow: 0 0 15px rgba(56, 189, 248, 0.2);
    }
    .tab-type {
      font-size: 0.76rem;
      color: #94a3b8;
    }
    .tab-bal {
      font-size: 1.15rem;
      font-weight: 800;
      color: #f8fafc;
    }

    /* Filter Bar */
    .filter-bar {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .search-field {
      flex: 1;
      min-width: 240px;
    }
    .search-input {
      width: 100%;
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      padding: 10px 14px;
      color: #f8fafc;
      font-size: 0.85rem;
      outline: none;
    }
    .search-input:focus {
      border-color: #38bdf8;
    }
    .category-select {
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      padding: 10px 14px;
      color: #f8fafc;
      font-size: 0.85rem;
      outline: none;
    }
    .export-pdf-btn {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 10px;
      padding: 10px 16px;
      color: #cbd5e1;
      font-weight: 600;
      font-size: 0.82rem;
      cursor: pointer;
      transition: all 0.2s;
    }
    .export-pdf-btn:hover {
      background: rgba(255, 255, 255, 0.15);
      color: #fff;
    }

    /* Table */
    .table-container {
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      overflow-x: auto;
    }
    .statements-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }
    .statements-table th {
      background: rgba(11, 19, 38, 0.8);
      padding: 14px 16px;
      text-align: left;
      font-weight: 600;
      color: #64748b;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .statements-table td {
      padding: 14px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      color: #e2e8f0;
    }
    .data-row:hover {
      background: rgba(30, 41, 59, 0.4);
    }
    .status-pill {
      background: rgba(16, 185, 129, 0.12);
      color: #34d399;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 0.72rem;
      font-weight: 600;
    }
    .date-col {
      color: #94a3b8;
      white-space: nowrap;
    }
    .category-tag {
      background: rgba(255, 255, 255, 0.06);
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 0.75rem;
      color: #cbd5e1;
    }
    .type-col {
      color: #94a3b8;
    }
    .text-right {
      text-align: right;
    }
    .amount-col {
      font-weight: 700;
      white-space: nowrap;
    }
    .amount-col.pos { color: #34d399; }
    .amount-col.neg { color: #f8fafc; }
    .no-results {
      text-align: center;
      padding: 30px;
      color: #64748b;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatementsComponent {
  protected readonly banking = inject(BankingStateService);
  protected readonly genUi = inject(GenUiService);

  protected readonly searchQuery = signal('');
  protected readonly selectedCategory = signal('all');

  protected readonly selectedAccount = computed(() => {
    const id = this.banking.selectedAccountId();
    return this.banking.accounts().find((a) => a.id === id) ?? this.banking.accounts()[0];
  });

  protected readonly filteredTransactions = computed(() => {
    let list = this.banking.transactions();
    const q = this.searchQuery().toLowerCase().trim();
    const cat = this.selectedCategory();

    if (q) {
      list = list.filter(
        (t) =>
          t.description.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q),
      );
    }
    if (cat !== 'all') {
      list = list.filter((t) => t.category === cat);
    }
    return list;
  });

  protected selectAccount(id: string): void {
    this.banking.selectedAccountId.set(id);
  }

  protected exportStatement(): void {
    this.banking.showToast(
      `📑 Exported monthly statement PDF for ${this.selectedAccount()?.accountType}.`,
    );
  }

  protected askAiSummary(): void {
    this.genUi.openDrawer();
    this.genUi.sendMessage('Analyze my recent spending across categories');
  }
}
