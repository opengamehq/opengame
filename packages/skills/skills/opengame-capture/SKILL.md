---
name: opengame-capture
description: Make a browser game filmable and screenshot-testable. Covers a host-stepped clock, one time scale, seeded takes, a director camera whose cuts reset history, a clean feed with HUD masks and mute flags, an awaitable ready state, acknowledged capture requests, a state probe, stepped audio, 4K60 readback from the render surface and hooks kept out of public builds. Use when the person wants a trailer, gameplay footage, slow motion, a photo mode or screenshot tests, or says takes do not repeat.
metadata:
  version: "1.0.0"
---

# Capture: a game you can film and test

OC's launch film is 62 s of 4K60 from 43 shots, cut from 401 kept takes. The game had no
capture mode, so the film team added every hook to a forked build while filming: a stepped
clock, a free camera, HUD masks, mute flags, a probe. Each hook was small. Finding out it
was needed cost a reshoot, and about 24 of the 47 hours went to restarts and usage limits on
top. The owner's brief: "i do NOT want to have to keep watching shitty takes and giving u
feedbaxk thqt u should be able to know ill give u based on those skills".

Build these into the game before anyone films it. The same hooks make screenshot tests
repeatable, which is most of what `opengame-verification` asks of a capture.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes. The
three.js way to do each is in [references/threejs.md](references/threejs.md); pipeline
numbers, the capability audit and process are in [references/pipeline.md](references/pipeline.md).

## Rules

### The host steps one clock
- **Invariant:** In capture mode the host advances the game by a fixed simulation step per output frame, every system reads that one clock, and no game code reads wall time.
- **Technique:** A capture mode where the host calls step, then render, then read back, and the game's own frame loop is off. Simulation, physics, animation, particles, weather, camera smoothing and audio all take their time from the step, and worker threads read the same clock. Slow motion is a smaller step, never frame interpolation. Gameplay never runs faster than real time; speed on screen comes from the camera.
- **Reference configuration:** OC's time came from `performance.now()` in a worker, and page-level tricks failed: a fake page clock froze timers and virtual time never reached the workers. A shim replaced `performance.now` and `requestAnimationFrame` in the worker and retried a frame when the GPU slot was busy; its first version took 48-64 min and the full rig about 2 h. Real-time 4K ran at 25-31 fps, so 1 s of 4K60 cost about 5.2 s of wall time. Stepped, the rig ran 28.1 fps first person and 37.2 fps on a dolly at 4K on an idle M4 Max, 2.1-3.5 s of wall time per output second. A step of 1/60 is 1x and 1/240 is 0.25x; 240 frames covered 1.000 s of simulation with 0 skipped. The montage reused the rig unchanged on a new build in about an hour.
- **Applies when:** Every game that will be filmed, screenshot-tested or compared frame by frame.
- **Verify:** Capture 240 frames at a 1/240 step: the probe's simulation time rises by exactly one step per frame and ends at 1 s. Repeat on a loaded machine and get the same frames.

### One time scale, and every timer obeys it
- **Invariant:** Every timer in the game (hitstop, shake, camera lerps, particles, physics, corpse settling, emitters, flashes, audio) runs on scaled simulation time, so an effect at quarter speed looks like the same effect slowed down.
- **Technique:** One time scale applied where the clock is read, never per system. Replace frame-count timers with time. Physics sub-steps or interpolates so a small step does not hold a pose and then jump. Motion blur takes its shutter from the step. A cinematic flag turns off hitstop and kill-cam time dilation. Review every effect at quarter speed before filming.
- **Reference configuration:** OC: a 45 ms kill hitstop became about 9 near-frozen frames at 0.3x, and a 70 ms hammer hold about 12 frames at 0.25x. Corpses solved at a fixed 60 Hz, so at 0.25x a pose held for 4 frames, then jumped. A gib trail emitted every third frame, and per-frame emitters ran 4 times denser. A game-only time scale left particles on presentation time at full speed. Motion blur reached a 360-degree shutter at 1/240 until its strength was set to 60 times the step in seconds (0.25 at 1/240). At 0.25x a light re-firing every 0.09 s strobed at 10 Hz, a blood sprite covered about 40% of the frame, and a bloom clipped to white. The frozen-flip defect was predicted in an audit, still reached the owner about 28 h later, and cost about 3 h and reshoots for a 6-line fix.
- **Applies when:** Games with slow motion, hitstop, or any effect timed by frames.
- **Verify:** Render each effect at 1x and at 0.25x and lay the frames side by side: the slow version has four times the frames of the same motion, with no holds, jumps or denser particles.

