# Capture pipeline, audit and process

Numbers from OC's launch film (a 62 s 4K60 trailer) and its gameplay montage, filmed on an
M4 Max with 16 cores.

## Audit before planning shots

Before writing a shot list, check each item against the build you will film, and write down
what is missing. OC's film team found most of these one at a time, mid-production.

- A frozen build to film, and how long a private rebuild takes.
- A command channel from the capture script into the game, and its size and deadline limits.
- A host-stepped clock, one time scale, and an audit of timers that read raw frame time or
  count frames.
- A director camera with a cut.
- A HUD mask per element, world-marker flags and a clean-feed switch.
- Scripting for every actor in the shot, friendlies included: spawn, pose, equip by name,
  emote, sit, fire. OC's friendlies could not be scripted at first, and a teleport despawned
  the squad.
- A state probe, checked against a rendered frame.
- A quality lock, with flash settings at full strength (OC's Reduce Flashing has to stay
  off for film, or every flash is cut to 20%).
- Readback, colour tags and the encoder.
- Audio mute flags and stems.
- Seeds and a freeze for ambient events.
- The boot crash rate under load.
- An animation audit on frames for every clip a shot needs: a contact sheet of 8 spaced and
  6 consecutive frames, root and head second-difference, foot slide.
- Hero poses and states that exist in play, not only in cutscenes, and world-state switches
  such as time of day and weather. OC's dawn existed only on the results screen.
- Boot gates: press to start, install prompts, audio unlock, focus and pointer-lock pause,
  service workers, COOP and COEP headers (without them OC fell back to one thread with no
  warning).
- What the game team already built for capture.

## Throughput and output

- Draft at 720p (25-54 fps on a quiet machine), proof risky shots at 1080p, and render 4K
  last, only for the take expected to be selected. Never judge in a draft what must be
  judged at 4K: OC's drafts hid "capsule mannequin" wolves and cheap bloom.
- Keep takes to 2-3 min, plan about 10 takes per kept shot, and keep shot specs as code so a
  reshoot takes about 60 s to set up. OC shot 572 take lines, 23 failed, 401 were kept.
- Master: HEVC Main 8-bit at about 300 Mbps, BT.709, 2.25 GB per output minute. Proxy:
  1080p x264 CRF 23. Delivery: HEVC Main10 at about 90 Mbps (700 MB for 62 s). Hardware
  `hevc_videotoolbox` took about 40 s against more than an hour for x265 under load.
- Music grid: at 105.000 BPM a beat is 34.286 frames at 60 fps. Place cuts from the beat
  times; stepping a whole number of frames per beat drifts. OC landed 31 of 35 cuts within
  2 frames of the grid.
- Check every render by counting unique frames and measuring colour. OC's frame-count check
  passed a cut whose first 402 frames were frozen, because two directors shared one
  minute-stamped work folder.

## Contention

Capture is the heaviest job on the machine, and it slows down when anything else runs.

- OC's 4K capture ran at a median 9.7 fps (minimum 0.47) under contention against 28-37 fps
  alone. With 10 capture agents the load reached 74 on 16 cores and takes crawled at 0.7-1.1
  fps.
- A second GPU browser roughly halves throughput. A background-priority LaunchAgent cut
  capture from about 120 to 2-5 fps within 30 s; `taskpolicy -B` took one run from 5.6 to
  105 fps.
- Film jobs also corrupted the game team's performance numbers: one "regression" was other
  browsers using CPU, and was retracted.
- Agree a written compute share before production. OC settled on 45% film, 45% game and
  10% other work only after more than 40 h of contention.
- Private build trees as full disk clones cost about 26 GB for 3 flags. Keep a disk floor
  (OC's was 4 GB).

## Process with the game team

- Film an immutable served build on its own URL, versioned by hash, with the previous
  builds kept. The film will lag the live game.
- Notes to the game team go in one append-only file: the owner's words, the evidence frame,
  the file and line at the frozen build, what fixed looks like, and the shot it serves.
  Notes that named a cause and a number were the ones that got fixed. OC shipped 10 of 11
  film notes in about 36 h once one integrator gave each note its own stream.
- Write film fixes as single flags with before and after crops, so the game can adopt them.
- Persist every override a take depends on in its spec. Keep rejected takes, so a revert is
  a change of select.
- Stand up a footage log, a review page and a latest-preview link in the first hour, and
  load the link yourself before sending it.
