---
name: opengame-verification
description: Prove a browser game works by using it as a player does. Covers the frame after Play, input that moves the player, a state contract, captures checked for build and screen before judging, the served build matched to its receipt, gates that fail closed, real phones over emulation, and checks that fail once on purpose. Use when the person asks does it work, test my game, verify the fix, before deploying or submitting, after a big change, or when a test passes but the game is broken.
metadata:
  version: "1.0.1"
---

# Verification

Every defect worth knowing about in our own games was found by playing, not by a build,
a type check or a test suite, and several were hidden by the very check that should
have caught them: a test script that entered a sign-in code by focusing each cell by its
label, which no person can do; an audit that measured zero because it measured nothing.
So the question to ask is not only "does the check pass" but "what is making this look
fine?"

Rules carry five tags; `opengame-quality-bar` explains them and the game codes.

## Run a player check

Use [helpers/browser-evidence.mjs](helpers/browser-evidence.mjs) from a project with
Playwright installed. The helper starts a muted headless browser, clears network
cache, clicks Play, holds a key, reads position changes and captures the page.
Run it through the host's heavy-job wrapper when one is required.

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

## Rules

### Capture the frame one second after Play
- **Invariant:** The first moment of play is seen, through the real menu, on every change that could affect it.
- **Technique:** Drive a real browser from a cold load through the title and menu with real clicks and keys, press Play, wait one second, and capture the composited page (canvas and HUD together). Serve the build without caching so the browser runs the code on disk.
- **Reference configuration:** ST captures the frame after Play on every checkpoint; our originals' rule is to serve with no-store, because a caching static server ran stale modules for three separate agents.
- **Applies when:** Every game.
- **Verify:** The capture shows the game world, the HUD and the player in control, not a loading screen, a black frame or the menu.

### Check what a capture shows before anyone judges it
- **Invariant:** Every frame or clip used as evidence is confirmed to show the build, screen, camera and moment it is labelled with, with the player alive, in frame and in control, and every asset loaded, before it is scored or compared.
- **Technique:** Stamp each capture with the build id, the screen name, the camera mode, the player's health and the loaded-asset count read from the state contract. Run a validator that rejects any capture where those disagree with its label, where a loading, death, title or pause screen shows, or where the HUD has not settled. Report how many captures it rejected and why.
- **Reference configuration:** OC scored 15 death screens as a gameplay baseline, and its first parity round was game-over frames that still scored 14-19 on the metric. A "shoulder view" was first person, a "gun" shot was the title screen, "profile" shots showed the main menu, "after" frames were taken before models loaded, and a folder named R121 held R86. Coverage reported all valid on those frames. OC waits 300 ms for the UI to settle.
- **Applies when:** Every capture that a person or a script will score, compare or cite as proof.
- **Verify:** Plant a death frame, a loading frame and a frame from an older build in a capture set: the validator rejects all of them by name.

### The build under test is the build that was served
- **Invariant:** Every result names the build it ran on, and the files the browser loaded match that build's receipt.
- **Technique:** When a build is cut, write a receipt: source commit, build id and a hash of every shipped file. Have the game report its build id in the state contract. Before testing, and after every deploy, hash the files the server returns and compare them with the receipt; any mismatch fails the run and names the file. Rebuild every target (desktop, phone, threaded and not) from the same source each round.
- **Reference configuration:** OC's R162 served a wasm that did not match its receipt, and the launcher around the check hid the failure. Its iOS bundle had last been built on 17 Oct and shipped stale every round until R160. A claim that two builds matched came from a stale binary copied after a killed build, and shader edits went untested for 3-8 builds because the test build never recompiled them.
- **Applies when:** Every game with a build step, a CDN, a cache or more than one build target.
- **Verify:** Change one shipped file after the receipt is written: the check fails and names that file.

### The change is seen running in a built round
- **Invariant:** A fix counts as done once it is seen or heard in a build from the merged source, reached through real input, with a log line or state value showing its code path ran.
- **Technique:** Give each change a marker it emits when its path runs (a counter, a log line, a state field). After the round is built, play to it through the real menu and capture it. A change whose marker never fired is not done, however the code reads. Finish endings with real deaths and real wins, with god mode off.
- **Reference configuration:** OC had about 25 reports in a row say none of the work had been seen in a build, and complaints stayed open 4-5 rounds because fixes landed minutes after the snapshot. Visuals gated on a health value hid the menu chains for 6 rounds; cutscenes set their camera too late in the frame and were "probably never shown"; after a "no proof captures" speed rule, the upright-corpse fix shipped on a path that ran zero times.
- **Applies when:** Every change reported as fixed, most of all visual and audio changes and anything behind a condition.
- **Verify:** The report links the capture and the marker count from the built round.

### Gates fail closed
- **Invariant:** A gate that fails, times out, crashes or did not run reports failure, and its exit status says so.
- **Technique:** Propagate exit status through every wrapper (no trailing command that resets it). Treat a timeout, a missing validator and a missing result file as failure. Read "it ran" markers written by the game, never lines the test script prints itself. Inject one known failure into each gate when it is written and whenever it changes.
- **Reference configuration:** OC's gate wrappers ended in an `echo` and exited 0 after a failure; failed acceptance checks still wrote PASS. Timeouts counted as done, "ran" flags matched the test script's own log, a missing validator returned pass, and frame-count QA passed a film cut with 402 frozen frames.
- **Applies when:** Every script, gate and wrapper whose result anyone acts on.
- **Verify:** Each gate's history shows one deliberate failing run with a non-zero exit.

