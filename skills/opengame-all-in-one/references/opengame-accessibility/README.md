> Carried from `opengame-accessibility` 1.1.0. Read it when: Make a browser game playable by more people. Covers telling a visitor who cannot play why, a controller that reaches every screen, remapping that swaps, sensitivity and field of view, subtitles and visual sound cues, a zero-HUD view, colour never the only signal, limited flashes, reduced motion and a calm look, and keyboard menus with a second pause key. Use when the person asks about accessibility, gamepads, colourblind modes, subtitles, remapping, motion sickness, flashing or a blank page.


# Accessibility

Most of this costs little when it is designed in and a lot when it is retrofitted. Our
first four games had no subtitles or visual sound cues, so this skill also teaches from
published guidance: WCAG 2.3.1 for flashes, the Game Accessibility Guidelines and the
Xbox Accessibility Guidelines for controls, audio and vision. OC shipped an accessibility
tab, subtitles and controller support, and its launch audit found every one of those
options "unverified at runtime"; the last rule is for that. LC built full controller
support that no person ever played with a real pad, and OH's launch QA found phones and
browsers that met a dead prompt or a blank page.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes. Where
none of our games set a value, the reference configuration says so.

## Rules

### A controller reaches everything
- **Invariant:** With a gamepad connected, every screen, menu, setting and dialog can be reached and used with the pad alone, focus is always visible, prompts show the pad in hand, and a connected or unplugged pad never breaks the game.
- **Technique:** Read pads through the standard mapping each frame. Drive menus by focus with four-way navigation that also works inside sliders, dropdowns and checkboxes. Show prompts for the device used last (keyboard, pad or touch), decided by recent motion past the dead zone so a resting stick never takes over from the mouse, and tell makers apart by vendor and product id (see `opengame-front-end`). Offer sensitivity on a scale with a measured turn rate, a radial dead zone that rescales what is left, response curves, layouts stored as bindings, and calibration for Bluetooth lag. Swap accept and back on the maker that expects it. Unplugging pauses. Test with a pad connected before boot and with one connected mid-game.
- **Reference configuration:** OC's owner on controller support: "RSI that a few times because we always mess this up". The list: works everywhere, visible focus, four-way navigation on sliders, dropdowns and checkboxes, Default and Tactical layouts, sensitivity 1-10, deadzone calibration, calibration for Bluetooth lag, and consistent styling. It landed at R87-R89. In another game a connected pad crashed every frame. LC's owner asked for "world class controller support ... default/tactical support and menu navigation ... showing the right shortcuts based on whether its a ps5 or xbox controller ... default controller sensitivity 4/10". LC's sensitivity 4 turns 150°/s (filmed at 152.8-160), with a radial dead zone 0.10-0.99, a trigger point of 0.15, a 2.2 power curve among three curves, a 60% edge boost, and four layouts (Default, Tactical, Bumper Jumper, Left-handed). No browser exposes adaptive triggers. LC's pads were only ever scripted; nobody held one.
- **Applies when:** Every game that runs on desktop, and every game whose genre players expect a pad.
- **Verify:** After boot, put the mouse and keyboard away. With the pad alone, go from the title to a match, change three settings, pause, quit and confirm. Then reload with the pad already connected and do it again. Unplug it mid-match: the game pauses. Do this with a real pad of each maker you claim, not only a scripted one.

