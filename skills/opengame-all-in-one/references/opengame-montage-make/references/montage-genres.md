# Montages in any genre

The OG Snipers montage was a sniper montage. This chapter translates its grammar to other genres. Read times, densities
and songs outside shooters are convention, not measurement: measure 3-5 edits of your genre before planning (the
measuring chapter has the recipes; retune cut detection for 2D or bright games). Real games, tools and editors named here
are references for how their communities cut montages; never recreate another studio's game, characters, logo or
footage.

## 1. Ten findings

1. **The grammar transfers; the unit does not.** In the sniping grammar the kill does three things: it is the event the
   beat lands on, the peak of the speed ramp, and the payoff the hold reveals. Every genre has an event that can do all
   three: a goal, a combo ender, an overtake, a pentakill, a riposte, a perfect run of notes, a block placed, a line
   cleared. Find that event first.
2. **Cut density is set by how long the event takes to read, not by the song.** A quickscope reads in about 0.9 s
   (FAINT: a kill per 0.95 s of first person, two beats apart at 135 BPM). A fighting-game combo needs 2-8 s, a teamfight
   4-12 s, a vehicle-sport aerial 2-4 s with its setup. A flat cut-per-beat montage of a slow-reading genre is the
   commonest amateur failure.
3. **Most genres already have the cinematic half built in: a replay system.** Halo Theater, League Director, Rocket
   League replays (with BakkesMod), CS demos (with HLAE), Fortnite Replay Mode, Valorant replays, EA FC's highlighter,
   Minecraft replay mods, Trackmania's MediaTracker, Slippi for Melee, BeatLeader replays for Beat Saber. Editors in those
   communities shoot the same moment twice: once as played, once from a free camera.
4. **Replay slow motion is usually interpolated, not simulated.** Most replay systems store state snapshots at a fixed
   rate (Unreal's demo recorder once defaulted to 10 Hz) and interpolate between them. At 0.1x that shows as gliding limbs
   and missing particles. Check a replay's slow motion on frames before planning ramps on it.
5. **Hitstop is the impact grammar in melee genres, and it breaks naive slow motion.** Fighting games freeze both
   characters for several frames on contact (Final Fight: 6). In a fighting game the hitstop is the impact the edit should
   keep: re-time it so at 0.25x it still reads as a stop and not a dead freeze. A no-hitstop hook is right for shooters
   and wrong as a default here.
6. **The fake-looking tell differs by genre, and it is always the part the game animates least.** Death animations and
   feet in shooters; rubber-band AI and wheels that do not turn in racing; a training stage and a dummy that never techs
   in fighting games; frozen minions in MOBAs; a boss stuck on an arena wall in a soulslike; blocks appearing with no hand
   in sandbox games; a robotic cursor in rhythm games; skating feet in sports games.
7. **Rhythm games invert the problem.** The gameplay is already synced to a song. If the owner's song is not the chart's
   song, the footage carries a second rhythm that fights the edit: chart the owner's song in the game (custom maps, if
   supported), or mute the game, cut only on shared downbeats and keep the playfield small or brief.
8. **2D and no-character games lose the third-person cinematic.** The replacement is a change of scale and time on the
   same plane: an integer zoom, slow motion on the event, parallax layers pulled apart, and the event's consequence (a
   cascade, a chain) as its "receiver's side".
9. **A montage for a store page or a feed opens on the money moment in the first 0-3 s,** with real gameplay on frame
   one and at least two cuts in the first five seconds. FAINT opens on 13.5 s of cinema, which works only for viewers who
   chose to watch.
10. **Amateur edits look the same in every genre:** an effect on every cut, shake longer than 2-3 frames, more than two
    or three kinds of transition, glow or colour split that hides the play, cuts on music peaks the gameplay does not hit,
    and padding with menus and loading screens.

## 2. What holds in every genre

1. **One song, one clock, picture cut to it.** FAINT runs one 135.0 BPM grid with no splice. Never re-edit the owner's
   song to fit footage.
