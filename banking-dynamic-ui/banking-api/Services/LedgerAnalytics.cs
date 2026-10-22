using System.Globalization;
using BankingApi.Models;

namespace BankingApi.Services;

public sealed record SubscriptionItem(
    string Merchant,
    string Category,
    decimal TypicalAmount,
    int Occurrences,
    string Cadence,
    DateTime LastDate);

public sealed record AnomalyItem(
    string TransactionId,
    DateTime Date,
    string Description,
    string Category,
    decimal Amount,
    string Reason);

public sealed record ForecastResult(
    decimal CurrentBalance,
    decimal TypicalMonthlyIncome,
    decimal TypicalMonthlySpend,
    decimal SpentThisMonth,
    decimal IncomeThisMonth,
    decimal ProjectedExtraSpend,
    decimal ProjectedExtraIncome,
    decimal ProjectedEndBalance,
    int DaysRemaining);

public sealed record BudgetRow(string Category, decimal Spent, decimal Limit, string Icon);

public sealed record MerchantInsight(
    string Merchant,
    int Count,
    decimal LatestAmount,
    decimal AverageAmount,
    DateTime LatestDate,
    IReadOnlyList<BankTransaction> Recent);

public static class LedgerAnalytics
{
    public static List<SubscriptionItem> Subscriptions(IEnumerable<BankTransaction> transactions)
    {
        var debits = transactions.Where(IsDebit).ToList();
        var groups = debits.GroupBy(t => Normalize(t.Description));
        var results = new List<SubscriptionItem>();

        foreach (var group in groups)
        {
            var rows = group.OrderBy(t => t.Date).ToList();
            if (rows.Count < 2) continue;

            var months = rows.Select(t => t.Date.Year * 12 + t.Date.Month).Distinct().Count();
            if (months < 2) continue;

            var amounts = rows.Select(t => Math.Abs(t.Amount)).OrderBy(a => a).ToList();
            var min = amounts[0];
            var max = amounts[^1];
            if (min <= 0 || max / min > 1.25m) continue;

            var typical = amounts[amounts.Count / 2];
            var cadence = CadenceOf(rows);
            var latest = rows[^1];
            results.Add(new SubscriptionItem(
                latest.Description,
                latest.Category,
                typical,
                rows.Count,
                cadence,
                latest.Date));
        }

        return results.OrderByDescending(s => s.TypicalAmount).ToList();
    }

    public static List<AnomalyItem> Anomalies(IEnumerable<BankTransaction> transactions)
    {
        var rows = transactions.OrderBy(t => t.Date).ToList();
        var flagged = new Dictionary<string, AnomalyItem>(StringComparer.Ordinal);

        for (var i = 0; i < rows.Count; i++)
        {
            var current = rows[i];
            if (!IsDebit(current)) continue;

            for (var j = i + 1; j < rows.Count; j++)
            {
                var later = rows[j];
                if (!IsDebit(later)) continue;
                if ((later.Date - current.Date).TotalDays > 3) break;
                if (!Normalize(current.Description).Equals(Normalize(later.Description), StringComparison.Ordinal)) continue;
                if (Math.Abs(Math.Abs(current.Amount) - Math.Abs(later.Amount)) > 0.01m) continue;

                flagged[later.Id] = new AnomalyItem(
                    later.Id,
                    later.Date,
                    later.Description,
                    later.Category,
                    later.Amount,
                    $"Same amount posted twice, on {current.Date:MMM d} and {later.Date:MMM d}.");
            }
        }

        foreach (var group in rows.Where(IsDebit).GroupBy(t => Normalize(t.Description)))
        {
            var history = group.OrderBy(t => t.Date).ToList();
            if (history.Count < 3) continue;
            var latest = history[^1];
            if (flagged.ContainsKey(latest.Id)) continue;
            var prior = history.Take(history.Count - 1).Select(t => Math.Abs(t.Amount)).OrderBy(a => a).ToList();
            var median = prior[prior.Count / 2];
            var latestAbs = Math.Abs(latest.Amount);
            if (median <= 0 || latestAbs < median * 2m) continue;

            var times = Math.Round(latestAbs / median, 1);
            flagged[latest.Id] = new AnomalyItem(
                latest.Id,
                latest.Date,
                latest.Description,
                latest.Category,
                latest.Amount,
                $"Latest charge is {times.ToString("0.0", CultureInfo.InvariantCulture)}× the usual {Money(median)} at this merchant.");
        }

        foreach (var tx in rows.Where(IsDebit).OrderByDescending(t => Math.Abs(t.Amount)))
        {
            if (flagged.ContainsKey(tx.Id)) continue;
            if (Math.Abs(tx.Amount) < 1000m) continue;
            if (tx.Category.Equals("Transfer", StringComparison.OrdinalIgnoreCase)) continue;
            flagged[tx.Id] = new AnomalyItem(
                tx.Id,
                tx.Date,
                tx.Description,
                tx.Category,
                tx.Amount,
                "Single purchase above $1,000.");
        }

        return flagged.Values
            .OrderByDescending(a => a.Reason.StartsWith("Same amount", StringComparison.Ordinal))
            .ThenByDescending(a => Math.Abs(a.Amount))
            .Take(5)
            .ToList();
    }

