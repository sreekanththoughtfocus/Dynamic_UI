import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BankingStateService } from '../../../core/services/banking.service';

const SUPPORTED_CURRENCIES = [
  { code: 'USD', flag: '🇺🇸' },
  { code: 'EUR', flag: '🇪🇺' },
  { code: 'GBP', flag: '🇬🇧' },
  { code: 'CHF', flag: '🇨🇭' },
  { code: 'CAD', flag: '🇨🇦' },
  { code: 'AUD', flag: '🇦🇺' },
  { code: 'JPY', flag: '🇯🇵' },
  { code: 'SGD', flag: '🇸🇬' },
];

@Component({
  selector: 'bank-currency-exchange-widget',
  imports: [DecimalPipe, FormsModule],
  template: `
    <div class="exchange-card">
      <!-- Header -->
      <div class="card-header">
        <div class="header-left">
          <span class="badge-icon">💱</span>
          <div>
            <h4 class="card-title">{{ title() }}</h4>
            <span class="card-sub">Real-Time Wholesale FX Rates</span>
          </div>
        </div>
        <div class="header-right">
          <span class="zero-fee-badge">0% Fee Tier</span>
        </div>
      </div>

      <!-- Conversion Box -->
      <div class="conversion-box">
        <!-- From Field -->
        <div class="currency-input-row">
          <div class="input-col">
            <span class="row-label">You Transfer</span>
            <input
              type="number"
              class="val-input"
              [ngModel]="amount()"
              (ngModelChange)="onAmountChange($event)"
              min="1"
            />
          </div>
          <div class="selector-col">
            <select
              class="currency-select"
              [ngModel]="fromCurrency()"
              (ngModelChange)="fromCurrency.set($event)"
            >
              @for (c of currencies; track c.code) {
                <option [value]="c.code">{{ c.flag }} {{ c.code }}</option>
              }
            </select>
          </div>
        </div>

        <!-- Swap Divider -->
        <div class="swap-divider">
          <div class="divider-line"></div>
          <button type="button" class="swap-btn" (click)="swapCurrencies()" title="Swap currencies">
            ⇄
          </button>
          <div class="divider-line"></div>
        </div>

        <!-- To Field -->
        <div class="currency-input-row">
          <div class="input-col">
            <span class="row-label">Recipient Receives</span>
            <span class="val-display">
              @if (exchangeRate() == null) {
                —
              } @else {
                {{ convertedAmount() | number: '1.2-2' }}
              }
            </span>
          </div>
          <div class="selector-col">
            <select
              class="currency-select"
              [ngModel]="toCurrency()"
              (ngModelChange)="toCurrency.set($event)"
            >
              @for (c of currencies; track c.code) {
                <option [value]="c.code">{{ c.flag }} {{ c.code }}</option>
              }
            </select>
          </div>
        </div>
      </div>

      <!-- Rate Details Banner -->
      <div class="rate-details">
        <div class="rate-item">
          <span class="detail-label">Interbank Exchange Rate</span>
          <span class="detail-val">
            @if (rateError()) {
              Live rates unavailable
            } @else if (exchangeRate() == null) {
              Loading live rate…
            } @else {
              1 {{ fromCurrency() }} = {{ exchangeRate() | number: '1.4-6' }} {{ toCurrency() }}
              · {{ rateSource() }} {{ rateAsOf() }}
            }
          </span>
        </div>
        <div class="rate-item">
          <span class="detail-label">Delivery Speed</span>
          <span class="detail-val speed">⚡ Instant Interbank Settlement</span>
        </div>
      </div>

      <!-- Actions -->
      <div class="card-footer">
        <button type="button" class="action-btn primary" (click)="onLockRate()" [disabled]="exchangeRate() == null || locking()">
          @if (locking()) { Saving rate… } @else { Save locked rate }
        </button>
      </div>
    </div>
  `,
  styles: `
    .exchange-card {
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
      background: rgba(139, 92, 246, 0.15);
      border: 1px solid rgba(139, 92, 246, 0.3);
      padding: 6px;
      border-radius: 10px;
    }
    .card-title {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 700;
      color: #a78bfa;
    }
    .card-sub {
      font-size: 0.72rem;
      color: #94a3b8;
    }
    .zero-fee-badge {
      font-size: 0.72rem;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 12px;
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    /* Conversion Box */
    .conversion-box {
      margin: 12px 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .currency-input-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
    }
    .input-col {
      display: flex;
      flex-direction: column;
      flex: 1;
    }
    .row-label {
      font-size: 0.65rem;
      text-transform: uppercase;
      color: #94a3b8;
      letter-spacing: 0.04em;
    }
    .val-input {
      background: transparent;
      border: none;
      color: #38bdf8;
      font-size: 1.25rem;
      font-weight: 800;
      outline: none;
      width: 100%;
    }
    .val-display {
      color: #34d399;
      font-size: 1.25rem;
      font-weight: 800;
    }
    .selector-col {
      margin-left: 12px;
    }
    .currency-select {
      background: rgba(30, 41, 59, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      color: #f8fafc;
      padding: 6px 10px;
      font-size: 0.82rem;
      font-weight: 600;
      outline: none;
      cursor: pointer;
    }

    /* Swap Divider */
    .swap-divider {
      display: flex;
      align-items: center;
      margin: -2px 0;
      position: relative;
      z-index: 2;
    }
    .divider-line {
      flex: 1;
      height: 1px;
      background: rgba(255, 255, 255, 0.08);
    }
    .swap-btn {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #38bdf8;
      font-size: 1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
    }
    .swap-btn:hover {
      background: #0284c7;
      color: #ffffff;
      transform: rotate(180deg);
    }

    /* Rate Details */
    .rate-details {
      display: flex;
      justify-content: space-between;
      padding: 10px 12px;
      background: rgba(15, 23, 42, 0.45);
      border-radius: 8px;
      font-size: 0.72rem;
    }
    .rate-item {
      display: flex;
      flex-direction: column;
    }
    .detail-label {
      color: #64748b;
      font-size: 0.65rem;
      text-transform: uppercase;
    }
    .detail-val {
      color: #cbd5e1;
      font-weight: 600;
    }
    .detail-val.speed {
      color: #34d399;
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
      background: rgba(139, 92, 246, 0.2);
      border-color: rgba(139, 92, 246, 0.4);
      color: #a78bfa;
    }
    .action-btn.primary:hover {
      background: rgba(139, 92, 246, 0.3);
      color: #ede9fe;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CurrencyExchangeWidgetComponent {
  private readonly banking = inject(BankingStateService);

  public readonly title = input<string>('Live Currency Exchange');
  public readonly initialAmount = input<number>(1000);
  public readonly initialFrom = input<string>('USD');
  public readonly initialTo = input<string>('EUR');

  protected readonly amount = signal<number>(1000);
  protected readonly fromCurrency = signal<string>('USD');
  protected readonly toCurrency = signal<string>('EUR');
  protected readonly perUsd = signal<Record<string, number>>({});
  protected readonly rateSource = signal('');
  protected readonly rateAsOf = signal('');
  protected readonly rateError = signal<string | null>(null);
  protected readonly locking = signal(false);

  protected readonly currencies = SUPPORTED_CURRENCIES;

  constructor() {
    queueMicrotask(() => {
      if (this.initialAmount()) this.amount.set(this.initialAmount());
      if (this.initialFrom()) this.fromCurrency.set(this.initialFrom());
      if (this.initialTo()) this.toCurrency.set(this.initialTo());
    });
    void this.refreshRates();
  }

  protected readonly exchangeRate = computed(() => {
    const table = this.perUsd();
    const from = this.fromCurrency() === 'USD' ? 1 : table[this.fromCurrency()];
    const to = this.toCurrency() === 'USD' ? 1 : table[this.toCurrency()];
    if (!from || !to) return null;
    return to / from;
  });

  protected readonly convertedAmount = computed(() => {
    const rate = this.exchangeRate();
    return rate == null ? 0 : this.amount() * rate;
  });

  protected onAmountChange(val: number): void {
    this.amount.set(Number(val) || 1);
  }

  protected swapCurrencies(): void {
    const temp = this.fromCurrency();
    this.fromCurrency.set(this.toCurrency());
    this.toCurrency.set(temp);
  }

  protected async refreshRates(): Promise<void> {
    const table = await this.banking.loadFxRates();
    if (!table) {
      this.rateError.set('The rate service did not respond.');
      return;
    }
    this.perUsd.set(table.perUsd);
    this.rateSource.set(table.source);
    this.rateAsOf.set(table.asOf);
    this.rateError.set(null);
  }

  protected async onLockRate(): Promise<void> {
    this.locking.set(true);
    const locked = await this.banking.lockFxRate(this.fromCurrency(), this.toCurrency(), this.amount());
    this.locking.set(false);
    if (!locked) {
      this.banking.showToast('The live rate could not be locked.');
      return;
    }
    this.banking.showToast(
      `Locked ${locked.amount} ${locked.from} = ${locked.converted} ${locked.to} at ${locked.rate} (${locked.source}, ${locked.asOf}). Saved to the audit log.`,
    );
  }
}
