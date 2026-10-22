# End-to-end UI flow: HTML element to widget template

This traces one sentence, “I want to set my PIN”, from the button in the page HTML to the exact Angular template that appears in the chat. Every box names a real element, class, method, or map key in this repo.

Startup registration happens once, before the click. The click path is steps 1–14.

## 0. What is already in the page before you type

`src/index.html` contains only:

```html
<body>
  <app-root></app-root>
</body>
```

Angular boots `App` (`selector: app-root`, template `src/app/app.html`). That template is two siblings:

```text
app-root
├── div.banking-shell
│   ├── header.banking-topbar
│   │   ├── div.llm-status-pill
│   │   │     strong.llm-name  {{ genUi.currentProvider().name }}
│   │   └── button.ai-trigger-topbar  (click)="genUi.openDrawer()"
│   │         "AI Concierge"
│   ├── aside.banking-sidebar
│   │     a[routerLink]  Dashboard, Statements, Cards & PIN, ...
│   └── main.banking-content-area
│         router-outlet   ← page template (dashboard, cards, ...)
└── gen-ui-chat-drawer     ← chat shell, always in the DOM
```

`App` imports `GenUiChatDrawerComponent`, so the tag `<gen-ui-chat-drawer />` at the bottom of `app.html` is the chat. It is not inside `router-outlet`. Changing pages does not destroy it.

On startup, `app.config.ts` runs `BankingGenUiInitService.init()`. That fills `GenUiRegistryService.widgets`, a `Map<string, component class>`:

| Map key (widget name) | Component class | Selector the class declares | Root element of its template |
|---|---|---|---|
| `chartWidget` | `FinancialChartWidgetComponent` | `bank-financial-chart-widget` | `div.chart-widget-card` |
| `budgetAnalyticsWidget` | `BudgetAnalyticsWidgetComponent` | `bank-budget-analytics-widget` | budget card root |
| `loanCalculatorWidget` | `LoanCalculatorWidgetComponent` | `bank-loan-calculator-widget` | loan card root |
| `currencyExchangeWidget` | `CurrencyExchangeWidgetComponent` | `bank-currency-exchange-widget` | FX card root |
| `statementWidget` | `StatementWidgetComponent` | `bank-statement-widget` | `div.statement-card` |
| `cardPinResetWidget` | `CardPinResetWidgetComponent` | `bank-card-pin-reset-widget` | `div.pin-reset-card` |
| `cardControlsWidget` | `CardControlsWidgetComponent` | `bank-card-controls-widget` | card controls root |
| `passwordResetWidget` | `PasswordResetWidgetComponent` | `bank-password-reset-widget` | password card root |
| `transferConfirmWidget` | `TransferConfirmWidgetComponent` | `bank-transfer-confirm-widget` | transfer card root |

Template selection later is a lookup of that map key. Angular does not parse HTML files at request time. The template is the `template:` string compiled into the component class.

## 1. Open the drawer

```text
button.ai-trigger-topbar
  (click)="genUi.openDrawer()"
        │
        ▼
GenUiService.isDrawerOpen = true
        │
        ▼
gen-ui-chat-drawer template
  @if (genUi.isDrawerOpen())
        aside.gen-ui-drawer-container
```

There is also a floating `button.gen-ui-launcher-btn` inside the drawer component with the same `openDrawer()` call.

The drawer template, all inline in `gen-ui-chat-drawer.component.ts`, is:

```text
aside.gen-ui-drawer-container
├── header.gen-ui-header
│     h3.agent-title          {{ config.assistantName }}     "Apex Banking Concierge"
│     span.provider-pill      {{ genUi.currentProvider().name }}
├── div.active-tool-banner    only while a tool is running
├── div.gen-ui-messages-list
│     @for (msg of genUi.messages())
├── div.quick-prompts-bar
│     button.prompt-chip      (click)="onSendPrompt(prompt)"
└── footer.gen-ui-composer
      form.composer-form      (submit)="onSubmit($event)"
        input.composer-input  [(ngModel)]="inputText"
        button.composer-btn.send-btn   type="submit"
```

`config` comes from `provideGenerativeUi` in `app.config.ts`: assistant name, the eight suggested prompts, and `apiEndpoint: http://localhost:5050/api/chat`.

## 2. The HTML element that captures the sentence

The element is `input.composer-input`.

| HTML | Binding | Result |
|---|---|---|
| `type="text"` | user keystrokes | text sits in the input |
| `[(ngModel)]="inputText"` | two-way | `inputText` signal on the drawer component |
| `placeholder` | none | “Ask about statements, cards, PIN reset, security...” |
| `[disabled]="genUi.isStreaming()"` | signal | locked while a reply is in progress |
| parent `form (submit)` | Enter or send click | `onSubmit($event)` |

Send button: `button.composer-btn.send-btn`, `type="submit"`, disabled when `inputText()` is blank.

