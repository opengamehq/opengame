# Weapons in three.js

The engine-agnostic rules are in `SKILL.md`. This file is how to meet them in three.js.
Numbers are OC's unless another game is named.

## A separate view model scene and camera

Render the world, clear depth, then render the view model with its own camera. The view
model never clips into walls because the world's depth is gone when it draws, and its
lens does not follow the FOV slider.

```js
const viewScene = new THREE.Scene()
const viewCamera = new THREE.PerspectiveCamera(75, aspect, 0.012, 10) // fixed FOV, tiny near
renderer.autoClear = false

function frame() {
  renderer.clear()
  renderer.render(worldScene, worldCamera)   // world FOV from the slider, 65 to 110
  renderer.clearDepth()                      // the view model ignores world depth
  renderer.render(viewScene, viewCamera)
}
```

- Copy the world camera's rotation into the view camera each frame, before sway and kick
  are added to the gun, so shots still leave along the world camera's ray.
- On resize, update both cameras' `aspect` and call `updateProjectionMatrix()` on both.
  Only the world camera's `fov` follows the settings slider.
- Aiming changes the view camera's FOV with the gun's own aim time (OC: 75 to 58.5
  degrees), not the world FOV slider.
- Move the world camera's near plane out (DK used 0.15) once the view model has its own
  near plane; it buys depth precision for the world.

## Depth and post-processing

- Run depth-reading world passes (SSAO, depth of field, fog, motion blur) on the world
  scene only, then draw the view model. In `EffectComposer`, add a second `RenderPass`
  for `viewScene` with `clear = false` and `clearDepth = true`, after the world's
  depth-reading passes and before the output pass.
- Motion blur on the world with the gun sharp is OC's default. Keep the view model out
  of any velocity buffer.
- Do not let the view model cast shadows into the world. A third-person world model of
  the same gun casts them instead.
- Bloom runs after both, so clamp the view model's emissive (reticles, wonder glow)
  before tonemapping. A 0.8 mm glowing torus bloomed into a seven-ring flower; draw
  reticles in a shader instead.

## Light and environment for the view model

The view model gets its own environment and a small rig so it never goes black in a
backlit world.

```js
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
const pmrem = new THREE.PMREMGenerator(renderer)
viewScene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
viewScene.add(new THREE.HemisphereLight(0xdfe8ff, 0x302820, 0.6))
```

OC's studio environment gave 41% of the gun's mean brightness, and the two directional
lights about 3 luma. Clone materials per held gun (`material.clone()`) so a menu preview
or a camo swap never changes a shared material.

## Coverage masks for view model size

Render the view model alone to a small target with a flat override material and count
the lit pixels. Run it per gun at hip, aimed, sprinting and drawing, at 1280 x 720,
1920 x 1080 and 844 x 390.

```js
const target = new THREE.WebGLRenderTarget(w, h)
const flat = new THREE.MeshBasicMaterial({ color: 0xffffff })
viewScene.overrideMaterial = flat
renderer.setRenderTarget(target)
renderer.setClearColor(0x000000, 1)
renderer.clear()
renderer.render(viewScene, viewCamera)
renderer.setRenderTarget(null)
viewScene.overrideMaterial = null
const pixels = new Uint8Array(w * h * 4)
renderer.readRenderTargetPixels(target, 0, 0, w, h, pixels)
let lit = 0
for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 127) lit++
const share = lit / (w * h)   // OC hip: pistol ~0.06, SMG ~0.08, rifle ~0.09
```

The same mask with a central 20% x 20% box gives the aimed-view occlusion share (OC's
glove case went from 35.29% to 0.04%).

## Aim and sights

- Compute the aimed offset from the sight mesh, not a socket: take
  `sight.getWorldPosition(v)`, bring it into the view camera's space, and move the gun so
  that point lands on the camera's axis. OC's socket was 343 mm off the ring, 31 px.
- Build the gun's aim from yaw and pitch (an `Euler` in `'YXZ'` order) or `lookAt` with a
  fixed up vector. `Quaternion.setFromUnitVectors` takes the shortest arc and added 25 to
  30 degrees of roll.
- Ray-test each optic in CI: cast rays from the eye point through the lens area with a
  `Raycaster` against the gun's own meshes; any hit on a "transparent" lens is a defect
  (4 OC rifles blocked 385 of 385 rays).
- Draw the reticle in a fragment shader on the lens, visible only from the eye side,
  over dark tinted glass with a fresnel edge. Exclude housings from camo materials.
- Scope tubes need 48 or more radial segments to read round when aimed.

## Load hero models before they can be equipped

A gun is equippable only after its full model has loaded and its shaders have compiled.
Until then the previous gun stays in hand, and a purchase is refused with a message.

```js
const cache = new Map()   // url -> Promise<THREE.Object3D>
function loadGun(url) {
  if (!cache.has(url)) cache.set(url, (async () => {
    const gltf = await gltfLoader.loadAsync(url)
    const gun = gltf.scene
    gun.traverse(o => { if (o.isMesh) o.material = o.material.clone() })
    await renderer.compileAsync(gun, viewCamera, viewScene)
    return gun
  })())
  return cache.get(url)
}

async function equip(url) {
  const next = await loadGun(url)   // the old gun stays in hand while this resolves
  holster(current)
  draw(next)
  current = next
}
```

- Preload the guns the player can reach next: the loadout, the box pool, wall buys near
  the player, menu neighbours. OC prewarmed its visible roster of 8 guns, about 28 MB.
- Gate the buy prompt on `cache.get(url)` having resolved, so a wall gun never charges
  points for a model that is not there.
- Use KTX2 textures (`KTX2Loader`) and meshopt geometry (`MeshoptDecoder`) for hero guns,
  and upload textures early with `renderer.initTexture(texture)` so the first draw does
  not hitch.
- Never load a low level of detail as a placeholder. If nothing is resident, show a UI
  loading state.

## Reload beats in one table

```js
// Exported from the beat spec; animation and audio both read it.
const reloadRay = [
  { t: 0.00, beat: 'latch',        sound: 'ray_latch' },
  { t: 0.28, beat: 'chamber_open', sound: 'ray_open' },
  { t: 0.62, beat: 'cells_out',    sound: 'ray_cells_out' },
  // one row per fresh cell in, then snap shut and flicker on
]
```

Drive an `AnimationAction` and schedule each sound from the same row, with
`AudioContext.currentTime` plus the row's offset from the action's start. The times
above are an illustration of the format, not OC's values.

## Hand contact check

Offline, for each gun and reload phase, pose the arms with `AnimationMixer.setTime`,
read each hand vertex with `SkinnedMesh.getVertexPosition(i, v)` and transform it to
world space, then measure how far it sits inside the gun's mesh (a signed distance from
a BVH such as `three-mesh-bvh`). Flag every phase deeper than 8 mm.

## Other engines

- Unity (URP): a base camera for the world and an overlay camera in its camera stack for
  a weapon layer, with the overlay set to clear depth.
- Godot: render the weapon in a `SubViewport` with its own `Camera3D` and composite it
  over the main view, or give the weapon its own visual layer and a second camera.
