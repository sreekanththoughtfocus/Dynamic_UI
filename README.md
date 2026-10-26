# Apex Banking Dynamic UI

A local demo of a retail banking portal with a generative chat drawer and a tree-based settings designer. The Angular portal talks directly to a .NET API. The API stores the ledger and the property documents in SQLite and streams the concierge over Server-Sent Events.

Two processes:

| Process | Folder | URL |
|---|---|---|
| Angular 22 portal | `banking-portal` | http://localhost:4200 |
| .NET 10 Web API | `banking-api` | http://localhost:5050 |

There is no reverse proxy. CORS allows `http://localhost:4200` and `http://127.0.0.1:4200`.

Deeper notes that this file summarizes live in [HOW-IT-WORKS.md](banking-dynamic-ui/HOW-IT-WORKS.md), [AI-WORKFLOW.md](banking-dynamic-ui/AI-WORKFLOW.md), and [AI-UI-FLOW.md](banking-dynamic-ui/AI-UI-FLOW.md).

## Run it

Open two terminals.

**API**

```cmd
cd /d D:\DEV\Dunamic_UI\Dunamic_UI\banking-dynamic-ui\banking-api
"%USERPROFILE%\.dotnet\dotnet.exe" run
```

Wait for `Now listening on: http://localhost:5050`.

Use that `dotnet.exe` path when `dotnet` on PATH is only the runtime under `C:\Program Files\dotnet` and the .NET 10 SDK is under the user profile. After a machine-wide SDK install, `dotnet run` is enough.

**Portal**

```cmd
cd /d D:\DEV\Dunamic_UI\Dunamic_UI\banking-dynamic-ui\banking-portal
npm start
```

Open http://localhost:4200.

Chat settings live in `banking-api/appsettings.json` under `LlmSettings`. The Cursor API key is not committed. Put it in gitignored `banking-api/appsettings.Local.json` or the `CURSOR_API_KEY` environment variable. Edit the source `appsettings.json`, not the copy under `bin/`. Restart the API after a config change.

## Sign in

One seeded customer can open every screen, including admin.

| Field | Value |
|---|---|
| Username | `alex.vance` |
| Password | `ApexSecure2026!` |

The login page can fill those values from its demo button. There is no separate admin user.

## Repository map

```text
banking-dynamic-ui/
├── banking-portal/                         Angular 22 app
│   ├── projects/generative-ui/             Chat drawer, SSE client, widget host
│   └── src/app/
│       ├── core/                           Auth, banking state, property tree helpers
│       ├── features/                       Pages: dashboard, statements, cards, security,
│       │                                   transfers, settings, admin, property manager
│       ├── generative-ui-setup/            Banking widgets and client tools
│       └── layout/                         Shell: top bar, sidebar, router outlet
└── banking-api/                            .NET 10 Web API
    ├── Program.cs                          DI, SQLite, CORS, auth middleware, controllers
    ├── Auth/                               Bearer session middleware
    ├── Controllers/                        One controller per area
    ├── Data/BankingDbContext.cs            EF Core model and seed
    ├── Services/                           Ledger, LLM, FX, insights, property documents
    └── appsettings.json                    Provider, model, endpoint
```

`/api/chat` uses `MultiProviderLlmService`. `SemanticKernelService` is registered and can build a Kernel, but the live chat path does not call it.

## What starts when the API boots

1. `Program.cs` loads `appsettings.json`, then optional `appsettings.Local.json`.
2. It binds `LlmSettings` and registers SQLite with `ConnectionStrings:BankingDb` (`Data Source=banking.db`). The file is created next to the API process. It is gitignored.
3. Scoped services: `BankingService`, `LedgerBootstrap`, insights, concierge planner, LLM service. Singleton FX rates and the in-memory session store.
4. `EnsureCreatedAsync` creates tables from the EF model when the database file is new. It does not alter an existing file.
5. `LedgerBootstrap.EnsureAsync` then runs `CREATE TABLE IF NOT EXISTS` for payees, budgets, disputes, travel notices, and `AppPropertyDocuments`, and inserts seed rows when those tables are empty.
6. The property seed is one document, id `banking-preferences`, name `Banking preferences`.
7. The host listens on http://localhost:5050.
8. `SessionAuthMiddleware` sits in front of controllers. `OPTIONS` is allowed through. Every other `/api/...` call needs a bearer token except `POST /api/auth/login` and `GET /api/llm/status`.

