# Finishing: edit, grade, mix, render, QA, delivery

The OG Clash pipeline was ffmpeg and Python, engine-agnostic, and one command made a cut: shots and selects into an
edit list, a frame-exact conform, the grade, the mix, the render, then QA on the final file. Build yours the same way:
a script per stage, each restartable, and one command that runs them in order.

## 1. The edit

- **The edit list comes from the plan and the selects.** A select fixes a 1:1 mapping from take frame to timeline frame
  (offset = timeline in − take in). The edit never changes speed: speed lives in the capture. A select may carry
  segments (two takes in one slot).
- A slot with no select becomes a labelled slate ("SLATE, NOT FOR DELIVERY") so a watchable full-length cut exists from
  hour one. A cut sent to the owner as a full cut never carries one.
- A fallback select lets a new slot show a neighbour's take until it is shot.
- Story beats are the only cuts allowed big luma jumps; list them.
- An overrides file holds per-shot exposure, temperature and tint trims, slips, the take-audio choice, gains, and the
  title's frame range and stage.
- **Re-slotting:** move cuts 1-2 frames before beats or half-beats, keep payoffs inside their slots and covered by take
  handles, write a reason per change, never more than 4 equal-length shots in a row.
- **A cue sheet keyed to payoffs:** sound cues reference the select's payoff frames (the nearest within 15 frames), so
  sound follows re-shot picture. Re-key the cue sheet whenever selects or title strikes change.

## 2. Frame-exact conform

- Decode each event with its own ffmpeg, trimming by decoded frame index (`trim=start_frame=..:end_frame=..`), never by
  time seeking; count the raw frames in your script and abort on any mismatch; feed one encoder at a constant 60 fps.
  Self-test: sample frames must be bit-identical to the source.
- Frame-exact stills anywhere: `-vf "select=eq(n\,N)"`, never `-ss`.
- Plates for CG inserts: convert with `scale=in_color_matrix=bt709:in_range=tv:flags=accurate_rnd+full_chroma_int,format=rgb48be`
  (a mixed extraction differed by up to 168 of 255).

## 3. Grade

