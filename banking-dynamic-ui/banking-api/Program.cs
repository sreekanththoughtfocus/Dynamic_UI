using BankingApi.Auth;
using BankingApi.Data;
using BankingApi.Models;
using BankingApi.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true);
builder.Services.Configure<LlmSettings>(builder.Configuration.GetSection("LlmSettings"));

var connectionString = builder.Configuration.GetConnectionString("BankingDb") ?? "Data Source=banking.db";
builder.Services.AddDbContext<BankingDbContext>(options =>
    options.UseSqlite(connectionString));

builder.Services.AddScoped<IBankingService, BankingService>();
builder.Services.AddScoped<ILedgerBootstrap, LedgerBootstrap>();
builder.Services.AddScoped<ILedgerInsightService, LedgerInsightService>();
builder.Services.AddScoped<IConciergePlanner, ConciergePlanner>();
builder.Services.AddSingleton<IFxRateService, FxRateService>();
builder.Services.AddSingleton<AuthSessionStore>();
builder.Services.AddHttpClient();
builder.Services.AddHttpClient(nameof(CursorCloudAgentsClient), client =>
{
    client.Timeout = TimeSpan.FromMinutes(10);
});
builder.Services.AddSingleton<CursorCloudAgentsClient>();
builder.Services.AddScoped<ILlmService, MultiProviderLlmService>();
builder.Services.AddScoped<ISemanticKernelService, SemanticKernelService>();
builder.Services.AddControllers();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAngularApp", policy =>
    {
        policy.WithOrigins("http://localhost:4200", "http://127.0.0.1:4200")
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<BankingDbContext>();
    await db.Database.EnsureCreatedAsync();
    await scope.ServiceProvider.GetRequiredService<ILedgerBootstrap>().EnsureAsync();
}

app.UseCors("AllowAngularApp");
app.UseMiddleware<SessionAuthMiddleware>();
app.MapControllers();

app.Run();
