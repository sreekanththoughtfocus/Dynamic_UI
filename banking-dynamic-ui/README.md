# Apex Banking Dynamic UI — Enterprise Generative UI Platform

A modern, production-grade reference architecture demonstrating **Generative UI / Dynamic UI and Agentic AI** for retail and commercial banking. Built with **Angular 22**, a reusable **Generative UI Common Library**, and an enterprise **.NET 10 Core Web API** powered by **Microsoft Semantic Kernel**.

---

## 🏛️ Architecture Overview

```
banking-dynamic-ui/
├── .cursorrules                        # Cursor AI coding standards & patterns
├── .cursor/rules/                      # Cursor MDC rules (Angular, .NET, Generative UI)
├── .agents/rules/                      # Antigravity agent coding standards
├── banking-portal/                     # Angular 22 Client Workspace
│   ├── projects/
│   │   └── generative-ui/             # Reusable Generative UI Shared Library
│   │       ├── src/lib/core/          # Protocol, types, injection tokens
│   │       ├── src/lib/services/      # GenUiService (SSE stream), GenUiRegistryService
│   │       ├── src/lib/components/    # GenUiChatDrawerComponent, GenUiWidgetOutletComponent
│   │       └── public-api.ts          # Public surface exported as 'generative-ui'
│   └── src/app/                       # Apex Premier Banking Portal Application
│       ├── core/                      # Banking state, models, and real EF Core sync
│       ├── features/                  # Lazy-loaded feature routes (Dashboard, Cards, Transfers, etc.)
│       └── generative-ui-setup/       # Banking Tools & Dynamic Generative Widgets
│
└── banking-api/                        # .NET 10 Core Web API Backend
    ├── Data/
    │   └── BankingDbContext.cs        # Entity Framework Core 10 (SQLite + Audit Logging)
    ├── Models/                         # Domain models, BankAccount, BankCard, AiAuditLog
    ├── Services/
    │   ├── BankingService.cs          # EF Core async ledger operations
    │   ├── MultiProviderLlmService.cs # Live Ollama LLM streaming & EF Core widget emitter
    │   └── SemanticKernelService.cs   # Microsoft Semantic Kernel integration
    ├── banking.db                      # SQLite database file (auto-migrated & seeded)
    ├── appsettings.json                # Configured for Ollama (nemotron-3.5-lightning:30b)
    └── Program.cs                      # Minimal Web API with SSE streaming & async endpoints
```

---

## 🚀 Key Features

### 1. Reusable Generative UI Library (`generative-ui`)
- **Common Shareable Library**: Extracted as a standalone Angular library (`projects/generative-ui`) that can be consumed by any Angular application or microfrontend.
- **Dynamic Component Mounting**: Uses Angular's `NgComponentOutlet` to streamingly instantiate rich Angular components directly inside conversational chat messages.
- **Client-Side Tool Calling**: LLM commands execute real browser-side tools (e.g., store mutations, router navigation, form autofill).
- **Floating AI Drawer**: Sleek, glassmorphic dark-fintech assistant panel with model indicator badges and prompt chips.

### 2. Multi-LLM Provider Support (Config-Driven)
Easily toggle between local and cloud LLMs in `banking-api/appsettings.json`:

| Provider | Type | Default Endpoint | Supported Models |
|---|---|---|---|
| **`Mock`** | Zero-Config Simulation | N/A | Works instantly out-of-the-box with zero keys |
| **`Ollama`** | Local LLM | `http://localhost:11434/v1` | `llama3.2`, `mistral`, `qwen2.5`, `deepseek-r1` |
| **`LmStudio`** | Local LLM | `http://localhost:1234/v1` | Any local GGUF model |
| **`Omlx`** | Local MLX (Apple Silicon) | `http://localhost:8000/v1` | MLX-quantized models |
| **`Gemini`** | Google Cloud | Google OpenAI-compatible | `gemini-2.5-flash`, `gemini-1.5-pro` |
| **`OpenAI`** | OpenAI Cloud | `https://api.openai.com/v1` | `gpt-4o`, `gpt-4o-mini` |
| **`Claude`** | Anthropic Cloud | Cloud endpoint | `claude-3-5-sonnet-20241022` |

