namespace BankingApi.Models;

public class LlmSettings
{
    /// <summary>
    /// LLM Provider: "Mock", "Ollama", "Cursor", "LmStudio", "Omlx", "Gemini", "OpenAI", "Claude"
    /// </summary>
    public string Provider { get; set; } = "Mock";

    /// <summary>
    /// Model identifier (e.g. "llama3.2", "gemini-2.5-flash", "gpt-4o", "mistral")
    /// </summary>
    public string ModelId { get; set; } = "llama3.2";

    /// <summary>
    /// Endpoint URL for local or custom OpenAI-compatible providers, or Cursor API base (https://api.cursor.com).
    /// Ollama default: http://localhost:11434/v1
    /// LM Studio default: http://localhost:1234/v1
    /// MLX (OMLX) default: http://localhost:8000/v1
    /// </summary>
    public string Endpoint { get; set; } = "http://localhost:11434/v1";

    /// <summary>
    /// API Key for cloud providers (Cursor, Gemini, OpenAI, Claude) or CURSOR_API_KEY env var
    /// </summary>
    public string ApiKey { get; set; } = "";

    /// <summary>
    /// System prompt setting
    /// </summary>
    public string SystemPrompt { get; set; } = """
        You are Apex Banking Concierge, an intelligent banking AI assistant supporting retail banking customers.
        You have direct access to banking tools and Generative UI widgets.
        
        Rules:
        - When a user asks for statements, call the statement tool and emit the statementWidget.
        - When a user asks to reset credit card or debit card PIN, emit the cardPinResetWidget.
        - When a user asks to freeze/unfreeze card or adjust card limits, emit the cardControlsWidget.
        - When a user asks to reset password or check security, emit the passwordResetWidget.
        - When a user asks to transfer funds, emit the transferConfirmWidget.
        - Always remain professional, secure, and helpful.
        """;
}
