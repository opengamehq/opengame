# Studying the reference edit: the golden edit, its finishing layer, and a good player

The owner usually gives one reference edit ("edit it like this") and treats it as the bar: 10/10 by definition. Measure
it before planning, as a study a judge can score against. The worked example is the OG Snipers study of Kaiser's FaZe
sniping edit "FAINT" (95.24 s, 2,858 frames at 1080p30, 4 Mbps). Download it privately for measurement only; never cut
it into your film, play it aloud, or recreate its game, characters, logo or footage.

**Units.** Its frame numbers and frame counts are at 30 fps: double them for a 60 fps timeline. Its speeds in px/f and
its angles per frame are per 30 fps frame at 1080p: halve them for a 60 fps timeline (FAINT's incoming seams at a median
27 px/f are about 13.5 px/f at 60 fps).

## 1. The shape of a reference study

Write `research/REF-STUDY.md` with these sections, every number measured from the file (the measuring chapter) or
marked "by eye":

- **A. Identity:** the file, its length, rate, bitrate; its structure by song section.
- **B. A shot log:** every shot with frames, type (first-person gameplay, a cinematic tied to a clip, a free cinematic,
  title or text), what happens, and the transition in.
- **C. Measured statistics:** cuts and shot lengths; the screen-time split; the gameplay clips; sync to the music; speed
  ramps; grade; letterbox; sound.
- **D. The cinematics in detail:** the cold open; the cinematics that replay or extend a clip; the free ones.
- **E. A transitions catalogue:** every kind, its count, its frames, what in the picture causes it.
- **F. Text and titles.**
- **G. Flow and aura as rules with numbers.**
- **H. A rubric for the judges,** 0-10 per dimension, with what 10, 7 and 5 look like in this file.
- **I. A steal list:** 20-30 techniques with frames and how to reproduce each in an engine that owns the camera and the
  clock.
- **What could not be measured,** said in so many words.

Check automatic cut detection against every frame by eye: on FAINT the detector returned 75 cuts, of which 20 were flashes
inside a shot, and missed about 25 real cuts hidden in whips, irises, portals and white frames. The corrected list had
68 real cuts and 22 transition-only inserts.

## 2. FAINT, measured

**Cuts and shots.** 68 cuts in 95.27 s, 0.71 a second; nearly flat after the cold open (4-9 per 10 s), because the
energy comes from what is inside the shots. Shot lengths: mean 1.35 s, median 1.03 s; 23 % under 0.5 s, 49 % under 1 s,
19 % over 2 s. First-person gameplay segments: median 1.37 s, up to 5.17 s without a cut. Cinematics tied to a clip:
median 0.50 s. The rhythm inside gameplay is whips, not cuts: optical flow peaks 175 times (1.84 a second), each rising
in 3 frames and falling in 3. No held or frozen frames: 2 near-duplicate pairs in 2,857 (0.07 %).

**The screen-time split** (what the owner asked OG Snipers to follow): over the whole file 52 % first-person gameplay, 37 %
cinematic (12 % tied to a clip, 26 % free), 9 % titles and text, 2 % transitions. It is front-loaded: the first 32 s hold
12.3 s of story cinematic, 8 s of titles and 5.2 s of gameplay. After the titles the body runs 70 % first person, 24 %
cinematic, 3 % text, 3 % transitions. The file is cut off, so an outro would raise the cinematic share.

**The clips.** 11 clips; first-person time per clip a median 4.87 s (1.40-7.13); kills per clip a median 5 (3-9 in the
ten complete clips); one kill per 0.95 s of first-person screen time. Kill spacing inside a clip: 2 beats is the mode (18
of 46 gaps), then 1.5 beats (8), 4 (5), 2.5 and 3 (4 each), 1 (3). Quickscopes are the default (about 40 of 52); each clip
has one twist (a wall-jump shot, a pistol finisher, a match-winning kill, a held scope, a collateral shown by a bullet
camera, a slide, backflip and spin into a charged shot). Inside a first-person segment the 95th-percentile flow is a
median 13.8x the 10th: every clip swings between near-still holds and very fast whips.

