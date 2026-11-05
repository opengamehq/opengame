---
name: opengame-stability
description: Make a browser game crash-free on every device and browser, and prove it. Covers zero crashes as the release bar, soak tests over hundreds of full sessions, fixed pools named, counted and warned before full, crash reports that survive reload, a watchdog that tells a slow load from a hang, recovery that never loops, GPU device loss, dev commands off in public builds and the served build checked after each deploy. Use when the game crashes, freezes, reloads itself or breaks after a deploy.
metadata:
  version: "1.0.0"
---

# Stability

A crash ends the session and usually the player. OC's (OG Clash's) owner asked for zero
crashes about 25 times ("we CANNOT have any crashES EVER on ANY device ANYWHERE").
Crashes took about five days to close from the first ask, among the slowest of any
problem, and stayed open on iPhone after launch. In the end a gate of full sessions on
real devices held, along with crash reports that named the cause and pools that warned
before they were full.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes. Phone
memory kills are in `opengame-mobile`; load stalls and retries in `opengame-loading`;
proving a fix ran in `opengame-verification`.

## Rules

### Zero crashes is the release gate
- **Invariant:** A build ships only when full sessions on every target device and browser end with no crash, freeze, self-reload or lost input, and a load that times out counts as a failure, not as clean.
- **Technique:** Keep a matrix of device class by browser by flow: cold boot to play, a full match with real input, pause and resume, a returning player with saved settings, a tab switch, a resize or rotation storm, and a GPU device loss. Drive it with real key, mouse and touch input from the title, not a shortcut into the match. Stress each crash class the game has: ammo refills, corpse and debris load, spawn bursts, character and weapon switches. Treat release-build assertions as live code: guard divisions by zero, negative indices and non-finite values. Count time on both the game clock and the wall clock.
- **Reference configuration:** OC's bar: 200 or more consecutive clean sessions, 20 cold boots per device class including a 6x CPU throttle, 60 s of live combat, pause and resume, and a returning player, with load timeouts never counted as clean. Real devices belong in the matrix (`opengame-mobile`).
- **Applies when:** Every game anyone outside the team will play.
- **Verify:** The gate prints its matrix with a clean or failed verdict per cell and the session count behind each; one failed cell blocks the release.

### Soak full runs and count crashes per hundred sessions
- **Invariant:** Stability is measured as a crash count over many complete runs with real input, long enough to reach the late-game states where crashes live, not by one smoke test.
- **Technique:** Run whole matches end to end, many times, on every platform in the matrix, and keep a running crash count per build. Include cold loads as their own count. Make each soak session start from a cold boot and end at results, and log the build id, device and the last screen in every record. A short smoke test before promotion is a boot check, not a stability claim.
- **Reference configuration:** OC's crashes hit 57-437 s into play (a physics write past the end of an array, read as memory exhaustion for about 40 rounds) and 78-185 s into play (R94-R101), past the 90 s smoke test. After fixes: 0 WebAssembly traps in 300 or more gate sessions (R163-R181), 45 of 45 on the R163 matrix, and 60 of 60 cold loads on each of 3 platforms. That R164 "60/60" ran in Chrome emulation, and the real iPhone crashed within a day of launch.
- **Applies when:** Every game with sessions longer than a minute.
- **Verify:** The release note states sessions run, crashes seen, and cold loads per platform, each tied to the build id, and lists which counts came from real devices.