2. **The event lands on the beat, slightly early:** the picture leads by 3-4 frames at 60 fps.
3. **Events sit on full beats, spaced by a beat multiple** (FAINT: 70 % of shot frames on a beat at the lead, two beats
   apart most often).
4. **One ramp shape, repeated:** glide at about 0.2 of peak motion, rise over 3-6 frames, peak through the event, fall
   over 4-8 (at 60 fps). Where the event cannot be slowed (a rhythm playfield, a tactical shot), the ramp moves to the
   approach and the reveal.
5. **Speed crosses the cut; stillness never meets stillness.** Incoming shots arrive at about twice the outgoing speed and
   settle in about 5 frames; only 3 of 68 FAINT seams are still on both sides.
6. **Every transition is caused by something in the picture:** a muzzle flash, a scope, a shard, a boot; in other genres a
   goal explosion, a super flash, a judgement burst, a block face, a portal, a ball filling the lens, a health bar
   emptying.
7. **Show it twice:** the played clip, then the same moment from outside (FAINT: 19 clip-tied cinematics, median 0.50 s).
8. **Sections drive content, not cut rate.** FAINT's verses are 77-94 % gameplay at nearly a kill a second; its choruses
   are twice as cinematic and carry the set pieces; the cut rate stays nearly flat (0.59-1.01 a second by section).
   Verse = play, chorus = spectacle.
9. **An intro of 8-17 % of runtime, then the first clip on a strong downbeat** (or a money moment in the first 1-3 s for
   stores and feeds).
10. **One breath, late:** FAINT has 5.2 s of calm after its densest 16 s. Every montage needs a held, slow passage before
    the last lift.
11. **End on a held, slow image:** every measured Kaiser edit does.
12. **Nothing stops:** no freeze frames in the body, almost no doubled frames (Kaiser 0.07-1.6 %).
13. **Effects are rationed and on the grid:** at most 28-46 flashes a minute, each within ±3 frames of a beat; no more
    than about 7 uses of any transition type except the whip; signature devices once each.
14. **One colour world, one hero.** In non-character genres the hero is the car, the deck, the build or a motif.
15. **Text is an object in the scene, one or two words, rare.**
16. **Effects never cover the event:** tint flashes start on the event frame, never before.

## 3. Money moment, camera, impact, density

