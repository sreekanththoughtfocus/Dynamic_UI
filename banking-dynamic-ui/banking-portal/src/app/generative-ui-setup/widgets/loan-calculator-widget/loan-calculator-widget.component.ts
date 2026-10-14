import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BankingStateService } from '../../../core/services/banking.service';

@Component({
  selector: 'bank-loan-calculator-widget',
  imports: [CurrencyPipe, DecimalPipe, FormsModule],
  template: `
    <div class="calculator-card">
      <!-- Header -->
      <div class="card-header">
        <div class="header-left">
          <span class="badge-icon">💰</span>
          <div>
            <h4 class="card-title">{{ title() }}</h4>
            <span class="card-sub">{{ loanType() }} Financing Estimator</span>
          </div>
        </div>
        <div class="header-right">
          <span class="rate-badge">{{ interestRate() }}% APR</span>
        </div>
      </div>

      <!-- Live Payment Result Banner -->
      <div class="result-banner">
        <div class="result-left">
          <span class="result-label">Estimated Monthly Payment</span>
          <span class="monthly-val">
            {{ monthlyPayment() | currency: currency() }}
            <span class="freq-tag">/ month</span>
          </span>
        </div>
        <div class="result-right">
          <div class="mini-stat">
            <span class="stat-lbl">Total Interest</span>
            <span class="stat-val interest">{{ totalInterest() | currency: currency() }}</span>
          </div>
          <div class="mini-stat">
            <span class="stat-lbl">Total Payoff</span>
            <span class="stat-val">{{ totalCost() | currency: currency() }}</span>
          </div>
        </div>
      </div>

      <!-- Controls & Sliders -->
      <div class="controls-container">
        <!-- Principal Amount Slider -->
        <div class="control-group">
          <div class="group-header">
            <label class="group-label">Financing Amount</label>
            <div class="val-input-wrap">
              <span class="prefix">$</span>
              <input
                type="number"
                class="amount-input"
                [ngModel]="principal()"
                (ngModelChange)="onPrincipalChange($event)"
                min="1000"
                max="250000"
                step="1000"
              />
            </div>
          </div>
          <input
            type="range"
            class="range-slider"
            [ngModel]="principal()"
            (ngModelChange)="onPrincipalChange($event)"
            min="1000"
            max="250000"
            step="1000"
          />
          <div class="range-bounds">
            <span>$1,000</span>
            <span>$250,000</span>
          </div>
        </div>

        <!-- Loan Term Selector -->
        <div class="control-group">
          <div class="group-header">
            <label class="group-label">Repayment Term</label>
            <span class="selected-term">{{ termMonths() }} Months ({{ termYears() }} Years)</span>
          </div>
          <div class="term-chips">
            @for (opt of termOptions; track opt) {
              <button
                type="button"
                class="term-chip"
                [class.active]="termMonths() === opt"
                (click)="setTerm(opt)"
              >
                {{ opt }}m
              </button>
            }
          </div>
        </div>

        <!-- Interest Rate Adjuster -->
        <div class="control-group">
          <div class="group-header">
            <label class="group-label">Interest Rate</label>
            <span class="rate-indicator">{{ interestRate() }}%</span>
          </div>
          <input
            type="range"
            class="range-slider"
            [ngModel]="interestRate()"
            (ngModelChange)="onRateChange($event)"
            min="2.0"
            max="18.0"
            step="0.1"
          />
        </div>
      </div>

      <!-- Breakdown Visual Bar -->
      <div class="amortization-summary">
        <div class="summary-bar">
          <div
            class="principal-bar"
            [style.width.%]="principalShare()"
            title="Principal share"
          ></div>
          <div
            class="interest-bar"
            [style.width.%]="100 - principalShare()"
            title="Interest share"
          ></div>
        </div>
        <div class="summary-legend">
          <span class="legend-item principal">
            <span class="legend-dot"></span> Principal ({{ principalShare() | number: '1.0-0' }}%)
          </span>
          <span class="legend-item interest">
            <span class="legend-dot"></span> Interest ({{ 100 - principalShare() | number: '1.0-0' }}%)
          </span>
        </div>
      </div>

      <!-- Actions -->
      <div class="card-footer">
        <button type="button" class="action-btn" (click)="onScheduleAmortization()">
          📄 Full Schedule
        </button>
        <button type="button" class="action-btn primary" (click)="onApplyLoan()">
          ✅ Pre-Approve & Apply
        </button>
      </div>
    </div>
  `,
  styles: `
    .calculator-card {
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
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.3);
      padding: 6px;
      border-radius: 10px;
    }
    .card-title {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 700;
      color: #fbbf24;
    }
    .card-sub {
      font-size: 0.72rem;
      color: #94a3b8;
    }
    .rate-badge {
      font-size: 0.72rem;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 12px;
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.3);
    }

    /* Result Banner */
    .result-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 12px 0 16px;
      padding: 12px 14px;
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.8));
      border: 1px solid rgba(251, 191, 36, 0.25);
      border-radius: 12px;
    }
    .result-left {
      display: flex;
      flex-direction: column;
    }
    .result-label {
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #94a3b8;
    }
    .monthly-val {
      font-size: 1.4rem;
      font-weight: 800;
      color: #38bdf8;
    }
    .freq-tag {
      font-size: 0.75rem;
      color: #94a3b8;
      font-weight: normal;
    }
    .result-right {
      display: flex;
      flex-direction: column;
      gap: 4px;
      text-align: right;
    }
    .mini-stat {
      display: flex;
      flex-direction: column;
    }
    .stat-lbl {
      font-size: 0.62rem;
      color: #64748b;
      text-transform: uppercase;
    }
    .stat-val {
      font-size: 0.78rem;
      font-weight: 700;
      color: #f1f5f9;
    }
    .stat-val.interest {
      color: #f87171;
    }

    /* Controls */
    .controls-container {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .control-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .group-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .group-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: #e2e8f0;
    }
    .val-input-wrap {
      display: flex;
      align-items: center;
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 6px;
      padding: 2px 8px;
    }
    .prefix {
      color: #94a3b8;
      font-size: 0.75rem;
      margin-right: 4px;
    }
    .amount-input {
      width: 75px;
      background: transparent;
      border: none;
      color: #38bdf8;
      font-weight: 700;
      font-size: 0.8rem;
      outline: none;
      text-align: right;
    }
    .selected-term {
      font-size: 0.72rem;
      color: #38bdf8;
      font-weight: 600;
    }
    .rate-indicator {
      font-size: 0.75rem;
      font-weight: 700;
      color: #fbbf24;
    }

    /* Slider styling */
    .range-slider {
      width: 100%;
      height: 6px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      outline: none;
      -webkit-appearance: none;
      appearance: none;
    }
    .range-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #38bdf8;
      box-shadow: 0 0 8px rgba(56, 189, 248, 0.6);
      cursor: pointer;
    }
    .range-bounds {
      display: flex;
      justify-content: space-between;
      font-size: 0.65rem;
      color: #64748b;
    }

    /* Term Chips */
    .term-chips {
      display: flex;
      gap: 6px;
    }
    .term-chip {
      flex: 1;
      padding: 5px 0;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      color: #cbd5e1;
      font-size: 0.72rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .term-chip:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    .term-chip.active {
      background: #2563eb;
      border-color: #38bdf8;
      color: #ffffff;
      box-shadow: 0 0 10px rgba(37, 99, 235, 0.4);
    }

    /* Summary Bar */
    .amortization-summary {
      margin-top: 14px;
      padding-top: 10px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }
    .summary-bar {
      height: 8px;
      border-radius: 4px;
      overflow: hidden;
      display: flex;
    }
    .principal-bar {
      background: #38bdf8;
      height: 100%;
    }
    .interest-bar {
      background: #f87171;
      height: 100%;
    }
    .summary-legend {
      display: flex;
      justify-content: space-between;
      margin-top: 6px;
      font-size: 0.68rem;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .legend-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }
    .legend-item.principal .legend-dot {
      background: #38bdf8;
    }
    .legend-item.interest .legend-dot {
      background: #f87171;
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
      background: rgba(245, 158, 11, 0.2);
      border-color: rgba(245, 158, 11, 0.4);
      color: #fbbf24;
    }
    .action-btn.primary:hover {
      background: rgba(245, 158, 11, 0.3);
      color: #fef3c7;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoanCalculatorWidgetComponent {
  private readonly banking = inject(BankingStateService);

  public readonly title = input<string>('Loan & Financing Calculator');
  public readonly loanType = input<string>('Personal / Auto');
  public readonly currency = input<string>('USD');
  public readonly initialPrincipal = input<number>(35000);
  public readonly initialRate = input<number>(6.45);
  public readonly initialTermMonths = input<number>(48);

  protected readonly principal = signal<number>(35000);
  protected readonly interestRate = signal<number>(6.45);
  protected readonly termMonths = signal<number>(48);

  protected readonly termOptions = [12, 24, 36, 48, 60, 72];

  constructor() {
    // Initial sync
    setTimeout(() => {
      if (this.initialPrincipal()) this.principal.set(this.initialPrincipal());
      if (this.initialRate()) this.interestRate.set(this.initialRate());
      if (this.initialTermMonths()) this.termMonths.set(this.initialTermMonths());
    });
  }

  protected readonly termYears = computed(() => {
    return (this.termMonths() / 12).toFixed(1);
  });

  protected readonly monthlyPayment = computed(() => {
    const P = this.principal();
    const annualRate = this.interestRate() / 100;
    const r = annualRate / 12;
    const n = this.termMonths();

    if (r === 0) return P / n;
    const monthly = (P * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1);
    return isNaN(monthly) ? 0 : monthly;
  });

  protected readonly totalCost = computed(() => {
    return this.monthlyPayment() * this.termMonths();
  });

  protected readonly totalInterest = computed(() => {
    return Math.max(0, this.totalCost() - this.principal());
  });

  protected readonly principalShare = computed(() => {
    const total = this.totalCost();
    if (!total) return 100;
    return (this.principal() / total) * 100;
  });

  protected onPrincipalChange(val: number): void {
    this.principal.set(Number(val) || 1000);
  }

  protected onRateChange(val: number): void {
    this.interestRate.set(Number(val) || 2.0);
  }

  protected setTerm(months: number): void {
    this.termMonths.set(months);
  }

  protected onScheduleAmortization(): void {
    this.banking.showToast(
      `📄 Amortization schedule generated for $${this.principal().toLocaleString()} over ${this.termMonths()} months!`,
    );
  }

  protected onApplyLoan(): void {
    this.banking.showToast(
      `✅ Instant Pre-Approval initiated for $${this.principal().toLocaleString()} at ${this.interestRate()}% APR!`,
    );
  }
}
