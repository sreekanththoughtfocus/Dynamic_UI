import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  Type,
} from '@angular/core';
import { NgComponentOutlet, JsonPipe } from '@angular/common';
import { GenUiRegistryService } from '../services/gen-ui-registry.service';
import { GenUiWidgetDirective } from '../types';

@Component({
  selector: 'gen-ui-widget-outlet',
  imports: [NgComponentOutlet, JsonPipe],
  template: `
    <div class="gen-ui-widget-wrapper">
      @if (widgetDef(); as def) {
        <div class="gen-ui-widget-container">
          <ng-container
            [ngComponentOutlet]="def.component"
            [ngComponentOutletInputs]="widget().props"
          />
        </div>
      } @else {
        <div class="gen-ui-widget-fallback">
          <div class="fallback-icon">⚠️</div>
          <div class="fallback-info">
            <strong>Widget "{{ widget().name }}" is not registered.</strong>
            <pre>{{ widget().props | json }}</pre>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .gen-ui-widget-wrapper {
      margin-top: 0.75rem;
      margin-bottom: 0.75rem;
      width: 100%;
    }
    .gen-ui-widget-container {
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(12px);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .gen-ui-widget-container:hover {
      box-shadow: 0 12px 40px rgba(14, 165, 233, 0.2);
    }
    .gen-ui-widget-fallback {
      display: flex;
      gap: 0.75rem;
      padding: 1rem;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 8px;
      color: #fca5a5;
      font-size: 0.85rem;
    }
    .gen-ui-widget-fallback pre {
      margin: 0.5rem 0 0;
      font-size: 0.75rem;
      color: #cbd5e1;
      overflow-x: auto;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenUiWidgetOutletComponent {
  private readonly registry = inject(GenUiRegistryService);

  public readonly widget = input.required<GenUiWidgetDirective>();

  public readonly widgetDef = computed(() => {
    return this.registry.getWidget(this.widget().name);
  });
}
