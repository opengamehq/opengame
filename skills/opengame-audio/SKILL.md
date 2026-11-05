---
name: opengame-audio
description: Make a browser game sound finished. Covers sound from the first press, a check that the shipped build plays sound on every device, listening before shipping, harshness and loudness gates, a distance model that keeps far sounds audible, voice priority, reload sounds on the beat, a master chain, buses and shuffled takes. Use when the person says the game is silent, silent on iPhone, sounds cheap, harsh or thin, clips, gets muddy in fights, repeats sounds, or needs music or sound effects.
metadata:
  version: "1.0.0"
---

# Audio

Sound is most of the distance between a prototype and a game. Our three reference games
ship between 337 and 7,459 audio files; our first prototypes shipped 34. Count is not
the goal, though. Four hundred samples played without a chain, a voice budget and a
no-repeat rule sound worse than forty played through them.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes.
[helpers/audio-chain.js](helpers/audio-chain.js) builds the chain, the buses and the
voice pool; its `selfTest()` plants a bus that bypasses the limiter, a clip curve that
adds gain, a duck with no lead and an oldest-voice pool, and proves each is caught.

The first seven rules come from OC, where sound was raised about 13 times (silent
loading, missing effects, no gunfire on iPhone) and harsh sounds 4 more. Start there.

## Rules

