using System.Net.Http.Headers;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using BankingApi.Models;
using Microsoft.Extensions.Options;

namespace BankingApi.Services;

public interface ILlmService
{
    IAsyncEnumerable<StreamEvent> StreamChatAsync(ChatRequest request, CancellationToken cancellationToken = default);
    ProviderInfoDto GetCurrentProviderInfo();
}

public class MultiProviderLlmService : ILlmService
{
    private readonly LlmSettings _settings;
    private readonly IBankingService _bankingService;
    private readonly IConciergePlanner _planner;
    private readonly HttpClient _httpClient;
    private readonly ILogger<MultiProviderLlmService> _logger;
    private readonly CursorCloudAgentsClient _cursorClient;

    public MultiProviderLlmService(
        IOptions<LlmSettings> settings,
        IBankingService bankingService,
        IConciergePlanner planner,
        HttpClient httpClient,
        CursorCloudAgentsClient cursorClient,
        ILogger<MultiProviderLlmService> logger)
    {
        _settings = settings.Value;
        _bankingService = bankingService;
        _planner = planner;
        _httpClient = httpClient;
        _cursorClient = cursorClient;
        _logger = logger;
    }

    public ProviderInfoDto GetCurrentProviderInfo()
    {
        var provider = (_settings.Provider ?? "mock").ToLowerInvariant();
        var isLocal = provider is "ollama" or "lmstudio" or "omlx" or "mock";
        return new ProviderInfoDto
        {
            Name = provider switch
            {
                "ollama" => $"Ollama ({_settings.ModelId})",
                "cursor" => $"Cursor Cloud ({_settings.ModelId})",
                "lmstudio" => "LM Studio (Local)",
                "omlx" => "OMLX / MLX Engine",
                "gemini" => "Google Gemini 2.5",
                "openai" => "OpenAI GPT-4o",
                "claude" => "Anthropic Claude 3.5",
                _ => "Mock Dynamic Simulator (Zero-Config POC)"
            },
            Model = _settings.ModelId,
            IsLocal = isLocal,
            IsSimulated = provider == "mock"
        };
    }

    public async IAsyncEnumerable<StreamEvent> StreamChatAsync(
        ChatRequest request,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        // 1. Send active provider info
        yield return new StreamEvent
        {
            Type = "provider_info",
            ProviderInfo = GetCurrentProviderInfo()
        };

        await foreach (var evt in StreamPlannedTurnAsync(request, cancellationToken))
        {
            yield return evt;
        }

        yield return new StreamEvent { Type = "done" };
    }

    private async IAsyncEnumerable<StreamEvent> StreamPlannedTurnAsync(
        ChatRequest request,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var text = request.Message.ToLowerInvariant();
        if (IsProhibitedBankingAction(text, out var prohibitedReason))
        {
            var prohibited = prohibitedReason.StartsWith("I cannot", StringComparison.OrdinalIgnoreCase)
                ? prohibitedReason
                : $"I cannot perform this operation directly. {prohibitedReason}";
            foreach (var chunk in SplitIntoWordChunks(prohibited))
            {
                yield return new StreamEvent { Type = "delta", Content = chunk };
                await Task.Delay(8, cancellationToken);
            }
            yield break;
        }

        if (IsOutOfScopeNonBanking(text, out var outOfScopeReason))
        {
            var refusal = outOfScopeReason.StartsWith("I cannot", StringComparison.OrdinalIgnoreCase)
                ? outOfScopeReason
                : $"I cannot assist with that request. {outOfScopeReason}";
            foreach (var chunk in SplitIntoWordChunks(refusal))
            {
                yield return new StreamEvent { Type = "delta", Content = chunk };
                await Task.Delay(8, cancellationToken);
            }
            yield break;
        }

        var plan = await _planner.PlanAsync(request, cancellationToken);
        var narration = plan.Briefing;
        var rewritten = await TryRewriteAsync(request, plan, cancellationToken);
        if (!string.IsNullOrWhiteSpace(rewritten))
        {
            narration = rewritten.Trim();
        }

        foreach (var chunk in SplitIntoWordChunks(narration))
        {
            yield return new StreamEvent { Type = "delta", Content = chunk };
            await Task.Delay(8, cancellationToken);
        }

        foreach (var evt in plan.Events)
        {
            yield return evt;
        }
    }

    private async Task<string?> TryRewriteAsync(ChatRequest request, ConciergePlan plan, CancellationToken cancellationToken)
    {
        var provider = (_settings.Provider ?? "mock").ToLowerInvariant();
        if (provider == "mock") return null;
        if (string.IsNullOrWhiteSpace(_settings.ApiKey) && provider is "gemini" or "openai" or "claude") return null;
        if (provider == "cursor" && string.IsNullOrWhiteSpace(ResolveCursorKey())) return null;

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(provider == "cursor" ? TimeSpan.FromSeconds(12) : TimeSpan.FromSeconds(8));
        try
        {
            var text = provider == "cursor"
                ? await CollectCursorAsync(request.Message, plan.Briefing, timeout.Token)
                : await CompleteChatAsync(request.Message, plan.Briefing, timeout.Token);
            return AcceptRewrite(text, plan.Briefing) ? text : null;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogInformation("Concierge rewrite timed out for {Provider}; using the ledger briefing", provider);
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Concierge rewrite failed for {Provider}; using the ledger briefing", provider);
            return null;
        }
    }

    private string ResolveCursorKey()
    {
        if (!string.IsNullOrWhiteSpace(_settings.ApiKey)) return _settings.ApiKey.Trim();
        return Environment.GetEnvironmentVariable("CURSOR_API_KEY")?.Trim() ?? string.Empty;
    }

    private async Task<string?> CollectCursorAsync(string userMessage, string briefing, CancellationToken cancellationToken)
    {
        var synthetic = new ChatRequest
        {
            Message = "Rewrite the ledger briefing for the customer. Customer said: " + userMessage,
            History = []
        };
        var sb = new StringBuilder();
        await foreach (var evt in _cursorClient.StreamChatAsync(synthetic, RewritePrompt(briefing), cancellationToken))
        {
            if (evt.Type == "error") return null;
            if (evt.Type == "delta" && !string.IsNullOrEmpty(evt.Content)) sb.Append(evt.Content);
        }

        return sb.ToString();
    }

