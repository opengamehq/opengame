# The montage grammar: what a montage overrides, and the rules with numbers

A gameplay montage is the community edit: clips of one skilled player cut to one song, each payoff shown twice (as
played, then from outside), speed ramps on every payoff, an editor's finishing layer, almost no text. "Kill montage",
"frag movie", "highlight edit", "clip edit to a song" and "edit like (a named editor)" all mean this. It is not a
trailer: no story spine, no voice script, no call to action.

The worked example is the OG Snipers montage: an 88.6 s sniper montage of OpenGame's snipers-only arena shooter (mascot
characters, its own WebAssembly and WebGPU engine), 5,317 frames at 60 fps, 13 clips, 68 trigger pulls, 77 kills, made
over 66 h 38 min in 19 numbered cuts and called final by its owner at the 19th. The golden reference the owner attached
was "FAINT", a FaZe sniping edit by the community editor Kaiser. Every number below is from that film unless it says
otherwise. It is one genre; the genre chapter translates.

"Payoff" means the genre's peak event: a kill, a goal, an overtake, a combo ender, a boss break, a cleared line. The
"receiver" is whoever or whatever takes it: the victim, the overtaken car, the keeper, the losing team, the board.

## 0. Where a montage overrides the trailer defaults

The trailer method was built on a product trailer. On OG Snipers every one of these trailer defaults was pushed by a
critic, a gate or the method itself, and the owner reversed it within hours; the review machinery caused six of their
notes. Start a montage from the right-hand column, and move only on the owner's word.

| Trailer default | Montage default on the owner's song | Evidence |
|---|---|---|
| 2-4 designed silences, a loudness spread of 8 LU or more, the loudest 50 ms on a slam | the song never drops out; no music holes; drop the spread and slam gates | "u cant have music just go completely blank" |
| vary shot lengths between 0.5 and 4 beats, no more than 4 equal in a row | on a steady beat, payoffs at equal spacing on the same beats; vary content, not spacing | "equal spacing and always on same beats" |
| edit the track to length | the song is played, not edited: one gain, a fade over the last 0.5 s at most | "dont randomly change the song at 1:30?" |
| tails of 150-400 ms; a critic's "shorten every tail" | tails ring out in full | "let the full gun sounds play / echo" |
| designed hits 6 dB or more over the bed; −14 LUFS | the music leads; payoffs sit about 3 dB over the song in 1-5 kHz; the film at −12.9 LUFS | "music is way too soft" |
| voice lines in the track's holes | there are no holes; a callout lands just after its trigger, under the song | |
| first person 25-40 % of the film | follow the reference edit's measured play-to-cinematic split (FAINT: 52 % first person, 37 % cinematic, 9 % titles over the whole file; 70 % first person in the body after its titles); the approved OG Snipers final ran 67-77 % first person, failed that informational gate, and drew no note | "the same split of clips vs cinematics can be what u follow" |
| a title at most 30 % of frame width | the owner's eye; the approved title was 62-79 % | |
| no editorial effects | ask about the reference editor's finishing layer with a 15 s look test | "add some other parts of kaisers editing"; the second look test was approved first time |
| a no-hitstop hook | right for shooters, wrong for fighting and action games: keep their hitstop, re-timed | genre research |
| the loop ends at two critics at 8.5 or more | the owner's approval ends it unless they name a panel; a judge panel still runs as a measuring stick | |

The raw real-time proof reel with full HUD that a launch package includes stays with `opengame-trailer-plan` and
`opengame-trailer-make`.

## 1. The film map comes from the song

- Measure the track before any shot (the song chapter): tempo and drift, bar 1, sections, where the vocal ends, holes,
  the loudest moment, whether it has an ending. OG Snipers: 137.370 BPM on one clock with no splice, so a beat is 26.207
  frames at 60 fps; bar 1 beat 1 at 0.755 s (frame 45); four 16-bar blocks of 27.954 s; flat (short-term loudness −10.6
  to −8.8 LUFS), no drop, no riser, no ending.
