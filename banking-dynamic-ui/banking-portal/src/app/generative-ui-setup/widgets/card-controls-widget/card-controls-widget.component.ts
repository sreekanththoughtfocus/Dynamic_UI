import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  signal,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BankingStateService } from '../../../core/services/banking.service';

@Component({
  selector: 'bank-card-controls-widget',
  imports: [CurrencyPipe, FormsModule],
  template: `
    <div class="card-controls-box" [class.is-frozen]="isFrozenState()">
      <!-- Card Banner -->
      <div class="card-preview">
        <div class="card-chip"></div>
        <div class="card-top">
          <span class="bank-tag">APEX BANK</span>
          <span class="card-badge" [class.freeze-badge]="isFrozenState()">
            {{ isFrozenState() ? 'FROZEN / LOCKED' : 'ACTIVE' }}
          </span>
        </div>
        <div class="card-number">{{ cardNumberMasked() }}</div>
        <div class="card-bottom">
          <span class="card-name">{{ cardName() }}</span>
          <span class="card-balance">Limit: {{ spendingLimit() | currency: 'USD' }}</span>
        </div>
      </div>

      <!-- Controls -->
      <div class="controls-body">
        <!-- Freeze Toggle -->
        <div class="control-row">
          <div class="control-info">
            <span class="control-title">Card Lock & Freeze</span>
            <span class="control-desc">Instantly disable all online & ATM transactions</span>
          </div>
          <button
            class="toggle-switch-btn"
            [class.active]="isFrozenState()"
            (click)="onToggleFreeze()"
          >
            <span class="toggle-slider"></span>
          </button>
        </div>

        <!-- Spending Limit Slider -->
        <div class="control-row limit-row">
          <div class="limit-labels">
            <span class="control-title">Spending Threshold</span>
            <span class="limit-val">{{ spendingLimitState() | currency: 'USD' }}</span>
          </div>
          <input
            type="range"
            min="1000"
            max="30000"
            step="500"
            class="limit-range"
            [ngModel]="spendingLimitState()"
            (ngModelChange)="onLimitChange($event)"
          />
        </div>

        <!-- Quick Toggles -->
        <div class="quick-toggles-grid">
          <label class="toggle-chip">
            <input type="checkbox" [(ngModel)]="onlineTransactions" />
            <span>🌐 Online Purchases</span>
          </label>
          <label class="toggle-chip">
            <input type="checkbox" [(ngModel)]="atmWithdrawals" />
            <span>🏧 ATM Withdrawals</span>
          </label>
        </div>
      </div>

      <div class="controls-footer">
        <span>⚡ Synchronized with Visa/Mastercard Global Settlement</span>
      </div>
    </div>
  `,
  styles: `
    .card-controls-box {
      background: linear-gradient(180deg, #0b1329 0%, #111e3b 100%);
      border: 1px solid rgba(14, 165, 233, 0.3);
      border-radius: 14px;
      padding: 16px;
      color: #f8fafc;
      font-size: 0.85rem;
      transition: all 0.3s ease;
    }
    .card-controls-box.is-frozen {
      border-color: rgba(239, 68, 68, 0.45);
      background: linear-gradient(180deg, #180d19 0%, #20111a 100%);
    }

    .card-preview {
      background: linear-gradient(135deg, #1e293b, #0f172a);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      padding: 12px 14px;
      position: relative;
      overflow: hidden;
      margin-bottom: 14px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    }
    .card-chip {
      width: 28px;
      height: 20px;
      background: linear-gradient(135deg, #f59e0b, #d97706);
      border-radius: 4px;
      margin-bottom: 8px;
    }
    .card-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .bank-tag {
      font-size: 0.65rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: #38bdf8;
    }
    .card-badge {
      font-size: 0.65rem;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 10px;
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.35);
    }
    .freeze-badge {
      background: rgba(239, 68, 68, 0.2);
      color: #f87171;
      border-color: rgba(239, 68, 68, 0.4);
    }
    .card-number {
      font-size: 0.95rem;
      font-family: monospace;
      letter-spacing: 0.12em;
      color: #e2e8f0;
      margin: 8px 0;
    }
    .card-bottom {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.72rem;
      color: #94a3b8;
    }
    .card-balance {
      color: #cbd5e1;
      font-weight: 600;
    }

    .controls-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .control-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 10px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 8px;
    }
    .control-title {
      display: block;
      font-size: 0.78rem;
      font-weight: 600;
      color: #f1f5f9;
    }
    .control-desc {
      display: block;
      font-size: 0.68rem;
      color: #94a3b8;
    }

    /* Toggle Switch */
    .toggle-switch-btn {
      width: 44px;
      height: 24px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.15);
      border: none;
      position: relative;
      cursor: pointer;
      transition: background 0.25s;
      flex-shrink: 0;
    }
    .toggle-slider {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: white;
      transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .toggle-switch-btn.active {
      background: #ef4444;
    }
    .toggle-switch-btn.active .toggle-slider {
      transform: translateX(20px);
    }

    .limit-row {
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
    }
    .limit-labels {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .limit-val {
      font-size: 0.85rem;
      font-weight: 700;
      color: #38bdf8;
    }
    .limit-range {
      width: 100%;
      accent-color: #0ea5e9;
      cursor: pointer;
    }

    .quick-toggles-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .toggle-chip {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.72rem;
      color: #cbd5e1;
      padding: 6px 8px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 6px;
      cursor: pointer;
    }
    .toggle-chip input {
      accent-color: #10b981;
      cursor: pointer;
    }

    .controls-footer {
      margin-top: 10px;
      font-size: 0.65rem;
      color: #64748b;
      text-align: center;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardControlsWidgetComponent {
  private readonly banking = inject(BankingStateService);

  public readonly cardId = input<string>('card-crd-01');
  public readonly cardName = input<string>('Apex Black Diamond Elite');
  public readonly cardNumberMasked = input<string>('•••• •••• •••• 8821');
  public readonly isFrozen = input<boolean>(false);
  public readonly spendingLimit = input<number>(25000);
  public readonly currentBalance = input<number>(0);

  protected readonly isFrozenState = signal(false);
  protected readonly spendingLimitState = signal(25000);
  protected readonly onlineTransactions = signal(true);
  protected readonly atmWithdrawals = signal(true);

  ngOnInit(): void {
    this.isFrozenState.set(this.isFrozen());
    this.spendingLimitState.set(this.spendingLimit());
  }

  protected async onToggleFreeze(): Promise<void> {
    const nextState = !this.isFrozenState();
    this.isFrozenState.set(nextState);
    await this.banking.setCardFreeze(this.cardId(), nextState);
  }

  protected onLimitChange(val: number): void {
    this.spendingLimitState.set(val);
    this.banking.updateCardLimit(this.cardId(), val);
  }
}
