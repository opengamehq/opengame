# Integration sketches

Adapted from the Studio's character integration notes (ST), which were written from
World at War, Modern Claudefare, Skybreak and Der Koloss. Adjust bone names to the
actual skeleton; names such as `Hips` and `RightHand` are not universal.

## Cadence from real motion

```js
// World positions, dt > 0. Reset `previous` on spawn, teleport and resume.
const speed = Math.hypot(current.x - previous.x, current.z - previous.z) / dt
const rate = THREE.MathUtils.clamp(speed * clip.duration / strideMetres, minRate, maxRate)
walk.setEffectiveTimeScale(rate)   // strideMetres: measured full-cycle foot travel
previous.copy(current)
```

Use separate authored walk and run clips. A clamped rate cannot repair a wrong stride.

## Equipment on a bone, keeping its fitted pose

```js
function attachBone(THREE, bone, object) {
  for (let p = bone; p; p = p.parent) if (p === object) throw Error('Attachment cycle')
  bone.updateWorldMatrix(true, false)
  object.updateWorldMatrix(true, false)
  const det = bone.matrixWorld.determinant()
  if (!Number.isFinite(det) || det === 0) throw Error('Singular bone frame')
  const local = bone.matrixWorld.clone().invert().multiply(object.matrixWorld)
  bone.add(object)
  object.matrix.copy(local)
  object.matrixAutoUpdate = false   // keep the exact inverse; do not decompose shear
  object.matrixWorldNeedsUpdate = true
}
```

Call it once, at rest. Put the weapon under a pivot inside a carry group attached to the
chest, animate the pivot, and throw if the model has no grip markers:

```js
const grips = ['grip_right', 'grip_left'].map(name => weapon.getObjectByName(name))
if (grips.some(grip => !grip)) throw Error('Author both grip markers on the actual model')
```

## Order of operations each frame

```js
controller.step(dt)                 // collision-resolved root transform
selectGaitAndCadence(dt)            // from actual distance, keeping gait phase
mixer.update(dt)                    // the authored base pose for this frame
applyTorsoAimAndWeaponPose(dt)      // carry follows chest; aim and recoil on the pivot
actorRoot.updateMatrixWorld(true)
solveArmsToWeaponGrips(grips)       // two-bone chains; update matrices after each joint
orientWristsAndPoseFingers()        // grip shape, not just hand position
actorRoot.updateMatrixWorld(true)
```

Restore procedural bone overlays before the next mixer step if the clip does not write
those bones. Never accumulate IK or recoil into yesterday's pose: MC's spazzing head was
an additive layer that was not idempotent.

## Contact and rendering

- A bone's axis is not the sole of the shoe. Verify foot contact on the final skinned
  mesh against the ground, per motion phase.
- Base colour and emissive textures in sRGB; normal, roughness, metalness and occlusion
  linear. Texture factors must not erase their maps.
- Judge imported and procedural surfaces together under the game's own lighting, at the
  size they appear on screen.
- MC's floating corpse came from a ground-lock solver that could only push up. Test the
  death pose on slopes and stairs.

## Waist check at import (OC)

Pose each clip offline and compare the waist's width with the bind pose. OC passes 0.95
and treats anything under 0.90 as a visible pinch.

```js
// mesh: THREE.SkinnedMesh; waist: indices of vertices in a band at waist height
function waistWidth(mesh, waist) {
  const v = new THREE.Vector3()
  let min = Infinity, max = -Infinity
  for (const i of waist) {
    mesh.getVertexPosition(i, v)          // skinned position in the mesh's local space
    v.applyMatrix4(mesh.matrixWorld)
    min = Math.min(min, v.x); max = Math.max(max, v.x)
  }
  return max - min
}
mesh.skeleton.pose(); root.updateMatrixWorld(true)       // the bind pose
const bind = waistWidth(mesh, waist)
for (let t = 0; t < clip.duration; t += 1 / 30) {
  mixer.setTime(t)
  root.updateMatrixWorld(true)          // bones' world matrices drive getVertexPosition
  if (waistWidth(mesh, waist) / bind < 0.95) report(clip.name, t)
}
```

Run the same loop for depth as well as width; an hourglass can show in either. Also
report thigh weights on vertices above the hip and weights that cross from one leg to the
other.

## Gait choice from smoothed speed (OC)

```js
// Raw speed picked the clip in OC and the body jittered; about 80 ms of easing ended it.
const k = 1 / 0.08
smoothSpeed += (rawSpeed - smoothSpeed) * (1 - Math.exp(-k * dt))
const want = pickGait(smoothSpeed, current)   // thresholds with hysteresis around `current`
if (want !== current) {
  next = actions[want]
  next.reset().setEffectiveWeight(1).play()
  next.time = (actions[current].time / actions[current].getClip().duration) * next.getClip().duration
  actions[current].crossFadeTo(next, 0.2, false)
  current = want
}
```

Never write `action.weight = grounded ? 1 : 0`. Ease every such weight toward its target
with the same exponential.

## A customise pool that does not stutter (OC)

```js
// Parts are parsed ahead of time and kept hidden; a change swaps visibility.
const pool = new Map()                  // partId -> Object3D, parsed and compiled
const queue = []                        // parts to warm, nearest choices first
let quietFrames = 0

function onChoice(partId) {
  const part = pool.get(partId)
  if (part) show(part)                  // next frame
  else keepCurrentAndQueue(partId)      // the old complete figure stays on screen
  quietFrames = 20                      // OC paused warm imports 20 frames after a change
}

function tick() {                       // once per frame
  if (quietFrames > 0) { quietFrames--; return }
  const job = queue.shift()
  if (job) warmOne(job)                 // one part per frame: loadAsync, clone, compileAsync
}
```

Colours and eyes are uniforms over a baked mask, never a rebuild. Clone skinned parts with
`SkeletonUtils.clone` and bind them to the character's skeleton.
