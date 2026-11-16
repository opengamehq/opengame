> Carried from `opengame-verification` 1.1.0. Read it when: Prove a browser game works by using it as players and the owner do. Covers the owner's exact path, defaults only from a booted tree, items closed by someone else on the live build, fixes that name their neighbour, hiding one layer at a time, counters proven on a known fault, gates that fail closed, tools that must not change the game, injected faults and senses no agent has. Use when asked does it work, test my game, verify the fix, before deploying, or when tests pass and the game is broken.


# Verification

Every defect worth knowing about in our own games was found by playing, not by a build,
a type check or a test suite, and several were hidden by the very check that should
have caught them: a test script that entered a sign-in code by focusing each cell by its
label, which no person can do; an audit that measured zero because it measured nothing.
So the question to ask is not only "does the check pass" but "what is making this look
fine?"

Three newer games sharpened that. On OS the owner found about 93% of new defects. On LC
about 45 of 190 lessons were the measuring tool changing what it measured, and every
complaint the owner had to repeat lived on a path nobody tested. On OH and LC no agent
heard a sound or watched a film at speed, so the owner's ears and hands were the only
test of feel. The rules below are how to get closer to what the owner sees, and how to
say so where you cannot.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes.

## Run a player check

Use [helpers/browser-evidence.mjs](helpers/browser-evidence.mjs) from a project with
Playwright installed. The helper starts a muted headless browser, clears network
cache, clicks Play, holds a key, reads position changes and captures the page.
Run it through your machine's job queue when one is required.

Create a synthetic scenario file with `url`, `playSelector`, `key`, `screenshot`,
`statePath` and `positionPath`. Example paths are `["__og", "state"]` and
`["player", "position"]`; use the game's actual read-only contract. Supply
`criteria.movementMin` in game units and `criteria.frameP95MsMax` from a measured
baseline and the target hardware. `holdMs`, `soakMs` and `cpuThrottle` set the budget.

Run `node <installed-skill>/helpers/browser-evidence.mjs scenario.json`. Exit zero
means movement, frame time and browser error criteria passed. Inspect the screenshot
and confirm the level and phase yourself. A script result alone cannot establish
that the correct game is visible. Re-run with a blocked player or delayed frames to
verify that the measurement fails. Keep credentials out of the scenario and capture.
The helper clicks through Playwright, which grants the page user activation, so it does
not exercise the strict autoplay path; the owner's-path rule below covers that.

## Rules

### Capture the frame one second after Play
- **Invariant:** The first moment of play is seen, through the real menu, on every change that could affect it.
- **Technique:** Drive a real browser from a cold load through the title and menu with real clicks and keys, press Play, wait one second, and capture the composited page (canvas and HUD together). Serve the build without caching so the browser runs the code on disk.
- **Reference configuration:** ST captures the frame after Play on every checkpoint; our originals' rule is to serve with no-store, because a caching static server ran stale modules for three separate agents. LC's director booted the owner's served build every 30 minutes, unflagged, at the owner's window and at 1280 x 720, with every cheat saved, a first and a second run, and logged console errors, failed requests, seconds to the menu with the machine load, and press-to-play time.
- **Applies when:** Every game.
- **Verify:** The capture shows the game world, the HUD and the player in control, not a loading screen, a black frame or the menu.

