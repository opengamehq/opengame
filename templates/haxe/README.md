# haxe starter

Source or export scaffold. Install the toolchain and runtime named by the engine guide before building. No compiled output is supplied.

Guide: the Engines page in the OpenGame docs (`/engines/overview`).

## Verify

After producing a real export, run `opengame check . --json` from a project whose `build.output` points to it. Read every finding. Deploy only to an authorized account; play the actual preview before submitting the release on the creator's request. OpenGame has not yet tested this starter end to end: uploaded, played in a browser and with platform services working.

## Build this source

Install the Haxe compiler. This target uses standard browser bindings and no external haxelib dependencies.

```bash
npm install
npm run build
opengame check . --json
```

The build writes its output to `dist/`.

## Native service wiring

The game imports `opengame.Bridge` from the vendored `opengame-sdk/src`
classpath. The build copies the SDK's `opengame-global.js` and the companion lifecycle
helper, and the shell loads them in that order, before `main.js`. Initialization,
pause and ready pass through the Haxe adapter. No haxelib installation is needed for
this local copy.

The SDK ships inside the build. `@opengamehq/sdk` is a `file:` dependency, as in the
npm starters, so run `npm install` before the first build. The page does not depend
on the platform injecting `/_og/sdk.js`, which the live site does not do yet.
