using System.Net.Http.Headers;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using BankingApi.Models;
using Microsoft.Extensions.Options;

namespace BankingApi.Services;

/// <summary>
/// Streams banking chat via Cursor Cloud Agents API (Bearer auth, SSE run stream).
/// </summary>
public sealed class CursorCloudAgentsClient
{
    private readonly LlmSettings _settings;
    private readonly HttpClient _httpClient;
    private readonly ILogger<CursorCloudAgentsClient> _logger;
    private readonly SemaphoreSlim _agentGate = new(1, 1);

    private string? _agentId;

    public CursorCloudAgentsClient(
        IOptions<LlmSettings> settings,
        IHttpClientFactory httpClientFactory,
        ILogger<CursorCloudAgentsClient> logger)
    {
        _settings = settings.Value;
        _httpClient = httpClientFactory.CreateClient(nameof(CursorCloudAgentsClient));
        _logger = logger;
    }

    public async IAsyncEnumerable<StreamEvent> StreamChatAsync(
        ChatRequest request,
        string systemPrompt,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var apiKey = ResolveApiKey();
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            yield return new StreamEvent
            {
                Type = "error",
                Error =
                    "Cursor API key is missing. Set LlmSettings:ApiKey, environment variable CURSOR_API_KEY, or appsettings.Local.json (gitignored)."
            };
            yield break;
        }

        var promptText = BuildPromptText(systemPrompt, request);
        string agentId;
        string runId;
        string? startError = null;

        try
        {
            await _agentGate.WaitAsync(cancellationToken);
            try
            {
                if (string.IsNullOrWhiteSpace(_agentId))
                {
                    (agentId, runId) = await CreateAgentWithInitialRunAsync(apiKey, promptText, cancellationToken);
                    _agentId = agentId;
                }
                else
                {
                    agentId = _agentId;
                    runId = await CreateFollowUpRunAsync(apiKey, agentId, promptText, cancellationToken);
                }
            }
            finally
            {
                _agentGate.Release();
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Cursor Cloud Agents request failed");
            startError = ex.Message;
            agentId = string.Empty;
            runId = string.Empty;
        }

        if (startError != null)
        {
            yield return new StreamEvent
            {
                Type = "error",
                Error = $"Cursor Cloud Agents API error: {startError}"
            };
            yield break;
        }

        await foreach (var delta in StreamRunEventsAsync(apiKey, agentId, runId, cancellationToken))
        {
            if (delta != null)
            {
                yield return new StreamEvent { Type = "delta", Content = delta };
            }
        }
    }

    private string ResolveApiKey()
    {
        if (!string.IsNullOrWhiteSpace(_settings.ApiKey))
        {
            return _settings.ApiKey.Trim();
        }

        return Environment.GetEnvironmentVariable("CURSOR_API_KEY")?.Trim() ?? string.Empty;
    }

    private static string BuildPromptText(string systemPrompt, ChatRequest request)
    {
        var sb = new StringBuilder();
        sb.AppendLine(systemPrompt.Trim());
        sb.AppendLine();
        sb.AppendLine(
            "IMPORTANT: Reply in plain chat text only for the banking concierge UI. " +
            "Do not open files, run terminal commands, or modify a repository.");

        if (request.History.Count > 0)
        {
            sb.AppendLine();
            sb.AppendLine("Conversation so far:");
            foreach (var item in request.History.TakeLast(6))
            {
                sb.AppendLine($"{item.Role}: {item.Content}");
            }
        }

        sb.AppendLine();
        sb.AppendLine($"user: {request.Message}");
        return sb.ToString();
    }

    private string ApiBase => (_settings.Endpoint ?? "https://api.cursor.com").TrimEnd('/');

