import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { BankingStateService } from '../../../core/services/banking.service';

@Component({
  selector: 'bank-travel-notice-widget',
  imports: [CurrencyPipe, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="insight-card">
      <header>
        <h4>Travel notice · {{ destination() }}</h4>
        <p>{{ cardName() }} · {{ startDate() | date: 'mediumDate' }} – {{ endDate() | date: 'mediumDate' }}</p>
      </header>
      <div class="row"><span>Limit now</span><strong>{{ currentLimit() | currency: 'USD' }}</strong></div>
      <div class="row"><span>Limit for the trip</span><strong>{{ suggestedLimit() | currency: 'USD' }}</strong></div>
      @if (done()) {
        <p class="ok">Notice saved and the card limit is updated.</p>
      } @else {
        <button type="button" class="primary" [disabled]="busy()" (click)="apply()">Apply travel notice</button>
      }
    </section>
  `,
  styles: `
    .insight-card { color: #f8fafc; display: flex; flex-direction: column; gap: 8px; }
    h4 { margin: 0; color: #c4b5fd; }
    p { margin: 0; color: #94a3b8; font-size: 0.78rem; }
    .row { display: flex; justify-content: space-between; }
    .primary { background: #6d28d9; color: white; border: 0; border-radius: 8px; padding: 8px 12px; font-weight: 700; cursor: pointer; }
    .ok { color: #34d399; font-weight: 700; }
    button:focus-visible { outline: 2px solid #22d3ee; outline-offset: 2px; }
  `,
})
export class TravelNoticeWidgetComponent {
  private readonly banking = inject(BankingStateService);
  readonly destination = input('your trip');
  readonly startDate = input('');
  readonly endDate = input('');
  readonly cardId = input('');
  readonly cardName = input('Card');
  readonly currentLimit = input(0);
  readonly suggestedLimit = input(0);
  protected readonly busy = signal(false);
  protected readonly done = signal(false);

  protected async apply(): Promise<void> {
    this.busy.set(true);
    const ok = await this.banking.fileTravelNotice({
      destination: this.destination(),
      cardId: this.cardId(),
      startDate: this.startDate(),
      endDate: this.endDate(),
      temporaryLimit: this.suggestedLimit(),
    });
    this.busy.set(false);
    this.done.set(ok);
  }
}
