using BankingApi.Data;
using BankingApi.Models;
using Microsoft.EntityFrameworkCore;

namespace BankingApi.Services;

public interface ILedgerBootstrap
{
    Task EnsureAsync(CancellationToken cancellationToken = default);
}

public sealed class LedgerBootstrap : ILedgerBootstrap
{
    private readonly BankingDbContext _db;

    public LedgerBootstrap(BankingDbContext db)
    {
        _db = db;
    }

    public async Task EnsureAsync(CancellationToken cancellationToken = default)
    {
        await _db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS "Payees" (
                "Id" TEXT NOT NULL CONSTRAINT "PK_Payees" PRIMARY KEY,
                "DisplayName" TEXT NOT NULL,
                "Aliases" TEXT NOT NULL,
                "Destination" TEXT NOT NULL,
                "IsInternal" INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS "BudgetTargets" (
                "Category" TEXT NOT NULL CONSTRAINT "PK_BudgetTargets" PRIMARY KEY,
                "MonthlyLimit" TEXT NOT NULL,
                "Icon" TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS "Disputes" (
                "Id" TEXT NOT NULL CONSTRAINT "PK_Disputes" PRIMARY KEY,
                "TransactionId" TEXT NOT NULL,
                "Reason" TEXT NOT NULL,
                "Amount" TEXT NOT NULL,
                "Status" TEXT NOT NULL,
                "CreatedAt" TEXT NOT NULL,
                "Details" TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS "TravelNotices" (
                "Id" TEXT NOT NULL CONSTRAINT "PK_TravelNotices" PRIMARY KEY,
                "Destination" TEXT NOT NULL,
                "CardId" TEXT NOT NULL,
                "StartDate" TEXT NOT NULL,
                "EndDate" TEXT NOT NULL,
                "TemporaryLimit" TEXT NOT NULL,
                "CreatedAt" TEXT NOT NULL
            );
            """,
            cancellationToken);

        await PropertyDocumentLogic.EnsureStorageAsync(_db, cancellationToken);

        if (!await _db.Payees.AnyAsync(cancellationToken))
        {
            _db.Payees.AddRange(
                new Payee { Id = "payee-mom", DisplayName = "Jordan Vance (Mom)", Aliases = "mom,mother,jordan,jordan vance", Destination = "External •••• 4412", IsInternal = false },
                new Payee { Id = "payee-rent", DisplayName = "Harborview Property", Aliases = "landlord,rent,harborview", Destination = "External •••• 9088", IsInternal = false },
                new Payee { Id = "payee-sav", DisplayName = "Emergency Savings", Aliases = "emergency savings,emergency,savings", Destination = "acc-sav-02", IsInternal = true },
                new Payee { Id = "payee-inv", DisplayName = "Global Wealth Portfolio", Aliases = "investment,portfolio,wealth", Destination = "acc-inv-03", IsInternal = true });
        }

        if (!await _db.BudgetTargets.AnyAsync(cancellationToken))
        {
            _db.BudgetTargets.AddRange(
                new BudgetTarget { Category = "Dining", MonthlyLimit = 60m, Icon = "🍽️" },
                new BudgetTarget { Category = "Groceries", MonthlyLimit = 250m, Icon = "🛒" },
                new BudgetTarget { Category = "Health & Wellness", MonthlyLimit = 300m, Icon = "🧘" },
                new BudgetTarget { Category = "Travel", MonthlyLimit = 800m, Icon = "✈️" },
                new BudgetTarget { Category = "Cloud & Tech", MonthlyLimit = 400m, Icon = "💻" },
                new BudgetTarget { Category = "Electronics", MonthlyLimit = 500m, Icon = "🖥️" },
                new BudgetTarget { Category = "Entertainment", MonthlyLimit = 40m, Icon = "🎬" },
                new BudgetTarget { Category = "Utilities", MonthlyLimit = 50m, Icon = "⚡" });
        }

        var today = DateTime.UtcNow.Date;
        var existing = await _db.Transactions.AsNoTracking()
            .Select(t => t.Id)
            .ToListAsync(cancellationToken);
        var known = existing.ToHashSet(StringComparer.Ordinal);
        var aws = await _db.Transactions.AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == "tx-101", cancellationToken);

        foreach (var tx in BuildHistory(today, aws?.Date))
        {
            if (known.Contains(tx.Id)) continue;
            _db.Transactions.Add(tx);
        }

        await _db.SaveChangesAsync(cancellationToken);
    }

    private static IEnumerable<BankTransaction> BuildHistory(DateTime today, DateTime? awsDate)
    {
        var monthStart = new DateTime(today.Year, today.Month, 1, 15, 0, 0, DateTimeKind.Utc);

        for (var monthsAgo = 0; monthsAgo < 4; monthsAgo++)
        {
            var when = monthStart.AddMonths(-monthsAgo).AddDays(5);
            yield return Tx($"tx-sub-netflix-{monthsAgo}", when, "Netflix Standard", "Entertainment", -15.99m);
            yield return Tx($"tx-sub-spotify-{monthsAgo}", when.AddDays(1), "Spotify Premium", "Entertainment", -11.99m);
            yield return Tx($"tx-sub-icloud-{monthsAgo}", when.AddDays(2), "Apple iCloud+", "Utilities", -9.99m);
        }

        for (var monthsAgo = 1; monthsAgo <= 2; monthsAgo++)
        {
            yield return Tx(
                $"tx-sub-equinox-{monthsAgo}",
                monthStart.AddMonths(-monthsAgo).AddDays(3),
                "Equinox Luxury Fitness Club",
                "Health & Wellness",
                -280.00m);
            yield return Tx(
                $"tx-pay-{monthsAgo}",
                monthStart.AddMonths(-monthsAgo).AddDays(1),
                "Payroll Direct Deposit - TechForward Corp",
                "Income",
                6450.00m,
                "Credit");
        }

        yield return Tx("tx-coffee-1", today.AddDays(-12).AddHours(15), "Starbucks Reserve Roastery", "Dining", -6.40m);
        yield return Tx("tx-coffee-2", today.AddDays(-20).AddHours(16), "Starbucks Reserve Roastery", "Dining", -8.75m);
        yield return Tx("tx-coffee-3", today.AddDays(-40).AddHours(14), "Starbucks Reserve Roastery", "Dining", -22.10m);
        yield return Tx("tx-coffee-4", today.AddDays(-1).AddHours(18), "Starbucks Reserve Roastery", "Dining", -48.00m);

        var duplicateAt = (awsDate ?? today.AddDays(-2)).AddHours(20);
        yield return Tx("tx-dup-aws", duplicateAt, "Amazon Web Services Cloud Infrastructure", "Cloud & Tech", -342.50m);
    }

    private static BankTransaction Tx(
        string id,
        DateTime when,
        string description,
        string category,
        decimal amount,
        string? type = null)
    {
        return new BankTransaction
        {
            Id = id,
            AccountId = "acc-chk-01",
            Date = DateTime.SpecifyKind(when, DateTimeKind.Utc),
            Description = description,
            Category = category,
            Amount = amount,
            Type = type ?? (amount < 0 ? "Debit" : "Credit"),
            Status = "Posted"
        };
    }
}
