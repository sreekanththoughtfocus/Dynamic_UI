import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BankingStateService } from '../../../core/services/banking.service';

interface DisputeCandidate {
  id: string;
  description: string;
  amount: number;
  date: string;
}

@Component({
  selector: 'bank-dispute-widget',
  imports: [CurrencyPipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="insight-card">
      <header>
        <h4>Dispute a charge</h4>
        <p>Opens a case on the ledger. The original transaction stays posted.</p>
      </header>
      @if (receipt()) {
        <p class="ok">Case {{ receipt() }} is open and on the audit log.</p>
      } @else {
        <label>
          Transaction
          <select [ngModel]="selected()" (ngModelChange)="selected.set($event)">
            @for (item of candidates(); track item.id) {
              <option [value]="item.id">{{ item.description }} · {{ item.amount | currency: 'USD' }}</option>
            }
          </select>
        </label>
        <label>
          Reason
          <select [ngModel]="reason()" (ngModelChange)="reason.set($event)">
            <option>Not recognized</option>
            <option>Duplicate charge</option>
            <option>Incorrect amount</option>
            <option>Subscription cancelled</option>
          </select>
        </label>
        @if (error()) { <p class="warn">{{ error() }}</p> }
        <button type="button" class="primary" [disabled]="busy()" (click)="submit()">File dispute</button>
      }
    </section>
  `,
  styles: `
    .insight-card { color: #f8fafc; display: flex; flex-direction: column; gap: 10px; }
    h4 { margin: 0; color: #fca5a5; }
    p { margin: 0; color: #94a3b8; font-size: 0.75rem; }
    label { display: flex; flex-direction: column; gap: 4px; font-size: 0.75rem; color: #cbd5e1; }
    select { background: #0f172a; color: #f8fafc; border: 1px solid rgba(255,255,255,.15); border-radius: 8px; padding: 8px; }
    .primary { background: #be123c; color: white; border: 0; border-radius: 8px; padding: 8px 12px; font-weight: 700; cursor: pointer; }
    .primary:disabled { opacity: .5; }
    .ok { color: #34d399; font-weight: 700; }
    .warn { color: #fbbf24; }
    button:focus-visible, select:focus-visible { outline: 2px solid #22d3ee; outline-offset: 2px; }
  `,
})
export class DisputeWidgetComponent {
  private readonly banking = inject(BankingStateService);
  readonly candidates = input<DisputeCandidate[]>([]);
  readonly selectedId = input('');
  protected readonly selected = signal('');
  protected readonly reason = signal('Not recognized');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly receipt = signal<string | null>(null);

  constructor() {
    queueMicrotask(() => {
      if (this.selectedId()) this.selected.set(this.selectedId());
      else if (this.candidates()[0]) this.selected.set(this.candidates()[0].id);
    });
  }

  protected async submit(): Promise<void> {
    const id = this.selected();
    if (!id) {
      this.error.set('Choose a transaction.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    const filed = await this.banking.fileDispute(id, this.reason());
    this.busy.set(false);
    if (!filed) {
      this.error.set('The dispute was not saved.');
      return;
    }
    this.receipt.set(filed.id);
  }
}
