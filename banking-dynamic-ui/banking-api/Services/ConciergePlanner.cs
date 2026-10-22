using System.Globalization;
using System.Text.RegularExpressions;
using BankingApi.Models;

namespace BankingApi.Services;

public sealed record ConciergePlan(string Briefing, IReadOnlyList<StreamEvent> Events);

public interface IConciergePlanner
{
    Task<ConciergePlan> PlanAsync(ChatRequest request, CancellationToken cancellationToken = default);
}

public sealed class ConciergePlanner : IConciergePlanner
{
    private readonly ILedgerInsightService _insights;
    private readonly IFxRateService _fx;

    public ConciergePlanner(ILedgerInsightService insights, IFxRateService fx)
    {
        _insights = insights;
        _fx = fx;
    }

    public async Task<ConciergePlan> PlanAsync(ChatRequest request, CancellationToken cancellationToken = default)
    {
        var text = (request.Message ?? string.Empty).Trim().ToLowerInvariant();
        if (text.Length == 0)
        {
            return new ConciergePlan("Tell me what you want to do with your accounts.", []);
        }

        if (Regex.IsMatch(text, @"^(thanks|thank you|ok|okay|great|perfect)\b"))
        {
            return new ConciergePlan("You're welcome. I can keep going on a charge, a card, a transfer, or your cash flow.", []);
        }

        var snap = await _insights.LoadAsync(cancellationToken);
        var today = DateTime.UtcNow;
        var account = ResolveAccount(snap, text, request.Context);
        var accountTx = snap.Transactions.Where(t => t.AccountId == account.Id).ToList();
        var inherited = Inherit(text, request.History, accountTx);
        var hits = Detect(inherited, accountTx);
        var connector = Regex.IsMatch(inherited, @"\b(and|also|both|plus|then)\b");

        if (hits.Any(h => h.Id == "overview"))
        {
            hits = [Hit("forecast", "Cash-flow forecast", "Forecast my cash flow for this month", 7),
                Hit("budget", "Monthly budget", "Show my monthly budget", 6)];
            connector = true;
        }
        else if (hits.Count == 0)
        {
            return GroundedRefusal();
        }
        else if (hits.Count > 1 && !connector && hits[0].Score < 9 && hits[1].Score >= hits[0].Score - 1)
        {
            return Clarify(hits.Take(2).ToList());
        }
        else
        {
            hits = connector ? hits.Take(2).ToList() : [hits[0]];
        }

        var paragraphs = new List<string>();
        var events = new List<StreamEvent>();
        foreach (var hit in hits)
        {
            var piece = await BuildAsync(hit, inherited, snap, account, accountTx, request.Context, today, cancellationToken);
            if (!string.IsNullOrWhiteSpace(piece.Text)) paragraphs.Add(piece.Text.Trim());
            events.AddRange(piece.Events);
        }

        if (paragraphs.Count == 0)
        {
            return GroundedRefusal();
        }

        return new ConciergePlan(string.Join("\n\n", paragraphs), events);
    }

    private static ConciergePlan GroundedRefusal() =>
        new(
            "I cannot fulfill this request. I only help with your Apex accounts: statements, cards, transfers, budgets, subscriptions, cash flow, and similar banking tasks. I cannot answer general knowledge, math, people, or other topics.",
            []);

    private static ConciergePlan Clarify(IReadOnlyList<IntentHit> hits)
    {
        var options = hits.Select(h => new Dictionary<string, object>
        {
            ["label"] = h.Label,
            ["message"] = h.Prompt
        }).ToList();
        var briefing = "I can do each of these from your live accounts. Choose one and I will open it: "
            + string.Join(", or ", hits.Select(h => h.Label.ToLowerInvariant())) + ".";
        return new ConciergePlan(briefing,
        [
            Tool("clarifyIntent", new Dictionary<string, object> { ["count"] = hits.Count }),
            Widget("clarificationWidget", "Choose a banking action", new Dictionary<string, object>
            {
                ["question"] = "Which one should I open?",
                ["options"] = options
            })
        ]);
    }

    private async Task<(string Text, List<StreamEvent> Events)> BuildAsync(
        IntentHit hit,
        string text,
        LedgerSnapshot snap,
        BankAccount account,
        List<BankTransaction> accountTx,
        ChatPageContext? context,
        DateTime today,
        CancellationToken cancellationToken)
    {
        return hit.Id switch
        {
            "pin" => Pin(text, snap, context),
            "controls" => Controls(text, snap, context),
            "password" => Password(snap),
            "transfer" => Transfer(text, snap, account),
            "goal" => Goal(text, snap, account),
            "allocation" => Allocation(text, snap, account),
            "loan" => Loan(text),
            "fx" => await Fx(text, cancellationToken),
            "explain" => Explain(text, accountTx, context, snap),
            "anomaly" => Anomaly(account, accountTx),
            "subscriptions" => Subscriptions(account, accountTx),
            "forecast" => Forecast(account, accountTx, today),
            "budget" => Budget(account, accountTx, snap, today),
            "chart" => Chart(text, account, accountTx),
            "statement" => Statement(text, account, accountTx, today),
            "dispute" => Dispute(text, accountTx, context),
            "travel" => Travel(text, snap, context, today),
            "audit" => Audit(snap),
            "greeting" => Greeting(snap, account, accountTx, today),
            _ => ("", [])
        };
    }

    private static (string Text, List<StreamEvent> Events) Pin(string text, LedgerSnapshot snap, ChatPageContext? context)
    {
        var card = ResolveCard(snap.Cards, text, context, defaultToDebit: false);
        if (card == null)
        {
            var plan = Clarify([
                Hit("pin", "Debit card PIN", "Reset the PIN for my debit card", 9),
                Hit("pin", "Credit card PIN", "Reset the PIN for my credit card", 9)
            ]);
            return (plan.Briefing, plan.Events.ToList());
        }

        var textOut = $"I opened a PIN reset for your {card.CardName} ({card.CardType} card, {card.CardNumberMasked}). Enter a new 4-digit PIN in the card below. The change posts to the card record and the audit log.";
        return (textOut,
        [
            Tool("initiatePinReset", new Dictionary<string, object> { ["cardId"] = card.Id, ["cardType"] = card.CardType }),
            Widget("cardPinResetWidget", $"Secure PIN Reset - {card.CardType} Card", new Dictionary<string, object>
            {
                ["cardId"] = card.Id,
                ["cardName"] = card.CardName,
                ["cardNumberMasked"] = card.CardNumberMasked,
                ["cardType"] = card.CardType,
                ["isFrozen"] = card.IsFrozen
            })
        ]);
    }

