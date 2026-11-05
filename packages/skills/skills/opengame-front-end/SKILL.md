---
name: opengame-front-end
description: Build a browser game's title, menus, first run, loading, settings, results and HUD. Covers menus that are live scenes with sound, a short first run, saves that survive, an honest loading bar, clicks that always land, a HUD from one unit, an FPS counter, dialogs from the game's own kit and a share card from a real frame. Use when the person says the menu looks cheap, the loading bar freezes, clicks do nothing, settings reset, or asks for a title, menu, HUD or share image.
metadata:
  version: "1.0.1"
---

# The front end and the HUD

The first thing a stranger sees is the title and the menu, and a button on black
answers them before the game can. The front end is part of the game, in the same world,
type and light, and it must never be the thing that hangs.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes. OC's
owner asked for a console-grade menu 4 or more times and for an honest loading bar 3
times; those rules come first.

## Rules

### Every menu is a live scene with its own sound
- **Invariant:** Every menu and the loading screen show the game's world in motion with that scene's sound under it, answer focus with sound, and never look like a web page or show a pixelated first frame.
- **Technique:** A looping in-engine film per screen, or a rendered clip of real play, with its ambience routed through the menu mix. Hover, focus and click sounds come from one kit. Screens change by cut, push or mask instead of opacity crossfades. Hold the poster until the first frame is at full resolution. On phones the poster replaces the loading film. Test the film's codec in a real browser, because automated browsers often cannot decode it.
- **Reference configuration:** OC's owner: "It should not look like a browser menu screen ... background cinematics, the sound of the cinematics in the background, hover effects". OC's menu film is 5 shots on a 36 s loop (zombies climbing, the squad on patrol, lightning on the beat). The loading film was 22.6 s of 1080p30 H.264 at 10.2 MB, later 19 s at 8.7 MB, muted with a poster, and skipped on phones. Motion durations 120, 160, 220 and 280 ms. Playwright's Chromium could not decode H.264, so the loading film never played in OC's own captures.
- **Applies when:** Every game with menus.
- **Verify:** Load cold in a real browser at native resolution: the first frame is sharp, the film moves, its sound plays after the first press, and every focus change makes a sound.

### The title is a scene
- **Invariant:** The title screen shows the game's world, with the game's name as crisp live text and a clear way in.
- **Technique:** Key art or a looping clip of the world under live DOM type, a scrim only where text needs it, and a semantic Play control focused on load. Keep the promotional wordmark separate from the accessible title. Never bake controls or labels into footage.
- **Reference configuration:** AW fades its key art in over 620 ms with an 8 s scale from 1.045 to 1. Our originals' rule: no system display face (source a face that matches the world, or draw the title from the game's own bitmap font), no eyebrow above a heading, no gradient text, no emoji as icons.
- **Applies when:** Every game.
- **Verify:** Capture the title cold at laptop and 1080p sizes; inspect the computed font family; Tab reaches Play first and Enter starts the game.

### Poster first, then film
- **Invariant:** The menu is usable the moment it appears, a background film never blocks a control, and motion respects the player's preference.
- **Technique:** Show the still poster immediately; start the film muted so autoplay is allowed, unmute through the menu mix after a real gesture, crossfade its loop, pause it when the tab is hidden or the menu closes, and keep one shared background element across menus. Reduced motion shows the poster with no autoplay. A failed film falls back to the poster.
- **Reference configuration:** AW gates its menu films on reduced motion and plays their sound at 0.07. ST starts menu audio at a 30% menu mix and never above it. Our originals cap menu film audio at 30% of media gain.
- **Applies when:** Games with a menu film or animated background.
- **Verify:** Load with reduced motion on: no video plays. Block the video file: the menu still works. Hide the tab: the film pauses.

