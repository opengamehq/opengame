> Carried from `opengame-rhythm` 1.0.0. Read it when: Make a rhythm or music game whose charts feel right to play. Covers owning the music so charts match it, nested levels, hand limits, keys that follow pitch, chords and holds, a setlist career, the audio hardware clock, hit windows, calibration, a board nothing covers, star power, mix timing and checking every chart through the game. Use when the person says the notes feel random, Expert is impossible, hits feel late, or asks for a rhythm, music, lane or beat game.


# Rhythm games

A rhythm game lives or dies on one feeling: the keys you press are the music you hear.
Every other part, the painted world, the crowd, the effects, is judged after that, and
a player who feels "random keys at random times" stops in the first song. OH spent most
of a day and a half learning that the hard part is not timing, which was solved early,
but choosing which notes to chart, and that the way to choose them is to own the notes.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes. The
measured genre densities, the reduction weights, the hand gates and the key mapping are
in [references/charting.md](references/charting.md). The song clock, calibration, the
count-in and codec delay are in [references/timing.md](references/timing.md). Mixing and
mastering in general are in `opengame-audio`; hit feedback in general is in
`opengame-game-feel`.

**Never fetch or copy a commercial game's audio or charts.** Calibrate against aggregate
statistics (notes a second, gaps, sustain share) and against music you have the rights to.

## Rules

### Chart only music whose notes you own
- **Invariant:** Every note on the board is a note of a written featured part, played at its measured sounding time. Nothing is transcribed from a mixed recording, and the game plays the chart exactly as written.
- **Technique:** Compose songs as data (a small score language with bar checks and phrase marks), render the featured stem on its own, chart from its notes, and keep the game's chart loader free of any listening, moving, filtering or thinning. When the music must come from elsewhere, get the stems or the score from whoever owns it rather than separating a mix.
- **Reference configuration:** OH charted existing songs for 26.7 h across six extraction rounds: whole-mix onsets ("completely random keys at random times"), a melody tracker on separated stems (precision 0.50, recall 0.61), regression and boosted trees on 18 note features (best 0.63 / 0.57), and a large transcription model (0.22 / 0.26). Timing was never the fault (4 ms median); choosing which notes was, and in strummed songs "86% of what our system calls 'the melody' there is just the top note of each chord". The owner rated the best "2 or 3/10". The owner then asked for composed music, and the first composed song, charted as written, drew "great chart" 16 h later. Featured-stem onset p95 was 4.4 ms against a 10 ms gate.
- **Applies when:** Any rhythm game whose content you can author. A game built on licensed tracks needs the tracks' stems or scores from the rights holder.
- **Verify:** A checker matches every chart note to a score note at every level, and the owner plays one song on the hardest level before the rest are made.

### The hardest level is the part as heard, and easier levels are nested subsets
- **Invariant:** Every note on a lower level sits on a note of the level above, at its time and key; a chord may lose a key on the way down and never gains one; a repeated phrase is reduced the same way each time; density rises with every level on every song.
- **Technique:** Score each note by metric position, length, syncopation, phrase edges and melodic turning points, keep the top share per phrase, and cap notes a second per phrase. Fit the keep shares by feeding published hardest-level charts to your thinning and comparing what you keep with what the published easier levels keep, counts only.
- **Reference configuration:** OH keeps Hard 0.86 (cap 7.5 notes a second in a phrase), Medium 0.66 (cap 5.0, chords at most 12%), Easy 0.52 (cap 2.8, no chords, at most 86 to 88% of Medium). Published levels in the genre keep about 85, 61 and 41% of Expert on dense songs; OH's first rules kept 60, 47 and 32% until refitted to 82, 66 and 44%. Lower levels in the genre sit on Expert note times 99.5% of the time.
- **Applies when:** Any chart with more than one difficulty.
- **Verify:** A subset assertion over the whole catalogue, and a per-song table where notes a second rise Easy, Medium, Hard, Expert.

### Hands set the limits, and every level uses every lane
- **Invariant:** No level asks for more than a hand can play, every level uses all the lanes, and difficulty comes from density, spacing and chords rather than from removing lanes.
- **Technique:** Gate same-key repeats, any two notes and the busiest second per level, and thin an unbroken run of fast notes into a roll and then into beats. Read the owner's "impossible" as a gate that is missing, not as a request for fewer notes everywhere.
- **Reference configuration:** OH: the same key at least 150, 150, 190 and 300 ms apart (Expert, Hard, Medium, Easy); any two notes at least 85 ms apart; the busiest second at most 10 notes; Easy at most 2.6 notes a second with no chords. Genre medians: 1.61, 2.44, 3.40 and 3.98 notes a second, median gaps 480, 323, 214 and 189 ms, busiest seconds 4, 5, 8 and 10. Stem charts at 12 notes a second with chords everywhere drew "this is fucking impossilbe"; melody-only charts below the genre's Easy density then drew "missing so many notes".
- **Applies when:** Lane games played on keys or pads without a strum bar.
- **Verify:** The checker names the bar of every collision, and the owner plays the hardest song on the hardest level without calling it impossible.

