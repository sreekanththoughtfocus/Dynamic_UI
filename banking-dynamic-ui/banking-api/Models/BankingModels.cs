using System.Text.Json.Serialization;

namespace BankingApi.Models;

public class BankAccount
{
    public string Id { get; set; } = string.Empty;
    public string AccountNumber { get; set; } = string.Empty;
    public string AccountType { get; set; } = "Checking"; // Checking, Savings, Investment
    public string Currency { get; set; } = "USD";
    public decimal Balance { get; set; }
    public decimal AvailableBalance { get; set; }
    public string OwnerName { get; set; } = "Alex Vance";
}

public class BankTransaction
{
    public string Id { get; set; } = string.Empty;
    public string AccountId { get; set; } = string.Empty;
    public DateTime Date { get; set; }
    public string Description { get; set; } = string.Empty;
    public string Category { get; set; } = "General";
    public decimal Amount { get; set; }
    public string Type { get; set; } = "Debit"; // Debit or Credit
    public string Status { get; set; } = "Posted";
}

public class BankCard
{
    public string Id { get; set; } = string.Empty;
    public string CardNumberMasked { get; set; } = "**** **** **** 4892";
    public string CardType { get; set; } = "Credit"; // Credit or Debit
    public string CardName { get; set; } = "Apex World Elite Platinum";
    public string ExpiryDate { get; set; } = "09/29";
    public bool IsFrozen { get; set; } = false;
    public decimal SpendingLimit { get; set; } = 15000m;
    public decimal CurrentBalance { get; set; } = 3420.50m;
    public string ColorScheme { get; set; } = "platinum";
    public string Pin { get; set; } = "7294";
}

public class UserAccount
{
    public string Id { get; set; } = "usr-01";
    public string Username { get; set; } = "alex.vance";
    public string FullName { get; set; } = "Alex Vance";
    public string Email { get; set; } = "a.vance@example.com";
    public string Password { get; set; } = "ApexSecure2026!";
    public string PhoneNumber { get; set; } = "+1 (555) 382-9104";
    public string Address { get; set; } = "742 Evergreen Terrace, San Francisco, CA";
    public bool TwoFactorEnabled { get; set; } = true;
    public bool BiometricsEnabled { get; set; } = true;
    public string Role { get; set; } = "Premier Private Client";
    public DateTime LastLoginAt { get; set; } = DateTime.UtcNow;
    public DateTime LastPasswordResetAt { get; set; } = DateTime.UtcNow.AddDays(-14);
}

public class ResetPinRequest
{
    public string CardId { get; set; } = string.Empty;
    public string NewPin { get; set; } = string.Empty;
    public string VerificationOtp { get; set; } = string.Empty;
}

public class FreezeCardRequest
{
    public string CardId { get; set; } = string.Empty;
    public bool Freeze { get; set; } = true;
}

public class ResetPasswordRequest
{
    public string CurrentPassword { get; set; } = string.Empty;
    public string NewPassword { get; set; } = string.Empty;
    public string OtpCode { get; set; } = string.Empty;
}

public class TransferFundsRequest
{
    public string FromAccountId { get; set; } = string.Empty;
    public string ToAccountOrRecipient { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string Note { get; set; } = string.Empty;
}

public class AiAuditLog
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N")[..8];
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public string Action { get; set; } = string.Empty;
    public string Initiator { get; set; } = "AI_Agent";
    public string Details { get; set; } = string.Empty;
}

public class DatabaseOverviewDto
{
    public List<UserAccount> Users { get; set; } = [];
    public List<BankAccount> Accounts { get; set; } = [];
    public List<BankCard> Cards { get; set; } = [];
    public List<BankTransaction> Transactions { get; set; } = [];
    public List<AiAuditLog> AuditLogs { get; set; } = [];
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public string DatabaseProvider { get; set; } = "Entity Framework Core (SQLite)";
    public int TotalRecordsCount { get; set; }
}

