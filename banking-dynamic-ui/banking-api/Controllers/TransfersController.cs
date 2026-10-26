using BankingApi.Models;
using BankingApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace BankingApi.Controllers;

[ApiController]
[Route("api/transfers")]
public class TransfersController : ControllerBase
{
    private readonly IBankingService _banking;

    public TransfersController(IBankingService banking)
    {
        _banking = banking;
    }

    [HttpPost]
    public async Task<IActionResult> Create(TransferFundsRequest request)
    {
        var success = await _banking.TransferFundsAsync(
            request.FromAccountId,
            request.ToAccountOrRecipient,
            request.Amount,
            request.Note);

        return success
            ? Ok(new { success = true, message = $"Successfully transferred ${request.Amount:F2} to {request.ToAccountOrRecipient}." })
            : BadRequest(new { success = false, message = "Insufficient funds or invalid account." });
    }
}