### Test on the owner's exact path
- **Invariant:** A fault the owner reports is reproduced, and its fix seen, on the path the owner actually takes: the build the owner is served, begun the way the owner begins it, with the owner's saved settings and cheats, a return visit, the owner's window size and pixel ratio, the owner's line speed, a real key press, the GPU shared the way the owner's is, the browser's strict autoplay policy, and a second run in the same page.
- **Technique:** The first time the owner reports a fault you cannot reproduce, write the owner's path down as a recipe and make it a standing capture: a cold browser with the owner's save seeded by an init script and checked on a still, the line throttled from navigation, the owner's window and pixel ratio, one real Enter, a wait before any second press, and a timeline of phase and picture from the press. Slow each async load in turn. Clicks sent through script evaluation do not count, because they grant user activation and the autoplay and pointer-lock refusal paths never run. Prove the fault reproduces on the recipe before fixing it, and is gone after.
- **Reference configuration:** LC's owner played at about 1790 x 860 with every cheat saved, over a laptop line, with a screen recorder holding the GPU, under strict autoplay. For three days the team tested two saved cheats, first visits, an autostart flag and 1280 x 720, and each difference hid a fault the owner then reported: six perk injections put the gun aside for 3.5 s at spawn (reported four times), a return visit sent New run back to the menu, 170 MB of late fetches queued the menu's 21 KB script, the wider window lost the lowered pistol's hands, and every streamed loop died at its first hand-over under strict autoplay, so there was no rain. "None of my 34 earlier spawns was begun by a real press." With the recipe standing (20 and 5 Mbit, 40 ms), spawns came right 20 of 20, 22 of 22 and 11 of 11. OH's blank board appeared only with gesture-gated autoplay, a pixel ratio of 2, a 1770 x 905 window and one async load slowed; the owner reported it twice, and the fix was published 81 min after the report.
- **Applies when:** Every game whose owner or players report from a setup the team does not test by default, above all games with saved settings, cheats, return visits or streamed audio.
- **Verify:** Re-run the owner's reported fault on the recipe before the fix: it reproduces. Run the recipe on the fixed build three times in one page: it is gone each time.

### Main is what the owner plays
- **Invariant:** The build the owner plays changes only by defaults that were seen right. New looks and behaviours go in off behind a flag, and a default flips only in a commit whose files match, byte for byte, a build that was booted plain, first and alone, and whose capture someone opened at full size beside a take-back control. Reports say "on main and seen", "on main, unseen" or "behind a flag".
- **Technique:** Put every visible change behind a URL flag and keep the old behaviour as a take-back flag. Build the default from an archive of the commit plus your own files, never from a shared working tree, and hash the built files against the commit. Boot it plain (no flag, no cheat, storage cleared, a real key) before any flagged page, with no console errors and no failed requests, and say in the commit message that this is the tree that was booted. Boot the fallback renderer too ("The fallback renderer is booted every time a default changes" in `opengame-stability`). Every round, capture main with no flags at the owner's first views. Anything found worse in play goes back to its last good state at once, and the report says so.
- **Reference configuration:** LC's preview rebuilt from main every 4 minutes. Five broken visuals (a black frame on raising the sights, a pink magazine, an orange ball for a head) shipped from passing unit tests: "Tests prove logic; only a picture proves a picture." Two owner corrections sent in the same minute both came from main while the team judged a flagged build. LC defaults that skipped the ritual reached the owner: a setting pushed by another lead's sync before its film was read, carried items glowing flat green for 35 minutes from "a film of arms only", a cant applied to 34 rifles with 2 seen (one wrist went from 39 to 81 degrees), and a thumb standing straight up for 30 minutes ("I HAD NOT OPENED THOSE FRAMES"). An OS weak-machine default drew a black sky on every map for three builds after a checkpoint committed it mid-test.
- **Applies when:** Any live preview or continuous deploy, and any project where several agents commit to the branch the owner plays.
- **Verify:** Every visible default since the last update maps to a capture path and a take-back flag, and the take-back restores the old behaviour in the served build.

### The build under test is the build that was served
- **Invariant:** Every result names the build it ran on, and the files the browser loaded match that build's receipt.
- **Technique:** When a build is cut, write a receipt: source commit, build id and a hash of every shipped file. Have the game report its build id in the state contract. Before testing, and after every deploy, hash the files the server returns and compare them with the receipt; any mismatch fails the run and names the file. Rebuild every target (desktop, phone, threaded and not) from the same source each round.
- **Reference configuration:** OC's R162 served a wasm that did not match its receipt, and the launcher around the check hid the failure. Its iOS bundle had last been built on 17 Oct and shipped stale every round until R160. A claim that two builds matched came from a stale binary copied after a killed build, and shader edits went untested for 3-8 builds because the test build never recompiled them. OS once shipped 7 stale cooked files (a sleeve served at 169,900 bytes against 175,240 cooked) because 90 build snapshots were hard-linked to the live cook.
- **Applies when:** Every game with a build step, a CDN, a cache or more than one build target.
- **Verify:** Change one shipped file after the receipt is written: the check fails and names that file.

