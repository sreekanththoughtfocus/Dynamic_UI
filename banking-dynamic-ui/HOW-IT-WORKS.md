# How Apex Banking Dynamic UI Works

This document explains the running application: the Angular portal, the .NET API, the SQLite ledger, and the AI concierge. It matches the code as it is today, including the Cursor provider.

## What the app is

Apex Banking Dynamic UI is a demo retail-banking portal. Customers browse accounts, cards, statements, transfers, and security. A floating **AI Concierge** answers in chat and can mount interactive widgets inside the conversation (statement tables, charts, PIN reset, card freeze, transfers, and similar tools).

Two processes run locally:

| Process | Folder | URL |
|---|---|---|
| Angular 22 portal | `banking-portal` | http://localhost:4200 |
| .NET 10 Web API | `banking-api` | http://localhost:5050 |

The portal calls the API directly. There is no reverse proxy. CORS on the API allows `http://localhost:4200` and `http://127.0.0.1:4200`.

## How to run it from Command Prompt

Open two Command Prompt windows.

**API**

```cmd
cd /d D:\DEV\Dunamic_UI\Dunamic_UI\banking-dynamic-ui\banking-api
"%USERPROFILE%\.dotnet\dotnet.exe" run
```

Wait for `Now listening on: http://localhost:5050`.

**Portal**

```cmd
cd /d D:\DEV\Dunamic_UI\Dunamic_UI\banking-dynamic-ui\banking-portal
npm start
```

Then open http://localhost:4200.

Use `"%USERPROFILE%\.dotnet\dotnet.exe"` when the `dotnet` command on PATH is only the runtime in `C:\Program Files\dotnet` and the .NET 10 SDK lives under the user profile. After a machine-wide SDK install, plain `dotnet run` is enough.

Chat uses `LlmSettings` in `banking-api/appsettings.json`. The Cursor API key is read from gitignored `banking-api/appsettings.Local.json` (or the `CURSOR_API_KEY` environment variable). Edit the source `appsettings.json`, not the copy under `bin/`. Restart the API after config changes.

## Repository layout

```text
banking-dynamic-ui/
├── banking-portal/                 Angular 22 app
│   ├── projects/generative-ui/     Reusable chat + widget host library
│   └── src/app/
│       ├── features/               Dashboard, statements, cards, security, transfers, admin
│       ├── core/                   Banking models and BankingStateService
│       └── generative-ui-setup/    Widget registration and banking widgets
└── banking-api/                    .NET 10 minimal API
    ├── Program.cs                  HTTP routes and SSE chat
    ├── Data/                       EF Core SQLite context and seed
    ├── Services/
    │   ├── BankingService.cs       Ledger reads and writes, audit log
    │   ├── MultiProviderLlmService.cs   Provider switch, guardrails, widgets
    │   └── CursorCloudAgentsClient.cs   Cursor Cloud Agents streaming
    └── appsettings.json            Provider, model, endpoint
```

`SemanticKernelService` is registered in dependency injection and can build a Kernel for OpenAI-compatible endpoints. The live chat path does not call it. `/api/chat` uses `MultiProviderLlmService`.

## Portal pages

Routes are lazy-loaded in `src/app/app.routes.ts`.

| Route | Purpose |
|---|---|
| `/dashboard` | Account overview and prompt chips that open the concierge |
| `/statements` | Account activity |
| `/cards` | Card list and controls |
| `/security` | Password and security profile |
| `/transfers` | Fund transfer form |
| `/admin` | Database console: users, balances, cards, transactions, AI audit log |

These pages read and write through `BankingStateService` (`src/app/core/services/banking.service.ts`), which calls `http://localhost:5050/api/...`. The chat drawer is separate from those pages. It is provided by the `generative-ui` library and stays available across routes.

On startup, `app.config.ts` calls `provideGenerativeUi(...)` with the chat URL `http://localhost:5050/api/chat`, then `BankingGenUiInitService.init()` registers widget components and client tools.

## Request path for one chat message

```text
User types in the AI Concierge drawer
        │
        ▼
GenUiService  POST http://localhost:5050/api/chat
        │     body: { message, history }
        │     response: Server-Sent Events
        ▼
Program.cs  /api/chat
        │     writes each event as:  data: {json}\n\n
        ▼
MultiProviderLlmService.StreamChatAsync
        │
        ├─ 1. provider_info          (badge: Cursor / Ollama / Simulator)
        ├─ 2. C# guardrails          (refusal text, no model call)
        ├─ 3. Provider-specific text (Cursor, Ollama, Mock, or other LLM)
        ├─ 4. Keyword widget builder (SQLite or fixed demo props)
        └─ 5. done
        ▼
Browser appends text, runs client tools, mounts the widget
        ▼
Widget buttons call REST (/api/cards/..., /api/transfers, ...)
```

