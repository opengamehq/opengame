# OpenGame.Sdk for .NET browser exports

A NuGet-shaped Razor class library over `[JSImport]`, for .NET 8+ browser builds,
including KNI. This does not add a web target to MonoGame, Stride or Godot C#.
The package carries `wwwroot/opengame.js` as a static web asset. Add a project
reference during development; after packaging, use the `OpenGame.Sdk` package.

```csharp
using OpenGame;
Bridge client = await Bridge.ConnectAsync(message => {
    // Json is the unchanged payload.
    if (message.Kind == "result") Console.WriteLine($"{message.Id}: {message.Json}");
});
int initialization = client.Request("init");
// After the successful initialization result, when the game can accept input:
client.Ready();
int score = client.Request("board.submit", "{\"key\":\"targets\",\"score\":12}");
client.Dispose();
```

The delegate is retained until disposal.
`ConnectAsync` throws `PlatformNotSupportedException` outside a browser and when
its host module is missing. The default static asset URL is
`/_content/OpenGame.Sdk/opengame.js`; pass `moduleUrl` when a custom static exporter
puts it elsewhere. Keep the file on the game origin. `.NET` imports it before
claiming the bridge callback. Explicit JSON parsing avoids reflection-dependent
serialization in AOT builds.

Packaging command: `dotnet pack OpenGame.Sdk.csproj -c Release -o <local-staging>`.
Check that the nupkg includes the static asset, then load a consuming browser app
from the actual .NET or KNI export.

Interop reference: [Microsoft's browser interop guide](https://learn.microsoft.com/en-us/aspnet/core/client-side/dotnet-interop/).

## Contract and status

This is a source adapter. OpenGame has not yet compiled it or tested it in a
browser with platform services working. No package has been published.

Ship the SDK's `opengame-global.js` beside the export, with its
`opengame-global.js.LEGAL.txt` notice, and load it with a classic script tag before
the engine. It is `dist/opengame-global.js` in the approved SDK package, the file
`@opengamehq/sdk/global` resolves to, and the starter in `templates/csharp` copies it
into `dist` this way. Do not rely on the platform injecting `/_og/sdk.js`, which the
live site does only for a threaded release, and do not move the file under `/_og/`,
which uploads refuse. There is one `OpenGame.bridge.setHandler` slot per
page. Use one adapter/client per page, and route all game features through it;
do not install another native adapter or replace the handler from JavaScript.
Close/detach releases the handler and discards pending deliveries. A new adapter
can connect afterwards; it receives no results from the old owner.

`request` returns the **core's** id immediately. The later `result` message has
that id, the operation name, and the unchanged JSON result envelope
`{"ok":true,"value":...}` or `{"ok":false,"error":...}`. Event ids are zero.
Installing the handler immediately replays player, pause, mute and fullscreen
state. `ready` only announces readiness; call `request("init", "{}")` first and
inspect its result. Call fullscreen, sign-in and link operations directly from
user input so browser activation is preserved. No adapter supplies
authentication, protocol messages or its own development mock.

Full operation arguments and event shapes are in the native bridge section of
the OpenGame docs (`/engines/services#native-bridge`) and the SDK's README. `env` and `player` are raw JSON
snapshots. All API calls belong on the engine's browser main thread.

The repository's [`csharp` starter](../../templates/csharp/README.md)
vendors this source adapter and includes its companion in the documented build
or export preparation command. Use that flow for a complete consumer example.