    private static (string Text, List<StreamEvent> Events) Controls(string text, LedgerSnapshot snap, ChatPageContext? context)
    {
        var card = ResolveCard(snap.Cards, text, context, defaultToDebit: false);
        if (card == null)
        {
            var plan = Clarify([
                Hit("controls", "Debit card", "Freeze my debit card", 8),
                Hit("controls", "Credit card", "Freeze my credit card", 8)
            ]);
            return (plan.Briefing, plan.Events.ToList());
        }

        var changing = TryGetFreeze(text, out var freeze);
        var spoken = changing
            ? $"The controls below are for your {card.CardName}. Confirm {(freeze ? "freeze" : "unfreeze")} and I will write it to the card and the audit log. Current limit is {LedgerAnalytics.Money(card.SpendingLimit)}."
            : $"Here are the live controls for {card.CardName}. It is {(card.IsFrozen ? "frozen" : "active")} with a {LedgerAnalytics.Money(card.SpendingLimit)} limit and a posted card balance of {LedgerAnalytics.Money(card.CurrentBalance)}.";
        return (spoken,
        [
            Tool("toggleCardFreeze", new Dictionary<string, object> { ["cardId"] = card.Id, ["freeze"] = changing && freeze }),
            Widget("cardControlsWidget", $"{card.CardType} Card Controls", new Dictionary<string, object>
            {
                ["cardId"] = card.Id,
                ["cardName"] = card.CardName,
                ["cardNumberMasked"] = card.CardNumberMasked,
                ["cardType"] = card.CardType,
                ["isFrozen"] = changing ? freeze : card.IsFrozen,
                ["spendingLimit"] = card.SpendingLimit,
                ["currentBalance"] = card.CurrentBalance
            })
        ]);
    }

    private static (string Text, List<StreamEvent> Events) Password(LedgerSnapshot snap)
    {
        var email = snap.User?.Email ?? "a.vance@example.com";
        return ($"Password reset is ready for {email}. The new password is saved on your user record and written to the audit log.",
        [
            Tool("verifySecurityContext", new Dictionary<string, object> { ["action"] = "password_reset_flow" }),
            Widget("passwordResetWidget", "Online Banking Password Reset", new Dictionary<string, object>
            {
                ["userEmail"] = email,
                ["requireOtp"] = true
            })
        ]);
    }

    private static (string Text, List<StreamEvent> Events) Transfer(string text, LedgerSnapshot snap, BankAccount fallback)
    {
        var source = ResolveSource(snap.Accounts, text, fallback);
        var amount = ParseMoney(text, 0);
        var payee = MatchPayee(text, snap.Payees);
        var recipient = RecipientLabel(text, snap, source, payee);
        if (amount <= 0)
        {
            return ($"I can send from {source.AccountType}, which has {LedgerAnalytics.Money(source.AvailableBalance)} available. Tell me the amount and who should receive it, for example \"Transfer $250 to emergency savings\".", []);
        }

        if (amount > source.AvailableBalance)
        {
            return ($"{source.AccountType} has {LedgerAnalytics.Money(source.AvailableBalance)} available, which is less than {LedgerAnalytics.Money(amount)}. Lower the amount or pick another account.", []);
        }

        var stepUp = amount >= 1000m;
        var note = "Instant transfer";
        var noteMatch = Regex.Match(text, @"\b(?:for|memo|note)\s+(.+)$");
        if (noteMatch.Success) note = noteMatch.Groups[1].Value.Trim().TrimEnd('.', '!', '?');

        var spoken = $"Prepared {LedgerAnalytics.Money(amount)} from {source.AccountType} ({source.AccountNumber}) to {recipient}. Available before this transfer is {LedgerAnalytics.Money(source.AvailableBalance)}.";
        if (stepUp) spoken += " This amount needs an extra confirmation in the card before it posts.";
        spoken += " Authorize it and the ledger and audit log update immediately.";

        return (spoken,
        [
            Tool("prepareTransfer", new Dictionary<string, object> { ["amount"] = amount, ["recipient"] = recipient }),
            Widget("transferConfirmWidget", "Authorize Instant Transfer", new Dictionary<string, object>
            {
                ["fromAccountId"] = source.Id,
                ["fromAccount"] = $"{source.AccountType} ({source.AccountNumber})",
                ["availableBalance"] = source.AvailableBalance,
                ["recipient"] = recipient,
                ["amount"] = amount,
                ["note"] = note,
                ["stepUpRequired"] = stepUp
            })
        ]);
    }

    private static (string Text, List<StreamEvent> Events) Goal(string text, LedgerSnapshot snap, BankAccount fallback)
    {
        var source = ResolveSource(snap.Accounts, text, fallback);
        var months = ParseMonths(text, 6);
        var buffer = ParseKeep(text, 500m);
        var target = ParseMoney(text, 0);
        var usingSpare = false;
        if (target <= 0)
        {
            target = Math.Max(0, source.AvailableBalance - buffer);
            usingSpare = true;
        }

        if (target < 50 || months <= 0)
        {
            return ($"{source.AccountType} has {LedgerAnalytics.Money(source.AvailableBalance)} available. After keeping {LedgerAnalytics.Money(buffer)} in checking there is not enough spare cash to fund a goal. Name a target, for example \"Save $5,000 in 6 months\".", []);
        }

        var monthly = Math.Round(target / months, 2);
        var savings = snap.Accounts.FirstOrDefault(a => a.Id == "acc-sav-02") ?? source;
        var recipient = $"{savings.AccountType} ({savings.AccountNumber})";
        var canFund = source.AvailableBalance - buffer >= monthly;
        var spoken = usingSpare
            ? $"Spare cash above a {LedgerAnalytics.Money(buffer)} checking buffer is {LedgerAnalytics.Money(target)}. Spread over {months} months that is {LedgerAnalytics.Money(monthly)} a month into {savings.AccountType}."
            : $"A {LedgerAnalytics.Money(target)} goal in {months} months is {LedgerAnalytics.Money(monthly)} a month from {source.AccountType} into {savings.AccountType}, while keeping {LedgerAnalytics.Money(buffer)} in checking.";
        spoken += canFund
            ? " The first transfer is ready below."
            : " The first month is larger than what is free after the buffer, so I have not posted it.";

        return (spoken,
        [
            Tool("planSavingsGoal", new Dictionary<string, object> { ["monthly"] = monthly, ["months"] = months }),
            Widget("goalPlannerWidget", "Savings Goal", new Dictionary<string, object>
            {
                ["targetAmount"] = target,
                ["months"] = months,
                ["monthlyAmount"] = monthly,
                ["buffer"] = buffer,
                ["available"] = source.AvailableBalance,
                ["fromAccountId"] = source.Id,
                ["fromAccount"] = source.AccountType,
                ["recipient"] = recipient,
                ["canFund"] = canFund
            })
        ]);
    }

