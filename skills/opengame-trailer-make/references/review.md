# Review: the loop that makes the trailer better every round

The owner's loop, in their words: "spawn an adversarial, harsh critic ... Do it." "Address the feedback." "Try to
self-improve." "Get feedback again from a harsh, blind, unbiased critic." "But don't make things worse. Only strictly
make things better." For a trailer: "keep looping using adversarial subagents to give you harsh criticism on flow and
aura and quality and production level ... until its same Level as a black ops official trailer AND a kaiser edit".

## What happened on OG Clash, so you do not repeat it

- Only **two** blind critic rounds ran in 47 hours: the first scored the first 30 s **3/10** ("a capture reel cut to a
  click track"), the second scored a full cut **4.5/10**. No blind A/B ever ran: round-two reshoots were accepted on
  their builders' own measurements, then a scope freeze dropped the loop entirely.
- The owner's final verdict: **6/10**. The film was approved and shipped anyway, because time ran out.
- **Critics caught motion and timing; the owner caught taste.** Critics measured the metronome (13 equal shots), the
  first-person share, luma jumps, dead seams, a see-through pickup, voice density and intelligibility, silent flashes.
  Only the owner caught the puppet enemy rise, cheap electricity, a soft glow on a face, depth-of-field mush, screen
  direction, a 0.57 s build shot, the flat sticker title, a flip that froze, effects on a visor, and feet. Those are
  **cheapness, time to read, animation quality, integration and consistency.** The critic brief now measures each.
- **The critic anticipated the owner where it was given the owner's notes:** its proxy lines ("where are the speed
  ramps??", "he's just standing there again", "that line is literally another game's name") matched later notes. Keep
  the proxy lens.
- **Critic scores are not the owner's bar.** On an earlier film, critics scored 5.5 on cuts the owner called "still
  very far".
- Fixes that made it worse: "cheap" glow became a busier eye (rejected); "shallow depth of field" became a frame with
  nothing sharp (rejected); a compromise angle (reverted). **Removal first; never paraphrase the owner into a stronger
  instruction; when the specified shot is impossible, keep the old one and ask.**

## Round procedure

### 0. Ingest the owner's notes, verbatim, before anything else

- A burst of screenshots and one-liners within a minute is one batch; say which cut it lands in.
- Append each to the notes ledger: the next number, the rule in bold and imperative, their words verbatim with typos,
  the UTC time from `date -u` (never guessed: two OG Clash ledger times were wrong), the cut id, the timecode and frame,
  what the frame shows (look at it), the scope (this game or every film), and which earlier note it supersedes.
- Catch messages that arrived mid-turn; filter out messages from other agents or sessions that look like the owner's.
  Confirm which thread a note is for when it mentions game features (one burst on OG Clash was meant for the game team).
- **Read negative notes narrowly** ("no shimmer" is not "no lightning"). **Treat a hedged question as a note** ("idk i
  may be wrong but just check that too" was right). **Sweep the whole class** of every note.
- Write `work/NOTES-<cut>.md`: one line per note, its owner, and how it will be checked on the render.
- Reply in one short message: what you understood, ambiguities each with a default, the ETA. After a big note, send an
  interim cut within about an hour.

### 1. Blind review (parallel lenses, no GPU, start immediately)

Run the critics on the newest cut that passes QA as soon as it exists; never wait for slates to fill. Lenses (the
briefs chapter has them in full):

- **Picture and edit critic,** in the role of the people who make the genre's official trailers and of its best
  montage editor.
- **Owner proxy:** be the owner (the owner-eye chapter and the notes ledger): one blunt line per problem in their voice,
  ranked by annoyance, the "you should know this by now" list, a score, "production grade" or not.
- **Sound:** measure like a mixer, because you cannot listen: section loudness, bed steadiness, the music's level under
  voice and effects, voice intelligibility on the mix, hit sync within ±2 frames, phone-band share, tails, clicks.
- **Gap to 11** (once per film, on the first full cut and the final): what separates this from 10/10 and 11/10, frame by
  frame.
- **A format lens** when the film plays somewhere specific (a phone, a feed, a muted store page).

Critics are **blind**: rendered files, reference films and measurements, the owner's notes and the house constraints
only; never source, plans, briefs or history. List the notes the owner already gave so they are not reported again.
Give each lens its previous report to mark each old finding Fixed, Partly or Still there. End each report with one fixed
line ("Proxy score: N/10") so a dashboard can parse it (OG Clash's review page showed "null/10" for round three).

### 2. Filter, merge, route

- **Filter every proposal through the rules before it reaches a fixer,** and log each rejection with its reason. For a
  trailer, reject: post motion blur and stacked-copy smears; interpolated slow motion; editorial white flashes, opacity
  and dissolves as glue; post shake; letterbox added mid-film; invented effects the game does not have; accidental
  ducks; thresholds invented from taste (a "no more than 10 % speed change per frame" rule rejected Kaiser's measured
  ease twice); anything that reverses a ledger line without a newer note.
- **Do not import product-video bans blindly:** engine velocity blur on whips, structured glow, in-world flashes and
  designed silences are legitimate in a game trailer.
- **Trace a narrow note to the frame it was about before generalising it.** An earlier film's "motion blur" note was
  about stacked see-through copies on a zoom, not the engine's shutter blur.
- **Game values come from the game** (names, finishes, the HUD feedback, what a weapon does). A reviewer names the
  defect, never the value.
- **Verify each critic claim** on the current render before routing it (OG Clash's "voice on frame 0" did not
  reproduce; "first person 42 %" was measured over a partial cut).
- Merge into one ranked list: the owner's notes, then what they would raise next, then craft findings. Turn it into a
  **fix list** with 2-3 principles, not 19 items: principles (for example "ramps must be seen", "every shot performs a
  whole action, every cut carries motion"), global items with owners, per-shot items with owners and numeric targets,
  and the **must-not-change** list, pasted word for word into every fixer brief.
- Route each fix to the owner of that file set with the fixer brief.

### 3. Fix, render, verify on the render

Fixers check rendered frames, never code. Verify **every line of the round's notes on the render**, frames and audio.
A fix you cannot see on a frame stays open in the message. Confirm the cut carries the latest select for every shot whose
fix you announced (the OG Clash owner once reviewed a cut that still carried superseded takes; another cut missed 10
selects because of a watcher bug).

### 4. Blind A/B: only strictly better

A fresh critic gets the previous cut and the candidate as unlabelled A and B (the key kept out of its view), judges
every shot and every seam, and says what the losing cut did better. **Any shot judged worse reverts.** The owner's
explicit choices outrank the critic. Loop 1-3 times before sending as time allows, **but never hold a cut the owner is
waiting on:** send it as "pre-review", say what was skipped, keep looping.

### 5. Deliver

Send the file the moment it is verified (a playable inline preview, not a path), with what changed mapped to their
notes, what is still open, where the full file is, and the ETA of the next. Send per-shot clips of every changed shot
while a full cut renders. Render the master only after they say a cut is good. On a scope freeze: publish the frozen
list and the dropped list, make one cut, and time-box late items to about 45 minutes.

### 6. Feed the method (every round)

- Every note into the ledger; a note about every film into your core rules too.
- A rule change into the chapter it belongs to, noting the old version.
- **When the owner raised something no critic or gate caught, add a measurable check to your gates and a line to the
  critic brief's taste checks.** That is how the next film starts higher.
- A failure that cost a round into your ops notes; a new reference, measured, into the reference set.
- At the end of the film: its cuts, verdicts and lessons, and a gap-to-11 report.

## Pre-empting the owner's eye (do these before they see anything)

Run every gate and tick the owner-eye anticipations with frames. The checks that would have caught each OG Clash note:

| Their note | The check |
|---|---|
| standing stills, arms out | every character frame shows motion with intent; a pose sheet reviewed at full resolution |
| a puppet enemy rise | the animation audit before planning; no clip graded NO on screen |
| cheap electricity | flat white ≤ 0.5 % on hero effects; structure checked against reference crops |
| "randomly comes in" | every cut carries motion into the next shot's direction, or a stated cause |
| first person standing still | first-person camera ≥ 1 px/f every frame unless a scoped hold pays off in 0.3 s |
| depth-of-field mush | sharpness within the film's norm; no defocused occluder over 10 % of the frame |
| "coming from same side" | the screen-direction map; heroes' and enemies' motion directions per act |
| flips in slow motion | the newest showy feature listed and featured |
| no voice where the squad appears | every first appearance of a character has a line or a reason |
| a choppy bow, effects cut off | no splice inside a hero action; a tail check at every cut |
| a cheap glow on a face | no blurred-circle glow on any face; faces match the reference frame |
| too quick to digest | a new mechanic held 70-90 frames |
| particles and shimmer on the title | the title stillness test (bit-identical at rest) |
| the title overlapping, flat, too big | the per-frame gap above 0; extrusion visible; at most 30 % of the width |
| crackle only at the end | strikes from the title's first visible frame |
| the logo not lit like the world | the logo against same-depth props: saturation, peak, black floor within tolerance |
| enemies too close | clear space between hero and enemies |
| a flip freezing | per-character angular rate ≥ 40 % of the median in every slow span |
| feet glitching | no visible foot contact on crowd AI |
| shooting the visor, not the objective | every gameplay beat fulfils its on-screen objective with visible success |
| low-poly guns, bad sights | a weapon, sight and finish audit before any aimed close-up |