| Genre | Money moment | Play camera and the "show it twice" device | Impact grammar | Read time, run length, k at 135 BPM |
|---|---|---|---|---|
| FPS or TPS arena, sniping | multi-kill, trick kill | first-person clip plus a third-person replay of the same kill from the victim's side or the bullet's line | the payoff cycle, a zoom punch, a flash | 0.5-1 s, 3-7 s, 2 |
| Battle royale | squad wipe, clutch, build fight | first person or over the shoulder, plus a drone replay (where the game has one) or a staged spectator | armour crack held 2-4 frames, a punch on the finish | 1-3 s, 4-10 s, 4 |
| Tactical shooter | ace, a clutch against several, a flick | first person plus a demo free camera | the shot frame at full speed; slow the pre-peek and the drop | 0.3-1 s (plus 2-5 s of context), 4-12 s, 2-4 |
| Racing | late overtake, near miss, drift chain, photo finish | chase, bumper, trackside, helicopter; a replay free camera | an inverted ramp; a field-of-view kick of 2-4 frames; no hitstop | 1.5-4 s, 2-6 s, 4-8 |
| Vehicle sport | aerial goal, flip reset, freestyle | ball cam plus a keyframed replay dolly | slow 4-10 frames at the touch, the explosion at full speed | 2-5 s, 3-8 s, 8 |
| Fighting | combo ender, a read, a comeback, a super | the fixed side view; replay zoom and pan | keep hitstop; the last hit on the beat; the ender's hitstop 2-4x; never slow mid-combo | 2-10 s, 3-12 s, 8-16 |
| Sports | decisive goal, skill move, dunk, buzzer-beater | broadcast and replay cameras | a velocity ramp to 10-20 % before the touch; one freeze per film at most | 2-5 s, 3-8 s, 8 |
| Platformer, speedrun | a skip, a frame-perfect trick, a record split | side or third-person chase, the game's zoom, a ghost split | slow the setup, the trick at full speed; shake off in capture | 1-4 s, 2-6 s, 4-8 |
| Character action | top style rank, perfect dodge, parry chain | third-person chase, free camera or photo mode | hitstop re-timed (a 70 ms hitstop on a raw-time timer is a 12-frame freeze at 0.25x) | 1-5 s, 2-6 s, 4-8 |
| MOBA | teamfight outplay, pentakill, steal | top-down plus a low orbit from a replay director | one ramp per fight, on the decisive spell | 4-12 s, 4-15 s, 16-32 |
| RTS, tactics | army trade, base break, saving split | top-down, observer, a low orbit | no hitstop; slow the clash; zoom from strategy to unit | 3-10 s, 3-10 s, 16 |
| RPG or soulslike boss | last hit, riposte, parry, a no-hit phase | third-person lock-on plus a free camera | the edit supplies impact: a punch and 2-4 frames of slow; a long hold on the death | 1-3 s per exchange, 3-10 s, 4-8 |
| Rhythm | a full combo through the hard section | the playfield; an avatar or third person; mixed reality | never slow the playfield; ramp only the cutaways | a phrase of 2-8 s, 4-15 s, phrase bounds |
| Sandbox, building | the build reveal, a contraption run, a PvP clutch | a keyframed free camera from a replay mod; timelapse | the timelapse is the ramp; the last block is the hit | 2-5 s, 2-8 s, 8 |
| Puzzle | the "aha", a cascade, a perfect clear | macro on the board, a slow orbit | slow the chain reaction; hold the solved state | 1-4 s, average shot 2.5-4.5 s, 8 |
| Mobile (ads, feeds) | the core verb in 0-3 s | device-native 9:16 | short ramps, one event per shot | 1-2 s, 1-3 s, 2-4; at least 2 cuts in the first 5 s |
| VR | a physical skill (a slice, a dodge, a no-look shot) | a smoothed spectator, an avatar in third person, mixed reality | slow motion only in engine or avatar views | 1-3 s, 3-8 s, 4 |
| 2D pixel, shoot-'em-up | a screen clear, a bomb, a boss break | the fixed view, an integer zoom, a parallax split | the game's own hit-pause and palette flash; sprites stay on their own drawings | 0.5-3 s, 2-6 s, 2-4 |
| No characters, abstract | the system event (a cascade, a collapse) | macro, orbit, top-down; a motif as the hero | slow the consequence, not the trigger | 1-4 s, average shot 2.5-4.5 s, 8 |

## 4. HUD to keep, fake tells to gate, hooks the game must expose

