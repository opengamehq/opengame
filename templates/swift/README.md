# Swift target

A Swift/JavaScriptKit browser game. Click the moving square or press Space to
score. Swift owns movement, scoring and the OpenGame client; `Web/game-host.js`
draws the canvas and plays a short sound. Every fifth point submits the current
score to the `targets` board and displays the result.

The `opengame-sdk/` directory contains the local Swift package, lifecycle helper
and license. Copy the entire starter; it has no runtime dependency on this
repository's `integrations/` directory. The JavaScript SDK comes from the
`@opengamehq/sdk` `file:` dependency, as in the npm starters, never from a public
package.

## Prerequisites and build

Install Node.js 18 or newer with npm, Swift supporting tools version 5.9 or newer,
a matching Swift WebAssembly/WASI SDK, and JavaScriptKit's PackageToJS command
plugin (`swift package js`). SwiftPM resolves JavaScriptKit from its official
repository as declared in `Package.swift`; the first build needs network access
or a populated SwiftPM cache. Keep the resulting `Package.resolved` with your
project. Do not use a host-native Swift executable as the web export.

From this directory:

```bash
npm install
npm run build
```

The wrapper defaults to `SWIFT_BIN=swift` and
`SWIFT_WASM_SDK=wasm32-unknown-wasip1`. Set either environment variable for your
installed toolchain. It reads the installed plugin's help, builds the single
`SwiftTarget` executable in release configuration, then packages the generated
page, JavaScriptKit runtime and wasm into `dist/`. If the plugin advertises
`--output`, its intermediate output is `.build/opengame-web/`. If your plugin
uses a fixed output location, set `PACKAGE_TO_JS_OUTPUT` to that documented
location. A missing plugin or missing wasm fails the build.

For a genuine export produced with your toolchain's own documented PackageToJS
command, packaging can also be run separately:

```bash
npm run package:web -- /absolute/path/to/PackageToJS/output
```

Both commands preserve the generated loader and insert classic scripts in this
order before it: `opengame-global.js`, `opengame-sdk/lifecycle.js`, `game-host.js`.
Both copy the SDK's `opengame-global.js` and its notice into `dist/`, so run
`npm install` before the first build. The page does not depend on the platform
injecting `/_og/sdk.js`, which the live site does only for a threaded release.
No credentials belong in the export.

## Check and publish

Install and sign in with the approved OpenGame CLI separately, then run:

```bash
npm run check
opengame dev .
# After reviewing the local game and every check finding:
npm run deploy
opengame status --watch --json
```

The scripts use `opengame` on PATH, or the executable specified by
`OPENGAME_BIN`. `deploy` creates a private release; it does not submit it.
Play that release's preview. Only on the creator's request, run
`opengame submit --release <releaseId> --json` and complete certification.
Keep `.opengame/` so retries target the existing game and release.

## Rebuilding

See [EXPORT.md](EXPORT.md) for exact source, export and runtime checks. A rebuild
replaces only a `dist/` previously produced by this packager. Move an unrelated
`dist/` aside yourself. No compiled output is checked in. OpenGame has not yet
built this starter or tested it end to end: uploaded, played in a browser and
with platform services working.

Guide: the Engines page in the OpenGame docs (`/engines/overview`).

Packaging stages a complete replacement under `.build/` before swapping the
owned `dist/`. A failed copy preserves the prior export; the next invocation
recovers any interrupted swap without treating partial files as a new export.
