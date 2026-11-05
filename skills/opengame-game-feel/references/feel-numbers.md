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
