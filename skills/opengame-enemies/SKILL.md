---
name: opengame-enemies
description: Make enemies, hordes, teammates and bosses in a 3D browser game move and fight as designed. Covers a pursuit test that measures reach, jump links for player-built geometry, stuck recovery, no unreachable perches, navigation work budgeted per frame, a counter that matches the screen, teammate metrics, deaths per weapon, and a boss that lives and telegraphs. Use when the person says zombies get stuck, enemies stand around, allies are dumb, the counter is wrong, or the boss feels dead.
metadata:
  version: "1.0.0"
---

# Enemies, hordes and bosses

An enemy that stops moving breaks a game faster than anything else it can do. A zombie
pressed against a railing, a teammate frozen in the air or a horde counter that says 1
while a hundred spawn reads as broken within seconds. Most of these have three
causes. The navigation was built for a different body than the one walking it, the team
does not measure whether enemies arrive, and recovery is a guess.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes. OC is
OG Clash, a first-person wave shooter with a boss. Its owner's longest-running complaint
was stuck zombies and teammates: about 35 messages between 16 and 21 Oct ("NO ONE should
ever gut stuck"), open across 40 or more builds, and about 5 days to close.

Navigation settings that must match the body (step height, radius, slope) are in
`opengame-world-physics`. Wave sizes, round pacing and the boss goal are in
`opengame-depth`. Three.js libraries and calls for everything here are in
[references/threejs.md](references/threejs.md).

## Rules

### Measure reach, not motion
- **Invariant:** Every enemy type reaches the player from every place the player can stand, and the team has measured the reach rate in a test.
- **Technique:** Build a pursuit test. Place the player at a grid of spots that covers floors, roofs, ramps, player-built structures and water exits; spawn several enemies at the real spawn points; log for each one whether it arrives and how long it takes. Count an enemy as stalled when its distance to the player stops falling while it is still far away, so circling in place counts as a failure. Run it on every build that touches navigation, and run real rounds as well, because the test only covers the spots you give it.
- **Reference configuration:** OC's pursuit test used 34 spots and 4 zombies per spot; stalled meant under 0.25 m/s of progress for 3 s while more than 3 m away. Reach within 40 s rose from 55% to 84%, and stalls fell from 0.76 to 0.11 per enemy-minute (R157). Real rounds still had 30% of zombies not arriving within 30 s, and roofs at 14 and 17 m stayed 0 of 8.
- **Applies when:** Any game whose enemies or allies chase the player through 3D space.
- **Verify:** The pursuit report lists reach rate, median time and stalls per spot, and the worst spots are captured on video.

### Links for every move the agent can make
- **Invariant:** Every jump, drop, climb and gap an enemy's body can cross is in the navigation as a link the planner can use, including on geometry the player builds during play.
- **Technique:** Generate links from the agent's capability (jump height, jump distance, safe drop height) by scanning ledges and gaps in the collision geometry, then publish them into the navigation. Rebuild them when the player places, raises or destroys a structure. Each link stores its action (walk to takeoff, jump, land) so the agent plays the right motion. A body able to jump still needs the planner to route it to the takeoff point.
- **Reference configuration:** OC's agents wrote their own gap-link publisher, ballistic jump planner and stale-takeoff checks over about 18 builds (R116 to R134). In one live test "the player reached the roof, but the NPC jump link was never created". Zombies were found stuck behind a railing in a player-built tower. Dynamic jump links landed in R119.
- **Applies when:** Games with vertical levels, gaps, ledges or player-built geometry.
- **Verify:** Draw every link in a debug view. Build each player structure, stand on top, and run the pursuit test from there.

### Stuck enemies recover in escalating steps
- **Invariant:** An enemy that stops making progress always recovers, by steps that start small and end with a respawn the player cannot see.
- **Technique:** Watch progress toward the target, not movement. When it stalls, repath or climb first, then side-step, then respawn out of the player's sight, and as a last resort sink a body the player is watching. Recycle stranded enemies that have gained little ground over a long window, as long as they are out of view and not close to the player. Limit how often one enemy may repath.
- **Reference configuration:** OC's steps: repath or climb at 1.75 s, side-step at 3.25 s, respawn unseen at 5 s, sink if watched at 8 s (R183). Stranded recycle: under 1.5 m of gain in 35 s, out of view. Repath floor 0.5 s.
- **Applies when:** Every game with chasing AI.
- **Verify:** Trap enemies on purpose (behind a railing, in a corner, on a ledge) and log each recovery step firing at its time.

### No perch the enemies cannot reach
- **Invariant:** Every place the player can stand, enemies can reach or attack, unless the design marks it unreachable on purpose and moves the player off it.
- **Technique:** Find the islands in the navigation the player can reach and the enemies cannot. Either link them, spawn attackers at their foot, or make the spot slippery with a short hint so the player slides off. A slide must not damage or teleport the player.
- **Reference configuration:** OC's navigation had 129 islands, and glide-only roofs at 14 and 17 m were safe camping spots. Its fixes: a no-perch slide after about 2 s with a hint and no damage or teleport (R164), siege spawns at the foot when the player is 3 m or more up for 0.5 s, and a target of a hit within 8 s on any build.
- **Applies when:** Games with climbable geometry, player building or roofs.
- **Verify:** Stand on each high spot for 15 s with god mode on: the player is attacked or slides off on every one.

### Navigation work fits the frame
- **Invariant:** Navigation rebuilds and path requests never hitch the game, however much geometry changes or however many agents ask for paths.
- **Technique:** Rebuild navigation tiles across several frames with a per-frame budget and keep tiles small enough that one tile fits it. Model doors, gates and barricades as area costs or obstacles so opening one needs no rebuild. Do not rebuild for transient effects such as boss attacks. Spread path requests across frames with a queue, share results between agents headed to the same place, and use a spatial grid for separation instead of checking every pair.
- **Reference configuration:** OC's 4-piece player build dirtied about 111 tiles, caused 39 to 43 ms spikes and left new builds without a path for about 7 s. Throttling from 64 to 16 tiles a frame could not fix it alone, since one tile took about 40 ms. Another single collider change dirtied 104 tiles and gave 7 to 14 frames of 60 to 100 ms, and OC stopped rebuilding for smash attacks. OC's gates became infinite-cost areas with no rebuild. Ally pathing went from 18 calls to 1 (R140).
- **Applies when:** Games with dynamic geometry or more than a handful of agents.
- **Verify:** Place and destroy structures and trigger every boss attack in a horde round while logging frame time and navigation time per frame: no frame passes the budget.

### The counter matches the screen
- **Invariant:** The enemies-remaining number equals the enemies alive plus those still queued to spawn, every drawn enemy can be hit, and every hittable enemy is drawn.
- **Technique:** Keep one ledger that every spawn, death, despawn and respawn goes through, and drive the HUD from it. Keep each enemy's hit volume on its drawn body during leaps, climbs and recovery steps. Count a respawn as the same enemy.
- **Reference configuration:** Before OC's spawn accounting (R109) the owner saw "it says 1 remaining and ij ust had like a hundred spawn" and "says like 3 remaining but there are so many". "Ghost" zombies stayed visible and could not be shot. OC caps live zombies at 24 (`opengame-depth`).
- **Applies when:** Every game with a remaining-enemies count or a round end that waits for kills.
- **Verify:** Log the ledger and a count of drawn enemies every second through 10 rounds: they agree, and frames where a drawn body is far from its hit volume number zero.

### Teammates are measured like players
- **Invariant:** AI teammates follow, fight, revive and keep up with the player, and their success is measured on the routes they walked, with teleports counted separately.
- **Technique:** Track rejoin rate, time stuck, time frozen in the air, far revives and shots on the boss. Log every regroup teleport and report navigation-only success on its own. Give teammates formation slots beside or behind the player, keep them out of the player's view cone, cap their damage so enemies stay a threat, and credit each kill to one squad member.
- **Reference configuration:** OC measured 14.7% of teammate-seconds frozen in the air and 7 boss shots out of 322, and found that regroup teleports had inflated its teammate metrics. Earlier allies killing at 180 DPS within 6 m made zombies harmless; they now rescue only within 2.6 m. Teammates do rare flips every 30 to 60 s.
- **Applies when:** Games with AI squadmates, companions or bots in the player's team.
- **Verify:** A 10-minute run reports each metric with teleports excluded, against the previous build.

### The boss telegraphs every attack
- **Invariant:** Every boss attack is announced in time to answer it, and its warning travels at the speed of the real damage.
- **Technique:** A wind-up long enough to react, longer for attacks that down the player. Mark danger areas by their edge, a band and a progress wipe instead of a filled area that floods the view. Move a shockwave's visual and its damage front together. A dodge prompt names the verb. Weak points and the boss's goal are in `opengame-depth`. No boss action may hitch: prebuild its effects, death and results screens.
- **Reference configuration:** OC's wind-ups are at least 900 ms, and 2,500 ms for downing attacks. Dodge windows are 2.2 to 2.8 s. The shockwave travels at 20 m/s, matching its damage. A filled 10 m orange circle turned the whole view orange, so OC draws the rim, a glyph band and a wipe. The titan's death frame fell from 509 to 117 ms (R184).
- **Applies when:** Any boss or large enemy with readable attacks.
- **Verify:** Play each attack at 0.25 times speed beside its damage log: the warning and the damage line up.

### The boss is alive and moves with weight
- **Invariant:** The boss breathes, shifts and reacts on every screen it appears on, its feet stay planted, and its clips never slide it across the floor.
- **Technique:** Layer idle life (breathing, weight shifts, a roar or gesture) over every state, sleeping included. Add hysteresis to walk and turn decisions. Strip root motion from library clips and drive movement from the game. Fit menu and cinematic cameras from its live joints.
- **Reference configuration:** OC's titan breathes every 3 to 5.6 s, shifts weight about every 9 s and roars every 27 s. A hit-react clip with root motion slid it 27 m. The owner called it "jagged" and asked that it "move and live and breath and act like a real fucking titan", 3 or more times.
- **Applies when:** Bosses and large hero enemies.
- **Verify:** Watch 60 s of the boss on the title, in play and asleep: it moves the whole time, and its foot positions stay fixed while planted.

### Deaths match the weapon
- **Invariant:** Kill reactions follow the weapon fantasy: energy weapons drop bodies where they stand, shotguns and explosives throw them, and every death has weight.
- **Technique:** Pick a directional death clip from the hit, then hand over to physics with an impulse set per weapon class. Corpse settling, caps and deadlines are in `opengame-world-physics`.
- **Reference configuration:** OC's energy kills rise under 0.15 m and travel under 0.6 m; a point-blank shotgun throws 5 to 6 m/s with a sideways part; a pistol 1.7 m/s; explosives 4 to 5 m/s out and 3.5 to 4.5 up; directional death clips of 0.16 to 0.42 s come first. The owner: "ray guns hsouldnt make zombies fly", after agents had logged a "Ray Gun backflip" as a win.
- **Applies when:** Shooters and action games with physics deaths.
- **Verify:** Kill a row of enemies with each weapon class and measure rise and travel per body against the table.

### A horde reads as many individuals and keeps off the lens
- **Invariant:** A crowd of one enemy type looks like individuals, every type reads at fighting range, and no enemy fills the first-person view.
- **Technique:** Offset animation phase, playback rate, scale and heading per enemy. Keep enemy flesh lighter than the floor. Stop enemies short of the camera and push them back when they crowd it, fade anything that comes very close to the lens, and hide eye glows up close. Update far animations less often.
- **Reference configuration:** OC: phase offsets 0 to 1.6 s, rate within 15%, scale 0.92 to 1.08; each type readable at 15 m; 25 to 35 enemies in frame for a horde to read; full animation under 25 m, every second frame under 45 m. Enemies stop at 1.05 m and are pushed back to 0.6 m; anything within 0.65 m of the lens dithers to 30%; eye glows hide within 3 m; a 4 m keep-out ring surrounds machines. The owner said they looked "lifeless, like robots" before.
- **Applies when:** Games with crowds of enemies and a first-person or close camera.
- **Verify:** Let 24 enemies surround a still player and capture the frame: no two neighbours share a pose, and no enemy covers more than the agreed share of the view.
