using BankingApi.Services;

namespace BankingApi.Auth;

/// <summary>
/// Requires a signed-in session for /api routes, except login and the public LLM status check.
/// </summary>
public sealed class SessionAuthMiddleware
{
    private readonly RequestDelegate _next;

    public SessionAuthMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, AuthSessionStore sessions)
    {
        if (HttpMethods.IsOptions(context.Request.Method))
        {
            await _next(context);
            return;
        }

        var path = context.Request.Path.Value ?? string.Empty;
        var requiresAuth = path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase)
            && !path.Equals("/api/auth/login", StringComparison.OrdinalIgnoreCase)
            && !path.Equals("/api/llm/status", StringComparison.OrdinalIgnoreCase);

        if (!requiresAuth)
        {
            await _next(context);
            return;
        }

        var token = BearerTokens.Read(context);
        var session = token == null ? null : sessions.Get(token);
        if (session == null)
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsJsonAsync(new { message = "Sign in required." });
            return;
        }

        context.Items["UserId"] = session.UserId;
        context.Items["Username"] = session.Username;
        await _next(context);
    }
}