## Sign-in flow, step by step

1. The browser opens `/`. `authGuard` runs on the shell.
2. `AuthService.ensureSession` looks in `sessionStorage` for `apex.session.token` and `apex.session.user`.
3. If either is missing, the guard sends the browser to `/login`. `guestGuard` does the opposite: a valid session on `/login` is sent to `/dashboard`.
4. The person types a username and password, or uses the demo fill.
5. The portal `POST`s `{ username, password }` to `http://localhost:5050/api/auth/login` with no bearer token.
6. Empty username or password returns 400, `Enter your username and password.`
7. `BankingService.AuthenticateAsync` finds the user by username, case-insensitive, and compares the password as stored text.
8. A mismatch writes an `AiAuditLog` row `UserLoginFailed` and returns 401, `The username or password is incorrect.`
9. A match sets `LastLoginAt`, writes `UserLogin`, and returns `{ token, expiresAt, user }`. The token lives only in `AuthSessionStore` memory. Restarting the API drops every session.
10. The portal stores the token and user in `sessionStorage` and navigates into the shell. The next guarded navigation calls `GET /api/auth/me`. A 401 clears storage and returns to `/login`.
11. Later API calls send `Authorization: Bearer <token>`. A 401 on those calls expires the session and navigates to `/login`.

## Sign-out flow

1. The shell **Sign out** button calls `AuthService.logout`.
2. The portal clears `sessionStorage` immediately.
3. It then `POST`s `/api/auth/logout` with the old token so the API can revoke it and write `UserLogout`.
4. If that call fails, the browser is still signed out.

## Shell

After sign-in, `ShellComponent` is the frame for every page except login.

- Top bar: brand, AI engine badge from `GenUiService.currentProvider()`, **Admin DB Console**, **Properties**, **AI Concierge**, the customer name, **Sign out**.
- Sidebar: Dashboard, Statements, Cards & PIN, Security & Password, Transfers, App Settings, then Admin Console and Property Manager.
- Main area: a toast from `BankingStateService.notification`, then `<router-outlet>`.
- The chat drawer is mounted once on the shell, so it stays open across routes.
- `/admin` uses an exact router match so `/admin/properties` does not highlight the database console.

Unknown paths under the shell redirect to `/dashboard`.

## Portal pages

| Route | What it is |
|---|---|
| `/login` | Sign-in. No shell. |
| `/dashboard` | Balances and chips that open the concierge. |
| `/statements` | Account activity. |
| `/cards` | Cards, freeze, PIN, limits. |
| `/security` | Password and factor status. |
| `/transfers` | Transfer form. |
| `/settings` | Renders the saved property tree and shows both JSON views. |
| `/admin/properties` | Designs that tree. |
| `/admin` | SQLite console: users, accounts, cards, transactions, audit, raw JSON. |

`BankingStateService` keeps signals for accounts, cards, and transactions, and refreshes them from the API. A widget can show numbers from the chat stream while a page still shows the last signal value until that page refreshes.

## Startup of the portal, step by step

1. `app.config.ts` calls `provideGenerativeUi` with the chat URL `http://localhost:5050/api/chat`.
2. `BankingGenUiInitService.init()` registers widget components and client tools into `GenUiRegistryService`.
3. The router hits `authGuard`, then the shell.
4. The shell reads the signed-in user for the name and initials.
5. Feature pages call `BankingStateService.refreshFromBackend`, which loads `/api/user-profile`, `/api/accounts`, `/api/cards`, and `/api/transactions?limit=40` in parallel.