### Keep test-script bugs apart from game bugs
- **Invariant:** Before a failure is filed against the game, someone has shown it happens through real play and not only inside the test script, and each bot run covers what its report says it tested.
- **Technique:** Review test scripts like game code. Fail fast when the run-start marker is missing. Drive bots with real input and count what they did (shots fired, hits, kills, time spent at the target) from game telemetry. Use staging (god mode, an empty map, extra points, a jump to any round) to reach a moment, and judge feel only on unstaged runs.
- **Reference configuration:** In one OC range most "failures" were test-script errors: a fixture placed 10 m inside a base, the player sent back to spawn, script overruns read as crashes, and a regex that matched only audio cues. One bot hit the boss's weak points for 8 of 489 s; another fired 240 shots and hit nothing because it aimed at the sky. OC's pass bar became 546 shots and 17 kills, counted from telemetry.
- **Applies when:** Every automated playtest, bot run or scripted capture.
- **Verify:** Each bot report states its counts, and a run whose counts fall under the bar fails as a test-script failure.

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

### A state contract to assert against
- **Invariant:** A test can read what the game believes (phase, player position and health, score, what is loaded) without reaching into its internals.
- **Technique:** In development builds, expose a small read-only snapshot such as `window.__og.state` with the few values tests need, built by the game from its real state each frame. Never let tests write to it.
- **Reference configuration:** AW reads the loaded map's identity before measuring after a failed load fell back without an error to a stand-in arena that measured faster than the real map.
- **Applies when:** Every game that will be tested by a script or an agent.
- **Verify:** The contract reports the real loaded level and phase, and a planted failure (block a required asset) shows up in it.

### Nothing built is left uncalled
- **Invariant:** Every module, component and asset in the game is reachable from where the game starts.
- **Technique:** Grep for each new module's name and each generated file's name in the source; follow imports from the entry point. Ban optional calls (`?.()`) at seams between parts of the game, because a call that does nothing, with no error, when its target is missing hides exactly the half-finished handover that breaks games.
- **Reference configuration:** OpenGame's own platform found a play counter imported nowhere (plays were never counted) and art uploaded to quarantine that was never promoted (every cover 404'd), each with every test green. AW shipped 35 sound files no weapon reached.
- **Applies when:** Every game, at every handover between two pieces of work.
- **Verify:** A script lists files under the game's source and assets that nothing references, and the list is empty or explained.

### One check loads the real thing the real way
- **Invariant:** At least one check exercises each dependency the way production does: the real loader, the real network library, the real audio engine.
- **Technique:** Alongside fast tests with stand-ins, keep one test that loads every shipped model through the game's own loader, one that makes the game's real network calls in a real browser, and one that calls every public method of the audio engine on a live context.
- **Reference configuration:** A networking feature once shipped dead because every validator injected its own stand-in and the real script tag was missing. AW's audio had five green checks while a deleted constant threw on the first footstep.
- **Applies when:** Every game with external libraries, assets or networking.
- **Verify:** Delete the real dependency on purpose (remove the script tag, rename a model): the real-path check fails, and the stand-in tests do not notice.

### Every check can fail
- **Invariant:** Every automated check has been seen to fail on a defect it is meant to catch, and reports how many things it examined.
- **Technique:** Plant the defect (a floating crate, a missing file, a busy-wait in the frame) and require the check to catch it before trusting its zero. A check that examined nothing fails.
- **Reference configuration:** DK's coplanar audit measured 0 m² on every prop until a planted defect showed its clipping was inverted. AW plants a defect for every map check in every map, and its plants found two bugs in the checks. OC's corpse-spin metric improved with heavier corpses while the corpses looked worse, and the change was reverted after a blind video comparison.
- **Applies when:** Every audit, gate and test the game relies on.
- **Verify:** Each check's output names its plant and its examined count.

### Judge motion and sound as sequences
- **Invariant:** Animation, camera feel, transitions and the mix are judged from recordings over time, never from a single still or a number.
- **Technique:** Record frame sequences with input for motion; record the mix during the busiest moment and listen to it at a consistent level. Report listening as its own result, separate from loudness numbers.
- **Reference configuration:** ST records the mix during its playtests and treats peak and loudness readings as never counting as a listening verdict. MC's foot sliding and AW's slideshow remote players were invisible in stills. OC's wonder-weapon sound v3 was pushed to a loudness number without anyone listening, and the owner rejected it on first listen as distorted.
- **Applies when:** Every game with motion or sound.
- **Verify:** The report links a recording for every motion and audio claim.

### When two measurements disagree, compare the machines
- **Invariant:** A disagreement between two runs of the same check is investigated as a fact about the runs before it is treated as a fact about the game.
- **Technique:** Compare runtime versions, machine load, throttle actually achieved, browser and GPU before changing code. Run heavy suites one at a time.
- **Reference configuration:** Eight honest reports in OpenGame's own repository disagreed for two days because they ran on two Node versions. AW measured a requested 4x throttle at 1.56x on a saturated machine. OC held a build as a regression when the cause was other browsers on the machine at 131%, 107% and 55% CPU, and a background-priority daemon cut headless Chrome from 105 to 5.6 fps for about 4.5 h. OC rejects a perf run when competing processes use more than about half the cores.
- **Applies when:** Every time results disagree.
- **Verify:** The report states the runtime, the load and the throttle for each run being compared.
