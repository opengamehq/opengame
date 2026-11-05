using System.Runtime.InteropServices.JavaScript;
using System.Text.Json;

namespace OpenGame;

public sealed record BridgeMessage(string Kind, int Id, string Name, string Json);

/// <summary>One browser owner for the SDK callback. Call on the browser main thread.</summary>
[System.Runtime.Versioning.SupportedOSPlatform("browser")]
public sealed class Bridge : IDisposable
{
    private bool disposed;
    // Keeping the delegate alive is necessary while JavaScript owns its callable proxy.
    private readonly Action<string> callback;

    private Bridge(Action<BridgeMessage> handler)
    {
        callback = json =>
        {
            // Explicit parsing also works when the browser app disables reflection
            // serialization for trimming or AOT.
            using var document = JsonDocument.Parse(json);
            var value = document.RootElement;
            handler(new BridgeMessage(value.GetProperty("kind").GetString()!,
                value.GetProperty("id").GetInt32(), value.GetProperty("name").GetString()!,
                value.GetProperty("json").GetString()!));
        };
        Native.Attach(callback);
    }

    public static async Task<Bridge> ConnectAsync(Action<BridgeMessage> handler,
        string moduleUrl = "/_content/OpenGame.Sdk/opengame.js")
    {
        if (!OperatingSystem.IsBrowser()) throw new PlatformNotSupportedException("OpenGame is unavailable outside the browser.");
        ArgumentNullException.ThrowIfNull(handler);
        await JSHost.ImportAsync("opengame-dotnet", moduleUrl);
        return new Bridge(handler);
    }

    // The returned id matches a later Kind == "result" message. Json is the core
    // result envelope, including errors; the adapter never turns errors into success.
    public int Request(string operation, string argsJson = "{}") { Check(); return Native.Request(operation, argsJson); }
    public string EnvironmentJson() { Check(); return Native.Env(); }
    public string PlayerJson() { Check(); return Native.Player(); }
    public void Ready() { Check(); Native.Ready(); }
    private void Check() => ObjectDisposedException.ThrowIf(disposed, this);
    public void Dispose() { if (disposed) return; Native.Detach(); disposed = true; }
}

[System.Runtime.Versioning.SupportedOSPlatform("browser")]
internal static partial class Native
{
    [JSImport("attach", "opengame-dotnet")]
    internal static partial void Attach([JSMarshalAs<JSType.Function<JSType.String>>] Action<string> callback);
    [JSImport("detach", "opengame-dotnet")] internal static partial void Detach();
    [JSImport("request", "opengame-dotnet")] internal static partial int Request(string operation, string json);
    [JSImport("env", "opengame-dotnet")] internal static partial string Env();
    [JSImport("player", "opengame-dotnet")] internal static partial string Player();
    [JSImport("ready", "opengame-dotnet")] internal static partial void Ready();
}
