# AI workflow: “set my PIN”

This is a step-by-step walkthrough of one chat request. The example is:

> I want to set my PIN

The same path runs for “reset the PIN for my Debit Card”. The word `pin` is what selects the PIN widget.

Two systems share the turn:

- **Cursor** writes the chat sentences.
- **This application** decides the widget, loads the card from SQLite, and saves the new PIN when you submit the form.

The model never reads the card table and never writes the PIN.

## Actors

| Piece | Where | Job on this request |
|---|---|---|
| AI Concierge drawer | Angular `GenUiService` | Sends the message and paints the stream |
| Banking API | `POST /api/chat` | Streams events back to the browser |
| Guardrails | `MultiProviderLlmService` | Lets a PIN request through |
| Cursor Cloud Agent | `https://api.cursor.com` | Writes the assistant text |
| Widget picker | `EmitEfCoreWidgetsForIntentAsync` | Sees `pin` and loads the debit card |
| PIN widget | `CardPinResetWidgetComponent` | Form in the chat bubble |
| Ledger | `POST /api/cards/{id}/pin` | Stores the PIN and an audit row |

Provider in `appsettings.json` is `Cursor`, model `composer-2.5`. The API key comes from `appsettings.Local.json` or `CURSOR_API_KEY`. It is not sent to the browser.

## End-to-end picture

```text
You: "I want to set my PIN"
        │
        ▼
Browser  POST http://localhost:5050/api/chat
        │
        ▼
API guardrails  (PIN is allowed)
        │
        ▼
Cursor agent  (streams the reply text only)
        │
        ▼
API keyword check  message contains "pin"
        │
        ├─ read debit card from SQLite
        ├─ SSE tool_call  initiatePinReset
        └─ SSE widget     cardPinResetWidget + card props
        │
        ▼
Browser shows the text, then the PIN form
        │
        ▼
You type a 4-digit PIN and confirm
        │
        ▼
Browser  POST /api/cards/{cardId}/pin
        │
        ▼
SQLite updates Cards.Pin and inserts AiAuditLog
```

## Step 1. You send the message

The drawer calls `GenUiService`. That method posts JSON to `http://localhost:5050/api/chat`:

```json
{
  "message": "I want to set my PIN",
  "history": [],
  "availableTools": [],
  "availableWidgets": []
}
```

`history` is earlier bubbles in this drawer session. `availableTools` and `availableWidgets` are the names registered in Angular. The API does not use those lists to decide the PIN widget. It uses its own keyword rules.

The browser keeps the HTTP connection open and reads Server-Sent Events. Each line looks like:

```text
data: {"type":"..."}

```

## Step 2. The API announces who is answering

`MultiProviderLlmService.StreamChatAsync` always emits this first:

```json
{
  "type": "provider_info",
  "providerInfo": {
    "name": "Cursor Cloud (composer-2.5)",
    "model": "composer-2.5",
    "isLocal": false,
    "isSimulated": false
  }
}
```

The drawer badge updates from that event. The badge means “this is the configured provider”. It does not mean Cursor has answered yet.

## Step 3. Guardrails run in C#, before Cursor

The message is lowercased to `i want to set my pin`.

- It is not a prohibited action (close account, dispense cash, hack the ledger).
- It is not out of scope (flights, weather, code).

The request continues. A message such as “book a flight” would stop here with a fixed refusal and would never call Cursor.

## Step 4. The API connects to Cursor

`CursorCloudAgentsClient` builds one text prompt:

1. The banking system prompt (statements, charts, PIN, transfers, and the rule to refuse non-banking work).
2. An extra line: reply in plain chat text, do not edit a repository.
3. Up to six earlier turns, when `history` is not empty.
4. `user: I want to set my PIN`.

Then it calls Cursor with the key from `appsettings.Local.json`:

| Call | When |
|---|---|
| `POST https://api.cursor.com/v1/agents` | First message after the API process started. Body has the prompt and `model.id` = `composer-2.5`. No git repository is attached. |
| `POST /v1/agents/{agentId}/runs` | Every later message in the same API process. |
| `GET /v1/agents/{agentId}/runs/{runId}/stream` | Immediately after create. This is Cursor’s event stream. |

Cursor’s `assistant` text chunks are copied into banking SSE events:

```json
{ "type": "delta", "content": "I can help you reset " }
{ "type": "delta", "content": "the PIN on your debit card." }
```

`GenUiService` appends each `delta` onto the assistant bubble, so the sentence appears as it arrives.

If the key is missing, the model name is rejected, or Cursor returns an HTTP error, the API emits `type: "error"` and stops. It does not invent a PIN form from the Mock scripts.

