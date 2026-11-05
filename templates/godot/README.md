# godot starter

Source or export scaffold. Install the toolchain and runtime named by the engine guide before building. No compiled output is supplied.

Guide: the Godot page in the OpenGame docs (`/engines/godot`).

## Verify

After producing a real export, run `opengame check . --json` from a project whose `build.output` points to it. Read every finding. Deploy only to an authorized account; play the actual preview before submitting the release on the creator's request. OpenGame has not yet tested this starter end to end: uploaded, played in a browser and with platform services working.

## Build this source

Install Godot 4 and matching web export templates. Set `GODOT_BIN` if the executable is not named godot. This project uses GDScript, the Compatibility renderer, and a single-thread Web preset.

```bash
npm install
npm run build
opengame check . --json
```

The SDK ships inside the export. `@opengamehq/sdk` is a `file:` dependency, as in the
npm starters; `build.mjs` copies its `opengame-global.js` into `dist/`, and the Web
preset's `html/head_include` loads it before the engine, so `main.gd` finds the
`OpenGame` interface without the platform injecting `/_og/sdk.js`.

The build writes its output to `dist/`.
