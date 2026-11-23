# Wiring it into an engine

The stroke pass is two full-screen fragment stages (`BRUSH_PAINT` then `BRUSH_PRINT` in
`helpers/brush-core.js`) written in plain GLSL ES 3.00, with no engine names in them.
An engine supplies four things. Everything else is uniforms, packed for you by
`BrushState.pack()`.

| The pass needs | What it is |
| --- | --- |
| The finished frame | the world as the player would see it, tone mapped and in display values, WITHOUT the HUD, with mips (or a blurred copy per level) |
| Anchors | per pixel: a position that moves with the surface (see `references/method.md`), a role, and how far away it is |
| The camera | the tangent of half the field of view (x and y) and the camera's rotation, for the sky |
| A place to draw | after the world and its own post effects, before the HUD |

A fifth thing is optional and worth having: a history, for `steady`. That is last
frame's painted picture and anchors, kept in a second pair of targets swapped each
frame, and last frame's view-projection matrix. Without one, set `steady` to 0 and lean
harder on the detail thresholds.

It has been run in three.js (WebGL2), and ported into a C and WebAssembly engine's own
final shader (OS): the two stages generated from `brush-core.js` into the engine's GLSL,
called after its tone curve and before its scope, reticle and HUD, with roles taken from
depth bands and the bodies the game already draws. The notes for Unity, Unreal and Godot
below are a porting plan, not a tested port: say so to the person, and check each step
on screen. Whatever the engine, finish with `helpers/brush-check.mjs` on captures.

## three.js

`helpers/brush-three.js` is the whole adapter.

- **No post pipeline:** replace `renderer.render(scene, camera)` with
  `brush.render(scene, camera, dt)`. The frame is captured exactly as it would have
  reached the canvas: three applies its tone curve and output transfer only when it
  believes it is drawing to the screen, and the adapter's capture target is flagged so
  that it does. A game whose colours were tuned on the canvas keeps them.
- **An EffectComposer or the pmndrs postprocessing library:** keep every pass. Add one
  last pass that calls `brush.renderAnchors(scene, camera)` and then
  `brush.paint(inputTexture, camera, dt)` with the pipeline's finished, display
  referred frame. If the pipeline ends in linear light, convert first.
- **A second camera** (a first-person weapon, a character viewer):
  `brush.renderAnchors(weaponScene, weaponCamera, { clear: false, figure: true })`
  after the world's anchors. Depth is cleared so it lands on top.
- **Roles:** `object.userData.brushRole` on the object or a parent, or the `role`
  option. Sprites, points, lines, additive and see-through materials are left out of
  the anchor pass by default, so they are painted as part of what is behind them:
  smoke and muzzle flash become dabs of their own colour on the wall. That is usually
  right. A see-through thing that must read as an object needs `brushRole` and an
  opaque anchor.
- **Materials that move vertices in their own shader** (wind, water, a custom skin)
  land in the anchor pass where the plain mesh is, not where the shader moves them.
  Small moves do not show. Large ones need the same displacement in the anchor
  material, or the `skip` role.
- **Needs** WebGL2 and float render targets (`EXT_color_buffer_float`).
- **A DOM HUD** is untouched. A HUD drawn into the canvas must be drawn after
  `brush.paint`.

## Unity (URP or HDRP), a plan

- **Where:** a full-screen renderer feature after post-processing and before the UI
  camera or overlay canvas.
- **The frame:** the camera colour after tone mapping. Blit it to a temporary texture
  with mips.
- **World anchors:** rebuild world position from the depth texture and the inverse
  view-projection matrix.
- **Figure anchors:** draw characters once more into the anchor target with an
  override shader that writes the mesh's rest position. A skinned renderer does not
  expose it to the shader after skinning, so bake the rest position into a spare
  vertex channel (a third UV set) at import, or draw with the unskinned mesh's
  positions read in the vertex stage.
- **Roles:** rendering layers or a stencil reference per role.
- **The shader:** paste the two stages into HLSL. `vec` types become `float` types,
  `mix` is `lerp`, `fract` is `frac`, `texture(...)` and `textureLod(...)` become
  `SAMPLE_TEXTURE2D` and `SAMPLE_TEXTURE2D_LOD`, `mat2` and `mat3` constructors take
  rows where GLSL takes columns, so check every one, and `atan(y, x)` is `atan2`.

## Unreal, a plan

- **Where:** a post process material at "After Tone Mapping" (so the HUD, drawn by
  UMG or Slate, is never in it), or a scene view extension for full control.
- **The frame:** `SceneTexture:PostProcessInput0`. There are no mips there: take the
  blurred levels from a down-sample chain you add, or sample a few taps instead.
- **World anchors:** the Absolute World Position node, which in a post process
  material is the pixel's position rebuilt from depth.
- **Figure anchors:** the material node "Pre-Skinned Local Position" gives a skinned
  mesh's rest position. Write it to a render target of your own from the characters, or
  start with a role in Custom Depth and Stencil and world anchors only.
- **Roles:** Custom Stencil values.
- **The shader:** the stages go into a Custom node or a global shader as HLSL, with
  the changes listed under Unity.

## Godot 4, a plan

- **Where:** a `CompositorEffect` after the scene is drawn, or a full-screen quad on a
  `CanvasLayer` under the HUD's layer reading the screen texture.
- **The frame:** the screen texture, with mips enabled on its filter.
- **World anchors:** the depth texture and `INV_VIEW_MATRIX` with the inverse
  projection.
- **Figure anchors:** Godot 4 poses a skinned mesh before its shader runs, so `VERTEX`
  is already posed. Bake the rest position into a custom vertex channel (`CUSTOM0`) at
  import and draw the characters into a second `SubViewport` with an override material
  that writes it. Check it by colouring a walking character with the value: the colours
  must ride on the body.
- **The shader:** Godot's shading language is close to GLSL ES 3.00. The stages need a
  `shader_type`, `uniform` hints and `SCREEN_UV` in place of the varying.

## WebGPU and engines of your own

- Port the two stages to WGSL by hand or through a translator, and check the
  translated matrices and texture coordinates on screen (WebGPU's texture origin is
  top left, and its depth runs 0 to 1).
- If the engine has a depth buffer and a camera, world anchors cost nothing extra. Mark
  the first-person weapon and characters with stencil so they get the figure role;
  until they have rest-pose anchors their strokes will swim as they move, so keep
  `figureClean` high and their stroke share low.

## 2D games

A 2D game's anchor is its world position on the plane: screen position plus the
camera's scroll, in screen heights. Give sprites that move the figure role with their
own local coordinates (the sprite's UV scaled to its size) so paint rides on them. Draw
the stroke pass on the world layer only, then the HUD.

## What not to do

Do not lay the pass over a finished frame that already has the HUD in it, and do not
run it on a game you cannot give roles and anchors. Without them the pass cannot tell
an enemy from the floor it stands on, and the result is a filter: see "What went wrong
first" in `references/method.md`.