## Dashboard, statements, cards, security, transfers

**Dashboard.** Shows the seeded accounts. Prompt chips open the concierge with a prepared sentence. They do not call the ledger by themselves.

**Statements.** Reads transactions for the selected account through the banking service. Changing the account reloads that account's rows.

**Cards.** Lists cards from the API. Freeze calls `POST /api/cards/{cardId}/freeze`. PIN reset calls `POST /api/cards/{cardId}/pin`. Limit changes call `POST /api/cards/{cardId}/limit`. Each successful mutation writes an `AiAuditLog` row and the service shows a toast.

**Security.** The password form calls `POST /api/security/password-reset`. The profile fields reflect the signed-in user after refresh. Two-factor and biometrics on this page are the profile flags stored on the user row.

**Transfers.** The form calls `POST /api/transfers` with the source account, recipient, amount, and note. The service checks funds, posts the ledger rows, and writes an audit entry. A failed balance check toasts that the transfer was not posted.

## Property system

Admins design a settings tree. The portal renders that tree. Two different JSON documents are stored on one SQLite row in `AppPropertyDocuments`:

| Column | Role |
|---|---|
| `Id` | Document id. The seed is `banking-preferences`. |
| `Name` | Display name. |
| `TreeJson` | The shape only: menus, labels, control types, choices, actions. No answers. |
| `ValuesJson` | Answers only, keyed by node id. |
| `UpdatedAt` | Last successful save. |

Node ids are unique inside one document. Menus, items, sub menus, and actions share one id space. `values` uses that id as the key, so a duplicate would make two controls share one answer. Save is rejected with `The id '...' is used more than once.` The document id is not a node id.

### Node rules

| Kind | Where it can sit | Stores an answer | Children |
|---|---|---|---|
| `menu` | Top of the tree only | No | Items and actions |
| `submenu` | Under an item | No | Items and actions |
| `item` | Under a menu or sub menu | Yes | Optional sub menus |
| `action` | Under a menu or sub menu | No | None |

Item types: `radio`, `checkbox`, `dropdown`, `text`, `toggle`, `number`. Radio and dropdown need at least one choice. Each choice needs a label and a value, and those values must be unique on that item. An action needs an `actionKey` with no spaces.

A menu cannot sit under another menu. A sub menu cannot sit directly under a menu. An item cannot sit directly under another item. The designer only offers the add buttons that match the selected parent. The API checks the same rules and returns 400 with a `message` when a save breaks them.

### Seeded tree

```text
Security                         menu
├── Two-factor method            item, radio, value "app"
├── Alerts                       item, toggle, value true
│   └── Alert channel            submenu
│       ├── Send alerts by       item, dropdown, value "push"
│       └── Also email me        item, checkbox, value true
└── Freeze card                  action, actionKey "freezeCard"
```

`ValuesJson` for that seed:

```json
{
  "two-factor": "app",
  "alerts": true,
  "channel": "push",
  "email-copy": true
}
```

### How a screen is built from the saved JSON

Walk `tree` from the top. `kind` chooses the control. `values[node.id]` is the current answer.

| Node | UI |
|---|---|
| `menu` or `submenu` | A heading, then its children |
| `item` + `radio` | One radio per `options` entry. The checked value is `values[id]` |
| `item` + `dropdown` | A select. The selected option is `values[id]` |
| `item` + `checkbox` or `toggle` | On when `values[id]` is `true` |
| `item` + `text` or `number` | An input filled with `values[id]` |
| `action` | A button. No value. It does not call the card or transfer API |

The selected-values JSON is a readout produced after that walk. It is not a second source for drawing controls. It has no `itemType`, no `options`, and no actions, so it cannot rebuild a radio versus a dropdown. Use it when another screen only needs the answers. For the seed it looks like this:

