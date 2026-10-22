import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { BankingStateService } from '../../../core/services/banking.service';

@Component({
  selector: 'bank-transfer-confirm-widget',
  imports: [CurrencyPipe],
  template: `
    <div class="transfer-card">
      <div class="transfer-header">
        <span class="icon">💸</span>
        <div>
          <h4 class="title">Confirm Instant Transfer</h4>
          <span class="subtitle">Real-Time FedNow / Wire Settlement</span>
        </div>
      </div>

      @if (!isSuccess()) {
        <div class="transfer-body">
          <div class="amount-badge">
            <span class="curr-sign">$</span>
            <span class="amount-number">{{ amount() | currency: 'USD':'' }}</span>
          </div>

          <div class="details-list">
            <div class="detail-item">
              <span class="d-label">From Account</span>
              <span class="d-val">{{ fromAccount() }}</span>
            </div>
            <div class="detail-item">
              <span class="d-label">Recipient</span>
              <span class="d-val highlight">{{ recipient() }}</span>
            </div>
            <div class="detail-item">
              <span class="d-label">Memo / Note</span>
              <span class="d-val">{{ note() }}</span>
            </div>
            <div class="detail-item">
              <span class="d-label">Available before transfer</span>
              <span class="d-val">{{ availableBalance() | currency: 'USD' }}</span>
            </div>
            <div class="detail-item">
              <span class="d-label">Transfer Fee</span>
              <span class="d-val fee-free">$0.00 (Waived for Premier)</span>
            </div>
          </div>

          @if (stepUpRequired()) {
            <label class="step-up">
              <input type="checkbox" [checked]="confirmed()" (change)="onConfirm($event)" />
              I confirm this transfer of {{ amount() | currency: 'USD' }}.
            </label>
          }

          <div class="actions">
            <button
              class="authorize-btn"
              (click)="onAuthorize()"
              [disabled]="isAuthorizing() || !canAuthorize()"
            >
              @if (isAuthorizing()) {
                Processing Ledger...
              } @else {
                ✓ Authorize Instant Transfer
              }
            </button>
          </div>
        </div>
      } @else {
        <div class="receipt-box">
          <div class="success-icon">✓</div>
          <h5 class="receipt-title">Funds Dispatched!</h5>
          <p class="receipt-text">
            <strong>{{ amount() | currency: 'USD' }}</strong> successfully transferred to
            <strong>{{ recipient() }}</strong>. Reference: #{{ receiptNumber() }}.
          </p>
        </div>
      }
    </div>
  `,
  styles: `
    .transfer-card {
      background: linear-gradient(180deg, #091a1e 0%, #0f172a 100%);
      border: 1px solid rgba(16, 185, 129, 0.35);
      border-radius: 14px;
      padding: 16px;
      color: #f8fafc;
      font-size: 0.85rem;
    }
    .transfer-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .icon {
      font-size: 1.5rem;
    }
    .title {
      margin: 0;
      font-size: 0.92rem;
      font-weight: 700;
      color: #34d399;
    }
    .subtitle {
      font-size: 0.72rem;
      color: #94a3b8;
    }
    .transfer-body {
      padding-top: 14px;
    }
    .amount-badge {
      display: flex;
      align-items: baseline;
      justify-content: center;
      gap: 4px;
      padding: 10px;
      background: rgba(16, 185, 129, 0.1);
      border-radius: 10px;
      margin-bottom: 14px;
    }
    .curr-sign {
      font-size: 1.2rem;
      font-weight: 700;
      color: #34d399;
    }
    .amount-number {
      font-size: 1.8rem;
      font-weight: 800;
      color: #f8fafc;
      letter-spacing: -0.02em;
    }
    .details-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
    }
    .detail-item {
      display: flex;
      justify-content: space-between;
      font-size: 0.78rem;
      padding: 4px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    }
    .d-label {
      color: #94a3b8;
    }
    .d-val {
      color: #f1f5f9;
      font-weight: 600;
    }
    .d-val.highlight {
      color: #38bdf8;
    }
    .fee-free {
      color: #34d399;
    }
    .actions {
      margin-top: 8px;
    }
    .authorize-btn {
      width: 100%;
      background: linear-gradient(135deg, #10b981, #059669);
      color: white;
      border: none;
      border-radius: 8px;
      padding: 11px;
      font-size: 0.88rem;
      font-weight: 700;
      cursor: pointer;
      transition: filter 0.2s;
    }
    .authorize-btn:hover {
      filter: brightness(1.1);
      box-shadow: 0 4px 15px rgba(16, 185, 129, 0.35);
    }
    .authorize-btn:disabled {
      opacity: 0.5;
    }

    .receipt-box {
      text-align: center;
      padding: 20px 10px;
    }
    .success-icon {
      width: 40px;
      height: 40px;
      background: #10b981;
      color: #fff;
      border-radius: 50%;
      margin: 0 auto 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.3rem;
      font-weight: 800;
    }
    .receipt-title {
      margin: 0;
      color: #34d399;
      font-size: 1rem;
      font-weight: 700;
    }
    .receipt-text {
      margin: 6px 0 0;
      font-size: 0.78rem;
      color: #cbd5e1;
      line-height: 1.4;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransferConfirmWidgetComponent {
  private readonly banking = inject(BankingStateService);

  public readonly fromAccountId = input<string>('acc-chk-01');
  public readonly fromAccount = input<string>('Premier Checking (CHK-98214-01)');
  public readonly recipient = input<string>('Alice Vance (Emergency Reserve)');
  public readonly amount = input<number>(250);
  public readonly note = input<string>('Instant Reserve Allocation');
  public readonly availableBalance = input<number>(0);
  public readonly stepUpRequired = input(false);

  protected readonly isAuthorizing = signal(false);
  protected readonly isSuccess = signal(false);
  protected readonly confirmed = signal(false);
  protected readonly receiptNumber = signal('');
  protected readonly canAuthorize = computed(
    () => !this.stepUpRequired() || this.confirmed(),
  );

  protected onConfirm(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.confirmed.set(input.checked);
  }

  protected async onAuthorize(): Promise<void> {
    this.isAuthorizing.set(true);
    try {
      await this.banking.transferFunds(
        this.fromAccountId(),
        this.recipient(),
        this.amount(),
        this.note(),
      );
      this.receiptNumber.set(Math.floor(100000 + Math.random() * 900000).toString());
      this.isSuccess.set(true);
    } finally {
      this.isAuthorizing.set(false);
    }
  }
}
