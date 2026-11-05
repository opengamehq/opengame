---
name: opengame-accessibility
description: Make a browser game playable by more people. Covers a controller that reaches every screen, remapping, sensitivity and field of view, subtitles and visual sound cues, colour never the only signal, limited flashes, reduced motion, keyboard menus and options proven in play. Use when the person asks about accessibility, gamepad support, colourblind modes, subtitles, remapping keys, motion sickness, photosensitivity, or menus that work with a keyboard or screen reader.
metadata:
  version: "1.0.0"
---

# Accessibility

Most of this costs little when it is designed in and a lot when it is retrofitted. Our
first four games had no subtitles or visual sound cues, so this skill also teaches from
published guidance: WCAG 2.3.1 for flashes, the Game Accessibility Guidelines and the
Xbox Accessibility Guidelines for controls, audio and vision. OC shipped an accessibility
tab, subtitles and controller support, and its launch audit found every one of those
options "unverified at runtime"; the last rule is for that.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes. Where
none of our games set a value, the reference configuration says so.

## Rules

### A controller reaches everything
- **Invariant:** With a gamepad connected, every screen, menu, setting and dialog can be reached and used with the pad alone, focus is always visible, and a connected pad never breaks the game.
- **Technique:** Read pads through the standard mapping each frame. Drive menus by focus with four-way navigation that also works inside sliders, dropdowns and checkboxes. Show prompts for the device used last (keyboard, pad or touch). Offer sensitivity, layouts and deadzone calibration in settings. Test with a pad connected before boot and with one connected mid-game.
- **Reference configuration:** OC's owner on controller support: "RSI that a few times because we always mess this up". His list: works everywhere, visible focus, four-way navigation on sliders, dropdowns and checkboxes, Default and Tactical layouts, sensitivity 1-10, deadzone calibration, calibration for Bluetooth lag, and consistent styling. It landed at R87-R89. In another game a connected pad crashed every frame.
- **Applies when:** Every game that runs on desktop, and every game whose genre players expect a pad.
- **Verify:** After boot, put the mouse and keyboard away. With the pad alone, go from the title to a match, change three settings, pause, quit and confirm. Then reload with the pad already connected and do it again.

### Every control can be remapped
- **Invariant:** Every gameplay action can be bound to a different key or button, conflicts are shown, and the bindings persist and are the ones the game reads.
- **Technique:** One action table drives input, HUD hints, menu help and the remapping screen, so a remap updates every prompt. Offer hold or toggle for held actions (aim, crouch, sprint), and make every action reachable without a mouse.
- **Reference configuration:** Not set by our first four games. ST keeps one action table for input handling, HUD hints, menu help and playtests, and its control defaults (WASD, mouse, F to interact, R to reload) are a starting table. OC offers hold or toggle for aim and crouch. At one OC commit rebinding was cosmetic: the docs said the player code read the saved bindings, and a reviewer found it did not.
- **Applies when:** Every game with more than a couple of inputs.
- **Verify:** Rebind every action to a different key, restart the game, and complete the first objective with only the new keys.

### Sensitivity and field of view are the player's
- **Invariant:** Look sensitivity, axis inversion and field of view can be changed in settings, apply live, and persist.
- **Technique:** Settings write straight through to the running game; field of view has a range wide enough for players who get motion sick at a narrow one. Camera shake, head bob and motion blur each have their own off switch.
- **Reference configuration:** DK's world lens is 110 degrees with the weapon drawn at a fixed 75 in its own pass, so changing the world field of view never resizes the weapon. OC: field of view 80-120, a shake toggle, motion blur on by default with the gun kept sharp, touch aim assist 0-100.
- **Applies when:** First-person and third-person 3D games.
- **Verify:** Change each setting during play and see it take effect without a restart; reload and see it kept.

### Important sounds are also seen
- **Invariant:** Anything a player must hear to play well (speech, a threat behind them, an objective cue) also appears on screen.
- **Technique:** Subtitles for every line of speech, with speaker names, readable size and a background; directional visual indicators for important off-screen sounds; captions for important non-speech sounds. Drive them from the same cue registry as the audio so none is missed. A subtitle lasts as long as its clip and closes when the line is cut off.
- **Reference configuration:** None of DK, MC, AW or SR has subtitles or visual sound cues. OC subtitles every line, "not super big... but still visible" in the owner's words: at least 10 pt on a phone 375 pt tall, in a band 6% from the bottom no wider than 42% of the screen, drawn above menus. Outside guidance: subtitles on by default or offered at first launch, large enough to read at a living-room distance, never covering the centre of the screen.
- **Applies when:** Every game with speech or with sound that carries gameplay information.
- **Verify:** Play the first ten minutes muted; every voice line and every threat the player needed to react to was shown.