    private static (string Text, List<StreamEvent> Events) Allocation(string text, LedgerSnapshot snap, BankAccount fallback)
    {
        var source = snap.Accounts.FirstOrDefault(a => a.Id == "acc-chk-01") ?? fallback;
        var buffer = 2000m;
        var amount = ParseMoney(text, 0);
        if (amount <= 0) amount = Math.Max(0, source.AvailableBalance - buffer);
        if (amount < 50)
        {
            return ($"Checking has {LedgerAnalytics.Money(source.AvailableBalance)} available. I keep {LedgerAnalytics.Money(buffer)} as a buffer, and there is no spare cash above that to place.", []);
        }

        if (amount > source.AvailableBalance - 1) amount = source.AvailableBalance;
        var savings = snap.Accounts.First(a => a.Id == "acc-sav-02");
        var invest = snap.Accounts.First(a => a.Id == "acc-inv-03");
        var toSavings = Math.Round(amount * 0.70m, 2);
        var toInvest = Math.Round(amount - toSavings, 2);
        var slices = new List<Dictionary<string, object>>
        {
            new()
            {
                ["accountId"] = savings.Id,
                ["name"] = $"{savings.AccountType} ({savings.AccountNumber})",
                ["amount"] = toSavings,
                ["reason"] = "High-yield savings at 4.75% APY"
            },
            new()
            {
                ["accountId"] = invest.Id,
                ["name"] = $"{invest.AccountType} ({invest.AccountNumber})",
                ["amount"] = toInvest,
                ["reason"] = "Longer-term portfolio"
            }
        };

        var spoken = $"From {LedgerAnalytics.Money(source.AvailableBalance)} in checking I would move {LedgerAnalytics.Money(amount)} and leave at least {LedgerAnalytics.Money(source.AvailableBalance - amount)} in place. {LedgerAnalytics.Money(toSavings)} goes to savings and {LedgerAnalytics.Money(toInvest)} to the portfolio. Both legs post as real transfers when you authorize them.";
        return (spoken,
        [
            Tool("suggestAllocation", new Dictionary<string, object> { ["amount"] = amount }),
            Widget("allocationWidget", "Cash Allocation", new Dictionary<string, object>
            {
                ["amount"] = amount,
                ["fromAccountId"] = source.Id,
                ["fromAccount"] = $"{source.AccountType} ({source.AccountNumber})",
                ["slices"] = slices
            })
        ]);
    }

    private static (string Text, List<StreamEvent> Events) Loan(string text)
    {
        var principal = ParseMoney(text, 35000m);
        if (principal < 1000) principal = 35000m;
        var months = ParseMonths(text, 48);
        var rate = 6.45m;
        var rateMatch = Regex.Match(text, @"\b(\d{1,2}(?:\.\d{1,2})?)\s*(%|percent)\b");
        if (rateMatch.Success && decimal.TryParse(rateMatch.Groups[1].Value, out var parsedRate)) rate = parsedRate;
        var payment = MonthlyPayment(principal, rate, months);
        var extra = 0m;
        var extraMatch = Regex.Match(text, @"\bextra\s+\$?\s*(\d+(?:\.\d{1,2})?)\b");
        if (extraMatch.Success) decimal.TryParse(extraMatch.Groups[1].Value, out extra);

        var spoken = $"At {LedgerAnalytics.Money(principal)} for {months} months at {rate.ToString("0.00", CultureInfo.InvariantCulture)}% the scheduled payment is {LedgerAnalytics.Money(payment)}.";
        if (extra > 0)
        {
            var baseMonths = MonthsToPayoff(principal, rate, payment);
            var faster = MonthsToPayoff(principal, rate, payment + extra);
            var savedMonths = Math.Max(0, baseMonths - faster);
            spoken += $" Paying an extra {LedgerAnalytics.Money(extra)} a month finishes about {savedMonths} months sooner ({faster} months instead of {baseMonths}).";
        }

        spoken += " The calculator below uses these starting values and recalculates as you move the sliders.";
        return (spoken,
        [
            Tool("calculateLoanEstimate", new Dictionary<string, object> { ["principal"] = principal, ["interestRate"] = rate, ["termMonths"] = months }),
            Widget("loanCalculatorWidget", "Financing & Loan Estimator", new Dictionary<string, object>
            {
                ["title"] = "Loan & Financing Estimator",
                ["loanType"] = "Premier Flex Credit",
                ["currency"] = "USD",
                ["initialPrincipal"] = principal,
                ["initialRate"] = rate,
                ["initialTermMonths"] = months
            })
        ]);
    }

    private async Task<(string Text, List<StreamEvent> Events)> Fx(string text, CancellationToken cancellationToken)
    {
        var exchange = ResolveExchange(text);
        string spoken;
        try
        {
            var quote = await _fx.QuoteAsync(exchange.From, exchange.To, exchange.Amount, cancellationToken);
            spoken = $"Live {quote.Source} rate for {quote.AsOf:MMMM d, yyyy}: 1 {quote.From} = {quote.Rate.ToString("0.######", CultureInfo.InvariantCulture)} {quote.To}. {quote.Amount.ToString("#,##0.##", CultureInfo.InvariantCulture)} {quote.From} converts to {quote.Converted.ToString("#,##0.00", CultureInfo.InvariantCulture)} {quote.To}. The converter below loads that same rate table.";
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            spoken = $"I could not reach a live FX rate service just now ({ex.Message}). The converter will try again when it opens.";
        }

        return (spoken,
        [
            Tool("getLiveExchangeRate", new Dictionary<string, object> { ["from"] = exchange.From, ["to"] = exchange.To, ["amount"] = exchange.Amount }),
            Widget("currencyExchangeWidget", "Live Currency Exchange", new Dictionary<string, object>
            {
                ["title"] = "Live Interbank Currency Exchange",
                ["initialAmount"] = exchange.Amount,
                ["initialFrom"] = exchange.From,
                ["initialTo"] = exchange.To
            })
        ]);
    }