---

## 🛠️ How to Run

### Step 1: Start the .NET Core Backend API
```bash
cd banking-dynamic-ui/banking-api
dotnet run  ("%USERPROFILE%\.dotnet\dotnet.exe" run)
```
*The backend starts at `http://localhost:5050`.*

### Step 2: Start the Angular Banking Portal
In a new terminal:
```bash
cd banking-dynamic-ui/banking-portal
npm start
```
*The Angular frontend opens at `http://localhost:4200`.*

---

## 🎯 Demoing to the Client

Open your browser at `http://localhost:4200/` and click the **"AI Concierge"** button or use the quick chips on the Dashboard:

1. **Account Statement Explorer**:
   - Ask: *"Show my recent checking account statement"*
   - **What happens**: The AI executes the `fetchStatements` client tool and dynamically mounts the `StatementWidgetComponent` inline with search, category filtering, and PDF export!

2. **Credit / Debit Card PIN Reset**:
   - Ask: *"I want to reset the PIN for my Debit Card"*
   - **What happens**: The AI executes `initiatePinReset` and renders the interactive `CardPinResetWidgetComponent` where the client can enter a new 4-digit PIN and submit with 2FA OTP verification.

3. **Card Freeze & Spending Limits**:
   - Ask: *"Temporarily freeze my Platinum Credit Card"*
   - **What happens**: The AI renders `CardControlsWidgetComponent` with an interactive freeze switch and real-time limit slider.

4. **Online Banking Password Reset**:
   - Ask: *"Help me reset my online banking password"*
   - **What happens**: The AI renders `PasswordResetWidgetComponent` with a live password strength meter.

5. **Instant Wire / Fund Transfer**:
   - Ask: *"Transfer $250 to emergency savings"*
   - **What happens**: The AI renders `TransferConfirmWidgetComponent` with an instant authorization button that updates the checking account ledger in real time.

---

## 🪟 Resizable & Movable AI Assistant Window
The AI Concierge panel now supports desktop-grade window management:
- **Movable / Draggable**: Click and drag the header title bar (`⠿`) to freely move the assistant anywhere across the viewport. Boundaries are automatically clamped.
- **Resizable**: Drag from any edge (left, top, right, bottom) or corner handle (including the bottom-right corner grip `◢`).
- **Quick Size Presets**: Click the size preset button in the header to cycle between **Compact** (390px), **Standard** (480px), and **Wide** (680px).
- **Dock / Restore**: A 📌 **Dock** button resets the window back to the default bottom-right position, and the ⤢ **Maximize** button expands it to full height.

---

## 🛠️ Admin DB Console (`/admin`)
An enterprise administrative console is built into the application (accessible via the **"🛠️ Admin DB Console"** button in the top navigation or sidebar):
1. **User Credentials & Password Explorer**:
   - Inspect all user details saved in the database: Username, Full Name, Email, Phone, Address, 2FA status, and **current passwords** (with an eye reveal toggle).
   - "Edit User & Password" modal to directly test updating credentials in SQLite.
2. **Bank Accounts & Balances Ledger**:
   - Monitor real-time balances and available balances across Premier Checking, Savings, and Investment accounts.
3. **Cards & Stored PINs**:
   - View card details, spending thresholds, and **stored ATM/POS PIN numbers**.
4. **Transaction Ledger & Test Injector**:
   - View posted transactions and inject custom test transactions into EF Core.
5. **AI Audit Trail**:
   - Real-time audit log of all operations performed by the AI Agent or the user.
6. **Live Latency & Raw JSON Viewer**:
   - Measures database round-trip query latency and displays the complete raw SQLite JSON payload.

