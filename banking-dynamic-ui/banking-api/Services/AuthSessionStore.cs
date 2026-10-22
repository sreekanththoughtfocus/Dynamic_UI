using System.Collections.Concurrent;
using System.Security.Cryptography;

namespace BankingApi.Services;

public sealed class AuthSession
{
    public required string Token { get; init; }
    public required string UserId { get; init; }
    public required string Username { get; init; }
    public DateTime ExpiresAt { get; init; }
}

public sealed class AuthSessionStore
{
    private static readonly TimeSpan Lifetime = TimeSpan.FromHours(8);
    private readonly ConcurrentDictionary<string, AuthSession> _sessions = new();

    public AuthSession Create(string userId, string username)
    {
        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        var session = new AuthSession
        {
            Token = token,
            UserId = userId,
            Username = username,
            ExpiresAt = DateTime.UtcNow.Add(Lifetime)
        };
        _sessions[token] = session;
        return session;
    }

    public AuthSession? Get(string token)
    {
        if (!_sessions.TryGetValue(token, out var session))
        {
            return null;
        }

        if (session.ExpiresAt <= DateTime.UtcNow)
        {
            _sessions.TryRemove(token, out _);
            return null;
        }

        return session;
    }

    public void Revoke(string token)
    {
        _sessions.TryRemove(token, out _);
    }
}
