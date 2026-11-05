# lua starter

Source or export scaffold. Install the toolchain and runtime named by the engine guide before building. No compiled output is supplied.

Guide: the Engines page in the OpenGame docs (`/engines/overview`).

## Verify

After producing a real export, run `opengame check . --json` from a project whose `build.output` points to it. Read every finding. Deploy only to an authorized account; play the actual preview before submitting the release on the creator's request. OpenGame has not yet tested this starter end to end: uploaded, played in a browser and with platform services working.

## Build this source

Install the declared npm dependencies. The wasmoon wasm is bundled from its pinned package into the output. No runtime CDN is used.

```bash
npm run build
opengame check . --json
```

The build writes its output to `dist/`.

## Native service wiring

The game uses the vendored Lua adapter through its explicit wasmoon host.
Vite bundles `opengame-sdk/hosts/wasmoon.mjs`, its lifecycle helper and message queue;
Lua modules and the example's local JSON codec are registered before `main.lua`.
`src/main.js` imports `@opengamehq/sdk/global` before anything else, so Vite bundles
the SDK and `window.OpenGame` exists before the Lua host looks for it. Initialization,
pause and ready run in Lua; polling drains the native queue every frame. No external
Lua module download or manual script insertion is required.

The SDK ships inside the build. `@opengamehq/sdk` is a `file:` dependency, as in the
npm starters, so run `npm install` before the first build. The page does not depend
on the platform injecting `/_og/sdk.js`, which the live site does not do yet.