```json
{
  "Security": {
    "Two-factor method": "app",
    "Alerts": {
      "selected": true,
      "Alert channel": {
        "Send alerts by": "push",
        "Also email me": true
      }
    }
  }
}
```

`selected` appears only when an item also contains a sub menu. The item's own answer is `selected`. The nested group is the sub menu. Buttons such as Freeze card are omitted because they store no answer.

`property-form.component.ts` is the shared renderer. The property manager preview and the settings page both use it. A `groupPrefix` keeps radio groups from colliding when two copies are on one page.

### Property manager flow (`/admin/properties`)

The page loads `GET /api/admin/property-documents`, then `GET /api/admin/property-documents/{id}` for the first document. The editor, the tree, and the preview share one signal. Nothing is written until **Save shape and values**.

Minute steps:

1. The left column lists the legend: Menu is a group, Item is a setting, Sub menu is a group inside an item, Action is a button.
2. Click a row to select it. The middle column title becomes `Editing <name>`.
3. **Name people see** edits `label`. The preview heading or control label changes immediately.
4. **What is this?** changes `kind`, but only to a kind that parent allows. Switching an item to an action drops its children and its answer. Switching the other way creates a text item.
5. For an item, **How people answer** sets `itemType`. Radio and dropdown start with two choices if the item had none. The current answer resets to a default for the new type: `false` for checkbox and toggle, `0` for number, the first choice for radio and dropdown, empty text otherwise.
6. Choice rows: the left box is the words people see, the right box is the saved value. **Delete choice** is disabled when only one choice remains. **Add choice** appends `option-N`.
7. **Answer right now** is the same control the preview uses, bound to `values[id]`. Changing it in the preview or in the editor updates the same map.
8. **+ Add menu** always appends a menu at the root.
9. With a menu or sub menu selected, **+ Add item** and **+ Add action** insert under that row and select the new node.
10. With an item selected, **+ Add sub menu** inserts under that item.
11. An action cannot contain children. The add hint says so.
12. Every row has **Delete**. The middle column also has **Delete this menu**, **Delete this item**, **Delete this sub menu**, or **Delete this action**.
13. The first click asks **Delete now** or **Keep it**. Confirm removes that node and everything under it from the in-memory tree and drops their answers from `values`. The parent row becomes selected.
14. That removal is still local. Reload without saving brings the stored tree back.
15. **Save shape and values** trims the name, validates the tree, coerces every item answer to the right type, and `PUT`s `{ name, tree, values }` to `/api/admin/property-documents/{id}`.
16. The API normalizes the tree, drops answers for ids that are not items, checks types, writes both JSON columns, and adds an `AiAuditLog` row `PropertyDocumentSaved` with the signed-in username.
17. 400 returns `{ message }` and the page shows it. 404 means that document id is gone. A missing name is `The document needs a name.`
18. The response replaces the editor state, so labels are the trimmed server copy and empty child lists are omitted.

New node ids look like `menu-` plus eight hex characters from `crypto.randomUUID`. Hand-edited JSON must keep ids matching `^[A-Za-z0-9_-]+$` and at most 80 characters. Labels are required and at most 200 characters. The document name is required and at most 120 characters.

### App Settings flow (`/settings`)

1. The page loads the same first property document.
2. The left column renders the tree with the saved answers.
3. Changing a control updates a local `values` signal only.
4. **Selected values** on the right rebuilds immediately from the tree plus those local answers. It is the readout described above.
5. **Saved JSON** stays on the last loaded or last saved document: `id`, `name`, `tree`, `values`, `updatedAt`. It does not move while the person is still editing.
6. **Copy** writes that block to the clipboard.
7. **Save values** sends the unchanged tree and the coerced answers with `PUT`. On success, both JSON panels match the server, and a toast says `Settings saved.`
8. Action buttons show the stored `actionKey` and do not call banking operations.

There is one global document, not a copy per user. The tree is not the left navigation.

## Concierge flow

