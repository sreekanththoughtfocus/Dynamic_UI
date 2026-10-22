using BankingApi.Data;
using BankingApi.Models;
using Microsoft.EntityFrameworkCore;

namespace BankingApi.Services;

public sealed class LedgerSnapshot
{
    public List<BankAccount> Accounts { get; init; } = [];
    public List<BankCard> Cards { get; init; } = [];
    public List<BankTransaction> Transactions { get; init; } = [];
    public List<Payee> Payees { get; init; } = [];
    public List<BudgetTarget> Budgets { get; init; } = [];
    public UserAccount? User { get; init; }
    public List<AiAuditLog> Audits { get; init; } = [];
}

public interface ILedgerInsightService
{
    Task<LedgerSnapshot> LoadAsync(CancellationToken cancellationToken = default);
    Task<InsightFeedDto> GetFeedAsync(CancellationToken cancellationToken = default);
    Task<CardDispute> FileDisputeAsync(string transactionId, string reason, CancellationToken cancellationToken = default);
    Task<TravelNotice> FileTravelNoticeAsync(TravelNoticeRequest request, CancellationToken cancellationToken = default);
}

public sealed class LedgerInsightService : ILedgerInsightService
{
    private readonly BankingDbContext _db;

    public LedgerInsightService(BankingDbContext db)
    {
        _db = db;
    }

    public async Task<LedgerSnapshot> LoadAsync(CancellationToken cancellationToken = default)
    {
        return new LedgerSnapshot
        {
            Accounts = await _db.Accounts.AsNoTracking().ToListAsync(cancellationToken),
            Cards = await _db.Cards.AsNoTracking().ToListAsync(cancellationToken),
            Transactions = await _db.Transactions.AsNoTracking().OrderByDescending(t => t.Date).ToListAsync(cancellationToken),
            Payees = await _db.Payees.AsNoTracking().ToListAsync(cancellationToken),
            Budgets = await _db.BudgetTargets.AsNoTracking().ToListAsync(cancellationToken),
            User = await _db.Users.AsNoTracking().FirstOrDefaultAsync(cancellationToken),
            Audits = await _db.AuditLogs.AsNoTracking().OrderByDescending(a => a.Timestamp).Take(12).ToListAsync(cancellationToken)
        };
    }

    public async Task<InsightFeedDto> GetFeedAsync(CancellationToken cancellationToken = default)
    {
        var snap = await LoadAsync(cancellationToken);
        var checking = snap.Accounts.FirstOrDefault(a => a.Id == "acc-chk-01") ?? snap.Accounts.First();
        var tx = snap.Transactions.Where(t => t.AccountId == checking.Id).ToList();
        var today = DateTime.UtcNow;
        var subs = LedgerAnalytics.Subscriptions(tx);
        var anomalies = LedgerAnalytics.Anomalies(tx);
        var forecast = LedgerAnalytics.Forecast(checking, tx, today);
        var budget = LedgerAnalytics.Budget(tx, snap.Budgets, today);
        var monthStart = new DateTime(today.Year, today.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var monthNet = snap.Transactions.Where(t => t.Date >= monthStart).Sum(t => t.Amount);

        return new InsightFeedDto(
            snap.Accounts.Sum(a => a.Balance),
            Math.Round(monthNet, 2),
            forecast.ProjectedEndBalance,
            checking.Id,
            LedgerAnalytics.Chips(anomalies, subs, forecast, budget));
    }

    public async Task<CardDispute> FileDisputeAsync(string transactionId, string reason, CancellationToken cancellationToken = default)
    {
        var tx = await _db.Transactions.AsNoTracking().FirstOrDefaultAsync(t => t.Id == transactionId, cancellationToken)
            ?? throw new InvalidOperationException("That transaction is not on the ledger.");

        var dispute = new CardDispute
        {
            Id = "dsp-" + Guid.NewGuid().ToString("N")[..8],
            TransactionId = tx.Id,
            Reason = string.IsNullOrWhiteSpace(reason) ? "Not recognized" : reason.Trim(),
            Amount = tx.Amount,
            Status = "Open",
            CreatedAt = DateTime.UtcNow,
            Details = tx.Description
        };
        _db.Disputes.Add(dispute);
        _db.AuditLogs.Add(new AiAuditLog
        {
            Action = "FileDispute",
            Initiator = "AI_Agent",
            Details = $"Dispute {dispute.Id} opened for {tx.Description} ({tx.Amount:C}) — {dispute.Reason}."
        });
        await _db.SaveChangesAsync(cancellationToken);
        return dispute;
    }

    public async Task<TravelNotice> FileTravelNoticeAsync(TravelNoticeRequest request, CancellationToken cancellationToken = default)
    {
        var card = await _db.Cards.FirstOrDefaultAsync(c => c.Id == request.CardId, cancellationToken)
            ?? throw new InvalidOperationException("Card not found.");

        if (request.TemporaryLimit > 0)
        {
            card.SpendingLimit = request.TemporaryLimit;
        }

        var notice = new TravelNotice
        {
            Id = "trv-" + Guid.NewGuid().ToString("N")[..8],
            Destination = request.Destination.Trim(),
            CardId = card.Id,
            StartDate = request.StartDate == default ? DateTime.UtcNow.Date : request.StartDate,
            EndDate = request.EndDate == default ? DateTime.UtcNow.Date.AddDays(7) : request.EndDate,
            TemporaryLimit = card.SpendingLimit,
            CreatedAt = DateTime.UtcNow
        };
        _db.TravelNotices.Add(notice);
        _db.AuditLogs.Add(new AiAuditLog
        {
            Action = "TravelNotice",
            Initiator = "AI_Agent",
            Details = $"Travel notice {notice.Id} for {notice.Destination}. {card.CardName} limit set to {card.SpendingLimit:C} through {notice.EndDate:yyyy-MM-dd}."
        });
        await _db.SaveChangesAsync(cancellationToken);
        return notice;
    }
}
