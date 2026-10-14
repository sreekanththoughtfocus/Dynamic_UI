import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import { CurrencyPipe, DatePipe, JsonPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BankingStateService } from '../../core/services/banking.service';
import { DatabaseOverview, UserAccount, BankTransaction } from '../../core/models/banking.models';

@Component({
  selector: 'bank-admin',
  imports: [CurrencyPipe, DatePipe, JsonPipe, FormsModule],
  template: `
    <div class="admin-dashboard">
      <!-- Admin Header -->
      <div class="admin-header">
        <div>
          <div class="header-tag">
            <span class="badge-dot"></span>
            <span>SYSTEM CONSOLE • SQLITE & ENTITY FRAMEWORK CORE 10</span>
          </div>
          <h1 class="page-title">Enterprise DB & User Management Admin</h1>
          <p class="page-sub">
            Validate real-time database persistence, inspect user credentials & passwords, monitor AI audit logs, and test ledger transactions.
          </p>
        </div>

        <div class="header-actions">
          <button class="action-btn sync-btn" (click)="loadOverview()" [disabled]="isLoading()">
            <span class="sync-icon" [class.spinning]="isLoading()">🔄</span>
            <span>Sync EF Core Database</span>
          </button>
          <button class="action-btn reset-btn" (click)="onResetDatabase()" [disabled]="isLoading()">
            <span>⚠️ Reset & Re-Seed DB</span>
          </button>
        </div>
      </div>

      <!-- Quick Metrics Ribbon -->
      <div class="metrics-grid">
        <div class="metric-card">
          <span class="metric-label">Registered Users</span>
          <span class="metric-val text-cyan">{{ overview()?.users?.length ?? 0 }}</span>
          <span class="metric-foot">1 Active Session</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">Bank Accounts</span>
          <span class="metric-val text-emerald">{{ overview()?.accounts?.length ?? 0 }}</span>
          <span class="metric-foot">Premier Checking, Savings, Portfolio</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">Active Cards</span>
          <span class="metric-val text-indigo">{{ overview()?.cards?.length ?? 0 }}</span>
          <span class="metric-foot">HSM Protected & PIN Stored</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">Ledger Transactions</span>
          <span class="metric-val text-amber">{{ overview()?.transactions?.length ?? 0 }}</span>
          <span class="metric-foot">Double-Entry Core Ledger</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">AI Audit Entries</span>
          <span class="metric-val text-purple">{{ overview()?.auditLogs?.length ?? 0 }}</span>
          <span class="metric-foot">Immutable Security Trail</span>
        </div>
      </div>

      <!-- Status Benchmark Ribbon -->
      <div class="status-ribbon">
        <div class="ribbon-item">
          <span class="r-label">ORM Provider:</span>
          <span class="r-val text-cyan">{{ overview()?.databaseProvider ?? 'Entity Framework Core 10 (SQLite)' }}</span>
        </div>
        <div class="ribbon-item">
          <span class="r-label">Database File:</span>
          <span class="r-val font-mono">banking-api/banking.db</span>
        </div>
        <div class="ribbon-item">
          <span class="r-label">Sync Latency:</span>
          <span class="r-val text-emerald">{{ latencyMs() }} ms</span>
        </div>
        <div class="ribbon-item">
          <span class="r-label">Last Validated:</span>
          <span class="r-val">{{ lastSyncTime() | date: 'HH:mm:ss' }}</span>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div class="admin-tabs-bar">
        <button
          class="tab-btn"
          [class.active]="activeTab() === 'users'"
          (click)="activeTab.set('users')"
        >
          👤 User Credentials & Passwords ({{ overview()?.users?.length ?? 0 }})
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab() === 'accounts'"
          (click)="activeTab.set('accounts')"
        >
          🏦 Accounts Ledger ({{ overview()?.accounts?.length ?? 0 }})
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab() === 'cards'"
          (click)="activeTab.set('cards')"
        >
          💳 Cards & PINs ({{ overview()?.cards?.length ?? 0 }})
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab() === 'transactions'"
          (click)="activeTab.set('transactions')"
        >
          📜 Transactions ({{ overview()?.transactions?.length ?? 0 }})
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab() === 'audit'"
          (click)="activeTab.set('audit')"
        >
          🤖 AI Audit Trail ({{ overview()?.auditLogs?.length ?? 0 }})
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab() === 'raw'"
          (click)="activeTab.set('raw')"
        >
          🔍 Raw SQLite JSON
        </button>
      </div>

      <!-- TAB 1: USER MANAGEMENT & PASSWORDS -->
      @if (activeTab() === 'users') {
        <section class="tab-content-panel">
          <div class="panel-header">
            <div>
              <h3 class="panel-title">User Accounts & Credentials Explorer</h3>
              <p class="panel-desc">
                Validates the credentials saved in the user portal (including plaintext passwords for verification, phone, and 2FA status).
              </p>
            </div>
            <button class="pill-action-btn" (click)="onOpenEditUserModal(selectedUser())">
              ✏️ Edit Selected User
            </button>
          </div>

          <div class="users-grid">
            @for (u of overview()?.users ?? []; track u.id) {
              <div class="user-detail-card" [class.selected]="selectedUser()?.id === u.id" (click)="selectedUser.set(u)">
                <div class="user-card-top">
                  <div class="u-avatar">{{ u.fullName.charAt(0) }}</div>
                  <div>
                    <h4 class="u-name">{{ u.fullName }}</h4>
                    <span class="u-role">{{ u.role }}</span>
                  </div>
                  <span class="status-pill active-pill">Active Client</span>
                </div>

                <div class="credentials-table">
                  <div class="cred-row">
                    <span class="c-key">User ID:</span>
                    <span class="c-val font-mono">{{ u.id }}</span>
                  </div>
                  <div class="cred-row">
                    <span class="c-key">Username:</span>
                    <span class="c-val font-mono">{{ u.username }}</span>
                  </div>
                  <div class="cred-row highlight-cred">
                    <span class="c-key">Current Password:</span>
                    <div class="password-display">
                      @if (showPassword()) {
                        <span class="c-val pwd-text">{{ u.password }}</span>
                      } @else {
                        <span class="c-val font-mono">•••••••••••••</span>
                      }
                      <button
                        type="button"
                        class="toggle-eye-btn"
                        (click)="showPassword.set(!showPassword()); $event.stopPropagation()"
                        title="Toggle password visibility"
                      >
                        {{ showPassword() ? '👁️‍🗨️ Hide' : '👁️ Show' }}
                      </button>
                    </div>
                  </div>
                  <div class="cred-row">
                    <span class="c-key">Email Address:</span>
                    <span class="c-val">{{ u.email }}</span>
                  </div>
                  <div class="cred-row">
                    <span class="c-key">Mobile Phone:</span>
                    <span class="c-val">{{ u.phoneNumber }}</span>
                  </div>
                  <div class="cred-row">
                    <span class="c-key">Registered Address:</span>
                    <span class="c-val">{{ u.address }}</span>
                  </div>
                  <div class="cred-row">
                    <span class="c-key">Two-Factor Authentication:</span>
                    <span class="c-val" [class.text-emerald]="u.twoFactorEnabled">
                      {{ u.twoFactorEnabled ? '✓ Enabled (Mandatory for Wires)' : '✕ Disabled' }}
                    </span>
                  </div>
                  <div class="cred-row">
                    <span class="c-key">Biometrics (WebAuthn):</span>
                    <span class="c-val text-emerald">
                      {{ u.biometricsEnabled ? '✓ Armed (Touch ID / Face ID)' : '✕ Disabled' }}
                    </span>
                  </div>
                  <div class="cred-row">
                    <span class="c-key">Last Password Reset:</span>
                    <span class="c-val text-cyan">{{ u.lastPasswordResetAt | date: 'medium' }}</span>
                  </div>
                </div>

                <div class="user-card-footer">
                  <button class="card-btn-action" (click)="onOpenEditUserModal(u); $event.stopPropagation()">
                    Update Credentials in SQLite
                  </button>
                </div>
              </div>
            }
          </div>

          <!-- Edit User Credentials Modal / Inline Box -->
          @if (editingUser(); as editModel) {
            <div class="modal-backdrop" (click)="editingUser.set(null)">
              <div class="modal-card" (click)="$event.stopPropagation()">
                <div class="modal-header">
                  <h3>Edit User Credentials in SQLite (EF Core)</h3>
                  <button class="modal-close" (click)="editingUser.set(null)">✕</button>
                </div>
                <div class="modal-body">
                  <div class="form-grid">
                    <div class="field">
                      <label>Full Name</label>
                      <input type="text" [(ngModel)]="editModel.fullName" class="admin-input" />
                    </div>
                    <div class="field">
                      <label>Username</label>
                      <input type="text" [(ngModel)]="editModel.username" class="admin-input" />
                    </div>
                    <div class="field full-width">
                      <label>Password (Stored in Database)</label>
                      <input type="text" [(ngModel)]="editModel.password" class="admin-input highlight-input" />
                      <span class="field-hint">Updating this directly changes the password in SQLite table "Users".</span>
                    </div>
                    <div class="field">
                      <label>Email Address</label>
                      <input type="email" [(ngModel)]="editModel.email" class="admin-input" />
                    </div>
                    <div class="field">
                      <label>Phone Number</label>
                      <input type="text" [(ngModel)]="editModel.phoneNumber" class="admin-input" />
                    </div>
                    <div class="field full-width">
                      <label>Address</label>
                      <input type="text" [(ngModel)]="editModel.address" class="admin-input" />
                    </div>
                    <div class="field">
                      <label>Role / Tier</label>
                      <input type="text" [(ngModel)]="editModel.role" class="admin-input" />
                    </div>
                  </div>
                </div>
                <div class="modal-footer">
                  <button class="btn-secondary" (click)="editingUser.set(null)">Cancel</button>
                  <button class="btn-primary" (click)="onSaveUserChanges(editModel)">
                    💾 Save Changes to SQLite
                  </button>
                </div>
              </div>
            </div>
          }
        </section>
      }

      <!-- TAB 2: BANK ACCOUNTS -->
      @if (activeTab() === 'accounts') {
        <section class="tab-content-panel">
          <div class="panel-header">
            <div>
              <h3 class="panel-title">Core Accounts Ledger</h3>
              <p class="panel-desc">All customer deposit, investment, and checking ledger accounts.</p>
            </div>
          </div>

          <div class="table-container">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Account ID</th>
                  <th>Account Number</th>
                  <th>Type & Name</th>
                  <th>Current Balance</th>
                  <th>Available Balance</th>
                  <th>Currency</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                @for (acc of overview()?.accounts ?? []; track acc.id) {
                  <tr>
                    <td class="font-mono text-cyan">{{ acc.id }}</td>
                    <td class="font-mono font-bold">{{ acc.accountNumber }}</td>
                    <td>{{ acc.accountType }}</td>
                    <td class="text-emerald font-bold">{{ acc.balance | currency: acc.currency }}</td>
                    <td>{{ acc.availableBalance | currency: acc.currency }}</td>
                    <td><span class="tag-pill">{{ acc.currency }}</span></td>
                    <td>{{ acc.ownerName }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      <!-- TAB 3: CARDS & PINS -->
      @if (activeTab() === 'cards') {
        <section class="tab-content-panel">
          <div class="panel-header">
            <div>
              <h3 class="panel-title">Cards & PIN Security Inspector</h3>
              <p class="panel-desc">Validates credit and debit cards, spending limits, and current stored PINs.</p>
            </div>
          </div>

          <div class="cards-admin-grid">
            @for (card of overview()?.cards ?? []; track card.id) {
              <div class="admin-card-box" [class.is-frozen]="card.isFrozen">
                <div class="c-head">
                  <span class="c-badge" [class.frozen-badge]="card.isFrozen">
                    {{ card.isFrozen ? 'LOCKED / FROZEN' : 'ACTIVE' }}
                  </span>
                  <span class="c-type">{{ card.cardType }}</span>
                </div>
                <div class="c-num font-mono">{{ card.cardNumberMasked }}</div>
                <div class="c-name">{{ card.cardName }} (Exp: {{ card.expiryDate }})</div>
                
                <div class="c-pin-box">
                  <span class="pin-title">Stored ATM / POS PIN:</span>
                  <span class="pin-val font-mono">{{ card.pin || '3419' }}</span>
                </div>

                <div class="c-meta-row">
                  <div>
                    <span class="sub-lbl">Limit:</span>
                    <strong>{{ card.spendingLimit | currency: 'USD' }}</strong>
                  </div>
                  <div>
                    <span class="sub-lbl">Balance:</span>
                    <strong>{{ card.currentBalance | currency: 'USD' }}</strong>
                  </div>
                </div>

                <button class="toggle-freeze-action" (click)="onToggleCardFreeze(card)">
                  {{ card.isFrozen ? '🔓 Unfreeze Card' : '🔒 Freeze Card' }}
                </button>
              </div>
            }
          </div>
        </section>
      }

      <!-- TAB 4: TRANSACTIONS LEDGER -->
      @if (activeTab() === 'transactions') {
        <section class="tab-content-panel">
          <div class="panel-header">
            <div>
              <h3 class="panel-title">Transaction Ledger</h3>
              <p class="panel-desc">Audited record of all debits, credits, and instant transfers.</p>
            </div>
            <button class="pill-action-btn" (click)="onOpenNewTxModal()">
              ➕ Inject Test Transaction
            </button>
          </div>

          <div class="table-container">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Transaction ID</th>
                  <th>Date</th>
                  <th>Account</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Type</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (tx of overview()?.transactions ?? []; track tx.id) {
                  <tr>
                    <td class="font-mono text-cyan">{{ tx.id }}</td>
                    <td>{{ tx.date | date: 'yyyy-MM-dd HH:mm' }}</td>
                    <td class="font-mono">{{ tx.accountId }}</td>
                    <td>{{ tx.description }}</td>
                    <td><span class="tag-pill">{{ tx.category }}</span></td>
                    <td [class.text-emerald]="tx.amount > 0" [class.text-red]="tx.amount < 0" class="font-bold">
                      {{ tx.amount | currency: 'USD' }}
                    </td>
                    <td>{{ tx.type }}</td>
                    <td><span class="status-pill active-pill">{{ tx.status }}</span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <!-- Add Test Transaction Modal -->
          @if (isCreatingTx()) {
            <div class="modal-backdrop" (click)="isCreatingTx.set(false)">
              <div class="modal-card" (click)="$event.stopPropagation()">
                <div class="modal-header">
                  <h3>Add Test Transaction to Core Ledger</h3>
                  <button class="modal-close" (click)="isCreatingTx.set(false)">✕</button>
                </div>
                <div class="modal-body">
                  <div class="form-grid">
                    <div class="field">
                      <label>Account ID</label>
                      <select [(ngModel)]="newTxAccount" class="admin-input">
                        @for (a of overview()?.accounts ?? []; track a.id) {
                          <option [value]="a.id">{{ a.accountType }} ({{ a.accountNumber }})</option>
                        }
                      </select>
                    </div>
                    <div class="field">
                      <label>Amount (USD)</label>
                      <input type="number" [(ngModel)]="newTxAmount" class="admin-input" placeholder="-150.00" />
                    </div>
                    <div class="field full-width">
                      <label>Description</label>
                      <input type="text" [(ngModel)]="newTxDesc" class="admin-input" placeholder="OpenAI API Credits Subscription" />
                    </div>
                    <div class="field">
                      <label>Category</label>
                      <input type="text" [(ngModel)]="newTxCategory" class="admin-input" placeholder="Tech / Software" />
                    </div>
                  </div>
                </div>
                <div class="modal-footer">
                  <button class="btn-secondary" (click)="isCreatingTx.set(false)">Cancel</button>
                  <button class="btn-primary" (click)="onSubmitNewTransaction()">Save to EF Core</button>
                </div>
              </div>
            </div>
          }
        </section>
      }

      <!-- TAB 5: AI AUDIT TRAIL -->
      @if (activeTab() === 'audit') {
        <section class="tab-content-panel">
          <div class="panel-header">
            <div>
              <h3 class="panel-title">AI & User Security Audit Trail</h3>
              <p class="panel-desc">Complete immutable timeline of events triggered by the AI assistant and user portal.</p>
            </div>
          </div>

          <div class="audit-timeline">
            @for (log of overview()?.auditLogs ?? []; track log.id) {
              <div class="audit-item">
                <div class="audit-time">
                  <span class="time-main">{{ log.timestamp | date: 'HH:mm:ss' }}</span>
                  <span class="date-sub">{{ log.timestamp | date: 'MMM d' }}</span>
                </div>
                <div class="audit-connector">
                  <span class="audit-dot"></span>
                  <span class="audit-line"></span>
                </div>
                <div class="audit-box">
                  <div class="audit-box-top">
                    <span class="action-tag">{{ log.action }}</span>
                    <span class="initiator-tag" [class.ai-initiator]="log.initiator.includes('AI')">
                      {{ log.initiator }}
                    </span>
                  </div>
                  <p class="audit-details">{{ log.details }}</p>
                </div>
              </div>
            }
          </div>
        </section>
      }

      <!-- TAB 6: RAW SQLITE JSON -->
      @if (activeTab() === 'raw') {
        <section class="tab-content-panel">
          <div class="panel-header">
            <div>
              <h3 class="panel-title">Raw SQLite Database JSON Payload</h3>
              <p class="panel-desc">Direct serialization of all SQLite tables as served by the .NET 10 Web API.</p>
            </div>
          </div>
          <div class="raw-json-viewer">
            <pre>{{ overview() | json }}</pre>
          </div>
        </section>
      }
    </div>
  `,
  styles: `
    .admin-dashboard {
      display: flex;
      flex-direction: column;
      gap: 24px;
      color: #f1f5f9;
      font-size: 0.88rem;
    }

    .admin-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      flex-wrap: wrap;
      gap: 16px;
      padding-bottom: 8px;
    }
    .header-tag {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 4px 10px;
      background: rgba(14, 165, 233, 0.12);
      border: 1px solid rgba(14, 165, 233, 0.3);
      border-radius: 9999px;
      font-size: 0.68rem;
      font-weight: 700;
      color: #38bdf8;
      letter-spacing: 0.05em;
      margin-bottom: 8px;
    }
    .badge-dot {
      width: 6px;
      height: 6px;
      background: #38bdf8;
      border-radius: 50%;
      box-shadow: 0 0 6px #38bdf8;
    }
    .page-title {
      margin: 0;
      font-size: 1.6rem;
      font-weight: 800;
      color: #f8fafc;
      letter-spacing: -0.02em;
    }
    .page-sub {
      margin: 4px 0 0;
      font-size: 0.85rem;
      color: #94a3b8;
      max-width: 720px;
      line-height: 1.4;
    }

    .header-actions {
      display: flex;
      gap: 12px;
    }
    .action-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 9px 16px;
      border-radius: 10px;
      font-size: 0.82rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
    }
    .sync-btn {
      background: linear-gradient(135deg, #0284c7, #2563eb);
      color: #fff;
      box-shadow: 0 4px 14px rgba(14, 165, 233, 0.35);
    }
    .sync-btn:hover:not(:disabled) {
      filter: brightness(1.1);
      transform: translateY(-1px);
    }
    .reset-btn {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.4);
      color: #fca5a5;
    }
    .reset-btn:hover:not(:disabled) {
      background: rgba(239, 68, 68, 0.25);
    }
    .sync-icon.spinning {
      display: inline-block;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Metrics Grid */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 14px;
    }
    .metric-card {
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .metric-label {
      font-size: 0.72rem;
      color: #94a3b8;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .metric-val {
      font-size: 1.8rem;
      font-weight: 800;
      line-height: 1.1;
    }
    .metric-foot {
      font-size: 0.68rem;
      color: #64748b;
      margin-top: 4px;
    }
    .text-cyan { color: #38bdf8; }
    .text-emerald { color: #34d399; }
    .text-indigo { color: #818cf8; }
    .text-amber { color: #fbbf24; }
    .text-purple { color: #c084fc; }
    .text-red { color: #f87171; }

    /* Status Ribbon */
    .status-ribbon {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
      padding: 10px 18px;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 12px;
      font-size: 0.75rem;
    }
    .ribbon-item {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .r-label {
      color: #64748b;
    }
    .r-val {
      font-weight: 600;
    }

    /* Tabs Bar */
    .admin-tabs-bar {
      display: flex;
      gap: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      padding-bottom: 2px;
      overflow-x: auto;
    }
    .tab-btn {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 0.82rem;
      font-weight: 600;
      padding: 10px 14px;
      border-radius: 8px 8px 0 0;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
      position: relative;
    }
    .tab-btn:hover {
      color: #f1f5f9;
      background: rgba(255, 255, 255, 0.03);
    }
    .tab-btn.active {
      color: #38bdf8;
      background: rgba(14, 165, 233, 0.1);
    }
    .tab-btn.active::after {
      content: '';
      position: absolute;
      bottom: -2px;
      left: 0;
      right: 0;
      height: 2px;
      background: #38bdf8;
    }

    /* Content Panels */
    .tab-content-panel {
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 22px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 12px;
    }
    .panel-title {
      margin: 0;
      font-size: 1.15rem;
      font-weight: 700;
      color: #f8fafc;
    }
    .panel-desc {
      margin: 4px 0 0;
      font-size: 0.78rem;
      color: #94a3b8;
    }
    .pill-action-btn {
      background: rgba(14, 165, 233, 0.15);
      border: 1px solid rgba(14, 165, 233, 0.35);
      color: #38bdf8;
      padding: 7px 14px;
      border-radius: 8px;
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .pill-action-btn:hover {
      background: rgba(14, 165, 233, 0.25);
    }

    /* Users Grid */
    .users-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
      gap: 18px;
    }
    .user-detail-card {
      background: rgba(30, 41, 59, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .user-detail-card:hover, .user-detail-card.selected {
      border-color: rgba(56, 189, 248, 0.4);
      background: rgba(30, 41, 59, 0.85);
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
    }
    .user-card-top {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .u-avatar {
      width: 42px;
      height: 42px;
      border-radius: 12px;
      background: linear-gradient(135deg, #0284c7, #2563eb);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
      font-weight: 800;
      color: #fff;
    }
    .u-name {
      margin: 0;
      font-size: 0.98rem;
      font-weight: 700;
      color: #f8fafc;
    }
    .u-role {
      font-size: 0.72rem;
      color: #94a3b8;
    }
    .status-pill {
      margin-left: auto;
      font-size: 0.65rem;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 9999px;
    }
    .active-pill {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #34d399;
    }

    .credentials-table {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      background: rgba(15, 23, 42, 0.7);
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .cred-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.76rem;
      gap: 8px;
    }
    .c-key {
      color: #94a3b8;
      flex-shrink: 0;
    }
    .c-val {
      color: #f1f5f9;
      font-weight: 500;
      text-align: right;
    }
    .highlight-cred {
      background: rgba(245, 158, 11, 0.1);
      border: 1px dashed rgba(245, 158, 11, 0.35);
      padding: 6px 10px;
      border-radius: 6px;
    }
    .password-display {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .pwd-text {
      color: #f59e0b;
      font-weight: 700;
      font-family: monospace;
      font-size: 0.85rem;
    }
    .toggle-eye-btn {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #cbd5e1;
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 0.68rem;
      cursor: pointer;
    }
    .toggle-eye-btn:hover {
      background: rgba(255, 255, 255, 0.18);
    }

    .user-card-footer {
      display: flex;
      justify-content: flex-end;
    }
    .card-btn-action {
      background: linear-gradient(135deg, #0ea5e9, #2563eb);
      color: #fff;
      border: none;
      padding: 7px 14px;
      border-radius: 8px;
      font-size: 0.75rem;
      font-weight: 700;
      cursor: pointer;
    }

    /* Tables */
    .table-container {
      overflow-x: auto;
    }
    .admin-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.78rem;
    }
    .admin-table th {
      text-align: left;
      padding: 10px 14px;
      color: #94a3b8;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      font-weight: 600;
    }
    .admin-table td {
      padding: 11px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      color: #e2e8f0;
    }
    .tag-pill {
      font-size: 0.68rem;
      padding: 2px 8px;
      background: rgba(255, 255, 255, 0.06);
      border-radius: 6px;
      color: #94a3b8;
    }

    /* Cards Grid */
    .cards-admin-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 16px;
    }
    .admin-card-box {
      background: rgba(30, 41, 59, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .admin-card-box.is-frozen {
      border-color: rgba(239, 68, 68, 0.4);
      opacity: 0.85;
    }
    .c-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .c-badge {
      font-size: 0.65rem;
      font-weight: 700;
      padding: 2px 8px;
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border-radius: 6px;
    }
    .frozen-badge {
      background: rgba(239, 68, 68, 0.2);
      color: #f87171;
    }
    .c-type {
      font-size: 0.72rem;
      color: #94a3b8;
    }
    .c-num {
      font-size: 1.1rem;
      font-weight: 700;
      color: #fff;
      letter-spacing: 0.08em;
    }
    .c-name {
      font-size: 0.78rem;
      color: #cbd5e1;
    }
    .c-pin-box {
      background: rgba(15, 23, 42, 0.8);
      padding: 8px 12px;
      border-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border: 1px solid rgba(245, 158, 11, 0.25);
    }
    .pin-title {
      font-size: 0.72rem;
      color: #f59e0b;
      font-weight: 600;
    }
    .pin-val {
      font-size: 0.95rem;
      font-weight: 800;
      color: #fbbf24;
    }
    .c-meta-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.74rem;
      color: #94a3b8;
    }
    .sub-lbl {
      margin-right: 4px;
    }
    .toggle-freeze-action {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #fff;
      padding: 7px;
      border-radius: 8px;
      font-size: 0.75rem;
      font-weight: 700;
      cursor: pointer;
    }

    /* Audit Timeline */
    .audit-timeline {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .audit-item {
      display: flex;
      gap: 16px;
      align-items: flex-start;
    }
    .audit-time {
      width: 70px;
      display: flex;
      flex-direction: column;
      text-align: right;
      flex-shrink: 0;
    }
    .time-main {
      font-size: 0.78rem;
      font-weight: 700;
      color: #f1f5f9;
      font-family: monospace;
    }
    .date-sub {
      font-size: 0.65rem;
      color: #64748b;
    }
    .audit-connector {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding-top: 4px;
    }
    .audit-dot {
      width: 8px;
      height: 8px;
      background: #38bdf8;
      border-radius: 50%;
      box-shadow: 0 0 6px #38bdf8;
    }
    .audit-line {
      width: 1px;
      height: 44px;
      background: rgba(255, 255, 255, 0.1);
      margin-top: 4px;
    }
    .audit-box {
      flex: 1;
      background: rgba(30, 41, 59, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 10px;
      padding: 10px 14px;
    }
    .audit-box-top {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 4px;
    }
    .action-tag {
      font-size: 0.72rem;
      font-weight: 700;
      color: #38bdf8;
    }
    .initiator-tag {
      font-size: 0.65rem;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.06);
      color: #94a3b8;
    }
    .initiator-tag.ai-initiator {
      background: rgba(192, 132, 252, 0.15);
      color: #c084fc;
    }
    .audit-details {
      margin: 0;
      font-size: 0.76rem;
      color: #cbd5e1;
    }

    /* Raw JSON Viewer */
    .raw-json-viewer pre {
      background: #020617;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 16px;
      color: #38bdf8;
      font-family: monospace;
      font-size: 0.74rem;
      max-height: 500px;
      overflow-y: auto;
    }

    /* Modal */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      padding: 20px;
    }
    .modal-card {
      background: #0f172a;
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 16px;
      width: 100%;
      max-width: 540px;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8);
      overflow: hidden;
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .modal-header h3 {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 700;
      color: #f8fafc;
    }
    .modal-close {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 1.1rem;
      cursor: pointer;
    }
    .modal-body {
      padding: 20px;
    }
    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .field.full-width {
      grid-column: span 2;
    }
    .field label {
      display: block;
      font-size: 0.72rem;
      color: #94a3b8;
      margin-bottom: 4px;
    }
    .admin-input {
      width: 100%;
      background: rgba(30, 41, 59, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      padding: 8px 12px;
      color: #fff;
      font-size: 0.85rem;
      outline: none;
    }
    .admin-input:focus {
      border-color: #38bdf8;
    }
    .highlight-input {
      border-color: #f59e0b;
      color: #fbbf24;
      font-weight: 700;
      font-family: monospace;
    }
    .field-hint {
      display: block;
      font-size: 0.65rem;
      color: #64748b;
      margin-top: 2px;
    }
    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 14px 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(15, 23, 42, 0.8);
    }
    .btn-secondary {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #cbd5e1;
      padding: 8px 14px;
      border-radius: 8px;
      cursor: pointer;
    }
    .btn-primary {
      background: linear-gradient(135deg, #0ea5e9, #2563eb);
      border: none;
      color: #fff;
      font-weight: 700;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
    }
    .font-mono { font-family: monospace; }
    .font-bold { font-weight: 700; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminComponent implements OnInit {
  private readonly banking = inject(BankingStateService);

  protected readonly overview = signal<DatabaseOverview | null>(null);
  protected readonly isLoading = signal<boolean>(false);
  protected readonly latencyMs = signal<number>(0);
  protected readonly lastSyncTime = signal<Date>(new Date());
  protected readonly activeTab = signal<'users' | 'accounts' | 'cards' | 'transactions' | 'audit' | 'raw'>('users');
  protected readonly showPassword = signal<boolean>(true); // default true for convenient admin verification

  protected readonly selectedUser = signal<UserAccount | null>(null);
  protected readonly editingUser = signal<UserAccount | null>(null);

  // New Transaction Modal State
  protected readonly isCreatingTx = signal<boolean>(false);
  protected newTxAccount = 'acc-chk-01';
  protected newTxAmount = -125.50;
  protected newTxDesc = 'Enterprise Cloud License';
  protected newTxCategory = 'Cloud & Tech';

  ngOnInit(): void {
    this.loadOverview();
  }

  protected async loadOverview(): Promise<void> {
    this.isLoading.set(true);
    const start = performance.now();
    try {
      const data = await this.banking.getDatabaseOverview();
      this.latencyMs.set(Math.round(performance.now() - start));
      this.lastSyncTime.set(new Date());
      if (data) {
        this.overview.set(data);
        if (!this.selectedUser() && data.users.length > 0) {
          this.selectedUser.set(data.users[0]);
        }
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  protected onOpenEditUserModal(user: UserAccount | null): void {
    if (!user) return;
    this.editingUser.set({ ...user });
  }

  protected async onSaveUserChanges(model: UserAccount): Promise<void> {
    const success = await this.banking.updateAdminUser(model);
    if (success) {
      this.editingUser.set(null);
      await this.loadOverview();
    }
  }

  protected async onToggleCardFreeze(card: any): Promise<void> {
    await this.banking.setCardFreeze(card.id, !card.isFrozen);
    await this.loadOverview();
  }

  protected async onResetDatabase(): Promise<void> {
    if (!confirm('Are you sure you want to wipe and re-seed the SQLite database?')) return;
    await this.banking.resetDatabase();
    await this.loadOverview();
  }

  protected onOpenNewTxModal(): void {
    this.isCreatingTx.set(true);
  }

  protected async onSubmitNewTransaction(): Promise<void> {
    const success = await this.banking.createAdminTransaction({
      accountId: this.newTxAccount,
      amount: this.newTxAmount,
      description: this.newTxDesc,
      category: this.newTxCategory,
      type: this.newTxAmount >= 0 ? 'Credit' : 'Debit',
      status: 'Posted',
    });
    if (success) {
      this.isCreatingTx.set(false);
      await this.loadOverview();
    }
  }
}