**Sync.** One constant 135.0 BPM grid (a beat is 13.33 frames at 30 fps, 26.67 at 60). As delivered almost nothing sits
on a beat's own frame; shift the picture 2 frames later and 70 % of shot frames and 40 % of cuts sit within a frame of a
beat. **The picture leads the beat by 1.5-2 reference frames: 3-4 frames at 60 fps.** 51 % of cuts fall in the last
quarter of a beat (25 % would be even). Cut spacing varies (1 to 12 beats; the edit never cuts on a fixed count). Motion
is beat-locked: folded onto the beat, flow is highest in the last 30 % before it, a swing of 2.49x over the film and 3.23x
inside gameplay. Every section change in the music is answered in the picture 2-3 frames early (the drop by ink frames
and a light-streak zoom, the chorus by a flash, the second verse by a whip-cut). Flashes: 45 luma jumps over 35 levels,
28.3 a minute, a median half-decay of 3 frames.

**Ramps.** Around a shot (flow relative to the film's 90th percentile, frame 0 the shot, at 30 fps): −10 0.28, −8 0.23,
−6 0.18, −4 0.28, −3 0.35, −2 0.63, −1 0.94, **0 0.84**, +1 0.88, +2 0.70, +3 0.79, +4 0.54, +5 0.56, +6 0.43, +7 0.31,
+8 0.32. A glide at 0.18-0.28 until 4 frames before; a rise over 3 frames; the peak held 5 frames (flick, shot, recoil); a
fall over 4. Peak over glide about 5x. At 60 fps: rise 6, peak 10, fall 8. Around a cut, the outgoing shot is calm and
lifts only in its last frame or two, and **the incoming shot arrives at about twice that speed and settles over 5
frames**: shots are entered fast and left slow. Slow holds in gameplay: a median 11 frames (0.37 s), the longest 21 (the
airborne hold on the drop). Long near-still spans exist only in the cold open and titles.

**Grade.** One look for the whole film: a teal cast (a* about −12 in every section), warm things left warm so they pop.
Two brightness worlds: gameplay dark and contrasty (luma 98, 10 % crushed), cinematics high-key (luma 125-158). **The
median luma jump across a cut is 37 levels, and 29 of 68 cuts jump more than 40:** the edit alternates dark and bright on
purpose. That breaks the trailer gate of a median jump at or under 18; for this style, waive the gate at
gameplay-to-cinematic cuts once the owner has approved the look. Almost nothing clips outside flash frames.

**Sound.** The song runs unbroken at one tempo, with one big contrast: 16 s of quiet intro, then the drop. Gunshots are
not louder than the music's own hits (onset strength at the shot frames sits below that of the beats), which is the
owner's "the music leads" in numbers. One spoken line, a character's, in the cold open.

**Letterbox.** 2.20:1 bars on the cold open only, opening over 28 frames as the title lands. Decide it on a strip of your
own cold open; never assume it.

**Endings.** The attached file is cut off and has no ending. The other Kaiser edits measured for OG Clash all end on a
held, slow image (0-0.3 cuts a second): a tableau, black and silence, then a calm title.

## 3. Flow and aura, as rules

1. Speed is carried across the cut; stillness never meets stillness (incoming shots start at a median 27 px/f at 30 fps;
   only 3 of 68 seams are still on both sides, all in the cold open or titles). Direction need not match (a median 115°
   apart).
2. Arrive fast, settle in 5 frames.
3. Every kill breathes the same way: glide, rise 3, peak 5, fall 4. The repetition of one shape reads as smooth.
4. Motion lives in the last third of the beat.
5. The picture leads the sound by 2 frames at 30 fps.
6. Nothing ever stops: no held frames, no freeze frames; the slowest spans still drift or sway.
7. Density alternates by song section in content, not cut rate: verses (rapped) are 77-94 % gameplay at nearly a kill a
   second; choruses (sung, 5 LU louder) are twice as cinematic with the fastest cutting and the set pieces. The loudest
   music gets the most cinema, not the most kills, and the loudest change in the music meets the least motion (the drop
   lands on an airborne slow hold).
8. Gameplay runs 3-7 s, then a short punctuation of 0.4-2.9 s; ten of eleven clips have a cinematic attached.
9. One real breath, late: 5.2 s without gameplay after 16 s that were 94 % gameplay, before the last lift.
10. No metronome: the longest run of equally spaced cuts is 3.
11. Dark and bright alternate: a return to gameplay feels like a hit because the picture drops into contrast.
12. One colour, one hero: the same cast in every 10 s window, the same character in every cinematic.
13. Effects are brief and each kind is rationed: flashes decay in 3 frames; no transition type except the whip appears
    more than 7 times; signature devices (a glass-shard portal, a bullet camera) once each.
14. Every transition is caused by something in the picture: a muzzle flash, a scope, a lens, a shard, a sleeve, a boot.
15. Titles and effects never cover a kill: tint flashes start on the kill frame, not before.
16. Two lens families: ultra-wide, low, tilted and inches away for action; long and shallow for calm moments and the
    weapon. The subject is off the ground in action shots. Something new every 6-10 s.

**Where you can beat it:** it is 30 fps and 4 Mbps; its whole HUD is on; its master clips (true peak +0.7 dBFS); one teal
wash over eleven maps makes places hard to tell apart and turns skin olive; 12.3 s of titles hold back the gameplay;
three dead seams; a few dated devices (two-frame negative flashes, a text decode). Its music never breathes after the
drop; a trailer would add a designed silence there, but a montage on the owner's song must not ("u cant have music just
go completely blank"). What cannot be copied: its game's characters, animations and set pieces, a real player's recorded
matches, its track and its emblem.

## 4. The rubric anchors (what 10, 7 and 5 look like)

| Dimension | 10 in FAINT | 7 | 5 |
|---|---|---|---|
| Clip quality | multi-kills by one visibly human player: a median of 5, a kill per 0.95 s, a twist per clip, no miss shown | 3-5 kills, clean, the same pattern every clip | 1-3 kills, or kills that look scripted |
| Music sync | 70 % of shot frames within a frame of a beat at the lead; section changes answered within 3 frames; swing 3.2x in gameplay | 45-60 % on a beat; swing about 2x | under 35 %; swing under 1.5x |
| Speed ramps | one repeated shape, peak over glide about 5x, holds of 0.37 s, no doubled frames | smooth but 2-3x contrast, or holds of a second that read as pauses | constant speed, interpolation smear, freezes |
| Transitions | 16 kinds, each caused by the picture; 3 dead seams of 68 | 6-8 kinds, mostly whips and flashes; one signature piece; under 10 % dead seams | hard cuts plus stock overlays; 20 % or more dead seams; dissolves |
| Cinematics | 37 % of the file; 19 shots replay a clip at a median 0.50 s; kills from the victim's side | good-looking but separate from the clips | orbits of a standing character; no replay of any kill |
| Camera | the two lens families; a one-take reveal with a foreground wipe | varied, some low and wide, several eye-level | one lens, eye level, moves that start or end on a stop |
| Grade | one world, dark gameplay against high-key cinematics, under 0.1 % clipped | consistent, but no contrast between gameplay and cinematics | ungraded, or a different look per shot |
| Pacing | cold open, a drop on an airborne hold, verses of gameplay, a cinematic chorus, a late breath | sections exist but the calm parts are short or missing | one density throughout |
| Flow | nothing stops; arrive fast, settle in 5; the same ease on every kill | a few abrupt stops or a metronomic stretch | snaps without easing, dead frames at cuts |
| Overall aura | one authored piece: one colour, one hero, one ramp shape, the song visible in the picture | strong with a flat stretch | a compilation |

## 5. A steal list from FAINT (reproduced with an engine that owns the camera and the clock)

Frame counts here are already at 60 fps. "Sim speed" is simulation time per output frame, stepped by the engine, never
interpolated.

1. **The kill cycle:** sim speed 0.2 until 8 frames before the shot, ease to 1.0 over 6, hold 1.0 from 2 before to 6 after
   (flick, shot, recoil), ease back over 8. Check the peak's median flow is at least 4x the glide's.
2. **Kills two beats apart, the shot frame 4 frames before the beat:** solve the clock so the shots land there; never
   slide the audio.
3. **A scope-shot exposure bump:** luma up about 18 of 255 on the shot frame, settling over 16 frames, tied to the muzzle
   light.
4. **Muzzle flash, one white frame, first person:** end the outside shot on its muzzle frame, one frame near white,
   start first person already moving.
5. **First person to third person in the air and back,** in one simulation take: at the jump's apex switch to a camera
   0.5-1 m from the body, 14-18 mm, low and tilted; sim speed 0.2 for about 24 frames on the aim; cut back while still
   airborne; reset temporal history on both switches.
6. **The drop lands on an airborne slow hold:** a few high-contrast frames, a short radial zoom, then about 68 frames at
   sim speed 0.2 with a slow push.
7. **A one-take reveal with a foreground wipe:** a spline camera past a large foreground object that covers the lens for
   20-30 frames, then onto the hero as a small figure.
8. **Landing in a long lens:** 85-135 mm equivalent at knee height, side-on, the subject sharp, a dust burst, a slow push.
9. **Sub-second cuts on motion:** a near-still macro of gear, an ankle-height lateral track at 15 px/f or more (60 fps), an
   overhead tilted wide on the takedown at sim speed 0.25.
10. **A title found by a whip pan:** extruded letters at two depths, a 20-frame whip from the running hero onto them, a
    hold, a focus rack between the lines, the hero's blurred body crossing the foreground.
11. **A title standing in the scene, lit by it, crossed by the hero** (mesh letters that take the scene's key light and
    cast shadows). The OG Snipers owner wanted theirs floating rather than on the ground.
12. **A weapon macro, a sleeve wipe, the next clip:** a macro on a firing sidearm, a whip along the arm, the sleeve
    blacking out the lens for about 16 frames, the next first person already scoped.
13. **A punch-in on a clip's last kill** for a few frames around the shot; once or twice in the film.
14. **A lens iris of 2-6 frames** to leave a cinematic for gameplay.
15. **A tint flash with particles on a special kill:** grade toward one accent from the kill frame, decaying over 8-20
    frames, with the kill's own debris; one colour per kill type; never before the kill frame.
16. **An ultra-wide tilted dive:** 14-16 mm at step height, rolled 20-30°, sim speed 0.25 for about 32 frames at the apex.
17. **The kill from the victim's side,** from the same simulation take: a camera under and beside the victim, ultra-wide,
    orbiting, sim speed 0.2 as they leave the ground.
18. **A pop-out frame:** matte the shot between two white bars and let one bright element render over a bar; once.
19. **The weapon run:** three short macro moves along the held weapon, the last pushing into the eyepiece; the next frame
    is first person already scoped on a kill.
20. **A word or medal inside the scope:** push into the scope, a white disc with the target as a silhouette and a large
    word behind it, a slow zoom out, a squeeze to a line.
21. **Fire into white and recover** over about 20 frames while the player is already moving.
22. **A floor orbit ending on a boot over the lens,** then the next clip rising out of the dark.
23. **Lightning on the shot:** the scope to white for a frame, arcs around the muzzle that light nearby surfaces, a fall to
    dark.
24. **A bullet camera for a collateral:** replay the shot from the bullet with every material switched to matte white
    and ambient occlusion, rushing between victims at a slowed sim speed so bodies react in frame. Once.
25. **One held scope, then the shot,** after fast kills: about 52 frames at sim speed 0.2 with a slight sway, the shot on a
    beat. Only if the owner allows held scopes.
26. **An iris that becomes the next weapon's scope ring.**
27. **The breath, then a backflip handed to first person and back:** a ground-level wide with a slow dolly-in, a chest-up
    shot with something out of focus behind, then a slide, a backflip at sim speed 0.25, an iris into first person, a
    profile close-up in the air while the shot charges, a short strobe on the shot.

## 6. The finishing layer, separated from the game

The HUD is drawn in screen space, so it cannot move, grow, tilt or smear unless the edit did it. Fitting each HUD corner
against its own median template per frame gives the edit's zoom, roll and shift; the HUD's edge energy gives the edit's
blur. It cannot tell an exposure key in the edit from the game's own muzzle light, and it fails on the most smeared
frames, so the peak values below are under-read.

- **The grade:** contrast is the gap, not exposure. FAINT's first person: mean luma 94, quartiles 29 and 157, black at
  codes 3-5, white reaching 242-247, 14.5 % under code 18, 1.25 % over 245, a teal cast (a* −10.8). Per-clip medians run
  from 48 to 123: it shares the curve and the cast, not the level. The OG Snipers cut before its look test: the same mean,
  quartiles 47 and 127, nothing black and nothing white. No vignette, no visible grain, no chromatic split. **Recipe:**
  levels from the cut's own measured black and white to codes 4 and 246, an S-curve of slope 1.20, a shoulder from 0.80,
  a fraction of the cast in the shadows only (keep places and skins as themselves). OG Snipers then set per-clip exposure
  into a median luma of 86-105; that range is its own, not FAINT's.
- **The shot accent:** 46 % of shots flash (+25 levels or more, median +49, gone by half in 3-4 frames), 18 % bump, 36 %
  get nothing: not every shot gets the same accent. The zoom punch: a median +3.2 % (p90 +4.8 %), arriving in one frame on
  the shot frame and easing out over about 20 frames at 60 fps; roll a median 0.72°; a damped shake of a few frames. No
  chromatic split. **Recipe:** a class per shot from those shares (flash 40 %, punch 32 %, bump 16 %, clean 12 %), never
  the same class twice running; zoom +3.2 % (+4.8 % on a clip's last kill or a multi-kill); roll 0.7°; a 6 px damped
  shake. The OG Snipers owner then asked that the punch hold until the next payoff ("it goes back to 100% too quick").
- **Whips:** in a pan whip the world streaks and the weapon and HUD stay sharp: a blur of the world only, not of the whole
  frame. **Recipe:** directional blur of the world along the view's own motion from the capture log, 0.30 of the frame's
  travel, capped at 72 px, only above 30 px of travel a frame and at sim speed 0.6 or more, never from 2 frames before a
  shot to 7 after, with the weapon, hands and HUD matted out. Leave it off until the matte is clean on every skin.
- **Transitions, by share of FAINT's 68 cuts:** plain cuts on motion 44 %; whips through the cut 16 % (where the picture
  already pans 26 px/f or more at 30 fps; at most 7); white flashes 9 % (1-2 frames; at most 3 where a muzzle frame hands to
  its own outside camera); light-streak zooms 6 %; through the scope 6 % (when the incoming clip opens scoped); foreground
  wipes 4 % (from the take, never pasted); dark beats 4 %; burns to white 3 % (into the ending, once); ink flashes,
  irises and portals 16 % together (of their moment, and easy to date).
- **No frame blending, no dissolves.**

## 7. The seams of the cut the owner praised for flow

The cut the OG Snipers owner later named as the model for flow had no post transitions at all. Its seams cut on the
game's own leaving motion (the unscope, an aim release, a camera pull-out) into the payoff cinematic, entered first person
on the frame its swing began, and took foreground wipes from the takes themselves. When a later round stripped the caused
transitions along with the pasted ones, the owner said "flow/transitions got worse". Measure the seams of every cut the
owner praises (white and dark frames, view speed out and in, radial push, luma) and keep that table as the model.

## 8. A good player, measured

Before scripting a player, record 3-5 minutes of a good human in the real game (the owner, if they play) and measure it.

**Getting view angles from a video.** Track features with Lucas-Kanade (`cv2.calcOpticalFlowPyrLK`) on a 960x540 proxy,
fit a similarity transform per frame pair with RANSAC (`cv2.estimateAffinePartial2D`), with the HUD and the first-person
weapon masked out, and convert the rotation to degrees through the game's field of view. Treat every absolute angle as
±20 % unless you know the player's actual field-of-view setting (ratios, durations, frame counts and curve shapes do not
depend on it); strafing is not separated from rotation by this fit; frames lost at scope-in and cuts are normal. Find
shots from the HUD (an ammo counter, a damage number, the scope overlay), not from the audio, which carries every other
player's gunfire. Measure the build, not its config: OG Snipers' on-screen scope-in took 0.10-0.20 s where the config said
0.30-0.40 s.

