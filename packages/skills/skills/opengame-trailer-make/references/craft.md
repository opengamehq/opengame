# Craft: the grammar of a game trailer, measured

Every number here was measured on real trailers (36 official Call of Duty zombies trailers and 10 community montage
edits) or learned on the OG Clash trailer (4 sessions, 63 renders, about 100 owner notes). It is engine-agnostic. Where
a number came from one genre it says so; re-measure for yours.

The whole chapter in one line: **cuts on the beat are table stakes; something must happen on the beat inside the
shot, every shot must perform one whole action, and every cut must carry motion.** The first critic of OG Clash: "It
is a capture reel cut to a click track ... the cuts are on the beat but nothing actually happens on the beat."

## 1. Structure

**The measured gameplay-trailer template (about 60 s; Black Ops 6 and 7 zombies map trailers):**

| Beat | When | Notes |
|---|---|---|
| rating or platform card | 0-2 s, only if required | silent |
| cold open before any logo | first frame | 10 of 12 open cold; music within 0.15 s of the first real picture |
| first voice line | 0.8-3.8 s after the first picture | off-screen, over action |
| early franchise logo (optional) | 2-8 s | a smash cut, cropped, resolving in 4-14 frames |
| world reveal | 3-8 s | the place, at scale, moving |
| first enemy | 6.4-13.3 s | in motion, in numbers |
| montage building to the feature beats | 13-45 s | the genre's signature systems |
| boss tease, the loudest hit | about 80 % | just before the title |
| title | 84-90 % of runtime | on the swell or after a silence |
| end card, button | 4-6.5 s | sometimes a 2-7 s stinger after the title |

- Cuts per 10 s rise from about 5 to a peak of 12-17, then collapse to 0-1 on the end card. Kaiser's montage edits by
  section: intro 0.4-0.9 cuts/s, body 1.0-1.45, a breakdown of one held shot (3-8.5 beats), outro 0-0.3.
- **Flat cutting reads cheap.** An edit at 1.4-1.5 cuts/s with no sections scored worst of the edits measured.
- The wrapper (rating card, logos, end card, black) is 11-25 % of runtime in official trailers.
- Story cinematics run 0.17-0.27 cuts/s with 3-5 s shots; keep their numbers apart from gameplay trailers.
- OG Clash used three acts mapped to its track: a calm open to the drop (16.1 s), action to the last drop hit
  (45.8 s), then victory and peace (16 s). 43 slots in 62 s; mean shot 1.44 s, median 1.15 s.

**Story is the gap.** The 6/10 film showed every system and had no arc: no want, no reversal, no character moment. In
this order, every trailer needs: a **hook** (a question or an image you cannot look away from, in the first 3 s), a
**promise** (what the player gets to do), an **escalation** (each beat bigger than the last), a **turn** (the boss
wakes, the squad goes down, the music drops out), a **payoff** (the win, earned, with its impact frame on screen) and a
**button** (a last beat after the title that makes people rewatch: a joke, a stinger, a reveal).

**The feature beats.** List the genre's signature systems and count which ones the references actually show. Zombies,
across 12 trailers: a boss or special enemy 11, a wonder weapon 10, a perk 6, a crew introduction 6, the mystery box
4, the upgrade machine 2. A trailer that shows every system for 1 s each is a feature list. Pick 3-5 hero beats and give
each a real moment; the rest are 0.5-1 s flashes.

**The must-show list.** Write the owner's list as rows of the plan, each with the shot that shows it.

## 2. Music and the clock

- **Music first.** Choose the track, measure it and write `grid.json` before any shot list. Never compute frames from
  BPM; look positions up in the measured grid.
- **Measure, do not trust the file.** Detect splices and build a piecewise grid; MP3 decoder padding is about 26 ms (1.5
  frames). Verify with a click track (median 3 ms or less, 95 % within 10 ms).
- **Find the real drops** bar by bar, and mark accent classes: drop impacts, half-bar holes (where voice and reveals
  sit), bright downbeats, bass downbeats, the last hit, the home chord.
- **Silence then slam** (2-4 per official trailer): the music falls 20-40 dB for 0.3-2.4 s, often over black, then
  returns 20-46 dB up on a reveal. In a trailer the music may drop out on purpose, as a designed silence; it never dips
  by accident.

## 3. Edit rhythm

- **Cut 1-2 frames before the beat** at 60 fps. Kaiser lands cuts 2 frames early at 60 fps and 1 at 30; 43-51 % of those
  cuts fall within a frame of a hit, against 9-23 % by chance.
