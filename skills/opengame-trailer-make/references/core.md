# Core: the trailer method in one chapter

Read this whole. It decides what else applies.

The method comes from the OG Clash launch trailer: a 62 s cinematic trailer of a co-op zombies game (C compiled to
WebAssembly, rendered with WebGPU), made by agents in 47 hours over 4 chained sessions, with about 80 subagents, about
100 owner notes, 63 renders and 2 blind critic rounds. It shipped, and two days later its owner rated it 6/10. The
skills `opengame-trailer-plan`, `opengame-trailer-make` and `opengame-trailer-review-and-improve` exist so the next
film starts above that. The target is 11/10: the trailer people rewatch and share.

## 1. The loop (not optional)

The owner's loop, in their words: "spawn an adversarial, harsh critic ... Do it." Then "Address the feedback." Then
"Try to self-improve." Then "Get feedback again from a harsh, blind, unbiased critic." Then "But don't make things
worse. Only strictly make things better." For trailers they added: "keep looping using adversarial subagents to give
you harsh criticism on flow and aura and quality and production level ... until its same Level as a black ops
official trailer AND a kaiser edit".

- **Blind critics** see the rendered file, the references and the owner's notes, nothing else. They run on every cut,
  need no GPU, and start the moment a cut passes QA.
- **Gates** are measured by you on every cut. They catch what critics miss: cheapness, animation, time to read,
  integration, consistency.
- **Filter** every proposal through the rules and log what you reject. The owner's explicit calls outrank critics.
- **Blind A/B: only strictly better.** Any shot judged worse than the previous cut reverts.
- **Never make the owner wait** on a finished cut for another loop. Send it labelled pre-review and keep looping.
- **The method learns every round.** Every note goes into a notes ledger; anything the owner caught that nothing else
  did becomes a gate. No note is given twice.

## 2. The bar

- **Measured references, not memories.** The floor is the genre's classic official trailers; the bar is its newest
  flagship official trailers; the edit bar is the community's best editor. For OG Clash: the World at War "Der Riese"
  trailer as the floor, the Black Ops 6 and 7 zombies map trailers as the bar, and the zombies montages of Kaiser (a
  FaZe montage editor) and NoahsEdits as the edit bar. References are for measurement only: never cut another studio's
  footage into the film, and never recreate another studio's game, characters, logo or shots.
- **Calibration.** The shipped OG Clash trailer: 6/10 from its owner; 5.5/10 against the Black Ops trailers and 4/10
  against a Kaiser edit from a blind critic. That is the floor of this method.

## 3. Principles

1. **Story, not a feature list.** A hook in the first 3 s (a question or an image), a promise, an escalation, a
   **turn** (the reversal), a payoff that shows the impact frame, and a **button** after the title. At least one
   **character moment** and one **signature moment** only this game can do. The 6/10 film had every system and no arc.
2. **Performed on the beat.** Cuts on the beat are table stakes. The action inside the shot hits the beat, and cuts
   marry hits and whooshes. A critic's line on the OG Clash first cut: "the cuts are on the beat but nothing actually
   happens on the beat."
3. **Every shot performs one whole action; every cut carries motion.** Enter on the wind-up, cut on the payoff, give
   the shot a reason to arrive. Nothing still that should move; nothing random.
4. **Speed ramps are the signature, and they must be legible.** Real simulation slow motion, never interpolated;
   fast, slow, fast inside one shot; motion through the slow span; nothing freezing.
5. **Contrast makes it big.** Two to four designed silences followed by slams, a loudness spread of at least 8 LU,
   the loudest moment on the climax or the title, a colour world per act, a breath before the end.
6. **Only show what the engine does well.** Audit animations and effects on frames before planning; frame out what
   fails (feet, holds, puppets); never invent effects on a hero; when something is called cheap, remove it first.
7. **Everything sharp and readable.** No depth-of-field mush; a mechanic held at least 1.2-1.5 s; clear geography and space.
8. **One world.** The title and every insert are physical objects in the world: 3D, lit and graded like it, never
   overlapping a character, still at rest.
9. **Characters talk; nobody announces.** Voice density follows the brief (references run 5-8 lines a minute; the OG
   Clash brief asked for many lines and shipped 13 in 62 s), in-world, on the right shot, never a wall over the drop.
10. **Sound never cuts out and never sounds cheap.** Tails through cuts, a designed hit on every big event, the music
    never dipping by accident.