- Per-act 3D LUTs (OG Clash built 65³ LUTs in Oklab on the engine's output) plus per-shot exposure, temperature and tint
  trims. A colour script of one sentence per act.
- Light across cuts: median luma jump at or under 18, none over 40 except declared story beats; predict trims by
  applying them to the two frames at the cut before rendering.
- No added grain, flares, chromatic aberration or vignette on top of game art; the game's own bloom stays.
- Titles and CG inserts go in **before** the grade; a studio mark, if the owner wants one, goes **after** it at encode.
- A montage in a named editor's style may have a finishing layer (levels, a curve, glow, punches); that is set by a look
  test with the owner and runs once per cut (`opengame-montage-make` covers it).

## 4. Mix

- **The bed:** the music at one constant gain. Designed silences are edits of the track, not ducks.
- **The bus:** game sound, effects and voice peak-controlled as one bus keyed to the bed's headroom, big hits exempt.
  Measure the music's level in the mix: a master limiter alone pulled OG Clash's music down 3.5-3.9 dB under every peak,
  an accidental duck.
- **Game sound:** 0 to +6 LU over the bed in action (OG Clash needed +5 dB with per-shot trims).
- **Tails:** a 0.4 s raised-cosine continuation after each take group's last sound; slow-motion tails inside a group stop
  5 ms before the next onset so no transient plays twice. No cut where the sound drops more than 20 dB within 2 frames.
- **Slow motion:** the real-time sound once, unstretched, anchored so the payoff sounds on its frame.
- **Never double a sound:** skip a designed cue where the take audio already carries the event (track each cue's source:
  the take, the re-aligned take, a file, a generated sound). OG Clash's first round played 47 cues twice.
- **Designed hits:** on every big picture event, at least 35 % of the energy in 300 Hz-5 kHz, at least 6 dB over the
  bed in that band, on the attack, in key, with a sub layer 14-21 dB under. Every flash gets a sound or is deliberately
  silent.
- **Voice:** a static −3 dB presence dip on the bed around 2.2 kHz under each line, crossfaded over 8 frames; check each
  line with a speech recogniser on the mixed master, four windows per line, three of four correct.
- **Electric effects:** a static −3 dB shelf at 9 kHz on your own layers, never on take audio.
- **Write every generated audio file atomically** (temporary name, then rename). A mix that read half-written files
  produced a squashed master (−14.4 LUFS, 4.3 LU range).
- **Master:** −14 LUFS ±1 integrated and true peak at or under −1 dBTP on the AAC delivery; two limiters around a linear
  gain with about 1 s of pre-roll; never ffmpeg's `loudnorm` filter, in one pass or two (its dynamic mode flattened drops by 3-4 dB).
  The loudness range follows the track: document a waiver rather than leaving a gate red on every cut.
- A montage on the owner's song mixes differently (the song leads, untouched): `opengame-montage-make` covers it.

## 5. Render

- **Review cuts at 1080p at the master frame rate:** x264 `-preset slow -crf 18 -tune film` (about 17 Mbps; a fast
  preset at CRF 15 was 29 % bigger). Under heavy load a fast preset is fine for review; the master path stays separate.
- **The master** at the plan's format, 1080p60 by default. A 4K master renders in 600-frame chunks, each reused when its
  frame count matches (a later shot swap re-rendered one chunk in 344 s). Refuse to build a 4K master from 1080p
  proxies.
- **Unique work folders and a lock** before cutting (process id plus seconds, never a minute stamp): two director
  processes started in the same minute shared a work folder on OG Clash and produced a cut of 3,319 of 3,720 frames with
  a frozen opening. Keep the work folder until QA passes on the final file.
- **Cap threads** (`ffmpeg -threads 6`) and send heavy jobs through your machine's job queue if it has one; an uncapped
  encode at 880 % CPU froze the game team's work.
- **Long jobs survive session restarts** under a service manager (a user launchd agent on macOS, a systemd user unit on
  Linux) rather than an agent's background shell. On macOS use a LaunchAgent with an interactive process type and
  `launchctl bootstrap`; a job started with `launchctl submit` runs at background priority and crawls. On completion, stop it **and** delete its definition: OG Clash's jobs
  set to run at load re-ran five times after delivery, rewriting the edit list and the mix.
- Copy from slow external drives into internal disk before encoding (a 4K encode reading from a spinning drive took 54
  minutes against about 40 s locally), then copy the result out and verify it.

## 6. QA on every cut, on the final muxed file

| Check | Test |
|---|---|
| stream | frame count against the edit list; real and average rate exactly the film rate; BT.709 tags; audio and video within a frame |
| frames | black frames; frozen runs of 24 frames or more; exact duplicates; unique frames equal frames |
| light | the luma jump at each cut (the 160x90 grey mean of the cut frame against the frame two before it): median ≤ 18, none over 40 unless a story beat |
| loudness | −14 ±1 LUFS (a trailer), true peak ≤ −1 dBTP on the file's own AAC, loudness range (waiver documented) |
| silence | the quietest 25 ms RMS window stays above −26 dBFS, the first 150 ms and the final 0.8 s excluded (document a waiver for an intended quiet outro) |
| clicks | at every clip edge: no first-difference peak over 8x the local median within ±10 ms of the edge while the window is above −20 dBFS |
| moved cuts | strips at every cut that moved since the last cut; every changed shot's frame on a sheet |

The picture check inside OG Clash's render step passed on the broken cut with the frozen opening; only QA on the final
file caught it.

## 7. Delivery

The master format is chosen in the plan (default 1080p60). OG Clash was mastered at 4K60:

| Deliverable | Settings | OG Clash |
|---|---|---|
| 1080p60 review | libx264 slow CRF 18 tune film, High profile, yuv420p, GOP 120, BT.709, AAC 320k, `+faststart` | 134 MB, about 17 Mbps |
| 4K60 archive master | libx265 medium CRF 12, Main10, yuv420p10le, keyint 60, `hvc1` tag | 1.23 GB, about 158 Mbps |
| 4K60 delivery | hardware HEVC Main10 (on macOS `hevc_videotoolbox -profile:v main10 -pix_fmt p010le -b:v 90M -maxrate 140M -bufsize 180M -tag:v hvc1`) with BT.709 tags, or x265 CRF 16 with `-tag:v hvc1` | 700.6 MB, 90 Mbps |
| web | 1080p60 x264 CRF 20-23, max rate 7 Mbps; 720p CRF 26 for an archive page | 56 MB, 8-18 MB |
| inline chat preview | 720p, under 50 MB | |
| social | 30 s and 15 s in 9:16 with burned-in captions | |

**Measure "visually lossless" before claiming it:** PSNR and SSIM of the delivery against the master. Hardware HEVC
was about 100x faster than x265 under load. HEVC in an MP4 needs the `hvc1` tag or QuickTime, Safari and iOS will not
play it. Settle a target size or bitrate per deliverable in the plan ("optimize it
... so its not a crazy file size").

## 8. A studio mark (only if the owner wants one)

If the owner asks for a studio or publisher mark on every frame: draw it once at the master resolution and downsample
it, overlay it as a full-frame straight-alpha image at encode (after the grade, never graded), one flat white with no
shadow, small (OG Clash's avatar was about 3.5 % of frame height, with margins of about 1.9 % of the width and 3 % of the height), with a
switch that renders without it. A blind critic flagged the mark sitting over the title and the end card; offer to hide
it there.
