import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BankingStateService } from '../../../core/services/banking.service';

@Component({
  selector: 'bank-card-pin-reset-widget',
  imports: [FormsModule],
  template: `
    <div class="pin-reset-card">
      <div class="pin-header">
        <div class="header-icon">💳</div>
        <div>
          <h4 class="pin-title">PIN Reset: {{ cardName() }}</h4>
          <span class="card-num">{{ cardNumberMasked() }} ({{ cardType() }})</span>
        </div>
        <span class="auth-badge">2FA Required</span>
      </div>

      @if (!isSuccess()) {
        <div class="form-body">
          <p class="instruction">
            Set a new 4-digit numeric PIN. Do not use repeating or sequential digits.
          </p>

          <div class="input-grid">
            <div class="field-wrap">
              <label>New 4-Digit PIN</label>
              <input
                type="password"
                maxlength="4"
                pattern="[0-9]*"
                class="pin-input"
                [(ngModel)]="newPin"
                placeholder="••••"
              />
            </div>
            <div class="field-wrap">
              <label>Confirm PIN</label>
              <input
                type="password"
                maxlength="4"
                pattern="[0-9]*"
                class="pin-input"
                [(ngModel)]="confirmPin"
                placeholder="••••"
              />
            </div>
          </div>

          <div class="field-wrap otp-section">
            <div class="otp-header">
              <label>SMS / Authenticator OTP Code</label>
              <button type="button" class="resend-link" (click)="onResendOtp()">
                Resend SMS
              </button>
            </div>
            <input
              type="text"
              maxlength="6"
              class="otp-input"
              [(ngModel)]="otpCode"
              placeholder="Enter 6-digit verification code"
            />
          </div>

          @if (errorMessage()) {
            <div class="error-banner">
              {{ errorMessage() }}
            </div>
          }

          <div class="actions-row">
            <button
              class="submit-pin-btn"
              (click)="onConfirmReset()"
              [disabled]="isSubmitting()"
            >
              @if (isSubmitting()) {
                <span class="btn-spinner"></span> Updating Core HSM...
              } @else {
                🔐 Authorize & Update PIN
              }
            </button>
          </div>
        </div>
      } @else {
        <div class="success-banner">
          <div class="check-icon">✓</div>
          <div>
            <h5 class="success-title">PIN Updated Successfully!</h5>
            <p class="success-desc">
              Your new PIN for <strong>{{ cardName() }}</strong> is active immediately at all worldwide ATMs and point-of-sale terminals.
            </p>
          </div>
        </div>
      }

      <div class="pin-footer">
        <span>🔒 Hardware Security Module (HSM) Level 4 Protected</span>
      </div>
    </div>
  `,
  styles: `
    .pin-reset-card {
      background: linear-gradient(180deg, #091326 0%, #0f172a 100%);
      border: 1px solid rgba(14, 165, 233, 0.35);
      border-radius: 14px;
      padding: 16px;
      color: #f8fafc;
      font-size: 0.85rem;
    }
    .pin-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .header-icon {
      font-size: 1.6rem;
    }
    .pin-title {
      margin: 0;
      font-size: 0.92rem;
      font-weight: 700;
      color: #38bdf8;
    }
    .card-num {
      font-size: 0.72rem;
      color: #94a3b8;
    }
    .auth-badge {
      margin-left: auto;
      font-size: 0.65rem;
      font-weight: 700;
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.3);
      padding: 2px 8px;
      border-radius: 12px;
    }

    .form-body {
      padding-top: 12px;
    }
    .instruction {
      margin: 0 0 12px;
      font-size: 0.76rem;
      color: #94a3b8;
      line-height: 1.4;
    }
    .input-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 12px;
    }
    .field-wrap label {
      display: block;
      font-size: 0.7rem;
      color: #cbd5e1;
      margin-bottom: 4px;
      font-weight: 500;
    }
    .pin-input, .otp-input {
      width: 100%;
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      padding: 8px 12px;
      color: #fff;
      font-size: 0.95rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      outline: none;
      transition: border-color 0.2s;
    }
    .pin-input:focus, .otp-input:focus {
      border-color: #38bdf8;
      box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
    }
    .otp-section {
      margin-bottom: 12px;
    }
    .otp-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .resend-link {
      background: none;
      border: none;
      color: #38bdf8;
      font-size: 0.68rem;
      cursor: pointer;
      text-decoration: underline;
    }
    .error-banner {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.35);
      color: #fca5a5;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 0.75rem;
      margin-bottom: 10px;
    }
    .actions-row {
      margin-top: 8px;
    }
    .submit-pin-btn {
      width: 100%;
      background: linear-gradient(135deg, #0ea5e9, #2563eb);
      color: white;
      border: none;
      border-radius: 8px;
      padding: 10px;
      font-size: 0.85rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .submit-pin-btn:hover:not(:disabled) {
      filter: brightness(1.1);
      box-shadow: 0 4px 15px rgba(14, 165, 233, 0.35);
    }
    .submit-pin-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .success-banner {
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 16px;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: 10px;
      margin: 12px 0;
    }
    .check-icon {
      width: 32px;
      height: 32px;
      background: #10b981;
      color: #fff;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
      font-weight: 800;
      flex-shrink: 0;
    }
    .success-title {
      margin: 0;
      color: #34d399;
      font-size: 0.9rem;
      font-weight: 700;
    }
    .success-desc {
      margin: 4px 0 0;
      font-size: 0.74rem;
      color: #cbd5e1;
      line-height: 1.35;
    }
    .pin-footer {
      margin-top: 12px;
      padding-top: 8px;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 0.65rem;
      color: #64748b;
      text-align: center;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardPinResetWidgetComponent {
  private readonly banking = inject(BankingStateService);

  public readonly cardId = input<string>('card-deb-02');
  public readonly cardName = input<string>('Apex Premier Debit Platinum');
  public readonly cardNumberMasked = input<string>('•••• •••• •••• 3419');
  public readonly cardType = input<string>('Debit');
  public readonly isFrozen = input<boolean>(false);

  protected readonly newPin = signal('');
  protected readonly confirmPin = signal('');
  protected readonly otpCode = signal('849201'); // prefilled sample for demonstration convenience
  protected readonly isSubmitting = signal(false);
  protected readonly isSuccess = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected onResendOtp(): void {
    this.banking.showToast('📲 Security OTP re-sent to your mobile phone (***-***-8821).');
  }

  protected async onConfirmReset(): Promise<void> {
    const pin = this.newPin().trim();
    const confirm = this.confirmPin().trim();
    const otp = this.otpCode().trim();

    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      this.errorMessage.set('PIN must consist of exactly 4 numeric digits.');
      return;
    }

    if (pin !== confirm) {
      this.errorMessage.set('PIN confirmation does not match.');
      return;
    }

    if (otp.length < 4) {
      this.errorMessage.set('Please provide the 6-digit OTP code.');
      return;
    }

    this.errorMessage.set(null);
    this.isSubmitting.set(true);

    try {
      await this.banking.resetCardPin(this.cardId(), pin);
      this.isSuccess.set(true);
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