- **The payoff is the last fast frame,** 1-3 frames before the beat: the muzzle flash, the impact, the kill lands on the
  beat; the cut follows.
- **Vary the lengths.** Mix 0.5, 1, 1.5 and 2 beats with occasional breaths of 3-8 beats. Never more than 4 equal shots
  in a row: OG Clash's first round had 13 consecutive two-beat shots, and a critic called it a metronome. Tighten into
  the drop: 2-2-2-1-1 beats.
- **Official trailers are not beat-locked** (their cuts sit on the beat no more than chance); Kaiser's motion is.
  Beat-locked motion is where an agent-made trailer can beat the references.
- In a montage section, hero shots every second beat, 1-3 frames before it.
- **Give the hero reveal one long breath** (OG Clash's upgraded weapon: 4.5 beats with a 16-frame aim hold).
- **Shot lengths:** Black Ops 6 and 7 medians 0.75-1.09 s; 10-37 % of shots under 0.5 s; 50-74 % under 1 s; inserts of
  2-3 frames exist (box cycles, glitches).
- **The digestibility floor:** a shot that introduces a mechanic the viewer has not seen needs at least 1.2-1.5 s (70-90 frames
  at 60 fps) and one clear cause and result; 17 and 34 frames both failed on OG Clash. A single understood action (a
  sword raised) can run about 0.5 s (32-35 frames). Slow the key moment (to 0.35x) if it happens in under about 10
  frames.
- **Measure "performed on the beat"**, not "cut on the beat": does the action peak land within ±2 frames of a beat?

## 4. Speed ramps and slow motion (the signature)

- **Real simulation, never interpolation.** Slow motion is a smaller simulation step per output frame (1/240 s per
  frame is 0.25x), captured from the engine. Frame-blended or optical-flow slow motion reads cheap: the cheap edits
  measured 8-10 % duplicate frames against Kaiser's 0.2-3.4 %.
- **A ramp only reads when something moves through it.** "it reads as a pause, not slow-mo." Keep the camera at 2 px/f
  or more at 1080p through the slow span, with bodies and debris travelling.
- **A ramp must be legible, not only smooth.** OG Clash had real quarter-speed spans in six shots and a blind critic's
  flow analysis found zero ramps, because the camera moved through them at one speed and nothing changed on screen.
  The viewer has to see the change: fast, slow, fast inside one shot, the subject's speed contrast at least 3x, debris
  and bodies visibly slowing, and a sound that marks it (a whoosh into the slow, a hit out of it).
- **The recipe that worked:** 1x approach, the payoff 1-3 frames before the beat (the last fast frame), ease to 0.2-0.3x
  over 6-8 frames, **hold 24-36 output frames (0.4-0.6 s)** with the camera at 2 px/f or more, back to 1x over 10-12
  frames into the cut. Check the slow span's median motion is at least 2 px/f and never under 1.
- **Kaiser's curve** (optical flow relative to the 90th percentile, in frames at 60 fps around the shot): −12 0.18,
  −8 0.21, −4 0.44, **0 0.87**, +4 0.58, +8 0.29, +12 0.12. Slow for 0.2-0.6 s, rise over about 8 frames, peak on the
  shot, slow again within about 12 frames. Slow runs are short (median 0.25-0.33 s), never whole seconds.
- **Where the slow goes:** on the aim before the shot (12-14 frames at 60 fps), on the impact after it, or before the
  impact when the next shot's opening must stay protected (slow on the drive-in, snap to 1x so the flash lands on the
  beat, cut into the slowed fall).
- **The fast side** comes from camera speed when gameplay cannot run above 1x. Character animation may be sped up to
  about 1.3x to land on beats ("music sync wins; not a gameplay-speed claim"); the world stays at or below 1x.
- **What turns slow motion into a freeze:** game hitstop or hit-pause (45-70 ms counted on raw time becomes 9-12 frozen
  output frames at 0.25x), short animations that finish early and hold, aim springs that die in slow spans, fixed-rate
  physics that stutters every 3rd-4th frame, pulsing lights that become a 10 Hz strobe, gore sprites that fog the frame.
  Turn off or step-compensate each in the film build, and gate on per-character angular rate.
- **Shutter scales with the slowdown** (blur strength = frame rate × step, a constant 180° look in output time). No
  post motion blur. Nothing blurred on the title.
- **Long falls:** run at 1x through the motion and slow after the landing; at 1/4-1/6 a 2 s fall barely moves.

## 5. Camera

- **Every cinematic is moving on its first frame and still moving on its last.** Monotone cubic keys (an ease per
  segment stops dead at each key), roll at most 0.2 rad, no added shake. A calm open may be slow but never locked off
  (1 px/f or more). Nothing still for more than 0.4 s.
