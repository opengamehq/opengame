> Carried from `opengame-montage-plan` 1.0.0. Read it when: Plan a gameplay montage of any game, genre or engine before anything is captured. Covers the owner's day-one questions in one message with defaults, the song measured into a film map, payoffs spaced on the beat by read time, the payoff shot and eased speed ramps designed first, the capture tier, and a frame-exact clip plan and storyboard. Use when someone wants a kill montage, frag movie, highlight reel or clip edit to a song. For a trailer or reveal, use opengame-trailer-plan.


# Montage plan

Step 1 of 3: **plan**, then `opengame-montage-make`, then `opengame-montage-review-and-improve` on every round.

The job is a plan that settles, before the first take, what cost the last montage its time. The OG Snipers sniper montage
took 66 h 38 min, 19 cuts and about 50 capture sessions per shipped slot, with 21 owner reversals. A plan could have
settled the payoff spacing (two re-shoot rounds), the hero (about 10 hours on the wrong one), the payoff framing (a day of
animation tuning undone by one note), the title (23 hand-ins), staged hits, speed ramps retrofitted at hour 64, and a
4K master that had to be an upscale. Every rule below is stated for any genre; the OG Snipers numbers are examples.

A montage is not a trailer: no story arc, no voice script, no call to action, and the owner's song is never edited.
For a trailer, teaser, launch or reveal video, or the raw real-time gameplay reel of a launch package, use
`opengame-trailer-plan`.

## Read first

1. [references/montage-grammar.md](references/montage-grammar.md), whole: where a montage overrides trailer defaults,
   and the grammar with numbers (the film map, spacing by read time, sync, the edit never retiming, eased speed, the
   payoff cinematic, the primary view, HUD, cuts and transitions, the finishing layer, the end shot, sound).
2. [references/day-one-questions.md](references/day-one-questions.md): the 30 questions with defaults and why each was
   needed.
3. [references/montage-genres.md](references/montage-genres.md): money moments, read times, cameras, HUD, fake tells and
   hooks for 19 genres, and the day-one decision tree for an unknown game.
4. [references/montage-capture.md](references/montage-capture.md): capture tiers A-F, film-build hooks, and shooting
   from a replay, input replay or live play when there is no source.
5. [references/owner-eye.md](references/owner-eye.md): how a demanding owner reviews, and the montage anticipations.
6. [references/song.md](references/song.md) and [references/reference-study.md](references/reference-study.md): the song
   measured into a film map; the reference edit, its finishing layer and a good player, measured.
7. [references/montage-gates.md](references/montage-gates.md), [references/montage-ops.md](references/montage-ops.md)
   and [references/og-snipers-record.md](references/og-snipers-record.md): which gates mattered, the team and the time
   budget, and the 19-cut record.
8. As needed: [references/filmable.md](references/filmable.md) (the capability checklist and stepped capture),
   [references/briefs.md](references/briefs.md) (research, sweep and judge briefs) and
   [references/measure.md](references/measure.md) (how to measure everything with ffmpeg, Python and a speech
   recogniser).

