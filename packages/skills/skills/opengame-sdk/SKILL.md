---
name: opengame-sdk
description: Integrate a browser game with OpenGame through @opengamehq/sdk, the injected global or a native engine bridge. Covers start-up, the player and their OG at load, names, leaderboards, achievements, events, pause, mute, fullscreen, keys inside the frame and threaded builds. Use when the person says integrate with OpenGame, add the SDK, show the player's name or OG, add a leaderboard or achievement, track events, fix fullscreen or keys in the game frame, or asks how a game talks to OpenGame.
metadata:
  version: "1.0.6"
---

# Integrate a game with OpenGame

Inside an OpenGame page the SDK works as described here. Under `opengame dev` it runs a
local stand-in that keeps scores and events in the browser. Until OpenGame launches, the CLI
that deploys the game prints "OpenGame is not launched." for anybody outside the OpenGame
team; write the SDK calls now, and they are exercised on OpenGame once it opens.

The SDK is what ends up inside the game. It talks only to the OpenGame page around
the game and to `{{raw allowedGameOrigins.api}}`.
The game never holds a key, never
sees an email and never talks to opengame.io. Four rules shape every call:

1. **Nothing is required.** A game that calls nothing still runs. A game that calls
   everything still runs outside OpenGame and when the platform is down.
2. **The page brokers, the game asks.** Identity and sessions arrive
   from the page over `postMessage`. The SDK accepts messages only from its exact
   parent window on a trusted origin.
3. **Every number a game reports is the game's claim.** Scores, achievements and
   events are labelled as the game's and never decide anything that matters.
4. **Check before offering a feature.** `og.capabilities` lists what this page offers
   this game today.

## Take API facts from the installed SDK

This skill holds the practices. The SDK package holds the API for its own version, so
read the copy the game will ship before writing a call:

- `node_modules/@opengamehq/sdk/README.md`: the full reference, including the bridge
  operations and every result shape.
- `node_modules/@opengamehq/sdk/AGENTS.md`: the short rules and the error catalogue,
  generated from the SDK's own error table.
- `node_modules/@opengamehq/sdk/dist/*.d.ts`: the exact signatures.
- With no package to hand, the SDK reference (`/reference/sdk` in the private docs).

Never guess a name. A call that is not in that README does not exist in that version.
Where this skill and the installed README disagree, follow the README and tell the
OpenGame team which line here is wrong.

## Choose how the SDK reaches the game

| The game | Load it | Then `og` is |
| --- | --- | --- |
| Bundled JavaScript | `import { og } from '@opengamehq/sdk'` | the import |
| No build step | copy `dist/opengame.js` beside the game, in a `<script>` before the game's own | `OpenGame.og` |
| Already ships `js/og-platform.js` (Studio template, our Originals) | replace that file with the SDK's `dist/og-platform.js` | its `og` export |
| A native engine (WebAssembly, Kaigen, Unity, Godot) | `OpenGame.bridge`, called from the main thread | the bridge's operations |

Ship the SDK with the game rather than loading it from a CDN, so an outage cannot take it
away.

{{install sdk-agent}}

Some runtime contracts add the full global at `/_og/sdk.js` to the
game's pages themselves. How each path works, and what happens when a game ships its
own copy as well: [references/engines.md](references/engines.md).

## Start, and give the player their identity at load

```js
import { og } from '@opengamehq/sdk'
import { watchAvatar } from '@opengamehq/sdk/avatar'

const started = og.init()   // outside a frame at once; inside one within {{s platform.sdk.handshakeTimeoutMs}}, longer while the page checks who is playing
watchAvatar(og, avatar => avatar ? buildYourOg(avatar) : useDefaultCharacter())  // start the build now
og.player.onChange(fillNames)   // the handle, or the game's default: the name rule below
await loadEngineAndAssets()  // the player usually arrives during this
await started
og.ready()                   // once, on the first frame the player can act in
```

- Call `og.init()` first, before the engine or the heavy assets, and do not block
  loading on it: it never rejects. Outside any frame it resolves straight away with
  `og.env.connected === false`; inside a frame that is not OpenGame it waits the full
  handshake first.
- The page answers the first message with the player, their OG and their outfit while
  the game is still under its loading screen. Use them then. Start building "Your OG"
  and fill the name at load, and wear the result when the menu opens.
- Call `og.ready()` on the **first playable frame**, not when the page loads and not
  behind a click-to-start overlay that the player has not seen yet.
- `og.env` is `{ embedded, connected, preview, sdkVersion, capabilities }`.
  `preview` is true on the owner's private preview.

