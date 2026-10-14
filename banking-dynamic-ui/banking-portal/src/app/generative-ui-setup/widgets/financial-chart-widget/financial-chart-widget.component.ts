import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
  afterRenderEffect,
  OnDestroy,
} from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Chart, ChartConfiguration, registerables } from 'chart.js/auto';
import { BankingStateService } from '../../../core/services/banking.service';

Chart.register(...registerables);

// Curated high-contrast fintech palette (adapted & enhanced from flights42)
export const BANKING_CHART_COLORS = [
  '#38bdf8', // Neon Sky Blue
  '#818cf8', // Indigo / Purple
  '#34d399', // Emerald Neon
  '#f43f5e', // Rose / Wine
  '#fbbf24', // Amber Gold
  '#a855f7', // Vivid Violet
  '#2dd4bf', // Teal Cyan
  '#fb923c', // Coral Orange
  '#e879f9', // Fuchsia
  '#94a3b8', // Slate Gray
];

export interface BreakdownItem {
  name: string;
  value: number;
  color: string;
  percentage: number;
}

@Component({
  selector: 'bank-financial-chart-widget',
  imports: [CurrencyPipe, DecimalPipe],
  template: `
    <div class="chart-widget-card">
      <!-- Header -->
      <div class="card-header">
        <div class="header-left">
          <span class="badge-icon">📊</span>
          <div>
            <h4 class="chart-title">{{ title() }}</h4>
            <span class="chart-sub">{{ subtitle() }}</span>
          </div>
        </div>
        <div class="header-right">
          <span class="total-label">Total Volume</span>
          <span class="total-val">{{ computedTotal() | currency: currency() }}</span>
        </div>
      </div>

      <!-- Quick Chart Type Switcher (🥧 Pie | 🍩 Doughnut | 📊 Bar | 📈 Line) -->
      <div class="type-switcher-bar">
        <span class="switcher-label">Display Mode:</span>
        <div class="type-pills">
          <button
            type="button"
            class="type-pill"
            [class.active]="activeType() === 'pie'"
            (click)="setType('pie')"
            title="Pie Chart"
          >
            🥧 Pie
          </button>
          <button
            type="button"
            class="type-pill"
            [class.active]="activeType() === 'doughnut'"
            (click)="setType('doughnut')"
            title="Doughnut Chart"
          >
            🍩 Doughnut
          </button>
          <button
            type="button"
            class="type-pill"
            [class.active]="activeType() === 'bar'"
            (click)="setType('bar')"
            title="Bar Chart"
          >
            📊 Bar
          </button>
          <button
            type="button"
            class="type-pill"
            [class.active]="activeType() === 'line'"
            (click)="setType('line')"
            title="Line Trend"
          >
            📈 Line
          </button>
        </div>
      </div>

      <!-- Chart Canvas Wrapper -->
      <div class="chart-canvas-container" [class.is-circular]="activeType() === 'pie' || activeType() === 'doughnut'">
        <canvas #chartCanvas></canvas>
      </div>

      <!-- Category Breakdown List -->
      <div class="breakdown-section">
        <div class="breakdown-header">
          <span class="section-title">Category Distribution</span>
          <span class="item-count">{{ breakdownItems().length }} categories</span>
        </div>

        <div class="breakdown-list">
          @for (item of breakdownItems(); track item.name) {
            <div class="breakdown-row">
              <div class="row-left">
                <span class="color-dot" [style.background-color]="item.color"></span>
                <span class="category-name">{{ item.name }}</span>
              </div>
              <div class="row-center">
                <div class="progress-track">
                  <div
                    class="progress-fill"
                    [style.width.%]="item.percentage"
                    [style.background-color]="item.color"
                  ></div>
                </div>
                <span class="pct-text">{{ item.percentage | number: '1.1-1' }}%</span>
              </div>
              <div class="row-right">
                <span class="amount-val">{{ item.value | currency: currency() }}</span>
              </div>
            </div>
          }
        </div>
      </div>

      <!-- Insights Footer -->
      @if (insights() && insights().length > 0) {
        <div class="insights-box">
          <span class="insight-icon">💡</span>
          <div class="insight-content">
            @for (insight of insights(); track insight) {
              <p class="insight-text">{{ insight }}</p>
            }
          </div>
        </div>
      }

      <!-- Quick Actions Footer -->
      <div class="card-footer">
        <button type="button" class="action-btn" (click)="onExportChart()">
          💾 Export Visual
        </button>
        <button type="button" class="action-btn primary" (click)="onSetBudget()">
          🎯 Adjust Spending Budgets
        </button>
      </div>
    </div>
  `,
  styles: `
    .chart-widget-card {
      padding: 16px;
      color: #f8fafc;
      font-family: inherit;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .badge-icon {
      font-size: 1.4rem;
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid rgba(56, 189, 248, 0.3);
      padding: 6px;
      border-radius: 10px;
    }
    .chart-title {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 700;
      color: #38bdf8;
      letter-spacing: -0.01em;
    }
    .chart-sub {
      font-size: 0.72rem;
      color: #94a3b8;
    }
    .header-right {
      text-align: right;
    }
    .total-label {
      display: block;
      font-size: 0.65rem;
      text-transform: uppercase;
      color: #94a3b8;
      letter-spacing: 0.05em;
    }
    .total-val {
      font-size: 1.15rem;
      font-weight: 800;
      color: #34d399;
    }

    /* Type Switcher Bar */
    .type-switcher-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin: 12px 0 10px;
      padding: 6px 10px;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 10px;
    }
    .switcher-label {
      font-size: 0.7rem;
      color: #94a3b8;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .type-pills {
      display: flex;
      gap: 4px;
    }
    .type-pill {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 6px;
      padding: 3px 8px;
      color: #cbd5e1;
      font-size: 0.72rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .type-pill:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #ffffff;
    }
    .type-pill.active {
      background: linear-gradient(135deg, #0284c7, #2563eb);
      border-color: #38bdf8;
      color: #ffffff;
      box-shadow: 0 0 10px rgba(14, 165, 233, 0.4);
    }

    /* Canvas Container */
    .chart-canvas-container {
      position: relative;
      height: 220px;
      width: 100%;
      margin: 10px 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .chart-canvas-container.is-circular {
      height: 210px;
    }
    canvas {
      width: 100% !important;
      max-height: 100% !important;
    }

    /* Breakdown Section */
    .breakdown-section {
      margin-top: 14px;
      padding-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }
    .breakdown-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .section-title {
      font-size: 0.75rem;
      font-weight: 700;
      color: #e2e8f0;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .item-count {
      font-size: 0.68rem;
      color: #64748b;
    }
    .breakdown-list {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }
    .breakdown-row {
      display: grid;
      grid-template-columns: 120px 1fr 85px;
      align-items: center;
      gap: 8px;
      padding: 5px 8px;
      background: rgba(15, 23, 42, 0.45);
      border-radius: 6px;
      font-size: 0.74rem;
    }
    .row-left {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .color-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .category-name {
      color: #f1f5f9;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .row-center {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .progress-track {
      flex: 1;
      height: 5px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 3px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.3s ease;
    }
    .pct-text {
      font-size: 0.68rem;
      color: #94a3b8;
      width: 36px;
      text-align: right;
    }
    .row-right {
      text-align: right;
    }
    .amount-val {
      font-weight: 700;
      color: #f8fafc;
    }

    /* Insights Box */
    .insights-box {
      margin-top: 12px;
      padding: 10px 12px;
      background: rgba(56, 189, 248, 0.08);
      border: 1px solid rgba(56, 189, 248, 0.2);
      border-radius: 8px;
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .insight-icon {
      font-size: 1rem;
    }
    .insight-content {
      flex: 1;
    }
    .insight-text {
      margin: 0;
      font-size: 0.74rem;
      color: #e0f2fe;
      line-height: 1.4;
    }
    .insight-text + .insight-text {
      margin-top: 4px;
    }

    /* Footer Buttons */
    .card-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 14px;
      padding-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }
    .action-btn {
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 0.74rem;
      font-weight: 600;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.06);
      color: #cbd5e1;
      cursor: pointer;
      transition: all 0.2s;
    }
    .action-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #ffffff;
    }
    .action-btn.primary {
      background: rgba(14, 165, 233, 0.2);
      border-color: rgba(14, 165, 233, 0.4);
      color: #38bdf8;
    }
    .action-btn.primary:hover {
      background: rgba(14, 165, 233, 0.3);
      color: #e0f2fe;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinancialChartWidgetComponent implements OnDestroy {
  private readonly banking = inject(BankingStateService);
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('chartCanvas');

  // Signal Inputs from generative UI directive
  public readonly title = input<string>('Spending Analytics Breakdown');
  public readonly subtitle = input<string>('Real-time ledger breakdown by category');
  public readonly chartType = input<string>('pie');
  public readonly labels = input<string[]>([
    'Tech & Cloud',
    'Travel',
    'Groceries',
    'Health & Wellness',
    'Dining & Coffee',
    'Utilities',
  ]);
  public readonly data = input<number[]>([2841.5, 1240.0, 485.2, 280.0, 245.8, 195.0]);
  public readonly colors = input<string[]>(BANKING_CHART_COLORS);
  public readonly currency = input<string>('USD');
  public readonly totalAmount = input<number | null>(null);
  public readonly insights = input<string[]>([
    'Tech & Cloud represents 53.8% of current cycle outflows.',
    'Spending is tracking within the monthly budgeted envelope.',
  ]);

  // Active chart display type (defaults to input, but user can click to switch live!)
  protected readonly activeType = signal<'pie' | 'doughnut' | 'bar' | 'line'>('pie');

  private chartInstance: Chart | null = null;

  constructor() {
    // Synchronize initial input chartType
    afterRenderEffect(() => {
      const typeProp = this.chartType().toLowerCase().trim();
      if (['pie', 'doughnut', 'bar', 'line'].includes(typeProp)) {
        if (this.activeType() !== typeProp) {
          this.activeType.set(typeProp as 'pie' | 'doughnut' | 'bar' | 'line');
        }
      }

      // Render or update chart on canvas
      const canvasEl = this.canvasRef()?.nativeElement;
      if (canvasEl) {
        this.renderOrUpdateChart(canvasEl);
      }
    });
  }

  protected readonly cleanData = computed<number[]>(() => {
    const raw = this.data() ?? [];
    return raw.map((v) => Math.abs(Number(v) || 0));
  });

  protected readonly computedTotal = computed(() => {
    const override = this.totalAmount();
    if (override !== null && override !== undefined) {
      return Math.abs(override);
    }
    const series = this.cleanData();
    return series.reduce((acc, curr) => acc + curr, 0);
  });

  protected readonly breakdownItems = computed<BreakdownItem[]>(() => {
    const lbls = this.labels() ?? [];
    const values = this.cleanData();
    const palette = this.colors() ?? BANKING_CHART_COLORS;
    const total = this.computedTotal() || 1;

    return lbls.map((name, idx) => {
      const val = values[idx] ?? 0;
      const pct = (val / total) * 100;
      const color = palette[idx % palette.length];
      return {
        name,
        value: val,
        color,
        percentage: pct,
      };
    });
  });

  protected setType(type: 'pie' | 'doughnut' | 'bar' | 'line'): void {
    this.activeType.set(type);
    const canvasEl = this.canvasRef()?.nativeElement;
    if (canvasEl) {
      this.renderOrUpdateChart(canvasEl);
    }
  }

  private renderOrUpdateChart(canvas: HTMLCanvasElement): void {
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }

    const currentType = this.activeType();
    const lbls = this.labels() ?? [];
    const vals = this.cleanData();
    const palette = this.colors() ?? BANKING_CHART_COLORS;
    const currSymbol = this.currency() === 'USD' ? '$' : this.currency() + ' ';

    const config: ChartConfiguration = {
      type: currentType,
      data: {
        labels: lbls,
        datasets: [
          {
            label: this.title(),
            data: vals,
            backgroundColor: currentType === 'line'
              ? 'rgba(56, 189, 248, 0.2)'
              : palette.slice(0, lbls.length),
            borderColor: currentType === 'line' ? '#38bdf8' : 'rgba(15, 23, 42, 0.8)',
            borderWidth: currentType === 'line' ? 3 : 2,
            hoverOffset: currentType === 'pie' || currentType === 'doughnut' ? 8 : 4,
            fill: currentType === 'line',
            tension: 0.4,
            pointBackgroundColor: '#38bdf8',
            pointBorderColor: '#ffffff',
            pointRadius: currentType === 'line' ? 5 : 0,
            pointHoverRadius: currentType === 'line' ? 7 : 0,
            borderRadius: currentType === 'bar' ? 6 : 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: currentType === 'pie' || currentType === 'doughnut',
            position: 'right',
            labels: {
              boxWidth: 12,
              padding: 10,
              color: '#cbd5e1',
              font: {
                size: 11,
                family: 'inherit',
              },
            },
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleColor: '#38bdf8',
            bodyColor: '#f8fafc',
            borderColor: 'rgba(56, 189, 248, 0.3)',
            borderWidth: 1,
            padding: 10,
            boxPadding: 4,
            callbacks: {
              label: (ctx) => {
                const val = ctx.parsed?.y !== undefined ? ctx.parsed.y : (ctx.parsed as number);
                const formatted = (val ?? 0).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                });
                return ` ${ctx.label}: ${currSymbol}${formatted}`;
              },
            },
          },
        },
        scales:
          currentType === 'bar' || currentType === 'line'
            ? {
                x: {
                  grid: {
                    color: 'rgba(255, 255, 255, 0.05)',
                  },
                  ticks: {
                    color: '#94a3b8',
                    font: { size: 10 },
                  },
                },
                y: {
                  grid: {
                    color: 'rgba(255, 255, 255, 0.05)',
                  },
                  ticks: {
                    color: '#94a3b8',
                    font: { size: 10 },
                    callback: (value) => `${currSymbol}${Number(value).toLocaleString()}`,
                  },
                },
              }
            : undefined,
      },
    };

    this.chartInstance = new Chart(canvas, config);
  }

  protected onExportChart(): void {
    this.banking.showToast(`📊 Visual report exported as high-resolution image!`);
  }

  protected onSetBudget(): void {
    this.banking.showToast(`🎯 Budget goals updated for current cycle!`);
  }

  public ngOnDestroy(): void {
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }
  }
}
