import { InjectionToken } from '@angular/core';
import { GenUiConfig } from './types';

export const GEN_UI_CONFIG = new InjectionToken<GenUiConfig>('GEN_UI_CONFIG', {
  providedIn: 'root',
  factory: () => ({
    apiEndpoint: 'http://localhost:5000/api/chat',
    assistantName: 'Apex Banking Intelligence',
    assistantSubtitle: 'Multi-LLM Generative Agent',
    initialMessage:
      'Hello! I am your AI Banking Concierge powered by Dynamic UI. I can help you inspect account statements, reset credit or debit card PINs, freeze cards, update security settings, and initiate instant transfers. How may I assist you today?',
    suggestedPrompts: [
      'Show my recent checking account statement',
      'I want to reset the PIN for my Debit Card',
      'Freeze my debit card',
      'Help me reset my online banking password',
      'Transfer $250 to emergency savings',
    ],
  }),
});
