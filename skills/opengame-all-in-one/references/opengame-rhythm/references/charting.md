# Charting

How OH wrote charts that the owner called "great", with the numbers that held. Every
value here is a reference configuration from OH, a five-lane keyboard game on A S J K L
with four levels; scale them for other lane counts and inputs.

## Why transcription failed

Six rounds, about 17 agent-hours and up to 162 GB of separated stems went into charting
mixed recordings. Precision and recall of "the lead's notes", onset within 50 ms:

| Method | Precision / recall |
|---|---|
| Loudest onsets of the whole mix, lanes by brightness | the owner: "completely random keys at random times" |
| Melody tracker on separated stems | 0.50 / 0.61 |
| Logistic regression on 18 per-note features, best one-voice path | 0.61 to 0.63 / 0.61 to 0.65 |
| Boosted trees, retrained on riffs, then an onset rule (held out) | 0.66 / 0.45 to 0.63 / 0.57 |
| Lead at or above the band, against 2 dB or more under it | 0.78 / 0.59 against 0.50 / 0.30 |
| A large multi-instrument transcription model | 0.22 / 0.26 |

Timing was never the problem; choosing which notes was. Strummed songs have no single
line to find. Two hidden faults cost more than the method: the pipeline's own clean-up
removed two thirds of the notes it later reported missing, and the game filtered out
notes it judged "not heard in the whole mix". A paid stem service measured at one call
would have cost about $2,100 for the whole catalogue; the owner chose a free separator,
and an approved test of the paid one placed only 41% of melody notes at the same times.

So: if you can, compose. If you cannot, get stems or scores from the rights holder.

## Genre calibration without audio

Aggregate counts from the published note charts of 38 songs of a commercial five-lane
game. No audio was fetched and nothing was copied into the game; use counts like these,
never a chart.

| | Easy | Medium | Hard | Expert |
|---|---|---|---|---|
| Notes a second, median (p10 to p90) | 1.61 (1.32 to 2.18) | 2.44 (1.94 to 3.03) | 3.40 (2.31 to 4.42) | 3.98 (2.59 to 5.21) |
| Median gap | 480 ms | 323 ms | 214 ms | 189 ms |
| Busiest second | 4 | 5 | 8 | 10 |
| Sustain share | 21% | 15% | 11% | 9% |

- Lower levels sit on Expert note times 99.5% of the time.
- Expert lane moves of 0, 1, 2 and 3 or more lanes: about 28, 50, 14 and 7%.
- 98.4% of Expert notes sit on a sixteenth or triplet grid.
- To fit your thinning, feed each published Expert chart to your own reduction and compare
  strike for strike with the published easier levels. OH's first rules kept 60, 47 and
  32% of Expert where the published levels keep 85, 61 and 41%; the refit kept 82, 66
  and 44%.

## Composing songs as data

- A small score language: notes by pitch and length, bars checked by assertion, phrase
  marks, and a `/` where the playing hand may move.
- One featured part per song, never humanised ("the lead is the song"). Only the band is
  humanised.
- Samples trimmed to onset and tuned (OH's libraries were off by up to 20 to 30 cents).
- After the owner found the first song "a bit boring": at least 118 bpm, richer harmony,
  full song forms, and a hook of two bars and at most five pitches that comes back and
  lands long.
- The lead's register mattered more than its timbre: leads at MIDI medians 83 to 90, where
  hand-written songs sat at 72 to 81, lost 0.4 to 0.9 of a listener model's score.
- A listener model is a compass, not proof. A synthesised snare cost about 0.27; one
  text-and-audio model scored two different styles 0.9995 alike and was useless. The owner
  hears a sample of each style before it is made in bulk.
- Freely licensed sample libraries only (CC0, and CC BY with a visible credit), with the
  licence on file per song. Mark `*.wav -text` in `.gitattributes`: line-ending conversion
  corrupted 121 of one library's 1,776 files.

## The chart from the notes

1. **Expert** is the featured part at its sounding time.
2. **Keys by pitch, phrase by phrase.** Up to five pitches get a key each, spaced by
   interval (a step or third next door, a fourth to a sixth skips one); wider phrases
   share keys where the tune steps least; a returning phrase returns on the same keys.
3. **Hand gates** (OH `check.py`):
   - same key at least 150, 150, 190 and 300 ms apart (Expert, Hard, Medium, Easy);
   - any two notes at least 85 ms apart;
   - busiest second at most 10 notes.
4. **Chords**: two keys whose width shows the interval; accent chords from a tone the
   band holds, a third to a sixth below, on whole beats, grouped per repeated phrase;
   8% of featured notes at tier 1 to 28% at tier 8.
5. **Holds**: at 1.5 beats and 0.5 s, or 1 beat and 0.8 s, ending 40 ms before the next note.
6. **Nested reductions**, weighted by metric position, holds, syncopation, phrase edges and
   turning points:

   | Level | Keep | Cap in a phrase | Chords |
   |---|---|---|---|
   | Hard | 0.86 | 7.5 notes a second | as Expert |
   | Medium | 0.66 | 5.0 | at most 12% |
   | Easy | 0.52 (at most 86 to 88% of Medium) | 2.8 | none |

   Checker bands: Hard 0.75 to 0.93, Medium 0.38 to 0.76, Easy 0.25 to 0.58.
7. **Musical gates**: at least half of eight-note windows recur; at most 20% of bars carry
   a motif heard nowhere else; hand alternation 0.28 to 0.60; one-key runs at most 5; the
   lead silent at most two bars; 120 to 150 s a song.

## Tiers

Place songs by measured Expert density, never by intent: 2.2 to 2.9 notes a second at
tier 1 rising to 5.1 to 6.3 at tier 8. A song that plays under its tier moves down; it is
never padded. OH's first composed song ran 1.38, 1.89, 2.34 and 2.82 notes a second by
level.

## Delivery

Render, mix, master, chart, gate, then stage under a hash name and promote into one
atomic index. OH made about ten songs an hour on one job slot, with half the drafts
refused by the gates.
