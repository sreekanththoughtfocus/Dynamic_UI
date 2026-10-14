import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { GEN_UI_CONFIG } from './tokens';
import { GenUiConfig } from './types';
import { GenUiRegistryService } from './services/gen-ui-registry.service';
import { GenUiService } from './services/gen-ui.service';

export function provideGenerativeUi(
  config?: Partial<GenUiConfig>,
): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: GEN_UI_CONFIG,
      useValue: {
        apiEndpoint: config?.apiEndpoint ?? 'http://localhost:5000/api/chat',
        assistantName: config?.assistantName ?? 'Apex Banking Intelligence',
        assistantSubtitle: config?.assistantSubtitle ?? 'Autonomous Banking Assistant',
        initialMessage:
          config?.initialMessage ??
          'Hello! I am your AI Banking Concierge powered by Dynamic UI. I can help you inspect account statements, reset credit or debit card PINs, freeze cards, update security settings, and initiate instant transfers. How may I assist you today?',
        suggestedPrompts: config?.suggestedPrompts ?? [
          'Show my recent checking account statement',
          'I want to reset the PIN for my Debit Card',
          'Temporarily freeze my Platinum Credit Card',
          'Help me reset my online banking password',
          'Transfer $250 to emergency savings',
        ],
        defaultProvider: config?.defaultProvider ?? 'Multi-LLM Gateway',
      },
    },
    GenUiRegistryService,
    GenUiService,
  ]);
}