```text
input.composer-input
  ngModel ──► inputText signal = "I want to set my PIN"
        │
button.send-btn  type="submit"
        │
form.composer-form  (submit)
        │
onSubmit(event)
  event.preventDefault()          ← browser does not reload the page
  prompt = inputText().trim()
  onSendPrompt(prompt)
        │
onSendPrompt
  inputText.set('')               ← clears the HTML input
  genUi.sendMessage(prompt)       ← leaves the template, enters the service
```

A chip does not use the input. `button.prompt-chip` calls `onSendPrompt(prompt)` with the chip’s string, then the same `sendMessage`.

## 3. The message list grows before the network returns

`GenUiService.sendMessage` pushes two rows into the `messages` signal:

```text
messages = [
  { id, role: "user",      content: "I want to set my PIN" },
  { id, role: "assistant", content: "", isStreaming: true, uiWidgets: [] }
]
```

`div.gen-ui-messages-list` is bound with `@for (msg of genUi.messages(); track msg.id)`. OnPush plus signals re-renders that list.

For each row the template branches on `msg.role`:

```text
div.message-row.user-row
  div.msg-bubble-wrap
    div.msg-bubble.user-bubble
      p.msg-text     {{ msg.content }}     "I want to set my PIN"
  div.msg-avatar.user-icon   👤

div.message-row.assistant-row
  div.msg-avatar.assistant-icon   🤖
  div.msg-bubble-wrap
    div.msg-bubble.typing-bubble   three span.dot
      shown only while isStreaming and content is still empty
```

The assistant template has four slots, filled later by stream events:

| Slot in the assistant row | HTML | Filled when |
|---|---|---|
| Text | `div.msg-bubble > p.msg-text` | `type: delta` appends `msg.content` |
| Tools | `div.tool-calls-container > div.tool-badge` | `type: tool_call` pushes `msg.toolCalls` |
| Widgets | `div.widgets-stack > gen-ui-widget-outlet` | `type: widget` pushes `msg.uiWidgets` |
| Clock | `span.msg-time` | `msg.timestamp` |

## 4. Leave the browser

`sendMessage` posts to the endpoint from the HTML app’s config, not from the input element:

```text
fetch("http://localhost:5050/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
  body: {
    message: "I want to set my PIN",
    history: previous bubbles,
    availableTools: registry.getToolsSchema(),
    availableWidgets: registry.getWidgetsSchema()
  }
})
```

`availableWidgets` is the nine map keys from section 0. The API does not pick the template from that list. It picks with its own keyword rules, then returns a name that must exist in the map.

## 5. Server chooses the template name

`POST /api/chat` writes SSE. Order for this sentence:

```text
data: {"type":"provider_info","providerInfo":{"name":"Cursor Cloud (composer-2.5)",...}}

data: {"type":"delta","content":"..."}     ← Cursor sentences, repeated

data: {"type":"tool_call","toolCall":{"name":"initiatePinReset","args":{"cardId":"...","cardType":"Debit"}}}

data: {"type":"widget","widget":{
         "name":"cardPinResetWidget",
         "title":"Secure PIN Reset - Debit Card",
         "props":{ "cardId","cardName","cardNumberMasked","cardType","isFrozen" }
       }}

data: {"type":"done"}
```

The template name is the string `widget.name`. Selection rules, first match wins, in `EmitEfCoreWidgetsForIntentAsync`:

```text
message lowercased
    │
    ├─ \bpin\b  OR  (card AND (reset|change) AND NOT password)
    │       name = "cardPinResetWidget"
    │       props from SQLite Cards (debit unless the text contains "credit")
    │
    ├─ freeze | unfreeze | lock | (card AND limit|controls|block)
    │       name = "cardControlsWidget"
    │
    ├─ password | 2fa | ...
    │       name = "passwordResetWidget"
    │
    ├─ transfer | wire | send money | ...
    │       name = "transferConfirmWidget"
    │
    ├─ loan | mortgage | emi | ...
    │       name = "loanCalculatorWidget"
    │
    ├─ convert | currency | forex | ...
    │       name = "currencyExchangeWidget"
    │
    ├─ budget | allowance | target | ...
    │       name = "budgetAnalyticsWidget"
    │
    ├─ chart | pie | bar | doughnut | ...
    │       name = "chartWidget"
    │
    └─ statement | transaction | history | ...
            name = "statementWidget"
```

“I want to set my PIN” matches the first rule because of the word `pin`. Cursor’s paragraph is not read for this decision.

## 6. Stream events write back into the HTML slots

`GenUiService.handleStreamEvent` updates the assistant message signal. The same `@for` re-renders.