The model writes the sentences. It does not query SQLite, and it does not choose the widget. Widget choice is a C# keyword match on the user’s message after the text stream.

## Stream events

Each SSE line is JSON. `GenUiService` handles these `type` values:

| `type` | Meaning |
|---|---|
| `provider_info` | Sets the drawer badge (`name`, `model`, `isLocal`, `isSimulated`) |
| `delta` | Appends assistant text |
| `tool_call` | Runs a registered client tool by name |
| `widget` | Mounts a registered Angular component and passes `props` as inputs |
| `error` | Shows a failure. Live providers do not fall back to canned answers |
| `done` | Ends the turn |

Example widget event:

```json
{
  "type": "widget",
  "widget": {
    "name": "statementWidget",
    "title": "Account Statement Explorer",
    "props": {
      "accountName": "Premier Checking",
      "accountNumber": "CHK-98214-01",
      "balance": 24890.75,
      "currency": "USD",
      "transactions": []
    }
  }
}
```

`gen-ui-widget-outlet` looks up `name` in `GenUiRegistryService` and renders it with:

```html
<ng-container
  [ngComponentOutlet]="def.component"
  [ngComponentOutletInputs]="widget().props"
/>
```

Input names on the component must match the `props` keys. The statement widget reads `accountName`, `accountNumber`, `balance`, `currency`, and `transactions`.

## How the AI is selected

`LlmSettings.Provider` in `appsettings.json` picks the path inside `StreamChatAsync`:

| Provider | What runs |
|---|---|
| `Cursor` | Cursor Cloud Agents API at `Endpoint` (default `https://api.cursor.com`), model `ModelId` |
| `Ollama` | OpenAI-compatible `POST {endpoint}/chat/completions` against local Ollama |
| `Mock` | Canned banking replies. No network model call. Badge shows **Simulator** |
| `LmStudio`, `Omlx`, `Gemini`, `OpenAI`, `Claude` | OpenAI-compatible chat completions. Gemini, OpenAI, and Claude with an empty API key use Mock instead |

Current committed settings use Cursor and model `composer-2.5`. `ApiKey` in `appsettings.json` is empty on purpose. The real key stays in `appsettings.Local.json`, which git ignores. `Program.cs` loads that file when it is present.

If Ollama or Cursor fails (wrong model, Ollama down, bad key, HTTP error), the API emits `type: "error"` and stops. It does not silently answer with the Mock simulator. Mock runs only when `Provider` is `Mock`, or when a cloud key provider has no API key.

## Guardrails (before any model)

`MultiProviderLlmService` checks the lowercased message first.

**Prohibited banking.** Account delete or close, cash dispense, hack, ledger tampering, and similar phrases return a fixed refusal. No model call. No widget.

**Out of scope.** Flights, hotels, weather, recipes, coding, and similar phrases return a fixed refusal plus a menu of banking prompts. Spending questions that also contain words like `statement`, `chart`, or `charge` are allowed through, so “flight charges on my statement” is treated as banking.

Anything else continues to the configured provider.

## Cursor path (current default)

`CursorCloudAgentsClient` does not call an OpenAI `/v1/chat/completions` endpoint. Cursor’s public API for this key is the Cloud Agents API.

1. Resolve the key from `LlmSettings:ApiKey`, then `CURSOR_API_KEY`.
2. Build one prompt: grounded system instructions, the last six history turns, and the new user message. The prompt tells the agent to reply in plain chat text and not edit a repository.
3. First message in the API process: `POST https://api.cursor.com/v1/agents` with no repository. The response contains `agent.id` and `run.id`. The agent id is kept in memory for later turns.
4. Later messages: `POST /v1/agents/{id}/runs` with the new prompt.
5. `GET /v1/agents/{id}/runs/{runId}/stream` with `Accept: text/event-stream`.
6. Cursor `assistant` events become chat `delta` text. If no assistant text arrived, the final `result.text` is used. A Cursor `error` event becomes a chat `error`.
7. After the text, the same keyword widget builder runs.

The agent id lives only in the running API process. Restarting the API starts a new Cursor agent on the next message. Follow-up runs are serialized so two chats do not hit `agent_busy` at the same time.

## Ollama and other OpenAI-compatible models

For Ollama, the API posts to `{Endpoint}/chat/completions`. If `Endpoint` is `http://localhost:11434` with no `/v1`, the service appends `/v1`. The body includes `model`, the system prompt, history, `stream: true`, and a low temperature.

Successful token chunks (`choices[0].delta.content`) are forwarded as `delta` events. Then the keyword widget builder runs.