### Every fixed pool is named, counted live and warned before it is full
- **Invariant:** Every fixed-size table (materials, textures, particles, decals, lights, trails, handles, audio voices, touch slots, instance buffers) has a declared size, a live count and a recorded peak, and warns before it fills; on overflow the game drops the lowest-priority item and logs an error that names the pool.
- **Technique:** Register every pool in one table with its name, size, current count and peak. Show the table in a debug overlay and write it into crash reports. Warn when a pool passes a high share of its size. On overflow in development, throw an error naming the pool and its size; in release, drop the lowest-priority item, log once, and keep running. Where pool sizes are sums written by hand, compute them at build time from the content instead. Three.js: read `renderer.info.memory` (geometries, textures) and `renderer.info.programs.length`, keep your own counts for particle, decal and voice pools, and `dispose()` on unload.
- **Reference configuration:** OC hit at least 15 distinct caps: at least 8 crashed or hung a build and at least 4 failed with no message (audio sources, touch buttons, local lights, hide lists). A trail cap of 444, a sum typed by hand, crashed R78 at boot and slipped 25 min of every agent's work by a round. Others: handles at 128 and 512, particle materials in a fixed 512 KB buffer, lights at 280 with overflow a crash, decals 256 of 256, batch instances 192 of 192. A material table of 4,096 filled at about 85 a second because one retry ran 2,432 times. The audio mixer dropped 75% of cues without a word.
- **Applies when:** Every game, and every engine or library with fixed capacities.
- **Verify:** A stress run (maximum enemies, every effect, every weapon) prints the pool table with peaks; each pool pushed past its warning logs its name, and pushed past its size the game keeps running.

### A crash report names what crashed and survives the reload
- **Invariant:** Every crash leaves a record with the error, a symbolised stack, the build id, the device, the screen and the last events before it, written locally before the page dies, uploaded on the next load, and kept until the upload is confirmed and readable by the team.
- **Technique:** Catch `error`, `unhandledrejection`, GPU validation and device-loss events. Keep a ring buffer of recent events (screen changes, spawns, loads, input) and write it with the error to local storage at once. Set a session flag at start and clear it on a clean exit, so the next boot can count a session that died with no error, such as a memory kill. Send a `pagehide` beacon with the outcome. Keep source maps and WebAssembly symbol maps for every release build, private to the team, and keep stacks whole. Give the team a way to read reports back, not only write them.
- **Reference configuration:** OC's WebAssembly stacks had no names (`f1974 -> f1975`) and the fatal text was lost when the module trapped, so agents rebuilt address maps by hand on every build from R98 to R109. Its reset screen "confirms the recovery handler ran; it does not reveal the cause". Local records were deleted after upload, the report endpoint was write-only, and phone memory kills left nothing. The game cut stacks to 160 characters, which hid the caller for 3 rounds; the cap went to 4,000. The owner was asked to paste DevTools expressions before reloading. OC's run-end analytics event later reported crashes through a `pagehide` beacon.
- **Applies when:** Every game played outside the developer's machine.
- **Verify:** Throw from inside one system during a run and reload: the next boot shows or uploads a record whose stack names that function. Kill the tab from the OS: the next boot counts an unclean session.

### The watchdog tells a slow load from a hang
- **Invariant:** A stall detector measures progress (bytes received, load steps done, frames ticked), keeps a slow but moving load going, trips only on a real hang, names what it was waiting for, and never reloads the page on its own.
- **Technique:** Give each long job a heartbeat that resets its deadline when it makes progress. Fetch retries and the byte deadline for downloads are in `opengame-loading`. Watch loading by bytes and steps and the main loop by ticks, as separate detectors. When one trips, report the guard, the job and its last progress, and show a recovery card. Keep test-script timeouts out of player builds, and make sure a scripted test that runs past its script ends with a clean message, not a crash.
- **Reference configuration:** OC's runtime trapped any wait over 10 s, in release. It fired during loads under machine load and on slow phones, showed a crash card and auto-reloaded: "a big part of last night's iPhone crash and reload near 100% loops". A 12.8 s stall loading boss music ended a run. A test-runner timeout message was taken for a game crash by at least 7 streams. Turning the watchdog off with a URL flag was spotted by the owner in the address bar, and a reviewer noted "Watchdog-off suppresses detection; it does not resolve stalls". It was the most widely reported problem, in 14 notes.
- **Applies when:** Every game with a watchdog, timeout or "loading too long" handler.
- **Verify:** Throttle the network to slow but steady: no trip. Block one request for good: the trip names that file. Busy-wait the main loop: the frame detector names the system.