### Sound from the first press, loading screen included
- **Invariant:** The game makes sound from the player's first press: the loading screen, the title and every menu have music or ambience, and the first shot of the first run is heard.
- **Technique:** A press-to-start screen over key art gives the browser the gesture it needs while the download runs. Create and resume one audio context inside that first key or pointer handler, with no separate "tap for sound" prompt. Load the menu set first, then the sounds the player makes (the equipped weapon's bank) ahead of the rest of the run's audio. Hand the loading music to the menu theme with a crossfade, and log when the theme is up so the two never overlap. In three.js, call `THREE.AudioContext.getContext().resume()` in the handler; `AudioListener` uses that shared context.
- **Reference configuration:** OC: the press lands a hit on the music downbeat 60 ms after the key; loading music at -20 LUFS over a -27 LUFS bed, a tick for every 5% of progress and an anvil hit at 100%, then a 3 s music fade and a 5 s bed fade into the menu theme. Tiered sets: menu 10.4 MB, combat core 22 MB. A gun granted in the first 20 s of a run was silent for 11 to 16 s behind 35 MB of queued audio, until a trickle loader moved the first fire cue from 12.0 s to 2.1 s at 3 MB/s. The owner asked three times: "even our loading screen should have sfx and music and environmental ambience sounds too ... not just be silent".
- **Applies when:** Every browser game with sound.
- **Verify:** In a fresh profile on a throttled connection, press a key on the first screen and record the tab: sound starts on the press, the loading screen is never silent, and the first shot of the first run is audible.

### The shipped build makes sound on every platform
- **Invariant:** On every device and browser the game ships to, the deployed build plays the menu, the player's weapon and the voices at the levels the mix intends, and a build that cannot play sound tells the player.
- **Technique:** For each device and browser in the test matrix, record the deployed build through real input (menu, first shot, reload, a voice line) and measure loudness per segment; a silent segment fails. Resume the audio context on every touch, on visibility change and after an interruption, and treat a suspended context as a fault, never as the player's mute. If a fallback build has no sound, show a notice. Prove a mute setting by measured loudness, not by the click that set it. Emulators and headless captures are muted or lie about audio, so they prove nothing here.
- **Reference configuration:** OC: real iPhones had no in-game sound across at least three builds ("when I started the game there was ZERO sound"; later "game audio was playing but NOT gunfire sounds") while emulation passed. OC's single-threaded build had no audio at all, so iPhones moved to the threaded build (R169). A latency clamp set below the mixer's lead garbled audio on every device and was reverted (R195). OC's proposed fix was a 1 s resume watchdog plus `navigator.audioSession.type = "playback"` before creating any context; the notes do not record whether the session type helped. On the gameplay montage the settings-menu mute clicks never landed, found only when loudness was measured (-24.5 against -37.4 dB), and all 9 segments were reshot. The owner raised iPhone sound about 7 times.
- **Applies when:** Every game with sound, and above all games that ship to phones.
- **Verify:** On a real iPhone and a real Android phone, open the live URL, play to the first reload and record: gunfire, reload and a voice line are each audible. Turn sound off in settings and measure the drop.

### Nobody ships a sound nobody listened to
- **Invariant:** Every sound in the build has been heard in the running game by a person before it ships. Meters gate a sound; a listener decides it.
- **Technique:** Meter first (loudness, peak, harshness), then record a short clip from the game in context at a normal listening level and send it to a person with a plain question. Keep a listened-by field per cue in the registry; a cue with no listener is reported as unheard. An agent cannot listen, so it hands over the clip and reports the sound as unheard until a person answers. A spectrogram is evidence for a meter, not for taste.
- **Reference configuration:** OC on 16 Oct: "None of the audio has been listened to by a person: every pick was made by measurement." The wonder weapon's third sound was pushed to -12 LUFS with stacked crackle and whistle, marked "Not listened to by anyone", and rejected as "too aggressive" and "distorted"; its crest factor was 9.7 against the reference's 13.8.
- **Applies when:** Every game with sound.
- **Verify:** Every cue in the registry names who heard it and when, and links the in-game clip they heard.

### Every sound is clean
- **Invariant:** No sound is harsh, distorted, clipped or unpleasant to sit through, including the ones that repeat fastest, and one harsh sound starts a sweep of its whole class.
- **Technique:** Batch-meter every file for true peak, loudness, crest factor, the share of energy in the upper-mid presence band, hiss, DC offset and clicks at the loop point, and flag outliers against their family. Fix at the file. When anyone calls one sound harsh, meter and audition every sound in its class. Rapid-fire weapons get a short sound per shot and a cap on overlapping shots. Player characters have no breathy, moaning or groaning takes; a death is a short clean grunt. A soft tonal design beats stacked crackle, sizzle and whistle layers.
- **Reference configuration:** OC's owner: "the death machine SFX is OBNOXIOUS ... every sound needs to be elegant and clean and pleasant to the ear ... make sure no others like that!" Its 1.8 s file fired 25 times a second, about 12 dB louder than the Thompson, with 39% of its energy at 2-5 kHz (Thompson 12%); a 2 s in-game spray went from -13.0 LUFS and 23% to -17.7 LUFS and 5.4% (Thompson -16.4 and 9.7%, M1911 -17.2 and 5.5%). The sweep softened 54 more files and fixed 6 clicks at loop points (R167-R169). A death groan that "sounds sexual" became a 210-240 ms "oof". Gate: true peak at or under -1 dBTP, codec SNR at least 33 dB, 2,895 files with none clipped; rapid fire caps simultaneous shots at 2 and plays a casing every 6th round.
- **Applies when:** Every game with sound; weapons and voices first.
- **Verify:** The batch meter prints every file's numbers and the outliers in each family; a person listens to every rapid-fire weapon held down and to the loudest ten seconds of the busiest fight.

### Far sounds the player needs can be heard
- **Invariant:** Before anyone balances levels, every sound the player needs is audible at the distances the game is played at, and the mixer plays the cues the game sends.
- **Technique:** Check the distance model first: one falloff for every source makes the biggest sources inaudible at the distance they matter. Set reference distance and rolloff per sound family, keep the player's own hits above a floor, and count cues requested against cues played during a busy fight. In three.js, set `PositionalAudio.setRefDistance`, `setRolloffFactor` and `setDistanceModel` per family.
- **Reference configuration:** OC: one 3 m falloff left the boss at -28 dB. Per-family falloff became boss 30 m, explosions 12 m, zombies 6 m, impacts 5 m, with the player's own hits never below -8 dB. The mixer had been dropping 75% of cues (peak 41 voices, creature vocals capped at 4 with 13 dropped). The whole mix moved from -24.9 to -16.9 LUFS. The owner: "i dont hear any sfx really in game?"
- **Applies when:** 3D games with positional sound.
- **Verify:** Stand at the far edge of the arena and trigger the boss's loudest attack; log requested against played cues over a minute of the busiest fight.

### Gunfire beats groans
- **Invariant:** When the voice budget is full, the sounds the player causes and needs (their weapon, hits, interface, music, announcer) always play, and enemy vocals give way first.
- **Technique:** Priority classes in the voice pool. The player's weapon, hit confirmation, interface, music and announcer are never culled; enemy vocals are capped to the nearest few within a radius; everything else competes by audibility as in the stealing rule below. Phones keep the same classes with a smaller pool.
- **Reference configuration:** OC: player fire, hits, interface, music and announcer always mixed; enemy vocals capped to the nearest 6 within 20-30 m; about 40 voices in the mix. Before the classes existed, iPhones played "game audio ... but NOT gunfire sounds".
- **Applies when:** Games where many sounds overlap.
- **Verify:** Spawn the largest horde and hold the trigger; the pool log shows no player shot refused or stolen, and a recording of the fight has every shot in it.

### Sound follows the animation beat by beat
- **Invariant:** Every sound tied to a visible action lands on the frame of its contact, beat by beat, and stops when the action is interrupted.
- **Technique:** Author multi-part actions (reloads, inspections, interactions) as named beats with times exported from the animation into one shared file. Audio schedules each beat from that file on the audio clock, never as one whole-action file or a guessed delay, and cancels the remaining beats when the action is cancelled. Subtitles take the clip's real length and close when the line is cut.
- **Reference configuration:** OC's fire cue rises within 3 ms of the shot, and its reload sounds land within 12 ms of hand contact after running up to 0.74 s late; the beat specs and per-gun numbers are in `opengame-weapons`. The owner: "sweat the details with micro sfx even for like each part of a reload animation".
- **Applies when:** Games with authored animations that make contact sounds.
- **Verify:** Frame-step a recording of every reload beside its waveform and measure each beat's offset from its contact frame.

### Everything goes through one master chain
- **Invariant:** Every sound the game makes reaches the speakers through one chain that holds overlapping sounds together and puts a ceiling on the output.
- **Technique:** Master gain into a glue compressor, make-up gain before (not after) a limiter so its threshold is the real ceiling, then a soft clip for the transient the limiter's attack lets through. Route HTML audio and video through the same graph if they belong in the mix. `createMasterChain` in the helper.
- **Reference configuration:** AW and MC: glue at -15 dB, 4:1, knee 14, 6 ms attack, 180 ms release; limiter at -1.2 dB, 20:1, 1 ms, 60 ms; make-up 1.25 before the limiter (after it, the real ceiling rose to about +0.7 dBFS). SR glues more gently at -12 dB, 2:1. AW measured three 50 ms windows a minute peaking above 0 dBFS after the limiter alone.
- **Applies when:** Every game with sound.
- **Verify:** `chainProperties(chain)` returns no failures, and a recording of the busiest moment in the game has no sample above the ceiling.

### Buses with separate volume and duck
- **Invariant:** Music, ambience, effects, voice and interface sounds can each be turned down by the player and ducked by the game, and the two never fight.
- **Technique:** Each bus is a volume gain into a duck gain into the master. The player's slider writes the volume; the game's ducking writes the duck. Mute and pause apply to every bus without changing the saved levels.
- **Reference configuration:** AW's buses are sfx, music, voice and ui, with ambience riding under the music slider but ducking on its own. OC ducks music 5 dB on big hits; its announcer ducks effects 4 dB and music and voice 6 dB.
- **Applies when:** Every game with more than one kind of sound.
- **Verify:** Set the music slider to half, trigger a duck, let it release: the music returns to half, not to full.

### A duck lets its cause be heard first
- **Invariant:** A sound that lowers the rest of the mix is itself heard at full level before the mix drops.
- **Technique:** Hold the ducked bus at unity for a short lead, then fade it down; overlapping ducks keep the deepest.
- **Reference configuration:** AW's concussion duck with no lead muffled the very gunshot that caused it, which made its loudest rifle the quietest weapon at its own shooter's ear. A 0.12 s lead recovered 4.8 LU and 7 dB of true peak on that shot and left every other case unchanged.
- **Applies when:** Any duck triggered by a game sound, such as concussions, voice lines or big impacts.
- **Verify:** `duckHoldsLead(chain)` is true; render the triggering sound with and without the duck and compare its loudness.

### Busy moments steal the quietest voice, gently
- **Invariant:** When too many sounds play at once, the least audible one gives way, without a click, and information-bearing sounds are the last to go.
- **Technique:** A bounded voice pool; when full, fade the quietest unprotected voice over a few milliseconds and start the new one after it. Reclaim voices by their scheduled end time, not by `onended`, which a busy event loop delivers late. Protect hit confirmation, warnings and voice. `createVoicePool` in the helper.
- **Reference configuration:** AW's 72-voice pool saturated in 0.16 s with twelve combatants. Taking the oldest voice with a hard stop retired voices as loud as the mix average (101%) and clicked; taking the quietest with a 6 ms fade retired voices at 46% of the mix average.
- **Applies when:** Any game where many sounds can overlap.
- **Verify:** `stealFailures(stealBehaviour(...))` is empty; drive the busiest fight and count voices stolen, refused and protected voices cut.

### Takes in shuffled bags
- **Invariant:** A sound that repeats often never plays the same take twice in a row, and frequent actions have enough takes that the player stops hearing a sample.
- **Technique:** Several recorded takes per frequent event, played from a shuffled bag that empties before refilling. Spend the count where repetition is: footsteps per surface, impacts per material, actions at several strengths, beginnings, middles and ends. Voice lines also get a recurrence lockout and a chance to fire, so frequent events do not talk every time.
- **Reference configuration:** Our originals budget 50 to 400 recorded samples per game, spent where the game earns it. AW's hit, headshot and kill confirmations each have three takes in bags, so all three are heard before any repeats. Per-play variation of pitch 2 to 3% and gain 1.5 dB on top (DK, MC). OC's voice director: no-repeat bags, a 5-minute recurrence lockout, 8-15 s of quiet after any line, kill lines on 14% of kills and reload lines on 18%, 474-522 lines per character over 77 events, and 6-8 takes for frequent sounds. The owner had said "the character is also repeating stuff too much".
- **Applies when:** Every game with repeated actions.
- **Verify:** Log the take played for a hundred footsteps: no immediate repeats, and every take used.

### Loudness is measured, per family
- **Invariant:** Every shipped audio file has a measured loudness and true peak, grouped by family and normalised to that family's target after the codec, and the measurements cover exactly the files that ship.
- **Technique:** Generate a loudness manifest from the files on disk, never by hand, with integrated or short-window loudness and true peak per file, and fail when a file and the manifest disagree in either direction. Normalise each family to its target, level-match takes within a class, and measure again after every re-encode. Then audition the assembled mix, because per-file numbers do not balance a game.
- **Reference configuration:** AW's manifest is generated from the library and its check reports how many files it measured, because an empty library and an empty manifest otherwise agree perfectly. AW's confirmation levels: hit about -25 LUFS, headshot -23, kill -21, measured over the loudest 200 ms. OC's targets: weapons -17 LUFS (-19 to -16), voice -19, steps -25, ambience loops -26, ceiling -1 dBTP, one-shots on their loudest 200 ms K-weighted window; takes within a class level-matched to 0.1 dB; a new gun at or below the existing ones; fire 13-15 dB over the ambient bed. OC generated 1,275 files for $11.70 at the start and shipped 2,895; spend and credit rates are in the mix notes.
- **Applies when:** Every game with recorded audio.
- **Verify:** The manifest check prints a file count equal to the number of shipped audio files, and every family's median is on its target.

### One ranked confirmation channel
- **Invariant:** Hit, headshot and kill confirmations never pile up; a stronger verdict replaces a weaker one, and a weaker one never plays over a stronger one.
- **Technique:** Treat confirmations as one priority channel on a dry, protected interface bus with no world position. A new cue of equal or higher rank fades its predecessor out quickly; a lower one waits. Collapse duplicate reports from one frame.
- **Reference configuration:** AW: kill over headshot over hit, a 12 ms fade on replacement, a 28 ms floor for ordinary hits and 45 ms for headshots and kills, with a 100-event burst test.
- **Applies when:** Games with hit confirmation.
- **Verify:** Fire a shotgun into a target that dies: one kill cue plays, no hit cues under it.

### Distance is authored, not filtered
- **Invariant:** A far sound is a different sound, not the near one made quieter.
- **Technique:** Distant takes for loud sources, plus physically based air absorption that removes high frequencies with distance, attenuation from current positions, occlusion, and a reverb per zone. Keep interface sounds and narrators out of the world.
- **Reference configuration:** AW: at 300 m, 8 kHz is 45 dB down while 250 Hz loses 0.3 dB; its distant weapon set varies by duration and low-frequency content, from a pistol's 0.22 s to a launcher's 0.70 s. AAA bar values: gain `ref / (ref + k (d - ref))`, a low-pass from 16 to 20 kHz near to 1.5 kHz at 40 m, occlusion about 0.43 of gain, zone reverbs from 0.38 s (courtyard) to 2.2 s (hall).
- **Applies when:** 3D games with sounds at distance.
- **Verify:** Record the same source at near, mid and far range, and behind a wall; each is audibly different in tone, not only level.

### The audio clock schedules sound
- **Invariant:** Every sound that must land at a time is scheduled on the audio context's clock, not on a timer.
- **Technique:** Schedule against `AudioContext.currentTime`. Where a long sequence must not reserve voices up front, wake a little early with a timer and place each cue exactly on the audio clock. Cancel both the scheduled sources and the pending wake-ups.
- **Reference configuration:** AW's reload reserved one voice per phase for its whole length, 132 voices against a pool of 72 at twelve combatants, until it moved to a 120 ms look-ahead. AW found four separate faults from gating sound on a clock other than the audio clock.
- **Applies when:** Every game with timed or sequenced sound.
- **Verify:** Grep for `setTimeout` near a `start(` or `play(` call; each one is a look-ahead wake-up, not the timing itself.

### Every file has a caller, and music streams
- **Invariant:** Every audio file in the build is reachable from a call site, and long music never sits decoded in memory.
- **Technique:** One cue registry that names each file and the event that triggers it, and preload derived from that registry. Stream music through a media element routed into the music bus; keep short cues in a bank that decodes on first use, and warm the first use of a rare sound the round before it plays.
- **Reference configuration:** AW shipped 35 weapon files no weapon reached. A decoded sound is float PCM, about 23 MiB per stereo minute; ST found one game spending 134 MiB that way before its first frame of play. AW measured 266.9 MB of decoded audio against a 200 MB budget. In OC the first play of a rare sound was silent until warmed.
- **Applies when:** Every game with recorded audio.
- **Verify:** List audio files and grep each name in source; list decoded buffers at runtime and sum their sizes.

### Open the front door once
- **Invariant:** Every public method of the game's audio engine runs without throwing on a live engine.
- **Technique:** A smoke test that calls each method once with plausible arguments against a real or stub context and counts the sources it started, so a run where everything early-returns cannot pass.
- **Reference configuration:** AW's audio had five green checks while a deleted constant threw on the first footstep, inside the frame update, which players reported as the game jittering.
- **Applies when:** Every game with an audio module.
- **Verify:** The smoke test reports zero errors and a non-zero count of sources started.

## Further reading

Where the reference numbers came from, the soft-clip measurement, the sound families a
shooter needs and what OC's library cost: [references/mix-notes.md](references/mix-notes.md).