| SSE `type` | Signal write | HTML that changes |
|---|---|---|
| `provider_info` | `currentProvider` | `strong.llm-name` in the top bar and `span.provider-pill` in the drawer header |
| `delta` | `msg.content += text` | `p.msg-text` inside `div.msg-bubble`. Typing dots hide once content is non-empty |
| `tool_call` | `msg.toolCalls.push(...)`, `activeToolStatus` | `div.active-tool-banner` and `div.tool-badge` “Tool: initiatePinReset” |
| `widget` | `msg.uiWidgets.push({ id, name, props, title })` | `@for` creates `<gen-ui-widget-outlet [widget]="widget" />` |
| `error` | `msg.error` | message error state |
| `done` | streaming finished | send button returns, input enabled |

`initiatePinReset` is not in the client tool map, so the badge status becomes failed (“not registered”). That badge is `div.tool-badge`. It is not the PIN form.

## 7. Template selection: name string to component class

This is the lookup. It happens in the widget outlet, not in the chat form.

```text
div.widgets-stack
  @for (widget of msg.uiWidgets)
        │
        │  widget = {
        │    name: "cardPinResetWidget",
        │    props: { cardId, cardName, cardNumberMasked, cardType, isFrozen }
        │  }
        ▼
gen-ui-widget-outlet
  input: widget
  widgetDef = computed(() => registry.getWidget(widget().name))
        │
        │  Map.get("cardPinResetWidget")
        │       → { component: CardPinResetWidgetComponent }
        ▼
  @if (widgetDef(); as def)
        ng-container
          [ngComponentOutlet]="def.component"
          [ngComponentOutletInputs]="widget().props"
```

`NgComponentOutlet` instantiates `CardPinResetWidgetComponent` and assigns each prop to the matching `input()`:

| `props` key from the API | Component input | Used in the template as |
|---|---|---|
| `cardId` | `cardId` | passed later to `resetCardPin` |
| `cardName` | `cardName` | `h4.pin-title` |
| `cardNumberMasked` | `cardNumberMasked` | `span.card-num` |
| `cardType` | `cardType` | `span.card-num` |
| `isFrozen` | `isFrozen` | input, not shown in the header text |

If the name is missing from the map, the outlet does not mount a component. It renders `div.gen-ui-widget-fallback` and prints the props as JSON.

The selector `bank-card-pin-reset-widget` is not written in the chat template. `NgComponentOutlet` creates the component without a tag in the parent HTML. In the live DOM you still see that host element around the template root.

## 8. The selected template

`CardPinResetWidgetComponent` template, root `div.pin-reset-card`:

```text
div.pin-reset-card
├── div.pin-header
│     h4.pin-title          "PIN Reset: " + cardName()
│     span.card-num         cardNumberMasked() + cardType()
│     span.auth-badge       "2FA Required"
├── @if (!isSuccess())
│   div.form-body
│     input.pin-input       [(ngModel)]="newPin"       type="password" maxlength="4"
│     input.pin-input       [(ngModel)]="confirmPin"
│     input.otp-input       [(ngModel)]="otpCode"      demo value 849201
│     button.resend-link    (click)="onResendOtp()"
│     div.error-banner      @if (errorMessage())
│     button.submit-pin-btn (click)="onConfirmReset()"
│           "🔐 Authorize & Update PIN"
└── @else
    div.success-banner
      h5.success-title      "PIN Updated Successfully!"
```

Those inputs belong to the widget. They are not `input.composer-input`. The composer is done.

## 9. Submit stays in this template, then leaves chat

```text
button.submit-pin-btn
  (click)="onConfirmReset()"
        │
        ├─ newPin must be 4 digits
        ├─ confirmPin must match
        ├─ otpCode length >= 4     (browser only, not sent)
        ▼
BankingStateService.resetCardPin(cardId(), pin)
        │
        ▼
POST http://localhost:5050/api/cards/{cardId}/pin
  body { cardId, newPin }
        │
        ▼
BankingService.ResetCardPinAsync
  Cards.Pin = newPin
  AiAuditLog action ResetCardPin
  SaveChangesAsync → banking.db
        │
        ▼
isSuccess = true
        │
        ▼
@else branch replaces div.form-body with div.success-banner
```

No second trip through `/api/chat`. The chat template does not swap. Only the inner `@if (!isSuccess())` of the PIN template swaps.

`div.global-toast` in `app.html` (`@if (banking.notification())`) shows the toast from `resetCardPin`. That element is outside the drawer, in `main.banking-content-area`.

## Whole chain on one line

```text
index.html body > app-root
  app.html button.ai-trigger-topbar
    gen-ui-chat-drawer
      input.composer-input  ──ngModel──► inputText
      form.composer-form (submit) ──► onSubmit ──► onSendPrompt
        ──► GenUiService.sendMessage
              messages signal ──► div.message-row > p.msg-text
              POST /api/chat
                Cursor writes delta text
                C# keyword "pin" sets widget.name = "cardPinResetWidget"
              msg.uiWidgets ──► div.widgets-stack
                gen-ui-widget-outlet
                  registry.getWidget("cardPinResetWidget")
                    CardPinResetWidgetComponent
                      template root div.pin-reset-card
                        button.submit-pin-btn
                          POST /api/cards/{id}/pin
```