### Recovery never loops and never hides a downgrade
- **Invariant:** After a crash the game recovers to a known screen without reloading itself in a loop, and any fallback build or reduced mode it switches to is shown to the player and keeps every feature.
- **Technique:** Count unclean sessions per build. Switch to a fallback only after repeated unclean sessions, for a limited time, keyed to that build so a fixed build starts fresh. Show a notice naming the fallback. Test the fallback as a real build with sound, input and saves. Never call `location.reload()` from an error handler.
- **Reference configuration:** OC's fallback pinned after 2 unclean sessions, for 24 h, per build. One fallback build shipped with no sound.
- **Applies when:** Every game with a crash handler, a fallback bundle or automatic quality steps.
- **Verify:** Force two crashes in a row: the third boot runs the fallback with its notice, plays sound and accepts input; deploy a new build: it starts on the full version.

### The game survives losing the GPU
- **Invariant:** Losing the GPU device or context (a driver reset, a phone reclaiming memory, a long time in the background) leads to a restored game or a one-tap resume card, never a frozen frame.
- **Technique:** Listen for `webglcontextlost` (call `preventDefault()` so a restore can happen) and `webglcontextrestored`, or for WebGPU's `device.lost` promise, then request a new device and rebuild GPU resources from kept source URLs. Pause the simulation while the device is gone. Three.js: `WebGLRenderer` handles the WebGL events itself, so check that your own render targets, data textures and freed CPU copies come back; for `WebGPURenderer`, check your release's device-loss callback and test it.
- **Reference configuration:** OC's loading froze at 80% after a GPU device loss, with no recovery, for two rounds. Its runtime could not recreate the device, so OC showed a tap-to-reload card, and device loss joined the crash matrix.
- **Applies when:** Every WebGL and WebGPU game, most of all on phones and laptops that switch GPUs.
- **Verify:** Mid-match, call `WEBGL_lose_context.loseContext()` then `restoreContext()` (or `device.destroy()` on WebGPU): the game comes back or shows the card, and play continues after it.

### Dev commands do not work in public builds
- **Invariant:** A public build has no URL parameter, console hook or key that changes game state, grants items, skips progress or turns off a safety check, and runs that used a dev command never reach a leaderboard.
- **Technique:** Strip dev code at build time behind a build flag. If a dev surface must ship, gate it behind a key the server checks or a stored hash, never a plain parameter. Mark runs that used dev commands and have the leaderboard server reject them. Search the shipped bundle for dev markers as part of the release check.
- **Reference configuration:** OC's `?commands=` parameter and a global command hook worked on the public host; an agent guessed a URL could hand out a wonder weapon. OC fixed it with a key stored only as a SHA-256 hash.
- **Applies when:** Every game with debug commands, cheats or test hooks.
- **Verify:** On the public URL, try every dev parameter and console hook: nothing changes. Grep the shipped files for the dev command names: none match.

### The served build is checked against the tested build after every deploy
- **Invariant:** After each deploy, the files the public URL serves match, by hash, the build that passed the gate, and the previous good build can be restored in about a minute.
- **Technique:** Write a build receipt listing every file and its hash. After deploy, fetch the entry document and every file, or at least every entry point and binary, from the public URL with caches bypassed, and compare. Make the deploy script stop with an error on a mismatch instead of logging and carrying on. Keep earlier builds on the host under their hashed names so a rollback only points the entry document back. Rebuild every platform variant from the same source on every round. After the hash check, run a cold boot on production.
- **Reference configuration:** OC's R162 served a binary that did not match its receipt, and "the outer launcher hid that failure". OC checked 701-714 file hashes per round and kept a 1-minute rollback. Its iOS bundle was "last built Oct 17" and shipped stale every round until R160. Production stayed on an old round while a deploy worker tried CDN experiments, and one redeploy did nothing because the script skipped the round being served.
- **Applies when:** Every self-hosted game. On OpenGame, play the private preview from `opengame-deploy` before calling the release good.
- **Verify:** Deploy, run the check: it passes. Corrupt one file on the host: it fails and names the file. Time a rollback to the previous build.
