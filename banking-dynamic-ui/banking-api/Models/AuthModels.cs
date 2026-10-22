namespace BankingApi.Models;

public class LoginRequest
{
    public string? Username { get; set; }
    public string? Password { get; set; }
}

public class PublicUserProfile
{
    public string Id { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PhoneNumber { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public bool TwoFactorEnabled { get; set; }
    public bool BiometricsEnabled { get; set; }
    public string Role { get; set; } = string.Empty;
    public DateTime LastLoginAt { get; set; }
    public DateTime LastPasswordResetAt { get; set; }

    public static PublicUserProfile From(UserAccount user) => new()
    {
        Id = user.Id,
        Username = user.Username,
        FullName = user.FullName,
        Email = user.Email,
        PhoneNumber = user.PhoneNumber,
        Address = user.Address,
        TwoFactorEnabled = user.TwoFactorEnabled,
        BiometricsEnabled = user.BiometricsEnabled,
        Role = user.Role,
        LastLoginAt = user.LastLoginAt,
        LastPasswordResetAt = user.LastPasswordResetAt
    };
}

public class LoginResponse
{
    public string Token { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public PublicUserProfile User { get; set; } = new();
}