### A short first run from the title to play
- **Invariant:** A first-time player reaches play through a short fixed flow with one obvious way forward on each screen, is never stopped by a form, and cannot lose progress by accident.
- **Technique:** A few fixed screens from the title to play, each with one prominent forward button. Selecting an item previews it and only the button advances; Enter acts on release, so one press never skips a screen. A default name instead of a name prompt: on OpenGame, the signed-in player's handle, filled as `opengame-sdk` shows, and the game's own default name otherwise. Quit, Restart and Reset ask for a second press. A first-spawn hint with the goal and the controls for the device in use, shown once per profile and closing itself. Labels a player understands.
- **Reference configuration:** OC's flow is title, character, loadout and deploy. Its default name is "Player"; the first-spawn hint closes after 12 s, with keyboard and touch variants; "Early Access", not "Early build 0.1". The owner: "I'm trying to hit Enter to apply and it keeps moving stuff forward"; the character to loadout flow was fixed at R86.
- **Applies when:** Every game with menus before play.
- **Verify:** In a fresh profile, a stranger reaches play with one Enter or one click per screen. Press Quit once and see a confirm. Die and restart: the hint does not show again.

### Saves survive a reload, and the player is told when they cannot
- **Invariant:** Every setting and profile value the player changes survives a reload, an explicit choice is never changed without telling the player, and the player is told when the browser blocks storage.
- **Technique:** One settings store written on every change, zero and false included, and read once at boot. A version field with a migration when a default changes, treating old saves as explicit choices. Test storage at boot and show a notice when it throws or is missing. An automatic quality change steps at most once, never in menus, never below the floor the owner set, and says so on screen.
- **Reference configuration:** OC saved only 3 of 21 settings until R104-R107, and profile persistence failed at r79 and r83 before passing at r84. OC's quality rule: one step from Ultra to High after 8 s at a GPU median over 17.5 ms, with a banner, never below High and never in menus. The owner: "Let's make Ultra the base... fall back to High, but not below."
- **Applies when:** Every game with settings or a profile.
- **Verify:** Set every option to a non-default value, including off and zero, reload, and compare. Block site storage in the browser and load: the notice shows.

### The loading bar is honest and always moving
- **Invariant:** The loading bar follows real work, rises in small steps, never goes backwards, never holds still long enough to look frozen, and reads full only when the next screen responds.
- **Technique:** Weight progress by bytes, not file counts. Give each blocking stage (shader and pipeline compiles, environment maps, decoding) its own weight, and split it into pieces that each report. Show the bar only after a short delay, so a fast load shows none. The displayed value steps toward the real value one step at a time. Test on a throttled connection; a fast local boot hides every stall. In three.js, `LoadingManager.onProgress` counts items, which is the same trap; add byte weights and manual weights for `compileAsync` and PMREM. Load budgets are in `opengame-loading`.
- **Reference configuration:** OC's bar went to 60%, froze, then jumped to 100% ("can we have it be progressive by 1%"); later it stuck at 97% for 20 s and reloaded (R93), and real iPhones stalled at 97% for 1-3 min until R185. The fix climbs 1% at a time, never holds a number for more than about 0.75 s (0.68-0.73 s measured), has no stall over 300 ms in the timing strip, and appears only after 0.6 s. A shader warm-up curtain had added 2.5 s of blank screen. Test profiles: an 8 s load and a 25 Mbps connection.
- **Applies when:** Every game with a loading screen.
- **Verify:** Record the bar on a throttled connection and log each displayed value with its time: no backward step, no hold past the limit, and the title responds when the bar reads full.

### A boot veil with a deadline
- **Invariant:** The loading cover lifts when the game is ready, and lifts anyway at a deadline with the reason recorded, so it can never hang.
- **Technique:** Lift on named readiness conditions plus a short measured quiet (no long tasks), bounded by a hard deadline that logs what was still outstanding. Show real progress for required assets, never an invented percentage.
- **Reference configuration:** AW's boot veil waits for its readiness steps plus 500 ms of measured quiet, and lifts at a 9 s deadline regardless, logging what it was waiting on. The OpenGame landing page once shipped a gate that waited for ever on a GPU that never answered.
- **Applies when:** Every game with loading.
- **Verify:** Throttle the network and block one required asset: the veil lifts at the deadline and the screen offers a retry.

