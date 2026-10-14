using BankingApi.Models;
using Microsoft.EntityFrameworkCore;

namespace BankingApi.Data;

public class BankingDbContext : DbContext
{
    public BankingDbContext(DbContextOptions<BankingDbContext> options) : base(options)
    {
    }

    public DbSet<BankAccount> Accounts => Set<BankAccount>();
    public DbSet<BankTransaction> Transactions => Set<BankTransaction>();
    public DbSet<BankCard> Cards => Set<BankCard>();
    public DbSet<AiAuditLog> AuditLogs => Set<AiAuditLog>();
    public DbSet<UserAccount> Users => Set<UserAccount>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<UserAccount>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.Username).IsUnique();
        });

        modelBuilder.Entity<BankAccount>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Balance).HasPrecision(18, 2);
            entity.Property(e => e.AvailableBalance).HasPrecision(18, 2);
        });

        modelBuilder.Entity<BankTransaction>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Amount).HasPrecision(18, 2);
            entity.HasIndex(e => e.AccountId);
            entity.HasIndex(e => e.Date);
        });

        modelBuilder.Entity<BankCard>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.SpendingLimit).HasPrecision(18, 2);
            entity.Property(e => e.CurrentBalance).HasPrecision(18, 2);
        });

        modelBuilder.Entity<AiAuditLog>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.Timestamp);
        });

        // Seed initial banking dataset
        SeedInitialData(modelBuilder);
    }

    private static void SeedInitialData(ModelBuilder modelBuilder)
    {
        var now = new DateTime(2026, 10, 13, 12, 0, 0, DateTimeKind.Utc);

        modelBuilder.Entity<UserAccount>().HasData(
            new UserAccount
            {
                Id = "usr-alex-01",
                Username = "alex.vance",
                FullName = "Alex Vance",
                Email = "a.vance@example.com",
                Password = "ApexSecure2026!",
                PhoneNumber = "+1 (555) 382-9104",
                Address = "742 Evergreen Terrace, San Francisco, CA 94107",
                TwoFactorEnabled = true,
                BiometricsEnabled = true,
                Role = "Premier Private Client",
                LastLoginAt = now.AddHours(-1),
                LastPasswordResetAt = now.AddDays(-14)
            }
        );

        modelBuilder.Entity<BankAccount>().HasData(
            new BankAccount
            {
                Id = "acc-chk-01",
                AccountNumber = "CHK-98214-01",
                AccountType = "Premier Checking",
                Balance = 24890.75m,
                AvailableBalance = 24390.75m,
                Currency = "USD",
                OwnerName = "Alex Vance"
            },
            new BankAccount
            {
                Id = "acc-sav-02",
                AccountNumber = "SAV-33108-02",
                AccountType = "High-Yield Savings (4.75% APY)",
                Balance = 78250.00m,
                AvailableBalance = 78250.00m,
                Currency = "USD",
                OwnerName = "Alex Vance"
            },
            new BankAccount
            {
                Id = "acc-inv-03",
                AccountNumber = "INV-55091-03",
                AccountType = "Global Wealth Portfolio",
                Balance = 142600.40m,
                AvailableBalance = 142600.40m,
                Currency = "USD",
                OwnerName = "Alex Vance"
            }
        );

        modelBuilder.Entity<BankCard>().HasData(
            new BankCard
            {
                Id = "card-crd-01",
                CardNumberMasked = "•••• •••• •••• 8821",
                CardType = "Credit",
                CardName = "Apex Black Diamond Elite",
                ExpiryDate = "11/29",
                IsFrozen = false,
                SpendingLimit = 25000m,
                CurrentBalance = 4120.30m,
                ColorScheme = "diamond-dark",
                Pin = "8821"
            },
            new BankCard
            {
                Id = "card-deb-02",
                CardNumberMasked = "•••• •••• •••• 3419",
                CardType = "Debit",
                CardName = "Apex Premier Debit Platinum",
                ExpiryDate = "05/28",
                IsFrozen = false,
                SpendingLimit = 5000m,
                CurrentBalance = 0m,
                ColorScheme = "emerald-cyan",
                Pin = "3419"
            }
        );

        modelBuilder.Entity<BankTransaction>().HasData(
            new BankTransaction
            {
                Id = "tx-101",
                AccountId = "acc-chk-01",
                Date = now.AddHours(-3),
                Description = "Amazon Web Services Cloud Infrastructure",
                Category = "Cloud & Tech",
                Amount = -342.50m,
                Type = "Debit",
                Status = "Posted"
            },
            new BankTransaction
            {
                Id = "tx-102",
                AccountId = "acc-chk-01",
                Date = now.AddDays(-1),
                Description = "Whole Foods Organic Market",
                Category = "Groceries",
                Amount = -185.20m,
                Type = "Debit",
                Status = "Posted"
            },
            new BankTransaction
            {
                Id = "tx-103",
                AccountId = "acc-chk-01",
                Date = now.AddDays(-2),
                Description = "Payroll Direct Deposit - TechForward Corp",
                Category = "Income",
                Amount = 6450.00m,
                Type = "Credit",
                Status = "Posted"
            },
            new BankTransaction
            {
                Id = "tx-104",
                AccountId = "acc-chk-01",
                Date = now.AddDays(-3),
                Description = "Starbucks Reserve Roastery",
                Category = "Dining",
                Amount = -14.80m,
                Type = "Debit",
                Status = "Posted"
            },
            new BankTransaction
            {
                Id = "tx-105",
                AccountId = "acc-chk-01",
                Date = now.AddDays(-4),
                Description = "Equinox Luxury Fitness Club",
                Category = "Health & Wellness",
                Amount = -280.00m,
                Type = "Debit",
                Status = "Posted"
            },
            new BankTransaction
            {
                Id = "tx-106",
                AccountId = "acc-chk-01",
                Date = now.AddDays(-5),
                Description = "Delta Airlines Premium Transatlantic",
                Category = "Travel",
                Amount = -1240.00m,
                Type = "Debit",
                Status = "Posted"
            },
            new BankTransaction
            {
                Id = "tx-107",
                AccountId = "acc-chk-01",
                Date = now.AddDays(-6),
                Description = "Apple Store Online - MacBook Pro M4",
                Category = "Electronics",
                Amount = -2499.00m,
                Type = "Debit",
                Status = "Posted"
            }
        );
    }
}