Who the player is in each situation, the private rollout and the early handshake:
[references/identity.md](references/identity.md).

## Rules, most damaging first

**CRITICAL: the player is applied at load, not after the menu.** Wrong: waiting for
the title screen to read `og.player` or start building the OG. Right: subscribe right
after `og.init()` and build in the background; only the swap into the scene waits for
a menu. OG Clash showed its default character on the first menu, and "Your OG" turned
up most of a minute later, until it started the build under the loading screen.

**CRITICAL: the game never waits on the platform.** Core, board and achievement calls
answer `{ ok: true, value }` or `{ ok: false, error }` (boards add a `reason`).
The game keeps playing on every one of them. Review runs offline and previews have no identity, so a menu that waits on a
board or a sign-in is a menu that never opens.

**CRITICAL: browser functions are called with their own receiver.** Wrong:
`this.transport = fetch` and later `this.transport(url)`. Chrome throws `Illegal
invocation` before any request leaves. Right: call `fetch(url)` directly, or store
`fetch.bind(globalThis)`. OpenGame's own score refresh did this, and every suite passed
because Node's `fetch` and every mock ignore their receiver. Prove a network path in a
real browser, not with a mocked `fetch`.

**HIGH: fullscreen belongs to the page.** The frame cannot take fullscreen itself, and
OpenGame's page has its own Fullscreen button. Remove the game's own fullscreen control
and any call to `requestFullscreen` when it runs inside OpenGame; if the game keeps a
button, have it call `og.fullscreen.request()` from the player's click. OG Clash, Super
Mario Zombies, Mario Colosseum and World at War each had a native one to take out.