### The change is seen running in a built round
- **Invariant:** A fix counts as done once it is seen or heard in a build from the merged source, reached through real input, with a log line or state value showing its code path ran.
- **Technique:** Give each change a marker it emits when its path runs (a counter, a log line, a state field). After the round is built, play to it through the real menu and capture it. A change whose marker never fired is not done, however the code reads, and a change too small to see at play size does not count: make it bolder, or say it does not read. Finish endings with real deaths and real wins, with god mode off.
- **Reference configuration:** OC had about 25 reports in a row say none of the work had been seen in a build, and complaints stayed open 4-5 rounds because fixes landed minutes after the snapshot. Visuals gated on a health value hid the menu chains for 6 rounds; cutscenes set their camera too late in the frame and were "probably never shown"; after a "no proof captures" speed rule, the upright-corpse fix shipped on a path that ran zero times.
- **Applies when:** Every change reported as fixed, most of all visual and audio changes and anything behind a condition.
- **Verify:** The report links the capture and the marker count from the built round.

### An item closes only when someone else sees it live, in the owner's conditions
- **Invariant:** An owner's item is closed only on evidence from the exact released build, gathered by someone who did not build the fix, in the owner's own conditions (map, weather, input device, refresh rate, render scale, saved settings), measuring the symptom the owner described rather than the suspected cause.
- **Technique:** Before new work each round, a verifier takes every item marked built, captures it on the live build with real mouse, keys and pad at the owner's refresh rate, and closes it with a frame path or reopens it with a reason. Source checks and byte checks guard wiring and are never cited as proof. A predecessor's "done" enters a new register as "verify".
- **Reference configuration:** OS's sweep of one release reopened 23-24 of 126-127 built items (18-19%), and an earlier sweep reopened 25 or more, including items accepted as "exactly right". One OS item closed at 0 footstep cues while the owner heard an ambience bed generated with "gravel crunching" in its prompt. A device fix passed a scripted capture at 0.03 px; the owner: "killstreak devices still shake/shift a lot when u use them". The test had no mouse look.
- **Applies when:** Any backlog with a verify state and more than one builder.
- **Verify:** Ten sampled done rows each cite a capture from the released build showing that row under the owner's named conditions.

### A pass on the literal complaint is not a pass on the bar
- **Invariant:** An owner's note closes when a hostile reader judges the quality under it, not when the named symptom is gone, and its check bounds what looks natural, not only what is impossible.
- **Technique:** Re-read the owner's words beside the fix and ask what the owner will say next. Write the note's bar in the owner's terms (human, readable, as loud as, as dark as) and test that, not the narrowest symptom. A joint-limit check passes anything possible; add the natural range. Close with the owner's quote beside a capture at the owner's own view.
- **Reference configuration:** LC reported "0 joint faults over 1,825 arm-states" and a playtest "seen fixed", then the owner: "hands also still look fucked up holding the gun". Wrists at 67-78 degrees had passed a limit of about 95, and the natural band of about 20 degrees came too late. The LC notes that came back were those fixed on a path the owner does not play, fixed literally (a menu effect returned three times), tuned to scripted players, or made default while known to be wrong from the owner's view.
- **Applies when:** Closing any note the owner raised.
- **Verify:** The closing note quotes the owner and shows a capture at the owner's view, and a reader who did not do the fix marks it against the quote.

