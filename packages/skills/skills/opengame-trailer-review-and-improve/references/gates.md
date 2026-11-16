# Gates: what every trailer cut passes before a person sees it

The shipped OG Clash trailer is a 6/10 by its owner, 5.5/10 against the Black Ops 6 and 7 zombies map trailers and
4/10 against a Kaiser montage edit by a blind critic. These gates are the measurable difference, built from that
critic's report, the owner's notes and the reference measurements. Several came from four quick test trailers made
afterwards (a platformer, a tactics game, a shoot-'em-up and a racer), each caught by a critic or the owner and not by
an earlier gate; their lessons are folded in.

A FAIL is a finding like a critic's: fix it, or list it as open in the message that sends the cut. Thresholds are for
a trailer of about 60 s at 60 fps; scale them for other lengths. How to measure each one is in the measuring chapter.
Measure on the full-resolution review render and grab frames by index. A montage cut to the owner's song overrides
several of these (no silences, equal spacing, the song untouched): use `opengame-montage-review-and-improve` for those.

## 1. Story and structure

- [ ] **Hook:** the first event (a hit of +15 dB or more, a cut, a flash or a question image) at 0.0-0.5 s; at least 3
      cuts in the first 3 s, or one designed signature move or question image (a calm open passes through this branch,
      not the cut count). No studio logo first.
- [ ] First voice line 0.8-3.8 s after the first picture (if the film has voice); first enemy by about 6-13 s.
- [ ] The story beats are on screen: hook, promise, escalation, **turn**, payoff, **button**.
- [ ] The boss or hero reveal is earned: its first full reveal at or after 40 % of runtime (partial teases allowed).
- [ ] The busiest 10 s window of cutting sits in the last 40 % of the pre-title runtime; the climax cuts at least 1.3x
      faster than the feature section.
- [ ] **Every hero impact shows the impact frame:** no cut within 6 frames before it. OG Clash cut away from its boss's
      fall before the body hit the ground, and a critic called it the biggest single point lost.
- [ ] One breath at 50-70 % of runtime: a single shot of 1.5 s or longer inside a music hole.
- [ ] Each feature is landed, not shown: a 3-4 shot micro-sequence over about 4 beats with its own accent colour and
      sound.
- [ ] A shot that introduces a mechanic runs at least 70-90 frames; a single already-understood action at least about 32.
- [ ] Every item on the must-show list has a shot.

## 2. Music, sync and rhythm

- [ ] At least 30 % of cuts within ±50 ms of an audio onset, and at least 2x the null on the hero section: cuts married
      to hits and whooshes, not only to the beat grid.
- [ ] Action peaks (muzzle flash, impact, apex) within ±2 frames of a beat on hero shots.
- [ ] Montage sections: beat-phase motion swing of 2.0x or more, with the flow peak within ±15 % of a beat.
- [ ] Flow around hero cuts: frames −1 and +1 each at least 1.4x frames −8 to −5 (whips across cuts, not flat).
- [ ] Shot lengths in beats: no single length over 40 % of cuts; no more than 4 equal-length shots in a row; at least 3
      shots of 3 beats or more outside the open and the coda.

## 3. Ramps and camera

- [ ] **At least 6 legible speed ramps** (an in-shot flow ratio of 3x or more that the content does not explain), each
      eased into a hit. Slow holds of 24-36 frames by default; at most one designed slow-motion beat of 0.9-1.5 s (the
      climax, say), never several. 0 % duplicated frames.
- [ ] Slow spans: camera median at least 2 px/f, never under 1; **every character's angular rate at least 40 % of the
      span's median on every frame** (no hitstop freezes).
- [ ] Every frame of every shot moves at least 1 px/f at 1080p (no locked-off frames, no static first person), unless
      a scoped hold pays off within 0.3 s.
- [ ] Seams: **speed cuts** leave at 15 px/f or more over the last 3 frames and arrive at 10 px/f or more over the
      first 4, within 45° of each other; **every other cut** carries at least 2 px/f into the next shot's direction
      (1 px/f in a calm open) or has a stated cause (match cut, sound, look). Fail any seam under 0.6 px/f on either
      side or over 90° apart.
- [ ] **The cut frame moves too.** A rig that starts its camera and its interpolation on output frame 0 makes every
      shot's first frame a still: the platformer test trailer arrived at 0 px/f on 18 of 20 cuts, and critics read
      three of them as stutters. Measure the first frame after each cut, and warm the rig 3 frames before frame 0.
- [ ] At most a quarter of third-person shots at constant velocity (smoothed-flow coefficient of variation under
      0.15). Ease and motivate every move: push on reveals, pull on scale, whip on action.
- [ ] Lens variety: at least 2 long-lens shots, 2 macro inserts and 1 top-down or bird's-eye shot; impacts get a camera
      kick in the path if the owner allows it (never a post shake).
- [ ] Screen direction per the plan's map; no cut between sides breaks the 180° line.
- [ ] First-person share 25-40 % of the film (the action section may reach about 50 %); one set of hands.

## 4. Sound

- [ ] **2-4 designed music holes** (20 dB or more under the previous 2 s, 0.3-2.4 s long), each followed within 0.25 s
      by a hit at least 15 dB up (the references return 20-46 dB). A hole is near-silence, not digital zero: no 25 ms
      window under −90 dBFS inside it, which two critics heard as a dropout on the platformer test trailer.
- [ ] **A designed hole starts on its cut:** the 10 frames after the cut are at least 20 dB under the 10 frames before,
      with no onset inside the hole except its return. On the tactics test trailer the boss silence began 11 frames
      late with a 14 dB chop, because effect tails from the outgoing shot ran into it; release the effects bus over the
      last 6 frames before the cut.
- [ ] **The loudest 50 ms is on the boss impact, an explosion or the title,** never on a mid-film feature. OG Clash's
      loudest moment was a weapon upgrade at 35 % of runtime.
- [ ] Short-term loudness spread of at least 8 LU across the body (no flat wall); loudness range within the track's
      own range (the target is contrast, not a number to game); integrated −14 ±1 LUFS; true peak at or under −1 dBTP
      measured on the AAC.
- [ ] No accidental duck: the music's fitted level dips 1.5 dB or less under voice and effects.
- [ ] Tails: no cut where the outgoing sound drops more than 20 dB within 2 frames, unless it is a designed silence.
- [ ] **A slow-motion hit is heard when it is seen,** within ±2 frames of its flash. At 0.3x a burst's visual peak lands
      about 10 output frames after its engine event, so a cue placed on the event leads the picture.
- [ ] Nothing plays twice: no designed effect where the take's own audio already carries the event.
- [ ] Every luma flash of 12 or more over 2 frames has a designed sound or is deliberately silent; designed hits carry
      at least 35 % of their energy in 300 Hz-5 kHz, sit at least 6 dB over the music in that band, and are in key.
- [ ] Voice density follows the brief; without one, the references' 5-8 lines and no more than 75 words per 60 s. Never
      a wall of lines: gaps of 8 frames or more, no voice on the drop or the hero reveal, each line within 0.3 s of its
      matching picture and on its speaker's shot (or the thing named), at least 3 of 4 recogniser windows correct on the
      mix, no announcer clichés, no other studio's names.
- [ ] A raised designed hit cannot beat the limiter: on the tactics test trailer, raising the title hit moved its 50 ms
      level from −7.8 to −8.1 dB because the peak met the limiter. The premaster's peak normalisation then turned
      everything else up. Loudness over 50 ms comes from energy that lasts (a 70 ms crack decay, a rumble layer), not from
      a higher peak.
- [ ] Lifting every small game event flattens the build: a platformer fires an event every 10-20 frames, and raising
      the effects bus 4 dB at each one took the spread from 8.4 to 6.8 LU and the loudness range from 9.2 to 6.6 LU. Lift by
      about −1 dB outside the first act and −4.5 dB inside it instead. Put the audible hits on a few chosen events
      and measure the spread on an audio-only mix before rendering.
- [ ] The title lands with a layered hit 10 dB or more up; a button sound ends the film (no fade to nothing).

## 5. Picture hygiene: nothing cheap, nothing random

- [ ] Hero effects: flat white at or under 0.5 % of the frame on held frames; thin structured cores; no blurred-circle
      glows; at most 3 full-frame flashes per second; no periodic flicker on held lights. Re-measure after any reframe:
      zooming in from 6x to 8x pushed one fire jet from 0.54 to 0.85 %, and a highlight roll-off in that act's grade (top 1.0
      to 0.87) brought it to 0.47 % without touching black.