### A visitor who cannot play is told why, at once
- **Invariant:** No visitor meets a blank page or a prompt they cannot answer: a browser without the graphics API the game needs and a touch-only device for a game without touch controls each get a notice, in the game's own look, that names the reason and what to do.
- **Technique:** Probe for the API before the large download (`getContext('webgl2')`, or WebGPU as `opengame-mobile` describes) and wrap renderer construction in a try, so a failure lands on the notice rather than an empty page. Treat a device as touch-only when `matchMedia('(pointer: coarse)')` matches and `(any-pointer: fine)` does not, and never show "press any key" there. Offer what the visitor can do: open the link on a computer, update the browser, or turn on hardware acceleration.
- **Reference configuration:** OH's launch QA found that a phone sat for ever at PRESS ANY KEY and that a browser without WebGL 2 showed a blank page; both now show a notice drawn in the game's paper look. OS's "no mobile/touch" was a locked owner decision and LC is desktop-only by design, so for games like these the notice is the whole phone experience. OC's capability card is in `opengame-mobile`.
- **Applies when:** Every game that needs WebGL 2 or WebGPU, and every game without touch controls.
- **Verify:** Launch with WebGL 2 unavailable (an init script that makes `getContext('webgl2')` return null): the notice appears and nothing large downloads. Open the game in a touch-only context with a coarse pointer and no fine one, then on a real phone: the notice, never a dead prompt.

### Every control can be remapped, and a rebind swaps
- **Invariant:** Every gameplay action can be bound to a different key or button, a key taken from another action swaps the two rather than leaving one action unbound or two on one key, the bindings persist, and they are the ones the game reads.
- **Technique:** One action table drives input, HUD hints, menu help and the remapping screen, so a remap updates every prompt. Offer hold or toggle for held actions (aim, crouch, sprint), and make every action reachable without a mouse. Read the bindings from the same store the settings screen writes (see `opengame-front-end` for one schema). A default binding moves only with the owner's decision, a changelog line and a save migration.
- **Reference configuration:** ST keeps one action table for input handling, HUD hints, menu help and playtests, and its control defaults (WASD, mouse, F to interact, R to reload) are a starting table. OC offers hold or toggle for aim and crouch. At one OC commit rebinding was cosmetic: the docs said the player code read the saved bindings, and a reviewer found it did not. OH's rebind gives the old key to the action that held the new one, after QA found two lanes sharing a key. OS's owner, after an agent moved E without asking: "also remember u need ot be able to eds with E as well! why did we remove that?" LC moved its light from F to T while giving F to interactions, without saying so, and the owner asked: "u should be able to turn off flashlight idk why that went away".
- **Applies when:** Every game with more than a couple of inputs.
- **Verify:** Rebind every action to a different key, restart the game, and complete the first objective with only the new keys. Bind one action to another's key: both still work, on swapped keys.

### Sensitivity and field of view are the player's
- **Invariant:** Look sensitivity, axis inversion and field of view can be changed in settings, apply live, persist, and mean the same turn at any frame rate.
- **Technique:** Settings write straight through to the running game; field of view has a range wide enough for players who get motion sick at a narrow one. Show mouse sensitivity in physical units (centimetres per full turn at a stated mouse resolution) with a live tester. Camera shake, head bob and motion blur each have their own off switch. Why a camera ease reads as low sensitivity is in `opengame-game-feel`.
- **Reference configuration:** DK's world lens is 110 degrees with the weapon drawn at a fixed 75 in its own pass, so changing the world field of view never resizes the weapon. OC: field of view 80-120, a shake toggle, motion blur on by default with the gun kept sharp, touch aim assist 0-100. LC: 0.0022 rad a count, 9.1 cm per 360 at 800 cpi at 1.00x, with invert Y; 1,428 counts turn exactly 180 degrees at 60, 30, 15 and 8 fps.
- **Applies when:** First-person and third-person 3D games.
- **Verify:** Change each setting during play and see it take effect without a restart; reload and see it kept. Turn by a fixed count of real input at two frame rates: the angle is the same.

### Important sounds are also seen
- **Invariant:** Anything a player must hear to play well (speech, a threat behind them, an objective cue) also appears on screen.
- **Technique:** Subtitles for every line of speech, with speaker names, readable size and a background; directional visual indicators for important off-screen sounds; captions for important non-speech sounds. Drive them from the same cue registry as the audio so none is missed. A subtitle lasts as long as its clip and closes when the line is cut off.
- **Reference configuration:** None of DK, MC, AW or SR has subtitles or visual sound cues. OC subtitles every line, "not super big... but still visible" in the owner's words: at least 10 pt on a phone 375 pt tall, in a band 6% from the bottom no wider than 42% of the screen, drawn above menus. LC offers subtitles with a size setting and shows a blow's direction as the heaviest screen edge for 0.8 s. Outside guidance: subtitles on by default or offered at first launch, large enough to read at a living-room distance, never covering the centre of the screen.
- **Applies when:** Every game with speech or with sound that carries gameplay information.
- **Verify:** Play the first ten minutes muted; every voice line and every threat the player needed to react to was shown.