    private static (string Text, List<StreamEvent> Events) Explain(string text, List<BankTransaction> accountTx, ChatPageContext? context, LedgerSnapshot snap)
    {
        BankTransaction? selected = null;
        if (!string.IsNullOrWhiteSpace(context?.TransactionId))
        {
            selected = accountTx.FirstOrDefault(t => t.Id == context.TransactionId)
                ?? snap.Transactions.FirstOrDefault(t => t.Id == context.TransactionId);
        }

        var merchant = selected == null ? LedgerAnalytics.MatchMerchant(text, accountTx) : null;
        var insight = selected != null
            ? LedgerAnalytics.Explain(accountTx, selected.Description)
            : merchant == null ? null : LedgerAnalytics.Explain(accountTx, merchant);
        if (insight == null)
        {
            return ("Name the merchant you want me to compare, for example \"Why is Starbucks higher than usual?\"", []);
        }

        var delta = Math.Abs(insight.LatestAmount) - insight.AverageAmount;
        var direction = delta > 1 ? $"{LedgerAnalytics.Money(delta)} above" : delta < -1 ? $"{LedgerAnalytics.Money(Math.Abs(delta))} below" : "in line with";
        var spoken = $"{insight.Merchant} has {insight.Count} posted charge{(insight.Count == 1 ? "" : "s")} on this account. The latest is {LedgerAnalytics.Money(Math.Abs(insight.LatestAmount))} on {insight.LatestDate:MMMM d}, which is {direction} the {LedgerAnalytics.Money(insight.AverageAmount)} average.";
        var rows = insight.Recent.Select(TxRow).ToList();
        return (spoken,
        [
            Tool("explainMerchant", new Dictionary<string, object> { ["merchant"] = insight.Merchant }),
            Widget("merchantInsightWidget", "Merchant Comparison", new Dictionary<string, object>
            {
                ["merchant"] = insight.Merchant,
                ["count"] = insight.Count,
                ["latestAmount"] = insight.LatestAmount,
                ["averageAmount"] = insight.AverageAmount,
                ["latestDate"] = insight.LatestDate.ToString("yyyy-MM-dd"),
                ["transactions"] = rows
            })
        ]);
    }

    private static (string Text, List<StreamEvent> Events) Anomaly(BankAccount account, List<BankTransaction> accountTx)
    {
        var items = LedgerAnalytics.Anomalies(accountTx);
        var spoken = items.Count == 0
            ? $"I compared posted debits on {account.AccountType} and did not find a duplicate, a spike against the merchant's own history, or a purchase above $1,000."
            : $"On {account.AccountType} I found {items.Count} charge{(items.Count == 1 ? "" : "s")} that stand out. {items[0].Description} for {LedgerAnalytics.Money(Math.Abs(items[0].Amount))}: {items[0].Reason}";
        var rows = items.Select(a => new Dictionary<string, object>
        {
            ["transactionId"] = a.TransactionId,
            ["date"] = a.Date.ToString("yyyy-MM-dd"),
            ["description"] = a.Description,
            ["amount"] = a.Amount,
            ["reason"] = a.Reason
        }).ToList();
        return (spoken,
        [
            Tool("reviewAnomalies", new Dictionary<string, object> { ["count"] = items.Count }),
            Widget("activityReviewWidget", "Unusual Activity", new Dictionary<string, object> { ["items"] = rows })
        ]);
    }

    private static (string Text, List<StreamEvent> Events) Subscriptions(BankAccount account, List<BankTransaction> accountTx)
    {
        var items = LedgerAnalytics.Subscriptions(accountTx);
        var monthly = items.Where(s => s.Cadence == "Monthly").Sum(s => s.TypicalAmount);
        var spoken = items.Count == 0
            ? $"I did not find a merchant that repeats across two or more months with a stable amount on {account.AccountType}."
            : $"I found {items.Count} recurring merchant{(items.Count == 1 ? "" : "s")} on {account.AccountType}. The monthly ones add up to {LedgerAnalytics.Money(monthly)}, about {LedgerAnalytics.Money(monthly * 12)} a year. Largest is {items[0].Merchant} at {LedgerAnalytics.Money(items[0].TypicalAmount)}.";
        var rows = items.Select(s => new Dictionary<string, object>
        {
            ["merchant"] = s.Merchant,
            ["category"] = s.Category,
            ["typicalAmount"] = s.TypicalAmount,
            ["occurrences"] = s.Occurrences,
            ["cadence"] = s.Cadence,
            ["lastDate"] = s.LastDate.ToString("yyyy-MM-dd")
        }).ToList();
        return (spoken,
        [
            Tool("findSubscriptions", new Dictionary<string, object> { ["count"] = items.Count }),
            Widget("subscriptionWidget", "Recurring Charges", new Dictionary<string, object>
            {
                ["monthlyTotal"] = monthly,
                ["yearlyTotal"] = monthly * 12m,
                ["items"] = rows
            })
        ]);
    }

    private static (string Text, List<StreamEvent> Events) Forecast(BankAccount account, List<BankTransaction> accountTx, DateTime today)
    {
        var forecast = LedgerAnalytics.Forecast(account, accountTx, today);
        var spoken = $"{account.AccountType} balance is {LedgerAnalytics.Money(forecast.CurrentBalance)}. This month you have posted {LedgerAnalytics.Money(forecast.IncomeThisMonth)} in and {LedgerAnalytics.Money(forecast.SpentThisMonth)} out. Based on the prior two months, about {LedgerAnalytics.Money(forecast.ProjectedExtraSpend)} of spending may still post over the {forecast.DaysRemaining} days left. I project about {LedgerAnalytics.Money(forecast.ProjectedEndBalance)} on the last day of the month.";
        return (spoken,
        [
            Tool("projectCashFlow", new Dictionary<string, object> { ["projectedEnd"] = forecast.ProjectedEndBalance }),
            Widget("forecastWidget", "Cash-Flow Forecast", new Dictionary<string, object>
            {
                ["accountName"] = account.AccountType,
                ["currentBalance"] = forecast.CurrentBalance,
                ["projectedEndBalance"] = forecast.ProjectedEndBalance,
                ["incomeThisMonth"] = forecast.IncomeThisMonth,
                ["spentThisMonth"] = forecast.SpentThisMonth,
                ["projectedExtraSpend"] = forecast.ProjectedExtraSpend,
                ["daysRemaining"] = forecast.DaysRemaining
            })
        ]);
    }

    private static (string Text, List<StreamEvent> Events) Budget(BankAccount account, List<BankTransaction> accountTx, LedgerSnapshot snap, DateTime today)
    {
        var rows = LedgerAnalytics.Budget(accountTx, snap.Budgets, today);
        var over = rows.Where(r => r.Spent > r.Limit).OrderByDescending(r => r.Spent - r.Limit).ToList();
        var spoken = over.Count == 0
            ? $"Every tracked category on {account.AccountType} is inside its {today:MMMM} limit."
            : $"{over[0].Category} is the furthest over its {today:MMMM} limit: {LedgerAnalytics.Money(over[0].Spent)} spent against {LedgerAnalytics.Money(over[0].Limit)}.";
        var items = rows.Select(r => new Dictionary<string, object>
        {
            ["category"] = r.Category,
            ["spent"] = r.Spent,
            ["limit"] = r.Limit,
            ["icon"] = r.Icon
        }).ToList();
        return (spoken,
        [
            Tool("fetchBudgetGoals", new Dictionary<string, object> { ["period"] = today.ToString("yyyy-MM") }),
            Widget("budgetAnalyticsWidget", "Monthly Budget", new Dictionary<string, object>
            {
                ["title"] = "Monthly Category Budgets",
                ["month"] = today.ToString("MMMM yyyy"),
                ["currency"] = "USD",
                ["items"] = items
            })
        ]);
    }

