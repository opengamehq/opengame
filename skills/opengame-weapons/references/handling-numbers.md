# Handling numbers from OC

Reference configurations from OC, a first-person wave shooter with a boss. Most were
taken from the CoD games it imitated, World at War and Black Ops above all. Use them as a
starting point for a game of the same kind, then tune with frame recordings.

## Recoil springs per class

| Class | Frequency | Damping ratio |
|---|---|---|
| SMG | 8.2 Hz | 0.62 |
| Assault rifle | 6.6 Hz | 0.58 |
| LMG | 4.6 Hz | 0.50 |
| Sniper | 3.4 Hz | 0.46 |
| Shotgun | 4.0 Hz | 0.48 |
| Pistol | 9.5 Hz | 0.66 |

Aimed: frequency x1.25, damping to 1.0 (critically damped), pitch x0.15, push x0.32.
Caps: position z 0.070, y 0.026, x 0.020; rotation x 0.30, y 0.10, z 0.16 rad. Each gun
scales its class between 0.55x and 1.8x. The first three shots follow a fixed pattern,
as in BO6.

## Spray

Rounds 1 to 3 go straight up. Rounds 4 to 10 follow the gun's own sway curve. From round
11 the pattern goes flatter (0.67x) and wider (1.3x). Random noise went from 35% to 20%.
OC's notes record the first shot at 25% horizontal and a 65% per-gun wander after it.

## Times

| Action | Time |
|---|---|
| Aim in, World at War | 0.245 s |
| Aim out, World at War | 0.25 s |
| Aim, pistol | 0.19 s |
| Aim, SMG | 0.21 to 0.28 s |
| Aim, assault rifle | 0.26 to 0.32 s |
| Aim, sniper | 0.34 to 0.46 s |
| Aim, LMG | 0.39 to 0.48 s |
| Swap raise and lower | 0.25 s |
| First draw from a machine | 0.8 s |
| Equip / holster / inspect | 0.35 s / 0.13 s / 3.0 s |
| Kick settles | 0.15 to 0.2 s inside a 330 ms cadence |

Aiming is a smoothstep, `3p^2 - 2p^3`, over exactly the gun's aim time, reversible
mid-raise. A flat 165 ms for every gun was the defect it replaced. Sprint pose blends in
at rate 7 and out at 14. Aimed kick is 30 to 40% of hip kick.

## Damage and fire rate

- Real fire rates: MG42 1,200 rpm, a revolver 120 rpm.
- Hit zones: head 2.0, chest 1.0, arm 0.9, leg 0.85.
- Audit time to kill per gun at rounds 1, 10, 20 and 30. Upgraded automatics kill a
  round-30 zombie in 0.65 to 1.0 s of headshots. One revolver had done 1,000 damage at
  625 rpm before the audit.

## Shots

- Muzzle flash 0.045 s sprite with a 0.055 s point light, from the muzzle socket, never
  the hand; two frames; a white-hot core, never an opaque cone.
- Shells eject from an ejection socket with gravity 11 and a 2.2 s life. On high fire
  rates OC dropped a casing every 6th round and capped simultaneous fire sounds at 2.
- Tracer pool of 28, cores at least 3.2 px with a 12 px glow.

## Assets

- Hero guns: about 24k triangles in first person (2048 base colour, 1024 metal and
  roughness, 2048 normal) and about 10k in the world (512), with named moving parts,
  `socket_*` empties and a manifest of pivots, reload travel and sight data.
- Wonder weapons: the same fidelity, 20 to 25k triangles, at or below the heaviest
  loadout gun.
- AO baked into the packed material, cavity 0.2 to 0.4; normals at least 1024 px.

# Handling numbers from OS

OS is a first-person, snipers-only free-for-all with bots. Its owner's bar was the
quickscoping of the reference games; these numbers met it in the owner's hands.

- Aim: lens and hands share 220 ms in and 70 ms out, zoom on the press frame. The
  quickscope bar was about 0.27 s where the reference data said 0.40 s, and no perk
  speeds aiming up.
- A swap is usable in the middle of a bolt cycle. Cancels run on elapsed time "so 20 fps
  and 144 fps decide a press the same way".
- Aim assist on pads only, fitted to the reference game's measured envelope rather than
  a research table (strafe slip 3.9 to 0.1 degrees).
- A per-frame camera trace took recoil overshoot from 16% to 3%.
- Rounds pass anything thinner than 0.6 m at -25% damage per wall, at most 2 walls (1 for
  bots) and two bodies; rock and terrain stop them. Bullets and bodies use separate
  collision categories, and what can be seen through can be shot through.
- Hit markers fire only on scored damage, from one damage event that the HUD never
  recomputes.
- Owner-locked: 7 to 10 rounds a magazine and infinite reserve; pickup by pressing, not
  holding.
- Sniper-only rules: a quickscope is a kill within 0.35 s of full zoom; a no-scope means
  no aiming in the last second; the multikill window is sized to the bolt cycle; scope
  glint shows only after 250 ms scoped, within 20 degrees of the victim's view and beyond
  25 m, a counter to camping.

# Handling numbers from LC

LC is a body-camera survival shooter with 73 weapons, a camera on the player's chest and
weight-driven recoil.

- Recoil from the weapon's mass: kick = 0.5 x impulse / kg^0.72 x brace x (1 - steady).
  View impulse per round: back 0.9 + 0.9 kick, pitch 5 + 9 kick, random roll 3 + 8 drift,
  scaled 1 / (0.6 + 0.35 kg), and x(1 - 0.45) on the sights.
- Brass: the slide goes back in 13 ms and home in 54, the case leaves 7 ms after the
  round and lands about 2 m right, with a sound per bounce. Brass is dull metal: three
  bright cases read as "three fat white cylinders glowing in a dark hall".
- Movement: walk 3.1 m/s, sprint 6.3 (7.0 with a perk), winded 4.3, crouch 1.55;
  acceleration 15 and deceleration 18 m/s^2; sights slow movement to 0.58x.
- Weapon data checked row by row against a published source: 26 rows corrected.
- Grenades and launchers were removed at the owner's word, with a test that fires every
  gun and fails on any blast.
