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
    private readonly HttpClient _httpClient;
    private readonly ILogger<MultiProviderLlmService> _logger;
    private readonly CursorCloudAgentsClient _cursorClient;

    public MultiProviderLlmService(
        IOptions<LlmSettings> settings,
        IBankingService bankingService,
        HttpClient httpClient,
        CursorCloudAgentsClient cursorClient,
        ILogger<MultiProviderLlmService> logger)
    {
        _settings = settings.Value;
        _bankingService = bankingService;
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

        var provider = _settings.Provider.ToLowerInvariant();

        if (provider == "ollama")
        {
            // Real Ollama LLM execution with EF Core Dynamic UI streaming
            await foreach (var evt in StreamFromOllamaWithEfCoreAsync(request, cancellationToken))
            {
                yield return evt;
            }
        }
        else if (provider == "cursor")
        {
            await foreach (var evt in StreamFromCursorCloudAgentAsync(request, cancellationToken))
            {
                yield return evt;
            }
        }
        else if (provider == "mock" || (string.IsNullOrWhiteSpace(_settings.ApiKey) && provider is "gemini" or "openai" or "claude"))
        {
            await foreach (var evt in SimulateDynamicBankingAsync(request, cancellationToken))
            {
                yield return evt;
            }
        }
        else
        {
            await foreach (var evt in StreamFromOpenAiCompatibleEndpointAsync(request, cancellationToken))
            {
                yield return evt;
            }
        }

        yield return new StreamEvent { Type = "done" };
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
        var isCardControls = text.Contains("freeze") || text.Contains("unfreeze") || 
                             text.Contains("lock") || (text.Contains("card") && (text.Contains("limit") || text.Contains("controls") || text.Contains("block")));

        // 3. Specific Action: Password & Authentication Credentials
        var isPasswordReset = text.Contains("password") || 
                              (text.Contains("security") && text.Contains("reset")) ||
                              (text.Contains("account") && text.Contains("credentials")) ||
                              text.Contains("2fa");

        // 4. Specific Action: Fund Transfer
        var isTransfer = text.Contains("transfer") || text.Contains("send money") || 
                         text.Contains("wire") || text.Contains("pay ") || text.Contains("send funds") ||
                         Regex.IsMatch(text, @"\bsend\s+(\$?\d+|funds|money)\b");

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
            var isCredit = text.Contains("credit");
            var cards = await _bankingService.GetCardsAsync();
            var targetCard = cards.FirstOrDefault(c => isCredit ? c.CardType == "Credit" : c.CardType == "Debit") ?? cards.First();

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
            var card = (await _bankingService.GetCardsAsync()).First();
            var shouldFreeze = !text.Contains("unfreeze") && !text.Contains("unlock");

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

            yield return new StreamEvent
            {
                Type = "widget",
                Widget = new WidgetDto
                {
                    Name = "cardControlsWidget",
                    Title = "Card Controls & Security",
                    Props = new Dictionary<string, object>
                    {
                        ["cardId"] = card.Id,
                        ["cardName"] = card.CardName,
                        ["cardNumberMasked"] = card.CardNumberMasked,
                        ["isFrozen"] = shouldFreeze,
                        ["spendingLimit"] = card.SpendingLimit,
                        ["currentBalance"] = card.CurrentBalance
                    }
                }
            };
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
            var account = await _bankingService.GetAccountAsync("acc-chk-01") ?? (await _bankingService.GetAccountsAsync()).First();

            yield return new StreamEvent
            {
                Type = "widget",
                Widget = new WidgetDto
                {
                    Name = "transferConfirmWidget",
                    Title = "Authorize Instant Transfer",
                    Props = new Dictionary<string, object>
                    {
                        ["fromAccount"] = $"{account.AccountType} ({account.AccountNumber})",
                        ["availableBalance"] = account.AvailableBalance,
                        ["recipient"] = "Alice Vance (Emergency Reserve)",
                        ["amount"] = 250.00m,
                        ["note"] = "Instant Reserve Allocation"
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
            yield return new StreamEvent
            {
                Type = "tool_call",
                ToolCall = new ToolCallDto
                {
                    Name = "getLiveExchangeRate",
                    Args = new Dictionary<string, object>
                    {
                        ["from"] = "USD",
                        ["to"] = "EUR",
                        ["amount"] = 1000m
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
                        ["initialAmount"] = 1000m,
                        ["initialFrom"] = "USD",
                        ["initialTo"] = "EUR"
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
            yield return new StreamEvent
            {
                Type = "tool_call",
                ToolCall = new ToolCallDto
                {
                    Name = "fetchStatements",
                    Args = new Dictionary<string, object>
                    {
                        ["accountId"] = "acc-chk-01",
                        ["limit"] = 6
                    }
                }
            };
            await Task.Delay(150, cancellationToken);

            var transactions = await _bankingService.GetStatementsAsync("acc-chk-01", 6);
            var account = await _bankingService.GetAccountAsync("acc-chk-01") ?? (await _bankingService.GetAccountsAsync()).First();

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
        var isCardControls = text.Contains("freeze") || text.Contains("unfreeze") || 
                             text.Contains("lock") || (text.Contains("card") && (text.Contains("limit") || text.Contains("controls") || text.Contains("block")));
        var isPasswordReset = text.Contains("password") || 
                              (text.Contains("security") && text.Contains("reset")) ||
                              (text.Contains("account") && text.Contains("credentials")) ||
                              text.Contains("2fa");
        var isTransfer = text.Contains("transfer") || text.Contains("send money") || 
                         text.Contains("wire") || text.Contains("pay ") || text.Contains("send funds") ||
                         Regex.IsMatch(text, @"\bsend\s+(\$?\d+|funds|money)\b");
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
            var isCredit = text.Contains("credit");
            var cardName = isCredit ? "Apex Black Diamond Elite (Credit Card)" : "Apex Premier Debit Platinum (Debit Card)";
            var intro = $"For security verification, I have initiated a secure PIN reset session for your **{cardName}**. Please enter your new 4-digit PIN and verify with the 2FA code below:";
            foreach (var chunk in SplitIntoWordChunks(intro))
            {
                yield return new StreamEvent { Type = "delta", Content = chunk };
                await Task.Delay(20, cancellationToken);
            }
        }
        else if (isCardControls)
        {
            var intro = "Here are the live card protection switches and spending thresholds from your account:";
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
            var intro = "I have prepared an instant fund transfer for your confirmation. Please review the details and authorize the dispatch:";
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
            var intro = "Here is your live **Wholesale Currency Exchange** converter with real-time interbank rates and zero transaction fees:";
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
            var intro = "I have queried the core EF Core ledger for your **Premier Checking** account:";
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
               - Primary Account: Premier Checking (CHK-98214-01), Balance: $24,890.75
               - Secondary Account: High-Yield Savings (SAV-49102-02), Balance: $78,250.00
               - Active Cards: Apex Premier Debit Platinum (Debit), Apex Black Diamond Elite (Credit)

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
        // Allow transaction inquiries on categories like travel, dining, flights, etc.
        if (text.Contains("spend") || text.Contains("transaction") || text.Contains("statement") || text.Contains("charge") || text.Contains("cost") || text.Contains("chart") || text.Contains("breakdown"))
        {
            reason = string.Empty;
            return false;
        }

        var outOfScopeKeywords = new[]
        {
            "flight", "book flight", "hotel", "book hotel", "ticket", "airline", "weather", "recipe",
            "cook", "joke", "poem", "movie", "song", "sports", "football", "cricket",
            "pizza", "food", "restaurant reservation", "uber", "taxi", "doctor", "medicine",
            "translate", "code", "python", "javascript", "c#", "html", "vacation", "game",
            "car rental", "train ticket", "bus ticket"
        };

        if (outOfScopeKeywords.Any(k => text.Contains(k)))
        {
            reason = "I cannot assist with that request. As your Apex Banking Concierge, I am exclusively authorized to handle retail banking operations for your accounts. I cannot book travel, provide weather/entertainment, or perform non-banking tasks.";
            return true;
        }

        reason = string.Empty;
        return false;
    }
}