- Map the owner's spoken times onto measured downbeats: "around 57 seconds" became 56.663 s (frame 3400), where the
  hook returns. The rap ends at 84.44 s; the next downbeat, 84.616 s (frame 5077), became the door to the end shot. The
  length follows the song: 95.0 s planned, 88.6 s shipped, faded from a downbeat. The first brief said "end around 60
  seconds" and "around 1:30" in the same message: measure the structural point, then confirm it in one line.
- Slots of 8, 12 or 16 beats, each with its grid. A slot's last 2 beats are its last payoff's hit and outside shot, or
  the next clip's entry, and nothing else.
- Every grid point carries an event: a payoff, a movement accent peaking on the beat, or a cut. A grid point carrying
  nothing fails. "every beat doesnt have to be a shot -> it could be movement and then speed ramp on a slide or jump or
  flip etc... or a new cinematic".
- Measure how far ahead each movement must start so its accent peaks on the beat. OG Snipers: a slide starts on the
  beat (0.85-0.88 s long), a jump peaks 0.32 s after the key (19 frames), a flip 0.43 s (26 frames), a mantle tops out
  at 0.25 s, a weapon swap is ready at 1.10 s. Measure the same for your genre's movement verbs on day one.
- A flat loop with no sections: the edit makes the sections (verse = play, chorus = spectacle). A half-time feel puts
  payoffs on the snare (beat 3) and motion peaks on the kicks. Drum and bass: treat it as 85-87 BPM for payoffs.
  Ambient or orchestral: cut on phrases, not a grid.

## 2. Spacing by read time; designing the money moments

- **Read time sets the spacing, not the song.** Choose the smallest k of 1, 2, 4, 8, 16 or 32 beats with k × beat at
  least the payoff's read time (about 2 % slack). FAINT: kills that read in 0.9 s, two beats apart at 135 BPM (0.89 s).
  OG Snipers: two beats was 0.874 s. A slow-reading payoff at a fast tempo goes on 8 or 16 beats with motion peaks in
  between (FAINT has 1.84 flow peaks a second between its kills). A flat cut-per-beat edit of a slow genre is the
  commonest amateur failure.
- **Counts.** Five or six payoffs make a clip; a bigger one is rare; the biggest only in the finale. "5-6 pieces be the
  default and then more than that should be sparse and last clip of 10 piece should be unique". A 16-beat clip held 5-6
  kills on 4-6 rounds plus 2-3 movement or cinematic beats; 12 beats held 5 kills plus 1-2; 8 beats held 4 rounds and 5
  kills. FAINT: a median of 5 a clip, range 3-9.