The Cursor reply is only text. Cursor is not asked to return the card number, and it is not asked to update the database.

## Step 5. The API chooses the PIN widget

After the Cursor stream ends, `EmitEfCoreWidgetsForIntentAsync` scans the original message.

```text
\bpin\b   matches "pin" in "set my pin"
```

That sets `isPinReset`. This check is first, before chart, statement, and transfer, so a sentence that mentions both “pin” and “statement” still opens the PIN widget.

Card choice:

- The message contains `credit` → first **Credit** card.
- Otherwise → first **Debit** card.
- If that type is missing → the first card in the table.

“I want to set my PIN” has no `credit`, so the debit card is loaded with `GetCardsAsync()` from SQLite.

The API then emits two events.

**Tool call** (the browser tries to run a client function):

```json
{
  "type": "tool_call",
  "toolCall": {
    "name": "initiatePinReset",
    "args": { "cardId": "card-deb-02", "cardType": "Debit" }
  }
}
```

`initiatePinReset` is not registered in `BankingGenUiInitService`. `GenUiRegistryService.executeTool` returns `Tool "initiatePinReset" is not registered on client.` The drawer can show that tool status. The PIN form does not depend on this tool. The next event creates the form.

**Widget** (this is what you see):

```json
{
  "type": "widget",
  "widget": {
    "name": "cardPinResetWidget",
    "title": "Secure PIN Reset - Debit Card",
    "props": {
      "cardId": "card-deb-02",
      "cardName": "Apex Premier Debit Platinum",
      "cardNumberMasked": "•••• •••• •••• 3419",
      "cardType": "Debit",
      "isFrozen": false
    }
  }
}
```

Those `props` are columns from the `Cards` table. They are not copied out of the Cursor sentence.

The stream ends with:

```json
{ "type": "done" }
```

## Step 6. The browser mounts the form

`gen-ui-widget-outlet` finds `cardPinResetWidget` in the registry. That name maps to `CardPinResetWidgetComponent`. Angular binds `props` onto the component inputs: `cardId`, `cardName`, `cardNumberMasked`, `cardType`, `isFrozen`.

The form shows that card. The one-time code field is prefilled with the demo value `849201`. That code is checked only in the browser (it must be at least 4 characters). It is not sent to the API.

## Step 7. You submit the new PIN

`onConfirmReset` checks:

- PIN is exactly 4 digits
- confirmation matches
- the demo code is at least 4 characters

Then `BankingStateService.resetCardPin` calls:

```http
POST http://localhost:5050/api/cards/card-deb-02/pin
Content-Type: application/json

{ "cardId": "card-deb-02", "newPin": "1234" }
```

This is a normal REST call. It does not go through `/api/chat` and it does not call Cursor again.

`BankingService.ResetCardPinAsync`:

1. Loads the card by id.
2. Sets `Cards.Pin` to the new value.
3. Inserts an `AiAuditLog` row: action `ResetCardPin`, details include the card name.
4. `SaveChangesAsync()` writes both rows to `banking.db`.

The widget sets a success state. The service also shows a toast. The admin page can show the audit row from `GET /api/audit-logs`.

## What Cursor did and did not do

| Step | Cursor | This app |
|---|---|---|
| Understand that you want a PIN change in prose | Yes | Guardrails only block non-banking text |
| Pick `cardPinResetWidget` | No | Keyword `pin` |
| Choose debit vs credit | No | Word `credit`, otherwise debit |
| Fill card name and masked number | No | SQLite `Cards` |
| Validate 4 digits and matching confirm | No | Widget in the browser |
| Save the PIN | No | `POST /api/cards/{id}/pin` |
| Audit the change | No | `AiAuditLog` |

## Same shape for other requests

Every banking prompt follows steps 1–4 (browser → guardrails → Cursor text). Step 5 swaps the keyword and the widget.

| You say | Keyword | Widget | Saved by |
|---|---|---|---|
| Set my PIN | `pin` | `cardPinResetWidget` | `POST /api/cards/{id}/pin` |
| Freeze my credit card | `freeze` | `cardControlsWidget` | `POST /api/cards/{id}/freeze` |
| Show my statement | `statement` | `statementWidget` | Read only |
| Transfer $250 to savings | `transfer` | `transferConfirmWidget` | `POST /api/transfers` when you authorize |

Switch `LlmSettings:Provider` to `Mock` and the PIN form still appears. The sentences come from fixed C# text instead of Cursor. Switch it to `Ollama` and the sentences come from the local model. The widget, the card query, and the PIN save stay on this API.
