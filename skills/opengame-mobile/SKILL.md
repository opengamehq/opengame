---
name: opengame-mobile
description: Make a browser game run, sound and stay up on real phones. Covers tab memory measured on a real phone in Safari, freeing CPU copies after GPU upload, texture caps per device class, tier and pixel ratio before the first frame, touch input that keeps every release, audio unlock with a real check, phone frame rates, no blur over the canvas on iPhone, and WebGPU fallback. Use when the game crashes or reloads on a phone, is silent on iPhone, lags on mobile or has stuck touch controls.
metadata:
  version: "1.0.0"
---

# Mobile

A phone is a different machine, and a desktop browser set up to imitate one hides the
failures that matter. OC (OG Clash) passed every phone gate in Chrome's iPhone emulation
while the owner's real iPhone crash-looped during load, played no gunfire, and ran at
10-20 fps. Emulation does not enforce Safari's memory limit, its touch quirks or its
audio rules. Put a real phone in the loop on the first day.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes. Download
size and caching are in `opengame-loading`; crash counting and recovery in
`opengame-stability`; frame-time measurement in `opengame-performance`.

## Rules

### Phone memory is measured on a real phone in real Safari
- **Invariant:** The game's tab memory on the weakest target phone stays under a written budget through a full session, measured on the device in its own browser, and a build that has passed only emulation has not passed.
- **Technique:** Connect the phone to a Mac and use Safari's Web Inspector (Timelines, with the Memory instrument) while playing title, menus, a full match and results twice in a row. Add Android Chrome through remote debugging. Treat "A problem repeatedly occurred" or a silent reload as a memory kill. Keep a per-subsystem memory table in the game itself (textures, geometry, audio, WebAssembly heap) so the number has owners. Avoid fixed large up-front memory reservations; let WebAssembly memory grow from a modest start.
- **Reference configuration:** OC's owner set about 500 MB per tab; it was never met (the desktop tab sat at 3.5 GB, and an iPhone peaked at 3.9 GB). iPhones crash-looped from R165 to R195 after every emulated gate passed. Halving a fixed 4 GiB WebAssembly reservation changed nothing, because only about 0.8 GB of it was the game's own memory. Playwright's WebKit has no WebGPU, so OC had no local iOS reproduction, and fixes were blind until the owner tried his phone.
- **Applies when:** Every game that claims to run on phones, most of all iPhones, where Safari kills tabs over memory with no warning.
- **Verify:** On the real phone, two full sessions back to back: the tab stays up without a reload, and Web Inspector's peak stays under the budget. Record the phone model and OS version with the result.

### CPU-side copies are freed after GPU upload
- **Invariant:** Once a texture or mesh is on the GPU, the decoded pixels and vertex arrays held for it in JavaScript or WebAssembly memory are released, and the source URL is kept so they can be fetched again after a context loss.
- **Technique:** After upload, drop references to decoded image data and typed arrays the renderer no longer needs. Keep a table of URLs per asset so a restore can refetch. Three.js: load images with `ImageBitmapLoader`, and with `WebGLRenderer` close the bitmap in `texture.onUpdate` (`texture.image.close()`) once it is uploaded; for meshes you never raycast, morph or rebuild, free each attribute's array after upload with `attribute.onUpload(function () { this.array = null; })`. Test a resize and a forced context loss afterwards, since a texture that must be re-uploaded needs its source again.
- **Reference configuration:** OC measured about 690 MB of duplicate texture memory, leaving the tab at 4.4 GB ("444 MB is duplicate copies of textures already on the graphics card"), and 180-270 MB on phones. Its runtime had no public way to drop the CPU bytes and keep the GPU texture; a patch of about 30 lines to release them saved about 450 MB.
- **Applies when:** Every textured game on phones; on desktop when tab memory matters.
- **Verify:** Compare tab memory at the title with release on and off on the real phone. Then force a context loss (`WEBGL_lose_context.loseContext()` and `restoreContext()`): every texture draws again.