### Every fix names the neighbour it could break
- **Invariant:** A fix ships only when its paired condition also holds, on the same build, through every caller of any shared function it touched, in both directions of failure.
- **Technique:** Write the pair into the brief: faster boot and every item still drawn; fewer audio dropouts and no added latency; a darker night and the lit room still playable; louder rain and the shot still on top. Re-audit the previous fix's area each round. For a look tuned by critique, accept a change only if it moves toward the reference value, not only away from the last complaint. Smoke through every caller of a shared function, not one.
- **Reference configuration:** About 25 OS fixes caused the next defect in 5 days: a buffer against audio dropouts built a backlog of about 690 ms ("gun shot sounds are delayed now?... in latest build actualyl it seems all audio"), texture release crashed decals, a boot deferral left the menu at "mode cards 0/6", a zoom binding removed aim ("also remember u need ot be able to eds with E as well! why did we remove that?"), and a shared function smoked through one of its three callers crashed a release. Judges moved an OS scope lens from 648 to 961 to 886 px. On LC a lowered pistol lost its hands in the owner's wider window, rain raised to be heard rose over the gunshot (a +17 dB raise put a drop at 0 dBFS), and a z-fighting mend built a slat wall that bodies walked through, on main for 8 hours.
- **Applies when:** Every fix, above all performance, memory, audio, lighting and shared-function changes.
- **Verify:** The proof sheet shows both conditions before and after on one build, plus a smoke through each caller.

### Hide one thing at a time before mending anything
- **Invariant:** Before a visual defect is mended, the team knows which object, material term, light or layer draws it, shown by the defect going away with exactly that one thing hidden.
- **Technique:** On a frozen frame, hide groups, then meshes, then zero material terms or lights one at a time, reading each hide back from the page and proving the hide tool on one frame first. Move objects to a hidden layer rather than setting a visibility flag other code writes back. Ask "drawn and unlit?" before "missing?". Strip a suspect material to a plain dark rough grey to test the light, then paint the suspect part a flat colour to confirm. A judge's name for a defect is a symptom, not a cause.
- **Reference configuration:** On LC a shoulder "hole" mended three times was drawn, unlit cloth; pale magazines blamed on texture metalness were the lens fill light; "z-fighting" was sub-pixel snow noise ("nine guesses before that were wrong"); hiding took 2 short jobs where guessing had taken 4 jobs and 9 trials. An LC probe stripped to 3% albedo stayed pale after about 3 h of material restyling, which proved the auto-exposure. OH's judges named the wrong layer nine times ("a 'mouth' was a snowflake"), and OH's rule of proof at play size, with layers hidden first, broke an 8.43 plateau.
- **Applies when:** Every visual defect whose cause is not certain, in any renderer.
- **Verify:** The defect report names the hidden thing and includes two frames, with it and without it.

### Check what a capture shows before anyone judges it
- **Invariant:** Every frame or clip used as evidence is confirmed to show the build, screen, camera and moment it is labelled with, with the player alive, in frame and in control, and every asset loaded, before it is scored or compared.
- **Technique:** Stamp each capture with the build id, the screen name, the camera mode, the player's health and the loaded-asset count read from the state contract. Run a validator that rejects any capture where those disagree with its label, where a loading, death, title or pause screen shows, or where the HUD has not settled. Report how many captures it rejected and why. How a capture stamps and proves itself is in `opengame-capture`.
- **Reference configuration:** OC scored 15 death screens as a gameplay baseline, and its first parity round was game-over frames that still scored 14-19 on the metric. A "shoulder view" was first person, a "gun" shot was the title screen, "profile" shots showed the main menu, "after" frames were taken before models loaded, and a folder named R121 held R86; coverage reported all valid on those frames. OC waits 300 ms for the UI to settle. OS's first round had 6 of 10 maps at 1 HP and put the victory screen in all three scope slots; four "gameplay" stills aimed at the sky, five judges scored a tree canopy, and 13 of one map's 39 checklist cameras sat inside walls, roofs or cliff tops.
- **Applies when:** Every capture that a person or a script will score, compare or cite as proof.
- **Verify:** Plant a death frame, a loading frame and a frame from an older build in a capture set: the validator rejects all of them by name.

