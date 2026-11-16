# Feel numbers from our games

Reference configurations, each from the game named. Use them as a starting point for a
game of the same kind and scale, then tune by feel with frame recordings.

## Muzzle flash and shots (DK, MC)

- A 45 to 58 ms HDR core, a few streaks, one wisp of smoke that builds into a haze under
  sustained fire, and a 55 ms point light from the light pool.
- Each shot adds 0.07 of exposure flash (a heavy shot 0.16), decaying at 7 per second.
- Pad rumble where a gamepad is connected: a shot (0.08, 0.22, 45 ms), damage taken
  (0.35, 0.15, 110 ms).

## Explosions, scaled by radius k (DK)

A 26k fireball, 22k bouncing embers, 20k smoke, a 16k ground ring, a 0.42 s light, and
trauma of 0.5k.

## Loot that lands (SR)

Items eject with a 0.085 s stagger on a 0.62 s ballistic arc at g = 14 with spin, settle
over 0.24 s, then hover at 0.34 m with a 0.055 m bob. Hover, spin and glow are
presentation only; the pickup position is where the item landed.

## Third-person camera (SR)

- Boom distance and shoulder offset from the character's height, not constants.
- Rotate the boom instantly on mouse input; ease only its length and obstruction with
  `1 - exp(-14 dt)`.
- Pull 0.15 to 0.22 m inside a collision hit; stay 0.4 m above terrain.
- Smooth stair steps with a separate offset clamped to 0.35 m either way, so the camera
  does not hop with every riser.

## Idle sway

Golden-ratio frequencies (1, 0.618, 0.382) so its loop is never seen, about 0.8 degrees
peak to peak (DK).

## Hit reactions on bodies (MC)

An additive layer of 0.34 s, `exp(-5p) * sin(2.2 pi p)` from the lower back to the head, signed by the
side that was hit. Directional deaths: dot the fatal shot against facing, plus or minus
0.35, and pick front, back, head or collapse.

## Callouts (MC)

Queued medals fade in over 0.22 s, hold 1.35 s, fade out over 0.45 s, stagger 0.55 s, at
most three visible.

## Hits on the player (OC)

- Severity per attacker type: 0.3, 0.5, 0.9 and 1.0 for OC's four zombie types, scaling
  every response below.
- Directional kick instead of random shake; 45 ms hitstop on heavy hits, 100 ms on the
  downing blow.
- Edge arcs 19 to 38 px at 1080p facing the attacker, fading over 0.7 to 0.9 s.
- Claws in the outer 18% of the screen, one per side, stacking to three, tearing in over
  90 ms and drying to brown over 1.5 to 2 s.
- Desaturation, vignette and heartbeat as health drops; the vignette stays in the outer
  0.15 of the width at 35% opacity or less.
- Reduced motion caps hitstop at 40 ms and disables the kick.
- Pass test: a heavy hit changes at least 6% of the screen by 25 or more levels within
  0.1 s.

## Confirmation (OC)

- Markers: 130 ms hit, 165 ms headshot, 240 ms kill, 500 ms headshot kill. Cyan X for a
  hit, off-white X for a kill. Hidden in camera views with no crosshair.
- Score pops merge per enemy within 0.15 to 0.25 s, in three rows 30 px apart.
- Enemy flinch: torso about 8 to 9 degrees, pelvis back 4 to 6 cm, peak within one frame,
  recovery about 150 ms; a stagger only above 35% of max health in one hit (50% on the
  heaviest type), 0.35 to 0.45 s with a 1.2 s cooldown, so big enemies never stun-lock.
- Blood: 24 droplets at 2 to 5 m/s, 5 cm streaks living 0.25 to 0.5 s, mist #5a1212.

## Third-person camera (OC)

- Over the shoulder 2.6 m back and 1.15 m right; wide 4.8 m back and 2.0 m right; aiming
  pulls to 2.2 m. Exactly three views, with the same aim key in all of them.
- Downed camera high: 3.0 m back, 3.1 m up, about 43 degrees down.
- Spring arm pulls in over 25 to 75 ms and holds the closest distance 0.3 s.
- Objects within 0.65 m of the lens dither-fade, reaching 30% at 0.3 m.
- Jitter metrics: camera position second difference, body screen pixels per frame (stop
  6.6 to 2.5 px after the fix), arm pops over 10 and 25 cm.

## First person on a chest camera (LC)

