# The song: measuring it into a film map

In a montage the owner's song is the clock and the lead. It is played, not edited: one gain from start to end and, at
most, a fade over the last half second. Measure it before any shot, and write the film map from the measurement.

## 1. Rights and choice

- The owner's own track wins. Confirm it is cleared for where the montage will be posted (a commercial song on a
  personal upload is not cleared for a game's marketing). Never assume that music made for a game or offered on a
  platform is cleared for that game's montage.
- With no track: recommend 2-3 measured candidates with a 15 s excerpt each and a default, from music they own or
  licensed, or from a licensable library with the licence saved beside the file. Generated music runs only on the
  person's own account after they approve the cost; record the approval word for word.
- A rhythm game whose own chart is not the owner's song: chart the song in the game if it supports custom maps, or mute
  the game and align only shared downbeats.

## 2. Measure it like a music editor

Never play audio aloud; take every number from a script (the measuring chapter has the recipes).

1. Decode to 32-bit float WAV; record the decode convention (MP3 adds about 25 ms of priming; a transcode can shift
   everything by about 1.5 frames).
2. Duration from the sample count; integrated loudness, true peak and range; momentary loudness every 100 ms.
3. **Tempo from attacks in one band** (hi-hat or snare), fitted by least squares; check half and double tempo. Never trust
   a single beat tracker.
4. **Check for splices** if the file might be an edit of a longer song: cross-correlate pieces against the full song and
   build a piecewise clock if pieces sit at different offsets. The OG Snipers song ran on one clock with no splice; the OG
   Clash trailer track was three pieces.
5. The downbeat phase from section changes; a bar map with each bar's loudness, sub level, air, onsets and chroma.
6. Sections: verses and choruses, where any vocal starts and ends, holes and dips, the loudest moment, the key, whether
   the song has an ending, a drop or risers.
7. Write `research/grid.json` with beats, bars and sections in seconds and 60 fps frames. Shot specs and the edit read
   positions from it; nothing computes frames from BPM.
8. **Click check:** the track with clicks on downbeats and beats; measure its attacks within ±15 ms of each grid beat.
   Every downbeat you cut on must sit within a frame.
9. Note the master level: commercial tracks are hot. The OG Snipers film sat at −12.9 LUFS with the song bus at −14.4.

OG Snipers: 137.370 BPM on one clock; a beat of 26.207 frames at 60 fps; bar 1 beat 1 at 0.755 s (frame 45); four 16-bar
blocks of 27.954 s; short-term loudness −10.6 to −8.8 LUFS (flat), with no drop, no riser and no ending; a half-time
feel with the snare on beat 3.

## 3. The film map

- **Map the owner's spoken times onto measured downbeats** and confirm the length in one line. "around 57 seconds" became
  56.663 s (frame 3400), where the hook returns. The rap ended at 84.44 s and the next downbeat, 84.616 s (frame 5077),
  became the door to the end shot. The first brief said both "around 60 seconds" and "around 1:30".
- **Slots of 8, 12 or 16 beats,** each with its grid. A slot's last 2 beats are its last payoff's hit and outside shot,
  or the next clip's entry.
- **Sections drive content:** verse = play, chorus = spectacle. A flat loop has its sections made by the edit and the
  mix. Ambient or orchestral music is cut on phrases, not a grid.
- **Payoff spacing comes from read time** (the grammar chapter): the smallest power-of-two number of beats that covers the
  payoff's read time, the same beat positions in every clip. Half-time feel: payoffs on the snare, motion peaks on the
  kicks. Drum and bass: treat it as 85-87 BPM for payoffs.
- **The ending:** one shot of 3-5 s from the door the song gives (the vocal's end), the song fading under it untouched.

## 4. The song in the mix

- The music leads. Payoffs sit about 3 dB over the song in 1-5 kHz, not 6 or more. The song is never ducked by accident,
  never edited, never dropped to silence ("u cant have music just go completely blank").
- Check on the delivered file that the song is untouched: align the song file to the music bus and fit one gain in 1 s
  windows; the gain must hold within 0.5 dB everywhere but the agreed fade.
- Callouts sit under the song, just after their trigger; test each over the real song at several offsets with two speech
  recognisers before the mix.
- Before any cut is sent, send the owner a 20 s mix check and ask whether the music is the loudest element.
