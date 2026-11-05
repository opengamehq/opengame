# How the SDK reaches the game

Pick one path, and read the matching section of the installed SDK's README before
writing the calls; the operations and their arguments are listed there for that
version.

## Bundled JavaScript

`import { og } from '@opengamehq/sdk'`, with `@opengamehq/sdk/avatar` as a separate
entry so a game bundles only what it imports.
Importing starts nothing: no listener, no timer, no request until `og.init()`.

## No build step

Copy `dist/opengame.js` into the game's own files and load it with a `<script>` before
the game's scripts; it defines the global `OpenGame.og`. `dist/avatar.js` imports
nothing and loads from a `<script type="module">`, given `OpenGame.og` as the client.

## The injected global

Some runtime contracts have OpenGame add `/_og/sdk.js`, the complete SDK, to each game
page; today the cross-origin isolated ones do. It defines `OpenGame`, with
`OpenGame.og` and `OpenGame.bridge`.
Check for `window.OpenGame` in the preview's game frame before relying on it, and
otherwise ship a copy yourself.

The injected global starts the handshake as it loads, before the game's own scripts:
it listens to the page and requests the session. That is how a native engine whose
runtime takes a minute to boot still has its player on the first menu. It does no
more than that until `og.init()`: no input, error or frame-rate reporting, and
`og.track` returns `unavailable`. Call `og.init()` as usual; it adopts what has already arrived.

On those contracts the tag is always added; og-games decides from the contract alone
and never reads the manifest. `"sdk": { "inject": false }` in `opengame.json` is honoured
only by the older contract whose serving tree the pipeline rewrites, which no new release
gets. A game that also ships its own copy is fine: copies of one SDK major install one
core and share a single `og`, so there is still one handshake. The copy that loads
first is the one that runs, which on these contracts is the platform's, so code against
the version the platform serves, not a newer minor you bundled. A copy of a different
major gets a client of its own.

## `js/og-platform.js`

Games built from the Studio template, and our Originals, call the helpers in
`js/og-platform.js` (`ogReady`, `ogEvent` and the rest). The SDK's
`dist/og-platform.js` is rebuilt on the SDK, so a game moves
onto one implementation by replacing that one file. It contains the core: use its `og`
export for new code rather than adding a second copy of the SDK, so the version you
tested is the only one that runs. Its `ogEvent`
becomes `og.track`, so events then reach the creator's stats through the events API.

## Native engines

An engine that cannot call JavaScript objects directly uses `OpenGame.bridge` from the
injected or shipped global: `setHandler` receives results and events as JSON strings,
`request(op, args)` returns an id whose result arrives on the handler.
The adapter adds no handshake, credential
or mock of its own; the core does all of that. The list of operations is in
the README under "Injected global and native engines".

Call the bridge from the browser's main thread. `window.OpenGame` does not exist in a
Web Worker and shared memory does not change that; send the call to the main thread
with the engine's own mechanism.

## Threaded and WebAssembly builds

A build that uses threads needs `SharedArrayBuffer`, which a frame has only when it is
cross-origin isolated. OpenGame's scan notices thread use and moves the release onto
an isolated contract before anybody plays it; the game page and its frame then get the
isolation headers. The game still has three things to do:

1. Declare it, when the game cannot start without threads:

   ```json
   { "requires": { "threads": true } }
   ```

   A browser that cannot run it then gets a sentence instead of a black frame. Leave it
   out of a single-thread export, or browsers that could play it are turned away.
2. Load its runtime, workers and assets from its own files. Isolation blocks a
   cross-origin script or image that does not send the matching headers.
3. Check it in the private preview, in the game's frame (choose the `opengame.gg`
   frame in the console's context menu first), in every browser the creator supports:

   ```js
   console.table({ secure: isSecureContext, isolated: crossOriginIsolated, sharedMemory: 'SharedArrayBuffer' in self })
   ```

   All three must read `true`. `opengame dev . --contract` with the isolated contract
   serves the same headers locally, but only the preview is the real page and frame.

Memory diagnostics, WebGPU and each engine's export settings are in the private docs
under engines.
