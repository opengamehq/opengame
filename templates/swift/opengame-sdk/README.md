# OpenGame for SwiftWasm and JavaScriptKit

A Swift Package Manager source package using JavaScriptKit 0.30.x-compatible
APIs. Add it as a local package dependency and link the `OpenGame` product. Build
a browser application with the project's SwiftWasm/PackageToJS tooling; a native
Swift build does not become a web app just by importing this package.

Copy `Web/lifecycle.js` into the exported web assets and load it with a classic
`<script src="lifecycle.js"></script>` after `opengame-global.js` and before engine
startup. This packaged helper keeps results from one session out of the next;
it requires no eval and must be included with the consuming app.

```swift
import OpenGame

let client = try Bridge { message in
    // Route message.kind/id/name/json to the game.
}
let initialization = try client.request("init")
// After init succeeds and game assets are ready:
try client.ready()
// On game disposal:
client.close()
```

`environmentJSON` and `playerJSON` preserve the core's JSON values. The JSClosure is retained for the client's lifetime and released
when closing (also during deinitialization). Do not capture the client strongly
inside its own handler; doing so creates a retain cycle. All calls belong on the
browser main thread. `Bridge()` throws `BridgeError.unavailable` when the target
is not wasm32 or the injected global is absent. Missing JSKit browser runtime
setup still needs to be handled by the consuming application.

Packaging: distribute `Package.swift`, `Sources`, `Web`, README and LICENSE as
a source tarball. The dependency is a semver range within JavaScriptKit 0.x;
commit the consuming application's `Package.resolved` for reproducibility.
Before relying on it, run a consuming PackageToJS application, check its wasm
runtime setup and test that shutdown never calls a released JSClosure.

Interop reference: [JavaScriptKit](https://github.com/swiftwasm/JavaScriptKit).

## Contract and status

This is a source adapter. OpenGame has not yet compiled it or tested it in a
browser with platform services working. No package has been published.

Ship the SDK's `opengame-global.js` beside the export, with its
`opengame-global.js.LEGAL.txt` notice, and load it with a classic script tag before
the engine. It is `dist/opengame-global.js` in the approved SDK package, the file
`@opengamehq/sdk/global` resolves to, and the starter in `templates/swift` copies it
into `dist` this way. Do not rely on the platform injecting `/_og/sdk.js`, which the
live site does only for a threaded release, and do not move the file under `/_og/`,
which uploads refuse. There is one `OpenGame.bridge.setHandler` slot per
page. Use one adapter/client per page, and route all game features through it;
do not install another native adapter or replace the handler from JavaScript.
Close/detach releases the handler and discards pending deliveries. A new adapter
can connect afterwards; it receives no results from the old owner.

`request` returns the **core's** id immediately. The later `result` message has
that id, the operation name, and the unchanged JSON result envelope
`{"ok":true,"value":...}` or `{"ok":false,"error":...}`. Event ids are zero.
Installing the handler immediately replays player, pause, mute and fullscreen
state. `ready` only announces readiness; call `request("init", "{}")` first and
inspect its result. Call fullscreen, sign-in and link operations directly from
user input so browser activation is preserved. No adapter supplies
authentication, protocol messages or its own development mock.

Full operation arguments and event shapes are in the native bridge section of
the OpenGame docs (`/engines/services#native-bridge`) and the SDK's README. `env` and `player` are raw JSON
snapshots. All API calls belong on the engine's browser main thread.

The repository's [`swift` starter](../../templates/swift/README.md)
vendors this source adapter and includes its companion in the documented build
or export preparation command. Use that flow for a complete consumer example.