### Keys follow pitch, and phrases come back on the same keys
- **Invariant:** Within a phrase a higher note is further right and the same note is the same key; a returning phrase returns on the same keys; fast runs are rolls that never repeat a key.
- **Technique:** Give up to as many pitches as there are lanes their own key per phrase, spaced by interval; split wider phrases where the tune steps least; move the hand only at marked phrase points. Chart the lead line the player can hear, never the drums.
- **Reference configuration:** OH: a step or a third lands next door, a fourth to a sixth skips one lane, and a `/` in the score marks where the hand may move. Genre lane moves on Expert run about 28, 50, 14 and 7% for 0, 1, 2 and 3 or more lanes. The owner: "we dont need to have the kick durm or snare ... its for the main tune/instrument/lead". An arpeggio "up and down" was charted off until it became a roll that follows its contour.
- **Applies when:** Assigning lanes from pitched notes.
- **Verify:** Pitch to key is a function within each phrase, checked by script, and every arpeggio is read on a grid at every level.

### Chords and holds come from the music
- **Invariant:** A chord appears only where two notes are heard, a hold only on a note that rings, chord width shows the interval, and an easier level never adds either.
- **Technique:** Build accent chords from a tone the band already holds, a third to a sixth below the melody, on whole beats, and group them per repeated phrase so repeats chord alike. End every hold before the next note.
- **Reference configuration:** OH chord targets run from 8% of featured notes at tier 1 to 28% at tier 8; holds at 1.5 beats and 0.5 s, or 1 beat and 0.8 s, ending 40 ms before the next note. Grouping lifted alike-chorded repeats from 45 to 88%. The owner, after the first good chart: "dont be so stingy on the chords too". The shipped catalogue still had median Expert chord shares of 0.7 to 4.4% per tier, an ask left open because re-makes were queued and never ran.
- **Applies when:** Writing or thinning charts.
- **Verify:** A chord-share table per tier against its target, and a hold that stays visible and catchable for its whole length in a capture.

