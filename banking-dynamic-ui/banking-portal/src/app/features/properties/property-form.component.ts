import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import {
  PropertyNode,
  PropertyValue,
  PropertyValueMap,
} from '../../core/models/property-document.model';
import { displayedValue, readInput } from '../../core/property-tree';

@Component({
  selector: 'bank-property-form',
  imports: [NgTemplateOutlet],
  template: `
    <div class="property-form">
      @if (nodes().length === 0) {
        <p class="empty">Add a menu to see the settings preview.</p>
      } @else {
        @for (node of nodes(); track node.id) {
          <ng-container
            [ngTemplateOutlet]="nodeTpl"
            [ngTemplateOutletContext]="{ $implicit: node, depth: 0 }"
          />
        }
      }
      @if (actionNote()) {
        <p class="action-note" role="status">{{ actionNote() }}</p>
      }
    </div>

    <ng-template #nodeTpl let-node let-depth="depth">
      <section class="block kind-{{ node.kind }}" [style.padding-left.px]="depth * 14">
        @switch (node.kind) {
          @case ('menu') {
            <header class="section-head">
              <span class="kicker">Menu</span>
              <h3 class="menu-label">{{ node.label }}</h3>
            </header>
          }
          @case ('submenu') {
            <header class="section-head">
              <span class="kicker">Sub menu</span>
              <h4 class="submenu-label">{{ node.label }}</h4>
            </header>
          }
          @case ('action') {
            <button type="button" class="action-btn" (click)="onAction(node)">
              {{ node.label }}
            </button>
          }
          @case ('item') {
            @switch (node.itemType) {
              @case ('radio') {
                <fieldset class="choice">
                  <legend>{{ node.label }}</legend>
                  @for (option of node.options ?? []; track $index) {
                    <label class="choice-option">
                      <input
                        type="radio"
                        [name]="groupPrefix() + '-' + node.id"
                        [value]="option.value"
                        [checked]="textValue(node) === option.value"
                        (change)="emitValue(node.id, option.value)"
                      />
                      <span>{{ option.label }}</span>
                    </label>
                  }
                </fieldset>
              }
              @case ('dropdown') {
                <label class="field">
                  <span>{{ node.label }}</span>
                  <select [value]="textValue(node)" (change)="emitText(node.id, $event)">
                    @for (option of node.options ?? []; track $index) {
                      <option [value]="option.value">{{ option.label }}</option>
                    }
                  </select>
                </label>
              }
              @case ('checkbox') {
                <label class="check">
                  <input
                    type="checkbox"
                    [checked]="boolValue(node)"
                    (change)="emitBool(node.id, $event)"
                  />
                  <span>{{ node.label }}</span>
                </label>
              }
              @case ('toggle') {
                <div class="toggle-row">
                  <span class="toggle-copy">
                    <span>{{ node.label }}</span>
                    <span class="toggle-state">{{ boolValue(node) ? 'On' : 'Off' }}</span>
                  </span>
                  <button
                    type="button"
                    class="toggle"
                    [class.on]="boolValue(node)"
                    [attr.aria-pressed]="boolValue(node)"
                    [attr.aria-label]="node.label"
                    (click)="emitValue(node.id, !boolValue(node))"
                  >
                    <span class="knob"></span>
                  </button>
                </div>
              }
              @case ('number') {
                <label class="field">
                  <span>{{ node.label }}</span>
                  <input
                    type="number"
                    [value]="numberValue(node)"
                    (input)="emitNumber(node.id, $event)"
                  />
                </label>
              }
              @default {
                <label class="field">
                  <span>{{ node.label }}</span>
                  <input type="text" [value]="textValue(node)" (input)="emitText(node.id, $event)" />
                </label>
              }
            }
          }
        }

        @if ((node.children ?? []).length > 0) {
          <div class="children">
            @for (child of node.children ?? []; track child.id) {
              <ng-container
                [ngTemplateOutlet]="nodeTpl"
                [ngTemplateOutletContext]="{ $implicit: child, depth: depth + 1 }"
              />
            }
          </div>
        }
      </section>
    </ng-template>
  `,
  styles: `
    .property-form { display: flex; flex-direction: column; gap: 14px; }
    .empty, .action-note { margin: 0; color: #94a3b8; font-size: 0.84rem; line-height: 1.45; }
    .action-note { padding: 10px 12px; border-radius: 10px; background: rgba(245, 158, 11, 0.12); color: #fcd34d; }
    .block { display: flex; flex-direction: column; gap: 12px; }
    .kind-menu, .kind-submenu { padding: 14px; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; background: rgba(15, 23, 42, 0.55); }
    .kind-submenu { background: rgba(30, 41, 59, 0.45); }
    .kind-item, .kind-action { padding: 12px 14px; border-radius: 12px; background: rgba(2, 6, 23, 0.35); border: 1px solid rgba(255, 255, 255, 0.06); }
    .section-head { display: flex; flex-direction: column; gap: 2px; }
    .kicker { font-size: 0.68rem; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; color: #7dd3fc; }
    .menu-label, .submenu-label { margin: 0; color: #f8fafc; }
    .menu-label { font-size: 1.05rem; }
    .submenu-label { font-size: 0.95rem; }
    .children { display: flex; flex-direction: column; gap: 10px; }
    .field, .choice, .check, .toggle-row { display: flex; gap: 8px; color: #e2e8f0; font-size: 0.88rem; }
    .field, .choice { flex-direction: column; }
    .choice { border: 0; margin: 0; padding: 0; }
    .choice legend, .field > span, .check span { font-weight: 700; }
    .choice-option, .check { align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; background: rgba(15, 23, 42, 0.65); }
    .toggle-row { align-items: center; justify-content: space-between; }
    .toggle-copy { display: flex; flex-direction: column; gap: 2px; }
    .toggle-state { font-size: 0.75rem; color: #93c5fd; font-weight: 700; }
    .field input, .field select, .choice input { accent-color: #38bdf8; }
    .field input, .field select { width: 100%; box-sizing: border-box; background: #0b1220; border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 10px; color: #f8fafc; padding: 9px 11px; }
    .action-btn, .toggle { border-radius: 10px; cursor: pointer; }
    .action-btn { align-self: flex-start; background: linear-gradient(135deg, #0284c7, #2563eb); border: 0; color: white; font-weight: 700; padding: 9px 14px; }
    .toggle { position: relative; width: 46px; height: 26px; border: 0; background: #334155; padding: 0; flex: 0 0 auto; }
    .toggle.on { background: #0284c7; }
    .knob { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: white; transition: transform 0.15s ease; }
    .toggle.on .knob { transform: translateX(20px); }
    button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid #22d3ee; outline-offset: 2px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PropertyFormComponent {
  readonly nodes = input.required<PropertyNode[]>();
  readonly values = input.required<PropertyValueMap>();
  readonly groupPrefix = input('prop');
  readonly valueChange = output<{ id: string; value: PropertyValue }>();

  protected readonly actionNote = signal<string | null>(null);

  protected textValue(node: PropertyNode): string {
    const value = displayedValue(node, this.values());
    return typeof value === 'string' ? value : String(value);
  }

  protected numberValue(node: PropertyNode): number {
    const value = displayedValue(node, this.values());
    return typeof value === 'number' ? value : 0;
  }

  protected boolValue(node: PropertyNode): boolean {
    return displayedValue(node, this.values()) === true;
  }

  protected emitText(id: string, event: Event): void {
    this.valueChange.emit({ id, value: readInput(event) });
  }

  protected emitBool(id: string, event: Event): void {
    const target = event.target;
    const checked = target instanceof HTMLInputElement ? target.checked : false;
    this.valueChange.emit({ id, value: checked });
  }

  protected emitNumber(id: string, event: Event): void {
    const raw = readInput(event).trim();
    const parsed = raw === '' ? 0 : Number(raw);
    this.valueChange.emit({ id, value: Number.isFinite(parsed) ? parsed : 0 });
  }

  protected emitValue(id: string, value: PropertyValue): void {
    this.valueChange.emit({ id, value });
  }

  protected onAction(node: PropertyNode): void {
    const key = node.actionKey?.trim() || 'action';
    this.actionNote.set(
      `${node.label} stores action "${key}". It does not run a banking operation yet.`,
    );
  }
}
