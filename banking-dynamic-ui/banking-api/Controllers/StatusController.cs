using Microsoft.AspNetCore.Mvc;

namespace BankingApi.Controllers;

[ApiController]
public class StatusController : ControllerBase
{
    [HttpGet("/")]
    public IActionResult Health() => Ok(new
    {
        service = "Apex Banking Dynamic UI API",
        status = "Active",
        orm = "Entity Framework Core 10 (SQLite)",
        timestamp = DateTime.UtcNow
    });
}
