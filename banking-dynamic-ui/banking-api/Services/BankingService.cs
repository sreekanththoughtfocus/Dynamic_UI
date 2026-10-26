using BankingApi.Data;
using BankingApi.Models;
using Microsoft.EntityFrameworkCore;

namespace BankingApi.Services;

public interface IBankingService
{
    Task<List<BankAccount>> GetAccountsAsync();
    Task<BankAccount?> GetAccountAsync(string id);
    Task<List<BankTransaction>> GetStatementsAsync(string? accountId, int limit = 10);
    Task<List<BankCard>> GetCardsAsync();
    Task<BankCard?> GetCardAsync(string id);
    Task<bool> ResetCardPinAsync(string cardId, string newPin, string initiator = "User");
    Task<bool> SetCardFreezeAsync(string cardId, bool freeze, string initiator = "User");
    Task<bool> UpdateCardLimitAsync(string cardId, decimal limit, string initiator = "User");
    Task<bool> ResetPasswordAsync(string newPassword, string initiator = "User", string? userId = null);
    Task<bool> TransferFundsAsync(string fromAccountId, string recipient, decimal amount, string note, string initiator = "User");
    Task<List<AiAuditLog>> GetAuditLogsAsync();

    // User management & Admin validation
    Task<UserAccount?> GetUserProfileAsync(string userId = "usr-alex-01");
    Task<UserAccount?> GetUserByIdAsync(string userId);
    Task<UserAccount?> AuthenticateAsync(string username, string password);
    Task RecordAuditAsync(string action, string initiator, string details);
    Task<List<UserAccount>> GetAllUsersAsync();
    Task<bool> UpdateUserAsync(UserAccount user, string initiator = "Admin");
    Task<DatabaseOverviewDto> GetDatabaseOverviewAsync();
    Task<bool> ResetDatabaseAsync();
    Task<BankTransaction> AddTransactionAsync(BankTransaction tx, string initiator = "Admin");
    Task<List<PropertyDocumentSummaryDto>> ListPropertyDocumentsAsync();
    Task<PropertyDocumentDto?> GetPropertyDocumentAsync(string id);
    Task<PropertySaveResult> SavePropertyDocumentAsync(string id, SavePropertyDocumentRequest request, string initiator);
}

public class BankingService : IBankingService
{
    private readonly BankingDbContext _db;
    private readonly ILogger<BankingService> _logger;

    public BankingService(BankingDbContext db, ILogger<BankingService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<List<BankAccount>> GetAccountsAsync()
    {
        return await _db.Accounts.AsNoTracking().ToListAsync();
    }

    public async Task<BankAccount?> GetAccountAsync(string id)
    {
        return await _db.Accounts.FirstOrDefaultAsync(a => a.Id == id || a.AccountNumber == id);
    }

    public async Task<List<BankTransaction>> GetStatementsAsync(string? accountId, int limit = 10)
    {
        var query = _db.Transactions.AsNoTracking().AsQueryable();
        if (!string.IsNullOrEmpty(accountId))
        {
            query = query.Where(t => t.AccountId == accountId);
        }
        return await query.OrderByDescending(t => t.Date).Take(limit).ToListAsync();
    }

    public async Task<List<BankCard>> GetCardsAsync()
    {
        return await _db.Cards.AsNoTracking().ToListAsync();
    }

    public async Task<BankCard?> GetCardAsync(string id)
    {
        return await _db.Cards.FirstOrDefaultAsync(c => c.Id == id || c.CardType == id);
    }

    public async Task<bool> ResetCardPinAsync(string cardId, string newPin, string initiator = "User")
    {
        var card = await _db.Cards.FirstOrDefaultAsync(c => c.Id == cardId);
        if (card == null) return false;

        card.Pin = newPin;

        _db.AuditLogs.Add(new AiAuditLog
        {
            Action = "ResetCardPin",
            Initiator = initiator,
            Details = $"PIN updated to {newPin} for card {card.CardName} ({card.CardNumberMasked})"
        });

        await _db.SaveChangesAsync();
        _logger.LogInformation("PIN updated for card {CardId} by {Initiator}", cardId, initiator);
        return true;
    }

    public async Task<bool> SetCardFreezeAsync(string cardId, bool freeze, string initiator = "User")
    {
        var card = await _db.Cards.FirstOrDefaultAsync(c => c.Id == cardId);
        if (card == null) return false;

        card.IsFrozen = freeze;

        _db.AuditLogs.Add(new AiAuditLog
        {
            Action = freeze ? "FreezeCard" : "UnfreezeCard",
            Initiator = initiator,
            Details = $"Card {card.CardName} set to frozen={freeze}"
        });

        await _db.SaveChangesAsync();
        _logger.LogInformation("Card {CardId} freeze status updated to {Freeze} by {Initiator}", cardId, freeze, initiator);
        return true;
    }

    public async Task<bool> UpdateCardLimitAsync(string cardId, decimal limit, string initiator = "User")
    {
        var card = await _db.Cards.FirstOrDefaultAsync(c => c.Id == cardId);
        if (card == null) return false;

        var oldLimit = card.SpendingLimit;
        card.SpendingLimit = limit;

        _db.AuditLogs.Add(new AiAuditLog
        {
            Action = "UpdateSpendingLimit",
            Initiator = initiator,
            Details = $"Spending limit changed from {oldLimit:C} to {limit:C}"
        });

        await _db.SaveChangesAsync();
        _logger.LogInformation("Card {CardId} limit adjusted to {Limit} by {Initiator}", cardId, limit, initiator);
        return true;
    }

    public async Task<bool> ResetPasswordAsync(string newPassword, string initiator = "User", string? userId = null)
    {
        UserAccount? user;
        if (!string.IsNullOrEmpty(userId))
        {
            user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId);
        }
        else
        {
            user = await _db.Users.FirstOrDefaultAsync(u => u.Id == "usr-alex-01")
                ?? await _db.Users.FirstOrDefaultAsync();
        }

        if (user == null) return false;

        user.Password = newPassword;
        user.LastPasswordResetAt = DateTime.UtcNow;

        _db.AuditLogs.Add(new AiAuditLog
        {
            Action = "ResetPassword",
            Initiator = initiator,
            Details = $"Online banking password updated for user {user.Username}"
        });

        await _db.SaveChangesAsync();
        _logger.LogInformation("Banking password reset requested by {Initiator}", initiator);
        return true;
    }