- **Vary content, not spacing.** The staple is a clean chain of single high-skill payoffs; spectacular multi-hits are a
  spice ("We cant have every clip have collaterals"). Vary hit types the way a top player would ("not every kill should
  be a headshot (and some clips should be all headshots)"). Every payoff shown is a clean finish under the game's real
  rules.
- **Two full re-shoot rounds went on spacing:** first varied gaps (copied from the reference and pushed by a critic),
  then a 2-beat grid with a kill on every point (7-8 a clip), then 5-6 with movement beats. Settle spacing, the count
  and "may a beat be a movement" on day one.
- **One signature moment** only this game can do; at most one trick per clip (FAINT has one twist per clip). A trick
  plays at real speed and ends in its hardest form; slow motion goes only on the payoff after it ("at least 720 and
  noscope after trickshot", "the 720 is way too slow").

## 3. Payoffs on the beat

- **The sync rule:** the first visible payoff frame lands 3 frames (±1) before the beat at 60 fps; the payoff's sound
  attack lands on the beat itself (±10 ms). The final cut had 68 of 68 shots inside 4 to 2 frames before the beat, 67 of
  them at exactly 3; the sound stem had 71 of 71 attacks within 4 ms of the beat.
- **Time a sound by its audible attack,** not its broadband peak: a rifle report's crack is the rise into the peak of its
  200 Hz-12 kHz envelope, 12 ms into its muzzle frame. Before that rule, dull reports started 4-10 frames early; the first
  sound critic found 21 of 65 shots clear, 13 off picture and 15 with no shot sound.
- **Cause before effect, once.** No outside shot shows a reaction before the film has shown its cause; the cut onto the
  receiver lands on the payoff frame + 1 or later; the same payoff is never shown twice (one check found 6 at once).

## 4. The edit never retimes

- Take frame n + k is timeline frame a + k, always. The edit list refuses speed, retime, rate, frame-rate, reverse,
  hold, freeze, blend, interpolate, dissolve, crossfade, fade, opacity, shake and blur keys. The finishing pass obeys the
  same rule: output frame n is input frame n.
- All speed comes from the capture clock, so easing is a capture problem. On a closed game with no clock hook (capture
  tiers C-E), the capture's own frame rate is the clock: footage shot at 240 fps and laid at 60 fps is real slow motion
  down to 0.25x, and the conform that lays it is the one sanctioned rate change (declare the source rate per shot; design
  the speed curve before the replay render). Slower than capture fps ÷ 60 is optical flow: say plainly what that costs and
  ask ("no pixel warping in ours just super high fps slow motion").
- The edit may cut a defect out, never retime it: a 160° snap turn in two frames was removed by a clean cut; a one-frame
  ghost was re-shot.
- A slot with no select is a labelled slate so a full-length cut exists from hour one; a cut sent to the owner never
  carries one.

## 5. Eased speed everywhere

- **The payoff cycle, measured on the reference:** glide at 0.18-0.28 of peak motion until 4 frames before; rise over 3
  frames; hold the peak for 5 (one before to three after: the flick, the shot, the recoil); fall over 4 back to glide by
  7 after (at 30 fps). At 60 fps: rise 6, peak 10, fall 8. Peak over glide is about 5x.
- **Drag-through:** the aim still travels through the payoff frame (0.7-0.8° a frame, about 59 px of scope glass), never
  stopping on the trigger; flow from 1 frame before to 3 after at least 0.6 of the 90th percentile (60 of 68 shots in the
  final). The first cut's kills were two humps with a stop on the trigger.
- **The eased-ramp rules** ("smooth speed ramp transitions and even for cinematics speed ramps not just a constant speed
  of cinematics with awesome easing"):
  - AE1: every speed change eased (smoothstep or cubic in log-speed) over 8 or more film frames; no more than 15 % change
    per frame.
  - AE2: a payoff cinematic is a V: 0.8x or faster for its first 2-3 frames, easing down to 0.15-0.3x reached about a
    third of the way in, held for at most a quarter of the span, easing up so its last frame runs at 1.0x or faster into
    the cut. The lens rides the curve.
  - AE3: clip to clip, the last 10-14 frames ease up to 2.5-3x and the next clip's first 10-14 ease down from 2.5-3x.
  - AE4: no searching; dead travel at 1.5-2x easing into the next payoff; the payoff and its hit at 1.0x or slower.
  - Log the speed of every take frame: post blurs ramps from it and sound places cues on it.
- A compliant clip on OG Snipers: the largest one-frame change 14.4 %; its first 14 frames 2.80x down to 0.89x; its last
  14 frames 1.15x up to 2.60x; the payoff cinematic opening at 1.00x for 3 frames, slowest 0.30x at 39 % of the span,
  held 4 frames, ending at 2.60x. **28 frames is the shortest payoff cinematic** where AE2's floor, AE3's exit, the 0.8x
  opening and the 15 % limit all fit.
- A shutter in game time (a 180° shutter) makes blur follow the ramp; no post blur is needed.
- **Plan the eased ramps into the first shoot.** On OG Snipers they arrived at hour 64 as a retrofit and shipped on 3 of
  13 clips; converting the other ten was stopped when the owner called the cut final.
- Genre: racing inverts it (slow the overlap, snap to full speed as the pass completes); fighting keeps hitstop and slows
  the ender's hitstop 2-4x, never the middle of a combo; a rhythm playfield is never slowed (ramp the cutaways); tactical
  shooters keep the shot frame at full speed and slow the pre-peek and the drop.

## 6. The payoff cinematic: framed on what animates well

Show it twice: after the payoff, cut (on the frame after it) to the same payoff from the receiver's side, from the same
seeded run, at the same place, on the same frames. These rules arrived one owner note at a time over two days; read them
as one spec.

- **Tied, not decorative.** A cinematic shows the payoff just made or the hero's trick; a run or a move over the map tied
  to nothing is out, however clean ("cinematics play that dont make sense"). The shots the owner praised were a move into
  the map that hands into the player's view, and the payoff seen from the receiver's side or along the line of the
  attack. They never praised the hero alone.
- **Motivated angles they asked for:** dolly moves, a view from the side of the weapon, over the shoulder, speed ramps
  through the move ("imagine a cinematic virw from the side of the gun or like over the shoulder"). Each genre's cameras
  are in the genre chapter.
- **The real character, whole:** an outside camera never shows the first-person rig ("your right arm is just floating
  and there's no body"); a character shot holding the weapon shows the full body ("u need to be able to see their full
  body"). That is the hero shot; the impact framing below is the receiver's.
- **The right subject in the right place:** the same opponent, outfit, name, spot, pose and facing as the gameplay frame
  before the cut. Shoot it from the same seeded take (at tiers C-D, the replay's free camera on the same moment).
- **Smooth:** every frame its own evenly spaced state of every body and the camera; at most one frame where a followed
  body stands still (under 0.3 of its neighbours' motion) or jumps (8 px and 5x its step).
- **A clear angle, or re-shoot:** the subject at least a third of frame height, unblocked, the result inside the frame.
- **Nothing passes through anything:** stage payoffs on open level ground, 1.5 m clear of stairs, rails, walls, crates
  and ledges; the lens never at or under the ground.
- **The consequence fills the span:** the hit in the first frames; off its feet within 15 frames; on the ground by 60 %
  of the span; no 12-frame run where only the camera moves over a still body; nobody upright at the cut.
- **Frame out what the engine animates worst:** "show it at an angle where u dont see the bottom half of body". From the
  hit to the cut, nothing below the belt: the head at about 45-55 % of frame height; hips, knees and feet at least 5 %
  outside the frame (8-10 % was used); roll within ±35°. **Decide this framing before tuning any animation:** about a day
  of fall tuning was made moot by this one note, and one of the six shots the owner called bad was the one the director
  had called the best in the film.
- **It ends the clip:** every clip ends on its payoff cinematic, held to its end; no move over the map squeezed in after
  it; no payoff insert in the middle of a chain ("Get rid of the random one at 53s").
- **The insert recipe that worked:** cut on the payoff + 1 frame; 1.0x until 0.10 s after the shot, then 0.28x until 0.75
  s after it; the camera 1.9 m off the receiver and 0.55 m above their feet, on the hero's side, a 16 mm lens (74°
  vertical), orbiting 30°; 1.5 m from every other body (3.3 m from a dead one on the look side); refuse a lens under 0.5 m,
  a wall within 1.5 m of the head, or ground that steps more than 0.25 m within 1.2 m. The final's median tied shot ran 51
  frames (0.85 s), the longest 92; the reference's median is 0.50 s, and the owner did not object to the longer ones.
- **A two-pass lens solve** for "include X and exclude Y on every frame", after hand-placed tries failed twice. Pass 1
  shoots the seeded take with any lens and logs the drawn body points per frame; a solver beam-searches a per-frame lens
  that keeps the head at 45-55 % of height and every hip, knee and foot outside an 8 % margin; pass 2 plays those keys on
  the same seed, build and clock (points within 12 mm of pass 1); then check pass 2's own logged points (0 of 55, 52 and
  42 frames with a leg point in frame on OG Snipers). A camera look-at on a drawn point saves a pass but not the check.
  When the body inverts (a somersault, hips 0.4-0.7 m above the head) the rule cannot hold: cut to a hit close-up and a
  landing close-up, or re-stage.
- Genre: racing shows the pass or crash from the overtaken car's side, framing the cabin and impact zone and never the
  wheels on the terrain mesh; fighting shows the KO from behind the loser, upper bodies only, on the floor by 60 %;
  sports shows the goal from the keeper's side with the net bulging in the first frames; MOBA and RTS go inside the
  losing formation, a high angle hiding pathing feet; 2D and no-character games use a change of scale and time on the
  same plane, the consequence standing in for the receiver's side.

## 7. The primary view (first person, or the player's camera)

- **Model the scripted player on a good human's play, measured.** The OG Snipers owner's own play: scope-in to full
  overlay median 0.13 s; overlay to shot 0.32 s; shot to scope off 0.10 s; shot to next shot 1.68 s (quartiles 1.25 and
  2.27); hip flicks a median 14.5° in 0.13 s, a bell peaking at 0.56 of the duration with 13.5 % overshoot; the hip view
  dead still on 1.6-2.1 % of frames, never more than 4 in a row. Their hit rate was 91 %; the film needs 100 %: "never
  miss any shots and dont move unnaturally". Record 3-5 minutes of a good human in your genre first, and compare every
  scripted take against it (the bot-tell check in the measuring chapter).
- **Not every habit is a rule:** the owner swapped weapons after nearly every shot, and wanted that in "only a few
  clips".
- **Only the high-skill form of the core action.** For sniping: no hard scope; the scope is up 9-14 frames a kill and
  never held. Never change the play style to hide a render defect.
- **No dead time:** after the last payoff, show the hit for 8-12 frames, then its cinematic or the cut; no stretch over 2
  beats without a payoff. **No searching:** after a payoff the view goes to the next target or the hero travels ("spends
  to omuch time looking left and right").
- **The payoff is seen** for at least 8 frames before any cut, and targets fill the view (sniping: the body a third to a
  half of the scope picture at 12-25 m; at most two long shots as contrast).
- **Opponents behave like players in every visible frame:** moving 1-3 m/s across the line of fire, climbing, jumping;
  never in a row facing the lens, never running into a box. An opponent ordered to move covers at least a fifth of the
  ordered distance over any 6 frames. Varied as the game varies them; the only failure is clones.
- **Honest payoffs.** Check the game's damage model before promising a mix of hit types: OG Snipers scored every trunk hit
  as an arm hit, so chest kills needed staged health. The director told the owner four staged kills, then seven, then
  eight; only the count taken from the takes' own commands was right (4 of 77). Disclose staging per payoff, and decide
  any film-only rule change with the owner before building it.
- **An aim trim inside the game's own rules** (up to 0.35° onto the target before the game's hit test) cured near misses,
  the top take-killer. **One set of hands:** changing the outside hero never changes first-person shots.
- Genre: racing has no hesitation at corner entry and AI that races rather than parks; fighting has no whiffed inputs and
  a dummy that blocks and techs; battle royale has no looting or menus and the next target within 0.5 s; VR has
  bell-shaped hand paths and never a perfectly still controller.

## 8. HUD policy

- No menus, loading screens, lobbies or results screens: only in-game play and cinematics ("No menu screens or loading or
  anything / Only in game gameplay and cinematics").
- Show only what confirms the hero's success; hide the rest. OG Snipers kept hit markers, damage numbers, multi-kill medals
  and the kill feed as one bit mask, and hid the crosshair, minimap, score, health, ammo, name tags, prompts, perk and
  streak cards, the death screen and scope readouts.
- Medals for multi-payoffs only, each on its own frame. No HUD under any outside camera.
- **A feed is data the viewer reads:** only the hero's events; one short hero name; every opponent a unique, real-looking
  name from the game's own generator (77 kills, 77 names; one check found 7 repeats); rows spaced pixel-identically to
  the shipped game. The feed-spacing note came twice, 42 hours apart: one cross-clip crop sheet found the bad clip in
  minutes after fifteen deliveries had missed it.
- Clean the view of clutter the owner never chose: OG Snipers scopes were 48 % black housing; film switches brought that to
  6-7 %.
- Genre: racing keeps the position change and the last-lap banner; fighting keeps health bars, the combo counter and the
  KO banner; sports keeps the score bug on decisive goals; MOBA keeps champion health bars and the multikill banner;
  rhythm keeps combo and judgements; a soulslike keeps the boss bar and the felled banner.

## 9. Transitions and seams

- **"Flow and transitions" meant motion inside the picture.** The cut the owner named as the model for flow had zero post
  transitions. The seam recipe: cut on the game's own leaving motion (the unscope, an aim release, a camera pull-out) into
  the payoff cinematic; enter the next clip's first person on the frame its swing begins. Foreground wipes (a container
  wall, a frond) come from the take.
- **Openers can be movement:** a clip need not open on a payoff (a flight over a valley, a slide between containers); the
  first payoff comes a beat later. A cold open is one continuous, readable action (the place, the hero, sets off, the
  trick, the first payoff), with no point-of-view ping-pong.
- **Caused transitions only, rationed:** a push into the scope when the incoming clip is in its glass; a muzzle-light
  flash when a shot fires 3 frames before a tied cinematic; a burn into the ending; at most two one-frame whites; a whip
  blur only with a clean matte on the hero object (the reference streaks the world and keeps the rifle sharp). Stripping
  every transition after a sweep made "flow/transitions got worse": restore the caused ones.
- **Shot accents** per payoff, from the reference's measured shares (a flash 40 %, a zoom punch 32 %, a bump 16 %, clean
  12 %), never the same twice running: a punch of +3.2 % (+4.8 % on a clip's last payoff) in one frame on the payoff
  frame; a roll of 0.7°; a shake of 6 px, damped. **The punch holds** until the next payoff or cut (held at 80 %, creeping
  +0.3 % a second, snapping on the next flash, releasing at the cut): "it goes back to 100% too quick".
- **Speed crosses the cut; direction need not.** Reference seams arrive at about twice the outgoing speed; 3 of 68 are
  still on both sides; directions sit a median 115° apart. AE3 carries speed through every seam.
- Genre: racing cuts as the camera pulls off the bumper and enters on a drift's yaw; fighting cuts on the KO slow-down and
  enters on the next round's dash; platformers cut as the character leaves frame and enter mid-jump.

## 10. The finishing layer

- Ask first: the director had ruled it out, and the owner asked for it. A 15 s look test was approved first time: deeper
  blacks, brighter whites, warmer highlights, glow on muzzle light, a small zoom punch and roll per shot ("kaiser look
  second version looks great"), and "nothing cheesy or chanign color scheme too much".
- Lock the approved look as a baseline and A/B every later change against it.
- The reference recipe: levels to codes 4 and 246, an S-curve with slope 1.20, a shoulder from 0.80, no vignette, grain
  or chromatic split. Per-clip exposure into a median luma of 86-105; outside shots +0.78 stop, except where 10 % or more
  of the frame is over code 180 on 10 % or more of frames. Check the look on bright outside shots and light costumes
  against sky before locking it: a look tuned on first person clipped a sky and a white hoodie flat.
- The pass is driven by the edit list, deterministic, cached per chunk, and never retimes. Run it **once per cut** on a
  reserved slot; a look exception bound to a take that is not re-bound when the take changes grades the element twice
  (the r15 title box measured brighter and paler than its approved comp, and that cut was held 20 minutes).

## 11. The end shot

- One shot, 3-5 s, from the door the song gives (the vocal's end). OG Snipers: 240 frames, frames 5077-5316, the song
  fading under it untouched.
- What the hero does there is the owner's call; on OG Snipers, a moment of calm after the action, on the owner's own
  character. Ask it with the ending question on day one.
- Text only if they want it. If a title: the game's name, in the world, floating (letters at 0.7 m read as standing on
  the ground), lit by the scene's own light, reflecting the real scene at its place, occluded by its smoke, its letters
  assembling from close by and still closing on the last frame, its energy effects heard.
- **It cost the most rounds of any element:** 23 hand-ins over 3 days and 26 agent-hours. The chrome version the
  owner asked for was never delivered; they asked for "no text" and 16 minutes later kept the previous glass. Settle it on
  day one from stills on the real plate (floating glass, chrome, or no title; five fonts), offer a cut without the title
  early, and keep the last approved version as the default while a new one is built beside it.
- Check the title on the finished file against its approved comp (a fixed box's luma and saturation).
- Genre: racing puts the title over the finish straight reflecting the livery; sports above the pitch in the crowd's
  light; fighting behind the winner's pose in the stage light; 2D in the game's pixel font on its grid.

## 12. Sound

- **The song is the clock and the lead,** never edited, never ducked by accident. OG Snipers: the film at −12.9 LUFS (the
  reference −12.0), the song bus at −14.4, the game bus at −18.1; a payoff about +3 dB over the song in 1-5 kHz, not +6
  or more.
- **A hard sync gate:** every payoff frame has its sound, with the attack within one frame. **The mix belongs to one
  picture:** it carries the edit list's signature (every slot's take, in and out, source in and payoff frames) and is muxed
  only on a match. A stale mix muxed onto new picture put two clips 21-27 frames off.
- **Keep every game sound** (impact, reward, movement), the hit-confirm tick on 1-2 frames after the payoff sound, one per
  body. **Tails in full;** their body from 120 ms on may sit 2.5-4 dB down.
- **Level what the ear gets, not the asset:** the whole hit (the game bus and any designed layer over 300 ms from the
  attack, 150 Hz-8 kHz RMS) to one film-wide target (the median). Loud hits shed their stings and medals first (up to
  12 dB), then payoff gain; quiet hits raise their attack up to +7 dB over the song. The stem gate said "spread 0.1 dB"
  while the hits as heard spread 6-15 dB, and the owner heard it twice. Levelling took the spread from 16.9 to 12.5 dB;
  the final's own report read 9.8 dB with 57 of 68 within 1.5 dB, and an independent sweep measured a standard deviation
  of 1.27 dB. ±1 dB was not reachable without dropping a payoff under the song or cutting a tail, so the hard gate ran at
  ±3 dB; aim for ±1.5 dB.
- **Secondary sounds under the payoff:** reload, bolt, swap, casing and landing at least 6 dB under the clip's payoff, by
  sample peak and in 1-5 kHz (aim for 7). Footsteps: hold the click at least 6 dB under, keep the body. A seen landing
  gets a small designed sound under the song and the payoff. **No non-payoff transient** (a whoosh, a transition hit, a
  callout) louder than the loudest payoff: the final's sweep found a transition hit louder than every gun.
- **Callouts and voice:** sparing, the game's own voice. Put each line over the real song at 5 offsets and read it with
  two speech recognisers at plan time (one callout read as a slur 2 times in 4 on one model and 0 in 40 on another; three
  masters and two owner files followed). The final callout started 0.14 s (8 frames) after the 10th kill's attack, about
  4 dB softer than in r17 (+2.8 dB over the song in 300 Hz-5 kHz), alone in its window. The recogniser is a
  screen; the owner's ear decides. No closing announcer line ("we dont need the game over voice").
- Remove any stray tone the owner hears ("a weird like beep noise") and search the whole film for repeats on a
  spectrogram.
- Genre: racing levels engine and impact as heard, with gear and tyre sounds 6 dB under the pass; fighting levels hit
  impacts with footwork and cloth under; sports levels the strike and the net, commentary after the net, never over the
  song's vocal; rhythm levels the judgement sound and never touches the song.
