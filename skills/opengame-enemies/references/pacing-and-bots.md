# Pacing, attacks and bots

Reference configurations for "Pace in enemies met per minute", "Each enemy attacks on its
own clock" and "Bots read as players" in `SKILL.md`. LC is a wave-survival body-camera
shooter against the dead; OS a snipers-only free-for-all where every rival is a bot
presented as a person. Use the numbers as a start for a game of the same kind, then tune
on real runs.

## LC's tide

The director that decides who comes, when and from where.

- A level every 100 s. The live cap is 9 at the start, plus 0.6 a level, up to 32.
- Health 80 at level 1 and 100 at level 2, then +25 a level, then x1.06 a level. A head
  round from the starting pistol does 132, so early heads die to one shot.
- The first figure stands up at 2.5 s and then one every 4 s; first contact in 10 to
  15 s, in front of the player and out of the torch's light.
- No surge for the first 75 to 90 s, or until the first generator; a surge spreads over
  9 s; the ebb after it runs at two thirds of the rate.
- Runners from minute 2, a third of arrivals by 3:00, half by 5:00; a first sprinter
  alone at 3:30.
- Arrivals 16 to 36 m away by walking distance, out of sight, flanks and ahead weighted
  3:1 over behind, the empty side weighted 4x. At level 1 nobody strikes unseen from
  behind.
- Lull floor: nobody within 25 m for 8 s brings two up 12 to 34 m off.
- Stragglers: a figure 45 m behind for 4 s, or stuck for 3 s, is replaced and stops
  counting toward the cap.
- A hemmed-in ceiling: at most 3 attackers within 10 m.
- Spawn coverage: from every standpoint, spawns on at least three sides at a useful range
  in every door state (short of three sides: 9.7% of standpoints to 0.8%).

Targets measured on real runs: at least 8 met in minute one, 14 more in minute two, 20
more in minute three, no gap over 8 s. "Met" means first within 25 m and in view.

### Fear before speed

"Fear comes from the dark, the numbers closing and the cost of a mistake, not from being
struck all the time." LC's six seeded scares, none of which the player can bait:

1. A hush of 8 to 12 s, then six runners from two sides.
2. A surge on an empty reload.
3. The first sprinter, alone.
4. A dive out of the dark.
5. Lightning showing the tree line full.
6. A silent one behind the player while both hands are busy on a machine.

## LC's attacks

- Each figure in reach swings on its own clock: a 0.42 s wind-up, hit or miss decided by
  distance at the end of it, a 0.55 s recovery, about 1.1 s between one figure's swings.
  No shared gap, no turn-taking. A figure held back by the crowd within 1.75 m strikes
  from where it stands.
- 34 damage of 100 a blow, so three blows down (five with the armour perk); a dive does
  45. Health regenerates after 4 s unhurt and is whole in 1.2 s.
- The leap: a 0.62 s gather from 2.5 to 4.4 m away, a 0.44 to 0.75 s flight that tracks
  the first 34% toward where the player will be, never before 1:35 or within 38 s of the
  last, never two in the air. A landing radius of 0.9 m, smaller than a sidestep's travel
  in the flight time. A miss lands face down and is helpless for 1.5 s.
- The player's sprint (6.3 m/s) beats the fastest zombie (capped at 4.8) by a clear
  margin; a walk outruns only shamblers.

## Calibrate the test player first

LC's scripted players backed away at 2.3 m/s where a person aiming backs off at 1.33,
killed 25 to 30 a minute against a person's 13, and spaced blows 2.2 s against 2.62.
Numbers tuned on them made the game harmless for a person. Before tuning difficulty on
bots, replay a real run headless on its seed and require the bench to land within a
fifth of it, and test a player who just stands (`opengame-depth`).

## OS's bot motor model

What made rivals read as people in killcams and in the open.

- Reaction time from an ex-Gaussian distribution with a floor of 150 ms.
- Flicks that follow a minimum-jerk path timed by Fitts' law, undershoot, then correct.
- Aim error that drifts smoothly instead of being resampled each frame.
- Scoped shots 0.22 to 0.28 s after full zoom, with settle error after a fast scope-in
  (without it, rival quickscopes caused 26 of 37 of the owner's deaths). Modelled on the
  owner's own play: 41% of those shots came within 0.25 s of scoping; a hip flick, a
  0.42 s pause, then a 1 degree correction.
- Strafe only under 28 m, in committed legs; reload and work the bolt in cover; ignore
  distant shots briefly after a look (head whips 51 to 18); hunt high campers.
- Drawn facing trails the aim through a critically damped spring of 0.06 s, capped at
  0.6 rad; hits stay on the simulation.
- Scope choice by distance band: quickscope near, drag-scope middle, hardscope far.
- No one-frame head lock: in a killcam it "tells the player it was a bot".

### The behaviour count

Log per match, per bot slot: share of time creeping, one-frame yaw snaps, peeks, seconds
standing in the open during a fight, seconds to engage a camper, stuck and pacing spells.
Fix the worst three, and judge every change with a same-frame A/B split by slot in one
build: alternating 40 s windows on a loaded machine read -13% CPU where the truth was
+46% and 4.5x the stuck bots, against a noise floor of 20%.

### A lobby that feels online (OS)

Bots presented as people need a lobby that behaves like one.

- Arrivals on a lognormal spread; a lobby fills to exactly its cap only 70% of the time
  ("always exactly 32 looks scripted").
- 5 to 20% of bots leave during a match, with killfeed lines; about 80% stay for the next.
- Names from a generator in the style of real console handles, mostly lowercase, with
  digits or underscores in 10 to 15% of them, as the owner asked.
- An empty mic slot rather than fake talking.
- The match keeps running under the pause menu; a paused player can be killed.
- Bot powers rate-capped, for example a counter-radar at most once every 5 minutes for
  at most 30 s.
