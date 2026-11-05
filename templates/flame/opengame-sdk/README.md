# OpenGame for Dart, Flutter and Flame web exports

A Dart 3.3+ package using `dart:js_interop`, with conditional exports for native
targets. Add a path dependency to this directory while the package is unpublished.

Copy `web/lifecycle.js` into the exported web assets and load it with a classic
`<script src="lifecycle.js"></script>` after `opengame-global.js` and before engine
startup. This packaged helper keeps results from one session out of the next;
it requires no eval and must be included with the consuming app.

```dart
import 'package:opengame/opengame.dart';

final client = Bridge((message) {
  // Handle results by message.id; message.json is the unchanged payload.
});
final initialization = client.request('init');
// In the successful initialization handler, after your game is ready:
client.ready();
// When the game or Flame component is disposed:
client.close();
```

Use `request`, `environmentJson`, `playerJson`, `ready` and `close`. The callback
receives every state event, including pause and mute; a Flame component
can route these to its game's own pause/audio controls without another listener.
Native/mobile builds throw `UnsupportedError`; this package does not emulate the
platform or enable services outside a browser.

Packaging: `dart pub publish --dry-run` after analysis and a consuming
Flutter/Dart web build. `publish_to: none` prevents accidental publication; set
publication metadata before a release. Test both JS and wasm Flutter exports.

Interop reference: [Dart JS interop usage](https://dart.dev/interop/js-interop/usage).

## Contract and status

This is a source adapter. OpenGame has not yet compiled it or tested it in a
browser with platform services working. No package has been published.

Ship the SDK's `opengame-global.js` beside the export, with its
`opengame-global.js.LEGAL.txt` notice, and load it with a classic script tag before
the engine. It is `dist/opengame-global.js` in the approved SDK package, the file
`@opengamehq/sdk/global` resolves to, and the starter in `templates/flame` puts it in
Flutter's `web/` input this way. Do not rely on the platform injecting `/_og/sdk.js`,
which the live site does only for a threaded release, and do not move the file under
`/_og/`, which uploads refuse. There is one `OpenGame.bridge.setHandler` slot per
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

The repository's [`flame` starter](../../templates/flame/README.md)
vendors this source adapter and includes its companion in the documented build
or export preparation command. Use that flow for a complete consumer example.
