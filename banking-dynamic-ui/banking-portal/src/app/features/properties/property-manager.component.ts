import { DatePipe, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { BankingStateService } from '../../core/services/banking.service';
import {
  ITEM_TYPES,
  PropertyDocument,
  PropertyDocumentSummary,
  ItemType,
  PropertyKind,
  PropertyNode,
  PropertyValue,
  isItemType,
  itemTypeLabel,
  kindLabel,
} from '../../core/models/property-document.model';
import {
  childKinds,
  choiceOptions,
  coerceValues,
  createNode,
  defaultValue,
  findNode,
  findParentId,
  insertNode,
  parentKindOf,
  parseKind,
  pruneValues,
  readInput,
  removeNode,
  replaceNode,
  validateTree,
  withKind,
} from '../../core/property-tree';
import { PropertyFormComponent } from './property-form.component';

@Component({
  selector: 'bank-property-manager',
  imports: [DatePipe, NgTemplateOutlet, RouterLink, PropertyFormComponent],
  template: `
    <div class="manager">
      <header class="manager-header">
        <div>
          <p class="eyebrow">Admin · Property Manager</p>
          <h1>Dynamic property manager</h1>
          <p class="lede">
            Build the list on the left, change the selected row in the middle, and check the preview on the right. Save stores it.
          </p>
          <ol class="steps">
            <li>Pick a row</li>
            <li>Edit it</li>
            <li>Check the preview</li>
            <li>Save</li>
          </ol>
        </div>
        <div class="header-links">
          <a routerLink="/settings">Open settings page</a>
          <a routerLink="/admin">Database console</a>
        </div>
      </header>

      @if (loading()) {
        <p class="status">Loading property document…</p>
      } @else if (loadError()) {
        <p class="status error" role="alert">{{ loadError() }}</p>
      } @else if (document(); as doc) {
        <div class="toolbar">
          @if (documents().length > 1) {
            <label>
              Document
              <select [value]="doc.id" (change)="onPickDocument($event)">
                @for (item of documents(); track item.id) {
                  <option [value]="item.id">{{ item.name }}</option>
                }
              </select>
            </label>
          }
          <label class="name-field">
            Document name
            <input [value]="doc.name" (input)="rename($event)" />
          </label>
          <button type="button" class="save" (click)="save()" [disabled]="saving()">
            {{ saving() ? 'Saving…' : 'Save shape and values' }}
          </button>
          @if (doc.updatedAt) {
            <span class="saved">Last saved {{ doc.updatedAt | date: 'medium' }}</span>
          }
        </div>

        @if (saveError()) {
          <p class="status error" role="alert">{{ saveError() }}</p>
        }

        <div class="panes">
          <section class="pane" aria-label="Property tree">
            <h2>1. Tree</h2>
            <ul class="legend">
              <li><span class="kind kind-menu">Menu</span> a group</li>
              <li><span class="kind kind-item">Item</span> a setting</li>
              <li><span class="kind kind-submenu">Sub menu</span> a group inside an item</li>
              <li><span class="kind kind-action">Action</span> a button</li>
            </ul>
            @if (doc.tree.length === 0) {
              <p class="hint">The tree is empty. Add a menu to start.</p>
            }
            <div class="tree">
              @for (node of doc.tree; track node.id) {
                <ng-container
                  [ngTemplateOutlet]="treeNode"
                  [ngTemplateOutletContext]="{ $implicit: node, depth: 0 }"
                />
              }
            </div>
            <div class="add-box">
              <p class="add-title">{{ addTitle() }}</p>
              <div class="add-row">
                <button type="button" class="add" (click)="addNode('menu', null)">+ Add menu</button>
                @for (kind of addChoices(); track kind) {
                  <button type="button" class="add" (click)="addNode(kind, selectedId())">+ {{ addLabel(kind) }}</button>
                }
              </div>
            </div>
          </section>

          <section class="pane" aria-label="Selected node">
            <h2>2. Edit</h2>
            @if (selectedNode(); as node) {
              <p class="editing">Editing <strong>{{ node.label }}</strong></p>
              <label class="field">
                Name people see
                <input [value]="node.label" (input)="onLabel($event)" />
              </label>
              <label class="field">
                What is this?
                <select [value]="node.kind" (change)="onKind($event)">
                  @for (kind of kindChoices(); track kind) {
                    <option [value]="kind">{{ kindLabel(kind) }}</option>
                  }
                </select>
              </label>
              <p class="hint">{{ kindHint(node.kind) }}</p>

              @if (node.kind === 'item') {
                <label class="field">
                  How people answer
                  <select [value]="node.itemType ?? 'text'" (change)="onItemType($event)">
                    @for (itemType of itemTypes; track itemType) {
                      <option [value]="itemType">{{ itemTypeLabel(itemType) }}</option>
                    }
                  </select>
                </label>
                <p class="hint">{{ typeHint(node.itemType ?? 'text') }}</p>
                @if (node.itemType === 'radio' || node.itemType === 'dropdown') {
                  <div class="choices">
                    <span class="field-label">Choices people can pick</span>
                    <span class="hint">Left is the words they see. Right is the value that gets saved.</span>
                    @for (option of node.options ?? []; track $index) {
                      <div class="choice-row">
                        <input
                          [value]="option.label"
                          (input)="onOptionLabel($index, $event)"
                          aria-label="Choice label"
                          placeholder="Label"
                        />
                        <input
                          [value]="option.value"
                          (input)="onOptionValue($index, $event)"
                          aria-label="Choice value"
                          placeholder="Value"
                        />
                        <button
                          type="button"
                          (click)="removeOption($index)"
                          [disabled]="(node.options ?? []).length < 2"
                        >
                          Delete choice
                        </button>
                      </div>
                    }
                    <button type="button" class="add" (click)="addOption()">+ Add choice</button>
                  </div>
                }
                <div class="current-value">
                  <span class="field-label">Answer right now</span>
                  <bank-property-form
                    [nodes]="editorNodes()"
                    [values]="doc.values"
                    groupPrefix="editor"
                    (valueChange)="onValue($event)"
                  />
                </div>
              }

              @if (node.kind === 'action') {
                <label class="field">
                  Action key
                  <input [value]="node.actionKey ?? ''" (input)="onActionKey($event)" spellcheck="false" />
                </label>
                <p class="hint">People will see a button. The action key is saved for later. It does not run a banking task yet.</p>
              }

              <div class="delete-box">
                @if (pendingDeleteId() === node.id) {
                  <p>Delete <strong>{{ node.label }}</strong>@if (childCount(node) > 0) { and everything inside it }? Press Save afterwards to keep this.</p>
                  <div class="add-row">
                    <button type="button" class="danger-solid" (click)="confirmDelete()">Delete now</button>
                    <button type="button" (click)="cancelDelete()">Keep it</button>
                  </div>
                } @else {
                  <button type="button" class="danger" (click)="askDelete(node.id)">{{ deletePhrase(node.kind) }}</button>
                }
              </div>
            } @else {
              <p class="hint">Select a row in the tree, or add a menu.</p>
            }
          </section>

          <section class="pane preview-pane" aria-label="Live preview">
            <h2>3. Preview</h2>
            <p class="hint">This is the settings page. {{ answerCount() }} answers will be saved with the tree.</p>
            <bank-property-form
              [nodes]="doc.tree"
              [values]="doc.values"
              groupPrefix="preview"
              (valueChange)="onValue($event)"
            />
          </section>
        </div>
      }
    </div>

    <ng-template #treeNode let-node let-depth="depth">
      <div class="tree-item" [style.margin-left.px]="depth * 16">
        <div class="tree-row" [class.selected]="node.id === selectedId()" [class.pending]="pendingDeleteId() === node.id">
          @if (childCount(node) > 0) {
            <button
              type="button"
              class="chevron"
              (click)="toggle(node.id)"
              [attr.aria-expanded]="!isCollapsed(node.id)"
              [attr.aria-label]="(isCollapsed(node.id) ? 'Expand ' : 'Collapse ') + node.label"
            >
              {{ isCollapsed(node.id) ? '▸' : '▾' }}
            </button>
          } @else {
            <span class="chevron spacer" aria-hidden="true"></span>
          }
          <button type="button" class="tree-select" [attr.aria-current]="node.id === selectedId() ? 'true' : null" (click)="select(node.id)">
            <span class="kind kind-{{ node.kind }}">{{ kindLabel(node.kind) }}</span>
            <span class="row-label">{{ node.label }}</span>
          </button>
          <button type="button" class="row-delete" (click)="askDelete(node.id)" [attr.aria-label]="'Delete ' + node.label">
            Delete
          </button>
        </div>
        @if (pendingDeleteId() === node.id) {
          <div class="row-confirm">
            <p>Delete {{ node.label }}@if (childCount(node) > 0) { and everything inside it }?</p>
            <button type="button" class="danger-solid" (click)="confirmDelete()">Delete now</button>
            <button type="button" (click)="cancelDelete()">Keep it</button>
          </div>
        }
      </div>
      @if (!isCollapsed(node.id)) {
        @for (child of node.children ?? []; track child.id) {
          <ng-container
            [ngTemplateOutlet]="treeNode"
            [ngTemplateOutletContext]="{ $implicit: child, depth: depth + 1 }"
          />
        }
      }
    </ng-template>
  `,
  styles: `
    .manager { display: flex; flex-direction: column; gap: 16px; color: #e2e8f0; }
    .manager-header, .toolbar, .header-links, .add-row, .choice-row {
      display: flex; gap: 10px; flex-wrap: wrap; align-items: center;
    }
    .manager-header { justify-content: space-between; align-items: flex-end; }
    h1 { margin: 0; font-size: 1.55rem; color: #f8fafc; letter-spacing: -0.02em; }
    h2 { margin: 0 0 10px; font-size: 1rem; color: #f8fafc; }
    .eyebrow { margin: 0 0 4px; color: #38bdf8; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em; }
    .lede, .hint, .saved, .status, .add-title, .editing, .delete-box p, .row-confirm p { margin: 0; color: #94a3b8; font-size: 0.82rem; line-height: 1.45; }
    .lede { max-width: 640px; }
    .steps { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0 0; padding: 0; list-style: none; }
    .steps li { background: rgba(14, 165, 233, 0.12); color: #bae6fd; border-radius: 999px; padding: 4px 10px; font-size: 0.75rem; font-weight: 700; }
    .header-links a { color: #7dd3fc; font-size: 0.8rem; font-weight: 700; }
    .toolbar, .pane { background: rgba(15, 23, 42, 0.88); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; }
    .toolbar { padding: 12px 14px; justify-content: space-between; }
    .name-field, .field { display: flex; flex-direction: column; gap: 6px; font-size: 0.78rem; font-weight: 700; color: #e2e8f0; }
    .name-field { min-width: 220px; flex: 1; }
    input, select { width: 100%; box-sizing: border-box; background: #0b1220; border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 10px; color: #f8fafc; padding: 9px 11px; font-weight: 500; }
    button { border-radius: 10px; cursor: pointer; font-weight: 700; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.12); color: #e2e8f0; padding: 8px 12px; }
    .save, .add { background: rgba(14, 165, 233, 0.16); border-color: rgba(56, 189, 248, 0.45); color: #e0f2fe; }
    .save { background: linear-gradient(135deg, #0284c7, #2563eb); border: 0; color: white; padding: 10px 16px; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .status.error { color: #fecaca; }
    .panes { display: grid; grid-template-columns: minmax(320px, 1.15fr) minmax(280px, 0.95fr) minmax(300px, 1.1fr); gap: 14px; align-items: start; }
    .pane { padding: 16px; min-width: 0; }
    .legend { display: flex; flex-direction: column; gap: 6px; margin: 0 0 12px; padding: 0; list-style: none; color: #cbd5e1; font-size: 0.78rem; }
    .legend li { display: flex; align-items: center; gap: 8px; }
    .tree { display: flex; flex-direction: column; gap: 6px; }
    .tree-row { display: flex; gap: 6px; align-items: center; padding: 4px; border: 1px solid transparent; border-radius: 12px; }
    .tree-row.selected { background: rgba(14, 165, 233, 0.12); border-color: rgba(56, 189, 248, 0.45); }
    .tree-row.pending { border-color: rgba(248, 113, 113, 0.7); background: rgba(127, 29, 29, 0.25); }
    .chevron, .spacer { width: 28px; height: 28px; flex: 0 0 28px; padding: 0; }
    .tree-select { flex: 1; min-width: 0; display: flex; gap: 8px; align-items: center; text-align: left; background: transparent; border-color: transparent; }
    .row-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .row-delete, .danger { color: #fecaca; border-color: rgba(248, 113, 113, 0.55); background: rgba(127, 29, 29, 0.35); flex: 0 0 auto; }
    .danger-solid { background: #dc2626; border: 0; color: white; }
    .row-confirm, .delete-box, .add-box { margin-top: 8px; padding: 10px; border-radius: 12px; background: rgba(2, 6, 23, 0.45); }
    .delete-box { border: 1px solid rgba(248, 113, 113, 0.35); }
    .kind { flex: 0 0 auto; font-size: 0.62rem; font-weight: 800; letter-spacing: 0.03em; text-transform: uppercase; border-radius: 999px; padding: 3px 7px; }
    .kind-menu { color: #ddd6fe; background: rgba(139, 92, 246, 0.2); }
    .kind-item { color: #bae6fd; background: rgba(14, 165, 233, 0.18); }
    .kind-submenu { color: #c4b5fd; background: rgba(99, 102, 241, 0.2); }
    .kind-action { color: #fde68a; background: rgba(245, 158, 11, 0.18); }
    .choices, .current-value, .field, .editing { margin-top: 12px; }
    .choice-row { width: 100%; }
    .choice-row input { flex: 1; min-width: 0; width: auto; }
    .field-label { display: block; margin-bottom: 6px; font-size: 0.78rem; font-weight: 700; color: #e2e8f0; }
    .editing strong, .delete-box strong { color: #f8fafc; }
    button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible { outline: 2px solid #22d3ee; outline-offset: 2px; }
    @media (max-width: 1180px) { .panes { grid-template-columns: 1fr; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PropertyManagerComponent implements OnInit {
  private readonly banking = inject(BankingStateService);

  protected readonly itemTypes = ITEM_TYPES;
  protected readonly kindLabel = kindLabel;
  protected readonly itemTypeLabel = itemTypeLabel;
  protected readonly documents = signal<PropertyDocumentSummary[]>([]);
  protected readonly document = signal<PropertyDocument | null>(null);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly collapsed = signal<ReadonlySet<string>>(new Set());
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);
  protected readonly pendingDeleteId = signal<string | null>(null);

  protected readonly selectedNode = computed(() => {
    const doc = this.document();
    const id = this.selectedId();
    if (!doc || !id) return null;
    return findNode(doc.tree, id);
  });

  protected readonly kindChoices = computed(() => {
    const doc = this.document();
    const id = this.selectedId();
    if (!doc || !id) return [] as PropertyKind[];
    const parent = parentKindOf(doc.tree, id);
    if (parent == null) return [] as PropertyKind[];
    if (parent === 'root') return ['menu'] as PropertyKind[];
    return childKinds({ id: 'parent', kind: parent, label: 'parent' });
  });

  protected readonly addChoices = computed(() => {
    const node = this.selectedNode();
    return node ? childKinds(node) : [];
  });

  protected readonly editorNodes = computed(() => {
    const node = this.selectedNode();
    if (!node || node.kind !== 'item') return [];
    return [{ ...node, children: [] }];
  });

  protected readonly answerCount = computed(() => Object.keys(this.document()?.values ?? {}).length);

  ngOnInit(): void {
    void this.load();
  }

  protected isCollapsed(id: string): boolean {
    return this.collapsed().has(id);
  }

  protected toggle(id: string): void {
    this.collapsed.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected select(id: string): void {
    if (this.pendingDeleteId() !== id) this.pendingDeleteId.set(null);
    this.selectedId.set(id);
  }

  protected childCount(node: PropertyNode): number {
    return node.children?.length ?? 0;
  }

  protected addTitle(): string {
    const node = this.selectedNode();
    if (!node) return 'Add a menu at the top of the tree.';
    if (node.kind === 'menu' || node.kind === 'submenu') return `Add inside "${node.label}".`;
    if (node.kind === 'item') return `Add a sub menu under "${node.label}".`;
    return `"${node.label}" is a button. Add the next piece beside it, or add a new menu.`;
  }

  protected addLabel(kind: PropertyKind): string {
    switch (kind) {
      case 'menu':
        return 'Add menu';
      case 'submenu':
        return 'Add sub menu';
      case 'action':
        return 'Add action';
      default:
        return 'Add item';
    }
  }

  protected deletePhrase(kind: PropertyKind): string {
    switch (kind) {
      case 'menu':
        return 'Delete this menu';
      case 'submenu':
        return 'Delete this sub menu';
      case 'action':
        return 'Delete this action';
      default:
        return 'Delete this item';
    }
  }

  protected typeHint(itemType: ItemType): string {
    switch (itemType) {
      case 'radio':
        return 'People pick one choice from a list.';
      case 'checkbox':
        return 'People turn this on or off.';
      case 'dropdown':
        return 'People pick one choice from a menu.';
      case 'toggle':
        return 'A switch. On or off.';
      case 'number':
        return 'People type a number.';
      default:
        return 'People type a short answer.';
    }
  }

  protected kindHint(kind: PropertyKind): string {
    switch (kind) {
      case 'menu':
        return 'A menu groups settings. It does not store a value.';
      case 'submenu':
        return 'A sub menu groups settings under an item.';
      case 'item':
        return 'An item is a setting. Its type decides the control.';
      default:
        return 'An action is a button. The action key is stored for later.';
    }
  }

  protected rename(event: Event): void {
    const name = readInput(event);
    this.document.update((doc) => (doc ? { ...doc, name } : doc));
  }

  protected async onPickDocument(event: Event): Promise<void> {
    const id = readInput(event);
    if (!id || id === this.document()?.id) return;
    await this.loadDocument(id);
  }

  protected addNode(kind: PropertyKind, parentId: string | null): void {
    const doc = this.document();
    if (!doc) return;
    const parent = parentId ? findNode(doc.tree, parentId) : null;
    if (parentId && !parent) return;
    if (!childKinds(parent).includes(kind)) return;
    const node = createNode(kind);
    this.document.update((current) => {
      if (!current) return current;
      const tree = insertNode(current.tree, parentId, node);
      const values = pruneValues(current.values, tree);
      if (node.kind === 'item' && node.itemType) {
        values[node.id] = defaultValue(node.itemType, node.options);
      }
      return { ...current, tree, values };
    });
    this.selectedId.set(node.id);
    if (parentId) this.expand(parentId);
  }

  protected askDelete(id: string): void {
    this.selectedId.set(id);
    this.pendingDeleteId.set(id);
  }

  protected cancelDelete(): void {
    this.pendingDeleteId.set(null);
  }

  protected confirmDelete(): void {
    const id = this.pendingDeleteId();
    const doc = this.document();
    if (!id || !doc) return;
    const parentId = findParentId(doc.tree, id);
    this.document.update((current) => {
      if (!current) return current;
      const tree = removeNode(current.tree, id);
      return { ...current, tree, values: pruneValues(current.values, tree) };
    });
    this.pendingDeleteId.set(null);
    this.selectedId.set(parentId);
  }

  protected onLabel(event: Event): void {
    const node = this.selectedNode();
    if (!node) return;
    this.replaceSelected({ ...node, label: readInput(event) });
  }

  protected onKind(event: Event): void {
    const node = this.selectedNode();
    const kind = parseKind(readInput(event));
    if (!node || !kind || kind === node.kind) return;
    const next = withKind(node, kind);
    const value =
      next.kind === 'item' ? defaultValue(next.itemType ?? 'text', next.options) : undefined;
    this.replaceSelected(next, value);
  }

  protected onItemType(event: Event): void {
    const node = this.selectedNode();
    const itemType = readInput(event);
    if (!node || node.kind !== 'item' || !isItemType(itemType)) return;
    const options = choiceOptions(itemType, node.options);
    this.replaceSelected(
      { ...node, itemType, options },
      defaultValue(itemType, options),
    );
  }

  protected onActionKey(event: Event): void {
    const node = this.selectedNode();
    if (!node || node.kind !== 'action') return;
    this.replaceSelected({ ...node, actionKey: readInput(event) });
  }

  protected onOptionLabel(index: number, event: Event): void {
    const node = this.selectedNode();
    if (!node?.options) return;
    const options = node.options.map((option, optionIndex) =>
      optionIndex === index ? { ...option, label: readInput(event) } : option,
    );
    this.replaceSelected({ ...node, options });
  }

  protected onOptionValue(index: number, event: Event): void {
    const node = this.selectedNode();
    if (!node?.options) return;
    const previous = node.options[index]?.value;
    const valueText = readInput(event);
    const options = node.options.map((option, optionIndex) =>
      optionIndex === index ? { ...option, value: valueText } : option,
    );
    const current = this.document()?.values?.[node.id];
    const nextValue = current === previous ? valueText : undefined;
    this.replaceSelected({ ...node, options }, nextValue);
  }

  protected addOption(): void {
    const node = this.selectedNode();
    if (!node || node.kind !== 'item') return;
    const count = (node.options?.length ?? 0) + 1;
    const options = [...(node.options ?? []), { value: `option-${count}`, label: `Option ${count}` }];
    this.replaceSelected({ ...node, options });
  }

  protected removeOption(index: number): void {
    const node = this.selectedNode();
    if (!node?.options || node.options.length < 2) return;
    const removed = node.options[index];
    const options = node.options.filter((_, optionIndex) => optionIndex !== index);
    const current = this.document()?.values?.[node.id];
    const nextValue = current === removed?.value ? (options[0]?.value ?? '') : undefined;
    this.replaceSelected({ ...node, options }, nextValue);
  }

  protected onValue(change: { id: string; value: PropertyValue }): void {
    this.document.update((doc) => {
      if (!doc) return doc;
      return { ...doc, values: { ...doc.values, [change.id]: change.value } };
    });
  }

  protected async save(): Promise<void> {
    const doc = this.document();
    if (!doc || this.saving()) return;
    const name = doc.name.trim();
    if (!name) {
      this.saveError.set('The document needs a name.');
      return;
    }
    const problem = validateTree(doc.tree);
    if (problem) {
      this.saveError.set(problem);
      return;
    }
    const payload: PropertyDocument = {
      ...doc,
      name,
      values: coerceValues(doc.tree, doc.values),
    };
    this.saving.set(true);
    this.saveError.set(null);
    const result = await this.banking.savePropertyDocument(payload);
    this.saving.set(false);
    const saved = result.document;
    if (!saved) {
      this.saveError.set(result.error ?? 'The property document was not saved.');
      return;
    }
    this.document.set(saved);
    const selected = this.selectedId();
    if (!selected || !findNode(saved.tree, selected)) {
      this.selectedId.set(saved.tree[0]?.id ?? null);
    }
    this.documents.update((list) =>
      list.map((item) =>
        item.id === saved.id
          ? { ...item, name: saved.name, updatedAt: saved.updatedAt ?? item.updatedAt }
          : item,
      ),
    );
    this.banking.showToast('Property document saved.');
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    const list = await this.banking.listPropertyDocuments();
    if (!list) {
      this.loading.set(false);
      this.loadError.set('The property documents could not be loaded.');
      return;
    }
    this.documents.set(list);
    if (list.length === 0) {
      this.loading.set(false);
      this.loadError.set('No property document is stored yet.');
      return;
    }
    await this.loadDocument(list[0].id);
    this.loading.set(false);
  }

  private async loadDocument(id: string): Promise<void> {
    const doc = await this.banking.getPropertyDocument(id);
    if (!doc) {
      this.document.set(null);
      this.loadError.set('The property document could not be loaded.');
      return;
    }
    this.loadError.set(null);
    this.saveError.set(null);
    this.document.set(doc);
    this.selectedId.set(doc.tree[0]?.id ?? null);
  }

  private replaceSelected(next: PropertyNode, value?: PropertyValue): void {
    const id = this.selectedId();
    if (!id) return;
    this.document.update((doc) => {
      if (!doc) return doc;
      const tree = replaceNode(doc.tree, id, next);
      const values = pruneValues(doc.values, tree);
      if (next.kind === 'item') {
        if (value !== undefined) values[next.id] = value;
        else if (values[next.id] === undefined) {
          values[next.id] = defaultValue(next.itemType ?? 'text', next.options);
        }
      }
      return { ...doc, tree, values };
    });
  }

  private expand(id: string): void {
    this.collapsed.update((set) => {
      if (!set.has(id)) return set;
      const next = new Set(set);
      next.delete(id);
      return next;
    });
  }
}
