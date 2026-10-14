import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BankingStateService } from '../../core/services/banking.service';
import { GenUiService } from 'generative-ui';

@Component({
  selector: 'bank-dashboard',
  imports: [CurrencyPipe, DatePipe, RouterLink],
  template: `
    <div class="dashboard-page">
      <!-- Top Welcome Banner -->
      <section class="welcome-section">
        <div>
          <span class="greeting-tag">Apex Private Client</span>
          <h1 class="user-greeting">Welcome back, Alex Vance</h1>
          <p class="greeting-sub">Your accounts are protected by multi-factor biometric authentication.</p>
        </div>
        <div class="net-worth-box">
          <span class="nw-label">Total Portfolio Net Worth</span>
          <span class="nw-val">{{ totalNetWorth() | currency: 'USD' }}</span>
          <span class="nw-change">▲ +$2,450.80 (+1.02%) this month</span>
        </div>
      </section>

      <!-- AI Concierge Interactive Showcase Banner -->
      <section class="ai-hero-card">
        <div class="ai-hero-left">
          <div class="ai-pulse-pill">
            <span class="sparkle">✦</span>
            <span>Generative Dynamic UI Active</span>
          </div>
          <h2 class="ai-hero-title">Conversational Banking with Dynamic UI</h2>
          <p class="ai-hero-desc">
            Try asking your AI Concierge to perform banking actions. The assistant doesn't just reply with text—it executes client tools and renders interactive widgets inline!
          </p>
          <div class="ai-chips-list">
            <button class="ai-chip" (click)="askAi('Show my recent checking account statement')">
              📑 "Show my recent checking statement"
            </button>
            <button class="ai-chip" (click)="askAi('I want to reset the PIN for my Debit Card')">
              💳 "Reset PIN for my Debit Card"
            </button>
            <button class="ai-chip" (click)="askAi('Temporarily freeze my Platinum Credit Card')">
              🔒 "Freeze my Credit Card"
            </button>
            <button class="ai-chip" (click)="askAi('Help me reset my online banking password')">
              🔑 "Reset my login password"
            </button>
            <button class="ai-chip" (click)="askAi('Transfer $250 to emergency savings')">
              💸 "Transfer $250 to emergency savings"
            </button>
          </div>
        </div>
        <div class="ai-hero-right">
          <button class="open-ai-btn" (click)="genUi.openDrawer()">
            <span class="btn-glow"></span>
            <span>Launch AI Assistant 🤖</span>
          </button>
        </div>
      </section>

      <!-- Account Cards Grid -->
      <section class="accounts-grid">
        @for (acc of banking.accounts(); track acc.id) {
          <div class="account-card" [class.checking]="acc.accountType.includes('Checking')">
            <div class="acc-top">
              <span class="acc-badge">{{ acc.accountType }}</span>
              <span class="acc-num">{{ acc.accountNumber }}</span>
            </div>
            <div class="acc-middle">
              <span class="bal-label">Available Balance</span>
              <span class="bal-amount">{{ acc.availableBalance | currency: acc.currency }}</span>
            </div>
            <div class="acc-bottom">
              <span class="total-bal">Ledger: {{ acc.balance | currency: acc.currency }}</span>
              <a [routerLink]="['/statements']" class="view-link">View Statements →</a>
            </div>
          </div>
        }
      </section>

      <!-- Recent Activity Section -->
      <section class="activity-section">
        <div class="section-header">
          <div>
            <h3 class="section-title">Recent Transactions</h3>
            <span class="section-sub">Real-time ledger updates across all deposit accounts</span>
          </div>
          <a [routerLink]="['/statements']" class="see-all-link">See All Statements</a>
        </div>

        <div class="tx-card-table">
          @for (tx of recentTransactions(); track tx.id) {
            <div class="tx-item">
              <div class="tx-icon-wrap" [class.is-income]="tx.amount > 0">
                {{ tx.amount > 0 ? '↓' : '↑' }}
              </div>
              <div class="tx-details">
                <span class="tx-desc">{{ tx.description }}</span>
                <span class="tx-meta">{{ tx.category }} • {{ tx.date | date: 'mediumDate' }}</span>
              </div>
              <div class="tx-amount" [class.pos]="tx.amount > 0" [class.neg]="tx.amount < 0">
                {{ tx.amount > 0 ? '+' : '' }}{{ tx.amount | currency: 'USD' }}
              </div>
            </div>
          }
        </div>
      </section>
    </div>
  `,
  styles: `
    .dashboard-page {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    /* Welcome Section */
    .welcome-section {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      flex-wrap: wrap;
      gap: 16px;
      padding-bottom: 8px;
    }
    .greeting-tag {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #38bdf8;
      font-weight: 700;
    }
    .user-greeting {
      margin: 4px 0 0;
      font-size: 1.8rem;
      font-weight: 800;
      color: #f8fafc;
      letter-spacing: -0.02em;
    }
    .greeting-sub {
      margin: 4px 0 0;
      font-size: 0.88rem;
      color: #94a3b8;
    }
    .net-worth-box {
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.8), rgba(30, 41, 59, 0.8));
      border: 1px solid rgba(56, 189, 248, 0.2);
      border-radius: 14px;
      padding: 14px 20px;
      text-align: right;
    }
    .nw-label {
      display: block;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #94a3b8;
    }
    .nw-val {
      font-size: 1.6rem;
      font-weight: 800;
      color: #f8fafc;
      letter-spacing: -0.02em;
    }
    .nw-change {
      display: block;
      font-size: 0.72rem;
      color: #34d399;
      font-weight: 600;
    }

    /* AI Hero Showcase Card */
    .ai-hero-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 24px;
      padding: 24px 28px;
      background: linear-gradient(135deg, rgba(14, 165, 233, 0.12), rgba(99, 102, 241, 0.15), rgba(15, 23, 42, 0.9));
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 20px;
      box-shadow: 0 10px 40px -10px rgba(14, 165, 233, 0.2);
      backdrop-filter: blur(16px);
    }
    .ai-pulse-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: rgba(14, 165, 233, 0.2);
      border: 1px solid rgba(56, 189, 248, 0.4);
      border-radius: 20px;
      font-size: 0.72rem;
      font-weight: 700;
      color: #38bdf8;
      margin-bottom: 10px;
    }
    .sparkle {
      animation: spin 3s infinite linear;
    }
    .ai-hero-title {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 800;
      color: #f8fafc;
    }
    .ai-hero-desc {
      margin: 6px 0 16px;
      font-size: 0.88rem;
      color: #cbd5e1;
      max-width: 680px;
      line-height: 1.5;
    }
    .ai-chips-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .ai-chip {
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 20px;
      padding: 6px 14px;
      color: #93c5fd;
      font-size: 0.78rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .ai-chip:hover {
      background: rgba(14, 165, 233, 0.25);
      border-color: #38bdf8;
      color: #fff;
      transform: translateY(-1px);
    }
    .open-ai-btn {
      position: relative;
      background: linear-gradient(135deg, #0ea5e9, #3b82f6);
      border: none;
      color: white;
      font-weight: 700;
      font-size: 0.95rem;
      padding: 14px 24px;
      border-radius: 14px;
      cursor: pointer;
      white-space: nowrap;
      box-shadow: 0 10px 25px -5px rgba(14, 165, 233, 0.5);
      transition: all 0.25s;
    }
    .open-ai-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 15px 30px -5px rgba(14, 165, 233, 0.7);
    }

    /* Accounts Grid */
    .accounts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 18px;
    }
    .account-card {
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      transition: border-color 0.2s, transform 0.2s;
    }
    .account-card:hover {
      border-color: rgba(56, 189, 248, 0.4);
      transform: translateY(-2px);
    }
    .acc-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .acc-badge {
      font-size: 0.74rem;
      font-weight: 700;
      color: #38bdf8;
    }
    .acc-num {
      font-size: 0.74rem;
      color: #64748b;
      font-family: monospace;
    }
    .bal-label {
      display: block;
      font-size: 0.7rem;
      color: #94a3b8;
      text-transform: uppercase;
    }
    .bal-amount {
      font-size: 1.55rem;
      font-weight: 800;
      color: #f8fafc;
      letter-spacing: -0.02em;
    }
    .acc-bottom {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 10px;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 0.75rem;
    }
    .total-bal {
      color: #94a3b8;
    }
    .view-link {
      color: #38bdf8;
      text-decoration: none;
      font-weight: 600;
    }
    .view-link:hover {
      text-decoration: underline;
    }

    /* Activity Section */
    .activity-section {
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 18px;
      padding: 20px 24px;
    }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .section-title {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 700;
      color: #f8fafc;
    }
    .section-sub {
      font-size: 0.76rem;
      color: #94a3b8;
    }
    .see-all-link {
      color: #38bdf8;
      font-size: 0.82rem;
      font-weight: 600;
      text-decoration: none;
    }
    .tx-card-table {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .tx-item {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 10px 14px;
      background: rgba(30, 41, 59, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 12px;
      transition: background 0.2s;
    }
    .tx-item:hover {
      background: rgba(30, 41, 59, 0.8);
    }
    .tx-icon-wrap {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
      font-weight: 700;
    }
    .tx-icon-wrap.is-income {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
    }
    .tx-details {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .tx-desc {
      font-size: 0.88rem;
      font-weight: 600;
      color: #e2e8f0;
    }
    .tx-meta {
      font-size: 0.72rem;
      color: #94a3b8;
    }
    .tx-amount {
      font-size: 0.95rem;
      font-weight: 700;
    }
    .tx-amount.pos { color: #34d399; }
    .tx-amount.neg { color: #f8fafc; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  protected readonly banking = inject(BankingStateService);
  protected readonly genUi = inject(GenUiService);

  protected readonly totalNetWorth = computed(() => {
    return this.banking
      .accounts()
      .reduce((sum, acc) => sum + acc.balance, 0);
  });

  protected readonly recentTransactions = computed(() => {
    return this.banking.transactions().slice(0, 5);
  });

  protected askAi(prompt: string): void {
    this.genUi.openDrawer();
    this.genUi.sendMessage(prompt);
  }
}
