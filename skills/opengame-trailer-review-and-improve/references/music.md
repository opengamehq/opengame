# Music: choosing, sourcing, generating and measuring the track

"Good music for your trailer is more important than almost anything else" (Derek Lieu, trailer editor). The track is
the film's clock: choose it, measure it and write the beat grid before the shot list.

Most people bring no music and no idea what they want. Decide automatically, or ask once with a default.

## 1. The decision

```
The person gave a track?          -> use it (still measure it; it may be a splice)
The game has its own score/stems? -> a trailer edit of the game's theme beats any library track
                                     (in-game loops are built to loop: re-edit them into an arc)
They own or licensed a catalogue? -> recommend 3 tracks from music they have the rights to use in a trailer
They want generated music and     -> generate 3-5 takes from a composition plan (section 4), on their own
  approve the spend?                 account, after they say yes to the cost
Otherwise                         -> recommend a genre, a tempo and 3 licensable tracks (section 5), and say what
                                     they must download, buy or approve
```

Always present 2-3 measured candidates with a 15 s excerpt each (the excerpt around the drop) and a default. The one
music question the plan may ask is "which of these three", never "what music do you want". Check the licence covers a
trailer and the platforms it will be posted to; save the proof beside the file.

## 2. Genre and tempo from the game's tone

Read the tone from the art, palette, store copy and existing soundtrack.

| Tone | Genre | BPM (feel) | Structure |
|---|---|---|---|
| Military, horror, zombies, grim | hybrid orchestral and synth, taiko, distorted bass, braams | 80-110 (often half-time feel at 140-170) | two stops, sub drops, a big final hit with a tail for the slate |
| Heroic fantasy, sci-fi epic | epic orchestral, hybrid choir | 90-130 | a rising ostinato, a key lift of 1-2 semitones into the finale |
| Arcade, roguelike, shooter, racing | electronic, rock, synthwave, drum and bass | 120-150 (DnB 170-175) | 8-bar sections, the drop on the core verb |
| Cozy, farming, wholesome | acoustic, indie folk, lo-fi, glockenspiel | 70-100 | no braams, no hard stops, a warm tail, few hard cuts |
| Cute, comedy, party | pizzicato, ukulele, chiptune, brass stabs | 100-130 | comedic stops timed to gags |
| Puzzle, abstract, minimal | minimal electronic, ambient pulse, piano | 90-120 | longer shots (3-4 s average), one gentle build |
| Pixel, retro | chiptune or chiptune with real drums | 110-140 | keep the lo-fi palette consistent |
| Rhythm game | the game's own track | the song's | every action on the beat (here it is true) |
| Upbeat co-op action (OG Clash) | driving electronic and orchestral hybrid, instrumental | about 105 | calm intro, hard drop, full action, quiet resolve |

A 4/4 bar lasts 240 / BPM seconds (120 BPM is 2.0 s, 105 is 2.286 s, 90 is 2.667 s). Plan in 4, 8 and 16-bar
phrases. A 60 s trailer at 120 BPM is 30 bars: intro 4, build 8, drop 8, a stop of 1-2, finale 6, and a button (the
final hit with 2 s of tail under the slate).

**What the track must have:** a clear arc (it is not a loop), a real drop where the picture needs energy, at least one
place that can become a designed silence, a resolve or final hit to land the title or button on, and no vocals (they
fight the voice lines). If the track has no risers or fills, the build has to come from picture and sound design; say
so in the plan.

## 3. Music the person already has

Their own score, a commissioned track or a catalogue they licensed comes first. Full songs are not trailer cues: pick
the 60-90 s window with the best arc and edit it to length (section 6). If the catalogue has searchable metadata
(instruments, mood, tempo), search it by the tone table above and shortlist three. Never assume that music made for a
game, or music on a platform the game is published on, is cleared for that game's trailer: confirm the rights.

## 4. Generating a cue (only with the person's account and go-ahead)

Generated music costs money and uses the person's account. Ask before the first paid call, say what it is for and what
it will cost, and record their approval word for word. Put every paid call behind a cap and a ledger.

Music generators that take a composition plan (ElevenLabs Music is one) accept up to 30 sections of 3-120 s
each, with positive and negative styles per section. Put "instrumental" in the positive styles and "vocals, lyrics" in the negative ones, and never name
a real artist (the API refuses). Generate 3-5 takes, measure each (section 7), keep the one whose drop and final hit
land closest to the plan. Generators do not guarantee bar-exact boundaries, so always re-measure.

```json
{"chunks":[
 {"text":"[Intro]","duration_ms":8000,"positive_styles":["instrumental","dark hybrid orchestral trailer","120 BPM","D minor","low string ostinato","distant taiko","sparse"],"negative_styles":["vocals","lyrics","fade in longer than 1 second"]},
 {"text":"[Build]","duration_ms":16000,"positive_styles":["instrumental","rising ostinato","percussion building every 4 bars","risers","tension"],"negative_styles":["vocals","drop","resolution"]},
 {"text":"[Drop]","duration_ms":16000,"positive_styles":["instrumental","full hybrid orchestra hits on the downbeat","heavy drums","distorted bass"],"negative_styles":["vocals","soft pads"]},
 {"text":"[Breakdown]","duration_ms":4000,"positive_styles":["instrumental","sudden stop","near silence","one sub boom","reverse swell into next section"],"negative_styles":["drums","vocals"]},
 {"text":"[Finale]","duration_ms":12000,"positive_styles":["instrumental","biggest section","key lift","driving drums","choir pads without words"],"negative_styles":["vocals","lyrics"]},
 {"text":"[Button]","duration_ms":4000,"positive_styles":["instrumental","single final hit","long reverb tail","ends cleanly"],"negative_styles":["fade out","loop","vocals"]}]}
```