### One seed makes a take repeat
- **Invariant:** Two runs of the same take with the same seed, clock and scripted input produce the same frames.
- **Technique:** One global seed feeds every random source: weather, sky, lightning, voice picks, idle animation, spawns. Nothing seeds from wall time or the operating system in capture mode. A switch freezes ambient events. Script input against simulation frames, and record the seed in the take's spec.
- **Reference configuration:** OC: 0 of 240 frame signatures matched between two runs, because sky, lightning, boss idle and voice picks were seeded from wall time or OS randomness while camera and scripted input were exact. Workarounds: a voice seed set at least 2 s before the start under load, a forced lightning strike 3.3 s before a take to push the next one at least 14 s away, and 25 dev strikes to land the take's own strike on the boss's helm. Reshoots on a new build still kept identical kill frames (28 of 131), so the clock and scripted input were enough for reshoots.
- **Applies when:** Every game with randomness that will be filmed or screenshot-tested.
- **Verify:** Shoot the same take twice and hash every frame: all hashes match.

### The director's camera wins, and a cut resets history
- **Invariant:** A director camera overrides gameplay and cutscene cameras whenever it is set, and a cut gives a clean first frame with no trace of the previous shot.
- **Technique:** A camera override layer with position, look target, field of view, roll and near plane, and a cut call that resets temporal anti-aliasing history, motion blur and auto exposure. Call the same reset when a visible mesh swaps. Cutscenes accept an external camera and keep the simulation running. Under a free camera, draw the third-person body and world weapon while aim stays with the player.
- **Reference configuration:** OC's engine had a camera cut that nothing in the game called, so a hard jump smeared the whole frame through TAA. Crate weapons cycling every 0.06-0.32 s ghosted until each gun was held for at least 4 frames with a cut on each swap. The victory cinematic took the camera, deleted the zombies and hid the body, and the hook that let the film own the ending took about 5.5 h. With the cut, a first-to-third-person hand-off on the fastest swing frame became the "best cut in the film". Over-the-shoulder shots of the player were impossible because the 0.7 m head filled the frame.
- **Applies when:** Games with temporal effects (TAA, motion blur, auto exposure) or scripted cameras.
- **Verify:** Cut between two distant cameras and inspect the first frame after: no ghost of the previous shot. Swap a held item and step through it frame by frame.

### A clean feed, element by element
- **Invariant:** Each HUD element and each world-space gameplay marker can be hidden on its own, music and voice can each be muted, and a clean take keeps whatever feedback the shot asks for.
- **Technique:** A named flag for every interface element and world marker (hit markers, score pops, crosshair, plates, subtitles, set-piece UI, telegraphs, weak-point marks, rings) and a mask that picks which to draw. Tag world markers separately from art. One clean-feed switch sets the usual mask and mutes music and voice; prove the mute by loudness. Interface projected from the player's camera lines up only in first person, so hide it on other cameras. Dev overlays, page badges and cheat effects never reach the frame.
- **Reference configuration:** OC's owner asked to hide "the H UD except hitmarkers and like the points juice". A HUD mask (score pops, hit marker, crosshair, points plate) plus flags for subtitles and set-piece UI took about 3 min to build. The old hide flag also hid boss marks and the letterbox, subtitles ignored it, and the mask drew over it, so cinematics had to clear both. Cyan rings, a weak-point capsule, floor telegraphs, glyphs and strike circles read as HUD on film. On the montage, dev-funded score jumps from 1,039 to 49,550 showed on screen.
- **Applies when:** Every game with a HUD that will be filmed or used for marketing stills.
- **Verify:** A contact sheet of one frame with each flag on and off. On the clean feed, a reviewer marks every visible interface element; only the masked-in ones remain.

