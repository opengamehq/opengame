# go starter

Source or export scaffold. Install the toolchain and runtime named by the engine guide before building. No compiled output is supplied.

Guide: the WebAssembly page in the OpenGame docs (`/engines/webassembly`).

## Verify

After producing a real export, run `opengame check . --json` from a project whose `build.output` points to it. Read every finding. Deploy only to an authorized account; play the actual preview before submitting the release on the creator's request. OpenGame has not yet tested this starter end to end: uploaded, played in a browser and with platform services working.

## Build this source

Install Go. The build copies wasm_exec.js from that exact installation so the runtime matches the compiler.

```bash
npm install
npm run build
opengame check . --json
```

The build writes its output to `dist/`.

## Native service wiring

The game imports the vendored Go module in `opengame-sdk/`; no unpublished Go
module is fetched. `build.mjs` copies its `lifecycle.js` and the compiler-matched
`wasm_exec.js` into `dist`, with the SDK's `opengame-global.js` beside them. The shell
loads `opengame-global.js`, the lifecycle helper, then the Go runtime. Initialization,
pause and ready pass through the Go adapter. Rebuild after editing vendored sources.

The SDK ships inside the build. `@opengamehq/sdk` is a `file:` dependency, as in the
npm starters, so run `npm install` before the first build. The page does not depend
on the platform injecting `/_og/sdk.js`, which the live site does not do yet.