**OG Snipers' owner, measured:** scope-in to full overlay a median 0.13 s; overlay to shot 0.32 s; shot to unscope 0.10 s;
shot to next shot 1.68 s (quartiles 1.25 and 2.27); hip flicks a median 14.5° in 0.13 s; the view dead still on 1.6-2.1 %
of hip frames, never more than 4 in a row; a 91 % hit rate (the film needed 100 %).

**Bot tells, with thresholds from that play** (fail a take when):

1. A frozen hip camera: over 5 % of frames static, a static run over 6 frames, or any 1 s window under 1° of path.
2. Constant-speed turns: any flick whose speed varies less than 20 % (coefficient of variation), or 4 or more frames in a
   row within ±5 % of each other.
3. Linear ramps: the flick's speed peak in its first 15 % or last 10 % on more than a fifth of flicks, or progress that is
   a straight line (r² over 0.995). Human flicks peak at about 0.56 of their duration.
4. Instant snaps: any single-frame turn over 17°, a peak over 450°/s, or a flick shorter than 60 % of the fitted duration
   (duration ≈ 0.046 × amplitude^0.45 s).
5. Zero settle: no overshoot in a clip of 5 or more flicks (40 % of human flicks overshoot, a median 13.5 %), or the scope
   coming up on the flick's last frame every time.
