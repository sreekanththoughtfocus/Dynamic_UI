import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { BankingStateService } from '../../../core/services/banking.service';

@Component({
  selector: 'bank-goal-planner-widget',
  imports: [CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="insight-card">
      <header>
        <h4>Savings goal</h4>
        <p>{{ targetAmount() | currency: 'USD' }} in {{ months() }} months</p>
      </header>
      <div class="row"><span>Each month</span><strong>{{ monthlyAmount() | currency: 'USD' }}</strong></div>
      <div class="row"><span>Keep in checking</span><strong>{{ buffer() | currency: 'USD' }}</strong></div>
      <div class="row"><span>From</span><strong>{{ fromAccount() }}</strong></div>
      <div class="row"><span>To</span><strong>{{ recipient() }}</strong></div>
      @if (done()) {
        <p class="ok">First month posted to the ledger.</p>
      } @else if (!canFund()) {
        <p class="warn">Available cash after the buffer does not cover the first month.</p>
      } @else {
        <button type="button" class="primary" [disabled]="busy()" (click)="fund()">Post the first month</button>
      }
    </section>
  `,
  styles: `
    .insight-card { color: #f8fafc; display: flex; flex-direction: column; gap: 8px; }
    h4 { margin: 0; color: #34d399; }
    p { margin: 0; color: #94a3b8; font-size: 0.78rem; }
    .row { display: flex; justify-content: space-between; gap: 8px; font-size: 0.82rem; }
    .primary { background: #059669; color: white; border: 0; border-radius: 8px; padding: 8px 12px; font-weight: 700; cursor: pointer; }
    .primary:disabled { opacity: .5; }
    .ok { color: #34d399; font-weight: 700; }
    .warn { color: #fbbf24; }
    button:focus-visible { outline: 2px solid #22d3ee; outline-offset: 2px; }
  `,
})
export class GoalPlannerWidgetComponent {
  private readonly banking = inject(BankingStateService);
  readonly targetAmount = input(0);
  readonly months = input(6);
  readonly monthlyAmount = input(0);
  readonly buffer = input(500);
  readonly available = input(0);
  readonly fromAccountId = input('acc-chk-01');
  readonly fromAccount = input('Checking');
  readonly recipient = input('Savings');
  readonly canFund = input(false);
  protected readonly busy = signal(false);
  protected readonly done = signal(false);

  protected async fund(): Promise<void> {
    this.busy.set(true);
    const ok = await this.banking.transferFunds(
      this.fromAccountId(),
      this.recipient(),
      this.monthlyAmount(),
      'Savings goal',
    );
    this.busy.set(false);
    this.done.set(ok);
  }
}