    private static (string Text, List<StreamEvent> Events) Chart(string text, BankAccount account, List<BankTransaction> accountTx)
    {
        var chartType = "pie";
        if (text.Contains("donut") || text.Contains("doughnut")) chartType = "doughnut";
        else if (text.Contains("line") || text.Contains("trend")) chartType = "line";
        else if (text.Contains("bar")) chartType = "bar";

        var categories = accountTx.Where(LedgerAnalytics.IsDebit)
            .GroupBy(t => t.Category)
            .Select(g => new { Name = g.Key, Total = g.Sum(t => Math.Abs(t.Amount)) })
            .OrderByDescending(c => c.Total)
            .ToList();
        if (categories.Count == 0)
        {
            return ($"{account.AccountType} has no posted debits to chart.", []);
        }

        var total = categories.Sum(c => c.Total);
        var top = categories[0];
        var pct = total == 0 ? 0 : Math.Round(top.Total / total * 100m, 1);
        var spoken = $"{account.AccountType} debits total {LedgerAnalytics.Money(total)}. {top.Name} is {pct.ToString("0.0", CultureInfo.InvariantCulture)}% of that, at {LedgerAnalytics.Money(top.Total)}.";
        return (spoken,
        [
            Tool("generateFinancialChart", new Dictionary<string, object> { ["chartType"] = chartType, ["metric"] = "spending_by_category" }),
            Widget("chartWidget", "Spending Distribution", new Dictionary<string, object>
            {
                ["title"] = $"{char.ToUpper(chartType[0]) + chartType[1..]} Expense Distribution",
                ["subtitle"] = $"Posted debits on {account.AccountType}",
                ["chartType"] = chartType,
                ["labels"] = categories.Select(c => c.Name).ToList(),
                ["data"] = categories.Select(c => c.Total).ToList(),
                ["totalAmount"] = total,
                ["currency"] = account.Currency,
                ["insights"] = new List<string> { $"{top.Name} is {pct.ToString("0.0", CultureInfo.InvariantCulture)}% of posted outflows on this account." }
            })
        ]);
    }

    private static (string Text, List<StreamEvent> Events) Statement(string text, BankAccount account, List<BankTransaction> accountTx, DateTime today)
    {
        var merchant = LedgerAnalytics.MatchMerchant(text, accountTx);
        var min = ParseMinimum(text);
        int? month = null;
        int? year = null;
        if (text.Contains("this month"))
        {
            month = today.Month;
            year = today.Year;
        }
        else if (text.Contains("last month"))
        {
            var last = today.AddMonths(-1);
            month = last.Month;
            year = last.Year;
        }
        else
        {
            month = ParseMonthName(text);
            if (month != null) year = month > today.Month ? today.Year - 1 : today.Year;
        }

        var filtered = (merchant != null || min != null || month != null)
            ? LedgerAnalytics.Search(accountTx, merchant, min, month, year)
            : accountTx.OrderByDescending(t => t.Date).Take(8).ToList();

        var spoken = filtered.Count == 0
            ? $"No posted rows on {account.AccountType} matched that search."
            : $"Showing {filtered.Count} posted row{(filtered.Count == 1 ? "" : "s")} on {account.AccountType}. The newest is {filtered[0].Description} for {LedgerAnalytics.Money(Math.Abs(filtered[0].Amount))} on {filtered[0].Date:MMMM d}. Balance on the account is {LedgerAnalytics.Money(account.Balance)}.";
        return (spoken,
        [
            Tool("searchTransactions", new Dictionary<string, object> { ["count"] = filtered.Count, ["accountId"] = account.Id }),
            Widget("statementWidget", "Account Statement Explorer", new Dictionary<string, object>
            {
                ["accountName"] = account.AccountType,
                ["accountNumber"] = account.AccountNumber,
                ["balance"] = account.Balance,
                ["currency"] = account.Currency,
                ["transactions"] = filtered.Select(TxRow).ToList()
            })
        ]);
    }

    private static (string Text, List<StreamEvent> Events) Dispute(string text, List<BankTransaction> accountTx, ChatPageContext? context)
    {
        var merchant = LedgerAnalytics.MatchMerchant(text, accountTx);
        var pool = merchant == null
            ? accountTx.Where(LedgerAnalytics.IsDebit).OrderByDescending(t => t.Date).Take(6).ToList()
            : LedgerAnalytics.Search(accountTx, merchant, null, null, null);
        if (!string.IsNullOrWhiteSpace(context?.TransactionId))
        {
            var selected = accountTx.FirstOrDefault(t => t.Id == context.TransactionId);
            if (selected != null && pool.All(t => t.Id != selected.Id)) pool.Insert(0, selected);
        }

        var spoken = pool.Count == 0
            ? "There is no posted debit to dispute on this account."
            : $"I loaded {pool.Count} debit{(pool.Count == 1 ? "" : "s")} you can dispute. Filing one opens a case and writes an audit row. It does not delete the original transaction.";
        var rows = pool.Select(t => new Dictionary<string, object>
        {
            ["id"] = t.Id,
            ["description"] = t.Description,
            ["amount"] = t.Amount,
            ["date"] = t.Date.ToString("yyyy-MM-dd")
        }).ToList();
        return (spoken,
        [
            Tool("openDispute", new Dictionary<string, object> { ["count"] = pool.Count }),
            Widget("disputeWidget", "Dispute a Charge", new Dictionary<string, object>
            {
                ["selectedId"] = pool.FirstOrDefault()?.Id ?? "",
                ["candidates"] = rows
            })
        ]);
    }

    private static (string Text, List<StreamEvent> Events) Travel(string text, LedgerSnapshot snap, ChatPageContext? context, DateTime today)
    {
        var card = ResolveCard(snap.Cards, text, context, defaultToDebit: false)
            ?? snap.Cards.FirstOrDefault(c => c.CardType.Equals("Credit", StringComparison.OrdinalIgnoreCase))
            ?? snap.Cards.FirstOrDefault();
        if (card == null) return ("I do not see a card to attach a travel notice to.", []);

        var destination = ParseDestination(text);
        var start = today.Date.AddDays(1);
        var days = text.Contains("week") ? 7 : 10;
        var end = start.AddDays(days);
        var suggested = Math.Ceiling((card.SpendingLimit + 2000m) / 100m) * 100m;
        var spoken = $"Travel notice for {destination}, {start:MMMM d} through {end:MMMM d}, on {card.CardName}. I can raise the limit from {LedgerAnalytics.Money(card.SpendingLimit)} to {LedgerAnalytics.Money(suggested)} for that trip. Apply it and the card record and audit log update.";
        return (spoken,
        [
            Tool("setTravelNotice", new Dictionary<string, object> { ["destination"] = destination, ["cardId"] = card.Id }),
            Widget("travelNoticeWidget", "Travel Notice", new Dictionary<string, object>
            {
                ["destination"] = destination,
                ["startDate"] = start.ToString("yyyy-MM-dd"),
                ["endDate"] = end.ToString("yyyy-MM-dd"),
                ["cardId"] = card.Id,
                ["cardName"] = card.CardName,
                ["currentLimit"] = card.SpendingLimit,
                ["suggestedLimit"] = suggested
            })
        ]);
    }

