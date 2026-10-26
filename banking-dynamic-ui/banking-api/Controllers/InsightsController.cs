using BankingApi.Models;
using BankingApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace BankingApi.Controllers;

[ApiController]
[Route("api")]
public class InsightsController : ControllerBase
{
    private readonly IBankingService _banking;
    private readonly ILedgerInsightService _insights;

    public InsightsController(IBankingService banking, ILedgerInsightService insights)
    {
        _banking = banking;
        _insights = insights;
    }

    [HttpGet("insights")]
    public async Task<IActionResult> Feed(CancellationToken cancellationToken) =>
        Ok(await _insights.GetFeedAsync(cancellationToken));

    [HttpGet("audit-logs")]
    public async Task<IActionResult> AuditLogs() => Ok(await _banking.GetAuditLogsAsync());

    [HttpPost("disputes")]
    public async Task<IActionResult> FileDispute(FileDisputeRequest request, CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await _insights.FileDisputeAsync(request.TransactionId, request.Reason, cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("travel-notices")]
    public async Task<IActionResult> FileTravelNotice(TravelNoticeRequest request, CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await _insights.FileTravelNoticeAsync(request, cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }
}
