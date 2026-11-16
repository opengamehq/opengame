# Measuring a cut: the recipes behind every gate

Every gate in these skills is a number you can get from the rendered file, the take's own capture log, or the
audio. None of it needs a special tool: ffmpeg, ffprobe, Python with numpy and scipy, OpenCV for optical flow, and
librosa for beats and onsets cover all of it. Install them in a private virtual environment for the film. Never play
audio aloud to "check" it: an agent measures sound, it does not listen.

Rules that apply to every recipe:

- Measure the full-resolution review render (or the delivered file), never a proxy or an older cut. A gate passed on
  the wrong file is a gate that did not run.
- Frame numbers are 0-based at the film's rate. At 60 fps, seconds = frame / 60.
- Grab exact frames by index with `select=eq(n\,N)`, never by `-ss` seeking, which lands on the wrong frame.
- Prefer the capture's own logs (camera, speed, probe) over picture analysis when you have them. A picture measure
  guesses at what the log already knows. Use picture measures for files you did not capture (references, a closed
  game, a critic's review).
- Run heavy decodes politely: `nice -n 10`, `ffmpeg -threads 6`, through your machine's job queue if it has one.

## 1. Stream facts, frames and stills

```bash
# size, rate, frame count, colour tags, duration of each stream
ffprobe -v error -count_frames -show_entries \
  stream=index,codec_type,width,height,r_frame_rate,avg_frame_rate,nb_read_frames,pix_fmt,color_primaries,color_transfer,color_space,duration \
  -of json cut.mp4

# one exact frame, and a strip of consecutive frames (8 per row) for motion checks
ffmpeg -v error -i cut.mp4 -vf "select=eq(n\,1234)" -vframes 1 f1234.png
ffmpeg -v error -i cut.mp4 -vf "select=between(n\,1200\,1263),scale=480:-1,tile=8x8" -vframes 1 strip_1200.jpg
```

- Expected: the planned size, `r_frame_rate` and `avg_frame_rate` both exactly the film rate (60/1), BT.709 primaries,
  transfer and matrix, and audio and video durations within one frame.
- If a re-encode leaves the colour tags `unknown`, write them into the stream: for H.264,
  `-bsf:v h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1`.
- **Every frame, never every second frame,** for any shot with a body, a fall, a hero move or a slow-motion span.
  An every-2nd-frame sheet hides a head flipping between two poses on alternate frames; on the OG Snipers montage that
  defect passed the director and a gate and was found after the cut was called final.

## 2. Frozen, duplicate, black and unique frames

```bash
ffmpeg -v error -i cut.mp4 -f framemd5 - > frames.md5      # one hash per frame
ffmpeg -v info  -i cut.mp4 -vf freezedetect=n=0.001:d=0.4 -f null - 2>&1 | grep freeze_
```

- Unique frames: count distinct hashes in `frames.md5`. For footage you captured frame by frame, unique frames must
  equal frames. A frame-count check alone passed an OG Clash cut whose first 402 frames were one frozen picture.
- Duplicate share in slow motion: identical consecutive hashes divided by frames in the slow span. Real simulated
  slow motion has none; cheap interpolated or frame-doubled edits measured 8-10 %.
- Black: decode to 160x90 grey and call a frame black when 98 % of its pixels sit below luma code 26. A run outside a
  designed black slug fails. A film's own "black" check that only looks for fully black frames missed a set that read
  as black on a phone.

```python
import subprocess, numpy as np
w, h = 160, 90
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", "cut.mp4", "-vf", f"scale={w}:{h},format=gray",
                      "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
frames = np.frombuffer(raw, np.uint8).reshape(-1, h, w)
black = [i for i, f in enumerate(frames) if (f < 26).mean() >= 0.98]
```

## 3. Cuts and shot lengths

- If you built the cut from an edit list, take the cut frames from it. That is the truth.
- For a file you did not cut, detect cuts adaptively: per frame, the mean absolute difference of a 160x90 grey frame
  against the previous one, compared with a rolling median of the last 30 differences; a cut is a difference over
  about 4x the median that does not return to the previous picture within 2 frames (that return is a flash or a strobe,
  not a cut). ffmpeg's `select='gt(scene,0.3)'` alone misses 30-70 % of cuts on dark footage.
- Report: cut count, cuts per second, mean and median shot length, share of shots under 0.5 s and under 1 s, the
  longest run of equal-length shots (in beats), and cuts per 10 s window across the film.

## 4. Motion: camera speed, seams, ramps

Camera speed is apparent motion in pixels per frame at 1080p. From a capture log, project the camera's motion. From
pictures, use dense optical flow:

```python
import cv2, numpy as np, json, sys
cap = cv2.VideoCapture(sys.argv[1]); prev = None; rows = []
while True:
    ok, frame = cap.read()
    if not ok: break
    g = cv2.cvtColor(cv2.resize(frame, (480, 270)), cv2.COLOR_BGR2GRAY)
    if prev is not None:
        flow = cv2.calcOpticalFlowFarneback(prev, g, None, 0.5, 3, 15, 3, 5, 1.2, 0)
        mag = np.linalg.norm(flow, axis=2) * 4            # 480 wide -> 1080p pixels
        ang = np.degrees(np.arctan2(np.median(flow[..., 1]), np.median(flow[..., 0])))
        rows.append({"px": float(np.median(mag)), "p90": float(np.percentile(mag, 90)), "deg": float(ang)})
    prev = g
json.dump(rows, open("flow.json", "w"))
```

- Every frame of every shot moves ≥ 1 px/f unless the plan scopes a hold that pays off within 0.3 s.
- Seams: the last 3 frames out and the first 4 frames in. Measure the first frame after the cut too: a rig that starts
  its camera on output frame 0 makes every first frame a still, and critics read those as stutters.
- Direction (a trailer): compare the median flow angle on each side; fail a seam slower than 0.6 px/f on either side or
  more than 90° apart unless the plan states a cause. A montage carries speed across the cut and lets direction differ
  (FAINT's seams sit a median 115° apart); there, fail only a still-to-still seam.
- Speed at a montage cut: over the last 3 frames out and the first 3 in, fail when the faster side is more than 30 %
  above the slower one (or the directions part by more than 30°) while both move over 8 px/f; a cut between two still
  pictures needs no match. Report whether each side's cut frame sits within 2 frames of its own speed peak over ±12
  frames.
- Constant velocity: a third-person shot whose smoothed flow has a coefficient of variation under 0.15 is a robotic
  dolly. No more than a quarter of them.
- Flow around hero cuts: frames −1 and +1 each at least 1.4x the mean of frames −8 to −5.
- Beat-phase motion swing: bin every frame's flow by its phase within the beat (20 bins); swing = the largest bin over
  the smallest. Kaiser's montage edits measured 1.6-3.3x with the peak on the beat; a capture reel cut to a click track
  measured 1.37x with the peak mid-beat.
- **Zoom blindness:** a phase-correlation motion measure on a small decode reads in coarse steps and cannot see a
  zoom. Take camera speed from the capture's camera log before calling a shot dead or a seam regressed.

Ramps:

- From the capture log (best): the simulation speed per output frame. Report the slowest speed, where it sits in the
  shot, the largest one-frame change as a ratio, |s(t+1) / s(t) − 1| (fail over 15 % on a cinematic pair of frames),
  and any run of 20 or more cinematic frames whose speed never moves (maximum over minimum − 1 under 2 %), which fails
  when it follows a payoff.
- From pictures: a ramp is legible when the flow inside one shot changes by 3x or more and the content does not explain
  it (the camera did not simply stop). On the OG Clash trailer six shots had real quarter-speed spans and a blind
  critic's flow analysis still found zero ramps, because the camera moved through them at one speed.
- Slow spans: camera median ≥ 2 px/f, never under 1. Character angular rate (from the probe: the angle each joint chain
  turns per output frame) on no frame under 40 % of the span's median. Under that, the viewer sees a freeze, usually a
  hitstop timer counted on raw time.

## 5. Sharpness, light, colour, flashes

```bash
ffmpeg -v error -i cut.mp4 -vf "signalstats,metadata=print:file=stats.txt" -f null -    # YAVG, YMIN, YMAX, SATAVG per frame
ffmpeg -v error -i cut.mp4 -vf "blurdetect,metadata=print:file=blur.txt" -f null -      # per-frame blur (FFmpeg 5.1 or newer)
```

- Luma at cuts: decode to 160x90 grey as in section 2 and take the absolute difference of the mean of the cut frame c
  and the frame c − 2. Median ≤ 18, none over 40 except cuts the plan declares as story beats. (`signalstats` YAVG is
  in limited range; if you use it, scale the thresholds to about 15.5 and 34.) Predict a fix as an exposure trim on the
  incoming shot. A montage whose approved look alternates dark gameplay and bright cinematics (FAINT's median jump is
  37, with 29 of 68 cuts over 40) waives the gate at gameplay-to-cinematic cuts.
- Sharp subject: every shot's blur within the film's own norm (median plus a margin you set from your sharpest shots).
  A frame with nothing sharp, or a defocused foreground over 10 % of the frame, fails. A Laplacian variance per shot
  (`cv2.Laplacian(gray, cv2.CV_64F).var()`) is the fallback.
- Flat white on effects: decode to RGB and count pixels whose R, G and B are all at or above 225 in limited-range code
  values. ffmpeg's usual conversion to full-range RGB moves 225 to about 244, so threshold the converted frame at 244.
  A hero effect held on screen stays at or under 0.5 % of the frame; measure held effect frames, not the single impact
  flash frame.

```python
img = cv2.cvtColor(cv2.imread("f1234.png"), cv2.COLOR_BGR2RGB)
flat_white = (img >= 244).all(axis=2).mean() * 100     # percent of frame
```

- Grade: content luma Y 40-70 (limited range) for a dark genre, clipping under 3 %. Per act, the mean chroma (U, V)
  vector should move by 4 units or more between acts when the plan has a colour script.
- Flashes: a luma rise of 12 or more over 2 frames away from a cut. Every one gets a designed sound or is deliberately
  silent. Photosensitivity: no more than 3 general or red flashes in any 1 s (WCAG 2.3.1 counts a flash over more than 25 % of
  any 10° field of view, a much smaller area than a quarter of the frame); run an open-source analyser such as EA's IRIS
  on every cut sent to anyone.
- Banding: look at a 4x-contrast crop of every dark gradient (night sky, fog). If it bands, raise the capture bitrate
  (HEVC at 300 Mbps banded least on the OG Clash storm sky) before touching the grade.

## 6. Loudness, holes, the loudest moment, tails

```bash
ffmpeg -nostats -i cut.mp4 -filter_complex ebur128=peak=true -f null - 2>&1 | tail -15        # I, LRA, true peak
ffmpeg -v error -i cut.mp4 -af "ebur128=metadata=1,ametadata=mode=print:key=lavfi.r128.S:file=short.txt" -f null -
ffmpeg -v error -i cut.mp4 -ac 1 -ar 48000 -f f32le mono.f32                                  # samples for numpy
```

- Integrated loudness and true peak on the delivered AAC, not on the WAV you mixed: the encode moves the peak.
- Short-term spread across the body (a trailer): at least 8 LU from the quietest to the loudest section. The OG Clash
  trailer held 2.3 LU for 32 s and read as a flat wall.
- RMS in 50 ms windows: the loudest window's time is the loudest moment. In a trailer it belongs on the boss impact,
  an explosion or the title, never on a mid-film feature. A montage on the owner's song has no slam: there the check is
  that nothing but a payoff outranks the payoffs (section 8).
- A designed hole (trailers only): at least 20 dB under the previous 2 s, 0.3-2.4 s long, followed within 0.25 s by a hit at least
  15 dB up. Inside it, no 25 ms window under −90 dBFS (digital zero reads as a dropout), and the 10 frames after its cut at
  least 20 dB under the 10 frames before.
- Tails: at every cut, the RMS of the 2 frames after against the 2 frames before; a drop over 20 dB is a sound cut dead
  unless it is a designed silence.
- Clicks: at every clip edge, fail a first-difference peak of the samples over 8x the local median within ±10 ms of the
  edge while the window is above −20 dBFS.
- Silence: the quietest 25 ms RMS window of the film stays above −26 dBFS, excluding the first 150 ms and the final
  0.8 s; write a waiver for an intended quiet outro.

## 7. Beats, onsets and sync

```python
import librosa, numpy as np
y, sr = librosa.load("track.wav", sr=48000, mono=True)
onsets = librosa.onset.onset_detect(y=y, sr=sr, units="time")
tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units="time")
```

- Never trust one beat tracker. Refine the tempo from attacks in one band (a hi-hat or snare band), fit beat index
  against attack time by least squares, and check half and double tempo with onset autocorrelation. On the OG Clash
  track 32 high-band attacks gave 105.0001 BPM with a 0.08 ms residual, where two trackers said 105.04 and 105.47.
- Click check: mix 2 kHz clicks on downbeats and 1 kHz on beats at −6 dB over the track, then measure the track's own
  attacks within ±15 ms of each grid beat. Pass when every downbeat you cut on sits within one frame.
- Cuts married to sound: the share of cuts within ±50 ms of an onset of the final mix, against a null made by shifting
  the cut list by random offsets 1,000 times. Aim for 30 % or more and at least 2x the null on the hero section.
- Performed on the beat: the share of action peaks (muzzle flash, impact, jump apex, from the probe or the luma) within
  ±2 frames of a beat. Cuts on the beat are not this.
- Beat lock of a reference: convert each cut time to a phase angle within its beat and run a Rayleigh test (the mean
  resultant length R and its p-value); most official trailers do not lock (p from 0.93 down to 0.003 across the
  measured set), Kaiser's edits do. Also report the share of cuts in the last eighth of a beat.
- Best audio/video shift: slide the cut list against the onset list in whole frames from −6 to +6 and keep the shift
  with the most cuts within a frame of an onset; Kaiser's edits peak at the picture 1-2 frames early.
- A sound's time is its audible attack: the rise into the peak of its 200 Hz-12 kHz envelope, not its broadband peak.
  Dull reports placed by peak started 4-10 frames early on the OG Snipers montage.
- Slow-motion hits: the flash's visual peak can land many output frames after its engine event (about 10 frames at
  0.3x). Measure the flash frame on the picture and put the sound there.

## 8. Sound as heard

- Payoff level as heard: band-pass the delivered mix (or the game bus, then the mix) to 150 Hz-8 kHz and take the RMS
  over 300 ms from each payoff's attack. Table every payoff with the film's median and spread. A gate that measured
  each gunshot asset at a fixed level said "spread 0.1 dB" while the hits as heard spread 6-15 dB, because impacts,
  confirms and medals piled onto some shots and not others.
- Rank every transient in the film; nothing that is not a payoff may be louder than the loudest payoff.
- Designed hits: at least 35 % of their energy in 300 Hz-5 kHz (sub-only hits are silent on a phone) and at least
  6 dB over the music in that band over their first 50 ms, for a trailer. A montage on the owner's song sits payoffs
  about 3 dB over the song in 1-5 kHz instead.
- Music level in the mix (accidental ducks): fit the music stem to the mix by least squares in 100 ms windows. The
  fitted gain should stay flat within 1.5 dB under voice and effects; a dip is a limiter pulling the bed down.
- Song untouched (a montage): align the song file to the music bus by cross-correlation and fit one gain over 1 s
  windows across the film. The gain must hold within 0.5 dB everywhere except an agreed fade at the end; a jump is an
  edit or a duck.
- Intelligibility: run an open-source speech recogniser (Whisper or faster-whisper) on the mixed master, four
  windows per line; at least three of four must read the line correctly. Test callouts over the real song at several
  offsets with two different recognisers before mixing; treat the result as a screen, and the owner's ear as the
  decision.

## 9. Characters, subjects and recurring elements

- Subject in frame: project the probe's subject point (or box) through the logged camera on every frame. A follow
  camera keeps the hero's centre inside 12-85 % of frame height and 5-95 % of width; a drift keeps at least 60 % of the
  subject's box in frame, with no run of 30 frames or more that is 70 % sky or empty ground.
- Gap to a title or insert: project the insert's box and a conservative 3D box around every character and prop on
  every frame; the smallest pixel gap must stay above 0.
- Pose pops: on head, hand and weapon crops, flag frame n when it differs strongly from both n−1 and n+1 while n−1 and
  n+1 match each other (an A-B-A flip). Run it on every body in every slow span, not only on the hips.
- Surface flicker (z-fighting): warp both neighbours onto each frame with optical flow and flag 32x32 blocks that
  differ from both warped neighbours while those agree. Leave out whip frames over 40 px/f, 2 frames either side of a
  cut, HUD zones and close occluders. Scan only the changed spans (diff the frozen edit list against the last checked
  one frame by frame and list the ranges whose take or source frame changed), print the verdict before drawing strips,
  keep a cleared list keyed by take, frames and box, and calibrate the threshold on a frame the owner flagged; an
  uncalibrated scan ranked the one real defect 658th under camera motion.
- Hero jitter: project the hero's position through the camera on every frame, fit a quadratic in game time over 9
  frames, and take the RMS of the residual; pass at 1.5-2.0 px. On OG Snipers it read 51-68 px before the draw-sync hook
  and 0.2-0.4 px after.
- Cross-clip sheets: crop the same region (kill feed, hit marker, score bug, position badge, the hero's weapon, the
  title) from every clip onto one sheet and find each element's anchor by template matching. Report the anchors in
  pixels. One such sheet found in minutes a feed-spacing defect that fifteen deliveries had missed.
- Bot tells: compare the scripted player's view log with 3-5 minutes of a good human playing the same game: time to
  aim, flick size and duration, overshoot, how often the view sits dead still, hit rate. A screen, not a verdict.

## 10. Titles and inserts

- Stillness at rest: render the title shot with the camera locked and its energy off; every frame's hash must match.
- Camera match: reproject markers placed on logged joints through your rebuilt camera; mean error ≤ 0.1 px, maximum
  ≤ 0.25 px, and a background feature track ≤ 0.25 px RMS with no drift.
- Drift of the inserted object ≤ 0.3 px/f against its anchor; crispness (Laplacian variance) at least 0.9 of its hold
  median; size at rest as the plan says.
- Words: crop every word the plan puts on screen from the full-resolution render and read it. The scene graph is not
  evidence: a call to action once faced away from the camera for a whole round while the handoff called it built.

## 11. Delivery checks

```bash
ffmpeg -i delivery.mp4 -i master.mov -lavfi "[0:v][1:v]psnr" -f null -     # PSNR against the master
ffmpeg -i delivery.mp4 -i master.mov -lavfi "[0:v][1:v]ssim" -f null -     # SSIM against the master
```

- Measure PSNR and SSIM before calling a compressed delivery "visually lossless". Both inputs must have the same size
  and frame count: scale one first (`[1:v]scale=1920:1080[m];[0:v][m]psnr`) when the delivery is smaller than the
  master.
- A mix belongs to one picture: hash the edit list (every slot's take, in and out, source in and payoff frames) into a
  signature, store it with the mix, and mux only when they match. A stale mix muxed onto new picture put two clips of
  the OG Snipers montage 21-27 frames off.
- Copying to the owner's drive: write to a plain temporary name (`cut.mp4.part-12345`, never a name starting with a
  dot, which some network mounts refuse), rename, then read the file back and compare size and checksum. Report "not
  delivered" until the read-back matches.
