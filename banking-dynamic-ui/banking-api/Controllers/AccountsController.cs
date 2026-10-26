using BankingApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace BankingApi.Controllers;

[ApiController]
[Route("api")]
public class AccountsController : ControllerBase
{
    private readonly IBankingService _banking;

    public AccountsController(IBankingService banking)
    {
        _banking = banking;
    }

    [HttpGet("accounts")]
    public async Task<IActionResult> List() => Ok(await _banking.GetAccountsAsync());

    [HttpGet("accounts/{id}")]
    public async Task<IActionResult> Get(string id)
    {
        var account = await _banking.GetAccountAsync(id);
        return account == null ? NotFound() : Ok(account);
    }

    [HttpGet("statements/{accountId}")]
    public async Task<IActionResult> Statements(string accountId, int? limit) =>
        Ok(await _banking.GetStatementsAsync(accountId, limit ?? 10));

    [HttpGet("transactions")]
    public async Task<IActionResult> Transactions(int? limit) =>
        Ok(await _banking.GetStatementsAsync(null, Math.Clamp(limit ?? 40, 1, 100)));
}
