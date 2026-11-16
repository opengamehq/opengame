> Carried from `opengame-montage-review-and-improve` 1.0.0. Read it when: Review and improve any cut of a gameplay montage, in any genre or engine. Covers logging owner notes word for word with a verification state, locking praised shots, checks on the delivered file (every frame of payoff shots, cross-clip sheets, hits measured as heard), an independent every-frame sweep, a scheduled judge panel against the reference edit, and short updates led by the file. Use when notes arrive on a montage cut, and before any montage cut is sent.


# Montage review and improve

Step 3 of 3, repeated every round: `opengame-montage-plan`, then `opengame-montage-make`, then **review and improve**.

The loop is the owner's: a harsh blind critic, address the feedback, self-improve, a harsh blind critic again, "But don't
make things worse. Only strictly make things better." For a montage the OG Snipers owner added: "u should be anticipating
the type of feedback id give", "im not going to call out every single slop point u need to find all this urself and
improve and also leverage councli as needed", and a panel of three judges scoring against their reference edit.

On OG Snipers the owner's eye was the loop that converged the film. Something in the review process had flagged 45 % of
their 62 defect notes before they sent them, and all 28 still reached them. The independent sweep caught 50 % of what it
could see; blind critics 10 %; gates 10 %; the scoring panel 0 %, because it never ran. Critics, gates and method rules
pushed the film the wrong way six times. The owner repeated themselves at least six times, each time on a note believed
fixed and never verified where they look. For notes on a trailer cut, use `opengame-trailer-review-and-improve`.

## Read first

- [references/briefs.md](references/briefs.md): the independent sweep, the three-judge panel and its 13-dimension rubric,
  and the owner-proxy and blind A/B add-ons, word for word.
- [references/montage-gates.md](references/montage-gates.md): which gates caught real problems, which were noise, the
  rules for montage gates, and every review source's measured hit rate.
