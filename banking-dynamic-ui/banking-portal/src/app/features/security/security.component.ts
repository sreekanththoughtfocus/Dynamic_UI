import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BankingStateService } from '../../core/services/banking.service';
import { GenUiService } from 'generative-ui';

@Component({
  selector: 'bank-security',
  imports: [FormsModule],
  template: `
    <div class="security-page">
      <div class="page-header">
        <div>
          <h1 class="page-title">Security & Access Profile</h1>
          <p class="page-sub">Configure authentication credentials, biometrics, and login safeguards.</p>
        </div>
        <button class="ai-sec-btn" (click)="askAiSecurity()">
          🤖 Run AI Security Audit
        </button>
      </div>

      <div class="security-grid">
        <!-- Password Reset Box -->
        <div class="sec-card">
          <div class="sec-header">
            <span class="icon">🔑</span>
            <div>
              <h3>Online Banking Master Password</h3>
              <span>Last updated: {{ banking.securityProfile().lastPasswordChange }}</span>
            </div>
          </div>
          <div class="sec-body">
            <div class="field-wrap">
              <label>Current Password</label>
              <input type="password" class="sec-input" [(ngModel)]="oldPassword" placeholder="••••••••" />
            </div>
            <div class="field-wrap">
              <label>New Password</label>
              <input type="password" class="sec-input" [(ngModel)]="newPassword" placeholder="Minimum 8 characters" />
            </div>
            <div class="field-wrap">
              <label>Confirm New Password</label>
              <input type="password" class="sec-input" [(ngModel)]="confirmPassword" placeholder="Confirm password" />
            </div>
            <button class="save-btn" (click)="savePassword()">Update Password</button>
          </div>
        </div>

        <!-- 2FA & Biometrics -->
        <div class="sec-card">
          <div class="sec-header">
            <span class="icon">🛡️</span>
            <div>
              <h3>Authentication Factors</h3>
              <span>Zero-Trust multi-layered identity assurance</span>
            </div>
          </div>
          <div class="sec-body factors-list">
            <div class="factor-row">
              <div class="f-info">
                <strong>Two-Factor Authentication (2FA)</strong>
                <span>Mandatory for wires exceeding $1,000</span>
              </div>
              <span class="status-badge enabled">Enabled</span>
            </div>

            <div class="factor-row">
              <div class="f-info">
                <strong>Passkey / Touch ID / Face ID</strong>
                <span>Hardware cryptographic biometric sign-in</span>
              </div>
              <span class="status-badge enabled">Active (WebAuthn)</span>
            </div>

            <div class="factor-row">
              <div class="f-info">
                <strong>Fraud Shield AI Sentinel</strong>
                <span>Real-time anomaly & geographic displacement filter</span>
              </div>
              <span class="status-badge enabled">Armed</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: `
    .security-page {
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
    .ai-sec-btn {
      background: linear-gradient(135deg, #6366f1, #4f46e5);
      color: #fff;
      border: none;
      padding: 10px 18px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);
      transition: all 0.2s;
    }

    .security-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
      gap: 24px;
    }
    .sec-card {
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 18px;
      padding: 22px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .sec-header {
      display: flex;
      align-items: center;
      gap: 14px;
      padding-bottom: 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .sec-header .icon {
      font-size: 1.6rem;
    }
    .sec-header h3 {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 700;
      color: #f8fafc;
    }
    .sec-header span {
      font-size: 0.74rem;
      color: #94a3b8;
    }

    .sec-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .field-wrap label {
      display: block;
      font-size: 0.74rem;
      color: #cbd5e1;
      margin-bottom: 4px;
    }
    .sec-input {
      width: 100%;
      background: rgba(30, 41, 59, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      padding: 10px 14px;
      color: #fff;
      font-size: 0.88rem;
      outline: none;
    }
    .sec-input:focus {
      border-color: #6366f1;
    }
    .save-btn {
      margin-top: 6px;
      background: linear-gradient(135deg, #6366f1, #4f46e5);
      color: white;
      border: none;
      border-radius: 10px;
      padding: 11px;
      font-weight: 700;
      cursor: pointer;
    }

    .factors-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .factor-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 14px;
      background: rgba(30, 41, 59, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 12px;
    }
    .f-info strong {
      display: block;
      font-size: 0.85rem;
      color: #f1f5f9;
    }
    .f-info span {
      display: block;
      font-size: 0.74rem;
      color: #94a3b8;
    }
    .status-badge {
      font-size: 0.72rem;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 8px;
    }
    .status-badge.enabled {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SecurityComponent {
  protected readonly banking = inject(BankingStateService);
  protected readonly genUi = inject(GenUiService);

  protected readonly oldPassword = signal('');
  protected readonly newPassword = signal('');
  protected readonly confirmPassword = signal('');

  protected savePassword(): void {
    if (!this.newPassword()) return;
    this.banking.resetPassword(this.newPassword());
    this.oldPassword.set('');
    this.newPassword.set('');
    this.confirmPassword.set('');
  }

  protected askAiSecurity(): void {
    this.genUi.openDrawer();
    this.genUi.sendMessage('Help me reset my online banking password');
  }
}
