import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BankingStateService } from '../../core/services/banking.service';
import { GenUiService } from 'generative-ui';

@Component({
  selector: 'bank-transfers',
  imports: [CurrencyPipe, FormsModule],
  template: `
    <div class="transfers-page">
      <div class="page-header">
        <div>
          <h1 class="page-title">Instant Money Transfers</h1>
          <p class="page-sub">Send funds worldwide via FedNow, RTP, and SWIFT international network.</p>
        </div>
        <button class="ai-transfer-btn" (click)="askAiTransfer()">
          🤖 Transfer via Voice / AI Concierge
        </button>
      </div>

      <div class="transfer-grid">
        <!-- Transfer Form -->
        <div class="transfer-card">
          <h3 class="card-heading">Send Funds</h3>

          <div class="field-wrap">
            <label>From Deposit Account</label>
            <select class="transfer-select" [(ngModel)]="fromAccountId">
              @for (acc of banking.accounts(); track acc.id) {
                <option [value]="acc.id">
                  {{ acc.accountType }} — {{ acc.availableBalance | currency: 'USD' }} available
                </option>
              }
            </select>
          </div>

          <div class="field-wrap">
            <label>Recipient or Saved Contact</label>
            <input
              type="text"
              class="transfer-input"
              [(ngModel)]="recipient"
              placeholder="e.g. Alice Vance, IBAN, or Mobile Phone"
            />
          </div>

          <!-- Quick Payee Avatars -->
          <div class="quick-payees-row">
            <span class="payee-lbl">Quick Select:</span>
            <button class="payee-pill" (click)="recipient.set('Alice Vance')">Alice Vance</button>
            <button class="payee-pill" (click)="recipient.set('Marcus Brody')">Marcus Brody</button>
            <button class="payee-pill" (click)="recipient.set('TechForward Escrow')">TechForward</button>
          </div>

          <div class="field-wrap">
            <label>Transfer Amount (USD)</label>
            <div class="amount-input-box">
              <span class="currency-symbol">$</span>
              <input
                type="number"
                class="amount-field"
                [(ngModel)]="amount"
                placeholder="0.00"
              />
            </div>
          </div>

          <div class="field-wrap">
            <label>Memo / Reference Note</label>
            <input
              type="text"
              class="transfer-input"
              [(ngModel)]="note"
              placeholder="e.g. Consulting Services, Emergency Fund"
            />
          </div>

          <button class="submit-transfer-btn" (click)="submitTransfer()">
            💸 Dispatch Instant Wire
          </button>
        </div>

        <!-- Limits and Security Info -->
        <div class="side-info-card">
          <h3 class="card-heading">Transfer Guarantees</h3>
          <ul class="guarantee-list">
            <li>
              <strong>Instant Real-Time Settlement</strong>
              <p>Funds credit to recipient within 3 seconds 24/7/365.</p>
            </li>
            <li>
              <strong>$0.00 Wire Fees</strong>
              <p>Apex Premier tier includes complimentary domestic wires.</p>
            </li>
            <li>
              <strong>$50,000 Daily Limit</strong>
              <p>Call private client concierge for high-value escrow wires.</p>
            </li>
          </ul>
        </div>
      </div>
    </div>
  `,
  styles: `
    .transfers-page {
      display: flex;
      flex-direction: column;
      gap: 24px;
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
    .ai-transfer-btn {
      background: linear-gradient(135deg, #10b981, #059669);
      color: #fff;
      border: none;
      padding: 10px 18px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4);
      transition: all 0.2s;
    }

    .transfer-grid {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 24px;
    }
    @media (max-width: 900px) {
      .transfer-grid { grid-template-columns: 1fr; }
    }
    .transfer-card, .side-info-card {
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 18px;
      padding: 24px;
    }
    .card-heading {
      margin: 0 0 16px;
      font-size: 1.15rem;
      font-weight: 700;
      color: #f8fafc;
    }

    .field-wrap {
      margin-bottom: 14px;
    }
    .field-wrap label {
      display: block;
      font-size: 0.74rem;
      color: #cbd5e1;
      margin-bottom: 6px;
    }
    .transfer-select, .transfer-input {
      width: 100%;
      background: rgba(30, 41, 59, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      padding: 11px 14px;
      color: #fff;
      font-size: 0.88rem;
      outline: none;
    }
    .transfer-select:focus, .transfer-input:focus {
      border-color: #38bdf8;
    }
    .quick-payees-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: -6px;
      margin-bottom: 14px;
      flex-wrap: wrap;
    }
    .payee-lbl {
      font-size: 0.72rem;
      color: #64748b;
    }
    .payee-pill {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 14px;
      padding: 4px 10px;
      color: #93c5fd;
      font-size: 0.72rem;
      cursor: pointer;
    }
    .payee-pill:hover {
      background: rgba(14, 165, 233, 0.2);
      color: #fff;
    }

    .amount-input-box {
      display: flex;
      align-items: center;
      background: rgba(30, 41, 59, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      padding: 4px 14px;
    }
    .currency-symbol {
      font-size: 1.2rem;
      font-weight: 700;
      color: #34d399;
      margin-right: 6px;
    }
    .amount-field {
      width: 100%;
      background: transparent;
      border: none;
      color: #f8fafc;
      font-size: 1.3rem;
      font-weight: 800;
      outline: none;
    }
    .submit-transfer-btn {
      width: 100%;
      margin-top: 10px;
      background: linear-gradient(135deg, #10b981, #059669);
      color: white;
      border: none;
      border-radius: 10px;
      padding: 13px;
      font-size: 0.95rem;
      font-weight: 700;
      cursor: pointer;
      transition: filter 0.2s;
    }
    .submit-transfer-btn:hover {
      filter: brightness(1.1);
    }

    .guarantee-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .guarantee-list li strong {
      display: block;
      font-size: 0.88rem;
      color: #f1f5f9;
    }
    .guarantee-list li p {
      margin: 4px 0 0;
      font-size: 0.76rem;
      color: #94a3b8;
      line-height: 1.4;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransfersComponent {
  protected readonly banking = inject(BankingStateService);
  protected readonly genUi = inject(GenUiService);

  protected readonly fromAccountId = signal('acc-chk-01');
  protected readonly recipient = signal('');
  protected readonly amount = signal<number | null>(null);
  protected readonly note = signal('');

  protected submitTransfer(): void {
    const amt = this.amount();
    const to = this.recipient().trim();
    if (!amt || amt <= 0 || !to) {
      this.banking.showToast('⚠️ Please enter a recipient and valid transfer amount.');
      return;
    }

    this.banking.transferFunds(this.fromAccountId(), to, amt, this.note());
    this.amount.set(null);
    this.recipient.set('');
    this.note.set('');
  }

  protected askAiTransfer(): void {
    this.genUi.openDrawer();
    this.genUi.sendMessage('Transfer $250 to emergency savings');
  }
}
