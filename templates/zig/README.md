# zig starter

Source or export scaffold. Install the toolchain and runtime named by the engine guide before building. No compiled output is supplied.

Guide: the WebAssembly page in the OpenGame docs (`/engines/webassembly`).

## Verify

After producing a real export, run `opengame check . --json` from a project whose `build.output` points to it. Read every finding. Deploy only to an authorized account; play the actual preview before submitting the release on the creator's request. OpenGame has not yet tested this starter end to end: uploaded, played in a browser and with platform services working.

## Build this source

Install Zig with wasm32-freestanding support. `build.mjs` records the compiler arguments; note the compiler version alongside each build you check.

```bash
npm install
npm run build
opengame check . --json
```

The build writes its output to `dist/`.

## Native service wiring

The game imports the vendored Zig adapter and calls it through the native
callback. Its build exports memory and copies `opengame.mjs`, `lifecycle.js` and the
SDK's `opengame-global.js`, which the shell loads first; the module host installs the
imports on this exact instance. Initialization, pause and ready run inside Zig. Keep
the host and native adapter sources together because the host owns callback
allocations. The adapter was written for Zig 0.13 and builds with 0.14.1.

The SDK ships inside the build. `@opengamehq/sdk` is a `file:` dependency, as in the
npm starters, so run `npm install` before the first build. The page does not depend
on the platform injecting `/_og/sdk.js`, which the live site does not do yet.
