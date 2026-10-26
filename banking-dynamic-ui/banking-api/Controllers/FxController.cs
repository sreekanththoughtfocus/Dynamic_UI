using BankingApi.Models;
using BankingApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace BankingApi.Controllers;

[ApiController]
[Route("api/fx")]
public class FxController : ControllerBase
{
    private readonly IFxRateService _fx;

    public FxController(IFxRateService fx)
    {
        _fx = fx;
    }

    [HttpGet("rates")]
    public async Task<IActionResult> Rates(CancellationToken cancellationToken)
    {
        try
        {
            var table = await _fx.GetTableAsync(cancellationToken);
            return Ok(new { asOf = table.AsOf.ToString("yyyy-MM-dd"), source = table.Source, perUsd = table.PerUsd });
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Problem(title: "Live FX rates are unavailable", detail: ex.Message, statusCode: StatusCodes.Status503ServiceUnavailable);
        }
    }

    [HttpPost("lock")]
    public async Task<IActionResult> Lock(FxLockRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var quote = await _fx.LockAsync(request.From, request.To, request.Amount <= 0 ? 1 : request.Amount, cancellationToken);
            return Ok(quote);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Problem(title: "Live FX rates are unavailable", detail: ex.Message, statusCode: StatusCodes.Status503ServiceUnavailable);
        }
    }
}