LmStudio, Omlx, Gemini, OpenAI, and Claude share `StreamFromOpenAiCompatibleEndpointAsync`. Cloud calls send `Authorization: Bearer {ApiKey}` when a key is set.

## Mock simulator

`SimulateDynamicBankingAsync` never calls a model. It matches the same keywords and streams a fixed sentence for that intent (“I have queried the core EF Core ledger…”, a PIN-reset intro, a chart intro, a greeting menu, or a fallback refusal). It then emits the same widgets as the live providers.

Use `Provider: Mock` when you want the demo with no Cursor or Ollama.

## How a widget gets its data

There are two stages.

### 1. Data shown when the widget appears

`EmitEfCoreWidgetsForIntentAsync` scans the user text. The first matching intent wins. The order is PIN reset, card controls, password reset, transfer, loan, currency, budget, chart, then statement.

| Intent keywords (examples) | Widget | Where the numbers come from |
|---|---|---|
| `pin`, or card + reset/change | `cardPinResetWidget` | SQLite cards via `GetCardsAsync`. Credit vs debit depends on the word `credit` |
| `freeze`, `lock`, card + limit/controls | `cardControlsWidget` | SQLite cards. Freeze is on unless the text says unfreeze or unlock |
| `password`, `2fa` | `passwordResetWidget` | Fixed demo email `a.vance@example.com` |
| `transfer`, `wire`, `send money` | `transferConfirmWidget` | Checking account from SQLite. Recipient and amount `$250` are fixed demo values |
| `loan`, `mortgage`, `emi` | `loanCalculatorWidget` | Principal parsed from the message if a number ≥ 1000 appears, otherwise `$35,000`. Rate `6.45`, term `48` months |
| `convert`, `currency`, `forex` | `currencyExchangeWidget` | Fixed `1000 USD` to `EUR` starter values. The widget is not a live FX feed |
| `budget`, `allowance`, `target` | `budgetAnalyticsWidget` | Hardcoded category rows in the API |
| `chart`, `pie`, `bar`, `doughnut` | `chartWidget` | Debit transactions grouped by category from SQLite account `acc-chk-01`. Fallback categories if the ledger is empty |
| `statement`, `transaction`, `history` | `statementWidget` | Account `acc-chk-01` and up to 6 transactions from SQLite |

A `tool_call` event is often sent just before the widget (`fetchStatements`, `initiatePinReset`, `generateFinancialChart`, and so on). The Angular registry runs that tool in the browser. Several handlers only echo arguments or read the in-memory banking signals. The widget’s visible numbers still come from the `props` on the `widget` event, which the API already filled.

### 2. Data written when the user clicks

Buttons do not go back through the chat stream. They call `BankingStateService`, which posts to the API:

| Action | HTTP |
|---|---|
| PIN reset | `POST /api/cards/{cardId}/pin` |
| Freeze or unfreeze | `POST /api/cards/{cardId}/freeze` |
| Password reset | `POST /api/security/password-reset` |
| Transfer authorize | `POST /api/transfers` |

`BankingService` updates SQLite and writes an `AiAuditLog` row for mutating operations. The admin page reads that log from `GET /api/audit-logs`.

## Database

SQLite file `banking.db` is created next to the API on startup (`EnsureCreatedAsync`). It holds accounts, cards, transactions, users, and audit logs. The file is gitignored. Reset from the admin API with `POST /api/admin/reset-db`.

Portal pages and the concierge share this database only when they go through the API. The Angular service also keeps signals with the same demo customer (Alex Vance, Premier Checking `acc-chk-01`). A widget can show API data from the chat stream while a page still shows its local signal until that page refreshes from the API.

## What the model is responsible for

The model is responsible for the prose in the chat bubble, inside the system prompt’s banking scope.

The application is responsible for:

- Refusing out-of-scope and prohibited requests with fixed text
- Deciding which widget to show
- Loading balances, cards, and transactions from SQLite
- Applying PIN, freeze, password, and transfer changes
- Writing the audit log

A wrong `ModelId` used to look “successful” because failures fell back to the Mock scripts. That fallback is removed for Ollama and for other live providers. A bad model or a down endpoint now surfaces as an error in the drawer.

## Useful API checks

| URL | What it tells you |
|---|---|
| `GET /` | API process is up |
| `GET /api/llm/status` | Active provider name, model, and endpoint |
| `GET /api/accounts` | Seeded ledger |
| `POST /api/chat` | SSE concierge stream |

`/api/llm/status` reports the configured provider. It does not prove the last chat turn reached Cursor or Ollama. A turn reached the model only when the reply is model-written text and the drawer did not show an `error`.
