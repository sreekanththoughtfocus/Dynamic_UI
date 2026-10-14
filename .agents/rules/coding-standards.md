# Antigravity Rules: Enterprise Generative UI & Clean Architecture

## 1. Project Standards
- **Angular 22 Frontend:**
  - Standalone components (no `standalone: true` needed in Angular 22).
  - Explicit `ChangeDetectionStrategy.OnPush` on all components.
  - Angular Signals (`signal`, `computed`, `effect`) for reactive state.
  - Native control flow (`@if`, `@for`, `@switch`).
  - No use of legacy `*ngIf`, `*ngFor` or `CommonModule`.
  - Reusable, decoupled Generative UI library in `projects/generative-ui`.
  - Strict WCAG 2.1 AA accessibility, visible focus indicators, screen reader labels.

- **.NET 10 & Entity Framework Core Backend:**
  - C# 13 clean architecture with scoped dependency injection.
  - SQLite database managed via Entity Framework Core (`BankingDbContext`).
  - All DB queries and operations must be async (`ToListAsync`, `FirstOrDefaultAsync`, `SaveChangesAsync`).
  - Read-only operations must use `.AsNoTracking()`.
  - Precision of financial currencies strictly configured with `.HasPrecision(18, 2)`.
  - Every mutating action (card freeze, PIN reset, money transfer) must create an immutable `AiAuditLog` entry in SQLite.

- **LLM Streaming & Integration:**
  - Standard Server-Sent Events (SSE) with typed stream frames: `provider_info`, `delta`, `tool_call`, `widget`, `done`.
  - First-class support for local Ollama via OpenAI-compatible endpoints (`http://localhost:11434/v1`).
  - Configurable providers in `appsettings.json` (Ollama, LM Studio, OMLX, Gemini, Claude, OpenAI).
  - Resilient streaming with graceful error handling and status notifications.
