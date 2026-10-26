using BankingApi.Models;
using BankingApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace BankingApi.Controllers;

[ApiController]
[Route("api/admin")]
public class AdminController : ControllerBase
{
    private readonly IBankingService _banking;
    private readonly ILedgerBootstrap _bootstrap;

    public AdminController(IBankingService banking, ILedgerBootstrap bootstrap)
    {
        _banking = banking;
        _bootstrap = bootstrap;
    }

    [HttpGet("users")]
    public async Task<IActionResult> Users() => Ok(await _banking.GetAllUsersAsync());

    [HttpPut("users/{id}")]
    public async Task<IActionResult> UpdateUser(string id, UserAccount user)
    {
        user.Id = id;
        var success = await _banking.UpdateUserAsync(user, "AdminConsole");
        return success ? Ok(new { success = true, user }) : NotFound();
    }

    [HttpGet("overview")]
    public async Task<IActionResult> Overview() => Ok(await _banking.GetDatabaseOverviewAsync());

    [HttpPost("reset-db")]
    public async Task<IActionResult> ResetDatabase()
    {
        await _banking.ResetDatabaseAsync();
        await _bootstrap.EnsureAsync();
        return Ok(new { success = true, message = "Database wiped and re-seeded with initial records." });
    }

    [HttpPost("transactions")]
    public async Task<IActionResult> AddTransaction(BankTransaction transaction) =>
        Ok(await _banking.AddTransactionAsync(transaction, "AdminConsole"));

    [HttpGet("property-documents")]
    public async Task<IActionResult> PropertyDocuments() =>
        Ok(await _banking.ListPropertyDocumentsAsync());

    [HttpGet("property-documents/{id}")]
    public async Task<IActionResult> PropertyDocument(string id)
    {
        var document = await _banking.GetPropertyDocumentAsync(id);
        return document == null ? NotFound(new { message = "Property document was not found." }) : Ok(document);
    }

    [HttpPut("property-documents/{id}")]
    public async Task<IActionResult> SavePropertyDocument(string id, SavePropertyDocumentRequest request)
    {
        var initiator = HttpContext.Items["Username"] as string;
        if (string.IsNullOrWhiteSpace(initiator))
        {
            initiator = "AdminConsole";
        }

        var result = await _banking.SavePropertyDocumentAsync(id, request, initiator);
        if (result.NotFound)
        {
            return NotFound(new { message = result.Error });
        }

        if (result.Error != null)
        {
            return BadRequest(new { message = result.Error });
        }

        return Ok(result.Document);
    }
}
