# three.js on WebGPU: what costs a frame

What Last Contact (LC) measured while running three.js `WebGPURenderer` with TSL node
materials, plus what OS learned about Chrome's upload staging. Check each item against
the three.js version in your `package.json`: several are behaviours of one release, and
the version is named where it matters.

## Draws cost main-thread time, so count them

Each draw costs about 15-40 µs of main thread per pass in LC's measurements. At 120 fps
that allows about 150 draws in view across all passes. Turning shadows or rain off bought
LC nothing and halving the pixels took a pass only from 35.6 to 32.5 ms, so cut draws
before triangles or resolution. The draw counts and budgets are in `SKILL.md`.

## Graphs are keyed by node objects

- three.js keys a compiled pipeline by the node graph's object identity. Two materials
  built from new but identical nodes compile twice: 99 of LC's 237 graphs before the menu
  were repeats.
- Build graphs from the same node objects and read per-material values through
  `reference("material.userData.x")` (or uniforms set per material), so materials that
  differ only in values share one pipeline. LC's world went from 120 to 78 graphs.
- In LC's version, `InstancedMesh` put the mesh UUID into the graph key, so every
  instanced mesh compiled its own pipeline. A plain mesh with per-instance matrices read
  as attributes in `positionNode` shares one.
- A TSL graph cost LC 20-700 ms of main thread wherever it was built. Warm it before the
  menu, one unbuilt material per slice.
- Read the compiled WGSL when a material misbehaves. In LC, a `.toVar()` of a built-in
  first asked for inside one branch left the view direction zero in every other branch,
  and every lamp-lit plain weapon drew green.

## What `compileAsync` does not cover

- `renderer.compileAsync(scene, camera)` compiles for the pass that draws to the canvas.
  Passes into render targets (shadow maps, post, a scope view, a portrait) compile on
  their first real draw unless you warm them by drawing through them.
- three.js created a shadow depth texture on its first shadow draw (347 device errors in
  LC's log until shadows were warmed).
- Toggling a light's `visible` or `castShadow` rebuilds every lit material in view, because
  the light set is in the key. Keep a fixed light set from boot.
- Warm frames must not feed auto exposure: LC's warm frames blacked the title.
- Timestamp query pools overflowed under load in LC's runs. Treat missing GPU timings as
  missing, not as zero.

## Uniforms

- Put per-frame uniforms shared by many materials (camera, time, fog) in the render
  group, so they are written once a frame. LC's GPU buffer writes went from 1,211-1,240
  (248 KB) a frame to 115-138 (55 KB).
- In three.js 0.185.1 the uniform-group cache did not clear its "already added" set, so on
  a camera jump the view matrix was left out of the writes and 197 draws went through the
  previous frame's camera (a floating soldier, a frame of the player's own torso).
- Probe uniform writes at the GPU's door (wrap the device's write calls), not the page's
  copy: a probe of the page's copy read 0 lost writes of 28,452 while the GPU lost 220.
  "Keep a copy at the writer."

## The upload ring

- Chromium puts `writeTexture` and `writeBuffer` bytes into one per-page transfer ring. A
  call that needs more room than is free blocks the main thread
  (`RingBuffer::Alloc -> WaitForToken` in a trace) until the GPU process drains. On a GPU
  shared with a screen recorder or a second browser, the GPU process falls behind and every
  large write can stall a frame for hundreds of milliseconds.
- A buffer created with `mappedAtCreation: true`, filled, unmapped and copied with
  `copyBufferToTexture`, or `copyExternalImageToTexture` for an `ImageBitmap`, avoids the
  ring. LC's numbers are in `SKILL.md`.
- OS found Chrome keeping a staging region sized to any write over 4 MB for the life of
  the page, so split every upload into writes of 4 MB or less.
- three.js builds a geometry's GPU buffers on the frame that first draws it. A warm-up
  that draws every hidden mesh at once builds them all in one frame; trickle them.

## Pacing

- `device.queue.onSubmittedWorkDone()` resolves when the GPU has finished the work
  submitted so far. Called once per frame, it tells you when each frame landed, which is
  what [../helpers/landing-pacer.mjs](../helpers/landing-pacer.mjs) records. On WebGL 2,
  a `fenceSync` polled with `clientWaitSync` at zero timeout does the same job, but it is
  not the same instrument; compare like with like.
- Find the backend you got: `renderer.backend.isWebGPUBackend` after `await
  renderer.init()`. The WebGL 2 fallback must be booted in a gate (`opengame-stability`).

## Testing several pages on one GPU

Five headless browsers in one test job lost LC's WebGPU device ("A valid external Instance
reference no longer exists"); three at most held. Run a second GPU page on purpose when
measuring pacing, and never more than the GPU can hold when you are not.