### Colour is never the only signal
- **Invariant:** Every state shown with colour (team, rarity, selection, damage type, danger) is also shown by shape, icon, text or position, and a colour keeps one meaning across the whole game.
- **Technique:** Pair each colour with a second channel and check the palette under colour-vision simulations; keep text and important icons above contrast minimums against what is behind them. Write down what each gameplay colour means and check every glow, marker and bar against it.
- **Reference configuration:** SR's design rule: a state has a shape, so its yellow selection always comes with an underline, size, rank position or focus outline. Contrast floors from WCAG: 4.5:1 for body text, 3:1 for large text. OC: orange means immune and cyan or violet means shoot here; a baked glow once said "shoot here" while the health bar said immune. OC ships a colour-blind palette.
- **Applies when:** Every game.
- **Verify:** Capture the HUD and menus through protanopia, deuteranopia and tritanopia simulations and in greyscale; every state is still distinguishable.

### Flashes are limited at the source
- **Invariant:** No effect makes the screen's brightness change quickly enough or often enough, rising or falling, to count as a photosensitive flash.
- **Technique:** Bound the frame-to-frame change of composited luminance for full-screen effects in both directions, discovered by measuring every large overlay rather than reading a list, and bound how many large flashes can happen in a second. Offer a setting that reduces every flash further. Prefer fades to cuts for whole-screen changes, and ease any light that flickers at random.
- **Reference configuration:** AW limits each overlay's frame-to-frame luminance step to 0.045, under half of WCAG 2.3.1's 0.10 flash pair, after two players reported flashing violent enough to fear a seizure; its budgets allow zero steps over that limit. OC: at most 3 full-frame flashes a second and no 10-11 Hz strobe; Reduce Flashing scales every flash to 20% and removes the boss's 12 Hz wind-up blink; the storm light flickered at random near 11 Hz and needed easing. OC's new lightning cut the flat-white share of a first-person frame from 10.47% to 0.58%.
- **Applies when:** Every game with flashes, explosions, damage effects or lightning.
- **Verify:** Record the worst flash in the game (an explosion at point blank, a lightning strike) and compute per-frame mean luminance; no step exceeds the limit and no second holds more large flashes than the limit. Repeat with Reduce Flashing on.

### Reduced motion is honoured
- **Invariant:** When the player asks for less motion (in the game or through the operating system's preference), decorative motion stops and every piece of information it carried is still shown.
- **Technique:** Read `prefers-reduced-motion` and a game setting; replace menu films with their posters, remove parallax, shake and bob, and swap animated transitions for fades, while keeping a stable cue for every state change.
- **Reference configuration:** AW gates its menu films on reduced motion; ST shows the static poster with no autoplay and keeps a stable information cue in place of motion. In OC, reduced motion keeps the directional hit cues and drops the camera kick.
- **Applies when:** Every game with decorative motion.
- **Verify:** Turn on reduced motion in the operating system, reload, and walk the menus and the first minute of play: no film plays, nothing shakes, and nothing that mattered disappeared.

### Menus work from the keyboard, and read correctly
- **Invariant:** Every menu and dialog works with the keyboard alone, focus is always visible and lands somewhere sensible, and controls have real names.
- **Technique:** Real buttons and form controls, a visible focus style, Tab order that follows the layout, Escape for back, focus moved into a dialog on open and restored on close, and background controls made unreachable while a dialog is open.
- **Reference configuration:** ST's front-end rules: Enter and Space activate the focused action, modal settings and pause contain focus, menus reflow at 200% zoom without clipped actions.
- **Applies when:** Every game.
- **Verify:** Unplug the mouse and walk title, settings, pause, results and retry; then run an automated accessibility scan of each menu.

### Difficulty and timing can be adjusted
- **Invariant:** A player who cannot react as fast or press as accurately as the default assumes can still progress.
- **Technique:** Offer options that change timing windows, game speed, aim assistance or damage taken, with labels that say what each one changes, without locking content behind the default.
- **Reference configuration:** Not set by our games. Outside guidance recommends offering a range of difficulty and the ability to slow the game.
- **Applies when:** Games with timing-heavy challenges.
- **Verify:** Complete the first objective at the most assisted setting with slow, imprecise input.

### Every option is proven in play, on and off
- **Invariant:** Each accessibility and comfort option changes what it says it changes in a real run, both ways, and survives a reload.
- **Technique:** For each option, record the same moment of play with it on and off and compare: a lightning strike with Reduce Flashing, a voice line with subtitles, a hit with shake off, a remapped key in a match. Save, reload and check the value, including off and zero. New movement or control features ship as saved toggles with a sensible default. Persistence rules are in `opengame-front-end`.
- **Reference configuration:** At OC's launch audit, volume, sensitivity, field of view, rebinding, the colour-blind palette, Reduce Flashing and subtitle size all existed and were all "unverified at runtime"; Reduce Flashing had never been checked by eye. OC's chained jumps ship on by default, and off persists.
- **Applies when:** Every game with an accessibility or settings menu.
- **Verify:** A table with one row per option: an on clip, an off clip and a reload check, each linked.
