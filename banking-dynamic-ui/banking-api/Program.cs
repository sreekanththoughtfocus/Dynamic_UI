using System.Text.Json;
using BankingApi.Data;
using BankingApi.Models;
using BankingApi.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true);

// Configuration
builder.Services.Configure<LlmSettings>(builder.Configuration.GetSection("LlmSettings"));

// Database: SQLite with Entity Framework Core
var connectionString = builder.Configuration.GetConnectionString("BankingDb") ?? "Data Source=banking.db";
builder.Services.AddDbContext<BankingDbContext>(options =>
    options.UseSqlite(connectionString));

// Services
builder.Services.AddScoped<IBankingService, BankingService>();
builder.Services.AddSingleton<AuthSessionStore>();
builder.Services.AddHttpClient();
builder.Services.AddHttpClient(nameof(CursorCloudAgentsClient), client =>
{
    client.Timeout = TimeSpan.FromMinutes(10);
});
builder.Services.AddSingleton<CursorCloudAgentsClient>();
builder.Services.AddScoped<ILlmService, MultiProviderLlmService>();
builder.Services.AddScoped<ISemanticKernelService, SemanticKernelService>();

// CORS policy for Angular front-end
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAngularApp", policy =>
    {
        policy.WithOrigins("http://localhost:4200", "http://127.0.0.1:4200")
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

var app = builder.Build();

// Ensure SQLite database & seed data are initialized
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<BankingDbContext>();
    await db.Database.EnsureCreatedAsync();
}

app.UseCors("AllowAngularApp");

app.Use(async (context, next) =>
{
    if (HttpMethods.IsOptions(context.Request.Method))
    {
        await next();
        return;
    }

    var path = context.Request.Path.Value ?? string.Empty;
    var requiresAuth = path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase)
        && !path.Equals("/api/auth/login", StringComparison.OrdinalIgnoreCase)
        && !path.Equals("/api/llm/status", StringComparison.OrdinalIgnoreCase);

    if (!requiresAuth)
    {
        await next();
        return;
    }

    var sessions = context.RequestServices.GetRequiredService<AuthSessionStore>();
    var token = ReadBearer(context);
    var session = token == null ? null : sessions.Get(token);
    if (session == null)
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        await context.Response.WriteAsJsonAsync(new { message = "Sign in required." });
        return;
    }

    context.Items["UserId"] = session.UserId;
    context.Items["Username"] = session.Username;
    await next();
});

app.MapPost("/api/auth/login", async (LoginRequest request, IBankingService banking, AuthSessionStore sessions) =>
{
    var username = request.Username?.Trim() ?? string.Empty;
    var password = request.Password ?? string.Empty;
    if (username.Length == 0 || password.Length == 0)
    {
        return Results.BadRequest(new { message = "Enter your username and password." });
    }

    var user = await banking.AuthenticateAsync(username, password);
    if (user == null)
    {
        var safeName = username.Length > 64 ? username[..64] : username;
        await banking.RecordAuditAsync("UserLoginFailed", "Anonymous", $"Rejected sign-in attempt for '{safeName}'");
        return Results.Json(
            new { message = "The username or password is incorrect." },
            statusCode: StatusCodes.Status401Unauthorized);
    }

    var session = sessions.Create(user.Id, user.Username);
    return Results.Ok(new LoginResponse
    {
        Token = session.Token,
        ExpiresAt = session.ExpiresAt,
        User = PublicUserProfile.From(user)
    });
});

app.MapGet("/api/auth/me", async (HttpContext context, IBankingService banking) =>
{
    var userId = context.Items["UserId"] as string;
    if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();

    var profile = await banking.GetUserByIdAsync(userId);
    return profile == null ? Results.Unauthorized() : Results.Ok(PublicUserProfile.From(profile));
});

app.MapPost("/api/auth/logout", async (HttpContext context, IBankingService banking, AuthSessionStore sessions) =>
{
    var token = ReadBearer(context);
    var username = context.Items["Username"] as string ?? "User";
    if (!string.IsNullOrEmpty(token))
    {
        sessions.Revoke(token);
    }

    await banking.RecordAuditAsync("UserLogout", username, "Online banking session ended");
    return Results.Ok(new { success = true });
});

// Health check / Status
app.MapGet("/", () => Results.Ok(new
{
    service = "Apex Banking Dynamic UI API",
    status = "Active",
    orm = "Entity Framework Core 10 (SQLite)",
    timestamp = DateTime.UtcNow
}));

// LLM Status Endpoint
app.MapGet("/api/llm/status", (ILlmService llmService, IConfiguration config) =>
{
    var current = llmService.GetCurrentProviderInfo();
    var settings = config.GetSection("LlmSettings").Get<LlmSettings>() ?? new LlmSettings();
    return Results.Ok(new
    {
        provider = current.Name,
        model = current.Model,
        isLocal = current.IsLocal,
        endpoint = settings.Endpoint,
        database = "Entity Framework Core (banking.db)",
        availableProviders = new[]
        {
            new { id = "Ollama", name = "Ollama Local LLM", description = "http://localhost:11434/v1 (llama3.2, etc.)" },
            new { id = "Cursor", name = "Cursor Cloud Agents API", description = "https://api.cursor.com (Bearer API key)" },
            new { id = "Mock", name = "Zero-Config Simulation (Instant POC)", description = "Built-in intelligent domain generator" },
            new { id = "LmStudio", name = "LM Studio Local", description = "http://localhost:1234/v1" },
            new { id = "Omlx", name = "OMLX / MLX Engine", description = "http://localhost:8000/v1 (Apple Silicon optimized)" },
            new { id = "Gemini", name = "Google Gemini 2.5", description = "Cloud API via API key" },
            new { id = "OpenAI", name = "OpenAI GPT-4o", description = "Cloud API via API key" },
            new { id = "Claude", name = "Anthropic Claude 3.5", description = "Cloud API via API key" }
        }
    });
});

