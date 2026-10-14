import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { GenUiRegistryService } from 'generative-ui';
import { BankingStateService } from '../core/services/banking.service';
import { StatementWidgetComponent } from './widgets/statement-widget/statement-widget.component';
import { CardPinResetWidgetComponent } from './widgets/card-pin-reset-widget/card-pin-reset-widget.component';
import { CardControlsWidgetComponent } from './widgets/card-controls-widget/card-controls-widget.component';
import { PasswordResetWidgetComponent } from './widgets/password-reset-widget/password-reset-widget.component';
import { TransferConfirmWidgetComponent } from './widgets/transfer-confirm-widget/transfer-confirm-widget.component';
import { FinancialChartWidgetComponent } from './widgets/financial-chart-widget/financial-chart-widget.component';
import { BudgetAnalyticsWidgetComponent } from './widgets/budget-analytics-widget/budget-analytics-widget.component';
import { LoanCalculatorWidgetComponent } from './widgets/loan-calculator-widget/loan-calculator-widget.component';
import { CurrencyExchangeWidgetComponent } from './widgets/currency-exchange-widget/currency-exchange-widget.component';

@Injectable({
  providedIn: 'root',
})
export class BankingGenUiInitService {
  private readonly registry = inject(GenUiRegistryService);
  private readonly banking = inject(BankingStateService);
  private readonly router = inject(Router);

  public init(): void {
    // 1. Register Banking Generative UI Dynamic Components
    this.registry.registerWidgets([
      {
        name: 'chartWidget',
        description: 'Interactive financial chart supporting Pie, Doughnut, Bar, and Line charts with on-the-fly switcher and category expense breakdown.',
        component: FinancialChartWidgetComponent,
      },
      {
        name: 'budgetAnalyticsWidget',
        description: 'Monthly category budget tracker comparing actual spending against target limits with real-time status indicators.',
        component: BudgetAnalyticsWidgetComponent,
      },
      {
        name: 'loanCalculatorWidget',
        description: 'Interactive loan & mortgage financing calculator with real-time principal slider, interest rate, term options, and monthly EMI calculation.',
        component: LoanCalculatorWidgetComponent,
      },
      {
        name: 'currencyExchangeWidget',
        description: 'Real-time foreign exchange converter with live interbank rates, currency swap, and zero-fee transfer dispatch.',
        component: CurrencyExchangeWidgetComponent,
      },
      {
        name: 'statementWidget',
        description: 'Displays interactive account statements and transactions explorer with search & PDF export.',
        component: StatementWidgetComponent,
      },
      {
        name: 'cardPinResetWidget',
        description: 'Secure in-chat PIN reset widget for Credit Cards and Debit Cards with OTP authorization.',
        component: CardPinResetWidgetComponent,
      },
      {
        name: 'cardControlsWidget',
        description: 'In-chat card management interface to toggle card freeze and adjust spending limits.',
        component: CardControlsWidgetComponent,
      },
      {
        name: 'passwordResetWidget',
        description: 'In-chat secure online banking password reset with live strength evaluation.',
        component: PasswordResetWidgetComponent,
      },
      {
        name: 'transferConfirmWidget',
        description: 'In-chat instant fund transfer confirmation card with source, recipient, amount, and authorization button.',
        component: TransferConfirmWidgetComponent,
      },
    ]);

    // 2. Register Client-side Tools that the LLM can execute
    this.registry.registerTools([
      {
        name: 'generateFinancialChart',
        description: 'Generates an interactive financial chart (pie, doughnut, bar, line) for spending categories or account balances.',
        parameters: {
          chartType: 'Requested chart visualization: pie, doughnut, bar, line',
          metric: 'Metric to visualize (e.g. spending_by_category, account_balances)',
        },
        handler: async (input: { chartType?: string; metric?: string }) => {
          return {
            status: 'success',
            chartType: input.chartType ?? 'pie',
            metric: input.metric ?? 'spending_by_category',
          };
        },
      },
      {
        name: 'fetchBudgetGoals',
        description: 'Fetches monthly budget allowances and compares against actual category expenditures.',
        parameters: {
          period: 'Target month or cycle (e.g. current_cycle)',
        },
        handler: async (input: { period?: string }) => {
          return {
            period: input.period ?? 'current_cycle',
            status: 'success',
          };
        },
      },
      {
        name: 'calculateLoanEstimate',
        description: 'Calculates monthly payment and total interest for personal, auto, or mortgage loans.',
        parameters: {
          principal: 'Loan amount in USD',
          interestRate: 'Annual percentage rate (APR)',
          termMonths: 'Duration in months (e.g. 36, 48, 60)',
        },
        handler: async (input: { principal?: number; interestRate?: number; termMonths?: number }) => {
          const P = input.principal ?? 35000;
          const r = ((input.interestRate ?? 6.45) / 100) / 12;
          const n = input.termMonths ?? 48;
          const monthly = (P * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1);
          return {
            principal: P,
            monthlyPayment: Math.round(monthly * 100) / 100,
            termMonths: n,
            status: 'success',
          };
        },
      },
      {
        name: 'getLiveExchangeRate',
        description: 'Retrieves live interbank currency exchange rates for international wire conversions.',
        parameters: {
          from: 'Base currency code (e.g. USD)',
          to: 'Target currency code (e.g. EUR, GBP, JPY)',
          amount: 'Amount to convert',
        },
        handler: async (input: { from?: string; to?: string; amount?: number }) => {
          return {
            from: input.from ?? 'USD',
            to: input.to ?? 'EUR',
            amount: input.amount ?? 1000,
            status: 'success',
          };
        },
      },
      {
        name: 'fetchStatements',
        description: 'Fetches recent statements and transaction records for a given bank account.',
        parameters: {
          accountId: 'ID of the account (e.g. acc-chk-01)',
          limit: 'Max transactions to return',
        },
        handler: async (input: { accountId?: string; limit?: number }) => {
          const accId = input.accountId ?? 'acc-chk-01';
          this.banking.selectedAccountId.set(accId);
          const txs = this.banking.transactions().filter((t) => t.accountId === accId);
          return {
            account: this.banking.accounts().find((a) => a.id === accId),
            transactions: txs.slice(0, input.limit ?? 10),
          };
        },
      },
      {
        name: 'toggleCardFreeze',
        description: 'Freezes or unfreezes a card immediately in core banking.',
        parameters: {
          cardId: 'ID of the card to lock/unlock',
          freeze: 'Boolean: true to freeze/lock, false to unfreeze',
        },
        handler: async (input: { cardId?: string; freeze?: boolean }) => {
          const cardId = input.cardId ?? 'card-crd-01';
          const freeze = input.freeze ?? true;
          await this.banking.setCardFreeze(cardId, freeze);
          return { cardId, isFrozen: freeze, status: 'success' };
        },
      },
      {
        name: 'navigateToPage',
        description: 'Navigates the user to a specific section of the banking portal (dashboard, statements, cards, security, transfers).',
        parameters: {
          route: 'Target route path (/dashboard, /statements, /cards, /security, /transfers)',
        },
        handler: async (input: { route: string }) => {
          await this.router.navigate([input.route]);
          return { routedTo: input.route, status: 'success' };
        },
      },
    ]);
  }
}
