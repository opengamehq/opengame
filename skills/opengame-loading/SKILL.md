---
name: opengame-loading
description: Get a browser game from link to playable fast, and make the second visit almost instant. Covers a title-first boot over key art, a manifest of what the game really requests, a byte budget at a stated bandwidth, precompression and content types, hashed caching, fetch retries and stall deadlines, a progress bar by bytes, priority loads and quality changes without a reload. Use when the person says loading is slow, the bar sticks, the first load is huge, assets pop in or a return visit is slow.
metadata:
  version: "1.0.0"
---

# Loading

A player decides whether to stay before the game has finished downloading. They need a
working title screen with sound in a second or two, an honest bar while the world
streams behind it, and nothing on screen that is a stand-in for the real thing. A
returning player should download nothing. OC (OG Clash) asked for load speed about 12
times and reached its 15 s target only for returning players, so the first rule here is
the one that moves a first load most.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes. Three.js
loaders, compression, Vite and service-worker detail is in
[references/threejs.md](references/threejs.md). Frame-time cost of loading belongs to
`opengame-performance`; phone memory and texture caps to `opengame-mobile`.

## Rules

### The title comes first and the world streams behind it
- **Invariant:** The first screen a player sees is interactive over key art before the world has downloaded, and the world loads behind the title and menus, so Play is ready by the time the player presses it.
- **Technique:** Split the download into tiers. The boot tier holds the shell, the key art, the title UI, its music and the input that unlocks audio. The next tier holds what the player will use first (their character, the equipped loadout, the spawn area). The rest loads by need. Draw the title from a still or a light scene, and swap in the live scene only once it is fully ready. Compile shaders behind the menus, not after Play.
- **Reference configuration:** OC's targets: key art on frame one, press-start under 1 s, title under 2 s on a first visit and under 1 s after. OC's 3D title needed the arena (135 MB) and the boss (15 MB) before it could show, and a key-art title estimated at "15x faster first load" was deferred as a 1-2 day build. Loading the arena behind the menus made Play take 0.12-0.15 s.
- **Applies when:** Every game whose world is larger than a few megabytes.
- **Verify:** On a cold cache at the stated bandwidth, record time and bytes to an interactive title, then press Play as soon as it is allowed and record the wait.

### Ship what the runtime requests, listed in a manifest
- **Invariant:** The deployed build contains only files the game requests, and a manifest generated from real runs lists each one with its size and the tier that needs it.
- **Technique:** Log every request during scripted runs through every screen, mode, weapon and device class. Diff the log against the build folder, move unrequested files out, and fail the build when a large file has no entry. Keep a tier and a device class on each manifest entry, and gate the size of each tier.
- **Reference configuration:** OC's build folder grew to about 6.3 GB in 25,600 files, "mostly files the game never loads"; its deploy worker logged real requests to prune it, and the CDN set came to 3.07 GB. Boot loads grew from 225 MB in 590 files to 833 MB in 6,124 files over a few days, and models from 222 to 490 MB over R74-R77, with no gate to stop them.
- **Applies when:** Every game with a build step or an asset pipeline. It matters most when an exporter writes every asset in the project.
- **Verify:** A full scripted run requests every manifest entry, and the build folder holds nothing outside the manifest.

### Bytes before the title have a budget at a stated bandwidth
- **Invariant:** The bytes needed before the title and the time they take on a named connection are written budgets, measured on every build with a cold cache and a throttled network.
- **Technique:** State the target as time at a bandwidth, convert it to bytes, and gate each build on the bytes the title tier actually transfers. Measure with network throttling in a real browser rather than on localhost at full speed, and record the transfer size the browser reports.
- **Reference configuration:** OC's target was 15 s or less at 25 Mbps, which is about 47 MB at roughly 3.1 MB/s. Before the title it sent 309 MB in 1,788 files; 291-304 MB took 119.6-123.2 s at 25 Mbps. Compression took that to 181 MB (R164), still about 58 s.
- **Applies when:** Every web game. Pick the bandwidth with the owner; a phone on mobile data is slower than a desk.
- **Verify:** A cold-cache run under the stated throttle prints bytes transferred and seconds to an interactive title, and fails above budget.

