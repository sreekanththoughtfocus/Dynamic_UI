using System.Text.Json;
using BankingApi.Models;
using BankingApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace BankingApi.Controllers;

[ApiController]
[Route("api")]
public class ChatController : ControllerBase
{
    private readonly ILlmService _llm;

    public ChatController(ILlmService llm)
    {
        _llm = llm;
    }

    [HttpGet("llm/status")]
    public IActionResult LlmStatus(IConfiguration config)
    {
        var current = _llm.GetCurrentProviderInfo();
        var settings = config.GetSection("LlmSettings").Get<LlmSettings>() ?? new LlmSettings();
        return Ok(new
        {
            provider = current.Name,
            model = current.Model,
            isLocal = current.IsLocal,
            endpoint = settings.Endpoint,
            database = "Entity Framework Core (banking.db)",
            availableProviders = new[]
            {
                new { id = "Ollama", name = "Ollama Local LLM", description = "http://localhost:11434/v1 (llama3.2, etc.)" },
                new { id = "Cursor", name = "Cursor Cloud Agents API", description = "https://api.cursor.com (Bearer API key)" },
                new { id = "Mock", name = "Zero-Config Simulation (Instant POC)", description = "Built-in intelligent domain generator" },
                new { id = "LmStudio", name = "LM Studio Local", description = "http://localhost:1234/v1" },
                new { id = "Omlx", name = "OMLX / MLX Engine", description = "http://localhost:8000/v1 (Apple Silicon optimized)" },
                new { id = "Gemini", name = "Google Gemini 2.5", description = "Cloud API via API key" },
                new { id = "OpenAI", name = "OpenAI GPT-4o", description = "Cloud API via API key" },
                new { id = "Claude", name = "Anthropic Claude 3.5", description = "Cloud API via API key" }
            }
        });
    }

    [HttpPost("chat")]
    public async Task Chat(ChatRequest request, CancellationToken cancellationToken)
    {
        Response.Headers.Append("Content-Type", "text/event-stream");
        Response.Headers.Append("Cache-Control", "no-cache");
        Response.Headers.Append("Connection", "keep-alive");

        await foreach (var evt in _llm.StreamChatAsync(request, cancellationToken).WithCancellation(cancellationToken))
        {
            var json = JsonSerializer.Serialize(evt);
            await Response.WriteAsync($"data: {json}\n\n", cancellationToken);
            await Response.Body.FlushAsync(cancellationToken);
        }
    }
}