// SSE Streaming Chat Endpoint
app.MapPost("/api/chat", async (HttpContext context, ChatRequest request, ILlmService llmService, CancellationToken ct) =>
{
    context.Response.Headers.Append("Content-Type", "text/event-stream");
    context.Response.Headers.Append("Cache-Control", "no-cache");
    context.Response.Headers.Append("Connection", "keep-alive");

    var stream = llmService.StreamChatAsync(request, ct);

    await foreach (var evt in stream.WithCancellation(ct))
    {
        var json = JsonSerializer.Serialize(evt);
        await context.Response.WriteAsync($"data: {json}\n\n", ct);
        await context.Response.Body.FlushAsync(ct);
    }
});

// Banking REST Endpoints (Powered by EF Core Async)
app.MapGet("/api/accounts", async (IBankingService banking) => Results.Ok(await banking.GetAccountsAsync()));

app.MapGet("/api/accounts/{id}", async (string id, IBankingService banking) =>
{
    var account = await banking.GetAccountAsync(id);
    return account != null ? Results.Ok(account) : Results.NotFound();
});

app.MapGet("/api/statements/{accountId}", async (string accountId, int? limit, IBankingService banking) =>
{
    var statements = await banking.GetStatementsAsync(accountId, limit ?? 10);
    return Results.Ok(statements);
});

app.MapGet("/api/cards", async (IBankingService banking) => Results.Ok(await banking.GetCardsAsync()));

app.MapPost("/api/cards/{cardId}/pin", async (string cardId, ResetPinRequest req, IBankingService banking) =>
{
    var success = await banking.ResetCardPinAsync(cardId, req.NewPin);
    return Results.Ok(new { success, message = success ? "PIN updated successfully in core banking." : "Card not found." });
});

app.MapPost("/api/cards/{cardId}/freeze", async (string cardId, FreezeCardRequest req, IBankingService banking) =>
{
    var success = await banking.SetCardFreezeAsync(cardId, req.Freeze);
    return Results.Ok(new { success, isFrozen = req.Freeze, message = $"Card {(req.Freeze ? "frozen" : "unfrozen")} successfully." });
});

app.MapPost("/api/security/password-reset", async (HttpContext context, ResetPasswordRequest req, IBankingService banking) =>
{
    var userId = context.Items["UserId"] as string;
    var success = await banking.ResetPasswordAsync(req.NewPassword, "UserPortal", userId);
    return success
        ? Results.Ok(new { success, message = "Security credentials updated." })
        : Results.BadRequest(new { success = false, message = "Password could not be updated." });
});

app.MapPost("/api/transfers", async (TransferFundsRequest req, IBankingService banking) =>
{
    var success = await banking.TransferFundsAsync(req.FromAccountId, req.ToAccountOrRecipient, req.Amount, req.Note);
    return success
        ? Results.Ok(new { success = true, message = $"Successfully transferred ${req.Amount:F2} to {req.ToAccountOrRecipient}." })
        : Results.BadRequest(new { success = false, message = "Insufficient funds or invalid account." });
});

app.MapGet("/api/audit-logs", async (IBankingService banking) => Results.Ok(await banking.GetAuditLogsAsync()));

// User Management & Profile
app.MapGet("/api/user-profile", async (HttpContext context, IBankingService banking) =>
{
    var userId = context.Items["UserId"] as string;
    if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();

    var profile = await banking.GetUserByIdAsync(userId);
    return profile != null ? Results.Ok(PublicUserProfile.From(profile)) : Results.NotFound();
});

app.MapPut("/api/user-profile", async (UserAccount user, IBankingService banking) =>
{
    var success = await banking.UpdateUserAsync(user, "UserPortal");
    return success ? Results.Ok(new { success = true, user }) : Results.NotFound();
});

// Admin Validation & Database Inspector Endpoints
app.MapGet("/api/admin/users", async (IBankingService banking) => Results.Ok(await banking.GetAllUsersAsync()));

app.MapPut("/api/admin/users/{id}", async (string id, UserAccount user, IBankingService banking) =>
{
    user.Id = id;
    var success = await banking.UpdateUserAsync(user, "AdminConsole");
    return success ? Results.Ok(new { success = true, user }) : Results.NotFound();
});

app.MapGet("/api/admin/overview", async (IBankingService banking) => Results.Ok(await banking.GetDatabaseOverviewAsync()));

app.MapPost("/api/admin/reset-db", async (IBankingService banking) =>
{
    await banking.ResetDatabaseAsync();
    return Results.Ok(new { success = true, message = "Database wiped and re-seeded with initial records." });
});

app.MapPost("/api/admin/transactions", async (BankTransaction tx, IBankingService banking) =>
{
    var created = await banking.AddTransactionAsync(tx, "AdminConsole");
    return Results.Ok(created);
});

static string? ReadBearer(HttpContext context)
{
    var header = context.Request.Headers.Authorization.ToString();
    const string prefix = "Bearer ";
    if (!header.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return null;

    var token = header[prefix.Length..].Trim();
    return token.Length == 0 ? null : token;
}

app.Run();