    public static ForecastResult Forecast(BankAccount account, IEnumerable<BankTransaction> transactions, DateTime today)
    {
        var monthStart = new DateTime(today.Year, today.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var priorStart = monthStart.AddMonths(-2);
        var rows = transactions.Where(t => t.AccountId == account.Id).ToList();
        var prior = rows.Where(t => t.Date >= priorStart && t.Date < monthStart).ToList();
        var current = rows.Where(t => t.Date >= monthStart && t.Date <= today.AddDays(1)).ToList();

        var typicalSpend = prior.Count == 0
            ? 0m
            : prior.Where(IsDebit).Sum(t => Math.Abs(t.Amount)) / 2m;
        var typicalIncome = prior.Count == 0
            ? 0m
            : prior.Where(t => !IsDebit(t)).Sum(t => Math.Abs(t.Amount)) / 2m;

        if (typicalSpend == 0 && typicalIncome == 0)
        {
            var recent = rows.Where(t => t.Date >= today.AddDays(-90)).ToList();
            typicalSpend = recent.Where(IsDebit).Sum(t => Math.Abs(t.Amount)) / 3m;
            typicalIncome = recent.Where(t => !IsDebit(t)).Sum(t => Math.Abs(t.Amount)) / 3m;
        }

        var spentThis = current.Where(IsDebit).Sum(t => Math.Abs(t.Amount));
        var incomeThis = current.Where(t => !IsDebit(t)).Sum(t => Math.Abs(t.Amount));
        var daysInMonth = DateTime.DaysInMonth(today.Year, today.Month);
        var daysRemaining = Math.Max(0, daysInMonth - today.Day);
        var projectedExtraSpend = daysInMonth == 0 ? 0m : Math.Round(typicalSpend / daysInMonth * daysRemaining, 2);
        var projectedExtraIncome = incomeThis >= typicalIncome * 0.8m
            ? 0m
            : Math.Round(typicalIncome - incomeThis, 2);
        var projectedEnd = Math.Round(account.Balance - projectedExtraSpend + projectedExtraIncome, 2);

        return new ForecastResult(
            account.Balance,
            Math.Round(typicalIncome, 2),
            Math.Round(typicalSpend, 2),
            Math.Round(spentThis, 2),
            Math.Round(incomeThis, 2),
            projectedExtraSpend,
            projectedExtraIncome,
            projectedEnd,
            daysRemaining);
    }

    public static List<BudgetRow> Budget(IEnumerable<BankTransaction> transactions, IEnumerable<BudgetTarget> targets, DateTime today)
    {
        var monthStart = new DateTime(today.Year, today.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var spent = transactions
            .Where(t => IsDebit(t) && t.Date >= monthStart && t.Date <= today.AddDays(1))
            .GroupBy(t => t.Category)
            .ToDictionary(g => g.Key, g => g.Sum(t => Math.Abs(t.Amount)), StringComparer.OrdinalIgnoreCase);

        return targets
            .OrderByDescending(t => spent.GetValueOrDefault(t.Category))
            .Select(t => new BudgetRow(t.Category, Math.Round(spent.GetValueOrDefault(t.Category), 2), t.MonthlyLimit, t.Icon))
            .ToList();
    }

    public static MerchantInsight? Explain(IEnumerable<BankTransaction> transactions, string merchant)
    {
        var key = Normalize(merchant);
        if (key.Length < 3) return null;

        var matches = transactions
            .Where(t => Normalize(t.Description).Contains(key, StringComparison.Ordinal) || key.Contains(Normalize(t.Description), StringComparison.Ordinal))
            .OrderByDescending(t => t.Date)
            .ToList();
        if (matches.Count == 0) return null;

        var amounts = matches.Select(t => Math.Abs(t.Amount)).ToList();
        var average = amounts.Average();
        var latest = matches[0];
        return new MerchantInsight(
            latest.Description,
            matches.Count,
            latest.Amount,
            Math.Round(average, 2),
            latest.Date,
            matches.Take(6).ToList());
    }

    public static string? MatchMerchant(string text, IEnumerable<BankTransaction> transactions)
    {
        string? best = null;
        var bestLength = 0;
        foreach (var description in transactions.Select(t => t.Description).Distinct())
        {
            foreach (var token in description.Split(' ', StringSplitOptions.RemoveEmptyEntries))
            {
                var cleaned = new string(token.Where(char.IsLetterOrDigit).ToArray());
                if (cleaned.Length < 4) continue;
                if (text.Contains(cleaned, StringComparison.OrdinalIgnoreCase) && cleaned.Length > bestLength)
                {
                    best = cleaned;
                    bestLength = cleaned.Length;
                }
            }
        }

        if (text.Contains("coffee", StringComparison.Ordinal) && bestLength < "starbucks".Length) return "starbucks";
        if (text.Contains("aws", StringComparison.Ordinal) && (best == null || bestLength < "amazon".Length)) return "amazon";
        if (text.Contains("gym", StringComparison.Ordinal) && (best == null || bestLength < "equinox".Length)) return "equinox";
        return best;
    }

    public static List<BankTransaction> Search(
        IEnumerable<BankTransaction> transactions,
        string? merchant,
        decimal? minAmount,
        int? month,
        int? year)
    {
        IEnumerable<BankTransaction> query = transactions;
        if (!string.IsNullOrWhiteSpace(merchant))
        {
            var key = Normalize(merchant);
            query = query.Where(t => Normalize(t.Description).Contains(key, StringComparison.Ordinal));
        }

        if (minAmount is > 0)
        {
            query = query.Where(t => Math.Abs(t.Amount) >= minAmount.Value);
        }

        if (month is >= 1 and <= 12)
        {
            query = query.Where(t => t.Date.Month == month.Value && (!year.HasValue || t.Date.Year == year.Value));
        }

        return query.OrderByDescending(t => t.Date).Take(12).ToList();
    }

    public static List<InsightChipDto> Chips(
        IReadOnlyList<AnomalyItem> anomalies,
        IReadOnlyList<SubscriptionItem> subscriptions,
        ForecastResult forecast,
        IReadOnlyList<BudgetRow> budget)
    {
        var chips = new List<InsightChipDto>();
        if (anomalies.Count > 0)
        {
            chips.Add(new InsightChipDto(
                $"{anomalies.Count} unusual charge{(anomalies.Count == 1 ? "" : "s")}",
                "Anything unusual on my checking account?"));
        }

        if (subscriptions.Count > 0)
        {
            var monthly = subscriptions.Where(s => s.Cadence == "Monthly").Sum(s => s.TypicalAmount);
            var yearly = monthly * 12m;
            chips.Add(new InsightChipDto(
                $"Subscriptions {Money(yearly)}/yr",
                "Find my recurring subscriptions"));
        }

        chips.Add(new InsightChipDto(
            $"Month-end ~ {Money(forecast.ProjectedEndBalance)}",
            "Forecast my cash flow for this month"));

        var over = budget.Where(b => b.Limit > 0 && b.Spent > b.Limit).OrderByDescending(b => b.Spent - b.Limit).FirstOrDefault();
        if (over != null)
        {
            chips.Add(new InsightChipDto(
                $"{over.Category} is over budget",
                "Show my monthly budget"));
        }
        else
        {
            chips.Add(new InsightChipDto(
                "Move spare cash to savings",
                "Where should my spare checking cash go?"));
        }

        return chips.Take(4).ToList();
    }

    public static bool IsDebit(BankTransaction tx) =>
        tx.Amount < 0 || tx.Type.Equals("Debit", StringComparison.OrdinalIgnoreCase);

    public static string Money(decimal value) =>
        value.ToString("$#,##0.00", CultureInfo.InvariantCulture);

    public static string Normalize(string value)
    {
        var chars = value.ToLowerInvariant().Select(ch => char.IsLetterOrDigit(ch) ? ch : ' ').ToArray();
        return string.Join(' ', new string(chars).Split(' ', StringSplitOptions.RemoveEmptyEntries));
    }

    private static string CadenceOf(IReadOnlyList<BankTransaction> rows)
    {
        if (rows.Count < 2) return "Recurring";
        var gaps = new List<double>();
        for (var i = 1; i < rows.Count; i++)
        {
            gaps.Add((rows[i].Date - rows[i - 1].Date).TotalDays);
        }

        var median = gaps.OrderBy(g => g).ElementAt(gaps.Count / 2);
        if (median is >= 25 and <= 40) return "Monthly";
        if (median is >= 6 and <= 9) return "Weekly";
        if (median is >= 350 and <= 380) return "Yearly";
        return "Recurring";
    }
}
