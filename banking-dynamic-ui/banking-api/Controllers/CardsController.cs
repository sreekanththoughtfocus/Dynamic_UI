using BankingApi.Models;
using BankingApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace BankingApi.Controllers;

[ApiController]
[Route("api/cards")]
public class CardsController : ControllerBase
{
    private readonly IBankingService _banking;

    public CardsController(IBankingService banking)
    {
        _banking = banking;
    }

    [HttpGet]
    public async Task<IActionResult> List() => Ok(await _banking.GetCardsAsync());

    [HttpPost("{cardId}/pin")]
    public async Task<IActionResult> ResetPin(string cardId, ResetPinRequest request)
    {
        var success = await _banking.ResetCardPinAsync(cardId, request.NewPin);
        return Ok(new { success, message = success ? "PIN updated successfully in core banking." : "Card not found." });
    }

    [HttpPost("{cardId}/freeze")]
    public async Task<IActionResult> Freeze(string cardId, FreezeCardRequest request)
    {
        var success = await _banking.SetCardFreezeAsync(cardId, request.Freeze);
        return Ok(new
        {
            success,
            isFrozen = request.Freeze,
            message = $"Card {(request.Freeze ? "frozen" : "unfrozen")} successfully."
        });
    }

    [HttpPost("{cardId}/limit")]
    public async Task<IActionResult> UpdateLimit(string cardId, UpdateLimitRequest request)
    {
        var success = await _banking.UpdateCardLimitAsync(cardId, request.Limit, "User");
        return success
            ? Ok(new { success = true, limit = request.Limit })
            : NotFound(new { success = false, message = "Card not found." });
    }
}