    private static (string Text, List<StreamEvent> Events) Audit(LedgerSnapshot snap)
    {
        var rows = snap.Audits.Select(a => new Dictionary<string, object>
        {
            ["timestamp"] = a.Timestamp.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ"),
            ["action"] = a.Action,
            ["initiator"] = a.Initiator,
            ["details"] = a.Details
        }).ToList();
        var spoken = rows.Count == 0
            ? "The audit log is empty. Card, transfer, dispute, and travel actions will show up here after you confirm them."
            : $"The latest audited action is {snap.Audits[0].Action} at {snap.Audits[0].Timestamp.ToLocalTime():MMM d, h:mm tt}. {snap.Audits[0].Details}";
        return (spoken,
        [
            Tool("reviewAudit", new Dictionary<string, object> { ["count"] = rows.Count }),
            Widget("auditTimelineWidget", "AI Audit Trail", new Dictionary<string, object> { ["items"] = rows })
        ]);
    }

    private (string Text, List<StreamEvent> Events) Greeting(LedgerSnapshot snap, BankAccount account, List<BankTransaction> accountTx, DateTime today)
    {
        var feed = Feed(snap, account, accountTx, today);
        var name = snap.User?.FullName ?? "Alex";
        var spoken = $"Hello {name}. {AccountLine(account)} Your full portfolio is {LedgerAnalytics.Money(snap.Accounts.Sum(a => a.Balance))}. I can open statements, cards, transfers, subscriptions, unusual charges, a cash-flow forecast, a budget, or a travel notice from the live ledger.";
        return (spoken, ChipEvents("Start from your live accounts", feed.Chips));
    }