### Zero HUD is zero, named in the player's words
- **Invariant:** A "no HUD" setting draws nothing on the picture, not subtitles and not toasts, is easy to find and can be toggled in play, and what remains on screen is only what belongs to the camera.
- **Technique:** Name the setting the way the owner or players ask for it, put it first on the tab Settings opens to, and give it a key. When it is off, never write subtitles, never raise toasts, and pause tutorials without counting them as taught. Keep separate toggles for single aids such as a way-finding arrow. Check it by counting rendered HUD elements, not by eye.
- **Reference configuration:** LC's owner asked for "a 0 hud view (where there is no hud at all no even commentator subtitles)" and a way to turn off the arrow, then: "wheres ability to turn off hud btw in settings?" It existed and could not be found, so it was renamed in the owner's words, made the first row and given the H key. Off, it draws 0 elements in 16 states (27-31 with the HUD) and 0 in 65 readings through a death; the hurt rim stays, because it belongs to the camera.
- **Applies when:** Every game with a HUD, and every game a trailer will be cut from.
- **Verify:** With the setting off, count rendered HUD elements in every state, including a death, a subtitle line and a toast: zero. Toggle it with its key mid-fight.

### Colour is never the only signal
- **Invariant:** Every state shown with colour (team, rarity, selection, damage type, danger) is also shown by shape, icon, text or position, and a colour keeps one meaning across the whole game.
- **Technique:** Pair each colour with a second channel and check the palette under colour-vision simulations; keep text and important icons above contrast minimums against what is behind them. Write down what each gameplay colour means and check every glow, marker and bar against it.
- **Reference configuration:** SR's design rule: a state has a shape, so its yellow selection always comes with an underline, size, rank position or focus outline. Contrast floors from WCAG: 4.5:1 for body text, 3:1 for large text. OC: orange means immune and cyan or violet means shoot here; a baked glow once said "shoot here" while the health bar said immune. OC ships a colour-blind palette. LC tells its perk icons apart by shape.
- **Applies when:** Every game.
- **Verify:** Capture the HUD and menus through protanopia, deuteranopia and tritanopia simulations and in greyscale; every state is still distinguishable.

### Flashes are limited at the source
- **Invariant:** No effect makes the screen's brightness change quickly enough or often enough, rising or falling, to count as a photosensitive flash.
- **Technique:** Bound the frame-to-frame change of composited luminance for full-screen effects in both directions, discovered by measuring every large overlay rather than reading a list, and bound how many large flashes can happen in a second. Offer a setting that reduces every flash further. Prefer fades to cuts for whole-screen changes, and ease any light that flickers at random.
- **Reference configuration:** AW limits each overlay's frame-to-frame luminance step to 0.045, under half of WCAG 2.3.1's 0.10 flash pair, after two players reported flashing violent enough to fear a seizure; its budgets allow zero steps over that limit. OC: at most 3 full-frame flashes a second and no 10-11 Hz strobe; Reduce Flashing scales every flash to 20% and removes the boss's 12 Hz wind-up blink; the storm light flickered at random near 11 Hz and needed easing. OC's new lightning cut the flat-white share of a first-person frame from 10.47% to 0.58%. LC offers Reduce Flashing and also reads `prefers-reduced-motion`.
- **Applies when:** Every game with flashes, explosions, damage effects or lightning.
- **Verify:** Record the worst flash in the game (an explosion at point blank, a lightning strike) and compute per-frame mean luminance; no step exceeds the limit and no second holds more large flashes than the limit. Repeat with Reduce Flashing on.

