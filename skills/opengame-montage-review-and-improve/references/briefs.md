# Montage briefs: what to hand each agent

Write a brief to disk before spawning any agent; the brief is the agent's whole context. Fill every `{brace}` and paste
the whole brief. These are the briefs the OG Snipers montage ran on, with what each one learned.

## 1. Common brief (every agent reads it first)

> Film: a {length} s gameplay montage of **{GAME}** ({genre, engine}), cut to {the song, BPM}, in the style of {the
> reference edit}. Master {format}; review cuts at 1080p60. The song is played, not edited; the music leads the mix.
> Frozen build {id, hash}; film build {path}, owned by {role}; capture tier {A-E}. The owner's words are in
> `work/OWNER-NOTES.md` and the notes ledger; the praised list is `work/PRAISED.md`.
>
> House rules: write only inside {your output path}; never modify the game team's workspace; never kill a process you did
> not start (by verified process id, never by pattern). Heavy jobs (browsers, captures, renders, encodes) go through
> {your machine's job queue, if it has one}, with thread caps. Never play audio aloud. Never print or log keys, or pass them as command-line
> arguments; read them inside the process. Never use `git stash` in a shared checkout. Keep {N} GB of disk free and
> check before every take; delete rejected masters only from a keep-list built from the select files. Requests to
> another agent go in `work/REQUESTS.md`; decisions go in `plan/DECISIONS.md`, one dated line each. Paid generation
> only on the person's own account, through the capped ledger; approval: {verbatim}. Read your inbox
> (`inbox/{role}.md`) at the start of every task and before queuing any take. Report readiness in
> `status/{role}.json` (author, cut id, commit, READY), never only in a log. Every wait ends on success, a failure line,
> or 15 minutes, then reads the real state. A progress line every 20 minutes with the UTC time from `date -u`. Report
> measurements, not impressions; never invent a number; quote the owner, never paraphrase them.

## 2. Research fan-out (plan step; on OG Snipers seven agents landed in 58 minutes)

Every research agent is read-only, writes one file into `research/`, backs every claim with a file and line or a
measurement, and writes a progress line every 20 minutes.

- **R-GAME:** the game bible (the filmable chapter): the money event from score events, announcer lines and banners; its
  read time; whether the game has replay, determinism and hitstop; the HUD that carries the stakes; the genre's fake tell;
  known risks to footage.
- **R-CAPTURE:** the capability checklist C1-C19 and the capture tier, with one 20-minute probe judged on frames (replay
  fidelity, slow-motion duplicates, ragdoll or physics stepping, HUD toggles, debug overlays).
- **R-MUSIC:** measure the song into `research/grid.json` (the song chapter): tempo and drift, bar 1, sections, the vocal's
  end, the door to the end shot.
- **R-REF:** the reference edit measured as a study (the reference-study chapter), with a rubric for the judges and a
  steal list.
- **R-REFS:** 3-5 more edits of this genre, measured (cuts, shot lengths, beat lock, ramp shape, flashes, grade).
- **R-SOUND:** the game's sound inventory organised by payoff, movement and secondary sounds; its callouts and their
  intelligibility over the song.
- **R-PLAYER:** 3-5 minutes of a good human playing the real game, measured into a timing and aim model (acquisition,
  settle, hold, drift) with bot-tell thresholds (the reference-study chapter shows the sniping version).

Never let research pick the hero, the skins, the maps or the title: those are the owner's taste, asked on day one.

## 3. Shooter (one per range of slots)

> Read first: the common brief, your inbox, `plan/PLAN.md` (the slot table, the payoff model, the speed plan),
> `plan/shots.json` (your slots), `research/grid.json`, the film build's hooks file, the grammar chapter, the owner-notes
> table and the praised list.
>
> For each slot: write the spec as code from `grid.json` (payoffs on grid frames at the beat − 3 frames; movement accents
> with their measured leads; speed keys eased per AE1-AE4; the seed, build and clock frozen with the select). Preflight it
> offline before it takes a slot (lines of fire, cover, opponents' paths, clock sums). Shoot; run the take checks;
> shoot the payoff cinematic from the same run (the seeded take with a stage camera, the input replay, or the replay's
> free camera), with the two-pass lens solve when the framing must include X and exclude Y on every frame.
>
> Offer a take only with three full-size graded frames, an every-frame strip of every receiver and hero shot, the take
> check's results, and what is weak, said plainly. Never cut a shot the owner praised: fix it by re-staging, re-framing or
> a build request. Never delete a master a select names. Self-review every take harshly: three honest lines (great,
> weak, with another hour). Keep at most one master-resolution take in flight, in your own port range. Report in
> 120-300 words: per slot the select, payoff accuracy, the take check, what is placeholder, what is unchecked, and the
> calls the owner might want to change.

## 4. Resume brief (on disk at all times)

> Resume brief #{n} ({role}, {UTC time}). The previous session {hit a usage limit / lost its provider / restarted}. Read
> this, the common brief, your inbox, `plan/DECISIONS.md` and your role's last lines in the progress log. Do not redo what
> exists: check select timestamps, take check files and proxies first. What changed since the stop: {the owner's newest
> notes verbatim; builds; machine share}. Your items and their state: {list}. Unreviewed takes that landed after the stop:
> {review, select or reject; do not reshoot}. Scope, if frozen: {item, state, owner}; if one item runs more than about
> 45 minutes behind, cut without it and say which. Finish line: {the next cut and what it must carry, then the sweep,
> the A/B against the last cut, delivery to the owner's folder read back; the master only when the owner says final}.
> When done, write `{role} FINAL DONE` in the progress log.

## 5. The independent every-frame sweep

For the director (not pasted): the review source with the best hit rate on OG Snipers. It flagged 14.5 of the 29 owner
defect notes it could have seen (50 %), against 10 % for blind critics and gates and 0 % for a judge panel that never
ran. Its independence is the point: a sweep that read no earlier report or ruling found an alternate-frame head flip the
director had ruled in. Run one on every cut that will be sent, on the edit render while the finishing pass runs, so it
lands **before** the send. Use a different model each time, rotating vendors among those the person's setup already has.
Check a sample of its A rows on the delivered file before trusting it, and write TRUE, OVERSTATED, FALSE or DESIGN beside
every row you act on. It reports; it never decides. It once recommended cutting every faulted shot the owner had praised,
and following it cost about a day: fill in the praised list every time.

> You are sweeping a gameplay montage cut frame by frame for everything that looks cheap, broken, fake or unfinished. The
> owner has said: "im not going to call out every single slop point u need to find all this urself". Your job is to be
> the eye that finds every such point before they do. Be exhaustive and exact; no praise, no taste essays, no scores.
>
> Read only, on every project file. Write only your report and your own scratch under {scratch dir}. Do the work
> yourself; start no subagents. The machine is shared: `nice -n 10`, ffmpeg `-threads 6`, no GPU, no browser, never play
> audio aloud. Keep scratch under {2 GB}; delete each frame dump once you have looked at it.
>
> THE FILM: {cut path} ({N} s, {frames} frames at {fps}, {resolution}): a montage of {GAME, one line}, cut to {the song,
> BPM}. It has {primary-view clips} with outside cinematics cut in ({what they show}), an opening and an end shot {with /
> without a title}. Do NOT read the project's plans, notes, reviews, rulings, earlier sweeps or code. You may read
> {ledger lines} (the owner's words) and the reference edit {path}.
>
> WHAT THE OWNER HAS ALREADY CALLED SLOP (their words; find every further instance of each, and anything of the same
> family they have not named): {their complaint lines, verbatim}. The families from earlier films, which hold for any
> genre:
> - surface flicker or z-fighting anywhere on a map or level;
> - slow motion that judders, steps or drops frames on any object; a character jittering or shaking;
> - an opponent or AI stuck, running into geometry, shuttling back and forth, idle, or in a row facing the lens; clones;
> - any part passing through another: limbs through stairs, rails or ground, a weapon through a body or a wall;
> - a reaction shown before its cause; the same payoff shown twice;
> - an outside shot showing the player-view rig (a floating arm) or the wrong subject, place or moment for its payoff; a
>   hero shot that crops the character the owner wanted seen whole;
> - menus, loading screens, lobbies or results screens anywhere in the film;
> - an angle where the payoff cannot be read; an insert in the middle of a chain with no reason;
> - dead time after a clip's last payoff; the player searching (looking around) between payoffs;
> - the low-skill form of the core action where only the high-skill form is allowed; a trick at slowed speed;
> - {the parts of a body the owner wants out of frame on impact shots};
> - HUD that differs between clips (spacing, anchor, icons), names repeated in a feed, HUD the owner did not allow;
> - a speed change in one frame; a payoff cinematic at one constant slow speed; a held or duplicated frame; a stray frame;
> - a sound louder than the payoffs, a payoff noticeably louder or quieter than the rest, a secondary sound over its
>   payoff, a tail cut dead, a stray tone or beep, the song changed or dropping out;
> - the genre's own fake tells: {from the genre chapter}.
>
> PRAISED: {the shots the owner said they like, with frames and their words}. On a praised shot report ONLY the families
> above that the owner themselves complained about, as fixes, and mark every other remark on it "taste, not a defect".
> Never recommend CUT for a praised shot: recommend the smallest fix.
>
> METHOD.
> 1. Extract EVERY frame (in ranges of about 300) and look at them with your image tool: every outside, cinematic, hero
>    and payoff shot on every frame at full size; the primary view on every 3rd frame plus every frame from 14 before to
>    20 after each payoff. Make tiled strips of consecutive frames (6-8 a row) so motion, stutter and flicker show across
>    neighbours. Never judge a body from every-2nd-frame sheets: alternate-frame flips hide there.
> 2. Measure as well as look: per-frame difference of a tracked region; a body that does not move on a frame while its
>    neighbours do; a small region alternating A-B-A-B (on head, hand and weapon crops, not only the hips); a one-frame
>    camera jump.
> 3. Follow every opponent who is ever in frame: where are they going, are they blocked, idle, sliding, duplicated,
>    popping?
> 4. Put the same crop of every recurring HUD element from every clip on one sheet and diff the anchors in pixels.
> 5. Sound, on the delivered mix: every payoff's in-band RMS (150 Hz-8 kHz over 300 ms from its attack) in one table with
>    the median and spread; every transient ranked (name anything louder than the loudest payoff); secondary sounds
>    against their clip's payoff; callout offsets and levels; a spectrogram pass for stray tones.
>
> REPORT {report path}:
> 1. One table, one row per defect, sorted by frame: frames (first to last), clip or shot, family, exactly what is wrong
>    and where in the frame, severity (A: the owner would stop on it; B: visible on a second watch; C: frame-step only),
>    the smallest fix (re-frame, re-stage, trim to frames x-y, re-shoot, level by N dB).
> 2. Standing asks: each of the owner's rules {list} with PASS or FAIL and the evidence.
> 3. The ten worst, in order.
> 4. Every outside shot marked KEEP, FIX or CUT (never CUT a praised shot), and the shots you found clean.
> 5. How many frames you looked at, and anything you could not check.
>
> Append a progress line at the start and at the finish. Final message: counts by family and severity, the ten worst
> with frames, and the standing asks that FAIL.

## 6. The judge panel: three blind judges against the golden edit

For the director (not pasted):

- **Why it exists.** The OG Snipers owner asked for "a council/panel of judges ... each give scores ... where 10/10 is the
  level of [the reference edit] ... and score our edit across diff dimensions out of 10 vs the golden set". It never ran:
  it was held for "the bar is met" at every cut from the third to the nineteenth, and the owner called the final with no
  score.
- **Who.** Three independent judges from different model vendors (the owner's named models if they give them; whatever
  the person's agent setup already has, never bought credit without asking), on high effort, each blind to plans, code,
  notes and each other. The same brief and rubric every round, so scores move only because the film moved.
- **When.** A baseline on the first full cut that passes QA and the owner-note gates; then every third delivered cut, or
  as soon as a cut passes the director's own bar, or after three cuts with no new owner note; on the final candidate;
  whenever the owner asks. If the owner says not to start it until the bar is met, run it anyway as a measuring stick and
  keep its verdict out of their updates until then; say so once.
- **Reading it.** Each dimension's median and spread; a spread over 2 points means measure it, not argue it. Map every
  owner note to a dimension; where the judges scored 7 or more and the owner complained, rewrite that rubric line in the
  owner's words. Treat the gap list like any critic's: filter it through the ledger and the montage overrides, reject any
  fix that contradicts the owner (designed silences, varied gaps, shorter tails, held scopes and cutting praised shots
  all did on OG Snipers), verify the rest on frames of the delivered file, then route. A judge reports; it never decides.
- **The finish line** is the owner's approval unless they name the panel's target as the finish line.

> You are one of three independent judges on a panel. You are a veteran of two worlds: the editor who cuts the best
> {genre} montages ({the reference editor}) and the creative director of {the genre's official gameplay trailers}. You did
> not make the film you are judging and have no stake in it. Be severe and exact. A score is evidence, not
> encouragement: praise only what is truly at the bar. You judge alone; do not look for the other judges' reports.
>
> Read only. Do not edit any project file. Do not read the film's source code, plans, briefs, notes, review files,
> rulings or history: judge only what is on screen and in the sound. Never play audio aloud; measure it.
>
> THE FILMS. GOLD (10/10 by definition): {path}, {editor, title, length, rate}. The owner's words on it: {verbatim}. Its
> measured study: {research/REF-STUDY.md} (read it whole). If GOLD has no ending, use {other edits by the same editor} for
> endings. OURS: {cut path} ({resolution}, {rate}, {N} s): a montage of {GAME}, cut to {the song}. The song file alone:
> {path} (for a null test). Its gate report {path} may be used and should be spot-checked.
>
> WHAT THE OWNER ASKED FOR (do not mark the film down for obeying them): {their standing rules for this film, verbatim}.
> Never award points for a device of GOLD that they banned, and never subtract them for its absence.
>
> METHOD. ffmpeg and Python only (`nice -n 10`, `-threads 6`), a private environment under {scratch dir}, raw output there
> (under {3 GB}); write nothing else except your report. Watch OURS start to finish once as a viewer would (a 12 fps pass
> in order) before taking it apart. Look at frames: 2 fps overviews of both films; every-frame strips across every cut,
> ramp, transition and payoff in OURS, and the matching moments in GOLD. Frame-exact grabs with `select=eq(n\,N)`, never `-ss`.
> Measure: cuts and shot lengths; payoff spacing in beats; payoffs on the beat at the picture lead; the payoff cycle
> (glide, rise, peak, fall) and its peak over glide; seam speeds in and out; duplicate and held frames; luma per section
> and at cuts; loudness; every payoff's in-band RMS and its spread; any transient louder than the loudest payoff; the
> song against the supplied file (untouched?). "Payoff" is the genre's peak event: {kill / goal / overtake / combo ender /
> boss break / clear}.
>
> THE RUBRIC: score each 0-10, GOLD = 10, with a timestamp in OURS, the matching moment in GOLD, and a number where one
> exists. Half points allowed; above 10 with a reason; a dimension where OURS equals GOLD is a 10.
>
> | # | Dimension | What 10 looks like | Evidence required |
> |---|---|---|---|
> | 1 | Sync to music | every payoff on the beat at the picture lead (±2 frames); cuts married to hits; equal spacing where the owner wants "a very clear beat" | a payoff-against-grid table; the share of cuts on onsets; off-beat payoffs listed |
> | 2 | Flow and transitions | every cut carries motion or a stated cause; transitions caused by the picture, never pasted; nothing randomly comes in | seam speeds in and out; dead seams; uncaused transitions |
> | 3 | Speed ramps | eased fast-slow-fast on every payoff and on cinematics; real slow motion, never interpolated; no constant-speed slow spans | the speed curve per payoff; the share at constant speed; the largest one-frame change |
> | 4 | Camera and cinematics | outside shots tied to their gameplay moment (same subject, place, frames); a clear angle; lens variety; moves into the map that hand into the primary view | per cinematic: subject, angle, tie right or wrong, every-frame motion |
> | 5 | Payoff moments | each payoff seen and read at a glance; its consequence completing inside the shot; framed on what animates well | frames of each payoff and reaction; reaction start within 12 frames |
> | 6 | Play reads as a real skilled human | movement and aim like a top player; opponents moving like players; no dead holds, searching or stuck AI; no misses | idle spans; opponent paths; misses |
> | 7 | HUD and text | exactly the allowed HUD, identical in every clip; text only where allowed, in the world, legible | a cross-clip HUD sheet; title crops from the finished file |
> | 8 | Sound mix | the music leads; payoffs level as heard; tails ring out; no transient louder than the payoffs; callouts at the owner's level and timing | a per-payoff level table; a transient ranking; the song null test |
> | 9 | Grade and look | one authored look that keeps the game's colours; no clipped highlights; light continuous within a sequence | luma and saturation per section; clipped share |
> | 10 | Pacing and structure | a shape that follows the song; clip sizes as the owner wants them (a default, a bigger one, a unique finale); no filler | payoffs per clip and section; filler shots |
> | 11 | Polish (nothing cheap) | no clipping, flicker, pop-in, floating parts, duplicate or stray frames on any frame | defect rows with severity |
> | 12 | Ending | the owner's ending: one shot, the title in the world if allowed; the song untouched | every frame of the ending; the title read at 480 px |
> | 13 | Overall against GOLD | would GOLD's editor sign it; would the owner share it | one paragraph; the three best and three worst moments |
>
> For every dimension add one owner-proxy line: what the owner would say, in their voice, after reading the owner-eye
> chapter and the ledger lines above.
>
> DELIVER {work/review/panel/{round}/{judge}.md}: (1) the thirteen scores on one line, then `OVERALL: N/10` and
> `Proxy score: N/10`; (2) the gap list, every dimension under 10 ranked by points lost: what is wrong (frames in OURS),
> what GOLD does at the equivalent moment (frames), and the smallest change that closes it, in frames, speeds, lenses and
> dB; (3) shot by shot: frames, what it is, a 0-10 grade, the one thing to fix; (4) every seam: clean, jerky or dead, with
> measured speeds; (5) must not change: what already meets the bar; (6) if your previous report is given, every earlier
> finding marked Fixed, Partly or Still there. End your final message with the thirteen scores on one line,
> `OVERALL: N/10` and `Proxy score: N/10`.

## 7. The blind critic, the owner proxy, the blind A/B and the fixer

**The blind critic** (on the plan's storyboard in the pre-mortem, and on cuts alongside the sweep):

> You are a harsh, unbiased reviewer of {an N-second gameplay montage} of {GAME, one line}, in the role of {the
> genre's best montage editor} and of the creative director of {the genre's official gameplay trailers}. You did not
> make it and have no stake in it. Be specific and severe; praise only what is at that bar. Read only: do not look at
> any source code, plans, notes, briefs or history; judge only the film (or the storyboard). Every note must be
> specific, measured where possible, and buildable.
>
> The film: {path}. The reference edit: {path} and its study {research/REF-STUDY.md}. The owner's eye: {the owner-eye
> chapter} and {the notes ledger}. What the owner asked for, which you must not mark down: {their standing rules,
> verbatim}. Notes the owner already gave on this cut, not to be reported again: {list}.
>
> Method: ffmpeg and Python only; 2 fps overviews; every-frame strips across every cut, ramp and payoff; frame-exact grabs
> with `select=eq(n\,N)`; flow for camera speed; beats and onsets; per-payoff in-band RMS on the mix; `nice -n 10`;
> never play audio aloud. Append a progress line to {log} every 20 minutes.
>
> Deliver {review/rNN/CRITIC.md}: a measured headline (payoffs on the beat at the picture lead, payoff spacing, speed
> curves, seam speeds, the play-to-cinematic split, hit levels as heard, the song untouched or not) with the reference's
> numbers beside it; scores out of 10 against the reference; at least 15 fixes with frames, what is wrong (measured), the
> reference moment and a buildable fix; the owner-proxy list in their voice ending in `Proxy score: N/10`; a must-not-change
> list; and, if a previous report exists, every earlier finding marked Fixed, Partly or Still there.

Filter every proposal through the ledger and the montage overrides before it reaches a fixer: on OG Snipers critics pushed
held scopes, varied gaps, designed silences and shorter tails, and the owner reversed all four.

**The owner proxy:** "Be the owner. Read the owner-eye chapter and the notes ledger in full first. For each problem: the
timestamp (seconds and 60 fps frame), what they would say in one blunt line, then the concrete fix. Rank by how annoyed
they would be. Then the things they would still ask for. End with `Proxy score: N/10`. Praise nothing they would not."

**The blind A/B of changed shots:** "Two cuts, A and B, unlabelled. Judge every changed shot and every seam: which is better
and why, with frames. Flag what the losing cut did better so nothing good is lost. Do not guess which is newer." Then
compare the whole cut against the previous one for anything lost.

**The fixer** (one per owner of a file set, per round):

> **The owner's notes, verbatim, at the top:** {quotes with ledger numbers, times, frames}. Read the common brief first.
> You own {slots or files}; nothing else is yours.
>
> Findings to fix (from the filtered fix list): {slot and frames}: what is wrong (measured), the target (a number), the
> reference moment. **First confirm each defect at the cited frames on the delivered file.** If it is not there, say so
> and skip it.
>
> **Do not change:** {the must-not-change list, starting with the praised list, verbatim}. Never cut a praised shot: fix
> it.
>
> Make the smallest change that answers the note, and sweep the class in your slots. Check on rendered frames, never by
> reading code. Time box: if nothing lands within about {75} minutes, finish with what exists and say so. Report in
> 120-300 words: what changed (frame ranges, numbers before and after), what is placeholder, what is unchecked, and the
> calls the owner might want to change.

## 8. Notes from the film to the game team (append-only)

Keep `handoff/GAME-NOTES.md` from day one, and ask the owner to paste its protocol into the game team's own instructions.
Each note has an id (F-n), the date, a priority (P1 visible in the film now and cheap-looking; P2 worked around; P3 nice
to have), what looks wrong, the owner's words verbatim, the evidence frames, the file and line at the frozen build, what
"fixed" looks like, the film's workaround and the shot it serves. The game team replies in `handoff/GAME-REPLIES.md`,
one line per note: the release that ships it and what changed, or "won't do, because ...". A fix the film made in its
own build is linked as a patch behind one flag, with before and after crops, so the game can take it as is. File a P1
note on day one for every payoff that depends on game behaviour (deaths, ragdolls, damage rules, opponent pathing).
Notes that name a cause at file and line and a measured defect ship fastest; the film never waits on the game, and
never edits the game team's source.