- **Every cut carries motion.** At least 2 px/f into the next shot's direction; speed cuts leave at 15 px/f or more over
  the last 3 frames and arrive at 10 px/f or more over the first 4, within 45°. OG Clash's best seam: 19.1 px/f at 13°
  into 19.3 px/f at 15°, 2 frames before the downbeat. Its worst: dead-to-dead seams (0.0-0.3 px/f) and 165-176°
  reversals.
- **Every shot needs a reason to arrive:** a motion, a look, a sound or a cause handed over from the previous shot.
- **Screen direction:** decide which side heroes and enemies come from in each act; they converge; hold the 180° line.
  Map the level from above before choosing lenses: walls and ruins decide which reverse angles exist.
- **Continuity across cuts:** the same character holds the same weapon, finish and state across adjacent shots; shoot
  adjacent shots of one moment as one take with a hard cut so ambient motion carries over.
- **Lenses:** wide and low for scale (a boss sells its size against people, torches, parapets); long lenses to compress
  a horde; a lens height of 0.85-1.2 m for waist-up hordes (it hides foot IK).
- **Depth of field:** every frame has a pin-sharp subject. Engine bokeh reads as smeared low resolution at 4K. No large
  defocused foreground (over 10 % of the frame). Depth of field only lightly on the far background, or off; separate
  with light, angle and motion.
- **Never the back of a head as the subject.** Over-the-shoulder and side-of-the-weapon angles are wanted where the
  character's head and back do not fill the frame (OG Clash's 0.7 m head made over-the-shoulder impossible; audit it).
- **Dolly into the shot:** decelerate from 33 to 3 px/f into the payoff. **Orbit:** eased 3.7, 8.3, 4.4 px/f ("re-aim
  it, don't re-time it"). **Scale:** a giant with nothing to compare against reads small.

## 6. First person and third person

- **Share:** 25-40 % first person across the film; the action section may run 45-50 %. Official zombies trailers are
  only 6-19 % first person, in 0.12-1.75 s bursts; staged third-person action is 80-92 %. Measure on the real cut, over
  the whole film and the action section; the plan's number lies.
- **First person never stands still:** locomotion or aim motion in every first-person shot, unless a scoped hold pays
  off within about 0.3 s.
- **Audit every weapon, sight and finish you plan to show** on frames under the scene's real light: low-poly parts, odd
  angles, obstructions when aiming down sights, sights with no real aperture, finishes that blow out. No close-up on an
  unaudited weapon; never trust the default loadout's look.
- **One first-person character and one set of hands** for the whole film (OG Clash had four arm sets until it pinned
  one).
- **First to third person:** one simulation take, the camera switching at the action's fastest frame, temporal history
  reset on the cut, the third-person angle chosen so screen direction matches. The best seams in OG Clash.
- **Long-draw weapons (bows, charge shots) go third person,** in one continuous take with no splice inside the action.
- **Acrobatics read as a camera spin in first person:** use third person.
- **HUD in first person:** official trailers show none. If the owner wants the feedback (hit markers, points), build a
  mask that keeps only that, and watch for pops covering a head. Debug overlays never appear.

## 7. Characters, enemies, animation

- **Audit every animation clip on frames before planning a shot of it** (USABLE, WITH CAMERA CARE, NO). OG Clash found:
  the enemy rise was a lift in a straight line (head height linear with R² 0.98), the scream a T-pose, gun kills never
  threw a body, the hero's weapon hold stretched sleeves 16 %, the victory emote turned into a scarecrow pose after
  2.2 s, the revive greyed the whole frame. Plan around what holds up.
- **No standing stills, no unnatural poses.** Every character does something with intent; weight, elbows, hands and
  gaze checked on frames.
- **Show enemies where the animation holds up:** walking toward a character, in numbers, at distance, on impact. Never
  posed for inspection. One gait in a horde, no runners.
- **Frame out what the engine renders badly:** foot IK, hands, broken holds. Waist-up from 0.85-0.95 m with the horizon
  at the frame bottom.
- **Readable space between hero and enemies.**
- **Faces are sacred:** never add glow balls, slits or arcs to a hero or boss face; use the asset's cleanest look and
  match every shot of that subject to the frame the owner likes.
- **Personality is the missing ingredient.** The 6/10 film never let a character be a person: a look, a joke, a
  hesitation, a reaction. Plan at least one moment where a character reacts to something.
- **Co-op:** in first person with mates firing at the same far target you only see their backs; keep them off frame and
  let muzzle light and tracers enter from the edges. Ending tableaux: staggered depths, turned to each other, not a row
  facing the lens.
- **The newest showy move:** feature it mid-action in slow motion, after turning hitstop off.

## 8. Effects and light

- **A cheap effect is the film's defect.** Fix it at the source (the game's own effect code, in the film build), sweep
  the whole class, and hand the patch to the game team.