    private static InsightFeedDto Feed(LedgerSnapshot snap, BankAccount account, List<BankTransaction> accountTx, DateTime today)
    {
        var subs = LedgerAnalytics.Subscriptions(accountTx);
        var anomalies = LedgerAnalytics.Anomalies(accountTx);
        var forecast = LedgerAnalytics.Forecast(account, accountTx, today);
        var budget = LedgerAnalytics.Budget(accountTx, snap.Budgets, today);
        var monthStart = new DateTime(today.Year, today.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        return new InsightFeedDto(
            snap.Accounts.Sum(a => a.Balance),
            snap.Transactions.Where(t => t.Date >= monthStart).Sum(t => t.Amount),
            forecast.ProjectedEndBalance,
            account.Id,
            LedgerAnalytics.Chips(anomalies, subs, forecast, budget));
    }

    private static List<StreamEvent> ChipEvents(string question, IReadOnlyList<InsightChipDto> chips)
    {
        if (chips.Count == 0) return [];
        return
        [
            Tool("clarifyIntent", new Dictionary<string, object> { ["count"] = chips.Count }),
            Widget("clarificationWidget", "Suggested next steps", new Dictionary<string, object>
            {
                ["question"] = question,
                ["options"] = chips.Select(c => new Dictionary<string, object>
                {
                    ["label"] = c.Label,
                    ["message"] = c.Prompt
                }).ToList()
            })
        ];
    }

    private static List<IntentHit> Detect(string text, List<BankTransaction> accountTx)
    {
        var hits = new List<IntentHit>();
        void Add(string id, string label, string prompt, int score, bool when)
        {
            if (when) hits.Add(Hit(id, label, prompt, score));
        }

        Add("dispute", "Dispute a charge", "Dispute a charge on my checking account", 10,
            Regex.IsMatch(text, @"\b(dispute|chargeback)\b"));
        Add("travel", "Travel notice", "Set a travel notice for Japan next week", 9,
            Regex.IsMatch(text, @"\b(travel notice|traveling|travelling|abroad|trip to|going to)\b")
            && !Regex.IsMatch(text, @"\b(transfer|wire)\b"));
        Add("pin", "Card PIN reset", "Reset the PIN for my debit card", 9,
            Regex.IsMatch(text, @"\bpin\b") || (text.Contains("card") && Regex.IsMatch(text, @"\b(reset|change)\b") && !text.Contains("password")));
        Add("password", "Password reset", "Reset my online banking password", 9,
            text.Contains("password") || text.Contains("2fa") || text.Contains("credentials"));
        Add("controls", "Card controls", "Freeze my debit card", 8,
            Regex.IsMatch(text, @"\b(freeze|unfreeze|unlock|unblock)\b")
            || (Regex.IsMatch(text, @"\bcard\b") && Regex.IsMatch(text, @"\b(limit|limits|controls|control|lock|block)\b")));
        Add("goal", "Savings goal", "Help me save $5,000 in 6 months", 8,
            Regex.IsMatch(text, @"\b(goal|set aside)\b") || (Regex.IsMatch(text, @"\bsave\b") && Regex.IsMatch(text, @"\bmonths?\b")));
        Add("allocation", "Allocate spare cash", "Where should my spare checking cash go?", 8,
            Regex.IsMatch(text, @"\b(allocate|allocation)\b") || text.Contains("where should") || text.Contains("spare"));
        Add("transfer", "Transfer", "Transfer $250 to emergency savings", 8, IsTransfer(text) && !Regex.IsMatch(text, @"\b(goal|set aside)\b"));
        Add("loan", "Loan estimate", "Calculate loan payments for $35,000", 7,
            Regex.IsMatch(text, @"\b(loan|mortgage|emi|borrow|financing)\b"));
        Add("fx", "Currency exchange", "Convert 1,000 USD to EUR", 7,
            text.Contains("convert") || text.Contains("currency") || text.Contains("forex") || Regex.IsMatch(text, @"\bfx\b") || text.Contains("exchange rate")
            || (text.Contains("exchange") && !text.Contains("stock")));
        var merchant = LedgerAnalytics.MatchMerchant(text, accountTx);
        Add("explain", "Explain a merchant", merchant == null ? "Why is Starbucks higher than usual?" : $"Why is {merchant} higher than usual?", 7,
            merchant != null && Regex.IsMatch(text, @"\b(why|explain|higher|compared|unusual)\b"));
        Add("anomaly", "Unusual activity", "Anything unusual on my checking account?", 7,
            Regex.IsMatch(text, @"\b(unusual|odd|suspicious|fraud|anomaly|weird|strange)\b") || text.Contains("out of the ordinary"));
        Add("subscriptions", "Subscriptions", "Find my recurring subscriptions", 7,
            Regex.IsMatch(text, @"\b(subscription|subscriptions|recurring|every month)\b"));
        Add("forecast", "Cash-flow forecast", "Forecast my cash flow for this month", 7,
            Regex.IsMatch(text, @"\b(forecast|cash flow|cashflow|runway|projected)\b") || text.Contains("end of the month") || text.Contains("end of month"));
        Add("audit", "Audit trail", "What did the concierge change?", 7,
            text.Contains("audit") || text.Contains("what changed") || text.Contains("what did"));
        Add("budget", "Monthly budget", "Show my monthly budget", 6,
            text.Contains("budget") || text.Contains("allowance") || text.Contains("spending target")
            || (text.Contains("monthly limit") && !text.Contains("card")));
        Add("chart", "Spending chart", "Show my spending as a pie chart", 6,
            text.Contains("chart") || text.Contains("graph") || text.Contains("doughnut") || text.Contains("donut")
            || text.Contains("pie") || text.Contains("breakdown") || text.Contains("distribution") || Regex.IsMatch(text, @"\bbar\b"));
        var filtered = merchant != null || ParseMinimum(text) != null || ParseMonthName(text) != null || text.Contains("this month") || text.Contains("last month");
        Add("statement", "Statement search", "Show my recent checking account statement", 5,
            text.Contains("statement") || text.Contains("transaction") || text.Contains("history") || text.Contains("ledger")
            || text.Contains("recent activity") || text.Contains("charges") || (filtered && !hits.Any(h => h.Id is "explain" or "dispute" or "anomaly")));
        Add("overview", "Account snapshot", "How am I doing?", 4,
            text.Contains("how am i") || text.Contains("how are my") || text.Contains("snapshot") || text.Contains("catch me up") || text.Contains("what should i know"));
        Add("greeting", "What I can do", "What can you do?", 1,
            Regex.IsMatch(text, @"\b(hello|hi|hey|help)\b") || text.Contains("what can you do"));

        return hits
            .GroupBy(h => h.Id)
            .Select(g => g.OrderByDescending(h => h.Score).First())
            .OrderByDescending(h => h.Score)
            .ToList();
    }

    private static string Inherit(string text, List<ChatMessageItem> history, List<BankTransaction> accountTx)
    {
        if (text.Length > 48 || history.Count == 0) return text;
        if (Detect(text, accountTx).Count > 0) return text;
        var previous = history.LastOrDefault(h => h.Role == "user")?.Content;
        if (string.IsNullOrWhiteSpace(previous)) return text;
        return previous.ToLowerInvariant() + " " + text;
    }

    private static bool IsTransfer(string text)
    {
        if (Regex.IsMatch(text, @"\b(loan|mortgage)\b") && text.Contains("extra")) return false;
        if (Regex.IsMatch(text, @"\b(transfer|wire)\b")) return true;
        if (Regex.IsMatch(text, @"\bsend\b") && Regex.IsMatch(text, @"(\$|\d|\bmoney\b|\bfunds\b)")) return true;
        if (Regex.IsMatch(text, @"\bpay\b") && !Regex.IsMatch(text, @"\b(extra|loan|mortgage|payroll)\b")) return true;
        return false;
    }

    private static BankAccount ResolveAccount(LedgerSnapshot snap, string text, ChatPageContext? context)
    {
        var fromText = AccountByKind(snap.Accounts, text);
        if (fromText != null && Regex.IsMatch(text, @"\b(savings|saving|checking|investment|portfolio|wealth)\b")) return fromText;
        if (!string.IsNullOrWhiteSpace(context?.AccountId))
        {
            var selected = snap.Accounts.FirstOrDefault(a => a.Id == context.AccountId);
            if (selected != null) return selected;
        }

        return snap.Accounts.FirstOrDefault(a => a.Id == "acc-chk-01") ?? snap.Accounts.First();
    }

    private static BankAccount ResolveSource(IReadOnlyList<BankAccount> accounts, string text, BankAccount fallback)
    {
        var from = Regex.Match(text, @"\bfrom\s+(?:my\s+)?(savings|saving|checking|investment|portfolio|wealth)\b");
        if (from.Success) return AccountByKind(accounts, from.Groups[1].Value) ?? fallback;
        return accounts.FirstOrDefault(a => a.Id == "acc-chk-01") ?? fallback;
    }

    private static BankAccount? AccountByKind(IReadOnlyList<BankAccount> accounts, string text)
    {
        if (Regex.IsMatch(text, @"\b(savings|saving)\b"))
            return accounts.FirstOrDefault(a => a.AccountType.Contains("Saving", StringComparison.OrdinalIgnoreCase));
        if (Regex.IsMatch(text, @"\b(investment|portfolio|wealth)\b"))
            return accounts.FirstOrDefault(a => a.AccountType.Contains("Wealth", StringComparison.OrdinalIgnoreCase) || a.AccountType.Contains("Invest", StringComparison.OrdinalIgnoreCase));
        if (Regex.IsMatch(text, @"\bchecking\b"))
            return accounts.FirstOrDefault(a => a.AccountType.Contains("Checking", StringComparison.OrdinalIgnoreCase));
        return null;
    }

    private static string RecipientLabel(string text, LedgerSnapshot snap, BankAccount source, Payee? payee)
    {
        if (payee != null)
        {
            if (payee.IsInternal)
            {
                var dest = snap.Accounts.FirstOrDefault(a => a.Id == payee.Destination);
                if (dest != null && dest.Id != source.Id) return $"{dest.AccountType} ({dest.AccountNumber})";
            }
            else
            {
                return $"{payee.DisplayName} ({payee.Destination})";
            }
        }

        var to = Regex.Match(text, @"\bto\s+(?:my\s+)?(savings|saving|checking|investment|portfolio|wealth)\b");
        if (to.Success)
        {
            var dest = AccountByKind(snap.Accounts, to.Groups[1].Value);
            if (dest != null) return $"{dest.AccountType} ({dest.AccountNumber})";
        }

        return "Jordan Vance (Mom) (External •••• 4412)";
    }

    private static Payee? MatchPayee(string text, List<Payee> payees)
    {
        Payee? best = null;
        var length = 0;
        foreach (var payee in payees)
        {
            foreach (var alias in payee.Aliases.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                if (alias.Length >= 3 && text.Contains(alias, StringComparison.OrdinalIgnoreCase) && alias.Length > length)
                {
                    best = payee;
                    length = alias.Length;
                }
            }
        }

        return best;
    }

    private static BankCard? ResolveCard(IReadOnlyList<BankCard> cards, string text, ChatPageContext? context, bool defaultToDebit)
    {
        if (cards.Count == 0) return null;
        var last4 = cards.FirstOrDefault(card =>
        {
            var match = Regex.Match(card.CardNumberMasked, @"(\d{4})\s*$");
            return match.Success && Regex.IsMatch(text, $@"\b{match.Groups[1].Value}\b");
        });
        if (last4 != null) return last4;

        var wantsDebit = Regex.IsMatch(text, @"\bdebit\b");
        var wantsCredit = Regex.IsMatch(text, @"\bcredit\b");
        if (wantsDebit != wantsCredit)
        {
            var type = wantsDebit ? "Debit" : "Credit";
            var typed = cards.FirstOrDefault(c => c.CardType.Equals(type, StringComparison.OrdinalIgnoreCase));
            if (typed != null) return typed;
        }

        if (text.Contains("platinum")) return cards.FirstOrDefault(c => c.CardName.Contains("Platinum", StringComparison.OrdinalIgnoreCase));
        if (text.Contains("diamond") || text.Contains("elite")) return cards.FirstOrDefault(c => c.CardName.Contains("Diamond", StringComparison.OrdinalIgnoreCase));

        if (!string.IsNullOrWhiteSpace(context?.CardId) && (text.Contains("this") || (context.Route ?? "").Contains("cards", StringComparison.OrdinalIgnoreCase)))
        {
            var selected = cards.FirstOrDefault(c => c.Id == context.CardId);
            if (selected != null) return selected;
        }

        if (!defaultToDebit) return null;
        return cards.FirstOrDefault(c => c.CardType.Equals("Debit", StringComparison.OrdinalIgnoreCase));
    }

    private static bool TryGetFreeze(string text, out bool freeze)
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

    private static (decimal Amount, string From, string To) ResolveExchange(string text)
    {
        var ordered = new List<string>();
        foreach (Match match in Regex.Matches(text, @"\b(usd|eur|gbp|chf|cad|aud|jpy|sgd)\b"))
        {
            var code = match.Groups[1].Value.ToUpperInvariant();
            if (ordered.Count == 0 || ordered[^1] != code) ordered.Add(code);
        }

        var from = ordered.Count > 0 ? ordered[0] : "USD";
        var to = ordered.Count > 1 ? ordered[1] : from == "USD" ? "EUR" : "USD";
        var amount = ParseMoney(text, 1000m);
        return (amount, from, to);
    }

    private static decimal ParseMoney(string text, decimal fallback)
    {
        var preferred = Regex.Match(text, @"(?:transfer|send|pay|convert|exchange|wire|save|allocate|move|loan|borrow)\s+\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?", RegexOptions.IgnoreCase);
        if (TryRead(preferred, out var directed)) return directed;
        var dollar = Regex.Match(text, @"\$\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?");
        if (TryRead(dollar, out var withSymbol)) return withSymbol;
        return fallback;
    }

    private static decimal? ParseMinimum(string text)
    {
        var match = Regex.Match(text, @"\b(?:over|above|more than|at least)\s+\$?\s*(\d+(?:\.\d{1,2})?)\b");
        if (!match.Success) return null;
        return decimal.TryParse(match.Groups[1].Value, out var value) ? value : null;
    }

    private static decimal ParseKeep(string text, decimal fallback)
    {
        var match = Regex.Match(text, @"\b(?:keep|buffer|leave)\s+\$?\s*(\d+(?:\.\d{1,2})?)\b");
        return match.Success && decimal.TryParse(match.Groups[1].Value, out var value) ? value : fallback;
    }

    private static int ParseMonths(string text, int fallback)
    {
        var months = Regex.Match(text, @"\b(\d{1,3})\s*months?\b");
        if (months.Success && int.TryParse(months.Groups[1].Value, out var m) && m > 0) return m;
        var years = Regex.Match(text, @"\b(\d{1,2})\s*years?\b");
        if (years.Success && int.TryParse(years.Groups[1].Value, out var y) && y > 0) return y * 12;
        return fallback;
    }

    private static int? ParseMonthName(string text)
    {
        var names = CultureInfo.InvariantCulture.DateTimeFormat.MonthNames;
        for (var i = 0; i < 12; i++)
        {
            if (names[i].Length > 0 && text.Contains(names[i], StringComparison.OrdinalIgnoreCase)) return i + 1;
        }

        return null;
    }

    private static string ParseDestination(string text)
    {
        var match = Regex.Match(text, @"\b(?:to|in|for)\s+([a-z]{3,}(?:\s+[a-z]{3,})?)");
        if (!match.Success) return "your trip";
        var raw = Regex.Replace(match.Groups[1].Value, @"\b(next|this|week|month|card|my|the|a)\b", "").Trim();
        if (raw.Length < 3) return "your trip";
        return CultureInfo.InvariantCulture.TextInfo.ToTitleCase(raw);
    }

    private static bool TryRead(Match match, out decimal amount)
    {
        amount = 0;
        if (!match.Success) return false;
        var raw = (match.Groups[1].Value + match.Groups[2].Value).Replace(",", "");
        return decimal.TryParse(raw, NumberStyles.Number, CultureInfo.InvariantCulture, out amount) && amount > 0;
    }

    private static decimal MonthlyPayment(decimal principal, decimal annualRate, int months)
    {
        if (months <= 0) return 0;
        var r = annualRate / 100m / 12m;
        if (r == 0) return Math.Round(principal / months, 2);
        var pow = (decimal)Math.Pow((double)(1 + r), months);
        return Math.Round(principal * r * pow / (pow - 1), 2);
    }

    private static int MonthsToPayoff(decimal principal, decimal annualRate, decimal payment)
    {
        var balance = principal;
        var r = annualRate / 100m / 12m;
        if (payment <= balance * r) return 600;
        for (var month = 1; month <= 600; month++)
        {
            balance = balance + (balance * r) - payment;
            if (balance <= 0.5m) return month;
        }

        return 600;
    }

    private static Dictionary<string, object> TxRow(BankTransaction t) => new()
    {
        ["id"] = t.Id,
        ["date"] = t.Date.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ"),
        ["description"] = t.Description,
        ["category"] = t.Category,
        ["amount"] = t.Amount,
        ["type"] = t.Type
    };

    private static string AccountLine(BankAccount account) =>
        $"{account.AccountType} ({account.AccountNumber}) shows {LedgerAnalytics.Money(account.Balance)}.";

    private static IntentHit Hit(string id, string label, string prompt, int score) => new(id, label, prompt, score);

    private static StreamEvent Tool(string name, Dictionary<string, object> args) => new()
    {
        Type = "tool_call",
        ToolCall = new ToolCallDto { Name = name, Args = args }
    };

    private static StreamEvent Widget(string name, string title, Dictionary<string, object> props) => new()
    {
        Type = "widget",
        Widget = new WidgetDto { Name = name, Title = title, Props = props }
    };

    private sealed record IntentHit(string Id, string Label, string Prompt, int Score);
}
