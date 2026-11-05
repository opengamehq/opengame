# OpenGame for Ren'Py web exports

Copy `opengame.py` and `opengame.rpy` into the project's `game/` folder. Add the
supplied `lifecycle.js`, then `opengame.js` to the **web shell** and load them after the package archive's
`sdk/opengame-global.js`, before Ren'Py starts. Python uses the real `emscripten.run_script_string` API, with every
argument JSON-escaped. There is no Python-to-network protocol.

```python
# Runtime code, not a default/save variable:
client = opengame_connect()
if client is not None:
    initialization = client.request("init")
    # From a screen timer or interaction callback:
    for message in client.poll():
        # Inspect kind/id/name/json.
        pass
```

`Bridge` exposes `request`, `env`, `player`, `ready`, `poll`, and `close`.
Poll regularly during interaction rather than waiting in a busy loop. The callback queue lives in JS and is drained into copied Python data.
The bridge remains live until `close`; closing drops queued messages.
`available()` is false when the web module or required JS host is absent, and
`Bridge()` raises `UnavailableError`. `opengame_connect()` returns `None` in that
case, allowing the same story to run on desktop without fake services.

Keep the client in runtime-only module state, clear/close it on return to the
main menu, and reconnect for a new browser session. Do not put its pending ids
or the client in rollback/save variables. A save file cannot restore an
in-flight browser operation.

Packaging: archive the files from `manifest.json`, then build a real Ren'Py web
export with the modified shell. Test the exported shell and the eval-enabled
runtime in a browser before relying on them.

Interop reference: [Ren'Py's emscripten API](https://github.com/renpy/renpy/blob/master/runtime/emscripten.pyi).

## Contract and status

This is a source adapter. OpenGame has not yet compiled it or tested it in a
browser with platform services working. No package has been published.

Ship the package archive's `sdk/opengame-global.js`, with its `.LEGAL.txt` notice, and
load it before the engine. OpenGame adds `/_og/sdk.js` only to a release whose scan
finds threads, so an ordinary release that names that path has no SDK. There is one `OpenGame.bridge.setHandler` slot per
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

The repository's [`renpy` starter](../../templates/renpy/README.md)
vendors this source adapter and includes its companion in the documented build
or export preparation command. Use that flow for a complete consumer example.