**HIGH: keys stay in the frame.** Prevent Tab's default when the game uses it and the
focus is not on one of the game's own controls; otherwise focus walks out to the page's
buttons and the game never hears Tab released. Release every held key on `blur` and on
`visibilitychange` to hidden, because its keyup will be delivered somewhere else (OG
Clash's scoreboard stuck open over the pause menu). Cancel the default of every wheel
turn, arrow, Space and Page key the game consumes, so the page around it does not
scroll.

**HIGH: pause and mute are honoured.** `og.onPause` stops simulation, timers and audio;
`og.audio.onHostMute` silences the game. The frame boots under a poster before the
player presses Play, muted and paused from the first handshake, so keep loading through
the pause. Start audio only from an `onHostMute(false)` that arrives after
`await og.init()`: `og.audio.muted` reads false until the page first says otherwise.

**HIGH: every name field starts as the player's handle.** Any name the game asks this
player for or shows as theirs, such as a call sign, trainer name, player name, nickname,
or their own HUD label or nameplate, is filled from `og.player.handle` inside
`og.player.onChange`, so a signed-in player starts with the name they chose on OpenGame.
`handle` is null for a guest, an account without a handle, a player not sharing their OG
in games and every private preview; then keep the game's own default. Stop filling once
the player edits the field, and when the game restores a name the player saved, show
that one instead. Allow {{raw handle.maxLength}} characters, `_` and `-` included, in
the field's `maxlength`, in the game's own name check and wherever the name is drawn.
Grep for name inputs and default names such as "Player" or "Rookie" to find every one
before you call this done.

```js
let edited = savedName !== null    // a name the player saved last time wins
if (edited) nameField.value = savedName
nameField.addEventListener('input', () => { edited = true })
og.player.onChange(player => {
  if (!edited) nameField.value = player.handle ?? DEFAULT_NAME   // null: the game's default
})
```

**HIGH: a threaded build declares it and is checked isolated.** A build that needs
`SharedArrayBuffer` declares `"requires": { "threads": true }` and is checked in the
preview's game frame for `crossOriginIsolated`; load its runtime from the game's own
files. Call the SDK from the main thread only.
[references/engines.md](references/engines.md) has the check.

**MEDIUM: a guest has no id on OpenGame today.** While accounts are in private testing
every guest, and every account that is not a confirmed member, gets `og.player.id ===
null`. The local mock's guest has `dev-guest`, so this breaks only on the real page.
Check `typeof og.player.id === 'string'` before using it as a key.

## Leaderboards and achievements

Declare each board and each achievement in `opengame.json` first, then:

```js
const board = og.leaderboard('rounds')
const saved = await board.submit(14, { mode: 'coop' })
if (!saved.ok) console.warn(saved.reason ?? saved.error)   // the player keeps playing
const top = await board.top({ limit: 10 })
const unlocked = await og.achievements.unlock('first_win')
```

Metadata keys are limited to {{typedkeys play.scoreMeta.keys}}; `level` is a string
here even though events also accept it as a number. Achievements answer
`unavailable_in_preview` in a private preview and unlock once the game is published.
Full calls, bounds and codes: [references/leaderboards.md](references/leaderboards.md).

## Events

```js
og.track('wave_cleared', { level: 14, duration_ms: 81234 })
```

Event names are lowercase with underscores, up to {{raw play.frameEventNameMax}}
characters. Properties are limited to {{list play.frameEventPropertyKeys}} and
{{n play.frameEventBytesMax}} bytes per event, at most
{{raw platform.sdk.eventsPerSessionPerMinute}} events a minute; anything else is dropped
rather than sent, and `og.track` returns `unavailable` before `og.init()`. Events are batched and
flushed every {{s platform.sdk.eventBatchMs}} and on page exit. Plays, sessions and play
time are measured by the page; do not track them yourself.

## The frame around the game

Focus, the poster, pause, mute, fullscreen, keys, scrolling and opening an outside link
with `og.openLink`: [references/frame.md](references/frame.md).

## Offline and local development

Under `opengame dev`, which sets the flag the local stand-in needs, `og.init()` gives a
guest player (`dev-guest`), or a signed-in
one (`dev-account`, handle `dev`) with `og.init({ dev: { player: "signed-in" } })` or
`?og-dev-player=signed-in`, leaderboards stored in
`localStorage` per page folder.
The whole game can be built and tested offline except achievements, which
answer `unavailable` outside OpenGame and before `og.init()` has resolved. Hosted failures never
fall back to fake local data, so a broken hosted call shows up as an error, not as a
working board on one machine.

## Common mistakes

| What you see | Why | Fix |
| --- | --- | --- |
| The default character on the first menu, "Your OG" much later | The OG is read or built only after the title | Build from `watchAvatar` at load; swap in at the menu |
| `TypeError: Illegal invocation` from a request | `fetch` stored as a field and called as a method | Call `fetch(...)` directly or bind it |
| The game's own fullscreen button does nothing in OpenGame | The frame has no fullscreen permission | Remove it; the page has Fullscreen |
| Tab leaves the game; a held-key screen stays up | Tab's default moved focus to the page | Prevent Tab on the game; release keys on blur |
| The page scrolls when the player scrolls a list or presses an arrow | The game consumed the input without cancelling it | `preventDefault` on inputs the game handles |
| A black frame or a stall in a threaded build | The frame is not cross-origin isolated | Load the runtime from the game's own files and check `crossOriginIsolated` in the preview; `requires.threads` turns the black frame into a sentence |
| `invalid_meta` on a score with a level | `level` sent as a number | Send `level` as a string in score metadata |
| `board_unavailable` | The board is not declared in `opengame.json` | Declare it, then deploy again |
| A board works locally and is empty on OpenGame | Local boards are this browser's `localStorage` | Check a published game, signed in |
| A signed-in player is asked to type a name, or is called "Player" | The field is filled from the game's default only | Fill it from `og.player.handle` in `onChange`, default when null |
| `Cannot read properties of null` from `og.player.id` on OpenGame only | Guests have no id there; the local guest does | Check the type before using it |
| Work gated on `onPause(false)` stalls under the poster | The page rests the game from its first handshake until Play | Pause the simulation, never loading or the OG build |

## Verify before you call it integrated

Run each check and say which ones you could not run; an unrun check is unverified.

- Locally, as a guest and with `?og-dev-player=signed-in`: the name and the OG are
  right on the first menu, and `og.player.requestSignIn()` mid-game updates both. Signed
  in, every name field and name label reads `dev`; as a guest, the game's own default.
- On the published game, signed out: nothing assumes `og.player.id` is a string.
- `og.ready()` fires once, on the first frame the player can act in.
- Pause stops simulation, timers and audio; resume does not replay a backlog. Nothing
  plays while muted under the poster.
- In the private preview, where there is no identity and achievements answer
  `unavailable_in_preview`: nothing waits on them, and nothing breaks.
- Inside the game frame: Tab, arrows and the wheel do not move the page; alt-tab with
  a key held, come back, and nothing is stuck; the page's Fullscreen works and the game
  draws at the new size.
- A threaded build, in the preview's game frame, in each browser the creator supports:
  the console check in [references/engines.md](references/engines.md) reads `true`.
- Every board and achievement used in code is declared in `opengame.json`, and
  `opengame check . --json` passes.
- On the published game, signed in as a confirmed member (the only accounts given a
  player during the private rollout) with sharing on, then with it off: the handle
  shows only in the first case.