### Every file is precompressed and typed
- **Invariant:** Every compressible file is served precompressed with the right `Content-Type` and `Content-Encoding`, the server picks the encoding from `Accept-Encoding`, and nothing is compressed twice.
- **Technique:** Write Brotli and gzip siblings at build time and have the host serve them; set types for `.wasm` (`application/wasm`, which streaming compilation needs), `.glb` (`model/gltf-binary`), `.ktx2` (`image/ktx2`) and every custom format. GPU-compressed textures shrink little, so measure each class before spending build time on it.
- **Reference configuration:** OC served its packed model files, asset index and audio with no `Content-Type` and no compression, and its shell ignored a Brotli copy of the wasm (12.6 MB raw against 2.56 MB). Earlier the game binary downloaded uncompressed (10.6 MB instead of 2.1 MB). Measured deflate ratios: GPU textures 1.28x, model files 2.27x, the asset catalog 7.2x. A claim that gzip "saves 20 s" failed audit.
- **Applies when:** Every game served over HTTP. The static host may do this for you; check rather than assume.
- **Verify:** For one file of each type, request it with `Accept-Encoding: br, gzip` and read the response headers; in the network log, the transfer size of each text, wasm and model file is well under its resource size.

### Hashed names and long-lived caching
- **Invariant:** A returning player on an unchanged build downloads only the small entry document, and after a deploy downloads only the files that changed.
- **Technique:** Put a content hash in every asset's file name. Serve hashed files as `Cache-Control: public, max-age=31536000, immutable`, and the entry document as `no-cache` with an ETag. Avoid per-build path prefixes, which change every URL on every deploy. A service worker that keeps hashed files in Cache Storage helps where the HTTP cache is evicted.
- **Reference configuration:** OC's content-hash cache (R193) took a returning player from 150 s to 14.7 s. Before it, per-build paths made every deploy a full download. An earlier server rewrite took repeat visits from 714 MB to 5.1 MB.
- **Applies when:** Every game that is played more than once or deployed more than once.
- **Verify:** Load, close, load again: the second load transfers only the entry document. Change one asset, deploy, reload: only that file and the entry document transfer.

### Fetches retry, and a stalled load is caught by a byte deadline
- **Invariant:** Every fetch can time out and retry, a load that stops receiving bytes is detected and reported, a slow load that is still receiving bytes continues, and a failed load ends on a retry button rather than an automatic page reload.
- **Technique:** Wrap every fetch with an idle timeout reset on each chunk received, retries with backoff and jitter, and a size or hash check on the result. Tell slow from stalled by bytes over time. Show a "slow connection" notice after a stretch with no bytes, keep retrying, and give up only after a long deadline with a button to try again. Cap concurrent requests. Check that a wrapper keeps the platform's own checks, such as range-response handling.
- **Reference configuration:** OC's runtime never retried a failed file, so a load waited on it forever, stuck at 97% (fixed R185). An earlier loader sat at 2% for 74 s after 244 failed requests with no timeout or error path. The page-side guard took 5 revisions over about 2 h, because a first wrapper bypassed range-response checks, and a later version's give-up turned into an "arena stalled" crash. The settings that shipped: the notice only after 20 s with zero bytes, retry with backoff while bytes arrive, and phone requests capped from 128 at a time to 24.
- **Applies when:** Every game that fetches assets after the first document.
- **Verify:** Fail one asset's first three requests (Playwright `page.route` aborting them): the load completes. Fail it every time: the notice appears, the page does not reload, and the error names the file. Throttle to a slow but steady link: no notice.

### Progress counts bytes and only reaches 100% when the next screen works
- **Invariant:** The bar follows bytes received plus weighted non-network steps, climbs in small even steps, never goes backward or holds a number for long, and reaches the end only when the next screen is interactive.
- **Technique:** Take each file's size from the manifest, count bytes as response chunks arrive, and give shader compiles, environment maps and scene builds their own weights. Advance the shown number toward the true one at a capped rate so it moves in small steps. Hide the bar on loads short enough to finish before it would be read.
- **Reference configuration:** OC's bar stuck at 60% and jumped to 100% ("Baking light" was hard-coded at 60% for about 8 s of work), and stuck at 97% for 20 s before a reload. Fixed, it climbs 1% at a time, holds no number for more than about 0.75 s (0.68-0.73 s measured) and shows only after 0.6 s. A shader warm-up curtain had added 2.5 s of blank screen. The owner asked 3 times.
- **Applies when:** Every load the player waits through, first boot and match entry alike.
- **Verify:** Under the stated throttle with a load of 8 s or more, sample the shown value every frame: it only rises, holds no value past the cap, and reaches 100% within a frame of the next screen accepting input.