### A check proves its scenario before its result
- **Invariant:** A capture, test or bot run proves nothing until it has shown its subject was in frame, lit, alive and in the intended state, that every value it set reads back from the page, and that a failure it reports happens through real play and not only inside the script.
- **Technique:** Each scripted check asserts its preconditions (alive, phase is play, subject in view and inside the light, the right counter path) and stops with the reason when one fails. Read back every value a script sets before measuring (position, health, camera distance, loadout) and stop if it differs. Review test scripts like game code, and fail fast when the run-start marker is missing. Drive bots with real input and count what they did (shots, hits, kills, time at the target) from game telemetry. Use staging (god mode, an empty map, a jump to any round) to reach a moment, and judge feel only on unstaged runs.
- **Reference configuration:** In one OC range most "failures" were test-script errors: a fixture placed 10 m inside a base, the player sent back to spawn, script overruns read as crashes, and a regex that matched only audio cues. One OC bot hit the boss's weak points for 8 of 489 s; another fired 240 shots at the sky; OC's pass bar became 546 shots and 17 kills, counted from telemetry. LC re-shot about a dozen captures (an empty grey frame, a tilted camera, the wrong spawn, a dead player whose audio was read on the results screen). Three LC leads' "0.3 m" stills were taken at 0.63-0.71 m, "the blow took 34 and he stood" because a set health was never read back, and a wall-treading count stood its test zombies outside every district the flow field reached.
- **Applies when:** Every automated playtest, bot run, scripted capture or eval.
- **Verify:** Break a precondition on purpose: the check fails rather than passes. A bot run whose counts fall under the bar fails as a test-script failure.

### Gates fail closed
- **Invariant:** A gate that fails, times out, crashes, did not run or judged nothing reports failure (or incomplete, which never reads as pass), and its exit status says so.
- **Technique:** Propagate exit status through every wrapper (no trailing command that resets it, no pipe that drops it). Treat a timeout, a missing validator, a missing result file and skipped tests as failure. Require the event a check judges (the respawn, the hit, the screen id) before it can pass. Read "it ran" markers written by the game, never lines the test script prints itself. A step passes only when its exit status and the receipt it wrote this run agree; any disagreement is incomplete. Any count a tool prints that could reveal lost content (stand-ins, dropped colliders, skipped items) gets a bar and fails the gate when it rises. Inject one known failure into each gate when it is written and whenever it changes.
- **Reference configuration:** OC's gate wrappers ended in an `echo` and exited 0 after a failure; failed acceptance checks still wrote PASS. Timeouts counted as done, a missing validator returned pass, and frame-count QA passed a film cut with 402 frozen frames. OS's UI check read a menu backdrop as a modal and checked nothing on any menu for half a day, and one OS tour exited 1 while its receipt said ok. An OS map had no wall collision for 4 days under a green gate while its log printed "2052 stand-in boxes ... no longer collide": "nothing read the number". LC pushed "36 unit tests pass" through a pipe with 2 failed, and conditional skips printed "2 skipped" and exited 0.
- **Applies when:** Every script, gate and wrapper whose result anyone acts on.
- **Verify:** Each gate's history shows one deliberate failing run with a non-zero exit, and a run with the judged event removed exits incomplete.

### Every check can fail, and is proven again whenever it changes
- **Invariant:** Every automated check has been seen to fail on a defect it is meant to catch, reports how many things it examined, is proven again whenever its filters or thresholds change, and is never loosened to pass.
- **Technique:** Plant the defect (a floating crate, a missing file, a busy-wait in the frame, a synthetic speck, the old build) in the same job as the check, and compare the count with a picture you opened. A new gate runs warn-only until it fails the planted case and passes several healthy runs, then hardens. On a filter change, plant a defect below the new tolerance and log what each filter drops. List a changed threshold with its old value, new value and reason, and never change a check and the thing it guards in one pass. A check that examined nothing fails. Audit with a measure that does not read what the fix changed ("Every check proves itself first" in `opengame-scene-audit`).
- **Reference configuration:** DK's coplanar audit measured 0 m² on every prop until a planted defect showed its clipping was inverted. AW plants a defect for every map check in every map, and its plants found two bugs in the checks. OC's corpse-spin metric improved with heavier corpses while the corpses looked worse. OS's integrity audit reached zero by adding filters ("the zeros came from loosening the audit rather than changing the map") and was accepted only once planted holes were all flagged; OS hardened new checks after 5 of 5 healthy runs and a failing negative control. LC counters that lied: "hands up" read 0.0% while the film showed it in 6 of 12 frames; a white-glove detector at 244 levels could never see a fault at 200; a probe of the page's copy of uniforms found 0 of 28,452 lost writes where the GPU lost 220. LC changed four mix checks in the same pass as the mix, and two went back once listed. OS's summary of its lying checks: "the check reused the fix's inputs, and the capture path differed from the player's"; its plant grounding pass and its check both read the same invisible card corners, so the log said "0 still floating" while about 3,600 plants hung.
- **Applies when:** Every audit, gate and test the game relies on.
- **Verify:** Each check's output names its plant and its examined count, and a recorded run on known-bad input that reads non-zero is rerun whenever the check changes.

