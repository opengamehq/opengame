---
name: opengame-performance
description: Keep a browser game smooth on an ordinary laptop, with three.js specifics. Covers frame-time variance and one-percent lows, per-system timing, writes only on change, menus and previews at high pixel ratio, quiet-machine A/B measurement, draw and memory budgets, shader prewarm, textures decoded once, dynamic resolution and no per-frame allocation. Use when the person says the game stutters, hitches, lags, drops frames, swings between frame rates, has a slow menu or freezes on the first explosion.
metadata:
  version: "1.0.0"
---

# Performance

A game is smooth when its worst frames are fast, not when its average is. Players feel
the 99th percentile: the hitch on the first explosion, the stall when a new material
compiles, the sawtooth of the garbage collector. They feel the spread as well: OC's owner
asked about 25 times for a stable frame rate and put it as "MINIMIZE VARIANCE (... not
bouncing 60-120)". Measure the tails and the spread, on the real route, and fix what the
measurement names.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes. Loading
and download size have their own skill, `opengame-loading`; phones have `opengame-mobile`.

## Measure the running game

Install `opengame-verification` with `opengame skills add --skill opengame-verification`
and use its `opengame-verification/helpers/browser-evidence.mjs` for frame-time samples and input evidence.
Set a frame-time tolerance from the target hardware's measured baseline. Record the
CPU throttle and soak duration alongside the result. Compare the same scene and
player route before and after a change. Inspect memory separately when diagnosing a
leak; frame-time samples do not measure retained memory.

## Rules

### Low variance beats a high average
- **Invariant:** After warm-up the frame time stays close to its median: the one-percent low holds the floor, no frame runs far past the usual, and every average is reported with the spread beside it.
- **Technique:** Record every frame's duration on the real route after a warm-up, and report the median, p99, the one-percent low (the frame rate of the slowest hundredth of frames), the worst frame as a multiple of the median, and the count of frames over twice the median. Show an FPS counter that is green at the floor and yellow below it. When a game cannot hold its top rate, cap it at a rate it holds rather than letting it swing. Three.js: time frames in the `setAnimationLoop` callback with `performance.now()`, use stats.js for the on-screen counter, and fix the pixel ratio while measuring.
- **Reference configuration:** OC's targets: desktop floor 60 fps, aim 120 (phone targets are in `opengame-mobile`); one-percent low at least 60 at 1280 x 720; p99 at most 1.5x the median; no frame over 2x the usual once warm; counter green at 60 and up and yellow below, with no red. Averages hid the problem: OC measured combat at 74 fps average with a 35 fps one-percent low, one build at 64 and 13, another at 31 and 8.6.
- **Applies when:** Every real-time game. Turn-based and puzzle games still need it in menus and transitions.
- **Verify:** The measurement script prints the one-percent low and the count of frames over twice the median for the busiest route; a run whose average clears the floor while its one-percent low does not is reported as a failure.