### Texture size and mips are capped per device class
- **Invariant:** Each device class has an agreed maximum texture size and downloads only the mip levels it will draw, and any cut in phone fidelity is agreed with the owner before it ships.
- **Technique:** Pick the device class before loading textures, and point the manifest at per-class files with the top mips trimmed, so a phone downloads only the detail it draws. Keep hero items one step above the rest. Write each cap down with its memory saving and the owner's decision beside it. Three.js: KTX2 files per class through `KTX2Loader`, checked against `renderer.capabilities.maxTextureSize`.
- **Reference configuration:** OC's phone textures went from 1,063.8 MB to 222.3 MB. The phone cap went from 2048 to 1024 to 512 while crashes continued. Phones had been fetching top mips and discarding them. Unasked phone cuts (16 enemies, 1024 px textures, half-resolution sky) shipped and were reverted after the owner said "i dont want phones to get worse quality".
- **Applies when:** Every game that ships textures larger than a phone needs.
- **Verify:** Per device class, sum the texture bytes transferred and resident at the title and in play; the hero items in a phone capture match the desktop capture at phone viewing size.

### Tier and pixel ratio are chosen before the first frame
- **Invariant:** The quality tier, pixel ratio and worker count are set from a device check before the renderer draws anything, so a phone starts at phone settings from its first frame.
- **Technique:** Classify the device from touch support, screen size, `navigator.hardwareConcurrency`, the GPU adapter and any stored result from an earlier visit, and default phones to the phone tier. Treat a GPU that reports no memory or a generic name as unknown and use the phone tier on a touch device. Set the pixel-ratio cap before the first `render`. Size worker pools from measured speed on the device, not from the reported core count. Three.js: `renderer.setPixelRatio(Math.min(devicePixelRatio, cap))` before the first frame, and `renderer.compileAsync` for the chosen tier only.
- **Reference configuration:** OC's phones warmed up at the top tier at full Retina before its caps applied. Safari's GPU reported a generic vendor with 0 bytes and read as desktop, so phones got the top tier. Safari reported 2-4 cores, which would have started 16 threads, so OC fixed workers at 4; on desktop, 8-12 workers ran slower than 4. The pixel budget behind the cap is in `opengame-performance`.
- **Applies when:** Every game with tiers or a pixel-ratio cap that runs on phones.
- **Verify:** On the real phone, log the tier and drawing-buffer size of the first frame: both are already the phone values.

### Every touch release arrives, even when the system cancels it
- **Invariant:** Every touch that starts has an end the game sees, including when the OS cancels it, the finger leaves the canvas or the tab loses focus, so no ghost finger owns the camera and no button stays held.
- **Technique:** Use pointer events with `setPointerCapture`, and handle `pointerup`, `pointercancel`, `lostpointercapture` and `touchcancel`. Listen for releases on `window`, not on the canvas. Clear every active touch on `visibilitychange` and `blur`. Key touches by identifier, and do not cap the event queue in a way that can drop ends. Set `touch-action: none` on the canvas. Keep the game in touch mode unless a real keyboard or mouse is used for a while.
- **Reference configuration:** OC's input had no `touchcancel` and a 20-event queue that dropped ends, leaving "a ghost finger that owns the camera forever"; iOS touch ids are unique, so the ghost never cleared, while Chromium emulation hid it. A mouse release heard only on the canvas made 60 of 60 clicks miss after an overlay. One tap flipping the HUD to desktop mode needed a 30-frame guard.
- **Applies when:** Every game with touch controls, and every game with DOM overlays over the canvas.
- **Verify:** On the real phone, start a look drag and pull down the notification shade or start the home gesture, return, and drag again: the camera follows the new finger. In automation, send a touch start then a `touchcancel`: no input stays active.

### Sound unlocks on the first touch and is checked by measurement
- **Invariant:** Sound plays from the first touch on a phone, comes back after calls, locks and tab switches, and is proven by measured output on the device, not by the audio context's state or a log line.
- **Technique:** Create or resume one `AudioContext` inside the first touch handler, and resume again on every touch, on `visibilitychange` and when the context reports `suspended` or `interrupted`, with a short watchdog. On Safari, set `navigator.audioSession.type = 'playback'` before creating the context where the API exists, so the silent switch does not mute the game. Load the player's own weapon sounds first. Give the player's weapon, UI and music priority over enemy voices. Check the output with an `AnalyserNode` on the master bus during a shot, and have a person listen on the phone.
- **Reference configuration:** OC had no gunfire on iPhone across 3 or more builds, and the owner raised in-game iPhone sound 7 times ("game audio was playing but NOT gunfire sounds"). The phone build's audio functions were stubs while the log still said "unlocked ... 48000 Hz out". Setting the audio session to playback was proposed and its effect was never confirmed. Enemy vocals were capped to the nearest 6 within 20-30 m and the mix to about 40 voices.
- **Applies when:** Every game with sound that runs on phones.
- **Verify:** On the real phone with the silent switch on and off: the probe reads a peak on the first shot, after locking and unlocking, and after switching apps and back; a person hears it.