LC is a body-camera survival shooter: the lens sits on the player's breastbone, not at
the eyes, so the gun and hands sit lower and closer than in an eye-camera shooter. These
are its numbers after the owner's notes on jitter, sensitivity and jumps.

- **Placement.** The lens 0.10 m under the chest plate and 7 cm under the shoulder joints:
  1.30 m standing, 1.105 m crouch-walking, 0.895 m crouched, 9 cm proud of the plate. At
  the throat (1.42 m) the holds needed wrists at 73 to 91 degrees; at the sternum, 34 to
  55. The shoulders stand 0.22 m behind the lens, and reach is measured from there.
- **Looking down** bends the trunk at the hips and the lens rides it: height
  1.30 - (0.38 sin L - 0.09 (1 - cos L)). The look stops at 1.2 rad (1.05 moving, 0.9
  sprinting). The arms follow 0.07 of the look, so the pistol rises in the frame as the
  look goes down.
- **Composition.** The pistol at rest fills 4.5 to 5% of the picture's width, 18 cm from
  the lens, rear sight 70% of the way down, both gloves lit; arms enter from the lower
  right, the firing hand 5 cm right of the lens. Hip fire converges on the picture's
  middle at 8 m. Hold heights are set against the bottom edge computed from the live
  aspect.
- **Weapon steadiness.** The rig takes all of the lens's turn, breath and stride; the
  weapon's own stride is 3.5 x 4 mm (long arms 9 x 10) and its breath 0.5 mm. Designed
  motion: a turn trail of 0.028 rad per rad/s, at most 7.5 degrees; a 5 degree cant into
  a strafe; a 2 degree dip on stopping; a fifth of each on the sights.
- **Recoil.** kick = 0.5 x impulse / kg^0.72 x brace x (1 - steady); per round the view
  takes back 0.9 + 0.9 kick, pitch 5 + 9 kick and a random roll of 3 + 8 drift, scaled
  1 / (0.6 + 0.35 kg) and by (1 - 0.45) on the sights.
- **Blows taken.** A critically damped lurch stepped exactly: 4.14 degrees, settled by
  frame 11.
- **Jumps.** A 75 ms knee gather (the lens dips 4 cm), 3.53 m/s up under 10.4 m/s^2, a
  hang at the apex, a fall under 14.3 m/s^2: 59 cm high in 0.68 s (it had been 24 cm in
  0.33 s: "jumps feel very not aaa and very short height and too fast too"). A press in
  the last 0.1 s of a fall is buffered, there is no landing lockout, and stamina ends
  jump chains.
- **Landing** sinks the lens by impact speed: 8 cm standing, about 11 sprinting. A body
  push eases to 2.2 m/s; the old push threw the lens up to 1 m in one frame.
- **Movement.** Walk 3.1 m/s, sprint 6.3, winded 4.3, crouch 1.55; acceleration 15 and
  deceleration 18 m/s^2.
- **Mouse.** 0.0022 rad a count; 2,856 counts a full turn at 1.00x, 9.1 cm at 800 cpi,
  shown beside the slider with a live tester. The lens takes the look in the frame the
  input arrives.
- **Aim assist** (keys and pads only, default 0.6): 34 m reach, a 0.085 rad window, slow
  to 0.52, pull 0.42 rad/s, 2.6x for 0.22 s as the sights rise. It never turns a still
  view or aims through a wall; a mouse that moved in the last 3 s owns the device.
- **Sights.** The field of view narrows 1.35x for long arms and 1.6x for pistols, and
  the look slows by the same ratio. Eye relief per weapon is in `opengame-weapons`.

## Hit feedback in a rhythm game (OH)

- Every judged hit answers in its lane within a fifth of a second: a splat of 0.12 s,
  ticks of 0.15 s, flecks of 0.16 s and a lane-coloured halo of 0.1 s (a white ring read
  as generic).
- Hit sounds synthesised: band-pass noise at `2200 + 420 * lane` Hz for 35 ms plus a
  short sweep; a miss is a 130 to 62 Hz "dead string".
- The full-screen hit (ink 70 ms, flat 70 ms, wipe 120 ms, from the struck catcher) fires
  only through one tested gate: a run of 8, a milestone or the first second of the power
  mode, about once a phrase, at least 8 beats and 6 s apart.
- No hitstop and no camera shake. World motion lands on bars and four-bar phrases: a push
  of 2.5% (3% on a phrase line), in 0.25 s and out 1.35 s. More in `opengame-rhythm`.