### The measuring tool does not change the game
- **Invariant:** No code path in the game reads whether a capture, debug or test hook is present, except hooks that declare themselves and change only what they declare, and every reported time comes from a run in which nothing reads the picture back and nothing profiles the page.
- **Technique:** Grep the game for every read of a hook object and route each through one explicit declaration (a film flag, a stepped clock). Split each sitting into a picture run (frames and counts only) and a bare run (the page's own timing rows, long tasks, landing times), with the machine's load beside it. Name the tool's own cost before blaming the game: a long task inside a canvas read-back belongs to the tool. A profiled boot tells you whose time it is, never how long. Diff the game's own decisions (pacing rule, tier, clock source) per frame with and without the test kit. `opengame-performance` ("Timings come from a bare run") has the timing half.
- **Reference configuration:** LC's engine skipped its frame-pacing rule whenever an after-frame hook was attached, and the capture kit attached one to every page: four director sittings and three leads saw 56-60 fps while the shipped default drew 4 fps (35 frames in 8 s) for the first 8 s of every run, for an hour after the owner was told it was fixed. An LC blocker ("New run stands 1.3-3.2 s") was the kit's own read-back ("Of a press that stood 2,263 ms, 2,249 were the playtest kit's own frame reader"); bare, the press took 232-354 ms, and another "game" long task was 5,031 of 5,048 ms inside `toBlob`. OS's headed virtual display added about 46 ms a frame (headless on the GPU took one map from 9.9 to 22.3 fps), and a CDP profile put menu audio at about ten times its real cost.
- **Applies when:** Every game with a capture or test kit that installs anything in the page, and every time measured through captures, above all on a shared GPU.
- **Verify:** Boot the same build with and without the test kit and diff the game's decisions per frame: identical. Re-run a timed claim with read-back off: if the number moves by more than its spread, the earlier number is void.

### Prove the instrument before believing its number
- **Invariant:** A number counts only once the run is shown to have exercised what it claims (tier, renderer, cache state, frame source, presentation path, machine load) and the instrument's own noise is smaller than the change claimed. A disagreement between two runs of one check is a fact about the runs before it is a fact about the game.
- **Technique:** Have the game log the mode it actually took and copy that line into every receipt. Count frames the engine actually ran or presented, not animation-frame callbacks. Run an A/A for the noise floor, compare only same-tree twins in one capture mode, and interleave A and B inside one boot when boots swing. Cold means a fresh profile and an empty GPU driver shader cache. When results disagree, compare runtime versions, machine load, throttle actually achieved, browser and GPU before changing code, and run heavy suites one at a time.
- **Reference configuration:** Eight honest reports in OpenGame's own repository disagreed for two days because they ran on two Node versions. AW measured a requested 4x throttle at 1.56x on a saturated machine. OC held a build as a regression when the cause was other browsers on the machine at 131%, 107% and 55% CPU, a background-priority daemon cut headless Chrome from 105 to 5.6 fps for about 4.5 h, and OC rejects a perf run when competing processes use more than about half the cores. OS's weak-tier runs used the full renderer for about two days because a device-memory shim never reached the game's worker; a "fresh profile" boot of 5-9 s was warm, and true cold was 45.6 s; 10,297 frame callbacks held 5,053 engine frames, voiding every earlier fps figure; a windowed A/B shipped a 46% bot regression as a 13% gain for three releases against a 20% A/A floor. LC's multiplayer pages read 56.9-57.3 fps from callbacks and drew 17.4-18.5, and busy-machine "wins" of 26.2 against 32.5 ms were 18.4 against 18.2 on a quiet card. "The instrument was the bug more often than the code" (OS).
- **Applies when:** Every performance, load, memory, flicker or audio number, every scan that reports zero, and every time results disagree.
- **Verify:** Each receipt quotes the mode line, cache state, frame source and machine load for each run compared, and the A/A spread is under half the claimed change.

### A phone pass comes from a real phone
- **Invariant:** A claim that the game works on phones is backed by a run on a real phone in its real browser, and emulation results are labelled as emulation.
- **Technique:** Put a mainstream phone in the loop from the first playable build. Cold-load it several times in a row through the real menu, play a full match, and record memory, frame rate, audio and any reload. Desktop emulation of a phone checks layout and touch input and nothing else.
- **Reference configuration:** Every OC phone gate passed in Chrome's phone emulation while real iPhones crash-looped during load after launch. Emulation also hid missing in-game audio and a real frame rate of 10-20 fps.
- **Applies when:** Every game that claims phone support.
- **Verify:** The phone report names the device model, OS version and browser, and links a recording from the device.

### Input moves the player, not just the screen
- **Invariant:** Pressing a movement or action key changes the game's state, not only the pixels.
- **Technique:** Read the player's position (or the game's equivalent) before and after holding a key for a fixed time through real key events, and check the change against the expected speed. Do the same for the main action and its consequence.
- **Reference configuration:** A rule shared across DK, MC, AW and ST. The failure it prevents: a camera that bobs or sways on input makes a frame-difference test pass while the player is stuck against geometry.
- **Applies when:** Every game with player control.
- **Verify:** Hold forward through real key events and see the position change by roughly speed times duration; hold it against a wall and see it stop.

