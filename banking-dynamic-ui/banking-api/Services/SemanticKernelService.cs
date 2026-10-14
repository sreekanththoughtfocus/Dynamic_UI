using BankingApi.Models;
using Microsoft.Extensions.Options;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;

namespace BankingApi.Services;

public interface ISemanticKernelService
{
    Kernel GetKernel();
    IChatCompletionService? GetChatCompletion();
    bool IsAvailable();
}

public class SemanticKernelService : ISemanticKernelService
{
    private readonly Kernel _kernel;
    private readonly IChatCompletionService? _chatCompletion;
    private readonly bool _isConfigured;

    public SemanticKernelService(IOptions<LlmSettings> options, ILogger<SemanticKernelService> logger)
    {
        var settings = options.Value;
        var builder = Kernel.CreateBuilder();

        try
        {
            var provider = settings.Provider.ToLowerInvariant();
            if (provider == "openai" && !string.IsNullOrWhiteSpace(settings.ApiKey))
            {
                builder.AddOpenAIChatCompletion(settings.ModelId, settings.ApiKey);
                _isConfigured = true;
            }
            else if ((provider is "ollama" or "lmstudio" or "omlx") && !string.IsNullOrWhiteSpace(settings.Endpoint))
            {
                // Local OpenAI-compatible endpoint
                builder.AddOpenAIChatCompletion(
                    modelId: settings.ModelId,
                    apiKey: "none-required-for-local",
                    endpoint: new Uri(settings.Endpoint)
                );
                _isConfigured = true;
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Semantic Kernel initialization in standby: {Message}", ex.Message);
            _isConfigured = false;
        }

        _kernel = builder.Build();
        _chatCompletion = _isConfigured ? _kernel.Services.GetService<IChatCompletionService>() : null;
    }

    public Kernel GetKernel() => _kernel;
    public IChatCompletionService? GetChatCompletion() => _chatCompletion;
    public bool IsAvailable() => _isConfigured && _chatCompletion != null;
}