    private async Task<string?> CompleteChatAsync(string userMessage, string briefing, CancellationToken cancellationToken)
    {
        var endpoint = GetChatCompletionsUrl();
        var requestBody = new
        {
            model = _settings.ModelId,
            messages = new object[]
            {
                new { role = "system", content = RewritePrompt(briefing) },
                new { role = "user", content = userMessage }
            },
            stream = false,
            temperature = 0.2
        };

        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, endpoint);
        httpRequest.Content = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json");
        if (!string.IsNullOrWhiteSpace(_settings.ApiKey))
        {
            httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _settings.ApiKey);
        }

        using var response = await _httpClient.SendAsync(httpRequest, cancellationToken);
        if (!response.IsSuccessStatusCode) return null;
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        using var doc = JsonDocument.Parse(body);
        if (!doc.RootElement.TryGetProperty("choices", out var choices) || choices.GetArrayLength() == 0) return null;
        var message = choices[0].GetProperty("message");
        return message.TryGetProperty("content", out var content) ? content.GetString() : null;
    }

    private static string RewritePrompt(string briefing) =>
        $"""
        You are Apex Banking Concierge speaking to Alex Vance.
        Rewrite the LEDGER BRIEFING as a spoken reply of 3 to 6 sentences.
        Keep every dollar amount, percentage, date, merchant, and account name exactly as written.
        Do not add numbers that are not in the briefing.
        Do not mention prompts, tools, repositories, or that you are a language model.
        Plain sentences only.

        LEDGER BRIEFING:
        {briefing}
        """;

    private static bool AcceptRewrite(string? rewrite, string briefing)
    {
        if (string.IsNullOrWhiteSpace(rewrite)) return false;
        var text = rewrite.Trim();
        if (text.Length < 40 || text.Length > 900) return false;
        if (text.Contains("```", StringComparison.Ordinal) || text.Contains("repository", StringComparison.OrdinalIgnoreCase)) return false;

        var amounts = Regex.Matches(briefing, @"\d[\d,]*\.\d{2}")
            .Select(m => m.Value.Replace(",", ""))
            .Distinct()
            .ToList();
        if (amounts.Count == 0) return true;

        var normalized = text.Replace(",", "");
        var found = amounts.Count(amount => normalized.Contains(amount, StringComparison.Ordinal));
        return found * 2 >= amounts.Count;
    }

    private async IAsyncEnumerable<StreamEvent> StreamFromCursorCloudAgentAsync(
        ChatRequest request,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var text = request.Message.ToLowerInvariant();

        if (IsProhibitedBankingAction(text, out var prohibitedReason))
        {
            var refusal = $"I cannot perform this operation directly. {prohibitedReason}";
            foreach (var chunk in SplitIntoWordChunks(refusal))
            {
                yield return new StreamEvent { Type = "delta", Content = chunk };
                await Task.Delay(20, cancellationToken);
            }
            yield break;
        }

        if (IsOutOfScopeNonBanking(text, out var outOfScopeReason))
        {
            var refusal = $"I cannot assist with that request. {outOfScopeReason}\n\nHere are the banking services I can help you with:\n- 🥧 **Financial Charts:** *'I want the chart as a pi chart'*\n- 🎯 **Budget Tracker:** *'Show my monthly budget limits'*\n- 💰 **Loan Estimator:** *'Calculate loan for $35,000'*\n- 💱 **Currency Exchange:** *'Convert 1,000 USD to EUR'*\n- 📄 **Account Statements:** *'Show my recent checking account statement'*\n- 💳 **Card PIN Reset:** *'Reset PIN for my Debit Card'*\n- 🔒 **Card Controls:** *'Freeze my credit card'*\n- 💸 **Funds Transfer:** *'Transfer $250 to emergency savings'*";
            foreach (var chunk in SplitIntoWordChunks(refusal))
            {
                yield return new StreamEvent { Type = "delta", Content = chunk };
                await Task.Delay(20, cancellationToken);
            }
            yield break;
        }

        var systemPrompt = string.IsNullOrWhiteSpace(_settings.SystemPrompt)
            ? GetGroundedSystemPrompt()
            : _settings.SystemPrompt + "\n\n" + GetGroundedSystemPrompt();

        await foreach (var evt in _cursorClient.StreamChatAsync(request, systemPrompt, cancellationToken))
        {
            if (evt.Type == "error")
            {
                yield return evt;
                yield break;
            }

            yield return evt;
        }

        await foreach (var widgetEvent in EmitEfCoreWidgetsForIntentAsync(text, cancellationToken))
        {
            yield return widgetEvent;
        }
    }

    private async IAsyncEnumerable<StreamEvent> StreamFromOllamaWithEfCoreAsync(
        ChatRequest request,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var text = request.Message.ToLowerInvariant();

        // 1. Grounding Guardrails: Prohibited / Unserviceable Banking Operations
        if (IsProhibitedBankingAction(text, out var prohibitedReason))
        {
            var refusal = $"I cannot perform this operation directly. {prohibitedReason}";
            foreach (var chunk in SplitIntoWordChunks(refusal))
            {
                yield return new StreamEvent { Type = "delta", Content = chunk };
                await Task.Delay(20, cancellationToken);
            }
            yield break;
        }

        // 2. Grounding Guardrails: Out-of-Scope Non-Banking Requests
        if (IsOutOfScopeNonBanking(text, out var outOfScopeReason))
        {
            var refusal = $"I cannot assist with that request. {outOfScopeReason}\n\nHere are the banking services I can help you with:\n- 🥧 **Financial Charts:** *'I want the chart as a pi chart'*\n- 🎯 **Budget Tracker:** *'Show my monthly budget limits'*\n- 💰 **Loan Estimator:** *'Calculate loan for $35,000'*\n- 💱 **Currency Exchange:** *'Convert 1,000 USD to EUR'*\n- 📄 **Account Statements:** *'Show my recent checking account statement'*\n- 💳 **Card PIN Reset:** *'Reset PIN for my Debit Card'*\n- 🔒 **Card Controls:** *'Freeze my credit card'*\n- 💸 **Funds Transfer:** *'Transfer $250 to emergency savings'*";
            foreach (var chunk in SplitIntoWordChunks(refusal))
            {
                yield return new StreamEvent { Type = "delta", Content = chunk };
                await Task.Delay(20, cancellationToken);
            }
            yield break;
        }

        var endpoint = GetChatCompletionsUrl();
        var systemInstruction = GetGroundedSystemPrompt();

        var messages = new List<object>
        {
            new { role = "system", content = systemInstruction }
        };

        foreach (var h in request.History.TakeLast(6))
        {
            messages.Add(new { role = h.Role, content = h.Content });
        }
        messages.Add(new { role = "user", content = request.Message });

        var requestBody = new
        {
            model = _settings.ModelId,
            messages,
            stream = true,
            temperature = 0.2
        };

        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, endpoint);
        httpRequest.Content = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json");

        HttpResponseMessage? response = null;
        string? connectionError = null;

        try
        {
            response = await _httpClient.SendAsync(httpRequest, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to connect to Ollama at {Endpoint}", endpoint);
            connectionError = ex.Message;
        }

        if (connectionError != null || response == null || !response.IsSuccessStatusCode)
        {
            var failureDetail = connectionError;
            if (failureDetail == null && response != null)
            {
                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                failureDetail = $"HTTP {(int)response.StatusCode} {response.ReasonPhrase}: {Truncate(body, 400)}";
                _logger.LogError("Ollama chat/completions failed: {Detail}", failureDetail);
            }

            failureDetail ??= "Unknown connection failure.";

            yield return new StreamEvent
            {
                Type = "error",
                Error =
                    $"Ollama is not serving model \"{_settings.ModelId}\" at {_settings.Endpoint}. {failureDetail} " +
                    "Run `ollama list`, pull the model, or set LlmSettings:Provider to \"Mock\" for the offline simulator."
            };
            yield break;
        }

        // 1. Stream tokens live from Ollama!
        using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var reader = new StreamReader(stream);

        string? line;
        while ((line = await reader.ReadLineAsync(cancellationToken)) != null && !cancellationToken.IsCancellationRequested)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            if (line.StartsWith("data:")) line = line.Substring(5).Trim();
            if (line == "[DONE]") break;

            string? deltaText = null;
            try
            {
                using var doc = JsonDocument.Parse(line);
                if (doc.RootElement.TryGetProperty("choices", out var choices) && choices.GetArrayLength() > 0)
                {
                    var choice = choices[0];
                    if (choice.TryGetProperty("delta", out var delta) && delta.TryGetProperty("content", out var content))
                    {
                        deltaText = content.GetString();
                    }
                }
            }
            catch
            {
                // ignore chunk fragment
            }

            if (!string.IsNullOrEmpty(deltaText))
            {
                yield return new StreamEvent
                {
                    Type = "delta",
                    Content = deltaText
                };
            }
        }

        // 2. Query EF Core and emit Dynamic UI Widgets corresponding to user intent!
        await foreach (var widgetEvent in EmitEfCoreWidgetsForIntentAsync(text, cancellationToken))
        {
            yield return widgetEvent;
        }
    }

    private async IAsyncEnumerable<StreamEvent> EmitEfCoreWidgetsForIntentAsync(
        string text,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        if (IsProhibitedBankingAction(text, out _) || IsOutOfScopeNonBanking(text, out _))
        {
            yield break;
        }

        // 1. Specific Action: Card PIN Reset (evaluate before general charts/keywords)
        var isPinReset = Regex.IsMatch(text, @"\bpin\b") || 
                         (text.Contains("card") && (text.Contains("reset") || text.Contains("change")) && !text.Contains("password"));

        // 2. Specific Action: Card Controls / Freeze / Limits
        var isCardControls = IsCardControlRequest(text);

        // 3. Specific Action: Password & Authentication Credentials
        var isPasswordReset = text.Contains("password") || 
                              (text.Contains("security") && text.Contains("reset")) ||
                              (text.Contains("account") && text.Contains("credentials")) ||
                              text.Contains("2fa");

        // 4. Specific Action: Fund Transfer
        var isTransfer = IsTransferRequest(text);

        // 5. Specific Action: Loan & Mortgage Financing Estimator
        var isLoan = text.Contains("loan") || text.Contains("mortgage") || text.Contains("emi") || 
                     text.Contains("borrow") || text.Contains("financing") || text.Contains("calculator");

        // 6. Specific Action: Wholesale Foreign Currency Exchange
        var isCurrency = text.Contains("convert") || text.Contains("currency") || text.Contains("forex") || 
                         text.Contains("fx") || text.Contains("exchange rate") || 
                         (text.Contains("exchange") && !text.Contains("stock"));

        // 7. Specific Action: Budget & Target Tracker
        var isBudget = text.Contains("budget") || text.Contains("spending limit") || 
                       text.Contains("monthly limit") || text.Contains("allowance") || text.Contains("target");

        // 8. Specific Action: Financial Spending Charts (Pie, Doughnut, Bar, Line)
        var isChart = text.Contains("chart") || text.Contains("graph") || 
                      text.Contains("doughnut") || text.Contains("donut") || 
                      Regex.IsMatch(text, @"\bbar\s*chart\b") || Regex.IsMatch(text, @"\bline\s*chart\b") ||
                      text.Contains("pie") || text.Contains("pi chart") || Regex.IsMatch(text, @"\bpi\s*chart\b") ||
                      text.Contains("breakdown") || text.Contains("distribution") || text.Contains("spending trends");

        // 9. Specific Action: Account Statements & Transaction History
        var isStatement = text.Contains("statement") || text.Contains("transaction") || 
                          text.Contains("history") || text.Contains("recent activity") || text.Contains("ledger");

        if (isPinReset)
        {
            var cards = await _bankingService.GetCardsAsync();
            var targetCard = ResolveCard(cards, text, defaultToDebit: true) ?? cards.First();

            yield return new StreamEvent
            {
                Type = "tool_call",
                ToolCall = new ToolCallDto
                {
                    Name = "initiatePinReset",
                    Args = new Dictionary<string, object>
                    {
                        ["cardId"] = targetCard.Id,
                        ["cardType"] = targetCard.CardType
                    }
                }
            };
            await Task.Delay(150, cancellationToken);

            yield return new StreamEvent
            {
                Type = "widget",
                Widget = new WidgetDto
                {
                    Name = "cardPinResetWidget",
                    Title = $"Secure PIN Reset - {targetCard.CardType} Card",
                    Props = new Dictionary<string, object>
                    {
                        ["cardId"] = targetCard.Id,
                        ["cardName"] = targetCard.CardName,
                        ["cardNumberMasked"] = targetCard.CardNumberMasked,
                        ["cardType"] = targetCard.CardType,
                        ["isFrozen"] = targetCard.IsFrozen
                    }
                }
            };
        }
        else if (isCardControls)
        {
            var cards = await _bankingService.GetCardsAsync();
            var card = ResolveCard(cards, text, defaultToDebit: false);
            if (card != null)
            {
                var changingLock = TryGetFreezeAction(text, out var shouldFreeze);
                if (changingLock)
                {
                    yield return new StreamEvent
                    {
                        Type = "tool_call",
                        ToolCall = new ToolCallDto
                        {
                            Name = "toggleCardFreeze",
                            Args = new Dictionary<string, object>
                            {
                                ["cardId"] = card.Id,
                                ["freeze"] = shouldFreeze
                            }
                        }
                    };
                    await Task.Delay(150, cancellationToken);
                }

                yield return new StreamEvent
                {
                    Type = "widget",
                    Widget = new WidgetDto
                    {
                        Name = "cardControlsWidget",
                        Title = $"{card.CardType} Card Controls",
                        Props = new Dictionary<string, object>
                        {
                            ["cardId"] = card.Id,
                            ["cardName"] = card.CardName,
                            ["cardNumberMasked"] = card.CardNumberMasked,
                            ["cardType"] = card.CardType,
                            ["isFrozen"] = changingLock ? shouldFreeze : card.IsFrozen,
                            ["spendingLimit"] = card.SpendingLimit,
                            ["currentBalance"] = card.CurrentBalance
                        }
                    }
                };
            }
        }
        else if (isPasswordReset)
        {
            yield return new StreamEvent
            {
                Type = "tool_call",
                ToolCall = new ToolCallDto
                {
                    Name = "verifySecurityContext",
                    Args = new Dictionary<string, object>
                    {
                        ["action"] = "password_reset_flow"
                    }
                }
            };
            await Task.Delay(150, cancellationToken);

            yield return new StreamEvent
            {
                Type = "widget",
                Widget = new WidgetDto
                {
                    Name = "passwordResetWidget",
                    Title = "Online Banking Password Reset",
                    Props = new Dictionary<string, object>
                    {
                        ["userEmail"] = "a.vance@example.com",
                        ["requireOtp"] = true
                    }
                }
            };
        }
        else if (isTransfer)
        {
            var accounts = await _bankingService.GetAccountsAsync();
            var transfer = ResolveTransfer(accounts, text);

            yield return new StreamEvent
            {
                Type = "widget",
                Widget = new WidgetDto
                {
                    Name = "transferConfirmWidget",
                    Title = "Authorize Instant Transfer",
                    Props = new Dictionary<string, object>
                    {
                        ["fromAccountId"] = transfer.Source.Id,
                        ["fromAccount"] = $"{transfer.Source.AccountType} ({transfer.Source.AccountNumber})",
                        ["availableBalance"] = transfer.Source.AvailableBalance,
                        ["recipient"] = transfer.Recipient,
                        ["amount"] = transfer.Amount,
                        ["note"] = transfer.Note
                    }
                }
            };
        }
        else if (isLoan)
        {
            decimal parsedPrincipal = 35000m;
            var words = text.Split(new[] { ' ', '$', ',', '?' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (var w in words)
            {
                if (decimal.TryParse(w, out var p) && p >= 1000)
                {
                    parsedPrincipal = p;
                    break;
                }
            }

            yield return new StreamEvent
            {
                Type = "tool_call",
                ToolCall = new ToolCallDto
                {
                    Name = "calculateLoanEstimate",
                    Args = new Dictionary<string, object>
                    {
                        ["principal"] = parsedPrincipal,
                        ["interestRate"] = 6.45,
                        ["termMonths"] = 48
                    }
                }
            };
            await Task.Delay(150, cancellationToken);

            yield return new StreamEvent
            {
                Type = "widget",
                Widget = new WidgetDto
                {
                    Name = "loanCalculatorWidget",
                    Title = "Financing & Loan Estimator",
                    Props = new Dictionary<string, object>
                    {
                        ["title"] = "Loan & Financing Estimator",
                        ["loanType"] = "Premier Flex Credit",
                        ["currency"] = "USD",
                        ["initialPrincipal"] = parsedPrincipal,
                        ["initialRate"] = 6.45m,
                        ["initialTermMonths"] = 48
                    }
                }
            };
        }
        else if (isCurrency)
        {
            var exchange = ResolveExchange(text);
            yield return new StreamEvent
            {
                Type = "tool_call",
                ToolCall = new ToolCallDto
                {
                    Name = "getLiveExchangeRate",
                    Args = new Dictionary<string, object>
                    {
                        ["from"] = exchange.From,
                        ["to"] = exchange.To,
                        ["amount"] = exchange.Amount
                    }
                }
            };
            await Task.Delay(150, cancellationToken);

            yield return new StreamEvent
            {
                Type = "widget",
                Widget = new WidgetDto
                {
                    Name = "currencyExchangeWidget",
                    Title = "Live Wholesale Currency Exchange",
                    Props = new Dictionary<string, object>
                    {
                        ["title"] = "Live Interbank Currency Exchange",
                        ["initialAmount"] = exchange.Amount,
                        ["initialFrom"] = exchange.From,
                        ["initialTo"] = exchange.To
                    }
                }
            };
        }
        else if (isBudget)
        {
            yield return new StreamEvent
            {
                Type = "tool_call",
                ToolCall = new ToolCallDto
                {
                    Name = "fetchBudgetGoals",
                    Args = new Dictionary<string, object>
                    {
                        ["period"] = "current_cycle"
                    }
                }
            };
            await Task.Delay(150, cancellationToken);

            yield return new StreamEvent
            {
                Type = "widget",
                Widget = new WidgetDto
                {
                    Name = "budgetAnalyticsWidget",
                    Title = "Monthly Budget & Target Tracker",
                    Props = new Dictionary<string, object>
                    {
                        ["title"] = "Monthly Category Budgets",
                        ["month"] = "Active Billing Cycle",
                        ["currency"] = "USD",
                        ["items"] = new List<object>
                        {
                            new { category = "Tech & Cloud", spent = 2841.50m, limit = 3500.00m, icon = "💻" },
                            new { category = "Travel & Flights", spent = 1240.00m, limit = 1500.00m, icon = "✈️" },
                            new { category = "Groceries & Market", spent = 485.20m, limit = 600.00m, icon = "🛒" },
                            new { category = "Health & Wellness", spent = 280.00m, limit = 300.00m, icon = "🧘" },
                            new { category = "Dining & Out", spent = 245.80m, limit = 250.00m, icon = "🍽️" },
                            new { category = "Utilities & Telecom", spent = 195.00m, limit = 250.00m, icon = "⚡" }
                        }
                    }
                }
            };
        }
        else if (isChart)
        {
            var chartType = "pie";
            if (text.Contains("donut") || text.Contains("doughnut"))
            {
                chartType = "doughnut";
            }
            else if (text.Contains("line") || text.Contains("trend"))
            {
                chartType = "line";
            }
            else if (text.Contains("bar"))
            {
                chartType = "bar";
            }
            else if (text.Contains("pie") || text.Contains("pi chart") || Regex.IsMatch(text, @"\bpi\s*chart\b"))
            {
                chartType = "pie";
            }

            yield return new StreamEvent
            {
                Type = "tool_call",
                ToolCall = new ToolCallDto
                {
                    Name = "generateFinancialChart",
                    Args = new Dictionary<string, object>
                    {
                        ["chartType"] = chartType,
                        ["metric"] = "spending_by_category"
                    }
                }
            };
            await Task.Delay(150, cancellationToken);

            var txs = await _bankingService.GetStatementsAsync("acc-chk-01", 30);
            var debitTxs = txs.Where(t => t.Type == "Debit" || t.Amount < 0 || t.Category != "Income").ToList();
            if (debitTxs.Count == 0) debitTxs = txs;

            var categories = debitTxs.GroupBy(t => t.Category)
                                .Select(g => new { Category = g.Key, Total = Math.Abs(g.Sum(x => Math.Abs(x.Amount))) })
                                .OrderByDescending(x => x.Total)
                                .ToList();

            if (categories.Count == 0)
            {
                categories = new[]
                {
                    new { Category = "Tech & Cloud", Total = 2841.50m },
                    new { Category = "Travel & Flights", Total = 1240.00m },
                    new { Category = "Groceries & Market", Total = 485.20m },
                    new { Category = "Health & Wellness", Total = 280.00m },
                    new { Category = "Dining & Out", Total = 245.80m },
                    new { Category = "Utilities & Telecom", Total = 195.00m }
                }.ToList();
            }

            var labels = categories.Select(c => c.Category).ToList();
            var data = categories.Select(c => c.Total).ToList();
            var totalAmount = data.Sum();
            var topCat = categories.First();
            var topPct = totalAmount > 0 ? Math.Round((topCat.Total / totalAmount) * 100, 1) : 0;

            yield return new StreamEvent
            {
                Type = "widget",
                Widget = new WidgetDto
                {
                    Name = "chartWidget",
                    Title = $"{char.ToUpper(chartType[0]) + chartType.Substring(1)} Spending Distribution",
                    Props = new Dictionary<string, object>
                    {
                        ["title"] = $"{char.ToUpper(chartType[0]) + chartType.Substring(1)} Expense Distribution",
                        ["subtitle"] = "Real-time EF Core ledger breakdown by spending category",
                        ["chartType"] = chartType,
                        ["labels"] = labels,
                        ["data"] = data,
                        ["totalAmount"] = totalAmount,
                        ["currency"] = "USD",
                        ["insights"] = new List<string>
                        {
                            $"{topCat.Category} is your largest expense sector representing {topPct}% of cycle outflows.",
                            "Expenses remain strictly within your monthly risk tolerance parameters."
                        }
                    }
                }
            };
        }
        else if (isStatement)
        {
            var accounts = await _bankingService.GetAccountsAsync();
            var account = ResolveStatementAccount(accounts, text);

            yield return new StreamEvent
            {
                Type = "tool_call",
                ToolCall = new ToolCallDto
                {
                    Name = "fetchStatements",
                    Args = new Dictionary<string, object>
                    {
                        ["accountId"] = account.Id,
                        ["limit"] = 6
                    }
                }
            };
            await Task.Delay(150, cancellationToken);

            var transactions = await _bankingService.GetStatementsAsync(account.Id, 6);

            yield return new StreamEvent
            {
                Type = "widget",
                Widget = new WidgetDto
                {
                    Name = "statementWidget",
                    Title = "Account Statement Explorer",
                    Props = new Dictionary<string, object>
                    {
                        ["accountName"] = account.AccountType,
                        ["accountNumber"] = account.AccountNumber,
                        ["balance"] = account.Balance,
                        ["currency"] = account.Currency,
                        ["transactions"] = transactions.Select(t => new
                        {
                            id = t.Id,
                            date = t.Date.ToString("yyyy-MM-dd HH:mm"),
                            description = t.Description,
                            category = t.Category,
                            amount = t.Amount,
                            type = t.Type
                        }).ToList()
                    }
                }
            };
        }
    }

    private async IAsyncEnumerable<StreamEvent> SimulateDynamicBankingAsync(
        ChatRequest request,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var text = request.Message.ToLowerInvariant();

        if (IsProhibitedBankingAction(text, out var pReason))
        {
            var refusal = $"I cannot perform this operation directly. {pReason}";
            foreach (var chunk in SplitIntoWordChunks(refusal))
            {
                yield return new StreamEvent { Type = "delta", Content = chunk };
                await Task.Delay(20, cancellationToken);
            }
            yield break;
        }

        if (IsOutOfScopeNonBanking(text, out var oReason))
        {
            var refusal = $"I cannot assist with that request. {oReason}\n\nHere are the banking services I can help you with:\n- 🥧 **Financial Charts:** *'I want the chart as a pi chart'*\n- 🎯 **Budget Tracker:** *'Show my monthly budget limits'*\n- 💰 **Loan Estimator:** *'Calculate loan for $35,000'*\n- 💱 **Currency Exchange:** *'Convert 1,000 USD to EUR'*\n- 📄 **Account Statements:** *'Show my recent checking account statement'*\n- 💳 **Card PIN Reset:** *'Reset PIN for my Debit Card'*\n- 🔒 **Card Controls:** *'Freeze my credit card'*\n- 💸 **Funds Transfer:** *'Transfer $250 to emergency savings'*";
            foreach (var chunk in SplitIntoWordChunks(refusal))
            {
                yield return new StreamEvent { Type = "delta", Content = chunk };
                await Task.Delay(20, cancellationToken);
            }
            yield break;
        }

        var isPinReset = Regex.IsMatch(text, @"\bpin\b") || 
                         (text.Contains("card") && (text.Contains("reset") || text.Contains("change")) && !text.Contains("password"));
        var isCardControls = IsCardControlRequest(text);
        var isPasswordReset = text.Contains("password") || 
                              (text.Contains("security") && text.Contains("reset")) ||
                              (text.Contains("account") && text.Contains("credentials")) ||
                              text.Contains("2fa");
        var isTransfer = IsTransferRequest(text);
        var isLoan = text.Contains("loan") || text.Contains("mortgage") || text.Contains("emi") || 
                     text.Contains("borrow") || text.Contains("financing") || text.Contains("calculator");
        var isCurrency = text.Contains("convert") || text.Contains("currency") || text.Contains("forex") || 
                         text.Contains("fx") || text.Contains("exchange rate") || 
                         (text.Contains("exchange") && !text.Contains("stock"));
        var isBudget = text.Contains("budget") || text.Contains("spending limit") || 
                       text.Contains("monthly limit") || text.Contains("allowance") || text.Contains("target");
        var isChart = text.Contains("chart") || text.Contains("graph") || 
                      text.Contains("doughnut") || text.Contains("donut") || 
                      Regex.IsMatch(text, @"\bbar\s*chart\b") || Regex.IsMatch(text, @"\bline\s*chart\b") ||
                      text.Contains("pie") || text.Contains("pi chart") || Regex.IsMatch(text, @"\bpi\s*chart\b") ||
                      text.Contains("breakdown") || text.Contains("distribution") || text.Contains("spending trends");
        var isStatement = text.Contains("statement") || text.Contains("transaction") || 
                          text.Contains("history") || text.Contains("recent activity") || text.Contains("ledger");

        if (isPinReset)
        {
            var cards = await _bankingService.GetCardsAsync();
            var targetCard = ResolveCard(cards, text, defaultToDebit: true);
            var cardName = targetCard == null
                ? "card"
                : $"{targetCard.CardName} ({targetCard.CardType} card)";
            var intro = $"For security verification, I have initiated a secure PIN reset session for your **{cardName}**. Please enter your new 4-digit PIN and verify with the 2FA code below:";
            foreach (var chunk in SplitIntoWordChunks(intro))
            {
                yield return new StreamEvent { Type = "delta", Content = chunk };
                await Task.Delay(20, cancellationToken);
            }
        }
        else if (isCardControls)
        {
            var cards = await _bankingService.GetCardsAsync();
            var card = ResolveCard(cards, text, defaultToDebit: false);
            var changingLock = TryGetFreezeAction(text, out var shouldFreeze);
            var intro = card == null
                ? "You have two cards: the **Apex Premier Debit Platinum** and the **Apex Black Diamond Elite** credit card. Tell me which one, for example 'Freeze my debit card' or 'Freeze my credit card'."
                : changingLock
                    ? $"I have {(shouldFreeze ? "frozen" : "unlocked")} your **{card.CardName}** ({card.CardType} card). The controls below match that card:"
                    : $"Here are the live controls for your **{card.CardName}** ({card.CardType} card):";
            foreach (var chunk in SplitIntoWordChunks(intro))
            {
                yield return new StreamEvent { Type = "delta", Content = chunk };
                await Task.Delay(20, cancellationToken);
            }
        }
        else if (isPasswordReset)
        {
            var intro = "To safeguard your online banking profile, please follow the 2-step verification protocol below to establish new credentials:";
            foreach (var chunk in SplitIntoWordChunks(intro))
            {
                yield return new StreamEvent { Type = "delta", Content = chunk };
                await Task.Delay(20, cancellationToken);
            }
        }
        else if (isTransfer)
        {
            var transfer = ResolveTransfer(await _bankingService.GetAccountsAsync(), text);
            var intro = $"I have prepared a ${transfer.Amount:F2} transfer from your **{transfer.Source.AccountType}** account to **{transfer.Recipient}**. Please review the details and authorize the dispatch:";
            foreach (var chunk in SplitIntoWordChunks(intro))
            {
                yield return new StreamEvent { Type = "delta", Content = chunk };
                await Task.Delay(20, cancellationToken);
            }
        }
        else if (isLoan)
        {
            var intro = "I have loaded the interactive **Financing & Loan Estimator**. Adjust the principal slider, term, and interest rate to see real-time payment calculations:";
            foreach (var chunk in SplitIntoWordChunks(intro))
            {
                yield return new StreamEvent { Type = "delta", Content = chunk };
                await Task.Delay(20, cancellationToken);
            }
        }
        else if (isCurrency)
        {
            var exchange = ResolveExchange(text);
            var intro = $"Here is your live **Wholesale Currency Exchange** converter for **{exchange.Amount:0.##} {exchange.From}** to **{exchange.To}**:";
            foreach (var chunk in SplitIntoWordChunks(intro))
            {
                yield return new StreamEvent { Type = "delta", Content = chunk };
                await Task.Delay(20, cancellationToken);
            }
        }
        else if (isBudget)
        {
            var intro = "Here is your real-time **Monthly Budget Tracker** with category spending progress, limits, and automatic alerts:";
            foreach (var chunk in SplitIntoWordChunks(intro))
            {
                yield return new StreamEvent { Type = "delta", Content = chunk };
                await Task.Delay(20, cancellationToken);
            }
        }
        else if (isChart)
        {
            var chartName = "Pie Chart";
            if (text.Contains("donut") || text.Contains("doughnut")) chartName = "Doughnut Chart";
            else if (text.Contains("line") || text.Contains("trend")) chartName = "Line Trend Chart";
            else if (text.Contains("bar")) chartName = "Bar Chart";

            var intro = $"Certainly! I have aggregated your EF Core ledger transactions and generated an interactive **{chartName}** for your spending categories. You can switch chart modes or inspect category shares below:";
            foreach (var chunk in SplitIntoWordChunks(intro))
            {
                yield return new StreamEvent { Type = "delta", Content = chunk };
                await Task.Delay(20, cancellationToken);
            }
        }
        else if (isStatement)
        {
            var statementAccount = ResolveStatementAccount(await _bankingService.GetAccountsAsync(), text);
            var intro = $"I have queried the core ledger for your **{statementAccount.AccountType}** account:";
            foreach (var chunk in SplitIntoWordChunks(intro))
            {
                yield return new StreamEvent { Type = "delta", Content = chunk };
                await Task.Delay(20, cancellationToken);
            }
        }
        else if (text.Contains("hello") || text.Contains("hi") || text.Contains("hey") || text.Contains("help") || text.Contains("what can you do"))
        {
            var greeting = "Hello! I am your **Apex Banking Concierge**. I am securely connected to your verified accounts and core ledger. Here is what I can help you with directly in this chat:\n\n" +
                           "- 💳 **Card PIN Reset:** *'I want to reset the PIN for my Debit Card'*\n" +
                           "- 🥧 **Financial Spending Charts:** *'I want the chart as a pi chart'*\n" +
                           "- 📄 **Account Statements:** *'Show my recent checking account statement'*\n" +
                           "- 🎯 **Budget Tracker:** *'Show my monthly budget limits'*\n" +
                           "- 💰 **Loan Estimator:** *'Calculate loan for $35,000'*\n" +
                           "- 💱 **Currency Exchange:** *'Convert 1,000 USD to EUR'*\n" +
                           "- 🔒 **Card Controls:** *'Freeze my credit card'*\n" +
                           "- 🔑 **Security & Password:** *'Help me reset my banking password'*\n" +
                           "- 💸 **Funds Transfer:** *'Transfer $250 to emergency savings'*";
            foreach (var chunk in SplitIntoWordChunks(greeting))
            {
                yield return new StreamEvent { Type = "delta", Content = chunk };
                await Task.Delay(20, cancellationToken);
            }
        }
        else
        {
            var fallback = "I cannot fulfill this request as it cannot be serviced by Apex Banking Concierge. I am strictly grounded to assist only with authorized retail banking operations on your verified accounts (such as statements, PIN resets, card controls, transfers, financial charts, loans, and currency conversions).\n\nPlease let me know which banking service you would like assistance with.";
            foreach (var chunk in SplitIntoWordChunks(fallback))
            {
                yield return new StreamEvent { Type = "delta", Content = chunk };
                await Task.Delay(20, cancellationToken);
            }
        }

        await foreach (var evt in EmitEfCoreWidgetsForIntentAsync(text, cancellationToken))
        {
            yield return evt;
        }
    }

    private async IAsyncEnumerable<StreamEvent> StreamFromOpenAiCompatibleEndpointAsync(
        ChatRequest request,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var text = request.Message.ToLowerInvariant();

        // 1. Grounding Guardrails: Prohibited Banking Operations
        if (IsProhibitedBankingAction(text, out var prohibitedReason))
        {
            var refusal = $"I cannot perform this operation directly. {prohibitedReason}";
            foreach (var chunk in SplitIntoWordChunks(refusal))
            {
                yield return new StreamEvent { Type = "delta", Content = chunk };
                await Task.Delay(20, cancellationToken);
            }
            yield break;
        }

        // 2. Grounding Guardrails: Out-of-Scope Non-Banking Requests
        if (IsOutOfScopeNonBanking(text, out var outOfScopeReason))
        {
            var refusal = $"I cannot assist with that request. {outOfScopeReason}\n\nHere are the banking services I can help you with:\n- 🥧 **Financial Charts:** *'I want the chart as a pi chart'*\n- 🎯 **Budget Tracker:** *'Show my monthly budget limits'*\n- 💰 **Loan Estimator:** *'Calculate loan for $35,000'*\n- 💱 **Currency Exchange:** *'Convert 1,000 USD to EUR'*\n- 📄 **Account Statements:** *'Show my recent checking account statement'*\n- 💳 **Card PIN Reset:** *'Reset PIN for my Debit Card'*\n- 🔒 **Card Controls:** *'Freeze my credit card'*\n- 💸 **Funds Transfer:** *'Transfer $250 to emergency savings'*";
            foreach (var chunk in SplitIntoWordChunks(refusal))
            {
                yield return new StreamEvent { Type = "delta", Content = chunk };
                await Task.Delay(20, cancellationToken);
            }
            yield break;
        }

        var endpoint = GetChatCompletionsUrl();

        var messages = new List<object>
        {
            new { role = "system", content = GetGroundedSystemPrompt() }
        };

        foreach (var h in request.History.TakeLast(6))
        {
            messages.Add(new { role = h.Role, content = h.Content });
        }
        messages.Add(new { role = "user", content = request.Message });

        var requestBody = new
        {
            model = _settings.ModelId,
            messages,
            stream = true,
            temperature = 0.3
        };

        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, endpoint);
        httpRequest.Content = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json");

        if (!string.IsNullOrWhiteSpace(_settings.ApiKey))
        {
            httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _settings.ApiKey);
        }

        HttpResponseMessage? response = null;
        string? connectionError = null;
        try
        {
            response = await _httpClient.SendAsync(httpRequest, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to connect to LLM endpoint {Endpoint}", endpoint);
            connectionError = ex.Message;
        }

        if (connectionError != null || response == null || !response.IsSuccessStatusCode)
        {
            var failureDetail = connectionError;
            if (failureDetail == null && response != null)
            {
                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                failureDetail = $"HTTP {(int)response.StatusCode} {response.ReasonPhrase}: {Truncate(body, 400)}";
                _logger.LogError("LLM chat/completions failed: {Detail}", failureDetail);
            }

            failureDetail ??= "Unknown connection failure.";

            yield return new StreamEvent
            {
                Type = "error",
                Error =
                    $"LLM provider \"{_settings.Provider}\" failed for model \"{_settings.ModelId}\". {failureDetail}"
            };
            yield break;
        }

        using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var reader = new StreamReader(stream);

        string? line;
        while ((line = await reader.ReadLineAsync(cancellationToken)) != null && !cancellationToken.IsCancellationRequested)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            if (line.StartsWith("data:")) line = line.Substring(5).Trim();
            if (line == "[DONE]") break;

            string? deltaText = null;
            try
            {
                using var doc = JsonDocument.Parse(line);
                if (doc.RootElement.TryGetProperty("choices", out var choices) && choices.GetArrayLength() > 0)
                {
                    var choice = choices[0];
                    if (choice.TryGetProperty("delta", out var delta) && delta.TryGetProperty("content", out var content))
                    {
                        deltaText = content.GetString();
                    }
                }
            }
            catch
            {
                // ignore parsing fragments
            }

            if (!string.IsNullOrEmpty(deltaText))
            {
                yield return new StreamEvent
                {
                    Type = "delta",
                    Content = deltaText
                };
            }
        }

        await foreach (var evt in EmitEfCoreWidgetsForIntentAsync(request.Message.ToLowerInvariant(), cancellationToken))
        {
            yield return evt;
        }
    }

    private string GetChatCompletionsUrl()
    {
        var baseUrl = (_settings.Endpoint ?? string.Empty).TrimEnd('/');
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            baseUrl = "http://localhost:11434/v1";
        }

        if (!baseUrl.EndsWith("/v1", StringComparison.OrdinalIgnoreCase))
        {
            baseUrl += "/v1";
        }

        return baseUrl + "/chat/completions";
    }

    private static string Truncate(string value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length <= maxLength)
        {
            return value.Trim();
        }

        return value[..maxLength].Trim() + "…";
    }

    private static IEnumerable<string> SplitIntoWordChunks(string text)
    {
        var words = text.Split(' ');
        for (int i = 0; i < words.Length; i++)
        {
            yield return (i == 0 ? "" : " ") + words[i];
        }
    }

    private string GetGroundedSystemPrompt()
    {
        return $"""
            You are Apex Banking Concierge, the official AI banking assistant for Apex Premier Banking.

            STRICT GROUNDING & BOUNDARIES (MANDATORY):
            1. SCOPE: You ONLY handle retail banking services:
               - Account statements & transaction history
               - Financial spending breakdown charts (Pie, Doughnut, Bar, Line)
               - Monthly budget targets & category spending limits
               - Loan, mortgage, and EMI financing estimations
               - Live foreign currency exchange rate conversions
               - Debit/Credit card PIN resets (e.g. 'I want to reset the PIN for my Debit Card')
               - Card security controls (freeze/unfreeze, spend limits)
               - Online banking password & security credential updates
               - Instant transfers between verified client accounts

            2. OUT-OF-SCOPE / UNSERVICEABLE REQUESTS:
               - If the user asks for anything that cannot be served or is outside retail banking (e.g. flight booking, hotels, weather, cooking recipes, general trivia, medical/legal advice, sports scores, creative writing, software coding):
                 You MUST politely and explicitly state that you CANNOT do it:
                 "I cannot fulfill this request as it cannot be serviced by Apex Premier Banking. I am exclusively authorized to assist with retail banking operations for your verified accounts."
                 Do NOT hallucinate, pretend to book flights or hotels, or provide non-banking information.

            3. UNSUPPORTED BANKING ACTIONS:
               - If the user asks for unserviceable or high-risk banking operations (e.g. dispensing physical cash, deleting or closing a bank account, altering historical ledger records, modifying credit bureau scores, accessing another customer's data):
                 You MUST explicitly state:
                 "I cannot perform this action directly through the AI assistant. For account closure, physical cash dispensing, or specialized branch services, please visit an Apex branch with identification or consult your Private Wealth Advisor."

            4. IN-CHAT INTERACTIVE TOOLS & WIDGETS:
               - When the user asks to perform a valid banking action (such as resetting card PIN, generating spending charts, exploring statements, adjusting budgets, calculating loans, or transferring money), acknowledge their request directly. An interactive banking widget is automatically displayed directly below your message for them to complete the action.

            5. CUSTOMER CONTEXT:
               - Customer: Alex Vance (Private Client)
               - Primary Account: Premier Checking (CHK-98214-01)
               - Savings Account: High-Yield Savings (SAV-33108-02)
               - Investment Account: Global Wealth Portfolio (INV-55091-03)
               - Debit card: Apex Premier Debit Platinum. This is the only platinum card.
               - Credit card: Apex Black Diamond Elite. Do not call this card platinum.
               When the customer names a debit card, platinum card, or card ending 3419, act on the debit card.
               When the customer names a credit card, diamond card, elite card, or card ending 8821, act on the credit card.

            Provide a concise, direct, professional response (1-3 sentences). Always maintain strict banking compliance.
            """;
    }

    private static bool IsProhibitedBankingAction(string text, out string reason)
    {
        if (text.Contains("delete") && (text.Contains("account") || text.Contains("profile")))
        {
            reason = "Account closure and permanent deletion cannot be processed through the AI assistant. For regulatory compliance and account liquidation, please visit an authorized Apex branch or contact your Private Client Relationship Manager.";
            return true;
        }
        if (text.Contains("close") && (text.Contains("account") || text.Contains("bank")))
        {
            reason = "Account closure cannot be processed directly via chat. Please visit an Apex branch or submit a formal closure request through your Wealth Advisor.";
            return true;
        }
        if (text.Contains("cash") && (text.Contains("dispense") || text.Contains("withdraw") || text.Contains("give me") || text.Contains("hand me") || text.Contains("atm")))
        {
            reason = "I cannot dispense physical cash through the digital AI assistant. To make a cash withdrawal, please visit an Apex ATM or branch counter with your debit card.";
            return true;
        }
        if (text.Contains("hack") || text.Contains("bypass") || text.Contains("credit score") || text.Contains("alter ledger") || text.Contains("erase transaction") || text.Contains("free money"))
        {
            reason = "I cannot perform this action. Ledger modification, unauthorized access, and credit score tampering are strictly prohibited under banking security regulations.";
            return true;
        }

        reason = string.Empty;
        return false;
    }

    private static bool IsOutOfScopeNonBanking(string text, out string reason)
    {
        if (IsBankingTopic(text))
        {
            reason = string.Empty;
            return false;
        }

        reason = "I cannot fulfill this request. I am exclusively authorized to assist with retail banking on your Apex accounts, such as statements, cards, transfers, budgets, subscriptions, and cash flow. I cannot answer general knowledge, math, people, or anything outside those services.";
        return true;
    }

    private static bool IsBankingTopic(string text) =>
        Regex.IsMatch(
            text,
            @"\b(account|accounts|balance|balances|statement|statements|transaction|transactions|charge|charges|ledger|history|spending|spend|budget|allowance|card|cards|debit|credit|pin|freeze|unfreeze|unlock|password|credentials|transfer|wire|send|pay|savings|checking|investment|portfolio|wealth|loan|mortgage|emi|borrow|financing|currency|convert|forex|fx|exchange|usd|eur|gbp|jpy|subscription|subscriptions|recurring|forecast|cashflow|chart|graph|pie|doughnut|donut|breakdown|dispute|chargeback|audit|concierge|unusual|fraud|anomaly|goal|allocate|allocation|spare|travel|traveling|travelling|hello|hi|hey|help|thanks|thank|starbucks|netflix|spotify|equinox|amazon|coffee|mom)\b",
            RegexOptions.IgnoreCase)
        || text.Contains("what can you")
        || text.Contains("how am i")
        || text.Contains("how are my")
        || text.Contains("what did")
        || text.Contains("what changed")
        || text.Contains("cash flow")
        || text.Contains("where should")
        || text.Contains("set aside")
        || text.Contains("travel notice")
        || text.Contains("2fa");

    private static bool IsCardControlRequest(string text) =>
        Regex.IsMatch(text, @"\b(freeze|unfreeze|unlock|unblock|lock|block)\b")
        || (Regex.IsMatch(text, @"\bcard\b") && Regex.IsMatch(text, @"\b(limit|limits|controls|control)\b"));

    private static bool IsTransferRequest(string text)
    {
        var transfer = text.Contains("transfer")
            || text.Contains("send money")
            || text.Contains("send funds")
            || text.Contains("wire")
            || Regex.IsMatch(text, @"\bsend\s+(\$?\d+|funds|money)\b")
            || Regex.IsMatch(text, @"\bpay\b");
        if (!transfer) return false;

        var cardPayment = Regex.IsMatch(text, @"\b(debit|credit)\s+card\b")
            || Regex.IsMatch(text, @"\bcard\s+(bill|payment|balance)\b");
        return !(cardPayment && !text.Contains("transfer") && !text.Contains("wire"));
    }

    private static bool TryGetFreezeAction(string text, out bool freeze)
    {
        if (Regex.IsMatch(text, @"\b(unfreeze|unlock|unblock)\b"))
        {
            freeze = false;
            return true;
        }

        if (Regex.IsMatch(text, @"\b(freeze|lock|block)\b"))
        {
            freeze = true;
            return true;
        }

        freeze = false;
        return false;
    }

    private static readonly HashSet<string> GenericCardWords = new(StringComparer.OrdinalIgnoreCase)
    {
        "apex", "card", "bank", "the", "and"
    };

    private static BankCard? ResolveCard(IReadOnlyList<BankCard> cards, string text, bool defaultToDebit)
    {
        if (cards.Count == 0) return null;

        var last4Hits = cards.Where(card =>
        {
            var last4 = Regex.Match(card.CardNumberMasked, @"(\d{4})\s*$");
            return last4.Success && Regex.IsMatch(text, $@"\b{last4.Groups[1].Value}\b");
        }).ToList();
        if (last4Hits.Count == 1) return last4Hits[0];

        var wantsDebit = Regex.IsMatch(text, @"\bdebit\b");
        var wantsCredit = Regex.IsMatch(text, @"\bcredit\b");
        if (wantsDebit != wantsCredit)
        {
            var type = wantsDebit ? "Debit" : "Credit";
            var typed = cards.FirstOrDefault(c => c.CardType.Equals(type, StringComparison.OrdinalIgnoreCase));
            if (typed != null) return typed;
        }

        var ranked = cards
            .Select(card => (Card: card, Score: ScoreCardName(card, text)))
            .Where(item => item.Score > 0)
            .GroupBy(item => item.Score)
            .OrderByDescending(group => group.Key)
            .FirstOrDefault();
        if (ranked != null && ranked.Count() == 1)
        {
            return ranked.First().Card;
        }

        if (wantsDebit && wantsCredit)
        {
            var debitAt = text.LastIndexOf("debit", StringComparison.Ordinal);
            var creditAt = text.LastIndexOf("credit", StringComparison.Ordinal);
            var type = debitAt > creditAt ? "Debit" : "Credit";
            return cards.FirstOrDefault(c => c.CardType.Equals(type, StringComparison.OrdinalIgnoreCase));
        }

        if (!defaultToDebit) return null;

        return cards.FirstOrDefault(c => c.CardType.Equals("Debit", StringComparison.OrdinalIgnoreCase))
            ?? cards.FirstOrDefault();
    }

    private static int ScoreCardName(BankCard card, string text)
    {
        var score = 0;
        foreach (var token in card.CardName.Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            if (token.Length < 4 || GenericCardWords.Contains(token)) continue;
            if (Regex.IsMatch(text, $@"\b{Regex.Escape(token)}\b", RegexOptions.IgnoreCase))
            {
                score += token.Length;
            }
        }

        var last4 = Regex.Match(card.CardNumberMasked, @"(\d{4})\s*$");
        if (last4.Success && Regex.IsMatch(text, $@"\b{last4.Groups[1].Value}\b"))
        {
            score += 20;
        }

        return score;
    }

    private static BankAccount? AccountByKind(IReadOnlyList<BankAccount> accounts, string kind)
    {
        kind = kind.ToLowerInvariant();
        if (kind is "saving" or "savings")
        {
            return accounts.FirstOrDefault(a => a.AccountType.Contains("Saving", StringComparison.OrdinalIgnoreCase));
        }

        if (kind is "investment" or "portfolio" or "wealth")
        {
            return accounts.FirstOrDefault(a =>
                a.AccountType.Contains("Wealth", StringComparison.OrdinalIgnoreCase)
                || a.AccountType.Contains("Invest", StringComparison.OrdinalIgnoreCase)
                || a.AccountType.Contains("Portfolio", StringComparison.OrdinalIgnoreCase));
        }

        return accounts.FirstOrDefault(a => a.AccountType.Contains("Checking", StringComparison.OrdinalIgnoreCase));
    }

    private static BankAccount ResolveStatementAccount(IReadOnlyList<BankAccount> accounts, string text)
    {
        var kind = Regex.Match(text, @"\b(savings|saving|checking|investment|portfolio|wealth)\b");
        if (kind.Success)
        {
            var matched = AccountByKind(accounts, kind.Groups[1].Value);
            if (matched != null) return matched;
        }

        return accounts.FirstOrDefault(a => a.Id == "acc-chk-01")
            ?? accounts.FirstOrDefault()
            ?? new BankAccount { Id = "acc-chk-01", AccountType = "Premier Checking", AccountNumber = "CHK-98214-01", Currency = "USD" };
    }

    private static (BankAccount Source, string Recipient, decimal Amount, string Note) ResolveTransfer(
        IReadOnlyList<BankAccount> accounts,
        string text)
    {
        var checking = AccountByKind(accounts, "checking")
            ?? accounts.FirstOrDefault()
            ?? new BankAccount { Id = "acc-chk-01", AccountType = "Premier Checking", AccountNumber = "CHK-98214-01", Currency = "USD" };
        var source = checking;
        var fromMatch = Regex.Match(text, @"\bfrom\s+(?:my\s+)?(savings|saving|checking|investment|portfolio|wealth)\b");
        if (fromMatch.Success)
        {
            source = AccountByKind(accounts, fromMatch.Groups[1].Value) ?? source;
        }

        var toMatch = Regex.Match(text, @"\bto\s+(?:my\s+)?(.+)$");
        var toText = toMatch.Success ? toMatch.Groups[1].Value.Trim().TrimEnd('.', '!', '?') : "";
        toText = Regex.Replace(toText, @"\s+\b(?:for|memo|note)\b.*$", "", RegexOptions.IgnoreCase).Trim();

        string recipient;
        if (string.IsNullOrWhiteSpace(toText))
        {
            recipient = "Alice Vance (Emergency Reserve)";
        }
        else
        {
            var kind = Regex.Match(toText, @"\b(savings|saving|checking|investment|portfolio|wealth)\b");
            if (kind.Success)
            {
                var destination = AccountByKind(accounts, kind.Groups[1].Value);
                recipient = destination == null
                    ? toText
                    : $"{destination.AccountType} ({destination.AccountNumber})";
                if (destination != null && destination.Id == source.Id && !fromMatch.Success)
                {
                    var savings = AccountByKind(accounts, "savings");
                    if (savings != null && savings.Id != destination.Id)
                    {
                        source = savings;
                    }
                }
            }
            else
            {
                recipient = toText;
            }
        }

        var noteMatch = Regex.Match(text, @"\b(?:for|memo|note)\s+(.+)$");
        var note = noteMatch.Success ? noteMatch.Groups[1].Value.Trim().TrimEnd('.', '!', '?') : "Instant transfer";
        return (source, recipient, ParseDirectedMoney(text, 250m), note);
    }

    private static (decimal Amount, string From, string To) ResolveExchange(string text)
    {
        var ordered = new List<string>();
        foreach (Match match in Regex.Matches(text, @"\b(usd|eur|gbp|chf|cad|aud|jpy|sgd)\b"))
        {
            var code = match.Groups[1].Value.ToUpperInvariant();
            if (ordered.Count == 0 || ordered[^1] != code)
            {
                ordered.Add(code);
            }
        }

        var from = ordered.Count > 0 ? ordered[0] : "USD";
        var to = ordered.Count > 1 ? ordered[1] : from == "USD" ? "EUR" : "USD";
        return (ParseDirectedMoney(text, 1000m), from, to);
    }

    private static decimal ParseDirectedMoney(string text, decimal fallback)
    {
        var preferred = Regex.Match(
            text,
            @"(?:transfer|send|pay|convert|exchange|wire)\s+\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?",
            RegexOptions.IgnoreCase);
        if (TryReadMoney(preferred, out var directed)) return directed;

        var dollar = Regex.Match(text, @"\$\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?");
        if (TryReadMoney(dollar, out var withSymbol)) return withSymbol;

        return fallback;
    }

    private static bool TryReadMoney(Match match, out decimal amount)
    {
        amount = 0;
        if (!match.Success) return false;
        var raw = (match.Groups[1].Value + match.Groups[2].Value).Replace(",", "");
        return decimal.TryParse(raw, out amount) && amount > 0;
    }
}