- [references/montage-grammar.md](references/montage-grammar.md): the montage overrides (the filter's reject list) and
  the rules a fix aims at. [references/montage-genres.md](references/montage-genres.md) for your genre's fake tells and
  recurring HUD.
- [references/owner-eye.md](references/owner-eye.md): how a demanding owner reviews a montage, the anticipation table,
  the pre-send checklist and the recurring notes with their rules.
- [references/measure.md](references/measure.md): every check measured with ffmpeg, Python and a speech recogniser (as
  heard levels, pose pops, flicker, cross-clip sheets, the song null test).
- [references/reference-study.md](references/reference-study.md) (what the judges score against),
  [references/montage-ops.md](references/montage-ops.md) (the cut chain, delivery, cadence),
  [references/finishing.md](references/finishing.md) (QA) and [references/og-snipers-record.md](references/og-snipers-record.md)
  (the 19-cut record). Verdicts on rulings read IN, NOT IN or FALLBACK with the frames read; on findings, TRUE,
  OVERSTATED, FALSE or DESIGN.
- When a fix needs the making side: [references/song.md](references/song.md),
  [references/montage-capture.md](references/montage-capture.md), [references/filmable.md](references/filmable.md) and
  [references/day-one-questions.md](references/day-one-questions.md) (the owner's day-one answers and their defaults).

## Round procedure

### 0. Ingest the owner's notes first, word for word

- `date -u` first. A burst of screenshots and one-liners within a few minutes is one batch; name the cut it is about.
- Append each note to the notes ledger (the next number, the rule in bold, their words with typos, the UTC time, the cut,
  the timecode and frame, what the frame shows, the scope, what it supersedes) and to `work/OWNER-NOTES.md`: one row per
  note with the check that proves it (a gate, a named frame range a person signs off, or NOT VERIFIED). Log silence too:
  "no notes on r07".
- Read narrowly and literally. A defect note on a shot they liked means repair that shot ("it just wasnt connected to
  body but that sick angle of a snpier"). Never widen a note ("no dont change first person shots").
- **Keep a praised list** (`work/PRAISED.md`: shot, frames, their words). It is a lock: fix only, never cut, never replace
  without asking. The third OG Snipers cut removed every faulted cinematic they had liked and filled the holes with clean
  shots tied to nothing: "cinematics got worse and flow/transitions got worse". About a day was lost.
- When they reverse an element, keep the last approved version as the default and build the new one beside it; they may
  go back (the title: "no text", then sixteen minutes later "keep r17's").
- **A repeat note is an incident:** write why the first fix did not hold and add the check that would have caught it (the
  feed spacing came back after 42 hours; one cross-clip sheet then found the clip in minutes).
- Relay the note to every role it touches (the relay checklist in `opengame-montage-make`). Reply within minutes: what you understood,
  ambiguities each with a default, the ETA from measured throughput. Fix and verify the parts they commented on last
  first: "the first 7 seconds or so of the new cut didnt have any of the fixes we talked about?".

### 1. Verify what they hear and see, on the delivered file

- Reproduce each note and each finding on the **delivered** file at the frames named, full size, graded; an older cut or
  the edit render is not evidence. Trace it to the take, the edit, the finishing pass or the mix.
- **Every frame** of every payoff, reaction, fall and hero shot; never every-2nd-frame sheets (an alternate-frame head flip
  passed the director and a gate and was found after "final"). Run a pose-pop check (a region alternating A-B-A) on head,
  hand and weapon crops, not only on the hips.
- **Cross-clip comparison sheets** for every recurring element: the feed row, hit markers, medals, the hero's weapon and
  skin, the title on each finished file (in other genres: the score bug, the position change, health bars, the combo
  counter, the livery). Diff the anchors in pixels.
- **Sound as heard:** a per-payoff table of in-band RMS (150 Hz-8 kHz, 300 ms from the attack) on the delivered mix; a
  ranking of every transient; payoffs within ±3 dB of the film's median (aim for ±1.5); nothing that is not a payoff louder
  than the loudest payoff; secondary sounds at least 6 dB under their clip's payoff; the callout at its offset and level;
  the song null-tested as untouched. A stem gate said "spread 0.1 dB" while the owner heard 6-15 dB.
- Approved elements against their comps (the title box, the look baseline). Look for one common cause across rows before
  fixing row by row (one slow-motion clock fixed four payoff shots at once).
- Describe only what you saw on frames, and count from the source data (staged hits were reported as four, seven, then
  eight; a delivery and a flicker check were claimed and had not happened).

### 2. The independent sweep, on every cut that will be sent

- The sweep brief: a fresh model, rotating vendors among those the person's setup has, that reads only the cut, the
  reference, the owner's own words, the praised list and the owner's complaint families. Not the plans, the director's
  rulings or earlier sweeps: that independence found the head flip.
- It reports; it never decides. On a praised shot it reports only the owner's own complaint families, as fixes.
- **It lands before the send:** run it on the edit render while the finishing pass runs. If it cannot, send the cut as
  "sweep pending" and its A rows within the hour (one sweep matched the owner's six death-shot notes and landed ten
  minutes after them).
- Check a sample of A rows before trusting a report; write TRUE, OVERSTATED, FALSE or DESIGN beside every row with the
  frames read. One model named the wrong map and called a moving shot held; its report was set aside.

### 3. Gates, as a delta

The hard tier: pipeline invariants and one gate per owner family, each proved to FAIL on the frame they flagged and PASS
on one they praised. The informational tier: every number derived from the reference. Report new FAILs, newly fixed and
standing; demote a gate that failed on every cut and that the owner never asked about (26 such gates hid the two that
mattered).

### 4. The judge panel: three judges, scored, on a schedule

- The judge brief: three independent judges from different model vendors (the owner's named models if they give them,
  otherwise what the person's setup already has; never buy credit without asking), on high effort, blind to plans, code
  and each other; GOLD = their reference edit = 10; frames and audio measurements; the 13-dimension rubric; the same brief
  every round.
- **When:** a baseline on the first full cut that passes QA and the note gates; then every third delivered cut, or as soon
  as a cut passes the director's own bar, or after three cuts with no new note; on the final candidate; whenever the owner
  asks. Never hold it until "the bar is met": on OG Snipers it was held at every cut from the third to the nineteenth and
  no score exists. If the owner says "dont start that panel even until u urself think the bar is met", run it as a
  measuring stick, keep its verdict out of their updates until then, and say so once.
- Report each dimension's median and spread; a spread over 2 points means measure it, not argue it.
- **Calibrate on the owner:** map every note they send to its dimension; where the judges scored 7 or more and they
  complained, rewrite that rubric line in their words, never their score.
- **Treat its findings like any critic's:** filter through the ledger and the montage overrides, verify on frames (step 1),
  then route. Reject any gap whose fix contradicts the owner (on OG Snipers: designed silences, varied gaps, shorter tails,
  held scopes, cutting praised shots).
- The panel's target is the finish line only if the owner names it so. Otherwise their approval is.

### 5. Filter, route, fix, verify, A/B

- One ranked list: their notes, then their families found by the sweep, gates or panel, then craft findings. A fix list
  with owners, numeric targets and a must-not-change list that starts with the praised list. Their eye outranks every
  critic and judge; their "I liked that" outranks every sweep.
- The smallest change that answers the note. Removal first only for what they called cheap or random and never praised.
- Verify every row on the new delivered render; NOT VERIFIED rows head every send and none may sit for more than one cut
  (the feed row sat unverified from the second cut to the eighteenth).
- A blind A/B of changed shots against the previous cut; revert any shot judged worse, and compare the whole cut against
  the previous one for anything lost.

### 6. Deliver and keep them informed

- **Updates every 15 minutes, short,** led by the file and its path in their folder (playable inline), one image of what
  changed, then what changed mapped to their notes, what is open (NOT VERIFIED first), and the next cut's ETA from
  measured throughput. Never a bare "waiting". Report a stall or outage the moment you see it: 7 hours and 3.5 hours
  reached the OG Snipers owner only when they asked ("please continue!", "Hello?").
- Match the cadence to their attention: when they are active, answer each burst with a cut in 30-90 minutes; when they are
  away, batch fixes and keep one current file in their folder. They come back to the newest cut, not to every cut.
  Promise a time and meet it, or say early that it slips and why. Keep the cut moving while one element is unresolved:
  send it with the last approved version of that element, or without it.
- **Call "final" only what is final.** "Final candidate" with work still in flight read as not final: "wheres the final
  cut... how do we speed up". Say "this is final unless you want X (about 2 hours)" and let them choose; the OG Snipers
  owner ended the loop themselves ("yea lets call r19 final as is").
- When they say "final next", cut the scope to their notes only and ship; no agent's wait may hold the delivery without saying so.
- **When they say final, stop and render:** freeze, render the master at the native format from native captures, deliver
  it to their folder and read it back, then tear down every schedule, watcher and heartbeat.
- "how do we speed up" gets a measured bottleneck table and a scope cut in the same reply.

### 7. Feed the method (every round, before you finish)

- Every note into the ledger; what it taught about the owner's eye into your owner notes; changed rules into the chapter
  they belong to, noting the old one; the round's cut, verdict and lesson into the film's history.
- **Anything the owner caught that no sweep, gate or judge did becomes a gate calibrated on their frame, and a family line
  in the sweep brief.** Any critic, gate or rule they overruled is rewritten the same day.
- Any operational failure that cost a round goes into your ops notes. A line in `film/SKILLS.log` for this round.

## How a demanding owner reviews a montage (pre-empt it)

They scrub the newest cut and send frame crops with one blunt line, in bursts, with timecodes from the player. They hear
what gates miss (hit levels) and see what sheets miss (jitter, z-flicker, a limb through a rail). They praise motion into
the map, payoffs from the receiver's side, beat-exact spacing and a restrained grade; the OG Snipers owner never praised
the hero alone. About one message in five asks for a cut or for speed. The full anticipation table is in the owner-eye
chapter.

## Don't

- Don't cut, replace or "simplify away" a shot the owner praised; fix it.
- Don't let a sweep, a gate, a critic or the panel decide; they report.
- Don't call a note done from code, a stem, a sample clip or a sheet; show the frame of the delivered file.
- Don't send placeholders or slates, or a cut with a known unfixed note the owner is not told about first.
- Don't hold the panel for a bar, or hold a cut the owner is waiting on for the panel.
- Don't call a cut final while work is still going into it.
- Don't go quiet: a stall the owner finds out about by asking costs more than the stall.
- Don't let the same note come twice: if it did, the method did not learn; add the check that would have caught it.
