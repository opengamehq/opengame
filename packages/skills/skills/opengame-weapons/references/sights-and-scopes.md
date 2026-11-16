# Sights and scopes

How OS and LC met "Aiming goes through a real sight picture" and "Scope-in registers
from the press" in `SKILL.md`. OS is a snipers-only shooter on a wasm engine with
WebGPU; LC is a body-camera shooter in three.js WebGPU. Their numbers worked there;
measure your own.

## One progress value

Field of view, weapon offset and look sensitivity all read one eased aim progress `p`
from 0 to 1. Separate curves read as the gun sliding "left to straight" while the view
zooms.

- Zoom starts on the press frame. OS: lens and hands share 220 ms in and 70 ms out.
- Ease the field of view in tan space, not in degrees, so the zoom rate looks even.
- Sensitivity follows the field of view: the look slows by the same ratio the picture
  narrows. LC narrows 1.35x for long arms and 1.6x for pistols.
- Fire from the rendered view on the press, never from where the camera will be once
  the ease finishes. OS's shots 100 to 200 ms into a scope-in had landed 2 to 2.7 degrees
  below the crosshair.
- Release is at least as fast as the press, and reversal mid-raise starts from the current
  `p`. The owner asked for aim-out as fast as aim-in; OS's 70 ms out is faster.

## Two optic classes (OS)

- **Full-screen scopes** hide the view model at a fixed `p` (OS: 0.5) and draw the scope
  image at the same radius the eyepiece had in the frame before the cut, so the aperture
  does not jump (it had jumped over 2x; after, about 5%). The glass fills about 80% of
  frame height (864 to 886 px at 1080p) and its markings draw even with the HUD hidden.
- **See-through optics** keep the real optic in the frame and zoom the world by
  `M = tan(play / 2) / tan(ads / 2)`, computed against the actual play lens (OS's
  3.71x became 4.00x once computed against the 66 degree lens rather than a nominal
  one). Cut camo glow from the sight picture (14 of 283 frames to 0), keep the map
  visible around the optic, and lock the reticle under recoil.

## Tune and judge at the range of use

At 4 to 10x a surface 40 m away reads as 4 to 10 m away, so a scope is judged where it
is used. OS tuned each map's scope field of view to frame a standing target at that
map's signature range (53 to 236 m) and captured scoped frames at 100 to 300 m; its
judges had scored scope shots taken 4 to 23 m from a wall for about 40 builds.

## What a scope must not cost

- A scope is a field-of-view change plus an overlay, never a second world render. OS:
  about 0.4 ms against a no-ADS control.
- Hold the render scale and render targets fixed across the cut. A resolution change at
  scope-in re-created 46 to 70 textures and 250 to 450 bind groups, seen only in a WebGPU
  call trace after the CPU profile showed nothing; the owner saw "a weird frame".
- Cast long rangefinder rays only while zoomed, in growing spans (OS: 32, 128, 512 m).
  A 1.2 km ray every frame had peaked at 123 ms; after, under 0.14 ms.

## Magnified artefacts

A scope magnifies whatever the hip view hid.

- Clamp glass sharpening to its neighbourhood (OS: 4,492 spike pixels to 698).
- Use hard shadows while scoped: soft penumbra "only resolves under TAA, which the
  scope's sway and narrow FOV prevent".
- Draw an open tube's back faces as a dark bore; they had caught the rim light (3,800
  cyan pixels).
- Scope tubes need 48 or more radial segments to read round (OC).
- A 2 to 3 px red dot was unreadable, and a 0.8 mm glowing torus bloomed into a
  seven-ring flower (OC): draw reticles in a shader.

## The sight line (LC)

- Publish per weapon: rear sight point, front sight point, bore axis, eye relief.
- Lens position = rear sight - bore direction x relief. The body follows the eye; the
  gun never moves to meet a fixed camera.
- Eye relief: handgun at real reach (43 cm), open sights 30 to 40 cm, apertures 6 to
  15 cm; 6 to 50 cm across LC's 73 weapons.
- The weapon comes square to the lens axis: rear sight within 1 mm of the axis, bore
  within 4 cm at 10 m. Each clip's rear sight, front post and the round at 25 m lie
  within 3 px of one line.
- Open sight notches (2.8 to 3.6 mm) and apertures (5 mm in an 11 mm ring) were cut by a
  tool on packed meshes in seconds, after generated guns arrived with solid sights.
- Keep the firing hand out of the picture on long guns: 69 of 73 guns lined up within
  4 px while 56 still showed the firing hand at 10 to 19 cm.
- Check what stands beside the notch, not only above its floor: a finger-over-the-sight
  check passed while the owner saw a finger cover the aim.
- LC focuses depth of field on the front post of open sights; the field of view narrows
  1.25 to 1.35x in its first version.

## Bolts and the scope

Never make the player release aim to cycle a bolt, reload or fire again. OS kept the
rifle on the eye through the bolt at the owner's call ("u shouldnt force people to zoom
out to pull the bolt"); LC's realistic hold works the bolt with the rifle off the eye
and brings it back while aim is held. An agent had added a forced unscope "as in" the
reference games, from memory: the owner's feel beats canon recalled from memory.

## Benches

- Real inputs at fixed delays after the press (0 to 250 ms) and fixed ranges (50 to
  200 m), counted per 12 shots. OS: 0 to 2 of 12 became 12 of 12 from 100 ms.
- A 120 fps strip of scope-in, fire, bolt and release, read frame by frame. A bench
  proves registration, not feel; the owner's hands judge the feel.