- [ ] Every shot has a sharp subject within the film's norm; no defocused occluder over 10 % of the frame.
- [ ] No animation graded NO by the audit on screen; no idle or posed characters; no backs of heads as subject; no
      visible feet on crowd AI; readable space between hero and enemies.
- [ ] No primitive or placeholder meshes (a red sphere for a head gib read as cheap); blood or fog at or under 25 % of
      the frame for at most 4 frames; no see-through or ghosted bodies or pickups; no floating or random props.
- [ ] HUD exactly as the plan says (none by default; only the owner's chosen feedback if they asked); no debug overlays
      (frame counters, build text, page badges).
- [ ] No illegible shot of 10 frames or less (mean luma under 40 with no subject) unless it is a designed black slug.
- [ ] **The subject stays in frame to the last frame of every drift:** at least 60 % of its box inside the frame on
      every frame, and no run of 30 frames or more that is 70 % sky or empty ground. A slow drift up carried the
      tactics trailer's squad out of the bottom of frame for 74 frames while every camera-speed gate passed it.
- [ ] **The hero is in frame on follow shots:** the hero's centre inside 12-85 % of frame height and 5-95 % of width on
      every gameplay frame, measured from the probe projected through the camera. The shoot-'em-up test trailer had its
      ship off the bottom on most follow frames, and only critics saying "no ship in frame" caught it. Fix with a
      constant camera offset per segment, which keeps every seam's speed.
- [ ] No two shots in one act frame the same subject at the same scale.
- [ ] Faces and hero assets match the owner's reference frame in every shot; no invented effects on them.
- [ ] Light across cuts: median luma jump at or under 18; none over 40 except declared story beats.
- [ ] **The background as well as the subject:** no off-tone props, signage, UI-like markers or telegraph circles in
      frame unless they serve the shot.
- [ ] No digital punch-in beyond 1.2x; reframe in the engine instead ("why do the games look so zoomed in?").
- [ ] No banding in dark gradients; check a 4x-contrast crop.
- [ ] Every effect reviewed as full-resolution stills at hero size before the owner sees it.
- [ ] **Photosensitivity:** no more than 3 general or red flashes in any 1 s (WCAG 2.3.1 counts a flash when it covers
      more than 25 % of any 10° field of view, which is far smaller than a quarter of the frame); run EA's IRIS on the cut.
- [ ] **The hero never fails on screen** (a death, a respawn, a hit taken) unless the plan declares a fail beat and the
      owner chose it: no death or respawn event in the probe of any take in the cut. Both blind critics ranked a staged
      death and respawn first on the platformer test trailer, and no earlier gate caught it.
- [ ] **No set reads black:** a black detector (98 % of a 160x90 frame below luma 26) finds no run outside a designed
      slug. A check that only looks for fully black frames missed a stretch of ice cave that read black on a phone.

## 6. Title, end, button

- [ ] The title lands at 84-90 % of runtime (or a deliberate cold-open title), resolves on a beat (±4 frames) and is
      **earned from the world** (it emerges from an ember, a forge, a light) or found by the camera; never a drift-in.
- [ ] It is a 3D object in the world: the per-frame gap to characters stays above 0; extrusion visible; at most 30 % of
      frame width; matched to scenery at the same depth (saturation, black floor, peak below the brightest light in the
      shot); composited before the grade; still at rest (bit-identical frames with its energy off); energy on the beats
      from its first visible frame.
- [ ] End card per the plan's text policy. When text is allowed: 4-6.5 s with the game's name, where to play and "Play
      now" or a date, the "play now" claim checked against the game's real first-load time. When the brief allows only
      the title ("The only text is ... the name of the game ... thats it"), the call to action lives in the post copy
      and the share card.
- [ ] A **button** of 2-7 s after the title or end card, ending on a hard cut and a sound.
- [ ] **Every word the plan puts on screen is on a rendered frame:** crop the title and the call to action from the
      review render at full resolution and read them. On the racer test trailer "Play now" sat on a gantry face turned
      away from the camera for a whole round while the handoff called it built; both blind critics reported no call to
      action.

## 7. Character

- [ ] At least one reaction shot of 1 s or more with readable body acting (a look, a tilt, a take).
- [ ] At least one crew-identity beat (names, a signature line, a spoken title).
- [ ] At least one moment of the game's own humour or personality, if it has any.

## 8. Grade

- [ ] Each act has its own colour world: the mean chroma (U, V) vector moves 4 units or more between acts, per the
      colour script.
- [ ] One or two accent flashes of 3-6 frames on the biggest reveal and the kill.
- [ ] Content luma Y 40-70 (limited range; bright sections built on purpose), clipping under 3 %.

## 9. Delivery

- [ ] QA passes on the final muxed file: frame count, frame rate, BT.709 tags, audio and video within 1 frame, no black,
      frozen or duplicate frames, loudness, clicks.
- [ ] No slate or fallback frame in any cut sent as a full cut.
- [ ] The master is at the plan's format (default 1080p60); PSNR and SSIM of any compressed delivery against the master
      measured before calling it visually lossless.
- [ ] Every watcher, scheduled job and heartbeat torn down at delivery.

## 10. Raw gameplay montage (when the plan includes one)

- [ ] Every gameplay beat fulfils its on-screen objective with the success feedback visible. The OG Clash montage shot
      a boss's visor while the objective on screen asked for its weak spots.
- [ ] No frame of the player firing at nothing, getting hit, stuck, or doing something a skilled player would not.
- [ ] No visible score jumps between cuts that reveal developer setups; no god-mode or debug text.
- [ ] Game music muted in every take (measured), the game's own score laid in afterwards.
- [ ] Subtitles and voice checked for duplicates and bugs; each filed as a game note.