Related skills: `opengame-capture` (the hooks that make a game filmable), `opengame-audio` (the game's own sound),
`opengame-production` (many agent rounds against one owner). Keys come from the environment and are never printed.

## Day one: the owner's questions, in one message

Infer everything that is not the owner's taste from the repo, the build and the song. Send the rest in **one message
within the first hour**, each question with a default and, where possible, a picture to choose from: owners answer yes/no
and "which of these" fast and leave open-ended sheets unanswered. If nothing comes back, log the defaults in
`plan/DECISIONS.md` and keep going. Ask each once. The 30 questions are in the day-one chapter; they group into ten:

1. **The song (Q1-3):** where the montage ends in the song (a measured point such as the vocal's end) and the ending after
   it; may the song be edited or dropped; is the music the loudest element. Default: untouched, one gain, a fade of at
   most 0.5 s, the music leads; attach a 20 s mix check.
2. **The reference and the finish line (Q23-24, Q27):** their reference edit is GOLD, 10 by definition; which parts
   matter; follow its split of play and cinematics; its finishing layer (attach a 15 s look test); is a judge panel's
   score or their approval the finish line. Default: their approval, with the panel run on a schedule anyway.
3. **Payoffs (Q4-9):** fixed spacing on the beat; may a beat be a movement or a cut; payoffs per clip, the biggest, the
   finale; banned play styles, tricks and their speed; legal under the real rules, and the mix of payoff types; which of
   their habits to copy; how opponents look and behave; which names must be unique.
4. **Format, delivery, cadence, deadline (Q25-26, Q28):** review and master formats; capture at the master; the folder
   every cut goes to; a cut per burst of notes or one complete cut; the deadline and the rounds they expect.
5. **Hero and cosmetics (Q10-12):** whose character in which exact outfit (an account link or a screenshot); does the
   player-view model change; their shortlist of skins and whether reuse is fine; which weapons, cars or loadouts with
   which iconic parts. Default: their own character; the player view as shipped; a casting sheet before shooting.
6. **Maps or levels (Q13):** must-show, and which go first if clips need length.
7. **HUD (Q18):** a frame of each element next to the shipped game. Default: success feedback only, matching the shipped game pixel for pixel.
8. **Cinematics and the payoff shot (Q14-17):** which kind they like (three stills: a move into the map handing into the
   player view; the payoff from the receiver's side; the hero alone); what may be in frame at impact; eased ramps
   everywhere (the pilot clip, step 6). Assume without asking: a shot they liked is never removed without asking them.
9. **Ending and text (Q19-20):** one shot or a sequence, how long, what the hero does; any text; if a title, its
   material, font (five on the real plate), in the air or on the ground, how it animates; no title rather than a weak
   one; confirm any name or word in one line (dictation garbles names). Default: one shot of 3-5 s, no text.
10. **Sound, spend, limits (Q21-22, Q29-30):** voice lines, their offset and level; keep every game sound and the
    hit-confirm tick; paid generation only on their own account with a cap they approve; compute; **their never-list**,
    each item gated on their own flagged frames before any cut is sent.

Also assume: updates every 15 minutes; side work goes to another session; no placeholder is ever sent.

## Steps

### 1. Freeze and fan out (the first 30 minutes)

- **Freeze the build:** the latest stable build, named and hashed; the game team keeps shipping.
- **Research in parallel, briefs on disk first** (the briefs chapter; on OG Snipers seven agents landed in 58 minutes):
  R-GAME (the money event from score events, announcers and banners; its read time; replay, determinism, hitstop),
  R-CAPTURE (a tier probe), R-MUSIC (the grid), R-REF (the reference edit measured as a study), R-REFS (3-5 edits of this
  genre), R-SOUND, R-PLAYER (a good human's play on the real game, measured: acquisition, settle, hold, drift).
- The film repo as for a trailer, plus `status/<role>.json`, `inbox/<role>.md`, `work/OWNER-NOTES.md` (one row per note
  with its verification state), `work/PRAISED.md` and `film/SKILLS.log` (one UTC line per skill invocation).
- Log the brief in the owner's words into the notes ledger and `work/OWNER-NOTES.md`: it is the first spec.

### 2. Genre, payoff and capture tier

- From the genre chapter: the money moment, its read time, the show-it-twice device, the impact grammar, the fake tells,
  the HUD that carries the stakes, the hooks needed.
- Pick the tier (the capture chapter): A source or a film build; B deterministic input replay; C a replay or demo with a
  free camera; D the game's own cameras or photo mode plus high-frame-rate capture; E live play only; F no GPU (stop).
  Run a 20-minute probe judged on frames (replay fidelity, slow-motion duplicates, ragdoll or physics stepping, HUD
  toggles, debug overlays).
- State the limits in the plan: B-E have no film build, so staging, seeds and probes become recorded human play, replay
  passes and event mining; C and D slow motion only as fine as the replay re-simulates (interpolated replays to 0.5x); D
  and E slow motion capped at capture fps ÷ 60; E has no second angle, so a lower cinematic share.

### 3. The film map from the song

- Measure the track fully into `research/grid.json` (the song chapter): tempo, drift, bar 1, sections, the vocal's end,
  the door to the end shot. Map the owner's spoken times onto measured downbeats and confirm the length in one line.
- Slots of 8, 12 or 16 beats; a slot's last 2 beats are its last payoff's hit and cinematic, or the next entry. Sections
  drive content: verse = play, chorus = spectacle. A flat loop has its sections made by the edit. Ambient or orchestral:
  phrases, not a grid. A rhythm game on a song that is not its chart: chart it or mute it.

### 4. Money moments on the read-time grid

- k = the smallest power-of-two number of beats that covers the payoff's read time: about 2 beats for a quickscope, 4-8
  for an overtake, 8 for an aerial goal, 8-16 for a fighting combo, 16-32 for a teamfight. Put every payoff on the same
  beat positions at that spacing; vary what is on screen, never the spacing.
- Every grid point is a payoff, a movement accent peaking on it, or a cut. Measure each movement's lead on day one (OG
  Snipes: a jump peaks 0.32 s after the key, a flip 0.43 s, a mantle 0.25 s). Openers can be movement; the first payoff
  comes a beat later.
- Per clip: the default size, one bigger, a unique finale; at most one trick; one signature moment only this game can do;
  the staple is a clean chain of single high-skill payoffs.
- Plan the visible payoff frame at the beat − 3 frames (60 fps) and its sound attack on the beat; cause before effect,
  once.

### 5. Design the payoff shot first

- Write its framing model before any animation or physics tuning, in this genre's terms: the receiver at least a third of
  frame height; what must stay out of frame (what the engine animates worst, from the audit and the owner's still choice:
  legs and feet on OG Snipers, wheels on the terrain in racing, pathing feet in a MOBA); the consequence visible within 15
  frames and complete by 60 % of the span; a span of at least 28 frames; the same run (seeded take, input replay or
  replay pass) seen from the receiver's side; held to the clip's end. Name the probes it needs (the receiver's drawn
  points, the payoff point, the line of the attack, ground height) so the film build adds them on day one, or the replay
  pass that stands in at tiers B-D.
- Put a three-option still sheet to the owner before mass shooting.

### 6. The eased speed plan

- Write per-clip speed keys from the start, not as a retrofit: the payoff cycle with drag-through; AE1 every change eased
  over 8 or more frames with no more than 15 % change a frame; AE2 a V on every payoff cinematic; AE3 cuts between clips at 2.5-3x out
  and in; AE4 no searching, dead travel at 1.5-2x. Genre: racing inverts it; fighting keeps hitstop, re-timed; a rhythm
  playfield is never slowed; 2D sprites stay on their own drawings.
- **Pilot one clip on day one** with ramps everywhere, the payoff framing and the finishing look, and send it to the
  owner: "is this the look for every clip?" On OG Snipers this question came at hour 64.

### 7. The rest of the language

- Primary view, HUD, cuts and transitions, look, ending and sound per the grammar chapter. Test every voice line over the song at 5
  offsets with two speech recognisers now, not in the mix. List every departure from the reference and from the montage
  overrides, with the owner's yes or the default taken.
- Never recreate another studio's game, characters, logo or footage; the reference edit is measured, never copied.

### 8. The clip plan (`plan/shots.json` and the table in `plan/PLAN.md`) and a storyboard

| slot | frames a..b at 60 fps (bars) | map or level | loadout and skin | grid frames (payoff, accent, cut) | payoffs (count, type, legal) | opener | tied cinematic (receiver, framing, span, V) | cut out and in | HUD | sound and voice | tier, build, seed or replay | reference moment |

One machine-readable object per slot with the same fields. Publish the storyboard as a page (the timeline on bars, play
and cinematic lanes, a still per slot) and republish it when the structure changes.

### 9. The delivery plan (two steps)

- **Step A, a good cut early:** the first full real cut (no slates, no placeholders) by hour 8-10; a cut that clears every
  note so far by hour 16-20, labelled as one they could stop on.
- **Step B, polish to the owner's call:** every cut labelled with its change list and which cut to judge; copied by the
  cut chain to their folder and read back; cadence matched to their attention (the OG Snipers owner gave notes on 7 of 19
  cuts and came back to the newest). "Final" only for what is final; when they say final, stop and render the master at
  its native format.
- The judge panel's schedule (`opengame-montage-review-and-improve`): a baseline on the first full cut, every third cut, the final candidate.

### 10. Pre-mortem

- Check the plan against the montage overrides, the hard gates and the owner-eye anticipations, line by line.
- One blind critic on the storyboard and the reference; filter it through the ledger (reject every device the owner
  banned), log the rejections, and send what is still open in one short message with defaults.

## Output

In the film repo: `plan/PLAN.md` (the brief in the owner's words; genre, tier and its limits; the day-one answers and defaults;
reference measurements; music and the grid; the slot table; the payoff model; the speed plan; HUD, transitions, look, ending,
sound; the capture plan with hooks or replay passes; team; the delivery plan; open questions), `plan/shots.json`,
`research/grid.json`, `research/*.md`, `plan/DECISIONS.md`, `work/OWNER-NOTES.md`, the storyboard link, and a line in
`film/SKILLS.log`. Then: "Plan ready. Run `opengame-montage-make`."

## Don't

- Don't let a reference number or a trailer default outrank the owner's word (varied gaps, designed silences, short
  tails, held aim, a 30 % title).
- Don't cast the hero, skins, maps or title from an audit; ask with a casting sheet.
- Don't tune any animation or physics before the payoff framing is decided.
- Don't plan speed as constant slow motion, one-frame steps, interpolation or a retrofit; at tiers C-E, say the limit.
- Don't fill every grid point with a payoff; a beat can be a movement or a cut.
- Don't plan capture below the master format.
- Don't plan a cinematic tied to nothing, or the hero alone as a showpiece.
- Don't plan a direction check made of placeholders; ask in words or stills. Don't touch the owner's song.
- Don't spend on generation without the person's go-ahead, on their own account.