6. A dead-still scope at the shot on every shot of a clip (under 0.05° over the last 0.1 s).
7. Identical timing: kill gaps varying less than 25 %, two consecutive gaps within 2 frames, or every scoped time within 2
   frames.
8. Pure-yaw turns: more than 20 % of flicks with under 0.05° of pitch.
9. Always the same scope time across a clip.
10. Pixel-perfect centre hits: a human lands up to half a body width off centre; review by eye until the build can
    measure it.
11. No strafing, or robotic stop-starts: not measured on OG Snipers; review by eye.
12. No turn after the kill: under 2° of turn in the 0.5 s after every kill.

**These tells are measured in game time, on the take's own view log. On screen, the owner's rules win:** where they want
payoffs at equal spacing on the beat, the clock and the payoff solver produce that spacing, and tell 7 does not apply to
the picture; where they ban a play style (OG Snipers banned held scopes), tells 6 and 9 do not ask for it. The other
override is deliberate: a human misses, and the film never does.

**A human input synthesiser,** sampled per event, never once per clip:

| Parameter | Value (OG Snipers) |
|---|---|
| Flick duration | 0.046 × amplitude^0.45 s, times a factor of 0.75-1.35; never under 0.07 s |
| Flick peak speed | 35.4 × amplitude^0.55 °/s, capped at 445°/s |
| Flick shape | an asymmetric bell, its peak drawn from about 0.56 ± 0.16 of the duration, clipped to 0.30-0.80 |
| Pitch | pitch = yaw × a ratio of 0.04-0.21, either sign; never exactly 0 |
| Overshoot | on 40 % of flicks, 3-24 % of the amplitude (median 13.5 %), returned within 0.2 s |
| Aim error left for the scope | 0.5-2.3° off (median 1.0) |
| Pause from flick end to scope-in | 0.27-0.58 s (median 0.42); floor 0.07 s |
| Scoped time before the shot | a mix of short, medium and long, spread at least 0.2 s across a clip (within the owner's play-style rules) |
| In-scope correction | one move at 20-45°/s peak, ending 0-0.13 s before the shot; leave 0.1-0.4° of motion in the last 0.1 s on a quarter of shots |
| Release after the shot | unscope at +0.07 to +0.13 s |
| Weapon swap (two-weapon clips) | input at +0.17 to +0.33 s (median 0.30) |
| Turn-away | a new flick within 0.5 s; median 14°, up to 58° |
| Time between kills (when the owner's grid does not fix it) | 0.87-2.5 s, median 1.7 s, coefficient of variation at least 0.35 |
| Hip idle | never still: 4-8°/s median drift, 0.12-0.19° per-frame jitter at 30 fps, a flick about once a second |
| Scoped idle | 1.7-3.2°/s median drift, 0.05-0.08° per-frame jitter at 30 fps; still runs up to 0.4 s |
| Not measured | the reaction delay to a new target, the strafe pattern, jump, slide and flip timing |

Measure your own genre's equivalents (a racing line, inputs against frame data, hand paths in VR) the same way.
