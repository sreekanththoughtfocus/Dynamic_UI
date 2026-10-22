import { inject, Injectable, signal } from '@angular/core';
import { GEN_UI_CONFIG } from '../tokens';
import {
  GenUiConfig,
  GenUiMessage,
  GenUiToolCall,
  GenUiWidgetDirective,
  StreamEvent,
} from '../types';
import { GenUiRegistryService } from './gen-ui-registry.service';

@Injectable({
  providedIn: 'root',
})
export class GenUiService {
  private readonly config = inject<GenUiConfig>(GEN_UI_CONFIG);
  private readonly registry = inject(GenUiRegistryService);

  // Core signals for reactivity
  public readonly messages = signal<GenUiMessage[]>([]);
  public readonly isStreaming = signal<boolean>(false);
  public readonly isDrawerOpen = signal<boolean>(false);
  public readonly activeToolStatus = signal<string | null>(null);
  public readonly currentProvider = signal<{
    name: string;
    model: string;
    isLocal: boolean;
    isSimulated?: boolean;
  }>({
    name: 'Auto / Configured',
    model: 'Multi-LLM Gateway',
    isLocal: false,
    isSimulated: false,
  });

  private abortController: AbortController | null = null;

  constructor() {
    // Add initial greeting message
    if (this.config.initialMessage) {
      this.messages.set([
        {
          id: 'welcome-0',
          role: 'assistant',
          content: this.config.initialMessage,
          timestamp: new Date(),
        },
      ]);
    }
  }

  public toggleDrawer(): void {
    this.isDrawerOpen.update((open) => !open);
  }

  public openDrawer(): void {
    this.isDrawerOpen.set(true);
  }

  public closeDrawer(): void {
    this.isDrawerOpen.set(false);
  }

  public clearHistory(): void {
    this.messages.set([
      {
        id: 'welcome-' + Date.now(),
        role: 'assistant',
        content: this.config.initialMessage ?? 'History cleared. How can I assist you?',
        timestamp: new Date(),
      },
    ]);
  }

  public async sendMessage(promptText: string): Promise<void> {
    const trimmed = promptText.trim();
    if (!trimmed || this.isStreaming()) {
      return;
    }

    const userMsgId = 'user-' + Date.now();
    const assistantMsgId = 'asst-' + Date.now();

    // 1. Append User Message
    this.messages.update((msgs) => [
      ...msgs,
      {
        id: userMsgId,
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
      },
      {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
        toolCalls: [],
        uiWidgets: [],
      },
    ]);

    this.isStreaming.set(true);
    this.activeToolStatus.set(null);
    this.abortController = new AbortController();

    try {
      const payload = {
        message: trimmed,
        history: this.messages()
          .slice(0, -1)
          .map((m) => ({
            role: m.role,
            content: m.content,
          })),
        availableTools: this.registry.getToolsSchema(),
        availableWidgets: this.registry.getWidgetsSchema(),
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream, application/x-ndjson, text/plain',
      };
      const accessToken = this.config.getAccessToken?.();
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const response = await fetch(this.config.apiEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`API error ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Readable stream not supported or empty response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          // Process SSE or plain NDJSON line
          let rawJson = trimmedLine;
          if (trimmedLine.startsWith('data:')) {
            rawJson = trimmedLine.replace(/^data:\s*/, '').trim();
          }

          if (rawJson === '[DONE]') {
            continue;
          }

          try {
            const event: StreamEvent = JSON.parse(rawJson);
            await this.handleStreamEvent(assistantMsgId, event);
          } catch {
            // If line is plain text chunk rather than JSON event
            this.appendDelta(assistantMsgId, rawJson);
          }
        }
      }

      // Finish streaming for this assistant message
      this.finalizeAssistantMessage(assistantMsgId);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('Stream cancelled by user.');
      } else {
        const errorText =
          err instanceof Error
            ? err.message
            : 'Error connecting to the AI Banking service';
        console.error('Chat error:', err);
        this.messages.update((msgs) =>
          msgs.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  isStreaming: false,
                  content:
                    m.content ||
                    `⚠️ Connection Notice: Could not connect to LLM backend at ${this.config.apiEndpoint}. Please verify that the .NET API is running.`,
                  error: errorText,
                }
              : m,
          ),
        );
      }
    } finally {
      this.isStreaming.set(false);
      this.activeToolStatus.set(null);
      this.abortController = null;
    }
  }

  public cancelStream(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
      this.isStreaming.set(false);
      this.activeToolStatus.set(null);
    }
  }

  private async handleStreamEvent(
    msgId: string,
    event: StreamEvent,
  ): Promise<void> {
    switch (event.type) {
      case 'delta':
        if (event.content) {
          this.appendDelta(msgId, event.content);
        }
        break;

      case 'provider_info':
        if (event.providerInfo) {
          this.currentProvider.set(event.providerInfo);
        }
        break;

      case 'tool_call':
        if (event.toolCall) {
          const toolCallInfo: GenUiToolCall = {
            id: event.toolCall.id,
            name: event.toolCall.name,
            args: event.toolCall.args,
            status: 'running',
          };

          this.activeToolStatus.set(
            `Executing Client Tool: ${event.toolCall.name}...`,
          );

          this.messages.update((msgs) =>
            msgs.map((m) =>
              m.id === msgId
                ? {
                    ...m,
                    toolCalls: [...(m.toolCalls ?? []), toolCallInfo],
                  }
                : m,
            ),
          );

          // Execute tool on the Angular client!
          const result = await this.registry.executeTool(
            event.toolCall.name,
            event.toolCall.args,
          );

          // Update tool call status
          this.messages.update((msgs) =>
            msgs.map((m) =>
              m.id === msgId
                ? {
                    ...m,
                    toolCalls: (m.toolCalls ?? []).map((tc) =>
                      tc.id === event.toolCall?.id
                        ? {
                            ...tc,
                            status: result.success ? 'completed' : 'failed',
                            result: result.result,
                            error: result.error,
                          }
                        : tc,
                    ),
                  }
                : m,
            ),
          );

          this.activeToolStatus.set(null);
        }
        break;

      case 'widget':
        if (event.widget) {
          const widgetDirective: GenUiWidgetDirective = {
            id: event.widget.id ?? 'widget-' + Date.now(),
            name: event.widget.name,
            props: event.widget.props,
            title: event.widget.title,
          };

          this.messages.update((msgs) =>
            msgs.map((m) =>
              m.id === msgId
                ? {
                    ...m,
                    uiWidgets: [...(m.uiWidgets ?? []), widgetDirective],
                  }
                : m,
            ),
          );
        }
        break;

      case 'done':
        this.finalizeAssistantMessage(msgId);
        break;

      case 'error':
        this.messages.update((msgs) =>
          msgs.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  error: event.error ?? 'Unknown error occurred',
                }
              : m,
          ),
        );
        break;
    }
  }

  private appendDelta(msgId: string, text: string): void {
    this.messages.update((msgs) =>
      msgs.map((m) =>
        m.id === msgId
          ? {
              ...m,
              content: m.content + text,
            }
          : m,
      ),
    );
  }

  private finalizeAssistantMessage(msgId: string): void {
    this.messages.update((msgs) =>
      msgs.map((m) =>
        m.id === msgId
          ? {
              ...m,
              isStreaming: false,
            }
          : m,
      ),
    );
  }
}
