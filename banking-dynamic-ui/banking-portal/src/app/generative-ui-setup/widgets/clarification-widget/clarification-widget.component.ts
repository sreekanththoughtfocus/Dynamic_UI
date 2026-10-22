import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { GenUiService } from 'generative-ui';

interface ChoiceOption {
  label: string;
  message: string;
}

@Component({
  selector: 'bank-clarification-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="insight-card">
      <h4>{{ question() }}</h4>
      <div class="choices">
        @for (option of options(); track option.message) {
          <button type="button" (click)="choose(option.message)">{{ option.label }}</button>
        }
      </div>
    </section>
  `,
  styles: `
    .insight-card { color: #f8fafc; display: flex; flex-direction: column; gap: 8px; }
    h4 { margin: 0; font-size: 0.9rem; }
    .choices { display: flex; flex-direction: column; gap: 6px; }
    button {
      text-align: left; background: rgba(14,165,233,.12); color: #e0f2fe;
      border: 1px solid rgba(56,189,248,.35); border-radius: 10px; padding: 8px 10px;
      cursor: pointer; font-weight: 650;
    }
    button:hover { background: rgba(14,165,233,.22); }
    button:focus-visible { outline: 2px solid #22d3ee; outline-offset: 2px; }
  `,
})
export class ClarificationWidgetComponent {
  private readonly genUi = inject(GenUiService);
  readonly question = input('Choose one');
  readonly options = input<ChoiceOption[]>([]);

  protected choose(message: string): void {
    void this.genUi.sendMessage(message);
  }
}
