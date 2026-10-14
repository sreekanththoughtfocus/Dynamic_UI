import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BankingStateService } from '../../../core/services/banking.service';

@Component({
  selector: 'bank-password-reset-widget',
  imports: [FormsModule],
  template: `
    <div class="pwd-card">
      <div class="pwd-header">
        <div class="lock-icon">🔒</div>
        <div>
          <h4 class="pwd-title">Online Banking Credential Reset</h4>
          <span class="pwd-sub">Account: {{ userEmail() }}</span>
        </div>
      </div>

      @if (!isSuccess()) {
        <div class="pwd-body">
          <div class="form-group">
            <label>Current / Temporary Password</label>
            <input
              type="password"
              class="pwd-input"
              [(ngModel)]="currentPassword"
              placeholder="Enter current password"
            />
          </div>

          <div class="form-group">
            <label>New Master Password</label>
            <input
              type="password"
              class="pwd-input"
              [(ngModel)]="newPassword"
              placeholder="Minimum 8 chars, 1 number, 1 symbol"
            />
            <!-- Strength Indicator -->
            <div class="strength-bar-wrap">
              <div
                class="strength-bar"
                [style.width.%]="strengthPercent()"
                [class.weak]="strengthPercent() < 40"
                [class.medium]="strengthPercent() >= 40 && strengthPercent() < 75"
                [class.strong]="strengthPercent() >= 75"
              ></div>
            </div>
            <span class="strength-text">{{ strengthLabel() }}</span>
          </div>

          <div class="form-group">
            <label>Confirm New Password</label>
            <input
              type="password"
              class="pwd-input"
              [(ngModel)]="confirmPassword"
              placeholder="Re-type new password"
            />
          </div>

          @if (errorMessage()) {
            <div class="err-box">{{ errorMessage() }}</div>
          }

          <button
            class="submit-btn"
            (click)="onSubmitReset()"
            [disabled]="isSubmitting()"
          >
            @if (isSubmitting()) {
              Updating Credentials...
            } @else {
              🔐 Update Password
            }
          </button>
        </div>
      } @else {
        <div class="success-box">
          <div class="success-icon">✓</div>
          <div>
            <h5 class="success-heading">Password Successfully Reset</h5>
            <p class="success-text">
              Your banking login password was updated and all other sessions have been secured.
            </p>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .pwd-card {
      background: linear-gradient(180deg, #0f172a 0%, #1e1b4b 100%);
      border: 1px solid rgba(99, 102, 241, 0.35);
      border-radius: 14px;
      padding: 16px;
      color: #f8fafc;
      font-size: 0.85rem;
    }
    .pwd-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .lock-icon {
      font-size: 1.5rem;
    }
    .pwd-title {
      margin: 0;
      font-size: 0.92rem;
      font-weight: 700;
      color: #a5b4fc;
    }
    .pwd-sub {
      font-size: 0.72rem;
      color: #94a3b8;
    }
    .pwd-body {
      padding-top: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .form-group label {
      display: block;
      font-size: 0.7rem;
      color: #cbd5e1;
      margin-bottom: 4px;
      font-weight: 500;
    }
    .pwd-input {
      width: 100%;
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 8px;
      padding: 8px 12px;
      color: #fff;
      font-size: 0.85rem;
      outline: none;
    }
    .pwd-input:focus {
      border-color: #818cf8;
      box-shadow: 0 0 0 2px rgba(129, 140, 248, 0.2);
    }
    .strength-bar-wrap {
      width: 100%;
      height: 4px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 2px;
      margin-top: 6px;
      overflow: hidden;
    }
    .strength-bar {
      height: 100%;
      transition: width 0.3s ease, background-color 0.3s ease;
    }
    .strength-bar.weak { background: #ef4444; }
    .strength-bar.medium { background: #f59e0b; }
    .strength-bar.strong { background: #10b981; }
    .strength-text {
      font-size: 0.65rem;
      color: #94a3b8;
      display: block;
      margin-top: 2px;
    }

    .err-box {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 0.75rem;
    }
    .submit-btn {
      background: linear-gradient(135deg, #6366f1, #4f46e5);
      color: white;
      border: none;
      border-radius: 8px;
      padding: 10px;
      font-size: 0.85rem;
      font-weight: 700;
      cursor: pointer;
      transition: filter 0.2s;
    }
    .submit-btn:hover {
      filter: brightness(1.1);
    }
    .submit-btn:disabled {
      opacity: 0.5;
    }

    .success-box {
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 16px;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.35);
      border-radius: 10px;
      margin-top: 12px;
    }
    .success-icon {
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
    .success-heading {
      margin: 0;
      color: #34d399;
      font-size: 0.9rem;
      font-weight: 700;
    }
    .success-text {
      margin: 4px 0 0;
      font-size: 0.74rem;
      color: #cbd5e1;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordResetWidgetComponent {
  private readonly banking = inject(BankingStateService);

  public readonly userEmail = input<string>('a.vance@example.com');
  public readonly requireOtp = input<boolean>(true);

  protected readonly currentPassword = signal('');
  protected readonly newPassword = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly isSubmitting = signal(false);
  protected readonly isSuccess = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly strengthPercent = computed(() => {
    const val = this.newPassword();
    if (!val) return 0;
    let score = 20;
    if (val.length >= 8) score += 30;
    if (/\d/.test(val)) score += 25;
    if (/[^A-Za-z0-9]/.test(val)) score += 25;
    return Math.min(score, 100);
  });

  protected readonly strengthLabel = computed(() => {
    const p = this.strengthPercent();
    if (p === 0) return '';
    if (p < 40) return 'Weak password';
    if (p < 75) return 'Medium strength';
    return 'Strong password (Enterprise Grade)';
  });

  protected onSubmitReset(): void {
    const pwd = this.newPassword().trim();
    const confirm = this.confirmPassword().trim();

    if (pwd.length < 6) {
      this.errorMessage.set('Password must be at least 6 characters long.');
      return;
    }
    if (pwd !== confirm) {
      this.errorMessage.set('Passwords do not match.');
      return;
    }

    this.errorMessage.set(null);
    this.isSubmitting.set(true);

    setTimeout(() => {
      this.banking.resetPassword(pwd);
      this.isSubmitting.set(false);
      this.isSuccess.set(true);
    }, 600);
  }
}
