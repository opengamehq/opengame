# melonjs starter

Source project with a small target game and the OpenGame SDK.

## Run

```bash
npm install
npm run dev
npm run build
opengame check . --json
```

The SDK comes from `packages/sdk` through a `file:` dependency, so build the starter inside a checkout of the OpenGame repository. The `.npmrc` stops npm from fetching any other package under the `@opengamehq` name.

Guide: the JavaScript engines page in the OpenGame docs (`/engines/javascript`).

## Verify

After producing a real export, run `opengame check . --json` from a project whose `build.output` points to it. Read every finding. Deploy only to an authorized account; play the actual preview before submitting the release on the creator's request. OpenGame has not yet tested this starter end to end: uploaded, played in a browser and with platform services working.

This source uses melonJS 20’s `Application` and awaited `app.init()` API, read from the pinned package declarations. It does not call the older `video.init()` entry. Runtime verification is still pending.
