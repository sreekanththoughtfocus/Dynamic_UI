import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
  afterNextRender,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GenUiService } from '../services/gen-ui.service';
import { GEN_UI_CONFIG } from '../tokens';
import { GenUiConfig } from '../types';
import { GenUiWidgetOutletComponent } from './gen-ui-widget-outlet.component';

@Component({
  selector: 'gen-ui-chat-drawer',
  imports: [FormsModule, DatePipe, GenUiWidgetOutletComponent],
  template: `
    <!-- Floating Launcher Button -->
    @if (!genUi.isDrawerOpen()) {
      <button
        class="gen-ui-launcher-btn"
        (click)="genUi.openDrawer()"
        aria-label="Open AI Banking Assistant"
      >
        <span class="launcher-glow"></span>
        <svg class="launcher-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM4.93 10.93a2 2 0 0 1 2.83 0l1.41 1.41a2 2 0 0 1-2.83 2.83l-1.41-1.41a2 2 0 0 1 0-2.83zM19.07 10.93a2 2 0 0 1 0 2.83l-1.41 1.41a2 2 0 0 1-2.83-2.83l1.41-1.41a2 2 0 0 1 2.83 0zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z" />
          <path d="M12 14v4M10 22h4" />
        </svg>
        <span class="launcher-badge">AI Assistant</span>
      </button>
    }

    <!-- Movable & Resizable Floating Assistant Window -->
    @if (genUi.isDrawerOpen()) {
      <aside
        #drawerElement
        class="gen-ui-drawer-container"
        [class.is-maximized]="isMaximized()"
        [class.is-dragging]="isDragging()"
        [class.is-resizing]="isResizing()"
        [style.width.px]="isMaximized() ? null : width()"
        [style.height.px]="isMaximized() ? null : height()"
        [style.left.px]="isMaximized() ? null : posX()"
        [style.top.px]="isMaximized() ? null : posY()"
        [style.right.px]="isMaximized() || posX() !== null ? null : defaultRightOffset"
        [style.bottom.px]="isMaximized() || posY() !== null ? null : defaultBottomOffset"
        aria-label="AI Banking Assistant Window"
      >
        <!-- Resize Handles -->
        @if (!isMaximized()) {
          <div class="resize-handle handle-left" (mousedown)="onResizeStart($event, 'left')"></div>
          <div class="resize-handle handle-top" (mousedown)="onResizeStart($event, 'top')"></div>
          <div class="resize-handle handle-right" (mousedown)="onResizeStart($event, 'right')"></div>
          <div class="resize-handle handle-bottom" (mousedown)="onResizeStart($event, 'bottom')"></div>
          <div class="resize-handle handle-top-left" (mousedown)="onResizeStart($event, 'top-left')"></div>
          <div class="resize-handle handle-bottom-right" (mousedown)="onResizeStart($event, 'bottom-right')"></div>
          <div class="resize-handle handle-bottom-left" (mousedown)="onResizeStart($event, 'bottom-left')"></div>
          <div class="resize-handle handle-top-right" (mousedown)="onResizeStart($event, 'top-right')"></div>
        }

        <!-- Header / Draggable Title Bar -->
        <header
          class="gen-ui-header"
          (mousedown)="onHeaderMouseDown($event)"
          (touchstart)="onHeaderTouchStart($event)"
          title="Click and drag to move window"
        >
          <div class="header-main">
            <!-- Drag Handle Icon -->
            <div class="drag-grip" title="Drag to move anywhere">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="9" cy="6" r="1.5" fill="currentColor" />
                <circle cx="15" cy="6" r="1.5" fill="currentColor" />
                <circle cx="9" cy="12" r="1.5" fill="currentColor" />
                <circle cx="15" cy="12" r="1.5" fill="currentColor" />
                <circle cx="9" cy="18" r="1.5" fill="currentColor" />
                <circle cx="15" cy="18" r="1.5" fill="currentColor" />
              </svg>
            </div>

            <div class="agent-avatar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div class="agent-details">
              <h3 class="agent-title">{{ config.assistantName }}</h3>
              <div class="agent-meta">
                <span class="pulse-indicator"></span>
                <span class="provider-pill">
                  {{ genUi.currentProvider().name }}
                  @if (genUi.currentProvider().isSimulated) {
                    <span class="local-tag">Simulator</span>
                  } @else if (genUi.currentProvider().isLocal) {
                    <span class="local-tag">Local</span>
                  }
                </span>
              </div>
            </div>
          </div>

          <!-- Header Window Controls -->
          <div class="header-actions" (mousedown)="$event.stopPropagation()">
            <!-- Size Preset Toggle (Compact / Standard / Wide) -->
            <button
              class="icon-btn"
              (click)="cycleSizePreset()"
              [title]="'Cycle Size Preset (Current: ' + currentPresetName() + ')'"
              aria-label="Resize window preset"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18M15 3v18" stroke-dasharray="2 2" />
              </svg>
            </button>

            <!-- Dock / Reset Position (shows when moved) -->
            @if (posX() !== null || posY() !== null) {
              <button
                class="icon-btn dock-btn"
                (click)="dockToDefaultCorner()"
                title="Dock to bottom-right corner"
                aria-label="Dock window to corner"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
            }

            <!-- Maximize / Restore -->
            <button
              class="icon-btn"
              (click)="toggleMaximize()"
              [title]="isMaximized() ? 'Restore window size' : 'Maximize window'"
              aria-label="Maximize or restore window"
            >
              @if (isMaximized()) {
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="5" y="5" width="14" height="14" rx="2" />
                </svg>
              } @else {
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                </svg>
              }
            </button>

            <!-- Clear Conversation -->
            <button
              class="icon-btn"
              (click)="genUi.clearHistory()"
              title="Clear conversation"
              aria-label="Clear conversation"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>

            <!-- Close Drawer -->
            <button
              class="icon-btn close-btn"
              (click)="genUi.closeDrawer()"
              title="Minimize assistant"
              aria-label="Close assistant"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </header>

        <!-- Tool Progress Banner (Active) -->
        @if (genUi.activeToolStatus(); as toolStatus) {
          <div class="active-tool-banner">
            <div class="spinner-small"></div>
            <span>{{ toolStatus }}</span>
          </div>
        }

        <!-- Messages Area -->
        <div #scrollContainer class="gen-ui-messages-list">
          @for (msg of genUi.messages(); track msg.id) {
            <div
              class="message-row"
              [class.user-row]="msg.role === 'user'"
              [class.assistant-row]="msg.role === 'assistant'"
            >
              @if (msg.role === 'assistant') {
                <div class="msg-avatar assistant-icon">🤖</div>
              }

              <div class="msg-bubble-wrap">
                <!-- Text Content -->
                @if (msg.content) {
                  <div class="msg-bubble" [class.user-bubble]="msg.role === 'user'">
                    <p class="msg-text">{{ msg.content }}</p>
                  </div>
                }

                <!-- Executed Tools Feedback -->
                @if (msg.toolCalls && msg.toolCalls.length > 0) {
                  <div class="tool-calls-container">
                    @for (tool of msg.toolCalls; track tool.id) {
                      <div class="tool-badge" [class.completed]="tool.status === 'completed'" [class.failed]="tool.status === 'failed'">
                        <span class="tool-icon">⚡</span>
                        <span class="tool-name">Tool: {{ tool.name }}</span>
                        <span class="tool-status">({{ tool.status }})</span>
                      </div>
                    }
                  </div>
                }

                <!-- Dynamic Generative UI Widgets -->
                @if (msg.uiWidgets && msg.uiWidgets.length > 0) {
                  <div class="widgets-stack">
                    @for (widget of msg.uiWidgets; track widget.id) {
                      <gen-ui-widget-outlet [widget]="widget" />
                    }
                  </div>
                }

                <!-- Streaming typing indicator -->
                @if (msg.isStreaming && !msg.content && (!msg.uiWidgets || msg.uiWidgets.length === 0)) {
                  <div class="msg-bubble typing-bubble">
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                  </div>
                }

                <span class="msg-time">{{ msg.timestamp | date: 'HH:mm' }}</span>
              </div>

              @if (msg.role === 'user') {
                <div class="msg-avatar user-icon">👤</div>
              }
            </div>
          }
        </div>

        <!-- Prompt Suggestions (if few messages) -->
        @if (config.suggestedPrompts && config.suggestedPrompts.length > 0) {
          <div class="quick-prompts-bar">
            <span class="quick-label">Try asking:</span>
            <div class="quick-chips-scroll">
              @for (prompt of config.suggestedPrompts; track prompt) {
                <button
                  class="prompt-chip"
                  (click)="onSendPrompt(prompt)"
                  [disabled]="genUi.isStreaming()"
                >
                  {{ prompt }}
                </button>
              }
            </div>
          </div>
        }

        <!-- Input Composer -->
        <footer class="gen-ui-composer">
          <form (submit)="onSubmit($event)" class="composer-form">
            <input
              #inputField
              type="text"
              class="composer-input"
              [(ngModel)]="inputText"
              name="promptInput"
              placeholder="Ask about statements, cards, PIN reset, security..."
              [disabled]="genUi.isStreaming()"
              autocomplete="off"
            />
            @if (genUi.isStreaming()) {
              <button
                type="button"
                class="composer-btn stop-btn"
                (click)="genUi.cancelStream()"
                title="Stop response"
              >
                ⏹ Stop
              </button>
            } @else {
              <button
                type="submit"
                class="composer-btn send-btn"
                [disabled]="!inputText().trim()"
                aria-label="Send query"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            }
          </form>

          <!-- Resize Grip in Bottom-Right Corner -->
          @if (!isMaximized()) {
            <div
              class="corner-resize-grip"
              (mousedown)="onResizeStart($event, 'bottom-right')"
              title="Drag corner to resize"
            >
              <span>◢</span>
            </div>
          }
        </footer>
      </aside>
    }
  `,
  styles: `
    :host {
      display: block;
      position: fixed;
      z-index: 9999;
      pointer-events: none;
      inset: 0;
      font-family: inherit;
    }

    /* Floating Launcher Button */
    .gen-ui-launcher-btn {
      pointer-events: auto;
      position: fixed;
      bottom: 24px;
      right: 24px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 20px;
      background: linear-gradient(135deg, #0ea5e9, #3b82f6, #6366f1);
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 9999px;
      color: #ffffff;
      font-weight: 600;
      font-size: 0.95rem;
      cursor: pointer;
      box-shadow: 0 10px 25px -5px rgba(14, 165, 233, 0.5), 0 8px 10px -6px rgba(14, 165, 233, 0.3);
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 9999;
    }
    .gen-ui-launcher-btn:hover {
      transform: translateY(-2px) scale(1.03);
      box-shadow: 0 15px 30px -5px rgba(14, 165, 233, 0.6);
    }
    .launcher-icon {
      width: 22px;
      height: 22px;
    }

    /* Resizable & Movable Drawer Container */
    .gen-ui-drawer-container {
      pointer-events: auto;
      position: fixed;
      display: flex;
      flex-direction: column;
      background: rgba(11, 19, 38, 0.95);
      backdrop-filter: blur(28px);
      -webkit-backdrop-filter: blur(28px);
      border: 1px solid rgba(56, 189, 248, 0.3);
      border-radius: 20px;
      box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.75), 0 0 35px rgba(14, 165, 233, 0.2);
      overflow: hidden;
      min-width: 360px;
      min-height: 420px;
      max-width: calc(100vw - 20px);
      max-height: calc(100vh - 20px);
      user-select: none;
      transition: box-shadow 0.2s ease, border-color 0.2s ease;
      z-index: 10000;
    }

    .gen-ui-drawer-container.is-dragging {
      opacity: 0.96;
      box-shadow: 0 30px 70px -10px rgba(0, 0, 0, 0.9), 0 0 45px rgba(56, 189, 248, 0.4);
      border-color: #38bdf8;
      cursor: grabbing !important;
    }

    .gen-ui-drawer-container.is-resizing {
      border-color: #38bdf8;
      box-shadow: 0 25px 60px rgba(14, 165, 233, 0.35);
    }

    .gen-ui-drawer-container.is-maximized {
      inset: 20px !important;
      width: calc(100vw - 40px) !important;
      height: calc(100vh - 40px) !important;
      border-radius: 16px;
    }

    /* Resize Handles (Edges & Corners) */
    .resize-handle {
      position: absolute;
      z-index: 100;
      background: transparent;
    }
    .resize-handle:hover {
      background: rgba(56, 189, 248, 0.2);
    }
    .handle-left {
      top: 10px;
      left: 0;
      bottom: 10px;
      width: 8px;
      cursor: ew-resize;
    }
    .handle-right {
      top: 10px;
      right: 0;
      bottom: 10px;
      width: 8px;
      cursor: ew-resize;
    }
    .handle-top {
      top: 0;
      left: 10px;
      right: 10px;
      height: 8px;
      cursor: ns-resize;
    }
    .handle-bottom {
      bottom: 0;
      left: 10px;
      right: 10px;
      height: 8px;
      cursor: ns-resize;
    }
    .handle-top-left {
      top: 0;
      left: 0;
      width: 14px;
      height: 14px;
      cursor: nwse-resize;
    }
    .handle-bottom-right {
      bottom: 0;
      right: 0;
      width: 14px;
      height: 14px;
      cursor: nwse-resize;
    }
    .handle-bottom-left {
      bottom: 0;
      left: 0;
      width: 14px;
      height: 14px;
      cursor: nesw-resize;
    }
    .handle-top-right {
      top: 0;
      right: 0;
      width: 14px;
      height: 14px;
      cursor: nesw-resize;
    }

    /* Header / Draggable Bar */
    .gen-ui-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: rgba(15, 23, 42, 0.9);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      cursor: grab;
      user-select: none;
    }
    .gen-ui-header:active {
      cursor: grabbing;
    }
    .header-main {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
      overflow: hidden;
    }
    .drag-grip {
      color: #64748b;
      display: flex;
      align-items: center;
      transition: color 0.2s;
    }
    .drag-grip svg {
      width: 18px;
      height: 18px;
    }
    .gen-ui-header:hover .drag-grip {
      color: #38bdf8;
    }
    .agent-avatar {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: linear-gradient(135deg, #0284c7, #2563eb);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      flex-shrink: 0;
    }
    .agent-avatar svg {
      width: 18px;
      height: 18px;
    }
    .agent-details {
      overflow: hidden;
    }
    .agent-title {
      margin: 0;
      font-size: 0.92rem;
      font-weight: 700;
      color: #f8fafc;
      letter-spacing: -0.01em;
      white-space: nowrap;
      text-overflow: ellipsis;
      overflow: hidden;
    }
    .agent-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 2px;
    }
    .pulse-indicator {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 8px #10b981;
      animation: pulseAnim 2s infinite;
    }
    @keyframes pulseAnim {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    .provider-pill {
      font-size: 0.7rem;
      color: #94a3b8;
      background: rgba(255, 255, 255, 0.06);
      padding: 1px 7px;
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
      text-overflow: ellipsis;
      overflow: hidden;
    }
    .local-tag {
      background: #065f46;
      color: #34d399;
      padding: 1px 4px;
      border-radius: 4px;
      font-size: 0.62rem;
      font-weight: bold;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .icon-btn {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #94a3b8;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
    }
    .icon-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #f8fafc;
      border-color: rgba(255, 255, 255, 0.2);
    }
    .icon-btn.dock-btn:hover {
      color: #38bdf8;
      border-color: #38bdf8;
    }
    .icon-btn.close-btn:hover {
      background: rgba(239, 68, 68, 0.2);
      color: #f87171;
      border-color: rgba(239, 68, 68, 0.4);
    }
    .icon-btn svg {
      width: 15px;
      height: 15px;
    }

    /* Active Tool Banner */
    .active-tool-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 16px;
      background: rgba(14, 165, 233, 0.12);
      border-bottom: 1px solid rgba(14, 165, 233, 0.2);
      color: #38bdf8;
      font-size: 0.78rem;
      font-weight: 500;
    }
    .spinner-small {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(56, 189, 248, 0.2);
      border-top-color: #38bdf8;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Messages List */
    .gen-ui-messages-list {
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      scroll-behavior: smooth;
      user-select: text;
    }
    .message-row {
      display: flex;
      gap: 10px;
      align-items: flex-start;
    }
    .user-row {
      justify-content: flex-end;
    }
    .assistant-row {
      justify-content: flex-start;
    }
    .msg-avatar {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1rem;
      flex-shrink: 0;
    }
    .msg-bubble-wrap {
      max-width: 86%;
      display: flex;
      flex-direction: column;
    }
    .user-row .msg-bubble-wrap {
      align-items: flex-end;
    }
    .assistant-row .msg-bubble-wrap {
      align-items: flex-start;
      width: 100%;
    }
    .msg-bubble {
      padding: 12px 16px;
      border-radius: 14px;
      font-size: 0.9rem;
      line-height: 1.5;
      color: #e2e8f0;
      background: rgba(30, 41, 59, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.08);
      word-break: break-word;
    }
    .user-bubble {
      background: linear-gradient(135deg, #0284c7, #2563eb);
      color: #ffffff;
      border-color: rgba(255, 255, 255, 0.15);
    }
    .msg-text {
      margin: 0;
      white-space: pre-wrap;
    }
    .msg-time {
      font-size: 0.65rem;
      color: #64748b;
      margin-top: 4px;
    }

    /* Tools & Widgets */
    .tool-calls-container {
      margin-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .tool-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(56, 189, 248, 0.2);
      border-radius: 6px;
      font-size: 0.72rem;
      color: #38bdf8;
    }
    .tool-badge.completed {
      border-color: rgba(16, 185, 129, 0.3);
      color: #34d399;
    }
    .widgets-stack {
      width: 100%;
      margin-top: 10px;
    }

    /* Typing bubble */
    .typing-bubble {
      display: flex;
      gap: 4px;
      padding: 10px 14px;
    }
    .dot {
      width: 6px;
      height: 6px;
      background: #38bdf8;
      border-radius: 50%;
      animation: bounce 1.4s infinite ease-in-out both;
    }
    .dot:nth-child(1) { animation-delay: -0.32s; }
    .dot:nth-child(2) { animation-delay: -0.16s; }
    @keyframes bounce {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1); }
    }

    /* Quick Prompts Bar */
    .quick-prompts-bar {
      padding: 8px 16px 10px;
      background: rgba(15, 23, 42, 0.7);
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
      flex-shrink: 0;
    }
    .quick-label {
      font-size: 0.7rem;
      color: #64748b;
      white-space: nowrap;
    }
    .quick-chips-scroll {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      max-height: 148px;
      overflow-y: auto;
      padding-right: 2px;
      scrollbar-width: thin;
      scrollbar-color: rgba(56, 189, 248, 0.45) transparent;
    }
    .prompt-chip {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #cbd5e1;
      padding: 5px 10px;
      border-radius: 9999px;
      font-size: 0.72rem;
      line-height: 1.3;
      text-align: left;
      cursor: pointer;
      transition: all 0.2s;
    }
    .prompt-chip:hover:not(:disabled) {
      background: rgba(14, 165, 233, 0.2);
      border-color: #38bdf8;
      color: #fff;
    }
    .prompt-chip:focus-visible {
      outline: 2px solid #22d3ee;
      outline-offset: 2px;
    }

    /* Composer */
    .gen-ui-composer {
      padding: 12px 16px;
      background: rgba(15, 23, 42, 0.9);
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      position: relative;
    }
    .composer-form {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .composer-input {
      flex: 1;
      background: rgba(30, 41, 59, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      padding: 10px 14px;
      color: #fff;
      font-size: 0.88rem;
      outline: none;
      transition: all 0.2s;
    }
    .composer-input:focus {
      border-color: #38bdf8;
      box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
    }
    .composer-btn {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
    }
    .send-btn {
      background: linear-gradient(135deg, #0ea5e9, #2563eb);
      color: #fff;
    }
    .send-btn:hover:not(:disabled) {
      transform: scale(1.05);
      box-shadow: 0 4px 12px rgba(14, 165, 233, 0.4);
    }
    .send-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .send-btn svg {
      width: 18px;
      height: 18px;
    }
    .stop-btn {
      width: auto;
      padding: 0 12px;
      background: #dc2626;
      color: white;
      font-size: 0.8rem;
      font-weight: 600;
      border-radius: 10px;
    }

    /* Bottom-Right Corner Resize Grip */
    .corner-resize-grip {
      position: absolute;
      bottom: 4px;
      right: 6px;
      font-size: 0.7rem;
      color: #64748b;
      cursor: nwse-resize;
      user-select: none;
      line-height: 1;
      transition: color 0.2s;
    }
    .corner-resize-grip:hover {
      color: #38bdf8;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenUiChatDrawerComponent {
  protected readonly genUi = inject(GenUiService);
  protected readonly config = inject<GenUiConfig>(GEN_UI_CONFIG);

  private readonly scrollContainer =
    viewChild<ElementRef<HTMLDivElement>>('scrollContainer');
  private readonly inputField =
    viewChild<ElementRef<HTMLInputElement>>('inputField');
  private readonly drawerElement =
    viewChild<ElementRef<HTMLElement>>('drawerElement');

  protected readonly inputText = signal('');

  // Movable & Resizable State
  protected readonly defaultRightOffset = 24;
  protected readonly defaultBottomOffset = 24;
  protected readonly width = signal<number>(460);
  protected readonly height = signal<number>(680);
  protected readonly posX = signal<number | null>(null);
  protected readonly posY = signal<number | null>(null);
  protected readonly isMaximized = signal<boolean>(false);
  protected readonly isDragging = signal<boolean>(false);
  protected readonly isResizing = signal<boolean>(false);

  // Preset tracking (compact 390, standard 480, wide 680)
  private readonly sizePresets = [
    { name: 'Standard', w: 480, h: 680 },
    { name: 'Wide', w: 680, h: 760 },
    { name: 'Compact', w: 390, h: 560 },
  ];
  private currentPresetIndex = 0;

  constructor() {
    afterNextRender(() => {
      this.scrollToBottom();
    });
  }

  protected currentPresetName(): string {
    return this.sizePresets[this.currentPresetIndex].name;
  }

  protected cycleSizePreset(): void {
    if (this.isMaximized()) {
      this.isMaximized.set(false);
      return;
    }
    this.currentPresetIndex = (this.currentPresetIndex + 1) % this.sizePresets.length;
    const preset = this.sizePresets[this.currentPresetIndex];
    this.width.set(Math.min(preset.w, window.innerWidth - 30));
    this.height.set(Math.min(preset.h, window.innerHeight - 30));

    // Keep clamped inside viewport if moved
    if (this.posX() !== null && this.posY() !== null) {
      this.clampWindowWithinScreen();
    }
  }

  protected toggleMaximize(): void {
    this.isMaximized.update((val) => !val);
  }

  protected dockToDefaultCorner(): void {
    this.posX.set(null);
    this.posY.set(null);
    this.isMaximized.set(false);
  }

  // --- Move / Drag Logic ---
  protected onHeaderMouseDown(event: MouseEvent): void {
    if (this.isMaximized()) return;
    const target = event.target as HTMLElement;
    if (target.closest('.header-actions') || target.closest('button')) {
      return;
    }

    event.preventDefault();
    this.startDrag(event.clientX, event.clientY);
  }

  protected onHeaderTouchStart(event: TouchEvent): void {
    if (this.isMaximized()) return;
    const target = event.target as HTMLElement;
    if (target.closest('.header-actions') || target.closest('button')) {
      return;
    }

    if (event.touches.length === 1) {
      const touch = event.touches[0];
      this.startDrag(touch.clientX, touch.clientY);
    }
  }

  private startDrag(clientX: number, clientY: number): void {
    const el = this.drawerElement()?.nativeElement;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const currentLeft = rect.left;
    const currentTop = rect.top;

    // Immediately anchor to left/top
    this.posX.set(currentLeft);
    this.posY.set(currentTop);
    this.isDragging.set(true);

    const offsetX = clientX - currentLeft;
    const offsetY = clientY - currentTop;

    const onMove = (moveEvent: MouseEvent | TouchEvent) => {
      const curX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const curY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;

      const newLeft = Math.max(10, Math.min(window.innerWidth - this.width() - 10, curX - offsetX));
      const newTop = Math.max(10, Math.min(window.innerHeight - this.height() - 10, curY - offsetY));

      this.posX.set(newLeft);
      this.posY.set(newTop);
    };

    const onEnd = () => {
      this.isDragging.set(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onEnd);
  }

  // --- Resize Logic ---
  protected onResizeStart(event: MouseEvent, direction: string): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.isMaximized()) return;

    const el = this.drawerElement()?.nativeElement;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const startLeft = rect.left;
    const startTop = rect.top;
    const startW = this.width();
    const startH = this.height();
    const startMouseX = event.clientX;
    const startMouseY = event.clientY;

    this.posX.set(startLeft);
    this.posY.set(startTop);
    this.isResizing.set(true);

    const onResizeMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startMouseX;
      const deltaY = moveEvent.clientY - startMouseY;

      // Min/max boundaries
      const minW = 360;
      const maxW = Math.min(1080, window.innerWidth - 20);
      const minH = 420;
      const maxH = Math.min(940, window.innerHeight - 20);

      // Directions
      if (direction.includes('right')) {
        const newW = Math.max(minW, Math.min(maxW, startW + deltaX));
        this.width.set(newW);
      }
      if (direction.includes('left')) {
        const potentialW = startW - deltaX;
        const newW = Math.max(minW, Math.min(maxW, potentialW));
        this.width.set(newW);
        this.posX.set(startLeft + (startW - newW));
      }
      if (direction.includes('bottom')) {
        const newH = Math.max(minH, Math.min(maxH, startH + deltaY));
        this.height.set(newH);
      }
      if (direction.includes('top')) {
        const potentialH = startH - deltaY;
        const newH = Math.max(minH, Math.min(maxH, potentialH));
        this.height.set(newH);
        this.posY.set(startTop + (startH - newH));
      }
    };

    const onResizeEnd = () => {
      this.isResizing.set(false);
      this.clampWindowWithinScreen();
      window.removeEventListener('mousemove', onResizeMove);
      window.removeEventListener('mouseup', onResizeEnd);
    };

    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', onResizeEnd);
  }

  private clampWindowWithinScreen(): void {
    const x = this.posX();
    const y = this.posY();
    if (x !== null) {
      this.posX.set(Math.max(10, Math.min(window.innerWidth - this.width() - 10, x)));
    }
    if (y !== null) {
      this.posY.set(Math.max(10, Math.min(window.innerHeight - this.height() - 10, y)));
    }
  }

  // --- Chat Submit & Scrolling ---
  protected onSubmit(event: Event): void {
    event.preventDefault();
    const prompt = this.inputText().trim();
    if (prompt) {
      this.onSendPrompt(prompt);
    }
  }

  protected async onSendPrompt(prompt: string): Promise<void> {
    this.inputText.set('');
    await this.genUi.sendMessage(prompt);
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    const el = this.scrollContainer()?.nativeElement;
    if (el) {
      setTimeout(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      }, 50);
    }
  }
}