### Budgets are tails, measured on the real route
- **Invariant:** The game has written budgets for frame-time tails and for what each frame draws, and every number reported against them came out of one measurement script on the real path: menu, Play, live play.
- **Technique:** Drive the production path with input, record frame times, and report p50, p95, p99 and long tasks, plus draw calls, triangles, texture and geometry memory, and JS allocation rate. Print the machine's load and the throttle actually achieved beside every result, because milliseconds move with load and counts do not.
- **Reference configuration:** AW, at 1920 x 1080 on its high tier with 12 combatants under a 4x CPU throttle: p50 16.7 ms, p95 25.0 ms, p99 33.3 ms, long tasks 300 ms per 20 s, 700 draw calls, 900,000 triangles, 320 MB of textures, 160 MB of geometry, 200 MB of decoded audio, 4 MB/s of allocation. AW estimates 2x throttle is about an M1 Air's CPU and 4x pessimistic by design; the throttle does nothing to the GPU.
- **Applies when:** Every 3D game. Smaller games set smaller budgets, but the shape (tails, counts, one script) stays.
- **Verify:** The script prints all of the above for the busiest route, and fails when a map did not actually load (AW measured a grey stand-in arena under a map's name, and it looked faster than the truth).

### Every slow frame has an owner
- **Invariant:** Frame time is split by system and by render pass, so every frame over budget names the system that made it slow, and only a small share of an ordinary frame is unattributed.
- **Technique:** Wrap each system's update and each pass in a timer that writes into a rolling per-system histogram. On any frame over twice the median, log the top systems for that frame. Spread one-off heavy jobs (path searches, camera searches, spawning a set piece) over several frames instead of running them in one. Keep logging off the hot path, since writing log lines is a cost too. Three.js: `performance.now()` around each system, `renderer.info.render` per pass, and GPU timestamp queries (`EXT_disjoint_timer_query_webgl2` on WebGL 2, the `timestamp-query` feature on WebGPU) for passes.
- **Reference configuration:** OC began with about 40% of the frame not broken out, and found spikes by parsing logs (1,096 frames over 25 ms in one session, the worst 159 ms) until its agents wrote a per-system profiler. Once timed, all game systems together cost 0.4-2.5 ms and the large items were the engine's update, render sync and audio mix (3.8-7 ms for 30-46 voices). Named fixes followed: ally pathing went from 18 calls to 1, a held-gun shader at 1.6-1.8 ms (28% of a combat frame) got a 0.4 ms target, and 13 log lines on one frame turned out to cause a hitch.
- **Applies when:** Every game with more than a handful of systems, and always before anyone guesses at a cause.
- **Verify:** Plant a busy-wait of known length in one system: the next slow-frame log names that system and the planted time. The per-system table for an ordinary frame sums to within a few percent of the measured frame.

### A verdict needs a quiet machine and an interleaved A/B
- **Invariant:** A change is called faster or slower only from paired runs of both builds, alternated in one session on a machine with nothing else competing for it, with the competing load logged for every run.
- **Technique:** Alternate A, B, A, B on the same scene, route, settings and pixel ratio. Warm up, then sample. Log other processes' CPU for each run by their full command line, and throw out runs where other work used a large share of the cores. Keep the browser at foreground priority. Drop frames that overlap a screenshot or a recording. When the measuring machine also builds and renders, book a quiet window for measurement and run nothing heavy in it.
- **Reference configuration:** OC held R143 as a regression for a round: other Chrome processes were using 131%, 107% and 55% CPU. A background-priority daemon cut headless Chrome from 105 to 5.6 fps for about 4.5 h. OC's protocol: 30 s warm-up, 120 s sample, reject runs above about 50% of cores in competing use, and exclude frames that overlap a screenshot. Paired runs caught the R143 contention, and R159 was reverted after losing 6 of 9 pairs. See [references/measuring.md](references/measuring.md).
- **Applies when:** Every performance claim, most of all on a machine shared with builds, captures or other agents.
- **Verify:** Run A against A first: the difference stays within noise. Then plant a known slowdown in B: the A/B flags it. Every run in the report lists its competing-CPU figure.

### Every number names the quality it ran at
- **Invariant:** Adaptive quality never changes anything unseen: every frame-time number records the tier and render scale it ran at, benchmarks run with adaptation pinned, and a player's explicit choice is lowered only with a notice and never below an agreed floor.
- **Technique:** Log each change of tier or render scale with its time and reason. Give benchmarks a flag that pins tier and scale. Show the effective tier in settings. Step down at most once, with a banner, outside menus and loading, and stop at the floor the owner agreed.
- **Reference configuration:** OC's adaptive mode dropped render scale to 58% while its numbers were compared with fixed runs: one adaptive run read 119.4 fps average and 70.5 one-percent low beside a fixed combat run at 74 and 35. Its "Dynamic" mode lowered Ultra to Low or Medium while settings still said Ultra, and captures came out with 8 of 224 lights. The owner hit it 3 or more times ("Let's make Ultra the base... fall back to High, but not below"). The policy that held: one step from Ultra to High after 8 s at a GPU median above 17.5 ms, with a banner, never below High and never in menus.
- **Applies when:** Every game with dynamic resolution or automatic tiers.
- **Verify:** A benchmark report shows the tier and scale track for its whole run. A long session started on the top tier ends on it, or shows the banner and the logged reason.

### State is written only when it changes
- **Invariant:** An update that leaves a value as it was does not write it, so nothing downstream re-uploads, re-syncs, re-sorts or re-lays out.
- **Technique:** Compare before writing anything that marks state dirty, such as visibility, transforms, material parameters, uniforms, instance buffers and HUD text. Watch for APIs where asking for write access counts as a change even when no value moves. Three.js: set `visible`, `material.needsUpdate`, `texture.needsUpdate` and `instanceMatrix.needsUpdate` only on a real change; set `matrixAutoUpdate = false` on static objects and call `updateMatrix()` when they move; set DOM `textContent` only when the string differs.
- **Reference configuration:** In OC, taking write access to a value marked it changed whether or not anything was written. A force field's per-frame write was behind the R159 hitches, and audits found about 20 such call sites. Comparing before writing cut main-thread CPU by 30% and frame spikes from 225 to 102 a minute.
- **Applies when:** Every game, most of all one with many hidden or idle objects.
- **Verify:** Count dirty marks and uploads per frame with the game idle in a menu: the count is zero. In combat, the count tracks what moved.

### Menus and previews draw only what changed
- **Invariant:** A menu, pause screen or 3D preview costs what its motion needs: a still preview does not rewrite its scene every frame, and a menu holds the same floor as play.
- **Technique:** Give menu scenes the same per-system timing as play. Rebuild a preview's scene only when its subject or camera changes, and write its visibility and materials on change. Draw the 3D preview at its own capped resolution, and stop rendering scenes that are fully covered. Measure menus in a headed browser at the display's native pixel ratio, since a headless run at pixel ratio 1 hides the cost. Three.js: render a preview into a small `WebGLRenderTarget`, call `renderer.render` for it only when a dirty flag is set, and `setAnimationLoop(null)` for scenes off screen.
- **Reference configuration:** OC's owner measured a menu at 24 fps (p99 90 ms) and the main menu at 20 fps (p99 136 ms) on a Retina laptop while headless runs read 110-120. The owner had asked for menus at the play floor 3 or more times.
- **Applies when:** Every game with a 3D menu, loadout preview or character screen.
- **Verify:** With the menu idle at native pixel ratio, the per-system table shows no scene rebuilds, and the one-percent low meets the play floor.

### Pixel ratio is capped by a pixel budget
- **Invariant:** The number of pixels drawn is chosen from a budget in device pixels, so a high-density display does not multiply the GPU cost of the frame.
- **Technique:** Choose the pixel ratio from a target pixel count in device pixels rather than CSS size, and run full-screen post at the internal resolution. Apply the cap before the first frame. Three.js: `renderer.setPixelRatio(Math.min(devicePixelRatio, cap))`, and check the result against `renderer.domElement.width * height` (or `drawingBufferWidth` on the context).
- **Reference configuration:** At pixel ratio 2, OC's menu GPU time was 22.6 ms, of which the 3D was about 2 ms; the rest was full-resolution post. A cap written in CSS pixels never applied (17.6 fps) and shipped for 14 h before the fix. Ultra drew 2x the pixels on Retina, and the phone menu drew 3.4x the pixels of the run.
- **Applies when:** Every game that runs on Retina laptops, 4K monitors or phones.
- **Verify:** Log the drawing-buffer size on a high-density display at every screen: it stays at or under the budget, and the frame time matches the same size at pixel ratio 1.

### Nothing compiles during play
- **Invariant:** No shader program links after the loading cover lifts.
- **Technique:** Prewarm every material through the same render target, colour space and cameras the frame really uses, under an opaque fade, and keep the light count fixed (see `opengame-lighting`). A prewarm through the canvas compiles the wrong variant when the world draws into a linear target. Prewarm first-use effects and sounds the round before they appear, not on the frame they first play.
- **Reference configuration:** AW's prewarm ran with no target bound and compiled the sRGB variant of every material while every real frame drew into a linear target; nothing it compiled was used. Fixed, the countdown went from 16 long tasks totalling 3,607 ms to none, and programs linking after the veil from 10 to 0. OC: a quality switch that recompiled pipelines hitched for about 10 s (worst frame 48.7 ms), so it prewarms boss effects and sounds the round before and builds the death and results screens ahead of time.
- **Applies when:** Every three.js game with more than a handful of materials.
- **Verify:** Count `renderer.info.programs.length` when the loading cover lifts and again after the first fight; it does not change.

### Statics merged, repeats instanced
- **Invariant:** Draw calls scale with the number of materials, not the number of objects.
- **Technique:** Merge static geometry per material, instance repeated props in spatial chunks with level of detail and hysteresis, and check that skinned and instanced bounds are right so culling does not remove visible things.
- **Reference configuration:** DK draws its props in about 9 calls; MC's Rust map in 24. AW gives one map's own geometry a budget of 44 draws inside the 700. OC's arena drew about 6,190 separate objects with none grouped, and cutting resolution by 60% saved only 16% of the frame.
- **Applies when:** Every scene with many static objects.
- **Verify:** Read `renderer.info.render.calls` with the busiest view on screen.

### Textures by measurement, one decode per image
- **Invariant:** Every image is fetched, decoded and uploaded once however many materials use it, and its GPU format was chosen by measuring size and quality.
- **Technique:** Cache textures by URL and hand out clones that share the source; register only the original for disposal. Encode KTX2 per texture class after measuring bytes on the wire, GPU residency and quality on the real surface, with a fallback to the original image when the transcoder or device cannot do it.
- **Reference configuration:** AW: sharing sources took GPU residency from 492.1 MB to 440.3 MB; 65% of its texture memory was loaded images, the only part KTX2 can reach. AW measured ETC1S with its normal-map mode at no extra cost for normals where UASTC cost about six times the bytes, and chose ETC1S throughout; SR encodes character textures as full-resolution UASTC.
- **Applies when:** Every textured game. Measure by `Texture.source`, not by texture objects, or a working cache looks like a failed fix.
- **Verify:** Count distinct sources and sum their bytes at runtime; KTX2 statistics report how many loaded compressed and how many fell back.

### Resolution scales before content does
- **Invariant:** When the GPU cannot keep up, the game lowers render resolution smoothly and raises it again only when it is clearly safe, without oscillating.
- **Technique:** Measure missed presentations against the display's real period, require several agreeing checks to change, a longer dwell before raising after a drop, and a cooldown after any change. Lowering resolution cannot fix a CPU stall, so do not use it to hide one. Log every change (see the rule on naming the quality a number ran at).
- **Reference configuration:** AW checks every 2 s, waits 8 s after any change and 20 s after a drop before raising, drops on 2 agreeing votes and raises on 4, drops by 0.15 and raises by 0.1, treating more than 5% missed frames as stutter and under 1% as clean.
- **Applies when:** 3D games that must run across very different GPUs.
- **Verify:** Log the scale over a long busy session on a slow machine: it settles rather than bouncing.

### Quality tiers that keep the look
- **Invariant:** The lowest tier still reads as the same game, and every tier stays inside its budget.
- **Technique:** Tiers drop expensive passes in order (occlusion, then volumetrics, then bloom and multisampling), cap device pixel ratio and shadow resolution, and shrink the light pool. Never change collision, input or what the player can see of a threat.
- **Reference configuration:** DK's low tier drops occlusion, volumetrics, motion blur, depth of field and reflections and keeps bloom and FXAA. The ST starter drops occlusion, then bloom and multisampling.
- **Applies when:** Every game with post or many lights.
- **Verify:** Capture the same view at every tier and measure each against the budget.

### Nothing allocates per frame
- **Invariant:** An ordinary frame of play allocates nothing, so the garbage collector does not cut a sawtooth through the frame times.
- **Technique:** Reuse scratch vectors and matrices, fixed particle pools and ring buffers for decals, tracers and casings; update the HUD on change, not every frame; avoid layout reads in the hot path.
- **Reference configuration:** DK's pools: 900 smoke and 900 spark particles. AW budgets 4 MB/s of allocation during play; above it the collector runs every second.
- **Applies when:** Every game.
- **Verify:** An allocation profile of a busy minute shows a flat heap and names no per-frame allocation site in game code.

### Loading pays only for what is needed
- **Invariant:** The menu appears quickly, a returning player downloads almost nothing, and nothing cosmetic downloads during a countdown or the first seconds of play.
- **Technique:** Bundle the boot tier, preload only what the first actionable scene needs, stage the rest after play starts, and serve with validators so unchanged files are not re-sent. The full set of loading rules is in `opengame-loading`.
- **Reference configuration:** AW: time to menu 1,500 ms and under 4 MB fetched before the menu; a repeat visit dropped from 34.36 MB to 0.39 MB once its server sent `no-cache` with an ETag instead of `no-store`. Moving a 2.70 MB model prewarm out of the countdown took countdown downloads from 3.02 MB to 0.32 MB.
- **Applies when:** Every game, most of all large 3D ones.
- **Verify:** A network waterfall bucketed by phase: boot, menu, countdown, first seconds of play.

## Further reading

What AW's measurement script got wrong before it was trusted, and how contention on a
shared machine made OC chase a regression that did not exist:
[references/measuring.md](references/measuring.md).
