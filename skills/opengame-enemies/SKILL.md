---
name: opengame-enemies
description: Make enemies, hordes, bots, teammates and bosses in a 3D browser game move and fight as designed. Covers reach tests, jump links, stuck and idle recovery, pacing in enemies met per minute, gaits at their own cadence, hit reactions without root motion, attacks on each enemy's own clock, rigs checked on their own skeletons, limp deaths, bots that read as players and a boss that telegraphs. Use when enemies get stuck, idle, slide or feel harmless, bots look robotic, or the boss feels dead.
metadata:
  version: "1.1.0"
---

# Enemies, hordes, bots and bosses

An enemy that stops moving breaks a game faster than anything else it can do. A zombie
pressed against a railing, a teammate frozen in the air or a horde counter that says 1
while a hundred spawn reads as broken within seconds. Most of these have three causes.
The navigation was built for a different body than the one walking it, the team does not
measure whether enemies arrive, and recovery is a guess.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes. OC is
OG Clash, a first-person wave shooter with a boss. Its owner's longest-running complaint
was stuck zombies and teammates: about 35 messages between 16 and 21 Oct ("NO ONE should
ever gut stuck"), open across 40 or more builds, and about 5 days to close. OS filled
every lobby with bots presented as people, and its stuck stat read 1.0 per bot-hour while
its owner watched bots stand in a spiral. LC's dead tore their meshes in every clip until
each figure got its own rig, and its first minute was survivable only because it had
almost no zombies in it.

Navigation settings that must match the body (step height, radius, slope) are in
`opengame-world-physics`. Wave sizes, the live cap, spawn placement, tuning on calibrated
test players and the boss goal are in `opengame-depth`; this skill measures what the
player meets and how each enemy moves and fights. Rig audits and joint limits are in `opengame-characters`. Three.js
libraries and calls for everything here are in [references/threejs.md](references/threejs.md),
and LC's pacing tables and OS's bot model are in
[references/pacing-and-bots.md](references/pacing-and-bots.md).

## Rules

### Measure reach, not motion
- **Invariant:** Every enemy type reaches the player from every place the player can stand, and the team has measured the reach rate in a test.
- **Technique:** Build a pursuit test. Place the player at a grid of spots that covers floors, roofs, ramps, player-built structures and water exits; spawn several enemies at the real spawn points; log for each one whether it arrives and how long it takes. Count an enemy as stalled when its distance to the player stops falling while it is still far away, so circling in place counts as a failure. Run it on every build that touches navigation, and run real rounds as well, because the test only covers the spots you give it.
- **Reference configuration:** OC's pursuit test used 34 spots and 4 zombies per spot; stalled meant under 0.25 m/s of progress for 3 s while more than 3 m away. Reach within 40 s rose from 55% to 84%, and stalls fell from 0.76 to 0.11 per enemy-minute (R157). Real rounds still had 30% of zombies not arriving within 30 s, and roofs at 14 and 17 m stayed 0 of 8.
- **Applies when:** Any game whose enemies or allies chase the player through 3D space.
- **Verify:** The pursuit report lists reach rate, median time and stalls per spot, and the worst spots are captured on video.

### Pace in enemies met per minute, and make early enemies weak, not few
- **Invariant:** A new player meets enemies within seconds and keeps meeting them wherever they stand, and survives the opening because early enemies die fast, not because they are absent.
- **Technique:** Measure "met per minute": an enemy counts as met when it is first close and in view. Give early enemies low health, so the starting weapon kills with a headshot. Bring arrivals in ahead of the player by walking distance, out of sight, from at least three sides, and replace stragglers left far behind. Keep a lull floor: when nobody has come near for a while, bring some up. Count from recorded real runs, not only simulation, minute by minute.
- **Reference configuration:** LC's director "made the opening survivable by starving it of zombies", and the owner: "also im 2 mins into game and only saw 2 zombies?... way too slow paced game play" and "zombies also always need to be spawning all around u wherever u go". Targets: first contact in 10 to 15 s; at least 8 met in minute one, 14 more in minute two and 20 more in minute three; no gap over 8 s. Health 80, then 100, at levels 1 and 2 (a head round does 132); the first figure up at 2.5 s; a cap of 9 plus 0.6 a level; arrivals 16 to 36 m off, flanks and ahead 3:1, the empty side weighted 4x; nobody within 25 m for 8 s brings two up 12 to 34 m off; a straggler 45 m behind for 4 s is replaced (the longest quiet went from 27 s to a 6 s median); standpoints with spawns on fewer than three sides fell from 9.7% to 0.8%. Minute one passed in real runs while minutes two and three failed, which only a per-minute count showed.
- **Applies when:** Wave, horde and arena games.
- **Verify:** Per minute of recorded real runs: enemies met within close range, the longest lull and the sides they came from; a spawn-coverage test from every standpoint in every door state.

### Links for every move the agent can make
- **Invariant:** Every jump, drop, climb and gap an enemy's body can cross is in the navigation as a link the planner can use, including on geometry the player builds during play, and every runtime solid is in the navigation too.
- **Technique:** Generate links from the agent's capability (jump height, jump distance, safe drop height) by scanning ledges and gaps in the collision geometry, then publish them into the navigation. Rebuild them when the player places, raises or destroys a structure. Each link stores its action (walk to takeoff, jump, land) so the agent plays the right motion. A body able to jump still needs the planner to route it to the takeoff point. Make the planner's climb equal the mover's step, audit for one-way sinks and loose link ends, and put gates, barriers and placed pieces into the navigation as obstacles.
- **Reference configuration:** OC's agents wrote their own gap-link publisher, ballistic jump planner and stale-takeoff checks over about 18 builds (R116 to R134). In one live test "the player reached the roof, but the NPC jump link was never created". Zombies were found stuck behind a railing in a player-built tower. Dynamic jump links landed in R119. OS's navigation allowed 0.9 m climbs against a 0.4 m step, and flagging gates as obstacles took stuck time from 165 to 4 s.
- **Applies when:** Games with vertical levels, gaps, ledges, gates or player-built geometry.
- **Verify:** Draw every link in a debug view. Build each player structure, stand on top, and run the pursuit test from there; list sinks and loose link ends per map.

### Stuck enemies recover in escalating steps, unseen by any camera
- **Invariant:** An enemy that stops making progress always recovers, by steps that start small; a relocation happens only where no camera, live or recorded, shows it, and a stuck body the player is watching is never teleported (it sinks, as a last resort).
- **Technique:** Watch progress toward the target, not movement. When it stalls, repath or climb first, then side-step, then relocate out of the player's sight, and as a last resort sink a body the player is watching. Recycle stranded enemies that have gained little ground over a long window, as long as they are out of view and not close to the player. Limit how often one enemy may repath. A relocation is unseen only if no player can see the spot and no killcam, replay or spectator view will show it later; in a game with replays, lean on the small steps and drop regroup teleports, because a replay shows the bot vanishing.
- **Reference configuration:** OC's steps: repath or climb at 1.75 s, side-step at 3.25 s, respawn unseen at 5 s, sink if watched at 8 s (R183). Stranded recycle: under 1.5 m of gain in 35 s, out of view. Repath floor 0.5 s. OS rerouted at 2.5 s and relocated unseen at 5 s, only when no human could see; its killcams made every bot watchable ("when i watch a killcam from a bot it should be as if its a real human playing on other side"), so out-of-sight regroup teleports were ruled out. LC's wire watchdog: under 0.5 m of progress in 2 s, go round, then to the nearest crossing, then back under; a figure stuck 3 s or 45 m behind stops counting toward the cap.
- **Applies when:** Every game with chasing AI. The relocation step applies only where no replay can show it.
- **Verify:** Trap enemies on purpose (behind a railing, in a corner, on a ledge) and log each recovery step firing at its time; in a game with replays, scrub every replay for a vanishing body.

### An enemy that does not want to move counts as stuck
- **Invariant:** No enemy or bot stands frozen, paces a small area or idles while it knows where the player is, on any map; every navigation region has an exit; and the player never sees a body vanish.
- **Technique:** Count pacing (inside a small radius, not fighting, not holding a chosen spot) and idling beside stuck, because a stuck stat that counts only agents trying to move misses the ones that gave up. Exempt chosen perches and holds, so a sniper still holds an angle. Hand each case to the recovery steps above. Check height off the ground with stuck, since a guard against one snag can leave bodies hovering. Test by forcing one agent's goal onto its own feet.
- **Reference configuration:** OS's stuck stat read 1.0 per bot-hour while the owner watched bots stand in a spiral, and two green sweeps missed two thirds of a lobby standing on spawn for up to 245 s ("bots often get stuck down here we cant have bots getting stuck anywhere"). Counting pacing took those spells from 303 to 0; the final bar, stuck under 3 s and pacing under 5 s on all 17 maps over 23 bot-hours, came with kills per bot-hour up from 109 to 149. A ledge guard turned one snag into a 35 s hover 0.64 m up, and the floater guard after it let eight bots hang 1.1 m up. LC's dead stopped for more than 3 s about 30 times a run while they knew where the player was, and its rule became that none of the dead ever stands idle while it knows where the player is.
- **Applies when:** Navmesh AI on authored maps: bots, hordes and companions.
- **Verify:** Force one bot's goal to its own feet: flagged within 5 s. A full-lobby run per map reports longest stuck, longest pacing, longest idle, height off the ground, sinks and loose link ends.

### No perch the enemies cannot reach
- **Invariant:** Every place the player can stand, enemies can reach or attack, unless the design marks it unreachable on purpose and moves the player off it.
- **Technique:** Find the islands in the navigation the player can reach and the enemies cannot. Either link them, spawn attackers at their foot, or make the spot slippery with a short hint so the player slides off. A slide must not damage or teleport the player. Bots in a shooter hunt a player who camps high instead of ignoring them.
- **Reference configuration:** OC's navigation had 129 islands, and glide-only roofs at 14 and 17 m were safe camping spots. Its fixes: a no-perch slide after about 2 s with a hint and no damage or teleport (R164), siege spawns at the foot when the player is 3 m or more up for 0.5 s, and a target of a hit within 8 s on any build. OS's tower camper drew "0 rival shots ... in 57 s" until bots hunted high campers, then was engaged in 7.5 to 19.3 s and killed in 26 to 50 s.
- **Applies when:** Games with climbable geometry, player building or roofs.
- **Verify:** Stand on each high spot for 15 s with god mode on: the player is attacked or slides off on every one.

### Navigation work fits the frame
- **Invariant:** Navigation rebuilds and path requests never hitch the game, however much geometry changes or however many agents ask for paths.
- **Technique:** Rebuild navigation tiles across several frames with a per-frame budget and keep tiles small enough that one tile fits it. Model doors, gates and barricades as area costs or obstacles so opening one needs no rebuild. Do not rebuild for transient effects such as boss attacks. Spread path requests across frames with a queue, share results between agents headed to the same place, and use a spatial grid for separation instead of checking every pair.
- **Reference configuration:** OC's 4-piece player build dirtied about 111 tiles, caused 39 to 43 ms spikes and left new builds without a path for about 7 s. Throttling from 64 to 16 tiles a frame could not fix it alone, since one tile took about 40 ms. Another single collider change dirtied 104 tiles and gave 7 to 14 frames of 60 to 100 ms, and OC stopped rebuilding for smash attacks. OC's gates became infinite-cost areas with no rebuild. Ally pathing went from 18 calls to 1 (R140). OS's bot thinking cost only 0.33 ms a frame; measure before blaming the AI.
- **Applies when:** Games with dynamic geometry or more than a handful of agents.
- **Verify:** Place and destroy structures and trigger every boss attack in a horde round while logging frame time and navigation time per frame: no frame passes the budget.

### A gait plays at its own cadence, steers along walls, and the player outruns the fastest enemy
- **Invariant:** No enemy's walk or run plays slow or fast to fit its speed, feet do not slide, no figure treads against a wall, every near figure is posed every frame, and the player's sprint beats the fastest enemy by a clear margin.
- **Technique:** Pick the clip by stride and play it within a narrow band around its capture rate. Change gait, or stand and reach, when the ground covered asks for it; never blend between gaits. Pose every frame within the near range and thin updates only far away. Steer toward a point a few cells ahead so headings turn smoothly; turn along a wall instead of into it, go round only where there is a step's room, brake behind a standing back, and hold waiting figures out of the player's sight rather than walking them in place. Start each loop at its own phase, and set the top enemy speed well under the player's sprint. Count jumps, spins and reversals per figure.
- **Reference configuration:** LC: a fix for zombies treading at walls let clips slow to 0.1x and made "slow mo" runners ("some of hte zombies running look like they are running in slow mo"); held to 0.9 to 1.15x, 133 figure-seconds a minute went to 0. Foot slide fell from 19.1 to 6.1 cm; frames with no new pose, 144 to 297 of 720, went to 0 ("zombies walking dont walk smoothly they like move very jaggedly"); heading change fell from 17 to 2.5 degrees a frame; "a lot of zombies like run / walk against the walls very badly" went from 402 to 52 to under 1 figure-second a minute of wall treading, after a "prowl" rule meant to keep waiters busy had walked them into walls at 134.5; jumps, spins and reversals from 63, 423 and 42 to 0, 2 and 0. Speeds, rules against played, in m/s: shamble 0.85/0.83, walk 1.5/1.47, run 3.4/3.41, sprint 5.3/5.18. The owner: "ur running speed needs to be fastest than the fastest zombie by a margin"; the player sprints 6.3 against a zombie cap of 4.8 ("5.6 against 5.4 is not a margin").
- **Applies when:** Every game with walking or running enemies.
- **Verify:** Figure-seconds outside the rate band, figure-seconds treading at walls and foot slide per frame, measured at uneven frame lengths, and a count of jumps, spins and reversals over 5 minutes.

### Hit reactions carry no root motion
- **Invariant:** A struck enemy reacts in place with its upper body and, if pushed, steps with its own feet; it never slides sideways and snaps back.
- **Technique:** Strip root motion from additive hit clips and apply them to the upper body only, from the waist to the hands. Make a stagger a step along the facing, using the figure's own gait played backwards, rate-limited. Turn only the shoulders for hits far off the facing, and drop the struck shoulder on frontal hits so the reaction reads from the player's camera. The flinch's timing is in `opengame-game-feel`.
- **Reference configuration:** LC's owner: "when u hit zombies or shoot them they move sideways and then slide/jerk back into other position which is still not right". Root motion inside the additive clips reached 84 cm; the hips' lateral travel per frame went from 70 to 5 cm. Staggers are 42 cm heavy, 24 for a leg hit and 12 to 32 light, at most one per 1.1 s; past 70 degrees off the facing only the shoulders turn. OC's titan slid 27 m on a hit-react clip with root motion (below).
- **Applies when:** Every game where enemies are shot or struck.
- **Verify:** Per-frame hip lateral travel through a burst of hits from the front, side and back.

### Each enemy attacks on its own clock, and danger is set in counted blows
- **Invariant:** Every enemy in reach attacks on its own readable clock, several can hit at once, damage is counted in blows to down, and no pacing device softens the danger to suit a scripted test player.
- **Technique:** Give each attack a wind-up long enough to read and each enemy its own timer, with no shared gap and no turn-taking; an enemy held back by the crowd strikes from where it stands. Tune the blow, not a health scale. Tune lethality only after the test player is calibrated to a person (`opengame-depth`).
- **Reference configuration:** LC's director had set a shared 5 s gap between blows and made zombies take turns, because scripted players kept dying; a scripted novice then stood at 45:00 in 11 of 12 runs, and the owner: "the zombeis take so long ot kill u? it shouldb e claibrated to cod when they hit u and multiple can hit u at once". It overcorrected to two blows, then "it should be 3 hits (without perks) to die not just 2": 34 of 100 a blow (five blows with armour, a dive 45), a 0.42 s wind-up, a 0.55 s recovery, about 1.1 s between one enemy's swings, regeneration after 4 s; blows a minute from three enemies went from 111 to 165, live 33 minutes after the note.
- **Applies when:** Melee enemies, hordes and wave survival.
- **Verify:** Count hurt events in the page (66, 32, down) and blows a minute among 1, 2, 3 and 5 enemies.

### Every figure is checked on its own rig, and the build cries out at a broken pose
- **Invariant:** No shipped enemy clip tears the mesh at any detail level, and no figure ever shows a bind pose, spread arms, a missing fall, a part flying off or an untextured body.
- **Technique:** Animate each figure on its own rig, not retargeted onto a shared one, and run the deformation audit in `opengame-characters` over every figure, clip and frame, leaving failing clips out. Add console errors in the build for a rest pose, arms held level, and a killed figure that does not start to fall. Film library motion from the side before trusting its name.
- **Reference configuration:** LC's owner: "the rigs of zombies cant be distorting/squishing as thy move" and "their heads cant just fly out either ... the way they move and then just go t pose when they die". On a shared skeleton 56 of 56 clips failed; on each figure's own rig 572 of 572 passed (torn means an edge over 3x or under 0.25x its rest length, and a clip fails above 1% of the surface). The build errors fire on a rest pose, both arms out at the sides for 0.2 s, or no fall within 0.25 s of a kill. Side-lens films showed library "falls" were stunt breakfalls that the audit passed, and long coats and capes failed on automatic rigs.
- **Applies when:** Generated, bought or auto-rigged enemies.
- **Verify:** The audit table and worst-frame sheets per figure, and side-lens films at a quarter speed.

### Deaths match the weapon, fall limp, and stay while seen
- **Invariant:** Kill reactions follow the weapon fantasy (energy weapons drop bodies where they stand, shotguns and explosives throw them), every death falls with weight and goes limp, nothing flies off, and no body vanishes in the player's view.
- **Technique:** Pick a directional death clip from the hit, then hand over to physics or a limp solve with an impulse set per weapon class. Keep bodies while the player can see them, and retire them out of view under the cap and deadlines in `opengame-world-physics`.
- **Reference configuration:** OC's energy kills rise under 0.15 m and travel under 0.6 m; a point-blank shotgun throws 5 to 6 m/s with a sideways part; a pistol 1.7 m/s; explosives 4 to 5 m/s out and 3.5 to 4.5 up; directional death clips of 0.16 to 0.42 s come first. The owner: "ray guns hsouldnt make zombies fly", after agents had logged a wonder weapon backflip as a win. LC's owner disliked how its dead "die and fall and disappear"; its deaths went limp by Verlet on 22 joints at 1/120 s, and bodies stay.
- **Applies when:** Shooters and action games with physics deaths.
- **Verify:** Kill a row of enemies with each weapon class and measure rise and travel per body against the table; film a kill and look back at the spot after a turn.

### Bots read as players, measured by a behaviour count and judged on film
- **Invariant:** Bots that stand in for people move with purpose, peek, use cover, strafe in committed legs, and aim, scope and miss like people; they never snap, spin, clump or stand in the open; they hunt a camping player; and they use the player's body, input path and senses only.
- **Technique:** Give bots the human input path (recoil, scope, bolt) and a motor model: reaction times with a floor, drawn from a skewed distribution; flicks that undershoot and correct; smooth drift instead of resampled error; tremor while scoped. Never buff their stats. Drive drawn facing with a damped spring capped against the aim. Log a behaviour count per match (creeping, one-frame snaps, peeks, time standing in the open, shots at campers), fix the worst three, and check each with a same-frame A/B split by slot rather than alternating time windows. A power-up changes what bots perceive, not only how the player looks. Judge the result on film.
- **Reference configuration:** OS: "not just walkign around like stiff robots". Early rivals were aimbots: 26 of 37 deaths were quickscopes. Reactions of 150 ms or more and scoped shots 0.22 to 0.28 s after full zoom; creeping fell from 16 to 17% to 7% by strafing only under 28 m; one-frame yaw snaps of 17 to 28 degrees went from 1.7% to 0.2% of frames with a 0.06 s spring capped at 0.6 rad; peeks rose from 1 to 34 a match, and open-fight stills fell from 192 to 3 to 7 s by reloading in cover. A windowed A/B read -13% CPU and shipped for three releases; a same-frame split showed +46% and 4.5x the stuck bots. Under active camo bots fired 0 rounds over 133 hidden sightlines. Bot powers were rate-capped ("at most once every 5 minutes for at most 30 seconds").
- **Applies when:** Bots standing in for human players, and any AI the player watches in a killcam or replay.
- **Verify:** The behaviour count before and after in one build, and a 10-minute match film judged against "push, flank, use cover, never stand still in the open, never spin, and never run into walls".

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

### The boss and every special attack telegraph, and a skill beats them
- **Invariant:** Every boss or special attack is announced in time to answer it, its warning travels at the speed of the real damage, and a skill the player has can beat it.
- **Technique:** A wind-up long enough to react, longer for attacks that down the player. Mark danger areas by their edge, a band and a progress wipe instead of a filled area that floods the view. Move a shockwave's visual and its damage front together. A dodge prompt names the verb. Size a lunge's landing radius under the distance a sidestep covers in its flight. Judge each attack from the player's lens as well as from beside. Weak points and the boss's goal are in `opengame-depth`. No boss action may hitch: prebuild its effects, death and results screens.
- **Reference configuration:** OC's wind-ups are at least 900 ms, and 2,500 ms for downing attacks. Dodge windows are 2.2 to 2.8 s. The shockwave travels at 20 m/s, matching its damage. A filled 10 m orange circle turned the whole view orange, so OC draws the rim, a glyph band and a wipe. The titan's death frame fell from 509 to 117 ms (R184). LC's leap gathers for 0.62 s from 2.5 to 4.4 m away, flies 0.44 to 0.75 s, never comes before 1:35 or within 38 s of the last, and lands within 0.9 m, because a strafe at 2.7 m/s covers 1.36 m in its half-second flight; it looked right from beside and went under the bottom of the picture from the lens.
- **Applies when:** Any boss, large enemy or special attack.
- **Verify:** Play each attack at 0.25 times speed beside its damage log: the warning and the damage line up. Sidestep each lunge from the lens: it misses.

### The boss is alive and moves with weight
- **Invariant:** The boss breathes, shifts and reacts on every screen it appears on, its feet stay planted, and its clips never slide it across the floor.
- **Technique:** Layer idle life (breathing, weight shifts, a roar or gesture) over every state, sleeping included. Add hysteresis to walk and turn decisions. Strip root motion from library clips and drive movement from the game. Fit menu and cinematic cameras from its live joints.
- **Reference configuration:** OC's titan breathes every 3 to 5.6 s, shifts weight about every 9 s and roars every 27 s. A hit-react clip with root motion slid it 27 m. The owner called it "jagged" and asked that it "move and live and breath and act like a real fucking titan", 3 or more times.
- **Applies when:** Bosses and large hero enemies.
- **Verify:** Watch 60 s of the boss on the title, in play and asleep: it moves the whole time, and its foot positions stay fixed while planted.

### A horde reads as many individuals and keeps off the lens
- **Invariant:** A crowd of one enemy type looks like individuals, every type reads at fighting range, and no enemy fills the first-person view.
- **Technique:** Offset animation phase, playback rate, scale and heading per enemy, vary stature, and pick repeats of one figure out of view with their own tint and stains. Keep enemy flesh lighter than the floor. Stop enemies short of the camera and push them back when they crowd it, fade anything that comes very close to the lens, and hide eye glows up close. Update far animations less often, but pose every near figure every frame.
- **Reference configuration:** OC: phase offsets 0 to 1.6 s, rate within 15%, scale 0.92 to 1.08; each type readable at 15 m; 25 to 35 enemies in frame for a horde to read; full animation under 25 m, every second frame under 45 m. Enemies stop at 1.05 m and are pushed back to 0.6 m; anything within 0.65 m of the lens dithers to 30%; eye glows hide within 3 m; a 4 m keep-out ring surrounds machines. The owner said they looked "lifeless, like robots" before. LC varied stature from 1.64 to 1.90 m after every zombie had stood exactly 1.80 m, drew 32 zombies in 0.50 ms with 162 draws through instanced skinning, and gave its dead a jaw driven by the voice and an amber eye shine (green read as one more pickup).
- **Applies when:** Games with crowds of enemies and a first-person or close camera.
- **Verify:** Let 24 enemies surround a still player and capture the frame: no two neighbours share a pose, and no enemy covers more than the agreed share of the view.