### Reduced motion and a calm look are honoured
- **Invariant:** When the player asks for less motion, through the operating system or the game's own calm setting, decorative motion is removed rather than frozen, and every piece of information it carried is still shown.
- **Technique:** Read `prefers-reduced-motion` and a game setting, and offer the calm setting even when the system preference is off. Replace menu films with their stills, remove parallax, shake, bob and drifting backgrounds, swap animated transitions for fades, remove moving layers of menu effects rather than freezing them mid-frame, and still the world's flashes, while keeping a stable cue for every state change.
- **Reference configuration:** AW gates its menu films on reduced motion; ST shows the static poster with no autoplay and keeps a stable information cue in place of motion. In OC, reduced motion keeps the directional hit cues and drops the camera kick. OH's Calm look stills the stage's drift and its flashes while the board and its cues stay. LC's reduced motion removes its tape layers instead of freezing them.
- **Applies when:** Every game with decorative motion.
- **Verify:** Turn on reduced motion in the operating system, reload, and walk the menus and the first minute of play: no film plays, nothing shakes or drifts, and nothing that mattered disappeared. Repeat with only the game's calm setting on.

### Menus work from the keyboard, read correctly, and pause has a second key
- **Invariant:** Every menu and dialog works with the keyboard alone, focus is always visible and lands somewhere sensible, controls have real names, and pause still works when the browser or a host page takes Escape.
- **Technique:** Real buttons and form controls, a visible focus style, Tab order that follows the layout, Escape for back, focus moved into a dialog on open and restored on close, and background controls made unreachable while a dialog is open. Give pause a second key beside Escape, because a browser leaving fullscreen or a host page in fullscreen spends Escape before the game sees it.
- **Reference configuration:** ST's front-end rules: Enter and Space activate the focused action, modal settings and pause contain focus, menus reflow at 200% zoom without clipped actions. OH pauses on P as well as Escape, because a host in fullscreen takes Escape. LC makes destructive actions holds, or a click that arms and a second that confirms.
- **Applies when:** Every game.
- **Verify:** Unplug the mouse and walk title, settings, pause, results and retry; then run an automated accessibility scan of each menu. In fullscreen, pause with the second key.

### Difficulty and timing can be adjusted
- **Invariant:** A player who cannot react as fast or press as accurately as the default assumes can still progress.
- **Technique:** Offer options that change timing windows, game speed, aim assistance or damage taken, with labels that say what each one changes, without locking content behind the default.
- **Reference configuration:** Outside guidance recommends offering a range of difficulty and the ability to slow the game. LC offers aim help off, standard and strong. A rhythm game's timing windows and latency calibration are in `opengame-rhythm`.
- **Applies when:** Games with timing-heavy challenges.
- **Verify:** Complete the first objective at the most assisted setting with slow, imprecise input.

### Every option is proven in play, on and off
- **Invariant:** Each accessibility and comfort option changes what it says it changes in a real run, both ways, and survives a reload.
- **Technique:** For each option, record the same moment of play with it on and off and compare: a lightning strike with Reduce Flashing, a voice line with subtitles, a hit with shake off, a remapped key in a match, a death with zero HUD. Save, reload and check the value, including off and zero. New movement or control features ship as saved toggles with a sensible default. Persistence rules are in `opengame-front-end`.
- **Reference configuration:** At OC's launch audit, volume, sensitivity, field of view, rebinding, the colour-blind palette, Reduce Flashing and subtitle size all existed and were all "unverified at runtime"; Reduce Flashing had never been checked by eye. OC's chained jumps ship on by default, and off persists. LC shipped Reduce Flashing, subtitles with size, invert Y, hold-to-confirm, an aiming dot off by default, a brightness card on the renderer's own curve, 2^((b - 0.5) x 1.6), aim help and shape-coded perk icons; its zero-HUD setting was proven by element count, and none of its pad options was tried by a person.
- **Applies when:** Every game with an accessibility or settings menu.
- **Verify:** A table with one row per option: an on clip, an off clip and a reload check, each linked.