| Genre | HUD to keep (hide the rest) | Fake tells to gate | Hooks needed |
|---|---|---|---|
| FPS or TPS | hit marker, damage, multi-kill medals, a hero-only feed | death animations and legs, popping ragdolls, standing enemies, a dead-still scope, a floating first-person arm under a free camera | free camera with a history cut, the body switch, a stepped clock, bot staging, a probe, a HUD mask |
| Battle royale | elimination count, players left, the knock and finish feed | looting, healing, bots standing, distant pop-in, replay stutter after a patch | replay or spectator, time scale, a bot spawner, storm control |
| Tactical | round timer, the objective, alive counts, the feed | bots that never peek, a pre-aimed crosshair, low-tick demo glitches | demo or replay, a keyframed free camera, demo time scale, a per-element HUD |
| Racing | the position change, the last-lap banner, the gap on close finishes | wheels that do not turn, rubber-band AI, clipping cars, a looped engine, empty stands | replay free and trackside cameras, AI pace control, weather and time, time scale |
| Vehicle sport | score and clock on a last-second goal, boost on boost plays | free-play spawns, idle bots, default skins, a camera through the net | a replay free camera with keyframes, item swaps, time scale |
| Fighting | health bars, combo counter, damage, the KO banner (input display only in combo videos) | the training stage, a dummy that never techs, the same colour every clip, frame-doubled slow motion | replay or deterministic input, dummy recording, a hitstop multiplier, frame step |
| Sports | score bug and clock on decisive plays, the shot meter | defenders standing, repeating canned animations, foot sliding, a looping crowd | replay free cameras, AI marking control, match situation setup, a commentary mute |
| Platformer | timer and splits (speedrun), input display (tech) | savestate splices, tool-assisted input in a "human" piece, sub-pixel shimmer | deterministic input replay, savestates, shake off, zoom |
| Action | style meter, combo counter | enemies waiting in a ring, landing slides, a weapon through a body, quick-time prompts | a free camera, time scale, enemy staging, a hitstop multiplier |
| MOBA | champion health bars, the kill announcement, the hero's cooldowns | frozen minions, custom-game bots, a fog mismatch, stacked announcements | a replay API with a camera, a per-element HUD, champion lock, fog control |
| RTS | supply or army value when the swing is the story | units walking in place, idle AI, selection circles, a cursor in frame | an observer replay, a free camera below gameplay zoom, a per-element HUD |
| Soulslike | the boss health bar, the felled banner | the boss stuck on geometry, a camera clipping walls, cheese tactics, a lock-on snap | a free camera and time scale, a save before the boss, repeatable AI |
| Rhythm | combo, accuracy, judgements; a human cursor | autoplay cursor curves, playfield frame drops, uncorrected mixed-reality latency | replay files, an offline renderer, a chart editor that takes outside audio |
| Sandbox | none for builds; hotbar and health in PvP | blocks with no hand swing, chunk pop-in, creative flying, T-posing mobs | a replay mod, a locked render distance and shaders, time and weather |
| Puzzle | a move counter or timer when it makes the point | instant solutions, a straight-line cursor, off-camera undos | seeds or level select, input replay, a clean high-resolution board |
| Mobile | the reward pop | gameplay that is not in the game, fake fail bait, touch ripples, upscales | a desktop or editor build with the mobile content, seeds |
| VR | per genre | head jitter, floating hands, wrong elbow IK, mixed-reality latency | a smoothed spectator, an avatar for third person, input recording |
| 2D pixel | the score multiplier, boss health | sub-pixel shimmer, non-integer scale, zooms done in the edit, motion blur on pixels | native-resolution capture with an integer upscale, seeded patterns, pixel-grid time scale |
| No characters | a counter only if it climbs on the beat | float jitter at macro scale, z-fighting, aliasing on thin lines | seeds, time scale, a free camera |

## 5. Spacing by tempo and read time

A beat lasts 60 / BPM seconds. Choose the smallest k of 1, 2, 4, 8, 16 or 32 beats with k × beat at least the event's
read time (about 2 % slack). That k is the spacing between events. Cuts come every 1-2 events inside a run, with
half-beat flurries only in fills.

| BPM | Beat (s) | k for a 0.9 s read (a kill) | k for 2 s (a pass, an aerial) | k for 4 s (a combo) | k for 8 s (a teamfight) |
|---|---|---|---|---|---|
| 70 (half-time feel of 140) | 0.857 | 2 (1.71 s) | 4 (3.43 s) | 8 (6.86 s) | 16 (13.7 s) |
| 90 | 0.667 | 2 (1.33 s) | 4 (2.67 s) | 8 (5.33 s) | 16 |
| 120 | 0.500 | 2 (1.0 s) | 4 (2.0 s) | 8 (4.0 s) | 16 |
| 135 (FAINT) | 0.444 | 2 (0.89 s) | 8 (3.56 s), or 4 (1.78 s) if it reads | 16 (7.1 s), or 8 (3.56 s) if it reads | 32 (14.2 s) |
| 150 | 0.400 | 4 (1.6 s), or 2 (0.8 s) for snaps | 8 (3.2 s) | 16 (6.4 s) | 32 |
| 174 (drum and bass) | 0.345 | 4 (1.38 s) | 8 (2.76 s) | 16 (5.52 s) | 32 |

