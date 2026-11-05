using System;
using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;
using System.Text.Json;
using System.Threading.Tasks;
using OpenGame;

[SupportedOSPlatform("browser")]
public partial class Target
{
    private static int points;
    private static bool paused;
    private static bool initialized;
    private static bool ready;
    private static int initializationId;
    private static Bridge? client;
    private static readonly TaskCompletionSource<bool> initialization = new(TaskCreationOptions.RunContinuationsAsynchronously);

    public static async Task Main()
    {
        try
        {
            client = await Bridge.ConnectAsync(OnMessage, "/opengame-sdk/opengame.js");
            initializationId = client.Request("init");
            await initialization.Task;
        }
        catch
        {
            Shutdown();
            throw;
        }
    }

    private static void OnMessage(BridgeMessage message)
    {
        if (message.Kind == "event" && message.Id == 0 && message.Name == "pause")
        {
            using var state = JsonDocument.Parse(message.Json);
            paused = state.RootElement.GetBoolean();
        }
        else if (message.Kind == "result" && message.Id == initializationId && message.Name == "init")
        {
            try
            {
                using var result = JsonDocument.Parse(message.Json);
                if (result.RootElement.GetProperty("ok").GetBoolean())
                {
                    initialized = true;
                    initialization.TrySetResult(true);
                }
                else initialization.TrySetException(new InvalidOperationException("OpenGame initialization failed."));
            }
            catch (Exception error)
            {
                initialization.TrySetException(error);
            }
        }
    }

    [JSExport] public static int Points() => points;
    [JSExport] public static int X() => 40 + (points * 97) % 520;

    [JSExport]
    public static void Tap(double x, double y)
    {
        if (!initialized || paused) return;
        if (x >= X() && x <= X() + 70 && y >= 180 && y <= 250) points++;
    }

    [JSExport]
    public static void FrameRendered()
    {
        if (!initialized || ready || client is null) return;
        client.Ready();
        ready = true;
    }

    [JSExport]
    public static void Shutdown()
    {
        initialized = false;
        client?.Dispose();
        client = null;
    }
}
