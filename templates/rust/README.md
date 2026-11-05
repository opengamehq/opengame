# rust starter

Source or export scaffold. Install the toolchain and runtime named by the engine guide before building. No compiled output is supplied.

Guide: the WebAssembly page in the OpenGame docs (`/engines/webassembly`).

## Verify

After producing a real export, run `opengame check . --json` from a project whose `build.output` points to it. Read every finding. Deploy only to an authorized account; play the actual preview before submitting the release on the creator's request. OpenGame has not yet tested this starter end to end: uploaded, played in a browser and with platform services working.

## Build this source

Install Rust and run `rustup target add wasm32-unknown-unknown`. This starter uses raw wasm exports and no rendering-engine crate.

```bash
npm run build
opengame check . --json
```

The build writes its output to `dist/`.
