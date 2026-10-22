import { Type } from '@angular/core';

export interface GenUiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: GenUiToolCall[];
  uiWidgets?: GenUiWidgetDirective[];
  timestamp: Date;
  isStreaming?: boolean;
  error?: string;
}

export interface GenUiToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
}

export interface GenUiWidgetDirective {
  id: string;
  name: string;
  props: Record<string, unknown>;
  title?: string;
}

export interface GenUiToolDefinition<TInput = Record<string, unknown>, TOutput = unknown> {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  handler: (input: TInput) => Promise<TOutput> | TOutput;
}

export interface GenUiComponentDefinition {
  name: string;
  description: string;
  // Angular component type to render dynamically
  component: Type<unknown>;
  schema?: Record<string, unknown>;
}

export interface GenUiConfig {
  apiEndpoint: string;
  assistantName?: string;
  assistantSubtitle?: string;
  initialMessage?: string;
  suggestedPrompts?: string[];
  defaultProvider?: string;
  getAccessToken?: () => string | null;
}

export interface StreamEvent {
  type: 'delta' | 'tool_call' | 'tool_result' | 'widget' | 'provider_info' | 'done' | 'error';
  content?: string;
  toolCall?: {
    id: string;
    name: string;
    args: Record<string, unknown>;
  };
  widget?: {
    id?: string;
    name: string;
    props: Record<string, unknown>;
    title?: string;
  };
  providerInfo?: {
    name: string;
    model: string;
    isLocal: boolean;
    isSimulated?: boolean;
  };
  error?: string;
}
