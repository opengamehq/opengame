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

## Controls and the controls legend

- One action table drives input handling, HUD hints, menu help and playtests, so a legend
  can never disagree with the keys.
- Desktop shooter defaults (ST): WASD to move, mouse to look, left click to fire, right
  click to hold aim and E to toggle it, Space to jump, Shift to sprint, C to crouch, F to
  interact, R to reload, Q to cycle weapons, number keys for weapon slots, Escape to pause.
  Use the bindings for mechanics the game has; genre conventions and the creator's choices
  win.
- Holding aim still allows firing. Track mouse buttons with per-button events or the
  buttons bitmask; `pointerdown` alone misses a second button pressed while one is held.
- Clear held keys and aim on pause, blur, death and restart. Ignore key repeat and text
  fields.
- Every control is remappable (see `opengame-accessibility`).

## Pause

Solo pause stops simulation, enemies, scoring and timers together. Resume explicitly
with a fresh time baseline. A pointer-lock refusal lands on a usable menu. Safari and
Firefox spend Escape on leaving fullscreen, so pause cannot depend on Escape alone.

## Reflow

Menus reflow at narrow widths and at 200% zoom without clipped actions or horizontal
scrolling, and touch targets are comfortably sized. Responsive menus do not make a game
playable by touch; say so if it is not.

## Credits

When a shipped file's licence asks for attribution, the menu has a Credits or About
screen that shows it.