A slow-reading genre at a fast tempo puts its events on 8 or 16 beats and fills the space with motion peaks (FAINT has
1.84 flow peaks a second of whips and flicks between its kills). That keeps the beat lock without cutting faster than the
play reads.

**Song genres:** a half-time feel (trap, drill, phonk) puts money events on the snare (beat 3) and motion peaks on the
kicks. Drum and bass is too fast for an event a beat: treat it as 85-87 BPM for events and use the breakbeat for whips.
Orchestral and ambient tracks have few transients: cut on phrases and hit points, not a grid. Loop-based tracks with no
sections (phonk is often 4-8 bar loops; the OG Snipers track was flat) need the edit and the mix to make the sections.

## 6. The day-one decision tree for an unknown game

```
0. The song (first hour, in parallel with step 1)
   Measure it: tempo and drift, bar 1, sections, holes, the loudest moment, key, whether it has an ending or a drop.
   - a flat loop with no sections -> plan the sections in the edit; design the breath
   - drum and bass, very fast      -> half time for events
   - no transients (ambient)       -> cut on phrases, not a grid
   - lyrics                        -> one or two words in the world at most
   - a rhythm game, song not in it -> chart it, or mute and align downbeats
1. The game (first hour)
   Write the game bible. Name the genre from the table above.
   Find the money event: what does the game score, announce or put a banner on? That is the "kill".
   Name its read time in seconds and its fake tell.
2. Capture tier (the capture chapter)
   source -> A; deterministic input replay -> B; a replay with a free camera -> C;
   a replay or photo mode only -> D; live play only -> E; no real GPU -> F, stop and report.
   Run a 20-minute probe of the chosen route and look at frames: replay fidelity, slow-motion quality,
   HUD toggles, debug overlays.
3. Who plays
   Real human footage exists (the owner, players, streams) -> mine it (tiers C, E) or record their input (B).
   No human footage -> scripted input with bot-tell checks against a recorded good human of this genre.
   Is the skill visible and real? "make sure its good gameplay not like a noob".
4. The grid: k from the table above; events on full beats, the picture 3-4 frames early at 60 fps;
   verse = play, chorus = spectacle.
5. References (first two hours): 3-5 edits from the genre's own edit culture, plus a golden reference edit for
   the grammar; measure them; rewrite the labelling rubric's shot types for the genre.
6. Audit before planning: animations and effects on frames, plus the genre's fake tell. NOT REPRODUCED is not plannable.
7. The plan: money moments ranked; one signature moment; the show-it-twice device at this tier; an intro of 8-17 %
   (or a money moment in 0-3 s for store and feed cuts); one breath late; end on a held slow image; one colour
   world and one hero (or motif); the HUD that carries the stakes.
8. Gates for this genre: payoffs on the beat (FAINT: 70 % within a frame at the lead); the genre's fake tell,
   measured (wheel rotation against speed, a dummy that never techs, cursor curvature against a human, a boss on
   geometry, a block placed with no swing); the hero in frame; every promised word visible on the render; no
   event cut before its read time has passed.
```

**Answer these from the repo without asking:** the money moment (from score events, announcer lines, medals,
achievements, store copy); whether a replay system exists (search the source for replay, demo, theater, spectate,
record, ghost, and the engine's replay classes); whether play is deterministic (rollback, lockstep or ghost features
need it; seeded random numbers and fixed timesteps; then prove it with a per-frame state hash); whether the game has
hitstop (search for hitstop, hitlag, freeze, hit pause, a time scale on hit); which HUD element carries the stakes (the
one the game animates on the money moment).

**When to say no, or say the limit:** no GPU, stop. Tier E with no second angle cannot reach FAINT's 37 % cinematic
share: say so at plan time and aim the bar at the gameplay half. A rhythm game whose song cannot be swapped and does not
match the owner's tempo within a few percent: offer charting the song, or a montage built only from cutaways. A genre
whose event reads in more than about 8 s at the song's tempo: offer a different song, or a shorter cut of fewer, longer
events.