- **An electricity or energy spec that worked:** a thin white-blue core of 2-4 px, a narrow saturated falloff, fractal
  branches that crawl, a re-strike every 2-4 frames, a 1-2 frame after-image in the core only, contact sparks, real
  light cast on nearby surfaces. Not thick soft ribbons.
- **No glow clips to flat white.** Measure the share of the frame at full white (see the measuring chapter); 0.5 % or
  less on a held hero effect (OG Clash: 8.6 % to 1.2 %, 6.59 % to 0.47 %).
- **When the owner calls an effect cheap, try removing it first.** More effects was the wrong fix on OG Clash.
- **No blurred-circle glows, flat puffs, pink fog, see-through holograms** (fast mesh swaps ghost through temporal
  anti-aliasing; reset its history on every swap frame).
- **Flicker:** at most 3 full-frame flashes per second; check held lights for periodic flicker (a light re-firing every
  0.09 s reads as a 10 Hz strobe). Kaiser's flash rate of about 30 a minute is a ceiling.
- **Full-frame washes** (lightning, fog flashes) flatten the picture and read as an overlay. Suppress random world
  events per take (reset their timers in the preroll).
- **World markers that read as HUD** (waypoint rings, weak-point capsules, telegraph circles) are hidden in cinematics.
- **Never invent an effect the game does not have** to hit a music accent; put the accent in sound.

## 9. Transitions

About 80 % of cuts in official trailers are hard cuts. Every other transition hides inside the world.

- **Allowed:** a speed cut on the fastest frame; a match cut (same framing, sometimes with an 8-frame glitch); a
  first-to-third-person hand-off inside one take; a ramp cut; an in-world wipe by an opaque foreground (about 9 frames
  at 30 fps); a flash cut of 2-16 frames that hides a cut; a white-out of 4 frames to 1.5 s on a story beat; a
  crash-zoom of 4-14 frames; a whip pan of 0.1-0.7 s blurred by the engine's own shutter; a logo or emblem matte of
  0.8-2.9 s; a muzzle strobe at about 8 Hz, 2 frames each; black slugs of 0.07-0.45 s as rhythm; light dropping out in
  the world; at most two story cuts to black of 4-15 frames.
- **Banned as cheap:** crossfades and dissolves as glue (rare exceptions: an aerial, an end-card particle morph);
  opacity fades; post blur transitions; stacked-copy smears; editorial white flashes that are not in the world; post
  shake; letterbox mattes added mid-film; effects covering the action; frame-doubled slow motion; freeze-frames in the
  body; constant shake or flashing; lyric karaoke; anything more than 2 frames off the grid; stacked transitions; stock
  overlays; ramps on empty shots; intros over 16 % of runtime.

The rule that held on OG Clash: ban every **editorial** effect (added blur, opacity, white frames, shake, overlays,
interpolation); allow everything the **game renders itself** (muzzle light, lightning, engine velocity blur, recoil,
emissive glow). A montage in a named editor's style may ask for that editor's finishing layer; that is decided in
`opengame-montage-plan` with a look test.

## 10. Grade

- Official zombies trailers are dark and low-saturation (luma Y 40-70 limited range, saturation 6-15) with one hot
  accent per section (the genre's signature colour), and bright sections built on purpose for contrast.
- Kaiser's edits are near-neutral (colour casts within ±2.2 a*/b*, saturation 31-42 %, clipping under 3 %, crushed
  blacks 9-18 %), the colour changing per sequence.
- OG Clash: three per-act 65³ LUTs built in Oklab on the engine's output (act one cold steel-blue with warm embers, act
  two cyan against orange with the violet left alone, act three warm gold), plus per-shot exposure, temperature and
  tint trims. No added grain, flares, chromatic aberration or vignette.
- **Light across cuts:** median luma jump at or under 18; none over 40 except a declared story beat.
- **A colour script** (one sentence per act: "cold and wet", "fire and steel", "dawn gold") makes the grade tell the
  story. The 6/10 film had per-act LUTs and no deliberate contrast moment; plan one.

## 11. Title and logo

The full procedure is in the title chapter (`opengame-trailer-make` carries it). The rules:

- One title, built from the game's own logo art, as a **real 3D object in the world of the final shot**: extruded about
  20 % of its height, separate side and bevel materials, lit by the scene's key, haze and bounce, shadowed, matched
  numerically to props at the same depth, composited **before** the grade.
- **The camera finds it**, or one clean cut reveals it. No particle assembly, no shimmer; still at rest. Never overlaps
  a character on any frame. About 19-30 % of frame width depending on the shot.
- **Live structured energy** (lightning, fire) on the title is premium when it strikes on the beats with a designed
  sound per strike, from its first visible frame.
- Placement: 84-90 % of runtime, on the swell or after a silence; or a cold-open title for a story trailer (Black Ops 3
  put it at 27-36 %).
- Franchise logos of 2020-2025 use a smash cut to an oversized cropped piece, then a crash-zoom or pull-out to the full
  lockup in 4-14 frames. That is for flat 2D marks; a game's own 3D logo uses the title chapter.

## 12. Voice

- **Density follows the brief.** The references run 5-8 lines and 42-75 words per 60 s; OG Clash's brief asked for many
  lines and shipped 13 in 62 s with no complaint about the count. One-liners of 1-11 words (median about 5); gaps of 8
  frames or more; never two lines at once; at least a bar clear after the drop and after the hero reveal; no voice on
  frame 0.
- **Budget in bars:** a radio line 1 bar, a character line 1-2 bars, banter 3-4 bars; keep the drop and the hero reveal
  free of voice.
- **Placement:** lines are almost always off-screen over action and land on matching pictures; a name lands on the shot
  that shows the thing named; a character's line plays on the shot where they are on screen and the picture motivates
  it. Put lines in the track's measured half-bar holes.
- **No announcer or voice-of-god clichés, no tutorial lines, no other studios' names** (a critic caught a line that was
  another game's title) and no other franchise's power-up names.
- **Use the game's own cast and text** where possible; fix casting collisions (two characters sharing one voice).
  Generated voice runs on the person's own account, after they approve the cost.
- **Intelligibility:** a speech recogniser on the mixed master, four windows per line, three of four correct; fix with
  a new take or new timing, not just more level.
- **Never speed a line up to fit. Never pitch-shift game audio.**

## 13. Sound and mix

- **Sound is half the trailer.** A designed hit on every big picture event: at least 35 % of its energy in 300 Hz-5 kHz
  and at least 6 dB over the music in that band over its first 50 ms (OG Clash's sound lead used 7 dB), aligned on the
  attack, in key. Sub-only hits are silent on a phone.
- **Every flash gets a sound or is deliberately silent.**
- **Tails ring 150-400 ms across every cut.** A cut that stops every sound dead is heard as a click.
- **Slow-motion spans** carry the real-time sound once, unstretched, anchored on the payoff.
- **Mute in-game music and dialogue at capture,** or it is baked into every take (verify by loudness).
- **Game sound** sits 0 to +6 LU over the bed in action; trim per shot from a mix without the music.
- **No accidental ducks:** peak-control game sound, effects and voice as one bus keyed to the bed's headroom, and
  measure the music's level in the mix (a dip of 1.5 dB at most). Designed silences are fine.
- **Master:** −14 LUFS ±1 integrated and true peak at or under −1 dBTP, measured on the AAC delivery; two limiters
  around a linear gain, never ffmpeg's `loudnorm` filter, in one pass or two (its dynamic mode flattened drops by 3-4 dB); 24-bit
  WAV; AAC at 320 kbps. Loudness range follows the track (OG Clash's track alone was 9.0 LU): write a waiver rather
  than leaving a gate red on every cut.
- **Measure the references' loudness too.**

## 14. Endings and the button

- Official trailers: title, then an end card of 4-6.5 s, sometimes a 2-7 s stinger (a lunge, a joke line: "That song
  was driving me nuts!"). Every Kaiser edit ends on a held, slow image.
- OG Clash ended on peace: victory on the wreck, dawn, the crew at a campfire, a crane up to the title in the sky. Good,
  and it had no button.
- **A 10/10 trailer has a button:** one last beat after the title that rewards the viewer and makes them rewatch (a
  character line, a sight gag, a tease of what is next). Plan it.
- The end card tells people where to play. If it says "play free in your browser", check the real first-load time on
  typical connections.

## 15. Format and delivery

- **The format is asked in the plan:** default 1080p at 60 fps, 16:9; 4K60 or 30 fps on request (App Store previews
  cap at 30 fps).
- The ladder: a 720p contact sheet, then 1080p60 review cuts, then approval, then the master at the agreed format, then
  the social copies. Details are in the finishing chapter (`opengame-trailer-make` carries it).
