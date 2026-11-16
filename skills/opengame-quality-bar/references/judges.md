# Running a council of model judges

How to set up model judges so that a score change is bigger than their noise, and what
they cannot do. From OS's council (879 judge tasks over about 71 hours), OH's three-judge
panel (25 rounds on one rubric) and LC's single blind panel. Judges are instruments: they
need calibrating like any other, and their output is a defect list first and a number
second.

## What goes in the packet

- **Fixed frames per screen**, from the same cameras every round, captured through the
  real menu from a frozen build (`opengame-capture` says how). Stack them into contact
  sheets: OS judges given about 100 single images stalled on image-read limits (one ran
  4.5 hours and 2,659 reads with no scorecard), and 12 stacked sheets cut a run to 3-4
  minutes.
- **The reference frames of the same state** beside the build's frames. LC's prompt:
  compare "the game's frames with the concept film's frames of the same kind of moment".
- **Short clips** for anything that moves. A still cannot score flicker, shake, pacing or
  a transition, and still panels sat at 3-4 on OS for about 135 builds while the owner's
  notes were about motion.
- **The owner's decisions file, word for word**, under "must not reverse even if critics ask",
  plus the spec facts judges must not penalise.
- **What the last panel said it could not see**, so the next packet answers it.
- **No claims of progress**: no round labels, no captions that say what improved. OS's
  stricter briefs said "Do not infer improvement from round labels" and "unknown evidence
  => unverified, never a score".

## The rubric

- One rubric for the whole project, so rounds compare. OH used ten criteria from 0 to 10
  with the concept video as 10, the last being whether it "reads as a AAA, big-budget game
  from a real studio"; LC used 26 dimensions, from fear and photorealism to load and
  stability.
- Score meanings LC wrote down: 10 is indistinguishable from a first-party console release
  in that dimension, and the judge looked for a defect and could not name one a paying
  player would notice; 8-9 shippable with named shortfalls; 6-7 competent, clearly not AAA;
  3-5 prototype; 0-2 missing. A 10 needs a sentence saying what was checked. LC scored no
  evidence as 0, but any fixed score for an unseen item makes the mean track coverage: an
  OS panel read 1.12/10 because 16 of 17 maps were never framed. Mark a dimension with no
  evidence unverified, leave it out of the mean, and report coverage beside the score.
- Anchor frames from your own game at 3, 5 and 7, and the reference at 9 when it is a floor
  the owner wants exceeded or at 10 when it is the bar, with any rating the owner has given
  an anchor binding (OS: visual spread fell from 1.8 to 0.6).
- A vision probe before scoring, so a judge that cannot read images is caught before it scores. OS asked
  for "line 1 'VISION: yes'" and then "the three most prominent colours".

## Running a round

- Three judges, no two from one model family where you can (two OS judges from one family
  correlated at r = 0.81, so a median of three was two votes), each a fresh read-only task
  that sees nothing of the others. Never fork a judge from the build conversation: some OS
  "blind" judges were forked with the whole owner conversation. Take the median, and add a fourth judge when the spread is over 2 (OS).
  For the defect list, the lowest score per dimension counts (LC).
- Paired, blind, same-sitting A/B: old and new in one packet, order randomised, the key
  kept outside the packet. Unpaired OS readings had the wrong sign on three maps where
  paired readings showed gains.
- One unchanged control per round. On OS a control drift over 0.5 flagged the round, and 2
  of 3 trains were flagged.
- Moves under 0.5 count as nothing: OS's three judges agreed on the direction of change in
  35 of 115 map-rounds.
- Output as JSON per dimension: score, what was checked, defects with where, what and what
  would close the gap, and which area owns it, plus a short verdict (LC capped it at 700
  words). Each judge checks that every path it cites exists.
- Defects as located boxes, kept when two or more judges mark the same place: 704 OS
  defects at about 80% precision.
- Fixed defects counted by blind same-camera crop rechecks (79 of 80 reproduced on OS),
  never by a new sweep that happens to find fewer.

## What judges cannot do

- **Hear.** OH's judges saw silent clips only; every sound defect in OH and LC was found
  by the owner.
- **Feel.** No judge pressed a key. OH's judges scored charts from text grids while the
  owner played them and said "2 or 3/10".
- **Watch at speed.** A judge reads frames in order; a pop or a whirl that lives between
  frames goes unseen.
- **Keep the owner's taste unprompted.** OH's judges erased the avatars' faces and asked
  for camera shake; OS's judges removed a default the owner had chosen. Personas do not
  help: OS's three seat means were 7.04, 6.98 and 7.03.
- **Resist easy wins.** Defect counts reward deletion (a clipping plant was simply
  removed), and judges overcorrect each other: an OS HUD was "30-40% too big", then
  "shrunk too far", and a scope lens went 648, 961, then 886 px.

So report judge scores as judge scores, keep an owner-play log beside the judge log, and
never present a proxy score to the owner as progress.

## Cost and cadence

- OH: about 25 minutes of capture, 2-11 of judging and 10-30 of briefing, so a round every
  1.5 to 2.5 working hours. Judges ran on subscription pools; never buy judging on paid
  API credit without the person's yes on the cost.
- Run a panel early, for the defect list, and again when you believe every dimension is
  close. Once the last panel's top fixes have landed, judge only what changed (OS).
- Never gate publishing on a bar no build can reach: an OS panel at 1.12/10 held the
  playable preview on one build for about 8 hours 40 minutes while 28 newer rounds waited.
