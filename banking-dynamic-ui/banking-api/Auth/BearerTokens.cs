namespace BankingApi.Auth;

public static class BearerTokens
{
    public static string? Read(HttpContext context)
    {
        var header = context.Request.Headers.Authorization.ToString();
        const string prefix = "Bearer ";
        if (!header.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return null;

        var token = header[prefix.Length..].Trim();
        return token.Length == 0 ? null : token;
    }
}
