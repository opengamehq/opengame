# Capture in three.js

Each section matches a rule in `SKILL.md`. API names were checked against three.js r185;
check the version the game pins before copying.

## Drive the clock yourself

Every system takes `dt` from one function. Nothing reads `performance.now()`, `Date.now()`
or a `THREE.Clock` on its own.

```js
const sim = { time: 0, scale: 1 }

function step(dt) {
  const scaled = dt * sim.scale
  sim.time += scaled
  physics.step(scaled)              // fixed internal step, sub-stepped, see below
  mixer.update(scaled)              // AnimationMixer takes the delta you give it
  effects.uniforms.uTime.value = sim.time
  cameraRig.update(scaled)          // smoothing reads the same delta
  audioDirector.update(sim.time)    // cues are logged in simulation time
}

if (!captureMode) {
  const timer = new THREE.Timer()   // core since recent releases; older ones ship three/addons/misc/Timer.js
  renderer.setAnimationLoop((now) => { timer.update(now); step(timer.getDelta()); renderer.render(scene, camera) })
} else {
  window.__capture = {
    ready,                          // the promise from "Ready means resident"
    async frame(dt) { step(dt); renderer.render(scene, camera); return readFrame() },
  }
}
```

- Slow motion is a smaller `dt` passed to `frame`, so a 1/240 step at 60 output fps is
  0.25x. Keep `sim.scale` for gameplay effects such as hitstop, and turn those off with the
  cinematic flag.
- Physics: Rapier's `world.timestep` and `world.step()`, or cannon-es `world.step(fixed, dt,
  maxSubSteps)`. Interpolate body transforms for render so a step smaller than the physics
  step does not hold a pose and then jump.
- Shaders: feed effects a time uniform you own. TSL's built-in `time` and `deltaTime` nodes
  follow the renderer's own frame timing, not your step.
- Seeds: replace `Math.random()` in game systems with a seeded generator per system,
  derived from one global seed. `THREE.MathUtils.seededRandom(seed)` exists for quick use;
  a small PRNG per system (mulberry32 or similar) keeps systems from consuming each other's
  numbers.
- Code you do not own: replace `performance.now`, `Date.now` and `requestAnimationFrame`
  with Playwright's `page.addInitScript` before the game loads, and prepend the same shim
  to every worker script. OC found that a page-level fake clock froze timers and that
  virtual time did not reach workers, so workers need their own shim.

## Cuts and temporal effects

- `TAARenderPass` (`three/addons/postprocessing/TAARenderPass.js`): set
  `accumulateIndex = -1` on a cut to restart accumulation.
- Other temporal passes (TRAA, SSR or SSAO history, temporal upscalers): clear the history
  render target on a cut. Read the pass's source to find it; there is no shared reset call.
- Velocity-based motion blur: on a cut, copy the current camera and object matrices into
  the previous-frame matrices so velocity is zero for that frame. Tie the shutter to the
  step: OC set blur strength to 60 times the step in seconds.
- Auto exposure: set the adapted luminance straight to the new shot's target.
- Clean feed: put world markers on their own layer and hide them with
  `camera.layers.disable(n)`. Give each DOM HUD element a `data-hud` name and hide by mask
  with a class on the root.

## Ready

```js
const ready = (async () => {
  await assetsLoaded                         // your loader's promise, or DefaultLoadingManager.onLoad
  for (const texture of allTextures) renderer.initTexture(texture)   // upload before the first frame
  await renderer.compileAsync(scene, camera) // pipelines and programs
  await soundBanksDecoded
  quality.lock()                             // no dynamic resolution while capturing
  return { build: BUILD_ID }
})()
```

With `WebGPURenderer`, `await renderer.init()` before any of this.

## Probe

After `scene.updateMatrixWorld()`, `bone.getWorldPosition(v)` gives the joint the skinning
used this frame. `v.clone().project(camera)` gives normalised device coordinates; map to
pixels with the drawing buffer size. Draw those points over the captured frame on day one.

## Reading frames

- WebGL: `new THREE.WebGLRenderer({ preserveDrawingBuffer: true })` keeps the last frame
  readable after the browser composites. It is set at context creation and can cost
  performance, so choose it at boot from the capture flag. Without it, read in the same task
  right after `renderer.render()`.
- WebGPU: `await renderer.readRenderTargetPixelsAsync(target, x, y, w, h)` from a render
  target, or build a `VideoFrame` from the canvas right after rendering. If you configure the
  canvas context yourself, add `GPUTextureUsage.COPY_SRC` to its usage; OC read its swapchain
  with `copyTextureToBuffer` and `mapAsync` in 30.4 ms at 4K.
- `canvas.captureStream(0)` with `track.requestFrame()` after each render feeds a
  `MediaRecorder`. Its timestamps are wall time, so use it for real-time previews only.
- Refuse a software rasteriser. WebGL: read `UNMASKED_RENDERER_WEBGL` through
  `WEBGL_debug_renderer_info` and stop on SwiftShader or llvmpipe. WebGPU: inspect
  `adapter.info`, including `isFallbackAdapter` where the browser reports it.
- Headless runs: Playwright with `viewport: { width: 3840, height: 2160 }` and
  `deviceScaleFactor: 1` for native 4K.

## Encoding with WebCodecs

```js
const config = {
  codec: 'hvc1.1.6.L153.B0', width: 3840, height: 2160,   // HEVC Main, level 5.1
  bitrate: 300_000_000, framerate: 60, hardwareAcceleration: 'prefer-hardware',
}
if (!(await VideoEncoder.isConfigSupported(config)).supported) throw new Error('encoder config not supported')
const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { throw e } })
encoder.configure(config)

// per stepped frame i
const frame = new VideoFrame(nv12, {
  format: 'NV12', codedWidth: 3840, codedHeight: 2160,
  timestamp: Math.round(i * 1e6 / 60), duration: Math.round(1e6 / 60),
  colorSpace: { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false },
})
encoder.encode(frame, { keyFrame: i % 120 === 0 })
frame.close()
while (encoder.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 0))
```

- `nv12` is a buffer you produce with a GPU pass that converts the rendered RGB to NV12 with
  the BT.709 matrix. A `VideoFrame` built straight from the canvas lets the encoder pick the
  matrix, and OC's came out tagged BT.601.
- Mux with a library such as Mediabunny. Timestamps come from the frame index, never from
  the clock, which is what makes a slow capture play back at full speed.
- Check the file with `ffprobe -show_streams`: size, rate, `color_space=bt709`,
  `color_transfer=bt709`, `color_primaries=bt709`.

## Audio

three.js audio runs on a real-time `AudioContext`, which cannot be stepped.

- 1x takes: connect the master gain to a `MediaStreamAudioDestinationNode` and record it, or
  tap it with an `AudioWorklet`, then trim the output latency against a sync cue.
- Stepped and slow-motion takes: keep the cue log (cue id, simulation time, gain, position
  relative to the camera) and render it afterwards in an `OfflineAudioContext`, which runs
  faster than real time and gives the same result every run. This is a suggestion for
  three.js; OC drained its own mixer's ring buffer instead, `sampleRate * step` samples per
  frame.
