using BankingApi.Auth;
using BankingApi.Models;
using BankingApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace BankingApi.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IBankingService _banking;
    private readonly AuthSessionStore _sessions;

    public AuthController(IBankingService banking, AuthSessionStore sessions)
    {
        _banking = banking;
        _sessions = sessions;
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest request)
    {
        var username = request.Username?.Trim() ?? string.Empty;
        var password = request.Password ?? string.Empty;
        if (username.Length == 0 || password.Length == 0)
        {
            return BadRequest(new { message = "Enter your username and password." });
        }

        var user = await _banking.AuthenticateAsync(username, password);
        if (user == null)
        {
            var safeName = username.Length > 64 ? username[..64] : username;
            await _banking.RecordAuditAsync("UserLoginFailed", "Anonymous", $"Rejected sign-in attempt for '{safeName}'");
            return Unauthorized(new { message = "The username or password is incorrect." });
        }

        var session = _sessions.Create(user.Id, user.Username);
        return Ok(new LoginResponse
        {
            Token = session.Token,
            ExpiresAt = session.ExpiresAt,
            User = PublicUserProfile.From(user)
        });
    }

    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        var userId = HttpContext.Items["UserId"] as string;
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var profile = await _banking.GetUserByIdAsync(userId);
        return profile == null ? Unauthorized() : Ok(PublicUserProfile.From(profile));
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        var token = BearerTokens.Read(HttpContext);
        var username = HttpContext.Items["Username"] as string ?? "User";
        if (!string.IsNullOrEmpty(token))
        {
            _sessions.Revoke(token);
        }

        await _banking.RecordAuditAsync("UserLogout", username, "Online banking session ended");
        return Ok(new { success = true });
    }
}
