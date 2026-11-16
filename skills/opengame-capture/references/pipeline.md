# Capture pipeline, audit and process

Numbers from OC's launch film (a 62 s 4K60 trailer) and its gameplay montage, filmed on an
M4 Max with 16 cores, and from the test captures of OS, LC and OH, taken on shared Linux
machines with one GPU.

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

## Test captures and judge packets

- Capture from a snapshot of the committed head plus your own files, never the shared
  working tree. LC's slot tool read the tree when the slot was granted, not when the job
  was queued, so an edit made during the wait killed jobs or filmed someone else's
  half-written file.
- Write a manifest per packet: build hash, renderer string, quality, weather, camera per
  frame, the state line, and whether each clip is stepped or real time. OH's judges scored
  a missing clip, a mid-animation title and a stale capture as game faults, and OH's
  rule became a manifest with no file older than the build.
- Generate the capture list from the rubric. OS's council scored more than 20 "gaps" that
  were built items no camera showed.
- Space stills when the game settles UI after input: OS waited at least 1.2 s between
  screenshots and A/B'd inside one boot, because "Numbers across boots move about 20 %".
- Software rasterisers prove function only. Refuse one for anything judged on looks or
  timing, and print the adapter on every run (LC and OH both did).

## Filming the interface with the scene

Stepped capture films the canvas. When a cut, a menu or a HUD change must be judged
against the scene at speed, LC ran a headed browser on the job's own virtual display and
grabbed it with `ffmpeg -f x11grab -framerate 60`, with a 6-pixel white corner mark that
changed every frame as the frame clock. It ran 34 fps at a load of 13 and 4-13 fps at
35-54, so read it for order and offsets, never for frame time. It showed the DOM changing
67-167 ms before the WebGPU picture.

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
- Job slots do not govern the GPU. OH held two of six slots while another project's
  headless browsers kept the card 14-100% busy, so every OH frame-time number is
  contaminated. Record GPU load beside every frame number.
- On LC, at most three browsers fit in one slot (five lost the WebGPU device), and real-time
  films on the loaded machine drew 8-25 fps, which is why motion is filmed stepped.

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