The drawer is `GenUiChatDrawerComponent` from `projects/generative-ui`. It can be dragged from the header, resized from the edges, cycled through Compact (390px), Standard (480px), and Wide (680px), docked, and maximized.

### One turn, step by step

1. The person types in the drawer, or a dashboard chip fills the box and sends.
2. `GenUiService` `POST`s `{ message, history }` to `http://localhost:5050/api/chat` with the bearer token.
3. `ChatController` sets `Content-Type: text/event-stream` and writes each event as `data: {json}\n\n`, then flushes.
4. `MultiProviderLlmService.StreamChatAsync` runs in this order:
   1. `provider_info` so the badge can show Cursor, Ollama, or Simulator.
   2. Guardrails on the lowercased message. A hit returns fixed text and stops. No model call and no widget.
   3. The configured provider streams prose.
   4. A C# keyword scan chooses at most one widget and often a `tool_call` before it.
   5. `done`.
5. The browser appends `delta` text, runs a `tool_call` if that name is registered, and mounts a `widget` by name.
6. Buttons inside the widget call REST through `BankingStateService`. They do not go back through the chat stream.

The model writes the sentences. It does not query SQLite and it does not choose the widget. If Ollama or Cursor fails, the stream emits `error` and stops. It does not silently switch to the mock script. Mock runs only when `Provider` is `Mock`, or when Gemini, OpenAI, or Claude is selected with an empty API key.

### Stream event types

| `type` | What the drawer does |
|---|---|
| `provider_info` | Sets the badge: `name`, `model`, `isLocal`, `isSimulated` |
| `delta` | Appends assistant text |
| `tool_call` | Runs a registered client tool |
| `widget` | Looks up `widget.name` and renders that component with `widget.props` as inputs |
| `error` | Shows the failure |
| `done` | Ends the turn |

`gen-ui-widget-outlet` renders with `ngComponentOutlet`. Input names on the component must match the `props` keys.

### Guardrails, before any model

Prohibited phrases (account delete or close, cash dispense, hack, ledger tampering, and similar) return a fixed refusal.

Out-of-scope phrases (flights, hotels, weather, recipes, coding, and similar) return a fixed refusal plus a menu of banking prompts. A spending question that also contains `statement`, `chart`, or `charge` is allowed through, so "flight charges on my statement" is treated as banking.

### Provider paths

| `LlmSettings.Provider` | What runs |
|---|---|
| `Cursor` | Cursor Cloud Agents at `Endpoint` (default `https://api.cursor.com`), model `ModelId` |
| `Ollama` | `POST {endpoint}/chat/completions`. A bare `http://localhost:11434` gets `/v1` appended |
| `Mock` | Canned replies. No network model call. Badge says Simulator |
| `LmStudio`, `Omlx` | OpenAI-compatible chat completions |
| `Gemini`, `OpenAI`, `Claude` | Same, with `Authorization: Bearer`. An empty key uses Mock instead |

The committed file uses `Provider: Cursor` and `ModelId: composer-2.5`. `ApiKey` in that file is empty on purpose.

**Cursor, minute steps**

1. Resolve the key from `LlmSettings:ApiKey`, then `CURSOR_API_KEY`.
2. Build one prompt: grounded system text, the last six history turns, and the new message. The prompt tells the agent to answer in plain chat text and not edit a repository.
3. The first message in this API process is `POST https://api.cursor.com/v1/agents` with no repository. The response has `agent.id` and `run.id`. The agent id stays in memory.
4. Later messages use `POST /v1/agents/{id}/runs`.
5. The API reads `GET /v1/agents/{id}/runs/{runId}/stream`.
6. Cursor `assistant` events become `delta` text. If none arrived, the final `result.text` is used. A Cursor `error` becomes a chat `error`.
7. The keyword widget builder runs after the text.

Restarting the API forgets the agent id. The next message creates a new agent. Follow-up runs are serialized so two chats do not hit `agent_busy` together.