11. **Shoot it, don't record it.** Freeze the build, fork a capture-only film build, step the clock, script every shot
    as code, fix cheap effects at the source and hand the patch back to the game team. `opengame-capture` lists the
    hooks a game needs to be filmable; build them into the game if you own it.
12. **Show progress constantly.** A review page from hour one, a preview every 30-60 minutes, ETAs from measured
    throughput, files and pictures rather than pipeline talk.
13. **The format is asked, default 1080p at 60 fps, 16:9.** 4K60 or 30 fps on request.

## 4. Beyond 10/10: what an 11/10 has

A competent trailer at the bar passes the gates. An 11/10 also has at least two of these, designed in the plan:

- **A silence drop on the climax:** the music cuts to total silence on the impact frame for about 0.6 s (one small
  sound from the world), then the slam. The shareable 3 seconds.
- **A match-cut chain:** 4-6 one-beat shots, each entering through the previous shot's shape (circles, slashes, eyes),
  ending in the logo. The one idea people remember.
- **A tone-clash button:** a last beat after the end card that plays on the game's personality. For OG Clash, plush
  heroes against a grim world: a marshmallow toasted over the dead boss's glowing chest, a hand reaching in from
  off-screen, a bonk, a cut on the beat.
- **A one-take first-to-third-person move:** first person pulls out of the head into an orbit around the action,
  possible only because the film build owns the camera.
- **A count-up build:** an in-world counter (round, score, combo) ticking on consecutive beats into the turn.
- **A spoken title:** one character says the name as the logo lands, then half a second of nothing.
- **A crew-identity beat:** name cards slammed on a held moment, or each hero's signature line on their own shot.

## 5. Which chapter covers what

| Module | Where |
|---|---|
| Story, structure, rhythm, the archetype | craft (structure, rhythm); archetypes (plan, make, review) |
| Music | music (plan, make, review); craft (music and the clock) |
| Capture of the game | filmable; `opengame-capture` for the in-game hooks |
| Ramps, camera, first and third person | craft |
| Characters, enemies, animation | craft; filmable (the animation audit) |
| Effects and light, transitions, grade | craft |
| Title | title (plan, make, review) |
| Voice, sound and mix | craft; finishing (the mix) |
| Ending, button, end card | craft |
| Edit, render, QA, delivery | finishing |
| Raw gameplay montage, share card, social cuts | archetypes |
| Unusual games | edge cases |
| Team, machine, sessions, talking to the owner | ops; briefs |
| Review | review; gates; briefs (critic) |
| Measuring anything | measure |

Every chapter above is carried by all three trailer skills except the reference set, which only `opengame-trailer-plan`
carries (the table of measured trailers and edits).

## 6. Working rules

- **All three skills, every trailer, in order:** plan, then make, then review-and-improve, the last repeated each
  round. Keep a log with one UTC line per skill invocation (`film/SKILLS.log`) plus the plan, the storyboard, the gate
  results and a review file per round. When a batch of quick trailers was made with a trimmed process that skipped
  the skills, the owner asked "are u sure we did the skills?" and the answer was no.
- **The loop is done when it reaches the bar, not when it stops.** Review-and-improve runs until two fresh blind
  critics both score 8.5/10 or better, or a round cap you agreed with the owner. A rescope that stops it is recorded
  as a stop, not a finish. One exception: a throwaway engine-test trailer the owner explicitly scopes as one shot (the
  OG test trailers were 30 minutes each, no revisions) runs the three skills once inside that budget.
- Settle the format, archetype, music and must-show list in the plan (one message of questions, each with a default).
- Research fans out in minutes; references and music are measured before the shot list.
- Briefs on disk before agents; state on disk always; one owner per file set; one director.
- Heavy jobs (browsers, captures, renders, encodes) go through your machine's job queue if it has one, with thread
  caps. Render and capture on internal disk; an archive drive is optional and may disappear.
- Never play audio aloud; never print secrets. Paid generation (music, voice, video, image, 3D) runs only on the
  person's own account, with their explicit go-ahead on the spend, through a capped ledger. OG Clash's voice and
  effects came to $2.79 of a $200 cap the owner approved in writing.
- Review cuts first; render the master only after the owner says a cut is good.
- Tear everything down at delivery (watchers, schedules, background jobs) and feed what you learned back into the plan
  templates and gates you keep for the next film.