### Loading that cannot hang, failures you can act on
- **Invariant:** Every wait has a deadline and a fallback, and a failure says what happened and offers a way forward.
- **Technique:** Every fetch, decode and scene preparation has a timeout. Fence stale async loads so a rapid menu change cannot land an old scene. Play starts when the scene and controls are ready, not when a decorative clip ends.
- **Reference configuration:** ST's rule: loading is complete only when the next advertised action responds.
- **Applies when:** Every game.
- **Verify:** Kill the network mid-load and press every button on the screen that appears.

### Every click lands, wherever the button is released
- **Invariant:** Every press and release reaches the game, whether the pointer is released over the canvas, over a page overlay or outside the window, so no button stays held and no menu click is lost.
- **Technique:** Listen for release on the window, not the canvas, or capture the pointer on press with `setPointerCapture`. Clear held buttons on `pointercancel`, `touchcancel`, blur and visibility change, and set `touch-action: none` on the game surface. Prove it with clicks the running game receives, not with a stand-in page.
- **Reference configuration:** OC's owner: "sometimes on the menu screens / pause I can hover over buttons but clicking them does nothing, randomly". The web runtime heard mouseup only on the canvas, so a press released over a page overlay left the button held, and the menu's wait-for-release guard then ignored every later click: 60 of 60 clicks after an overlay release were missed. Forwarding the release took 12 lines and brought it to 0 of 60 (R167). That proof came from a stand-in test page with no in-game clicks, which is the gap to close.
- **Applies when:** Every browser game with DOM over the canvas or menus drawn in the canvas.
- **Verify:** In the running game, press on the canvas, drag onto an overlay or out of the window, release, then click a menu button. It responds on 20 of 20 tries.

### Say where, not what the folder is called
- **Invariant:** Every out-of-match surface names a place the way a player is sent there, and names it the same way everywhere.
- **Technique:** One table of places with their names and when they are, read by the menu, the loading screen and the results.
- **Reference configuration:** AW's menu module: a map id is a folder name, "BERLIN, APRIL 1945" is where a player is being sent. The module imports nothing, so the menu dresses itself before the engine loads.
- **Applies when:** Games with levels, maps or places.
- **Verify:** Grep the front end for internal ids reaching visible text.

### Pause, settings, results and retry belong to the game
- **Invariant:** Every screen outside play shares the game's visual language, settings apply live, and retry resets the game without reloading the page.
- **Technique:** One set of styles and one set of transition durations for every screen; settings write through to the running game; retry resets actors, input, score, camera, effects and audio. Modal screens contain focus, make the background `inert`, and restore focus on close.
- **Reference configuration:** DK's motion durations are 110, 190, 320, 520 and 780 ms on `cubic-bezier(.16, 1, .3, 1)`, buttons translating in 120 ms. ST walks title, Play, game over, retry, pause, settings, resume and menu on every checkpoint.
- **Applies when:** Every game.
- **Verify:** Walk that whole loop by keyboard alone, twice, and check that nothing duplicated (loops, listeners, decoders) on the second pass.

