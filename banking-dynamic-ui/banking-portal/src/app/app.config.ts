import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideGenerativeUi } from 'generative-ui';
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
        'Welcome to Apex Premier Banking! I am your AI Banking Concierge powered by Dynamic UI. I can render interactive financial charts (Pie, Doughnut, Bar, Line), budget trackers, loan calculators, currency converters, account statements, and card PIN/security controls. How can I assist you today?',
      suggestedPrompts: [
        'I want the chart as a pi chart',
        'Show my expenses breakdown as a doughnut chart',
        'Show monthly budget tracking limits',
        'Calculate loan payments for $35,000',
        'Convert 1,000 USD to EUR currency',
        'Show my recent checking account statement',
        'I want to reset the PIN for my Debit Card',
        'Temporarily freeze my Platinum Credit Card',
      ],
    }),
    provideAppInitializer(() => {
      inject(BankingGenUiInitService).init();
    }),
  ],
};