### Timing is proven with real input, and failure paths with injected faults
- **Invariant:** Timing and failure paths are proven by real events and real failures: real key presses through the browser's input path, measured on the game's own clock, and every fault a player's machine or network can produce injected on purpose, each ending in a message and a way out.
- **Technique:** Press real keys while adding stalls and CPU throttling, and read the judged time from each key's own event time against the game's clock (the audio clock in a rhythm game). Inject the failures: failed and slow responses, a missing level or chart file, no WebGL or WebGPU, storage that throws, a hidden tab, a lost GPU device, and many rounds in a row with heap counts. Run a seeded careless-player fuzzer (keys, chords, odd text, resize, blur, pointer lock, network drops) and shrink each finding to its shortest repeat.
- **Reference configuration:** OH's real presses landed at +1 ms mean with p95 under 5 ms and no misses under stalls. OH's launch QA (real presses, thirteen injected faults, every song and level) found the count-in off the beat on every song, a missing chart replaced without a word by a guessed one, two lanes sharing a key, touch-only screens stuck in emulation, a blank page without WebGL2 and an 8.7 MB-a-song heap rise. OS's soak (every map through the real picker, a full match, injected corruption and GPU loss) caught crashes on the 4th and 8th map and an out-of-memory on the 20th, and its fuzzer found a key-combination trap the owner had hit and a black screen after a 1 x 1 resize. `opengame-stability` has the soak's budgets.
- **Applies when:** Before any launch, and whenever timing or a failure path changes.
- **Verify:** Each injected fault shows a message and a way out, and the real-input timing report gives the mean and p95 against the game's clock.

