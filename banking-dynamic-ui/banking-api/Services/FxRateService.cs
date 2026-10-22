using System.Globalization;
using System.Text.Json;
using BankingApi.Data;
using BankingApi.Models;

namespace BankingApi.Services;

public sealed record FxTable(DateOnly AsOf, string Source, IReadOnlyDictionary<string, decimal> PerUsd);

public sealed record FxQuote(string From, string To, decimal Amount, decimal Rate, decimal Converted, DateOnly AsOf, string Source);

public interface IFxRateService
{
    Task<FxTable> GetTableAsync(CancellationToken cancellationToken = default);
    Task<FxQuote> QuoteAsync(string from, string to, decimal amount, CancellationToken cancellationToken = default);
    Task<FxQuote> LockAsync(string from, string to, decimal amount, CancellationToken cancellationToken = default);
}

public sealed class FxRateService : IFxRateService
{
    private static readonly string[] Codes = ["EUR", "GBP", "CHF", "CAD", "AUD", "JPY", "SGD"];
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<FxRateService> _logger;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private FxTable? _cached;
    private DateTime _cachedAt = DateTime.MinValue;

    public FxRateService(IHttpClientFactory httpClientFactory, IServiceScopeFactory scopes, ILogger<FxRateService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _scopes = scopes;
        _logger = logger;
    }

    public async Task<FxTable> GetTableAsync(CancellationToken cancellationToken = default)
    {
        if (_cached != null && DateTime.UtcNow - _cachedAt < TimeSpan.FromMinutes(10))
        {
            return _cached;
        }

        await _gate.WaitAsync(cancellationToken);
        try
        {
            if (_cached != null && DateTime.UtcNow - _cachedAt < TimeSpan.FromMinutes(10))
            {
                return _cached;
            }

            _cached = await LoadFrankfurterAsync(cancellationToken)
                ?? await LoadOpenErApiAsync(cancellationToken)
                ?? throw new InvalidOperationException("Live FX providers did not return a rate table.");
            _cachedAt = DateTime.UtcNow;
            return _cached;
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<FxQuote> QuoteAsync(string from, string to, decimal amount, CancellationToken cancellationToken = default)
    {
        var table = await GetTableAsync(cancellationToken);
        var fromCode = from.Trim().ToUpperInvariant();
        var toCode = to.Trim().ToUpperInvariant();
        if (!table.PerUsd.TryGetValue(fromCode, out var fromPerUsd) || fromPerUsd <= 0)
        {
            throw new InvalidOperationException($"No live rate for {fromCode}.");
        }

        if (!table.PerUsd.TryGetValue(toCode, out var toPerUsd) || toPerUsd <= 0)
        {
            throw new InvalidOperationException($"No live rate for {toCode}.");
        }

        var rate = Math.Round(toPerUsd / fromPerUsd, 6);
        var converted = Math.Round(amount * rate, 2);
        return new FxQuote(fromCode, toCode, amount, rate, converted, table.AsOf, table.Source);
    }

    public async Task<FxQuote> LockAsync(string from, string to, decimal amount, CancellationToken cancellationToken = default)
    {
        var quote = await QuoteAsync(from, to, amount, cancellationToken);
        using var scope = _scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BankingDbContext>();
        db.AuditLogs.Add(new AiAuditLog
        {
            Action = "FxRateLock",
            Initiator = "AI_Agent",
            Details = $"Locked {quote.Amount.ToString("0.##", CultureInfo.InvariantCulture)} {quote.From} -> {quote.Converted.ToString("0.00", CultureInfo.InvariantCulture)} {quote.To} at {quote.Rate.ToString("0.######", CultureInfo.InvariantCulture)} ({quote.Source}, {quote.AsOf:yyyy-MM-dd})."
        });
        await db.SaveChangesAsync(cancellationToken);
        return quote;
    }

    private async Task<FxTable?> LoadFrankfurterAsync(CancellationToken cancellationToken)
    {
        var url = "https://api.frankfurter.app/latest?from=USD&to=" + string.Join(',', Codes);
        return await LoadAsync(url, "ECB via Frankfurter", ParseFrankfurter, cancellationToken);
    }

    private async Task<FxTable?> LoadOpenErApiAsync(CancellationToken cancellationToken)
    {
        return await LoadAsync("https://open.er-api.com/v6/latest/USD", "ExchangeRate-API", ParseOpenEr, cancellationToken);
    }

    private async Task<FxTable?> LoadAsync(
        string url,
        string source,
        Func<string, FxTable?> parse,
        CancellationToken cancellationToken)
    {
        try
        {
            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(8);
            using var response = await client.GetAsync(url, cancellationToken);
            if (!response.IsSuccessStatusCode) return null;
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            var table = parse(body);
            return table == null ? null : table with { Source = source };
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "FX source {Source} failed", source);
            return null;
        }
    }

    private static FxTable? ParseFrankfurter(string body)
    {
        using var doc = JsonDocument.Parse(body);
        if (!doc.RootElement.TryGetProperty("rates", out var rates)) return null;
        if (!doc.RootElement.TryGetProperty("date", out var dateNode)) return null;
        if (!DateOnly.TryParse(dateNode.GetString(), out var asOf)) return null;
        return Build(asOf, "ECB via Frankfurter", rates);
    }

    private static FxTable? ParseOpenEr(string body)
    {
        using var doc = JsonDocument.Parse(body);
        if (!doc.RootElement.TryGetProperty("rates", out var rates)) return null;
        var asOf = DateOnly.FromDateTime(DateTime.UtcNow);
        if (doc.RootElement.TryGetProperty("time_last_update_utc", out var stamp)
            && DateTime.TryParse(stamp.GetString(), CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var parsed))
        {
            asOf = DateOnly.FromDateTime(parsed.ToUniversalTime());
        }

        return Build(asOf, "ExchangeRate-API", rates);
    }

    private static FxTable Build(DateOnly asOf, string source, JsonElement rates)
    {
        var map = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase) { ["USD"] = 1m };
        foreach (var code in Codes)
        {
            if (rates.TryGetProperty(code, out var value) && value.TryGetDecimal(out var rate) && rate > 0)
            {
                map[code] = rate;
            }
        }

        return new FxTable(asOf, source, map);
    }
}
