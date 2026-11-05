# The frame around the game

A game on OpenGame runs in a sandboxed, cross-origin frame on its own `opengame.gg`
address, inside a page that owns the poster, the Play button, mute, fullscreen and the
account. The frame may run scripts, keep its own storage and lock the pointer. It may
not open popups, navigate the page, submit forms or take fullscreen. Everything below
follows from that.

## Before Play

The page boots the game under its poster before the player presses Play, so a large
game can load while they read the page. Keep loading, build the player's OG, and play
no sound: from the first handshake with the page (as the injected global loads, or at
`og.init()`) until Play, the page reports muted and `og.onPause` reports paused. Pause
the simulation, never loading or the OG build, or they wait for a press that has not
happened.
Focus that lands on the frame before Play is handed back to the page, so the game
cannot assume it has the keyboard yet. Pressing Play gives the frame focus.

## Pause and mute

```js
og.onPause(paused => game.setPaused(paused))       // tab hidden, page overlay open
og.audio.onHostMute(muted => audio.setMuted(muted)) // the page's mute button
```

Listeners receive the current state at once and return an unsubscribe function. A
pause stops the simulation, its timers and its audio, and resuming does not replay the
time it missed. A game that already pauses when pointer lock ends can call
`document.exitPointerLock()` in its `onPause(true)` handler, so both ways of pausing
reach the same menu.

## Fullscreen

```js
fullscreenButton.onclick = () => og.fullscreen.request()  // from a player's click
og.fullscreen.onChange(active => layout(active))
```

The page's Fullscreen button takes the stage, the game included, and the game only
sees its frame resize; `og.fullscreen.active` is true while it is fullscreen. A game's own fullscreen control is a second button for the same
thing, so take it out when running inside OpenGame, as OG Clash, Super Mario Zombies,
Mario Colosseum and World at War did. If the game keeps one, it calls
`og.fullscreen.request()`; `requestFullscreen` inside the frame fails. Safari and
Firefox spend Escape on leaving fullscreen, so the pause menu needs a second way in.

## Keys and the wheel

- **Tab.** Its default moves focus to the next control, which inside OpenGame is one
  of the page's buttons. If the game uses Tab, prevent its default unless the event
  target is one of the game's own inputs, buttons or links. Do not count `tabindex` as a
  control: Emscripten's and Unity's templates put it on the canvas itself.
- **Held keys.** When the frame loses focus, the keyup for a held key goes to the page
  and the game never hears it. On `blur`, and on `visibilitychange` to hidden, release
  every key still down: through the engine's own "release all input" call if it has
  one, or with a synthetic keyup where the engine listens.
- **Scrolling.** The browser hands a wheel turn, an arrow, Space, Page Up or Down, Home
  or End that the game did not cancel to the next box that can scroll, which is the
  page. Cancel the default of each one the game consumes, on the element that reads it.
  OpenGame is adding a guard for this at the game host; do not rely on it.
- **Text fields.** Keep normal key behaviour in the game's own inputs, so a name field
  takes Space, arrows and Tab.

OG Clash, 28 Oct 2026: its scoreboard is held on Tab. Tab moved focus to the page, the
pointer lock went with it, the engine paused onto its menu, and Tab's keyup went to
the page, so the scoreboard stayed up over the pause menu. A guard adapted from its fix:

```js
const held = new Map()
const control = t => t instanceof Element && !!t.closest('input, select, textarea, button, a[href]')
addEventListener('keydown', e => {
  if (e.isTrusted) held.set(e.code, e)
  if (e.key === 'Tab' && !control(e.target)) e.preventDefault()
}, true)
addEventListener('keyup', e => { if (e.isTrusted) held.delete(e.code) }, true)
const release = () => {
  for (const down of held.values()) {
    const target = down.target instanceof Node && down.target.isConnected ? down.target : document
    // bubbles, so listeners on the canvas, the document and the window all hear it
    target.dispatchEvent(new KeyboardEvent('keyup', { code: down.code, key: down.key, keyCode: down.keyCode, which: down.which, bubbles: true }))
  }
  held.clear()
}
addEventListener('blur', release)
document.addEventListener('visibilitychange', () => { if (document.hidden) release() })
```

This keeps Tab, Shift+Tab included, inside the game, so give a keyboard-only player
another way back to the page: let Tab through while the pause menu is open. Check it
against the engine: press Tab, alt-tab with a key held, come back, and nothing is
stuck.

## Leaving the game

A link out goes through the page, which shows the address and lets the player choose:

```js
creditsButton.addEventListener('click', async () => {
  if (!og.capabilities.includes('external-links')) return
  const opened = await og.openLink('https://example.com/credits')
  if (!opened.ok && opened.error !== 'cancelled') showMessage(opened.reason ?? opened.error)
})
```

Call it directly from the click or key handler, or it answers `gesture_required`. A
host on OpenGame's list of refused services answers `invalid_request`, as a malformed
address does. `window.open` and links with a target do nothing in the frame.