**Ollama, minute steps.** The body sends `model`, the system prompt, history, `stream: true`, and a low temperature. Token chunks in `choices[0].delta.content` become `delta` events. Then the keyword builder runs.

### Which widget appears

`EmitEfCoreWidgetsForIntentAsync` scans the user text. The first match wins. Order: PIN reset, card controls, password reset, transfer, loan, currency, budget, chart, then statement.

| Example words | Widget | Where the numbers come from |
|---|---|---|
| `pin`, or card plus reset/change | `cardPinResetWidget` | SQLite cards. `credit` picks the credit card |
| `freeze`, `lock`, card plus limit/controls | `cardControlsWidget` | SQLite cards. Freeze is on unless the text says unfreeze or unlock |
| `password`, `2fa` | `passwordResetWidget` | Fixed demo email `a.vance@example.com` |
| `transfer`, `wire`, `send money` | `transferConfirmWidget` | Checking account from SQLite. Recipient and amount `$250` are the demo values |
| `loan`, `mortgage`, `emi` | `loanCalculatorWidget` | A number at least 1000 in the message, otherwise `$35,000`. Rate `6.45`, term `48` months |
| `convert`, `currency`, `forex` | `currencyExchangeWidget` | Starter `1000 USD` to `EUR`. Not a live rate feed |
| `budget`, `allowance`, `target` | `budgetAnalyticsWidget` | Category rows defined in the API |
| `chart`, `pie`, `bar`, `doughnut` | `chartWidget` | Debits on `acc-chk-01` grouped by category. Fallback categories if the ledger is empty |
| `statement`, `transaction`, `history` | `statementWidget` | Account `acc-chk-01` and up to 6 transactions |

A `tool_call` is often sent just before the widget (`fetchStatements`, `initiatePinReset`, `generateFinancialChart`, and others). Several client tools only echo arguments or read in-memory signals. The numbers on screen come from `widget.props`, which the API already filled.

### What a widget button writes

| Click | HTTP |
|---|---|
| PIN reset | `POST /api/cards/{cardId}/pin` |
| Freeze or unfreeze | `POST /api/cards/{cardId}/freeze` |
| Spending limit | `POST /api/cards/{cardId}/limit` |
| Password reset | `POST /api/security/password-reset` |
| Transfer authorize | `POST /api/transfers` |

`BankingService` updates SQLite and writes an `AiAuditLog` row for those mutations.

### Registered widgets and client tools

Widgets: `chartWidget`, `budgetAnalyticsWidget`, `loanCalculatorWidget`, `currencyExchangeWidget`, `statementWidget`, `cardPinResetWidget`, `cardControlsWidget`, `passwordResetWidget`, `transferConfirmWidget`, `subscriptionWidget`, `activityReviewWidget`, `disputeWidget`, `forecastWidget`, `goalPlannerWidget`, `travelNoticeWidget`, `allocationWidget`, `clarificationWidget`, `auditTimelineWidget`, `merchantInsightWidget`.

Client tools include `generateFinancialChart`, `fetchBudgetGoals`, `calculateLoanEstimate`, `getLiveExchangeRate`, `fetchStatements`, `toggleCardFreeze`, and `navigateToPage`.

### Drawer window, minute steps

1. Drag the header grip to move the panel. The position is clamped to the viewport.
2. Drag an edge or a corner to resize.
3. The size preset button cycles Compact, Standard, and Wide.
4. Dock returns the panel to the default bottom-right place.
5. Maximize stretches it to full height.

## Admin database console (`/admin`)