    public async Task<bool> TransferFundsAsync(string fromAccountId, string recipient, decimal amount, string note, string initiator = "User")
    {
        var account = await _db.Accounts.FirstOrDefaultAsync(a => a.Id == fromAccountId);
        if (account == null || account.AvailableBalance < amount)
        {
            return false;
        }

        account.Balance -= amount;
        account.AvailableBalance -= amount;

        var tx = new BankTransaction
        {
            Id = "tx-" + Guid.NewGuid().ToString("N")[..6],
            AccountId = account.Id,
            Date = DateTime.UtcNow,
            Description = $"Transfer to {recipient} ({note})",
            Category = "Transfer",
            Amount = -amount,
            Type = "Debit",
            Status = "Posted"
        };

        _db.Transactions.Add(tx);

        var destination = await _db.Accounts.FirstOrDefaultAsync(a =>
            a.Id != account.Id && recipient.Contains(a.AccountNumber));
        if (destination != null)
        {
            destination.Balance += amount;
            destination.AvailableBalance += amount;
            _db.Transactions.Add(new BankTransaction
            {
                Id = "tx-" + Guid.NewGuid().ToString("N")[..6],
                AccountId = destination.Id,
                Date = DateTime.UtcNow,
                Description = $"Transfer from {account.AccountType} ({note})",
                Category = "Transfer",
                Amount = amount,
                Type = "Credit",
                Status = "Posted"
            });
        }
        _db.AuditLogs.Add(new AiAuditLog
        {
            Action = "TransferFunds",
            Initiator = initiator,
            Details = $"Transferred {amount:C} from {account.AccountNumber} to {recipient}"
        });

        await _db.SaveChangesAsync();
        _logger.LogInformation("Funds transferred: {Amount} to {Recipient} by {Initiator}", amount, recipient, initiator);
        return true;
    }

    public async Task<List<AiAuditLog>> GetAuditLogsAsync()
    {
        return await _db.AuditLogs.OrderByDescending(a => a.Timestamp).Take(50).ToListAsync();
    }