### Phones have their own frame-rate floor, measured on the phone
- **Invariant:** The phone has a written floor and target, measured on the phone in menus, loading and combat, and it holds a steady rate rather than bouncing between two.
- **Technique:** Budget draw calls and per-enemy costs separately for phones, since phones are bound by draw calls and CPU sooner than by fill. If the phone cannot hold its target, cap at a lower rate it holds evenly. Measure on the device with an on-screen counter and Web Inspector, at the same tier players get. Target the phones most players own, not the oldest or smallest.
- **Reference configuration:** OC's targets on phones: at least 30 fps, aim 60, with Safari capping animation frames at 60. The owner measured 15-20 fps on his iPhone ("i dont want to cur quality / fidelity") and OC ended at 10-20 fps at R195. Target devices: iPhone 11 and 12, SE 2 and 3, and mid-range Android ("dont overfit to iphone 5se").
- **Applies when:** Every game played on phones.
- **Verify:** On the weakest target phone, record frame times through title, menus, a loading screen and a minute of the heaviest fight: the one-percent low holds the phone floor.

### No backdrop blur over the canvas on iPhone
- **Invariant:** On iPhone, menus and overlays over the game canvas use pre-blurred or darkened images rather than a live backdrop blur.
- **Technique:** Replace `backdrop-filter: blur()` over the canvas with a darkened frame, a blurred still captured once, or a solid panel. Keep CSS filters off full-screen layers above WebGL or WebGPU content on phones.
- **Reference configuration:** OC removed `backdrop-filter` blur over its WebGPU canvas on iPhone, on the suspicion that it cost memory. Nobody measured the memory cost; the cause was a guess.
- **Applies when:** Every game with DOM menus or HUD panels over the canvas on iOS.
- **Verify:** On the real phone, compare Web Inspector memory and frame time with the pause menu open and closed; the difference is small.

### Missing WebGPU gets a message or a fallback within a second
- **Invariant:** Before the large download, the game checks whether this browser can run it, and a device without the needed API gets a fallback renderer or a card that names the reason and what to do.
- **Technique:** Check `navigator.gpu`, then `requestAdapter()` (it can return null even when `navigator.gpu` exists) and the features and limits the game needs, then WebGL 2. Decide before fetching the world. If the game falls back, test the fallback path as a real build. Three.js: `WebGPURenderer` falls back to its WebGL 2 backend when WebGPU is missing (`forceWebGL: true` forces it for testing); check `renderer.backend.isWebGPUBackend` after `await renderer.init()`.
- **Reference configuration:** OC's capability gate ran in 310-626 ms and named the reason and the fix. Its "No WebGPU" card showed on 60 of 60 boots in testing.
- **Applies when:** Every game built for WebGPU, and every game needing WebGL 2 extensions.
- **Verify:** Boot with WebGPU unavailable (remove `navigator.gpu` in an init script, or a browser without it): the card or the fallback appears in under 1 s, before any large request in the network log.

### Touch layout is thumb-sized, landscape and install-aware
- **Invariant:** Every touch target is large enough for a thumb, the game plays in landscape with a clear prompt in portrait, and players are offered the installed web-app mode without being forced into it.
- **Technique:** Size targets in points against the safe area, place main actions in the thumb arc, and pause behind a rotate card in portrait. Detect installed mode with `matchMedia('(display-mode: standalone)')` and `navigator.standalone`; show a short per-platform guide to add the game to the home screen with a remembered "play in browser" choice. Declare `display: fullscreen` and `orientation: landscape` in the web app manifest. iOS Safari in a tab has no fullscreen API, no orientation lock and no vibration, so do not depend on them.
- **Reference configuration:** OC's touch targets are at least 44 pt; its title rows had measured 20-25 px, and some buttons 29 pt. Main buttons sit in the right 30% of the screen, with 12 buttons at most.
- **Applies when:** Every game with a touch layout.
- **Verify:** Screenshot every menu and the HUD at a phone landscape size (OC used 844 x 390) and measure each target; play a round on the phone with thumbs only.
