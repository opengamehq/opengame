> Carried from `opengame-trailer-review-and-improve` 1.0.0. Read it when: Review and improve any cut of a game trailer. Covers logging the owner's notes word for word, blind critics measured against official trailers and the best editors, an owner proxy and a sound lens, gates for what critics miss (cheap effects, puppet animation, freezes, blur, cut-off sound, a title not in the world), filtering fixes, blind A/B so only better shots survive, and turning every note into a check. Use when notes arrive on a trailer cut, and before any trailer cut is sent.


# Trailer review and improve

Step 3 of 3, repeated every round: `opengame-trailer-plan`, then `opengame-trailer-make`, then **review and improve**.

This is the most important of the three. It is the owner's loop, in their words:

1. "spawn an adversarial, harsh critic ... Do it."
2. "Address the feedback."
3. "Try to self-improve."
4. "Get feedback again from a harsh, blind, unbiased critic."
5. "But don't make things worse. Only strictly make things better."

And for a trailer: "keep looping using adversarial subagents to give you harsh criticism on flow and aura and quality and
production level ... until its same Level as a black ops official trailer AND a kaiser edit", because "i do NOT want to
have to keep watching shitty takes and giving u feedbaxk thqt u should be able to know ill give u".

On OG Clash the loop ran twice in 47 hours (3/10, then 4.5/10), never ran a blind A/B, and was dropped at a scope freeze;
the shipped film is a 6/10. Critics measured motion and timing; the owner caught cheapness, animation, time to read,
integration and consistency. This skill measures both. For notes on a montage cut to a song, use
`opengame-montage-review-and-improve`: its owner overrides several trailer defaults.

## Read first

- [references/review.md](references/review.md): the procedure in depth, the filter, and the table of checks that would
  have caught every OG Clash note.
- [references/gates.md](references/gates.md) and [references/measure.md](references/measure.md): the numbers, and how
  to measure each one with ffmpeg, Python and a speech recogniser (no special tools needed).
- [references/briefs.md](references/briefs.md): the critic, owner-proxy, blind A/B, gap-to-11 and fixer briefs, word for
  word.
- [references/owner-eye.md](references/owner-eye.md): how a demanding owner reviews, the anticipation table, the
  pre-send checklist, the recurring notes with their rules.
- [references/core.md](references/core.md), [references/craft.md](references/craft.md) (what a fix should aim at),
  [references/finishing.md](references/finishing.md) (QA and delivery), [references/ops.md](references/ops.md)
  (cadence and talking to the owner) and [references/og-clash-record.md](references/og-clash-record.md) (the gap-to-11
  report: the depth a review should reach).
- When a fix needs the making side: [references/filmable.md](references/filmable.md) (capture and the film build),
  [references/title.md](references/title.md), [references/music.md](references/music.md),
  [references/archetypes.md](references/archetypes.md) (formats, the raw gameplay montage, the share card) and
  [references/edge-cases.md](references/edge-cases.md).

## Round procedure

### 0. Ingest the owner's notes first, word for word

- `date -u` first. A burst of screenshots and one-liners within a minute is one batch; say which cut it lands in.
- Append each note to the notes ledger: the next number, the rule in bold, their exact words with typos, the UTC time,
  the cut, the timecode and frame, what the frame shows (look at it), the scope (this game or every film), and what it
  supersedes. A note that applies to every film goes into your core rules too.
- Catch messages that arrived while you were working; filter out other agents' or sessions' messages; confirm which thread a note is
  for when it mentions game features.
- Read negative notes narrowly; treat a hedged question as a note; sweep the whole class; make the smallest change that
  answers the note; **when they call something cheap, try removing it first;** never paraphrase their words into a
  stronger instruction.
- Write `work/NOTES-<cut>.md`: one line per note with an owner and how it will be checked on the render; carry over
  anything asked and not yet done.
- Reply in one short message: what you understood, ambiguities each with a default, the ETA. After a big note, an
  interim cut within about an hour.

### 1. Blind review (parallel, no GPU, immediately on the newest cut that passes QA)

Launch the lenses from the briefs chapter: a **picture and edit critic** (in the role of the genre's official trailer
makers and its best montage editor), an **owner proxy** (be the owner; it ends with `Proxy score: N/10`), a **sound**
lens (measure like a mixer), and once per film a **gap-to-11** critic. Critics are blind: rendered files, reference films
and measurements, the notes ledger and the house constraints only; never code, plans or briefs. List the notes already
given. Give each lens its previous report to mark Fixed, Partly or Still there. Run critics on the models the person's
setup already has; do not buy API credit for them without asking.

