> Carried from `opengame-trailer-plan` 1.0.0. Read it when: Plan a game trailer before anything is shot, for a browser game or any engine. Covers the archetype and format, choosing and measuring the music, measuring reference trailers, mapping how to make the game filmable, the story, and a frame-exact shot list and storyboard checked against measured gates and the owner's eye. Use when someone wants a launch trailer, gameplay reveal, story trailer, store preview, teaser or social cut. For a montage cut to a song, use opengame-montage-plan.


# Trailer plan

Step 1 of 3: **plan**, then `opengame-trailer-make`, then `opengame-trailer-review-and-improve` on every round.

The job is a plan good enough that the first full cut is already above the last film. The last one, the OG Clash launch
trailer, took 47 hours, 4 chained sessions, about 80 subagents, about 100 owner notes and 63 renders, and its owner
still rated the shipped film 6/10. Most of those notes were things a plan could have settled: idle characters, a puppet
enemy animation planned as a hero shot, cheap effects, depth of field that blurred everything, heroes and enemies coming
from the same side, a mechanic on screen for 0.57 s, a title that looked like a sticker, and no story. This plan aims at
11/10: the trailer people rewatch and share.

For a kill montage, highlight edit or clip edit to a song, use `opengame-montage-plan` instead: a montage overrides
several trailer defaults (no designed silences, equal payoff spacing, the song never edited).

## Read first

1. [references/core.md](references/core.md), whole: the loop, the bar, the principles, what 11/10 means, the working
   rules. It decides what else applies.
2. [references/gates.md](references/gates.md): the measurable gates every cut must pass. Plan so the first cut passes them.
3. [references/owner-eye.md](references/owner-eye.md): how a demanding owner reviews, the anticipation table, the
   pre-send checklist and the recurring notes with the rule each produced.
4. [references/archetypes.md](references/archetypes.md), [references/music.md](references/music.md),
   [references/craft.md](references/craft.md), [references/filmable.md](references/filmable.md).
5. [references/reference-set.md](references/reference-set.md), then [references/edge-cases.md](references/edge-cases.md)
   if the game is 2D, abstract, closed, multiplayer-only, mobile or VR.
6. [references/og-clash-record.md](references/og-clash-record.md): where the last film's time and points went.
7. As needed: [references/title.md](references/title.md), [references/finishing.md](references/finishing.md),
   [references/review.md](references/review.md), [references/ops.md](references/ops.md),
   [references/briefs.md](references/briefs.md) (research and critic briefs, word for word), and
   [references/measure.md](references/measure.md) (how to measure every gate with ffmpeg, Python and a speech
   recogniser).

Related skills: `opengame-capture` (the hooks that make a game filmable, built into the game), `opengame-audio` (the
game's own sound), `opengame-production` (running many agent rounds against one owner), `opengame-quality-bar` (judging
the game itself). Keys come from the environment and are never printed.

## Settle the inputs (infer first; ask once)

Infer everything you can from the repo and the brief: the game's name, genre, engine, platforms, release moment (store
drafts, the changelog, tags), tone (art, palette, soundtrack), logo and brand assets. Then send **one** message with at
most four questions, each with a default, only for what you could not infer:

- **Archetype and length.** Default from the decision tree in the archetypes chapter. For a browser game: a 45-75 s
  launch trailer, a raw gameplay montage and 15 and 30 s vertical cuts.
- **Resolution, frame rate and file size of the master.** 1080p or 4K (or a store size), 30 or 60 fps, the aspect.
  **Default 1080p at 60 fps, 16:9.** 4K costs about 4x the capture time and disk; 30 fps halves capture but loses the
  smoothness ramps need (App Store previews cap at 30 fps). Slow motion is captured from the simulation either way.
  Settle a target size or bitrate per deliverable ("so its not a crazy file size").
- **Music.** Two or three measured candidates with a 15 s excerpt each and a default (the music chapter). Never "what
  music do you want?". Their own track wins if they gave one.