### A state contract to assert against
- **Invariant:** A test can read what the game believes (phase, player position and health, score, what is loaded, which mode it took) without reaching into its internals.
- **Technique:** In development builds, expose a small read-only snapshot such as `window.__og.state` with the few values tests need, built by the game from its real state each frame. Have the game log the tier, renderer and clock it actually chose. Never let tests write to it.
- **Reference configuration:** AW reads the loaded map's identity before measuring after a failed load fell back without an error to a stand-in arena that measured faster than the real map. OS's checks that held up read facts the game logged on purpose (log lines, a dump of every UI draw command, debug render views); the pixel-only checks were the ones that cried wolf.
- **Applies when:** Every game that will be tested by a script or an agent.
- **Verify:** The contract reports the real loaded level and phase, and a planted failure (block a required asset) shows up in it.

### Nothing built is left uncalled
- **Invariant:** Every module, component and asset in the game is reachable from where the game starts.
- **Technique:** Grep for each new module's name and each generated file's name in the source; follow imports from the entry point. Ban optional calls (`?.()`) at seams between parts of the game, because a call that does nothing, with no error, when its target is missing hides exactly the half-finished handover that breaks games.
- **Reference configuration:** OpenGame's own platform found a play counter imported nowhere (plays were never counted) and art uploaded to quarantine that was never promoted (every cover 404'd), each with every test green. AW shipped 35 sound files no weapon reached.
- **Applies when:** Every game, at every handover between two pieces of work.
- **Verify:** A script lists files under the game's source and assets that nothing references, and the list is empty or explained.

### One check loads the real thing the real way
- **Invariant:** At least one check exercises each dependency the way production does: the real loader, the real network library, the real audio engine, the real input path.
- **Technique:** Alongside fast tests with stand-ins, keep one test that loads every shipped model through the game's own loader, one that makes the game's real network calls in a real browser, and one that calls every public method of the audio engine on a live context. Run the same scripted walk in the test kit and in the production build.
- **Reference configuration:** A networking feature once shipped dead because every validator injected its own stand-in and the real script tag was missing. AW's audio had five green checks while a deleted constant threw on the first footstep. LC's input was dead in the real game because nothing called its input poll, while the test kit polled for itself, and a cross-stream deadlock left a hand off in 2,003 of 2,003 frames because each side's unit test used a stub for the other.
- **Applies when:** Every game with external libraries, assets, networking or more than one team.
- **Verify:** Delete the real dependency on purpose (remove the script tag, rename a model): the real-path check fails, and the stand-in tests do not notice.

### Judge motion and sound as sequences, and say what nobody could perceive
- **Invariant:** Animation, camera feel, flicker, transitions, timing and the mix are judged from recordings over time on the game clock, never from a single still or a number, and every report says which of them nobody on the team could perceive.
- **Technique:** Film a fixed sequence (still, turn, strafe, walk, aim) at a fixed simulation step per frame, so before and after film identical poses, and review it at stride 1 and full size on the delivered output; mask screen-fixed overlays from any motion score. Record the mix during the busiest moment and listen at a consistent level. An agent cannot hear, and cannot watch a film at speed (it reads frames in order), so write "nobody has heard this" or "read from frames, not watched at speed" wherever it applies, and give the owner named A/B clips with what to listen or look for. How to film it is in `opengame-capture`.
- **Reference configuration:** ST records the mix during its playtests and treats peak and loudness readings as never counting as a listening verdict. MC's foot sliding and AW's slideshow remote players were invisible in stills, and OC's wonder-weapon sound v3 was pushed to a loudness number without anyone listening; the owner rejected it on first listen as distorted. OS's still panels sat at 3-4 across 135 builds while the owner's notes were about motion; a static z-fight gate stayed green through 8 days of flicker complaints; free-running flicker captures varied 10-30% against about 5% on the game clock, and unmasked, the reticle supplied most of a "-54%" gain. LC wrote "NOBODY HAS HEARD" 72 times in its audio documents: nine audio leads set every level by meter, and the owner, "the first person to listen to the game", found no rain, a female screech and a harsh flamethrower. "I CANNOT WATCH A FILM AT SPEED" (an LC lead); 72 reload films were made and none was watched by a lead. LC then gave the owner 41 named A/B audio pairs.
- **Applies when:** Every game with motion or sound.
- **Verify:** The report links a recording for every motion and audio claim, a planted shimmer is flagged by the clip review, and every audio claim says whether a person listened.
