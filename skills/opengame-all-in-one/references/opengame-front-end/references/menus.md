# Menus in practice

## Interface sound

- Quiet, recorded, matched to the game's world, on hover, focus and click, with keyboard
  focus sounding like hover. AAA bar values: hover at 0.34, click at 0.26 of the
  interface bus.
- Debounce rapid navigation; never stack a hover and a focus cue for one action.
- On a fresh profile the menu mix starts at 30% and never exceeds it, including when
  restoring saved settings; a saved lower level, including zero, is preserved (ST).
- Mute applies to every interface cue and every menu film without changing the saved
  level. Unlock audio from the player's gesture, and handle a refused play without
  blocking the controls.
- A menu film's own soundtrack is the menu ambience. Never layer a second music bed under
  it, and stop conflicting beds when moving between menu and play.
- Listen to the menu with nothing happening. OS's owner heard "footsteps" in a menu 4
  times over 3 days; the third cause was an ambience bed generated from a prompt that said
  "gravel crunching far away".

## Controls and the controls legend

- One action table drives input handling, HUD hints, menu help, the remapping screen and
  playtests, so a legend can never disagree with the keys.
- Desktop shooter defaults (ST): WASD to move, mouse to look, left click to fire, right
  click to hold aim and E to toggle it, Space to jump, Shift to sprint, C to crouch, F to
  interact, R to reload, Q to cycle weapons, number keys for weapon slots, Escape to pause.
  Use the bindings for mechanics the game has; genre conventions and the creator's choices
  win. LC keeps E as a second aim key for laptop players without a mouse.
- Never bind a held action to Ctrl: Ctrl+W closes the tab (OS crouch).
- Holding aim still allows firing. Track mouse buttons with per-button events or the
  buttons bitmask; `pointerdown` alone misses a second button pressed while one is held.
- Clear held keys and aim on pause, blur, death and restart. Ignore key repeat and text
  fields.
- A word in a quick note is not a spec: OS's owner wrote "Hold F" and meant press. Ask, or
  build the press and say so.
- Every control is remappable (see `opengame-accessibility`), and a rebind that takes a
  held key swaps the two actions.

## Pause

A solo game's pause stops simulation, enemies, scoring and timers together. Resume
explicitly with a fresh time baseline. A pointer-lock refusal lands on a usable menu.

A game presented as online, with bots standing in for players, never pauses: the menu is
an overlay that captures input while the match, its timers, killcams and spawns go on and
world audio carries on ducked. OS's owner asked for this six times.

Safari and Firefox spend Escape on leaving fullscreen, and a host page or a fullscreen
browser can take Escape too, so pause has a second key (OH uses P beside Esc).

## Pointer lock and fullscreen

- Request the lock inside the handler of the press that starts play, then fullscreen only
  after `pointerlockchange`; fullscreen first spends the user activation and the lock is
  refused (OS). Inside OpenGame's frame `requestFullscreen` fails: the page owns
  fullscreen, and a game's own button calls `og.fullscreen.request()` (`opengame-sdk`).
- One owner holds the lock state and confirms a held lock instead of asking again; a
  second request dropped a held lock in 1 of 7 OS tours.
- Browsers refuse a lock requested from an Escape keydown.
- Headless browsers refuse pointer lock until one real click, and headless Chromium sends
  a spurious mouse move of about (-960, -540) right after a lock lands (OS). Stage test
  cameras with the game's own switches rather than mouse moves.
- Scripted calls into the page are granted user activation, so they never reach the
  refusal paths; test those with a real click (LC).

## Reflow

Menus reflow at narrow widths and at 200% zoom without clipped actions or horizontal
scrolling, and touch targets are comfortably sized. Responsive menus do not make a game
playable by touch; say so if it is not (see `opengame-mobile`).

## Characters in menus

No character is cut by a frame edge, even while it moves; fade it out before any image
edge (OS: "no cut outs ... even fi they move"). A character card is ready only when this
subject is drawn on this visit, not when an earlier one was.

## Credits

When a shipped file's licence asks for attribution, the menu has a Credits or About
screen that shows it.
