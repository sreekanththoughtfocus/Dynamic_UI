import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { GEN_UI_PAGE_CONTEXT, provideGenerativeUi } from 'generative-ui';
import { ConciergeContextService } from './core/services/concierge-context.service';
import { SESSION_TOKEN_KEY } from './core/auth/auth.service';
import { routes } from './app.routes';
import { BankingGenUiInitService } from './generative-ui-setup/banking-gen-ui-init.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
    provideRouter(routes, withComponentInputBinding()),
    provideGenerativeUi({
      apiEndpoint: 'http://localhost:5050/api/chat',
      assistantName: 'Apex Banking Concierge',
      assistantSubtitle: 'Multi-LLM Dynamic UI Engine',
      initialMessage:
        'I read your live Apex accounts. Ask about subscriptions, unusual charges, cash flow, a budget, a transfer, a card, or a travel notice and I will open the matching tool with posted numbers.',
      getAccessToken: () => sessionStorage.getItem(SESSION_TOKEN_KEY),
      suggestedPrompts: [
        'What can you do?',
        'How am I doing?',
        'Find my recurring subscriptions',
        'Anything unusual on my checking account?',
        'Why is Starbucks higher than usual?',
        'Forecast my cash flow for this month',
        'Show my monthly budget',
        'Show my spending as a pie chart',
        'Show my expenses breakdown as a doughnut chart',
        'Show my recent checking account statement',
        'Show my savings account statement',
        'Coffee charges over $15',
        'Transfer $250 to emergency savings',
        'Send Mom $200',
        'Help me save $5,000 in 6 months',
        'Where should my spare checking cash go?',
        'Convert 1,000 USD to EUR',
        'Calculate loan payments for $35,000',
        'What if I pay an extra $200 on a $35,000 loan?',
        'Reset the PIN for my debit card',
        'Freeze my credit card',
        'Reset my online banking password',
        'Dispute the Amazon Web Services charge',
        'Set a travel notice for Japan next week',
        'What did the concierge change?',
      ],
    }),
    {
      provide: GEN_UI_PAGE_CONTEXT,
      useFactory: () => {
        const context = inject(ConciergeContextService);
        return () => context.snapshot();
      },
    },
    provideAppInitializer(() => {
      inject(BankingGenUiInitService).init();
    }),
  ],
};