### The setlist is a career and every song earns its place
- **Invariant:** One list of rising difficulty in tiers, each tier ending on a closer, placed by measured density; no song is boring, too slow or too long; a preview starts at the song's best part.
- **Technique:** Write the setlist before the songs. Move a song down a tier rather than pad its chart. Declare each song's highlight and preview from it. Give the music a hook that comes back, and keep the lead in a comfortable register.
- **Reference configuration:** OH: 8 tiers of 5 hand-written songs, then generators, 169 songs over 17 styles; Expert at 2.2 to 2.9 notes a second at tier 1 rising to 5.1 to 6.3 at tier 8; at least 118 bpm with no exceptions (three slower songs kept as the studio's own exception were removed by the owner); 2:00 to 2:30 a song; previews from the first chorus after a 320 ms settle with a 0.18 s fade. Leads pitched an octave high lost 0.4 to 0.9 of a listener model's score. The owner: "we dont need 4000 songs ... we just need a good maount of songs with AMAZING charts".
- **Applies when:** Any game with a song catalogue.
- **Verify:** The index orders with no gaps, tiers ascend by measured density, and a person listens to five previews.

### The song clock is the audio hardware's clock
- **Invariant:** Judging and drawing read song time from the audio output, never from frame time, and each key is judged at its own event timestamp, so a slow frame cannot make a hit late.
- **Technique:** Start one decoded buffer at a scheduled context time, map `getOutputTimestamp()` to song time with an output-latency fallback, predict it forward each frame and glide, and convert `event.timeStamp` inside the key handler. A note is marked missed by the frame loop only once it is past the last window. Count in on the song's own beat grid. [references/timing.md](references/timing.md) has the code.
- **Reference configuration:** OH snaps the clock when it is more than 40 ms off and otherwise glides at 0.08 a frame; lead-in 2.6 s; resume count-in `max(1.2, min(2.4, 3 beats))` s. Real key presses scheduled off the audio clock landed at 1.1 ms mean and 2.5 ms p95 with no misses, 1.8 ms mean under a 250 ms stall every 1.5 s, and 2.1 ms at 4x CPU throttle; drawn and heard stayed within 4 ms. Every composed song's first beat sat at 0.30 s while the count-in counted from 0, about 62% of a beat off at 124 bpm, until QA swept every song.
- **Applies when:** Any game that judges input against music.
- **Verify:** Real key presses timed off the audio clock, not self-play (which lands every note at zero): mean under 3 ms, p95 under 5 ms, no misses under stalls or CPU throttling.

### Hit windows are a player setting; difficulty is density and travel
- **Invariant:** The timing windows are the same on every level and set by the player; levels differ in density and travel time; a note-speed setting changes only how fast notes travel.
- **Technique:** Offer relaxed, normal and strict windows. Set travel time per level and divide it by the note-speed setting. Keep a separate picture offset that moves only the drawn notes.
- **Reference configuration:** OH normal windows are ±46, 90 and 138 ms (relaxed 62, 122 and 185; strict 32, 62 and 95), against a genre reference of about 116 ms early and 100 late. Travel is 2.6, 2.3, 2.05 and 1.85 s by level, note speed 0.5 to 2.5x; the genre scrolls 3.5 to 2.5 s. Accuracy is `(P + 0.7G + 0.4Gd) / judged`, and S+ is a full combo above 0.97.
- **Applies when:** Timing-judged games with levels.
- **Verify:** A unit test that the windows follow the setting and not the level, and a timed run at each window setting.

### Calibrate by sight and sound, and never as an answer to a complaint
- **Invariant:** Latency is set by lining up a visible landing with a heard click, offered before the first song, in plain words; a complaint about the charts is never answered with "calibrate first".
- **Technique:** A dot falls onto a ring with a click scheduled on the play clock; arrow keys nudge it; an in-play nudge key is there for later. Both the ring and the dot must be fully drawn at the landing frame.
- **Reference configuration:** OH replaced a 12-tap test after eight hours because "a tap test measures the tapper as much as the speakers", and because the owner wrote "i didnt run calibrate idk what that even means". The sound check moves 10 ms per left or right, 1 ms per up or down, over -200 to +400 ms, with `[` and `]` nudging 10 ms in play and a picture offset of -100 to +100 ms. Its first version failed because the ring faded in at the moment of landing.
- **Applies when:** Every rhythm game.
- **Verify:** Offsets of ±80 ms keep every timed press Perfect, and a still of the landing frame shows both ring and dot.

### The board is sacred
- **Invariant:** Notes, catchers and the strike line draw every frame, sharp, with no lens or post effect on them, from the count-in on; no world effect covers a lane; lane contrast against the board is measured, not judged.
- **Technique:** Draw the board to its own full-resolution target and composite it last over the world. Mask every world effect out of a corridor round the lanes. Keep the HUD quieter than the notes. Draw one composite to the canvas per frame (`opengame-stability`).
- **Reference configuration:** OH's board fills 35% of the picture height, far notes at 42% of near size; lane colours `#ff5436`, `#ffb41f`, `#1fc9a2`, `#2f86ff`, `#f04cc8` at L* 56.8 to 79.3, each at least 28 L* above the board's lightest tenth (a lighter board once cut blue to 2.6:1). Two draws to the screen a frame lost the board for single frames, 4 of 880; one draw lost 0 of about 7,600.
- **Applies when:** Any lane game in front of a busy or stylised world.
- **Verify:** An in-page probe at a catcher over two minutes in two songs shows no missing frame, and an L* table per venue.

### Notes read clearly on a receding highway
- **Invariant:** Every note variant shares one head width and timing centre; marks lying on the board stay thin, dark and along the lane; notes in a dense stream never touch; a hold reads as a ribbon, not a tube.
- **Technique:** Vary paint inside fixed bounds, and cap each note's length by its gap to the nearest neighbour, counting a neighbour in the next lane as further away.
- **Reference configuration:** OH: on a receding board "anything bright or tall stands up" (a bright tongue read as a fin, streaks as flames, dark tapers as teeth). Tails a tenth of the head wide and at most two heads long worked; holds are a flat ribbon 60% of the lane ending in an inked bar ("a round pale end read as a lid on a tube"); the next-lane neighbour counts 1.6x further; tested at 9 notes a second.
- **Applies when:** Designing notes, tails, holds and hit splats.
- **Verify:** 2x crops at the strike line and at the far end of the fastest passage in the catalogue.

### Scoring rewards streaks, and star power is a board-wide state
- **Invariant:** A streak multiplier is the second thing a player reads after the notes; star power changes the whole board while notes keep their lane colours; its charge, its ready state with its key, and its time left are always readable; failing is optional.
- **Technique:** Charge star power from clean phrases and let it fire from half full for double points. Show charge, then READY with the key until used, then only the reward and a countdown. Words leave the screen by shrinking and drifting while opaque, never by ghosting.
- **Reference configuration:** OH: Perfect, Great and Good score 100, 70 and 40 times `min(4, 1 + floor(combo / 10))`, doubled in star power; a clean phrase adds 0.25 of charge; drain `dt / max(8, 32 * 60 / bpm)`; holds pay 60 a second of song time. READY never showed under autoplay because self-play fired it at once; a real-key player first saw it at 31.36 s. A miss dulls the music with a lowpass to 520 Hz in 30 ms, back over 340 ms.
- **Applies when:** Any streak, combo or power mechanic.
- **Verify:** A real-key run shows READY until pressed, and a self-play bot holds its charge two seconds before firing so captures can see it.

### The world moves with the song's structure, eased, never shaken
- **Invariant:** The world changes on bars and four-bar phrases, the camera never shakes, the board never moves, every hit answers in its own lane at once, and a full-screen hit moment is rare and timed by the song clock.
- **Technique:** Put one music clock (beat phase, energy, bands) in shared shader uniforms. Make one camera move every four bars and a small downbeat push, applied after any framing solve so the solve cannot undo it. Use asymmetric moving parts in open sky so motion reads. Decide big hit moments in one tested function that requesters only ask. No hitstop in a timing game.
- **Reference configuration:** OH: downbeat push 2.5% (3% on a phrase line) in 0.25 s and out over 1.35 s; a 3 degree pan per phrase; a palette wipe 1.6 s per phrase. Per hit: splat 0.12 s, halo 0.1 s, a tick of band-pass noise at `2200 + 420 * lane` Hz for 35 ms. The hit frame is ink 70 ms, flat 70 ms, wipe 120 ms, at most once per 8 beats and 6 s, after a run of 8. The owner on background motion: "the background is hsaking so much ... just looks like slop"; judges had been recommending a 6 px shake until the owner's rule reached their rubric. The framing solve silently undid the camera life three times.
- **Applies when:** Any music-synced scene.
- **Verify:** 1:1 strips across a bar line, a strike log over forty seconds of play, and the calm setting probed for stillness.

### The charted attack is heard in the final mix, on time
- **Invariant:** Every charted note's attack is audible over the whole mix at its charted time, and the decoded file the game plays carries no codec padding into the song clock.
- **Technique:** Trim samples to onset, duck backing and reverb under the lead, lift featured onsets, and double a soft lead with a percussive voice a few ms ahead. Master after encoding is checked, and shift for encoder delay only when the tag and the decoded audio agree.
- **Reference configuration:** OH gates: featured stem onset p95 under 10 ms; whole mix p90 under 30 ms with a 50 ms search; attack margin median 3 dB with 90% above zero; onset lift 2.5 to 6 dB; -14 LUFS ±0.6 at most -0.99 dBTP measured on the decoded MP3; 256 kbit/s CBR; 25.06 ms of codec silence trimmed only when every explanation agreed within 0.3 ms.
- **Applies when:** Games that judge a player against audio.
- **Verify:** A mix probe with each stem left out in turn, and clicks placed at known times decoded in every browser you can run, within 2 ms; name the ones you could not.

### Check every chart through the game's own code
- **Invariant:** The tools, the judges and the player all see the same chart, note for note, and a missing or broken chart is an error the player reads, never a guessed replacement.
- **Technique:** Bundle the game's chart code for Node and run every song at every level in seconds: bad times and lanes, overlaps, holds into the next note, fast repeats, density by level, length against the audio. Compare the results screen's note count with the chart file.
- **Reference configuration:** OH checked 169 songs at 4 levels in about 2 s. A hidden in-game filter removed 20 to 26% of notes on quiet and fast songs for 7 h 20 min while judged charts were complete; two judges caught it from a results screen showing 117 notes against 147 in the grid. A missing chart file once played 717 guessed notes in place of 403.
- **Applies when:** Any game with chart or level data.
- **Verify:** The game-reported note count equals the file's for every song QA plays to the end, and an injected missing file shows a message.

## The owner is the only ear

No critic, benchmark or self-play run in OH heard a song or pressed a key. Only the owner
found the chart quality, impossible Expert, the background shake, the boring songs and
everything about sound. Every update gives him one link, one named song and the hardest
level, and never reports a proxy score as progress. The loop is in `opengame-production`.
