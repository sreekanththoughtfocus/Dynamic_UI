import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BankingStateService } from '../../core/services/banking.service';
import { ConciergeContextService } from '../../core/services/concierge-context.service';
import { BankCard } from '../../core/models/banking.models';
import { GenUiService } from 'generative-ui';

@Component({
  selector: 'bank-cards',
  imports: [CurrencyPipe, FormsModule],
  template: `
    <div class="cards-page">
      <div class="page-header">
        <div>
          <h1 class="page-title">Credit & Debit Card Management</h1>
          <p class="page-sub">Manage card security, configure spending thresholds, and reset card PINs.</p>
        </div>
        <button class="ai-pin-btn" (click)="askAiPinReset()">
          🤖 Reset PIN via AI Concierge
        </button>
      </div>

      <!-- Cards Showcase Grid -->
      <div class="cards-grid">
        @for (card of banking.cards(); track card.id) {
          <div class="card-column">
            <!-- Visual Credit/Debit Card -->
            <div
              class="physical-card"
              [class.credit-theme]="card.cardType === 'Credit'"
              [class.debit-theme]="card.cardType === 'Debit'"
              [class.is-frozen]="card.isFrozen"
            >
              @if (card.isFrozen) {
                <div class="frozen-overlay">
                  <span class="lock-glyph">🔒</span>
                  <span class="freeze-text">CARD FROZEN</span>
                </div>
              }

              <div class="card-interior">
                <div class="card-top-row">
                  <span class="bank-brand">APEX PREMIER</span>
                  <span class="card-chip-type">{{ card.cardType }}</span>
                </div>

                <div class="chip-row">
                  <div class="gold-chip"></div>
                  <span class="contactless-icon">))))</span>
                </div>

                <div class="card-number-display">{{ card.cardNumberMasked }}</div>

                <div class="card-bottom-row">
                  <div>
                    <span class="lbl">CARDHOLDER</span>
                    <span class="val">ALEX VANCE</span>
                  </div>
                  <div>
                    <span class="lbl">EXPIRES</span>
                    <span class="val">{{ card.expiryDate }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Card Management Panel -->
            <div class="card-mgmt-panel">
              <div class="panel-header">
                <div>
                  <h3 class="panel-title">{{ card.cardName }}</h3>
                  <span class="panel-status" [class.frozen]="card.isFrozen">
                    Status: {{ card.isFrozen ? 'LOCKED / FROZEN' : 'ACTIVE & VERIFIED' }}
                  </span>
                </div>
              </div>

              <!-- Freeze Action -->
              <div class="setting-item">
                <div class="setting-text">
                  <strong>Freeze Card</strong>
                  <span>Instantly block authorization of POS and online transactions</span>
                </div>
                <button
                  class="freeze-toggle-btn"
                  [class.frozen]="card.isFrozen"
                  (click)="toggleFreeze(card)"
                >
                  {{ card.isFrozen ? 'UNFREEZE' : 'FREEZE' }}
                </button>
              </div>

              <!-- Reset PIN Action -->
              <div class="setting-item">
                <div class="setting-text">
                  <strong>Card PIN Management</strong>
                  <span>Change or reset your 4-digit ATM / Chip PIN</span>
                </div>
                <button class="action-btn" (click)="openPinDialog(card)">
                  Reset PIN
                </button>
              </div>

              <!-- Spending Limit -->
              <div class="setting-item limit-setting">
                <div class="setting-text">
                  <strong>Monthly Spending Limit</strong>
                  <span>Current Cap: {{ card.spendingLimit | currency: 'USD' }}</span>
                </div>
                <input
                  type="range"
                  min="1000"
                  max="35000"
                  step="500"
                  class="limit-slider"
                  [ngModel]="card.spendingLimit"
                  (ngModelChange)="onUpdateLimit(card, $event)"
                />
              </div>
            </div>
          </div>
        }
      </div>

      <!-- Quick Modal Dialog for Manual In-Page PIN Reset (Optional fallback) -->
      @if (activePinCard(); as pinCard) {
        <div class="modal-backdrop" (click)="closePinDialog()">
          <div class="modal-box" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h3>Reset PIN: {{ pinCard.cardName }}</h3>
              <button class="close-x" (click)="closePinDialog()">✕</button>
            </div>
            <div class="modal-body">
              <p class="modal-desc">
                Set a new 4-digit PIN for {{ pinCard.cardNumberMasked }}.
              </p>
              <div class="modal-field">
                <label>New 4-Digit PIN</label>
                <input
                  type="password"
                  maxlength="4"
                  class="modal-input"
                  [(ngModel)]="modalNewPin"
                  placeholder="••••"
                />
              </div>
              <div class="modal-field">
                <label>Confirm PIN</label>
                <input
                  type="password"
                  maxlength="4"
                  class="modal-input"
                  [(ngModel)]="modalConfirmPin"
                  placeholder="••••"
                />
              </div>
              @if (modalError()) {
                <div class="modal-err">{{ modalError() }}</div>
              }
            </div>
            <div class="modal-footer">
              <button class="modal-cancel" (click)="closePinDialog()">Cancel</button>
              <button class="modal-submit" (click)="submitModalPin(pinCard)">
                Confirm New PIN
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .cards-page {
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
    .ai-pin-btn {
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
    .ai-pin-btn:hover {
      transform: translateY(-1px);
    }

    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
      gap: 24px;
    }
    .card-column {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    /* Visual Card */
    .physical-card {
      width: 100%;
      height: 220px;
      border-radius: 20px;
      position: relative;
      overflow: hidden;
      box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.6);
      transition: transform 0.3s ease, box-shadow 0.3s ease;
    }
    .physical-card:hover {
      transform: translateY(-4px) scale(1.01);
      box-shadow: 0 25px 50px -10px rgba(14, 165, 233, 0.3);
    }
    .credit-theme {
      background: linear-gradient(135deg, #090d16 0%, #172554 50%, #0284c7 100%);
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
    .debit-theme {
      background: linear-gradient(135deg, #042f2e 0%, #065f46 50%, #0d9488 100%);
      border: 1px solid rgba(52, 211, 153, 0.3);
    }
    .physical-card.is-frozen {
      filter: grayscale(0.85);
    }
    .frozen-overlay {
      position: absolute;
      inset: 0;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(4px);
      z-index: 10;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .lock-glyph {
      font-size: 2.2rem;
    }
    .freeze-text {
      color: #f87171;
      font-size: 0.95rem;
      font-weight: 800;
      letter-spacing: 0.12em;
    }

    .card-interior {
      padding: 22px 24px;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      color: #fff;
    }
    .card-top-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .bank-brand {
      font-size: 0.85rem;
      font-weight: 900;
      letter-spacing: 0.1em;
    }
    .card-chip-type {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      opacity: 0.85;
      font-weight: 700;
    }
    .chip-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .gold-chip {
      width: 40px;
      height: 30px;
      background: linear-gradient(135deg, #f59e0b, #d97706);
      border-radius: 6px;
    }
    .contactless-icon {
      font-size: 1.1rem;
      letter-spacing: 2px;
      font-weight: bold;
      opacity: 0.75;
    }
    .card-number-display {
      font-size: 1.25rem;
      font-family: monospace;
      letter-spacing: 0.14em;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    }
    .card-bottom-row {
      display: flex;
      justify-content: space-between;
    }
    .lbl {
      display: block;
      font-size: 0.6rem;
      opacity: 0.7;
      letter-spacing: 0.05em;
    }
    .val {
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: 0.05em;
    }

    /* Management Panel */
    .card-mgmt-panel {
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 18px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .panel-header {
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .panel-title {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 700;
      color: #f8fafc;
    }
    .panel-status {
      font-size: 0.74rem;
      color: #34d399;
      font-weight: 600;
    }
    .panel-status.frozen {
      color: #f87171;
    }

    .setting-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 14px;
      background: rgba(30, 41, 59, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 12px;
      gap: 12px;
    }
    .setting-text strong {
      display: block;
      font-size: 0.85rem;
      color: #f1f5f9;
    }
    .setting-text span {
      display: block;
      font-size: 0.74rem;
      color: #94a3b8;
    }
    .freeze-toggle-btn {
      padding: 8px 16px;
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171;
      border-radius: 8px;
      font-size: 0.78rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
    }
    .freeze-toggle-btn.frozen {
      background: #10b981;
      border-color: #10b981;
      color: white;
    }
    .action-btn {
      padding: 8px 16px;
      background: rgba(14, 165, 233, 0.15);
      border: 1px solid rgba(14, 165, 233, 0.3);
      color: #38bdf8;
      border-radius: 8px;
      font-size: 0.78rem;
      font-weight: 700;
      cursor: pointer;
    }
    .action-btn:hover {
      background: #0ea5e9;
      color: white;
    }
    .limit-setting {
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
    }
    .limit-slider {
      accent-color: #0ea5e9;
      cursor: pointer;
    }

    /* Modal */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(6px);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .modal-box {
      width: 400px;
      background: #0f172a;
      border: 1px solid rgba(56, 189, 248, 0.3);
      border-radius: 16px;
      padding: 20px;
      color: #fff;
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
    }
    .modal-header h3 {
      margin: 0;
      font-size: 1.1rem;
      color: #38bdf8;
    }
    .close-x {
      background: none;
      border: none;
      color: #94a3b8;
      font-size: 1.2rem;
      cursor: pointer;
    }
    .modal-desc {
      font-size: 0.8rem;
      color: #94a3b8;
      margin: 0 0 14px;
    }
    .modal-field {
      margin-bottom: 12px;
    }
    .modal-field label {
      display: block;
      font-size: 0.75rem;
      color: #cbd5e1;
      margin-bottom: 4px;
    }
    .modal-input {
      width: 100%;
      background: rgba(30, 41, 59, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      padding: 8px 12px;
      color: #fff;
      font-size: 1rem;
      outline: none;
    }
    .modal-err {
      color: #f87171;
      font-size: 0.75rem;
      margin-top: 8px;
    }
    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 18px;
    }
    .modal-cancel {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #cbd5e1;
      border-radius: 8px;
      padding: 8px 16px;
      cursor: pointer;
    }
    .modal-submit {
      background: linear-gradient(135deg, #0ea5e9, #2563eb);
      color: white;
      border: none;
      border-radius: 8px;
      padding: 8px 18px;
      font-weight: 700;
      cursor: pointer;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardsComponent {
  protected readonly banking = inject(BankingStateService);
  protected readonly genUi = inject(GenUiService);
  private readonly conciergeContext = inject(ConciergeContextService);

  protected readonly activePinCard = signal<BankCard | null>(null);
  protected readonly modalNewPin = signal('');
  protected readonly modalConfirmPin = signal('');
  protected readonly modalError = signal<string | null>(null);

  protected async toggleFreeze(card: BankCard): Promise<void> {
    this.conciergeContext.cardId.set(card.id);
    await this.banking.setCardFreeze(card.id, !card.isFrozen);
  }

  protected onUpdateLimit(card: BankCard, limit: number): void {
    this.banking.updateCardLimit(card.id, limit);
  }

  protected openPinDialog(card: BankCard): void {
    this.conciergeContext.cardId.set(card.id);
    this.activePinCard.set(card);
    this.modalNewPin.set('');
    this.modalConfirmPin.set('');
    this.modalError.set(null);
  }

  protected closePinDialog(): void {
    this.activePinCard.set(null);
  }

  protected async submitModalPin(card: BankCard): Promise<void> {
    const pin = this.modalNewPin().trim();
    const confirm = this.modalConfirmPin().trim();

    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      this.modalError.set('PIN must be 4 digits.');
      return;
    }
    if (pin !== confirm) {
      this.modalError.set('PIN confirmation does not match.');
      return;
    }

    await this.banking.resetCardPin(card.id, pin);
    this.closePinDialog();
  }

  protected askAiPinReset(): void {
    const card = this.banking.cards().find((item) => item.id === this.conciergeContext.cardId())
      ?? this.banking.cards().find((item) => item.cardType === 'Debit');
    const kind = card?.cardType === 'Credit' ? 'credit' : 'debit';
    if (card) this.conciergeContext.cardId.set(card.id);
    this.genUi.openDrawer();
    void this.genUi.sendMessage(`I want to reset the PIN for my ${kind} card`);
  }
}