Tell the person once that AI-generated music may not be registrable for copyright in some places. Some music services
have no API or no longer allow downloads; an agent cannot use those.

## 5. Licensable libraries (when there is nothing else)

| Source | Commercial trailer use | Credit | Agent download |
|---|---|---|---|
| Pixabay Music | yes, free; keep the licence certificate for content-ID disputes | no | no API (the person or a browser) |
| Incompetech (Kevin MacLeod) | yes | the free tier requires credit (CC BY); a paid licence removes it | direct file URLs |
| Free Music Archive | only CC BY or public domain (BY-NC bars promotion; BY-ND bars syncing to picture) | per licence | no API |
| YouTube Audio Library | YouTube only | per track | no |
| Uppbeat | the free tier needs credit and excludes paid ads | yes (free) | no |
| Epidemic Sound, Artlist | paid; check the plan covers marketing | no | no |
| Musopen | public-domain classical | requested | no |
| Effects: Sonniss GDC bundles | royalty-free, commercial, no credit | no | direct zips |
| Effects: Freesound | per file (filter to CC0 or CC BY) | per file | API with a token |

Recommend a genre, a tempo and three specific tracks with links; save the licence proof next to the file. Licence
terms change; read the current terms before recommending.

## 6. Editing a track to length (a trailer; a montage never edits the owner's song)

- **Backtime:** align the track's final hit to the title (or button) frame, then remove time from the middle.
- Cut only on downbeats at phrase boundaries (4, 8 or 16 bars), between sections with the same harmony (chroma
  similarity of 0.97 or more). Splice with a 5-20 ms crossfade on a transient, or an equal-power crossfade of 1/8-1/4
  beat ending about 3 ms before the downbeat; hide joins under a hit or whoosh.
- Never cut inside a held chord or a reverb tail. Keep the real ending, never a fade-out.
- If the file ends abruptly on the resolve, take a ring-out from the song's own continuation (OG Clash took 2 s more
  from the full song, so the film ran 62.000 s, 3,720 frames).
- Tempo changes up to about ±3 % are inaudible with a good time-stretcher; larger ones are not.
- A source separator (Demucs) can split drums, bass and the rest, to thin the drums under a line or rebuild an ending.

## 7. Measuring: the beat grid (`grid.json`)

Measure like a music editor, never play audio aloud, and take every number from a script.

1. Decode to 32-bit float WAV with ffmpeg; record the decode convention (MP3 adds about 25 ms of priming; any
   transcode can shift everything by about 1.5 frames).
2. Duration from the decoded sample count; integrated loudness, true peak and loudness range from `ebur128`; momentary
   loudness every 100 ms.
3. **Tempo from attacks in one band** (the hi-hat or snare band), fitted by least squares. Check half and double tempo
   with onset autocorrelation. Do not trust one beat tracker: on OG Clash 32 high-band attacks gave 105.0001 BPM with a
   0.08 ms residual, where two trackers said 105.04 and 105.47 because of phase slips. Useful libraries: madmom
   (downbeats), allin1 (beats, downbeats and labelled sections), librosa, essentia, aubio.
4. **Detect splices.** If the full song exists, cross-correlate pieces of the file against it: each piece may sit at
   its own offset. Build a piecewise clock. The OG Clash "60 s cut" was three pieces of the song slid on the 60 fps
   grid, not on the beat; one global clock would have been 14-39 ms off by the outro.
5. Downbeat phase from section and chord changes; a bar map with each bar's loudness, sub level, air, onsets and
   chroma.
6. Sections and accents: the drop (the biggest rise in 20-150 Hz energy after at least a bar below the median), stops
   (a beat or more where full-band level falls more than 12 dB under the local median), bright bars, half-bar holes
   (where voice lines and reveals go), bass downbeats, the breath bar before the drop, the last hit and the home chord.
   A real drop is bright, has a kick on every beat and sits around −12 to −13 LUFS short-term.
7. Write `grid.json`: `{track, time_base, fps, bpm, beat_period_s, bar_period_s, first_downbeat_s, segments[],
   beats[{t, frame60, bar, beat, seg}], bars[{bar, t, frame60, seg, lufs, sub_db, air_db, onsets_per_s}], sections[],
   hits[{t, frame60, kind, strength}]}`. Shot specs and the edit look positions up here; nothing computes frames from
   BPM.
8. **Click check:** the track at −6 dB with 2 kHz clicks on downbeats and 1 kHz on beats; subtract the track and measure
   its attacks within ±15 ms of each grid beat. Pass when every downbeat you cut on is within a frame (OG Clash: ±7.1
   ms).
9. Note the master level. Commercial tracks are hot (OG Clash's measured −7.7 LUFS and +0.5 dBTP, with 1,645 clipped
   samples); the film mix turns it down.

## 8. Music in the mix

- The music never dips by accident. A master limiter pulling the bed under voice is a bug: peak-control the non-music
  bus against the bed's headroom, and measure the music's fitted level (a dip of 1.5 dB or less).
- Designed silences are allowed and powerful in a trailer: 2-4 "silence then slam" moments (−20 to −40 dB for 0.3-2.4 s,
  then +20 to +46 dB on a reveal). Plan them in the track edit, not as ducks. OG Clash never used one, because a house
  rule said "the music never ducks", and its critic named that the single biggest missing device.
- Under voice, a static EQ dip on the bed (−3 dB around 2.2 kHz, crossfaded over 8 frames) is the only change.
- On a montage cut to the owner's song, none of the silences apply: the song plays untouched and leads the mix.