### What the player sees first is loaded first, and never as a stand-in
- **Invariant:** The equipped weapon, the player's own character and their sounds load at top priority and are resident before the screen that shows them; a lower-detail stand-in never appears, and anything late shows the previous complete asset or a designed loading state.
- **Technique:** Run fetches through a priority queue and order requests by need. Gate screens, purchases and pickups on the asset being ready. Load the equipped weapon's sounds with its model. Keep the old complete model on screen until the new one is fully ready.
- **Reference configuration:** OC's runtime had no priority control, so request order was the only control it had. Weapons the player was given arrived 2.5-7 s late (about 40 s for the heaviest) as mitten hands or black shapes, which spoiled captures in 3 streams and caused a false regression. One lazy-load change put low-poly guns in 6 places; the owner: "dont show the low poly versions anywhere anytime for any weapon anywhere in the game". Gun sounds were silent for 11-16 s, queued behind 35 MB of audio banks.
- **Applies when:** Every game with a loadout, a character select or items that appear mid-game.
- **Verify:** On a cold cache under throttle, go straight to play and fire: the first frame of the weapon is the full model and the first shot is heard. Capture every path that hands over an item.

### Changing quality never reloads the page
- **Invariant:** Tier and pixel ratio change at runtime without navigation, and a capability probe's result is stored for the next visit instead of applied by reloading.
- **Technique:** Read the stored tier or run a quick probe before creating the renderer (choosing tier and pixel ratio before the first frame is in `opengame-mobile`). Switch passes, resolution and texture sets at runtime. Prewarm only the active tier, and warm another tier when the player picks it.
- **Reference configuration:** An OC probe stored a higher tier 12 s after the title and reloaded the page, which matched the owner's report: "once it got near 100% it just restarted the game". Warming 4 tiers made the last 3-5% of phone loading take 1-3 min.
- **Applies when:** Every game with quality tiers.
- **Verify:** Change the tier in settings during a run: the page fires no `beforeunload`, the run continues, and the log shows one tier prewarmed at boot.

### Loading keeps going in a background tab
- **Invariant:** A player who switches away during the download comes back to a load that kept going.
- **Technique:** Drive loading from fetch promises and message events, not from animation frames. Slice long CPU work with `MessageChannel` or `scheduler.postTask`. Count stall timeouts in visible time only.
- **Reference configuration:** OC's runtime drove loading from its animation-frame loop, so loading halted in hidden tabs. Browsers stop `requestAnimationFrame` in a hidden tab and slow `setTimeout` to about once a second, then once a minute.
- **Applies when:** Every load long enough that a player might switch tabs.
- **Verify:** Start a cold load, switch to another tab for 60 s, return: the progress advanced while hidden, and no stall notice fired.

### A self-hosted build keeps code off the asset path
- **Invariant:** When the game is hosted outside a game platform, heavy assets come from a static host or CDN with no per-request code, with the headers the runtime needs and range requests where the runtime uses them.
- **Technique:** Put the page shell and the heavy assets on separate hosts if one host's limits are smaller than the game. Serve assets as plain static files. If the game uses threads (`SharedArrayBuffer`), send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` on the page and `Cross-Origin-Resource-Policy` on the asset host. Check the served build after each deploy (see `opengame-stability`).
- **Reference configuration:** OC split a 106 MB page shell from 3.07 GB of assets on a CDN under per-build paths. A worker function on every asset request billed about 5,000 requests per load.
- **Applies when:** Games deployed to your own hosting. On OpenGame, `opengame-deploy` covers packaging and the platform serves the files.
- **Verify:** One cold load's request log shows no function invocations for asset files, the isolation headers on the page and the asset responses, and `206` responses where the runtime sends `Range`.