    private async Task<(string AgentId, string RunId)> CreateAgentWithInitialRunAsync(
        string apiKey,
        string promptText,
        CancellationToken cancellationToken)
    {
        var body = new Dictionary<string, object>
        {
            ["prompt"] = new Dictionary<string, object> { ["text"] = promptText },
            ["name"] = "Apex Banking Concierge"
        };

        if (!string.IsNullOrWhiteSpace(_settings.ModelId))
        {
            body["model"] = new Dictionary<string, object> { ["id"] = _settings.ModelId };
        }

        using var httpRequest = CreateJsonPost($"{ApiBase}/v1/agents", body, apiKey);
        using var response = await _httpClient.SendAsync(httpRequest, cancellationToken);
        var json = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Create agent failed ({(int)response.StatusCode}): {Truncate(json, 500)}");
        }

        using var doc = JsonDocument.Parse(json);
        var agentId = doc.RootElement.GetProperty("agent").GetProperty("id").GetString()
                      ?? throw new InvalidOperationException("Cursor response missing agent.id");
        var runId = doc.RootElement.GetProperty("run").GetProperty("id").GetString()
                    ?? throw new InvalidOperationException("Cursor response missing run.id");
        return (agentId, runId);
    }

    private async Task<string> CreateFollowUpRunAsync(
        string apiKey,
        string agentId,
        string promptText,
        CancellationToken cancellationToken)
    {
        var body = new Dictionary<string, object>
        {
            ["prompt"] = new Dictionary<string, object> { ["text"] = promptText }
        };

        using var httpRequest = CreateJsonPost($"{ApiBase}/v1/agents/{agentId}/runs", body, apiKey);
        using var response = await _httpClient.SendAsync(httpRequest, cancellationToken);
        var json = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Create run failed ({(int)response.StatusCode}): {Truncate(json, 500)}");
        }

        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.GetProperty("run").GetProperty("id").GetString()
               ?? throw new InvalidOperationException("Cursor response missing run.id");
    }

    private async IAsyncEnumerable<string?> StreamRunEventsAsync(
        string apiKey,
        string agentId,
        string runId,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        using var httpRequest = new HttpRequestMessage(
            HttpMethod.Get,
            $"{ApiBase}/v1/agents/{agentId}/runs/{runId}/stream");
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        httpRequest.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/event-stream"));

        using var response = await _httpClient.SendAsync(
            httpRequest,
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new InvalidOperationException(
                $"Stream run failed ({(int)response.StatusCode}): {Truncate(body, 500)}");
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var reader = new StreamReader(stream);

        string? eventName = null;
        var emittedAnyAssistantText = false;

        while (!cancellationToken.IsCancellationRequested)
        {
            var line = await reader.ReadLineAsync(cancellationToken);
            if (line == null)
            {
                break;
            }

            if (line.StartsWith("event:", StringComparison.Ordinal))
            {
                eventName = line["event:".Length..].Trim();
                continue;
            }

            if (!line.StartsWith("data:", StringComparison.Ordinal))
            {
                continue;
            }

            var dataJson = line["data:".Length..].Trim();
            if (string.IsNullOrWhiteSpace(dataJson))
            {
                continue;
            }

            using var doc = JsonDocument.Parse(dataJson);
            var root = doc.RootElement;

            if (eventName == "assistant" && root.TryGetProperty("text", out var textProp))
            {
                var text = textProp.GetString();
                if (!string.IsNullOrEmpty(text))
                {
                    emittedAnyAssistantText = true;
                    yield return text;
                }
            }
            else if (eventName == "result" && root.TryGetProperty("text", out var resultText)
                     && !emittedAnyAssistantText)
            {
                var text = resultText.GetString();
                if (!string.IsNullOrEmpty(text))
                {
                    yield return text;
                }
            }
            else if (eventName == "error")
            {
                var message = root.TryGetProperty("message", out var msg)
                    ? msg.GetString()
                    : dataJson;
                throw new InvalidOperationException(message ?? "Cursor stream error");
            }
            else if (eventName == "done")
            {
                yield break;
            }
        }
    }

    private static HttpRequestMessage CreateJsonPost(string url, object body, string apiKey)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json")
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        return request;
    }

    private static string Truncate(string value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length <= maxLength)
        {
            return value.Trim();
        }

        return value[..maxLength].Trim() + "…";
    }
}
