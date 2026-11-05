# csharp starter

Source or export scaffold. Install the toolchain and runtime named by the engine guide before building. No compiled output is supplied.

Guide: the Engines page in the OpenGame docs (`/engines/overview`).

## Verify

After producing a real export, run `opengame check . --json` from a project whose `build.output` points to it. Read every finding. Deploy only to an authorized account; play the actual preview before submitting the release on the creator's request. OpenGame has not yet tested this starter end to end: uploaded, played in a browser and with platform services working.

## Build this source

Install Node.js and a .NET SDK containing the `wasmbrowser` template and the matching `wasm-tools` workload. The first build creates its browser project under `.build/browser`. Keep that SDK's runtime with its compiled output.

```bash
npm install
npm run build
opengame check . --json
opengame dev .
```

`npm run build` adds a project reference to the vendored `opengame-sdk/OpenGame.Sdk.csproj`, publishes the browser app, and writes the export to `dist/`. It copies this starter's `index.html`, `main.js`, `node-only.js`, both `opengame-sdk/wwwroot` JavaScript files and the SDK's `opengame-global.js` into that export. `dist/opengame-sdk/opengame.js` imports its sibling `lifecycle.js` itself; there is no extra script-copy step. The vendored C# source and license come from `integrations/dotnet`; the starter builds without that repository directory.

The HTML loads `opengame-global.js` before the .NET startup module. The SDK ships inside the build. `@opengamehq/sdk` is a `file:` dependency, as in the npm starters, so run `npm install` before the first build. The page does not depend on the platform injecting `/_og/sdk.js`, which the live site does only for a threaded release.

`Program.cs` owns the native `Bridge` connection and matches the asynchronous init result by request id. Failed initialization prevents play and ready. Pause events contain a bare JSON boolean and gate C# input. JavaScript draws the target and calls the C# `FrameRendered` export after a painted frame; that export calls `Bridge.Ready()` once. On page unload the host calls the C# shutdown export to release the adapter. No JavaScript code claims an additional bridge handler.
