namespace BankingApi.Models;

public class Payee
{
    public string Id { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Aliases { get; set; } = string.Empty;
    public string Destination { get; set; } = string.Empty;
    public bool IsInternal { get; set; }
}

public class BudgetTarget
{
    public string Category { get; set; } = string.Empty;
    public decimal MonthlyLimit { get; set; }
    public string Icon { get; set; } = "•";
}

public class CardDispute
{
    public string Id { get; set; } = string.Empty;
    public string TransactionId { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string Status { get; set; } = "Open";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string Details { get; set; } = string.Empty;
}

public class TravelNotice
{
    public string Id { get; set; } = string.Empty;
    public string Destination { get; set; } = string.Empty;
    public string CardId { get; set; } = string.Empty;
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public decimal TemporaryLimit { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class FileDisputeRequest
{
    public string TransactionId { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
}

public class TravelNoticeRequest
{
    public string Destination { get; set; } = string.Empty;
    public string CardId { get; set; } = string.Empty;
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public decimal TemporaryLimit { get; set; }
}

public class UpdateLimitRequest
{
    public decimal Limit { get; set; }
}

public class FxLockRequest
{
    public string From { get; set; } = "USD";
    public string To { get; set; } = "EUR";
    public decimal Amount { get; set; }
}

public sealed record InsightChipDto(string Label, string Prompt);

public sealed record InsightFeedDto(
    decimal NetWorth,
    decimal MonthNetChange,
    decimal ProjectedCheckingEnd,
    string CheckingAccountId,
    IReadOnlyList<InsightChipDto> Chips);
