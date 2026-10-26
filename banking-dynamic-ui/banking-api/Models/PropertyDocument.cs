using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace BankingApi.Models;

public class AppPropertyDocument
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string TreeJson { get; set; } = "[]";
    public string ValuesJson { get; set; } = "{}";
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class PropertyNode
{
    public string Id { get; set; } = string.Empty;
    public string Kind { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ItemType { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<PropertyOption>? Options { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ActionKey { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<PropertyNode>? Children { get; set; }
}

public class PropertyOption
{
    public string Value { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
}

public class PropertyDocumentSummaryDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public DateTime UpdatedAt { get; set; }
}

public class PropertyDocumentDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public List<PropertyNode> Tree { get; set; } = [];
    public Dictionary<string, JsonNode?> Values { get; set; } = new();
    public DateTime UpdatedAt { get; set; }
}

public class SavePropertyDocumentRequest
{
    public string? Name { get; set; }
    public List<PropertyNode>? Tree { get; set; }
    public Dictionary<string, JsonNode?>? Values { get; set; }
}

public sealed class PropertySaveResult
{
    public PropertyDocumentDto? Document { get; init; }
    public string? Error { get; init; }
    public bool NotFound { get; init; }

    public static PropertySaveResult Ok(PropertyDocumentDto document) => new() { Document = document };

    public static PropertySaveResult Fail(string error) => new() { Error = error };

    public static PropertySaveResult Missing(string error) => new() { Error = error, NotFound = true };
}
