using BankingApi.Models;
using BankingApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace BankingApi.Controllers;

[ApiController]
[Route("api")]
public class SecurityController : ControllerBase
{
    private readonly IBankingService _banking;

    public SecurityController(IBankingService banking)
    {
        _banking = banking;
    }

    [HttpPost("security/password-reset")]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequest request)
    {
        var userId = HttpContext.Items["UserId"] as string;
        var success = await _banking.ResetPasswordAsync(request.NewPassword, "UserPortal", userId);
        return success
            ? Ok(new { success, message = "Security credentials updated." })
            : BadRequest(new { success = false, message = "Password could not be updated." });
    }

    [HttpGet("user-profile")]
    public async Task<IActionResult> GetProfile()
    {
        var userId = HttpContext.Items["UserId"] as string;
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var profile = await _banking.GetUserByIdAsync(userId);
        return profile == null ? NotFound() : Ok(PublicUserProfile.From(profile));
    }

    [HttpPut("user-profile")]
    public async Task<IActionResult> UpdateProfile(UserAccount user)
    {
        var success = await _banking.UpdateUserAsync(user, "UserPortal");
        return success ? Ok(new { success = true, user }) : NotFound();
    }
}