- **The must-show list.** The core-loop beats, hero moments and newest features (default: the game bible's top beats).
- **Spend and permissions.** Any paid generation (music, voice, video, image, 3D) runs only on the person's own account,
  with their explicit go-ahead on the cost: ask, state what it is for and the likely cost, and record the answer word
  for word. Ask too whether improved but unshipped visuals may appear (fixed in a film build and handed back to the game
  team).

Never ask about the loop, the gates or the principles; they are not optional. If nobody answers, log the defaults you
took in `plan/DECISIONS.md` and keep going.

## Steps

### 1. Freeze and fan out (the first 10 minutes)

- **Freeze the build:** a named, hashed build players get; clone the release and the source (copy-on-write if your file system allows); play it once. Tell the game
  team in writing that the film works from it and they keep shipping.
- **Launch research in parallel,** briefs on disk first (the briefs chapter): the game bible (R-GAME), the capability
  map with one probe (R-CAPTURE), the music measurement (R-MUSIC), the reference measurement (R-REFS), voices and the
  sound inventory (R-SOUND). Run the taste pass (R-TASTE) **after** the references land.
- Set up the film repo: `plan/`, `research/`, `briefs/` (the common brief filled in), `capture/`, `edit/`, `title/`,
  `work/PROGRESS.log`, `work/REQUESTS.md`, `plan/DECISIONS.md`, `handoff/GAME-NOTES.md`, a spend ledger, and
  `film/SKILLS.log` with one UTC line per skill invocation.
- Start the notes ledger with the brief in the owner's own words; it is the first spec. Log every later note the moment it arrives.

### 2. Archetype, references, the bar

- Run the archetype decision tree; write the format (aspect, resolution, rate, length, deliverables, platform rules).
  For a launch, offer the package: the trailer, a raw gameplay montage, a share card and social cuts. The montage must
  show skilled play that fulfils every on-screen objective.
- Pick the floor, the bar and the edit bar for this genre (the reference-set chapter) and measure them (R-REFS). Write
  the act template from the measurements, not from memory: first voice line, first enemy, the cut-rate curve, where the
  title sits, the end card, how many silences end in slams, the first-person share, the feature beats.
- References are for measuring only. Never recreate another studio's game, characters, logo or shots, even renamed.
- Name every departure from the references and get a yes, or log the default. OG Clash departed on HUD feedback, beat
  lock, first-person share and voice count.

### 3. Music and the clock

- Choose per the music decision: their track, then the game's own score, then music they own or licensed, then
  generation (only with their go-ahead on the cost), then a licensable library with proof.
- Measure the chosen track fully: splices, a piecewise grid, a bar map, drops, holes, stops, the ending. Write
  `research/grid.json` and verify it with a click track. Edit to length on downbeats at phrase boundaries; take a
  ring-out from the song if it ends abruptly.
- Plan **2-4 designed silences** (silence then slam) and where the loudest moment lands (the boss or the title, never a
  mid-film feature).

### 4. Make the game filmable (map it; do not build yet)

- Fill the capability checklist C1-C19 (the filmable chapter) from R-CAPTURE. List the film-build hooks needed, each off
  by default, and the capture method for this engine (the per-engine table). Where you own the game, the in-game hooks
  follow `opengame-capture`.
- Audit before you plan: list every character, enemy, weapon and effect the plan wants on screen and mark which ones
  need an animation or effect audit on frames (`opengame-trailer-make` runs it). Mine the developers' QA history for what already
  looks bad.
- Draw the level from above: named places, the most cinematic spots, where each side comes from in each act (the
  screen-direction map), and lens positions that are physically possible.

### 5. Story, language and copy

- **Story first:** the hook (first 3 s: a question or an image), the promise, the escalation, the **turn**, the payoff
  (its impact frame on screen) and the **button** (a beat after the title that rewards a rewatch). Name at least one
  **character moment** (a reaction, a look, a line between characters) and one **signature moment** only this game can
  do. The 6/10 film had systems and no story; 11/10 starts here. Design at least two items from the core chapter's
  "beyond 10/10" list into the plan.
- **The film's one language** (the craft chapter): allowed cuts and transitions, the ramp recipe, camera rules, the HUD policy, the text
  policy, a colour script of one sentence per act, the sound rules. Ban every editorial effect; allow what the game
  renders itself.
- **Voice:** characters, not an announcer; density per the brief (references run 5-8 lines a minute); each line on the
  shot where its speaker is, or on the thing it names; the game's own lines and voices first; no other studio's names.
- **Title:** the game's own logo as a 3D object inside the scene of its shot (the title chapter): where it lands, and what
  energy it carries on which beats.

### 6. The shot list (`plan/shots.json` and the table in `plan/PLAN.md`)

| # | frames a..b at 60 fps (bars) | first person or cinematic | what performs (one whole action) | payoff frame and the beat it hits | camera (path, lens, px/f in and out) | cut in (kind, direction) | speed (ramp keys) | sound events | voice | source (build, flags) | reference moment |

- Every shot: one whole action, entering on the wind-up and cutting on the payoff; the payoff 1-3 frames before its
  beat; the camera moving from first frame to last; a reason to arrive.
- Rhythm: vary 0.5-4 beats; no more than 4 equal-length shots in a row; tighten into the drop; one long breath on the
  hero reveal; a new mechanic held at least 70-90 frames.
- First person 25-40 % of the film (the action section may reach about 50 %); first-to-third-person pairs as one take;
  long-draw weapons and acrobatics in third person.
- Machine-readable: `{n, a, b, kind, what, pair, payoff[], bars, take_covers, reason}`; keep each version of the list
  side by side.

### 7. A visual storyboard (a page, not a markdown file)

Publish a storyboard page: the timeline to scale against bars and drops, act bands, first-person and cinematic lanes,
every shot with its frames, action, payoff, cut in, camera, sound and a thumbnail (a probe still, a reference frame or a
sketch). Republish it whenever the structure changes. In the first hour of making, stand up a review page with the
latest cut, a frame and bar.beat readout and the timeline, and send the owner its link after loading it yourself.

### 8. Pre-mortem: run the loop on the plan

- Check the plan against every gate and the owner-eye anticipation table, line by line; fix what it already fails.
- Spawn one blind harsh critic with only the storyboard, the references and the core chapter; filter its proposals
  through the rules (the review chapter); log the rejections.
- Send the open decisions in one short message, each with a default.

## Output

In the film repo: `plan/PLAN.md` (the brief in the owner's words; archetype and format; references and the act template; music and
the grid; the one language; the story arc; voice; title; the shot list; the capture plan with hooks for this engine;
owners; finishing; deliverables; open questions with defaults), `plan/shots.json`, `research/*.md`,
`research/grid.json`, the storyboard link, the common brief filled in, `plan/DECISIONS.md` and a line in
`film/SKILLS.log`. Then: "Plan ready. Run `opengame-trailer-make`."

## Don't

- Don't plan a shot around an animation, behaviour or effect nobody has seen on rendered frames.
- Don't plan engine depth of field as a look, a locked-off camera, a standing character, or a mechanic under 1.2 s.
- Don't plan interpolated slow motion, post blur, crossfades as glue, or invented effects.
- Don't storyboard from memory of what trailers look like; measure the references.
- Don't lock a track you have not measured, or cut on drops you have not found.
- Don't let a paraphrase strengthen the owner's words: their "sick angle and depth of field" became a brief for
  "shallow DOF, f/2.8, soft foreground", and the result had nothing sharp in it.
- Don't plan a title as an image tracked onto the frame.
- Don't spend on generation without the person's go-ahead, and never on an account that is not theirs.
- Don't recreate another studio's game, characters, logo or footage, even renamed.
- Don't skip the story: a feature list at 60 fps is still a 6/10.