1. `GET /api/admin/overview` loads users, accounts, cards, transactions, and the latest audit rows. The ribbon shows round-trip latency.
2. **Users.** Select a card, reveal the stored password, open **Update Credentials**, edit fields, and `PUT /api/admin/users/{id}`. That writes `AdminUpdateUser`.
3. **Accounts.** Read-only ledger table.
4. **Cards.** Shows the stored PIN and a freeze toggle that calls the card freeze API, then reloads the overview.
5. **Transactions.** **Inject Test Transaction** `POST`s `/api/admin/transactions` and writes `AdminAddTransaction`.
6. **AI Audit Trail.** Renders `overview.auditLogs`.
7. **Raw SQLite JSON.** Pretty-prints the overview payload.
8. **Sync** reloads the overview. **Reset & Re-Seed DB** asks for confirmation, then `POST /api/admin/reset-db`, which deletes the SQLite file, runs `EnsureCreated`, and runs bootstrap again. The property seed comes back with the other seed rows.

## API catalog

All `/api` routes except login and LLM status require `Authorization: Bearer`.

| Method | Path | Role |
|---|---|---|
| `GET` | `/` | Process is up |
| `POST` | `/api/auth/login` | Create a session |
| `GET` | `/api/auth/me` | Current user |
| `POST` | `/api/auth/logout` | Revoke the token |
| `GET` | `/api/llm/status` | Configured provider, model, endpoint. Does not prove the last chat reached the model |
| `POST` | `/api/chat` | SSE concierge |
| `GET` | `/api/accounts` | Accounts |
| `GET` | `/api/accounts/{id}` | One account |
| `GET` | `/api/statements/{accountId}` | Statements, optional `limit` |
| `GET` | `/api/transactions` | Latest transactions, `limit` clamped to 1–100 |
| `GET` | `/api/cards` | Cards |
| `POST` | `/api/cards/{cardId}/pin` | Set PIN |
| `POST` | `/api/cards/{cardId}/freeze` | Freeze or unfreeze |
| `POST` | `/api/cards/{cardId}/limit` | Spending limit |
| `POST` | `/api/transfers` | Post a transfer |
| `POST` | `/api/security/password-reset` | Change password |
| `GET` | `/api/user-profile` | Signed-in profile |
| `PUT` | `/api/user-profile` | Update profile |
| `GET` | `/api/insights` | Insight feed |
| `GET` | `/api/audit-logs` | Recent audit rows |
| `POST` | `/api/disputes` | Open a dispute |
| `POST` | `/api/travel-notices` | Save a travel notice |
| `GET` | `/api/fx/rates` | Rate snapshot |
| `POST` | `/api/fx/lock` | Lock a quote |
| `GET` | `/api/admin/overview` | Admin console payload |
| `GET` | `/api/admin/users` | Users |
| `PUT` | `/api/admin/users/{id}` | Update a user |
| `POST` | `/api/admin/transactions` | Insert a test transaction |
| `POST` | `/api/admin/reset-db` | Wipe and reseed |
| `GET` | `/api/admin/property-documents` | Id, name, `updatedAt` |
| `GET` | `/api/admin/property-documents/{id}` | Tree and values |
| `PUT` | `/api/admin/property-documents/{id}` | Save tree and values |

`GET /api/llm/status` reports the configured provider. A turn reached the model only when the drawer shows model-written text and no `error`.

## Database tables

`EnsureCreated` plus bootstrap cover:

- Users, accounts, transactions, cards, audit logs
- Payees, budget targets, disputes, travel notices
- `AppPropertyDocuments`

Financial amounts on the EF model use `decimal` with precision 18, 2. Mutating banking operations add an `AiAuditLog` row in the same save as the change.

Seed customer: Alex Vance, username `alex.vance`, checking `acc-chk-01` / `CHK-98214-01`, plus savings and portfolio accounts, two cards, and a starter ledger.

## What owns what

The model owns the prose in the chat bubble, inside the system prompt's banking scope.

The application owns:

- Sign-in and the bearer session
- Refusing out-of-scope and prohibited requests with fixed text
- Choosing the widget and filling its props from SQLite or fixed demo values
- PIN, freeze, limit, password, and transfer writes
- The property tree, its validation, and both JSON columns
- The audit log
