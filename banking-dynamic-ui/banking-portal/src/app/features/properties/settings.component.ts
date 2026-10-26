import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PropertyDocument, PropertyValue, PropertyValueMap } from '../../core/models/property-document.model';
import { coerceValues, selectedMenuValues } from '../../core/property-tree';
import { BankingStateService } from '../../core/services/banking.service';
import { PropertyFormComponent } from './property-form.component';

@Component({
  selector: 'bank-app-settings',
  imports: [DatePipe, RouterLink, PropertyFormComponent],
  template: `
    <div class="settings">
      <header>
        <div>
          <p class="eyebrow">Portal · App Settings</p>
          <h1>{{ document()?.name || 'App settings' }}</h1>
          <p class="lede">Answer the settings below. Menus group them. Save keeps your answers.</p>
        </div>
        <a routerLink="/admin/properties">Edit in property manager</a>
      </header>

      @if (loading()) {
        <p class="status">Loading settings…</p>
      } @else if (loadError()) {
        <p class="status error" role="alert">{{ loadError() }}</p>
      } @else if (document(); as doc) {
        <div class="workspace">
          <div class="editor">
            <section class="card">
              <bank-property-form
                [nodes]="doc.tree"
                [values]="values()"
                groupPrefix="settings"
                (valueChange)="onValue($event)"
              />
            </section>
            <div class="save-bar">
              <button type="button" (click)="save()" [disabled]="saving()">
                {{ saving() ? 'Saving…' : 'Save values' }}
              </button>
              @if (doc.updatedAt) {
                <span>Last saved {{ doc.updatedAt | date: 'medium' }}</span>
              }
            </div>
            @if (saveError()) {
              <p class="status error" role="alert">{{ saveError() }}</p>
            }
          </div>

          <aside class="json-pane" aria-label="JSON for this page">
            <section>
              <div class="json-head">
                <div>
                  <h2>Selected values</h2>
                  <p>Only the answers picked in each menu. This follows the form as you change it.</p>
                </div>
                <button type="button" class="copy" (click)="copyJson('selected')">
                  {{ copied() === 'selected' ? 'Copied' : 'Copy' }}
                </button>
              </div>
              <pre class="selected-json">{{ selectedJson() }}</pre>
            </section>
            <section>
              <div class="json-head">
                <div>
                  <h2>Saved JSON</h2>
                  <p>The full tree and answers stored for this page. It changes after Save values.</p>
                </div>
                <button type="button" class="copy" (click)="copyJson('saved')">
                  {{ copied() === 'saved' ? 'Copied' : 'Copy' }}
                </button>
              </div>
              <pre>{{ savedJson() }}</pre>
            </section>
          </aside>
        </div>
      }
    </div>
  `,
  styles: `
    .settings { display: flex; flex-direction: column; gap: 16px; color: #e2e8f0; }
    header, .json-head, .save-bar { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
    h1, h2 { margin: 0; color: #f8fafc; }
    h1 { font-size: 1.5rem; }
    h2 { font-size: 1rem; }
    .eyebrow { margin: 0 0 4px; color: #38bdf8; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em; }
    .lede, .status, .save-bar span, .json-head p { margin: 0; color: #94a3b8; font-size: 0.82rem; line-height: 1.45; }
    .json-head p { margin-top: 4px; max-width: 360px; }
    a { color: #7dd3fc; font-weight: 700; font-size: 0.82rem; }
    .workspace { display: grid; grid-template-columns: minmax(320px, 1.1fr) minmax(280px, 0.9fr); gap: 16px; align-items: start; }
    .editor { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .card, .save-bar, .json-pane {
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
    }
    .card, .json-pane { padding: 16px; }
    .save-bar { align-items: center; padding: 12px; }
    button, .copy {
      background: linear-gradient(135deg, #0284c7, #2563eb);
      border: 0; color: white; font-weight: 700; border-radius: 8px; padding: 9px 14px; cursor: pointer;
    }
    .copy { background: rgba(14, 165, 233, 0.16); border: 1px solid rgba(56, 189, 248, 0.4); color: #e0f2fe; }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .json-pane { display: flex; flex-direction: column; gap: 18px; }
    pre {
      margin: 12px 0 0; padding: 14px; max-height: 34vh; overflow: auto;
      background: #020617; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px;
      color: #7dd3fc; font-family: ui-monospace, monospace; font-size: 0.75rem; line-height: 1.45;
    }
    .selected-json { color: #fde68a; }
    .status.error { color: #fecaca; }
    button:focus-visible, a:focus-visible { outline: 2px solid #22d3ee; outline-offset: 2px; }
    @media (max-width: 980px) { .workspace { grid-template-columns: 1fr; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent implements OnInit {
  private readonly banking = inject(BankingStateService);

  protected readonly document = signal<PropertyDocument | null>(null);
  protected readonly saved = signal<PropertyDocument | null>(null);
  protected readonly values = signal<PropertyValueMap>({});
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly copied = signal<'selected' | 'saved' | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);
  protected readonly savedJson = computed(() => {
    const doc = this.saved();
    if (!doc) return '';
    return JSON.stringify(
      {
        id: doc.id,
        name: doc.name,
        tree: doc.tree,
        values: doc.values,
        updatedAt: doc.updatedAt,
      },
      null,
      2,
    );
  });
  protected readonly selectedJson = computed(() => {
    const doc = this.document();
    if (!doc) return '';
    return JSON.stringify(selectedMenuValues(doc.tree, this.values()), null, 2);
  });

  ngOnInit(): void {
    void this.load();
  }

  protected onValue(change: { id: string; value: PropertyValue }): void {
    this.values.update((current) => ({ ...current, [change.id]: change.value }));
  }

  protected async save(): Promise<void> {
    const doc = this.document();
    if (!doc || this.saving()) return;
    this.saving.set(true);
    this.saveError.set(null);
    const result = await this.banking.savePropertyDocument({
      ...doc,
      values: coerceValues(doc.tree, this.values()),
    });
    this.saving.set(false);
    if (!result.document) {
      this.saveError.set(result.error ?? 'Settings were not saved.');
      return;
    }
    this.document.set(result.document);
    this.saved.set(result.document);
    this.values.set({ ...result.document.values });
    this.banking.showToast('Settings saved.');
  }

  protected async copyJson(which: 'selected' | 'saved'): Promise<void> {
    const text = which === 'selected' ? this.selectedJson() : this.savedJson();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(which);
      setTimeout(() => {
        if (this.copied() === which) this.copied.set(null);
      }, 1600);
    } catch {
      this.saveError.set('The JSON could not be copied.');
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    const list = await this.banking.listPropertyDocuments();
    const first = list?.[0];
    if (!list) {
      this.loading.set(false);
      this.loadError.set('Settings could not be loaded.');
      return;
    }
    if (!first) {
      this.loading.set(false);
      this.loadError.set('No property document is stored yet.');
      return;
    }
    const doc = await this.banking.getPropertyDocument(first.id);
    this.loading.set(false);
    if (!doc) {
      this.loadError.set('Settings could not be loaded.');
      return;
    }
    this.document.set(doc);
    this.saved.set(doc);
    this.values.set({ ...doc.values });
  }
}