### Ready means resident
- **Invariant:** The game exposes one state the capture script can await that means every model, texture, pipeline and sound the scene needs is resident and the quality setting is locked, and a load failure reports itself instead of crashing.
- **Technique:** Count pending loads, compiles and decodes; resolve a promise or post a message when they reach zero after the scene is built and quality is fixed. Give each asset class a named failure and a timeout. In the unrecorded preroll, grant and show every item the take uses once, so late loads happen off camera. Lock quality: no dynamic resolution or automatic tier in capture mode.
- **Reference configuration:** OC had no such state. Under load, 55 boot crashes paired with a renderer assert on a missing material; about 40 takes hit it and 5 of 7 attempts at one shot were lost. Boot waits grew from 180 to 420 s, and takes were capped at 2-3 min with 2-5 retries. Late guns drew black for about 10 s ("give every gun once before shooting"), and sound banks stayed silent for 11-20 s. The renderer started on Low and calibrated, so dynamic resolution popped lights until quality was fixed after the title; the rig waited for the log line "renderer quality: fixed at ultra".
- **Applies when:** Every game that streams assets or calibrates quality.
- **Verify:** Await the state on a throttled connection and capture the next frame: every model is present and lit at final quality, and the first shot is audible. Block one asset: the state reports which one failed.

### Capture requests are addressed to frames and acknowledged one by one
- **Invariant:** Every screenshot request and director command names the simulation frame it applies to, and the game acknowledges each one with the frame it ran on, so the capture script never guesses when something happened.
- **Technique:** A request queue with an id and a target frame per request. The game runs it at that frame and replies with the id, the frame, the build id, the screen it was on and whether assets were loaded. The capture script sends the next request after the reply and treats a missing reply as a failure. Screenshots wait for the interface to settle. Document the limits: command size, deadlines, and what happens to a command sent before the scene exists.
- **Reference configuration:** OC: real-time stage commands 0.2 s apart landed in the same frame and were lost under load, so staging moved to an unrecorded preroll. A shutter command sent only on change swallowed the frame-0 command. Commands sent before the scene existed were dropped, a scripted run aborted 10 s after its last command, and a command buffer over about 7.9 KB crashed the engine on load. Frame-addressed injection landed 59 of 59 on the right frame. Checking that each capture shows the screen it claims is in `opengame-verification`.
- **Applies when:** Every game driven by a capture or test script.
- **Verify:** Send 100 screenshot requests in a burst: 100 replies arrive, each with its own frame and the expected screen. Kill the game mid-burst: the capture script fails the run.

### A state probe in render space, checked on day one
- **Invariant:** On request or every frame, the game reports where the camera, the player, each enemy's head and joints, bosses and objective states are, taken from the same snapshot that was rendered and in render space, and the report matches the picture.
- **Technique:** A probe flag that emits one record per frame from post-skinning transforms in the rendered snapshot. Name items and tables in the record; never make anyone map indices by hand. On the first day, project probe points into a rendered frame and check each lands on the drawn head, joint or item. Export the per-frame camera and joints if CG will be composited.
- **Reference configuration:** OC built `probe=1`, one JSON line of 2-4 KB per frame, because log lines were the only channel from game to host. It was wrong in ways that cost shots: the head bone sat 0.17-0.2 m below the visible head; titan joints were 10-13 m off the rendered model and never fixed; a documented overlook camera was inside a wall; a gun table was off by one, so one gun's slot gave another and 6 shots hit with the wrong gun. The per-frame camera and joint export matched Blender to 0.0003 px. No depth or object-ID matte existed, so a 3D logo could avoid characters but not pass behind them.
- **Applies when:** Games where a capture script aims, frames or checks shots from game state.
- **Verify:** Draw probe points over 20 captured frames: each lands on its drawn feature within a few pixels.