### 2. Gates: run them yourself, every round

The measured checks for what critics usually miss: motion on every frame and across every cut, slow-span motion and
per-character angular rate, flat white on hero effects, sharpness against the film's norm, mechanic shot lengths, screen
direction, first-person share, tails at cuts, accidental ducks, voice intelligibility on the mix, the title's gap,
stillness and world match, luma at cuts, flashes, loudness, the story beats present. A FAIL is a finding like any
critic's.

### 3. Filter, merge, route

- Filter every proposal through the rules (the review chapter) and log each rejection: no post blur or frame blending,
  no interpolated slow motion, no opacity or dissolve glue, no post shake, no invented effects, no accidental ducks, no
  thresholds invented from taste, nothing that reverses a ledger line without a newer note. Do not import bans from
  product videos blindly: engine whip blur, structured glow, in-world flashes and designed silences are legitimate here.
- Game values come from the game, never from a reviewer. Verify each claim on the current render before routing it.
- One ranked list: their notes, then what they would raise next, then craft findings. Write the fix list: 2-3
  principles, global items and per-shot items with owners and numeric targets, and the **must-not-change** list.
- Route each fix with the fixer brief: their note word for word on top, confirm the defect first, the must-not-change list, a
  time box.

### 4. Fix, render, verify on the render

Fixers check rendered frames. Verify every notes line on the new render, frames and audio; anything you cannot see on a
frame stays open. Confirm the cut carries the latest select for every fix you announced.

### 5. Blind A/B: only strictly better

A fresh critic gets the previous cut and the candidate as unlabelled A and B (the key out of view), judges every shot and
cut, and says what the losing cut did better. **Any shot judged worse reverts.** Their explicit choices outrank the
critic. Loop 1-3 times as time allows, **but never hold a cut they are waiting on:** send it as pre-review, say what was
skipped, keep looping.

### 6. Deliver

The file the moment it is verified, playable inline (720p under 50 MB for a chat), with what changed mapped to their
notes, what is still open, where the full file is, and the next ETA from measured throughput. Per-shot clips of changed
shots while a full cut renders. The master only after they say a cut is good. On a scope freeze: the frozen list and the
dropped list, one cut, about 45 minutes for late items.

### 7. When is it done

The loop is done when it reaches the bar, not when it stops: two fresh blind critics both at 8.5/10 or better, or the
round cap agreed with the owner, and the owner's approval. A rescope that stops it is logged in `film/SKILLS.log` as a
stop, not a finish. Throwaway engine-test trailers the owner scopes as one shot run one pass inside their budget.

### 8. Feed the method (every round, before you finish)

- Every note into the ledger; every-film rules into your core rules; changed rules into the chapter they belong to,
  noting the old version.
- **Anything the owner caught that no critic or gate did becomes a new measurable gate and a line in the critic brief's
  taste checks.** This is how the next film starts higher.
- Ops notes for any failure that cost a round; new references, measured; the round's cut, verdict and lesson in the
  film's history; at the end of the film, its gap-to-11 report. A line in `film/SKILLS.log` for this round.

## How a demanding owner reviews (pre-empt it)

Frame crops with one blunt line, in bursts; timecodes from the player; hedged but right; literal about "no X"; freezes
scope and then hands over the last mile; wants to see progress constantly and gets angry at waiting, repeats and
regressions. Praise sounds like "sick", "aura", "flow", "production grade", "jawdropping". Complaints sound like "random",
"cheap", "terrible", "boring", "not smooth", "cut off", "unnatural", "doesnt look 3d". The full anticipation table is in
the owner-eye chapter; tick it with frames before every send.

## Don't

- Don't send a cut you have not watched and measured, or a link you have not loaded.
- Don't let a critic see the code, the plan or the intent.
- Don't accept a change because it is new: only because a blind A/B says it is better, or the owner asked.
- Don't say a note is done on the strength of the code. Show the frame.
- Don't hold a finished cut for another loop while the owner waits.
- Don't answer "cheap" with more effects, and don't answer a hedge with silence.
- Don't let the same note come twice: if it did, the method did not learn; add the check that would have caught it.
