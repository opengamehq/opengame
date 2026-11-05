# flame starter

Source or export scaffold. Install the toolchain and runtime named by the engine guide before building. No compiled output is supplied.

Guide: the Engines page in the OpenGame docs (`/engines/overview`).

## Verify

After producing a real export, run `opengame check . --json` from a project whose `build.output` points to it. Read every finding. Deploy only to an authorized account; play the actual preview before submitting the release on the creator's request. OpenGame has not yet tested this starter end to end: uploaded, played in a browser and with platform services working.

## Build this source

Install Node.js and Flutter with web support and Dart 3.3 or newer. The installed Flutter must support `flutter build web --no-web-resources-cdn`. The first build creates the web project under `.build/flutter` and resolves Flame with the installed SDK. Keep its generated `pubspec.lock`; later builds reuse that project and its existing Flame dependency.

```bash
npm install
npm run build
opengame check . --json
opengame dev .
```

`npm run build` adds `opengame` to the generated project's dependencies with `path: ../../opengame-sdk`. The vendored Dart package and license come from `integrations/dart`; no checkout of that directory is needed. The command copies `lib/` and `web/` into the generated project, copies the package's `web/lifecycle.js` to its `web/opengame-lifecycle.js` and the SDK's `opengame-global.js` beside it, runs the Flutter web build with local renderer resources, and copies the entire export to `dist/`. It packages both automatically on every build.

The supplied `web/index.html` loads `opengame-global.js`, then `opengame-lifecycle.js`, then Flutter's generated bootstrap. The SDK ships inside the build. `@opengamehq/sdk` is a `file:` dependency, as in the npm starters, so run `npm install` before the first build. The page does not depend on the platform injecting `/_og/sdk.js`, which the live site does only for a threaded release.

`TargetGame` owns one native Dart `Bridge`. It checks the asynchronous init result by request id, gates input until success, and calls `ready()` after rendering a playable frame. Pause events are bare JSON booleans; they gate input and pause or resume Flame's engine. Initial pause replay is retained while the first frame renders. Removing the game closes the bridge. Initialization errors remain visible in the game instead of announcing readiness.
