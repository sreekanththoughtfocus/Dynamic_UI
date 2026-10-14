import { Injectable } from '@angular/core';
import { GenUiComponentDefinition, GenUiToolDefinition } from '../types';

@Injectable({
  providedIn: 'root',
})
export class GenUiRegistryService {
  private readonly tools = new Map<string, GenUiToolDefinition<any, any>>();
  private readonly widgets = new Map<string, GenUiComponentDefinition>();

  public registerTool<TInput = Record<string, unknown>, TOutput = unknown>(
    tool: GenUiToolDefinition<TInput, TOutput>,
  ): this {
    this.tools.set(tool.name, tool);
    return this;
  }

  public registerTools(tools: GenUiToolDefinition<any, any>[]): this {
    tools.forEach((t) => this.registerTool(t));
    return this;
  }

  public getTool(name: string): GenUiToolDefinition<any, any> | undefined {
    return this.tools.get(name);
  }

  public getAllTools(): GenUiToolDefinition<any, any>[] {
    return Array.from(this.tools.values());
  }

  public registerWidget(widget: GenUiComponentDefinition): this {
    this.widgets.set(widget.name, widget);
    return this;
  }

  public registerWidgets(widgets: GenUiComponentDefinition[]): this {
    widgets.forEach((w) => this.registerWidget(w));
    return this;
  }

  public getWidget(name: string): GenUiComponentDefinition | undefined {
    return this.widgets.get(name);
  }

  public getAllWidgets(): GenUiComponentDefinition[] {
    return Array.from(this.widgets.values());
  }

  public async executeTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ success: boolean; result?: unknown; error?: string }> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        error: `Tool "${name}" is not registered on client.`,
      };
    }

    try {
      const result = await tool.handler(args);
      return { success: true, result };
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown tool execution error';
      return { success: false, error: errorMessage };
    }
  }

  public getToolsSchema(): Array<{
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
  }> {
    return this.getAllTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  public getWidgetsSchema(): Array<{
    name: string;
    description: string;
  }> {
    return this.getAllWidgets().map((widget) => ({
      name: widget.name,
      description: widget.description,
    }));
  }
}