### Audio is captured at simulation rate, per bus
- **Invariant:** A take's sound comes from the simulation at the take's own rate, music, voice, effects and ambience are available as separate stems, and each bus can be muted from the launch URL.
- **Technique:** Mute and stem flags readable at launch. In capture mode, drain the mixer per output frame by exactly the samples one step covers, trim the output latency, and save a cue log with each cue's simulation time. Slow motion yields audio the length of simulated time, so the edit retimes or replaces it. Load every sound bank a take uses before recording.
- **Reference configuration:** OC: music and voice were baked into every take until music and voice mute flags existed, found when 12 of 22 voice lines overlapped. The rig drained `sampleRate * step` samples per frame and trimmed 4,095 samples (85 ms) of latency; 13 of 145 cues needed re-alignment in slow-motion takes. On the montage, settings-menu mute clicks never landed and all 9 segments were reshot (`opengame-audio` has the numbers). The film mastered at -13.8 LUFS and -1.6 dBTP against a -14 LUFS target.
- **Applies when:** Every game with sound that will be filmed.
- **Verify:** Capture the same shot at 1x and at 0.25x. At 1x each shot's sound lines up with its muzzle flash to within a frame. With music muted, the music stem measures silent.

### Every frame comes from the render surface
- **Invariant:** Delivered footage holds every frame at the delivery resolution and frame rate, read from the render surface with correct colour tags, however loaded the machine is.
- **Technique:** After each stepped frame, read back the render surface, convert colour on the GPU to the encoder's format and tag it, and encode with a hardware encoder through WebCodecs. Page screenshots and screencasts are for stills and debugging, never for motion. Render at native resolution with a device pixel ratio of 1, lock the quality preset, and stop the run if the browser fell back to a software rasteriser. Check output by counting unique frames and measuring colour, never by frame count alone.
- **Reference configuration:** OC: `page.screenshot` at 4K took 2,516 ms; a CDP screencast gave 12-19 fps, lossy; CPU x264 encoded 1.7-4.2 fps at 1080p. A swapchain copy with `copyTextureToBuffer` and `mapAsync` took 30.4 ms at 4K. WebCodecs tagged frames BT.601, so a GPU pass to NV12 BT.709 fixed it (Y 68.7 dB against ffmpeg, against 41.3 dB for BT.601). HEVC at 300 Mbps banded least on the storm sky (H.264 at 160 Mbps flattened 51% of blocks, HEVC 14.5%); the 4K master is 2.25 GB per output minute. Supersampling at dpr 1.5 cost 3.4x (11.0 against 37.2 fps) for no visible gain. Dropped frames were 0 regardless of load, because frames were stepped, not timed. Frame-count QA passed a 3,720-frame cut whose frames 1-402 were frozen.
- **Applies when:** Every game filmed for a trailer, montage or store page.
- **Verify:** `ffprobe` reports the expected size, rate and BT.709 tags; the count of unique frames equals the count of frames; one frame matches a direct readback of the same step.

### Capture hooks are off by default and absent from public builds
- **Invariant:** Capture hooks live in the shipping game's code, each off by default behind its own flag, change nothing while off, and are absent or locked in the public build.
- **Technique:** One flag per hook, listed in one file with what it does. A parity frame proves flags-off equals the release. Strip hooks at build time for the public build, or gate them behind a key whose secret is not in the bundle. Record the build hash and every flag a take used in the take's spec. Write each film fix as a flag the game can adopt.
- **Reference configuration:** OC added about 25-30 default-off hooks in a day, each diffable as a hooks list and a patch, versioned film builds by wasm hash with receipts, and proved parity with the release round on a frame. The fork had costs: the final film mixes selects from at least 5 builds and no single build reproduces it, and one take depended on environment variables nobody recorded. Production disabled dev URL switches with a dev key stored only as a SHA-256 hash. Film fixes flowed back: the film's lightning became the game default (flat-white share 10.47% to 0.58%).
- **Applies when:** Every game with capture or test hooks and a public build.
- **Verify:** Grep the public bundle for every hook name; open the public URL with each flag set and see no change; diff a flags-off frame from the capture build against the release.

## Other engines

Unity sets a fixed capture step with `Time.captureDeltaTime`, and its Recorder package
writes stepped frames. Godot 4 renders offline with `--write-movie <file>` and
`--fixed-fps <n>` on the command line. Both still need the time scale, seed, camera and
clean-feed rules above; the engine steps the clock, and every timer in the game has to read it.
