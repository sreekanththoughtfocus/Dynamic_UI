import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';

interface AuditRow {
  timestamp: string;
  action: string;
  initiator: string;
  details: string;
}

@Component({
  selector: 'bank-audit-timeline-widget',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="insight-card">
      <h4>Audit trail</h4>
      @if (items().length === 0) {
        <p>No audited actions yet.</p>
      } @else {
        @for (item of items(); track item.timestamp + item.action) {
          <div class="row">
            <strong>{{ item.action }}</strong>
            <span>{{ item.timestamp | date: 'medium' }} · {{ item.initiator }}</span>
            <span>{{ item.details }}</span>
          </div>
        }
      }
    </section>
  `,
  styles: `
    .insight-card { color: #f8fafc; display: flex; flex-direction: column; gap: 8px; }
    h4 { margin: 0; color: #7dd3fc; }
    p, span { margin: 0; color: #94a3b8; font-size: 0.75rem; }
    .row { display: flex; flex-direction: column; gap: 2px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,.08); }
    strong { font-size: 0.85rem; }
  `,
})
export class AuditTimelineWidgetComponent {
  readonly items = input<AuditRow[]>([]);
}
