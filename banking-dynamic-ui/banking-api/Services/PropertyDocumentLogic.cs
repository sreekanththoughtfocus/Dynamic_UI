using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using BankingApi.Data;
using BankingApi.Models;
using Microsoft.EntityFrameworkCore;

namespace BankingApi.Services;

public static class PropertyDocumentLogic
{
    public const string SampleId = "banking-preferences";

    public static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private static readonly HashSet<string> ItemTypes = new(StringComparer.Ordinal)
    {
        "radio", "checkbox", "dropdown", "text", "toggle", "number",
    };

    private static readonly Regex IdPattern = new("^[A-Za-z0-9_-]+$", RegexOptions.CultureInvariant | RegexOptions.Compiled);

    public static async Task EnsureStorageAsync(BankingDbContext db, CancellationToken cancellationToken)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS "AppPropertyDocuments" (
                "Id" TEXT NOT NULL CONSTRAINT "PK_AppPropertyDocuments" PRIMARY KEY,
                "Name" TEXT NOT NULL,
                "TreeJson" TEXT NOT NULL,
                "ValuesJson" TEXT NOT NULL,
                "UpdatedAt" TEXT NOT NULL
            );
            """,
            cancellationToken);

        if (!await db.AppPropertyDocuments.AnyAsync(cancellationToken))
        {
            db.AppPropertyDocuments.Add(CreateSample());
        }
    }

    public static PropertyDocumentDto ToDto(AppPropertyDocument row)
    {
        return new PropertyDocumentDto
        {
            Id = row.Id,
            Name = row.Name,
            Tree = JsonSerializer.Deserialize<List<PropertyNode>>(row.TreeJson, JsonOptions) ?? [],
            Values = JsonSerializer.Deserialize<Dictionary<string, JsonNode?>>(row.ValuesJson, JsonOptions) ?? new(),
            UpdatedAt = row.UpdatedAt,
        };
    }

    public static NormalizedPropertyDocument Normalize(SavePropertyDocumentRequest request)
    {
        var name = request.Name?.Trim() ?? string.Empty;
        if (name.Length == 0)
        {
            return NormalizedPropertyDocument.Fail("The document needs a name.");
        }

        if (name.Length > 120)
        {
            return NormalizedPropertyDocument.Fail("The document name is too long.");
        }

        if (request.Tree == null)
        {
            return NormalizedPropertyDocument.Fail("The document needs a tree.");
        }

        var tree = new List<PropertyNode>();
        var items = new Dictionary<string, PropertyNode>(StringComparer.Ordinal);
        var ids = new HashSet<string>(StringComparer.Ordinal);
        var treeError = NormalizeNodes(request.Tree, null, ids, tree, items);
        if (treeError != null)
        {
            return NormalizedPropertyDocument.Fail(treeError);
        }

        var values = new Dictionary<string, JsonNode?>(StringComparer.Ordinal);
        foreach (var item in items.Values)
        {
            if (request.Values == null || !request.Values.TryGetValue(item.Id, out var raw) || raw == null)
            {
                continue;
            }

            var valueError = ValidateValue(item, raw);
            if (valueError != null)
            {
                return NormalizedPropertyDocument.Fail(valueError);
            }

            values[item.Id] = raw.DeepClone();
        }

        return new NormalizedPropertyDocument(
            null,
            name,
            JsonSerializer.Serialize(tree, JsonOptions),
            JsonSerializer.Serialize(values, JsonOptions),
            tree,
            values);
    }

    private static AppPropertyDocument CreateSample()
    {
        var tree = new List<PropertyNode>
        {
            new()
            {
                Id = "security",
                Kind = "menu",
                Label = "Security",
                Children =
                [
                    new()
                    {
                        Id = "two-factor",
                        Kind = "item",
                        Label = "Two-factor method",
                        ItemType = "radio",
                        Options =
                        [
                            new() { Value = "sms", Label = "SMS" },
                            new() { Value = "app", Label = "Authenticator app" },
                            new() { Value = "email", Label = "Email" },
                        ],
                    },
                    new()
                    {
                        Id = "alerts",
                        Kind = "item",
                        Label = "Alerts",
                        ItemType = "toggle",
                        Children =
                        [
                            new()
                            {
                                Id = "alert-channel",
                                Kind = "submenu",
                                Label = "Alert channel",
                                Children =
                                [
                                    new()
                                    {
                                        Id = "channel",
                                        Kind = "item",
                                        Label = "Send alerts by",
                                        ItemType = "dropdown",
                                        Options =
                                        [
                                            new() { Value = "push", Label = "Push" },
                                            new() { Value = "sms", Label = "SMS" },
                                        ],
                                    },
                                    new()
                                    {
                                        Id = "email-copy",
                                        Kind = "item",
                                        Label = "Also email me",
                                        ItemType = "checkbox",
                                    },
                                ],
                            },
                        ],
                    },
                    new()
                    {
                        Id = "freeze-card",
                        Kind = "action",
                        Label = "Freeze card",
                        ActionKey = "freezeCard",
                    },
                ],
            },
        };

        var values = new Dictionary<string, JsonNode?>
        {
            ["two-factor"] = JsonValue.Create("app"),
            ["alerts"] = JsonValue.Create(true),
            ["channel"] = JsonValue.Create("push"),
            ["email-copy"] = JsonValue.Create(true),
        };

        return new AppPropertyDocument
        {
            Id = SampleId,
            Name = "Banking preferences",
            TreeJson = JsonSerializer.Serialize(tree, JsonOptions),
            ValuesJson = JsonSerializer.Serialize(values, JsonOptions),
            UpdatedAt = DateTime.UtcNow,
        };
    }

    private static string? NormalizeNodes(
        IReadOnlyList<PropertyNode>? nodes,
        string? parentKind,
        HashSet<string> ids,
        List<PropertyNode> target,
        Dictionary<string, PropertyNode> items)
    {
        foreach (var source in nodes ?? [])
        {
            var id = source.Id?.Trim() ?? string.Empty;
            if (id.Length == 0 || id.Length > 80 || !IdPattern.IsMatch(id))
            {
                return "Every node needs an id made of letters, numbers, hyphens, or underscores.";
            }

            if (!ids.Add(id))
            {
                return $"The id '{id}' is used more than once.";
            }

            var label = source.Label?.Trim() ?? string.Empty;
            if (label.Length == 0)
            {
                return "Every node needs a label.";
            }

            if (label.Length > 200)
            {
                return "A label is longer than 200 characters.";
            }

            var kind = source.Kind?.Trim().ToLowerInvariant() ?? string.Empty;
            if (kind is not ("menu" or "submenu" or "item" or "action"))
            {
                return $"'{label}' has an unknown kind.";
            }

            if (!IsAllowedChild(parentKind, kind))
            {
                var place = parentKind ?? "the root";
                return $"'{label}' cannot be placed under {place}.";
            }

            var clean = new PropertyNode
            {
                Id = id,
                Kind = kind,
                Label = label,
            };

            if (kind == "item")
            {
                var itemType = source.ItemType?.Trim().ToLowerInvariant() ?? string.Empty;
                if (!ItemTypes.Contains(itemType))
                {
                    return $"'{label}' needs a control type.";
                }

                clean.ItemType = itemType;
                if (itemType is "radio" or "dropdown")
                {
                    var optionsError = NormalizeOptions(source.Options, label, out var options);
                    if (optionsError != null)
                    {
                        return optionsError;
                    }

                    clean.Options = options;
                }
            }
            else if (kind == "action")
            {
                var actionKey = source.ActionKey?.Trim() ?? string.Empty;
                if (actionKey.Length == 0 || actionKey.Length > 80 || actionKey.Any(char.IsWhiteSpace))
                {
                    return $"'{label}' needs an action key without spaces.";
                }

                clean.ActionKey = actionKey;
            }

            var children = new List<PropertyNode>();
            var childError = NormalizeNodes(source.Children, kind, ids, children, items);
            if (childError != null)
            {
                return childError;
            }

            if (kind == "action" && children.Count > 0)
            {
                return $"'{label}' cannot contain other nodes.";
            }

            if (children.Count > 0)
            {
                clean.Children = children;
            }

            if (kind == "item")
            {
                items[id] = clean;
            }

            target.Add(clean);
        }

        return null;
    }

    private static string? NormalizeOptions(List<PropertyOption>? source, string label, out List<PropertyOption> options)
    {
        options = [];
        if (source == null || source.Count == 0)
        {
            return $"'{label}' needs at least one choice.";
        }

        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var option in source)
        {
            var value = option.Value?.Trim() ?? string.Empty;
            var optionLabel = option.Label?.Trim() ?? string.Empty;
            if (value.Length == 0 || optionLabel.Length == 0)
            {
                return $"Each choice on '{label}' needs a value and a label.";
            }

            if (!seen.Add(value))
            {
                return $"'{label}' has two choices with the value '{value}'.";
            }

            options.Add(new PropertyOption { Value = value, Label = optionLabel });
        }

        return null;
    }

    private static string? ValidateValue(PropertyNode item, JsonNode raw)
    {
        var itemType = item.ItemType ?? string.Empty;
        switch (itemType)
        {
            case "checkbox":
            case "toggle":
                if (!IsBoolean(raw))
                {
                    return $"'{item.Label}' needs an on or off answer.";
                }

                return null;
            case "number":
                if (!IsNumber(raw))
                {
                    return $"'{item.Label}' needs a number.";
                }

                return null;
            case "radio":
            case "dropdown":
                if (!TryGetString(raw, out var choice))
                {
                    return $"'{item.Label}' needs one of its choices.";
                }

                if (item.Options == null || item.Options.All(option => option.Value != choice))
                {
                    return $"'{item.Label}' must use one of its choices.";
                }

                return null;
            case "text":
                if (!TryGetString(raw, out _))
                {
                    return $"'{item.Label}' needs a text answer.";
                }

                return null;
            default:
                return $"'{item.Label}' has an unknown control type.";
        }
    }

    private static bool IsAllowedChild(string? parentKind, string kind) => parentKind switch
    {
        null => kind == "menu",
        "menu" or "submenu" => kind is "item" or "action",
        "item" => kind == "submenu",
        _ => false,
    };

    private static bool IsBoolean(JsonNode node) =>
        node is JsonValue value && value.TryGetValue<bool>(out _);

    private static bool IsNumber(JsonNode node)
    {
        if (node is not JsonValue value || value.GetValueKind() != JsonValueKind.Number)
        {
            return false;
        }

        return value.TryGetValue<double>(out _) || value.TryGetValue<decimal>(out _) || value.TryGetValue<int>(out _);
    }

    private static bool TryGetString(JsonNode node, out string text)
    {
        if (node is JsonValue value && value.TryGetValue<string>(out var parsed) && parsed != null)
        {
            text = parsed;
            return true;
        }

        text = string.Empty;
        return false;
    }
}

public sealed record NormalizedPropertyDocument(
    string? Error,
    string Name,
    string TreeJson,
    string ValuesJson,
    List<PropertyNode> Tree,
    Dictionary<string, JsonNode?> Values)
{
    public static NormalizedPropertyDocument Fail(string error) =>
        new(error, string.Empty, "[]", "{}", [], new());
}