### A HUD scaled from one unit
- **Invariant:** The HUD keeps its proportions at every screen size, numbers do not jitter as they change, and the centre of the screen stays clear.
- **Technique:** Size every HUD element from one CSS unit derived from the viewport; tabular numerals on everything that counts; information on a safe inset at the edges; readability from shadow rather than panels; icons drawn per element at one stroke weight.
- **Reference configuration:** AW: `--u: min(0.0926vh, 0.0521vw)`, one 1080p pixel. SR: an edge inset of `clamp(14px, 2.4vw, 34px)`. Readability from a hard 1u shadow plus a soft 7u one, and bone (#ece7d8) instead of pure white. OC's sweep: 1280x720, 1920x1080, 2560x1440, 1024x768, 16:10, iPad and 844x390, where fixed-width panels clipped at 16:10.
- **Applies when:** Every game with a HUD.
- **Verify:** Capture the HUD at every desktop viewport; the layout is the same picture at each size, and a counting number does not shift its neighbours.

### A hitmarker grammar
- **Invariant:** The player can tell a hit, a critical hit, a kill and incoming damage apart at a glance, and their direction.
- **Technique:** Distinct marks with distinct timing for hit, critical and kill, merged damage numbers per target, and a directional arc toward an attacker that decays.
- **Reference configuration:** MC and AW: four ticks; a hit 130 to 180 ms scaling 1.34 to 1; a headshot gold, 165 ms; a kill red and thicker, 240 to 340 ms. Hits on one target within 180 ms merge into one number rising 34 px over 900 ms. Incoming damage: a conic arc, attack 80 ms, hold 180 ms, decay 1350 ms.
- **Applies when:** Combat games.
- **Verify:** Frame-step a recording of a hit, a headshot and a kill; each mark is distinguishable on a single frame.

### Flashes are limited at the source
- **Invariant:** No effect, in the canvas or in the DOM over it, changes the screen's brightness fast enough to be a photosensitive flash, rising or falling.
- **Technique:** Limit the frame-to-frame change in composited luminance for full-screen effects, in both directions, by measuring every large overlay rather than a list of known ones. Injury overlays keep the centre clear.
- **Reference configuration:** AW limits each overlay's frame-to-frame luminance step to 0.045, under half of WCAG 2.3.1's 0.10 flash pair, after two players reported flashing violent enough to fear a seizure.
- **Applies when:** Every game with flashes, damage overlays or explosions.
- **Verify:** Record the worst flash in the game and measure per-frame mean luminance; no step exceeds the limit. See `opengame-accessibility`.

### The FPS counter informs and never alarms
- **Invariant:** If the game shows a frame-rate counter, it is a persisted setting, it shows in play and not in menus, it never covers health or ammo, and its colours report without alarming.
- **Technique:** A settings toggle that persists. Green at or above the target, a soft yellow below it, and no red. Track frame-time spikes and the slowest frames beside the average, since an average hides stutter. Place it clear of the HUD's information and paint it out of marketing captures. Ask the owner for the default once and write it down.
- **Reference configuration:** OC: green at 60 FPS and above, soft yellow below, never red (R160, an owner ask). Its floor is 60 and its aim 120, with no frame over twice the usual time after warm-up and 1% lows at or above 60 at 1280 x 720. The default changed 3 times, from on, to gameplay only, to off (R174, R178, R179), and on phones the counter moved off the health display.
- **Applies when:** Games that show a frame-rate counter.
- **Verify:** Switch it on, reload: it is still on, and only in play. Load the machine until the rate drops below target: the counter turns yellow, not red.

### New interface is built from the game's own kit
- **Invariant:** Every dialog, badge, toast and card added later looks and sounds like the game's own menus.
- **Technique:** Build new UI from the menus' components, type, colours, hover and click sounds; flat, with no gradients, tints or shimmer; the same focus loop as other dialogs (Escape, outside tap, Tab, Enter); a form that closes confirms with the game's own toast.
- **Reference configuration:** OC's owner on a brand badge: "i hate the gradient... no orange tint. and make it look as sick as our menu components... same hover sfx and click sfx". The badge, the feedback dialog and its toast were rebuilt from the menu kit.
- **Applies when:** Every game that adds web UI around or over the canvas.
- **Verify:** Capture the new dialog beside a menu in one frame: same type, colours and corners. Hover and click it with sound on.

### The share card is a frame of the real game
- **Invariant:** The link preview, share card and icons come from the game as it plays, carry the game's mark and address, and show no counters, debug text or placeholders.
- **Technique:** Capture a hero frame in game through the capture path in `opengame-capture`, add the logo, a call to action and the address, and paint out counters and dev overlays. Ship a wide card, a square card and icons drawn at their real sizes, then check the tags on the live URL.
- **Reference configuration:** OC: 1200x630 under 1 MB from an in-game shot with logo, call to action and URL, the FPS counter painted out; a 1200x1200 square; a favicon hand-pixelled at 16 px, an apple-touch icon and a theme colour. A later OC note set the card as a JPEG under 300 KB.
- **Applies when:** Every game with a public URL.
- **Verify:** Paste the live URL into a link-preview checker and a chat app: the card is a sharp real frame with no counter.

## Further reading

Interface sound, controls legends and the menu audio path:
[references/menus.md](references/menus.md). First-run details, the share card and
analytics for a game served from its own domain: [references/launch.md](references/launch.md).