    public async Task<UserAccount?> GetUserProfileAsync(string userId = "usr-alex-01")
    {
        return await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId)
            ?? await _db.Users.AsNoTracking().FirstOrDefaultAsync();
    }

    public async Task<UserAccount?> GetUserByIdAsync(string userId)
    {
        return await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId);
    }

    public async Task<UserAccount?> AuthenticateAsync(string username, string password)
    {
        var lowered = username.Trim().ToLowerInvariant();
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Username.ToLower() == lowered);
        if (user == null || !string.Equals(user.Password, password, StringComparison.Ordinal))
        {
            return null;
        }

        user.LastLoginAt = DateTime.UtcNow;
        _db.AuditLogs.Add(new AiAuditLog
        {
            Action = "UserLogin",
            Initiator = user.Username,
            Details = $"Online banking session started for {user.FullName}"
        });
        await _db.SaveChangesAsync();
        return user;
    }

    public async Task RecordAuditAsync(string action, string initiator, string details)
    {
        _db.AuditLogs.Add(new AiAuditLog
        {
            Action = action,
            Initiator = initiator,
            Details = details
        });
        await _db.SaveChangesAsync();
    }

    public async Task<List<UserAccount>> GetAllUsersAsync()
    {
        return await _db.Users.AsNoTracking().ToListAsync();
    }

    public async Task<bool> UpdateUserAsync(UserAccount user, string initiator = "Admin")
    {
        var existing = await _db.Users.FirstOrDefaultAsync(u => u.Id == user.Id);
        if (existing == null) return false;

        existing.Username = user.Username;
        existing.FullName = user.FullName;
        existing.Email = user.Email;
        existing.Password = user.Password;
        existing.PhoneNumber = user.PhoneNumber;
        existing.Address = user.Address;
        existing.TwoFactorEnabled = user.TwoFactorEnabled;
        existing.BiometricsEnabled = user.BiometricsEnabled;
        existing.Role = user.Role;

        _db.AuditLogs.Add(new AiAuditLog
        {
            Action = "AdminUpdateUser",
            Initiator = initiator,
            Details = $"User details & credentials updated for {existing.Username} (Password: {existing.Password})"
        });

        await _db.SaveChangesAsync();
        return true;
    }

    public async Task<DatabaseOverviewDto> GetDatabaseOverviewAsync()
    {
        var users = await _db.Users.AsNoTracking().ToListAsync();
        var accounts = await _db.Accounts.AsNoTracking().ToListAsync();
        var cards = await _db.Cards.AsNoTracking().ToListAsync();
        var txs = await _db.Transactions.AsNoTracking().OrderByDescending(t => t.Date).ToListAsync();
        var logs = await _db.AuditLogs.AsNoTracking().OrderByDescending(l => l.Timestamp).Take(50).ToListAsync();

        return new DatabaseOverviewDto
        {
            Users = users,
            Accounts = accounts,
            Cards = cards,
            Transactions = txs,
            AuditLogs = logs,
            Timestamp = DateTime.UtcNow,
            DatabaseProvider = "Entity Framework Core (SQLite)",
            TotalRecordsCount = users.Count + accounts.Count + cards.Count + txs.Count + logs.Count
        };
    }

    public async Task<bool> ResetDatabaseAsync()
    {
        await _db.Database.EnsureDeletedAsync();
        await _db.Database.EnsureCreatedAsync();
        _logger.LogInformation("Database reset and re-seeded to initial state.");
        return true;
    }

    public async Task<BankTransaction> AddTransactionAsync(BankTransaction tx, string initiator = "Admin")
    {
        if (string.IsNullOrEmpty(tx.Id)) tx.Id = "tx-" + Guid.NewGuid().ToString("N")[..6];
        if (tx.Date == default) tx.Date = DateTime.UtcNow;

        _db.Transactions.Add(tx);
        _db.AuditLogs.Add(new AiAuditLog
        {
            Action = "AdminAddTransaction",
            Initiator = initiator,
            Details = $"Manual transaction {tx.Description} ({tx.Amount:C}) created for account {tx.AccountId}"
        });

        await _db.SaveChangesAsync();
        return tx;
    }

    public async Task<List<PropertyDocumentSummaryDto>> ListPropertyDocumentsAsync()
    {
        return await _db.AppPropertyDocuments.AsNoTracking()
            .OrderBy(d => d.Name)
            .Select(d => new PropertyDocumentSummaryDto
            {
                Id = d.Id,
                Name = d.Name,
                UpdatedAt = d.UpdatedAt,
            })
            .ToListAsync();
    }

    public async Task<PropertyDocumentDto?> GetPropertyDocumentAsync(string id)
    {
        var row = await _db.AppPropertyDocuments.AsNoTracking().FirstOrDefaultAsync(d => d.Id == id);
        return row == null ? null : PropertyDocumentLogic.ToDto(row);
    }

    public async Task<PropertySaveResult> SavePropertyDocumentAsync(string id, SavePropertyDocumentRequest request, string initiator)
    {
        var normalized = PropertyDocumentLogic.Normalize(request);
        if (normalized.Error != null)
        {
            return PropertySaveResult.Fail(normalized.Error);
        }

        var row = await _db.AppPropertyDocuments.FirstOrDefaultAsync(d => d.Id == id);
        if (row == null)
        {
            return PropertySaveResult.Missing("Property document was not found.");
        }

        row.Name = normalized.Name;
        row.TreeJson = normalized.TreeJson;
        row.ValuesJson = normalized.ValuesJson;
        row.UpdatedAt = DateTime.UtcNow;

        _db.AuditLogs.Add(new AiAuditLog
        {
            Action = "PropertyDocumentSaved",
            Initiator = initiator,
            Details = $"Saved property document {row.Id} ({row.Name})."
        });

        await _db.SaveChangesAsync();
        return PropertySaveResult.Ok(PropertyDocumentLogic.ToDto(row));
    }
}
