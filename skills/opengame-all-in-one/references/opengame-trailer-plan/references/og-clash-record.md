# The OG Clash trailer: what happened, and the gap to 11

The worked example behind the trailer skills: a 62 s, 4K60, 16:9 cinematic trailer for OG Clash (OpenGame's co-op
zombies game: plush heroes in a grim world, written in C, compiled to WebAssembly, rendered with WebGPU), cut to a
licensed electronic track at 105 BPM made of three spliced pieces. The bar: Black Ops zombies map trailers plus Kaiser's
montage editing. It shipped at −13.8 LUFS and −1.9 dBTP as a 700 MB HEVC master, and two days later the owner rated it
6/10.

| | |
|---|---|
| Wall time | 47 h 06 min (about 23 h active; about 24 h idle on usage-limit stops and restarts) |
| Sessions | 4 chained director sessions, plus a surviving copy of one that ran beside its resumed self |
| Agents | about 80 subagents, teams of 7-10 at a time |
| Owner notes | about 100 messages |
| Renders | 63 render events: 36 cuts with slates, 3 rhythm re-slots, 14 full 1080p cuts, 4K passes |
| Takes | 572 capture take lines (23 failed); 401 kept in the footage log; 43 slots |
| Critics | 2 blind rounds (3/10 on the first 30 s, 4.5/10 on a full cut); no blind A/B |
| Spend | $2.79 of a $200 cap on generated voice and effects (213 calls) |
| Approval | the 14th full cut, 42 h 20 min after the brief |

## The cuts, and what the owner said at each

| Cut | What changed | What the owner said next |
|---|---|---|
| the first slate cut | slates, voice and effects over the track | a pipeline proof |
| 15 cuts with slates | a watcher re-cut as selects landed | on the first 30 s: the announcer line "cheesy and terrible", the enemy rise "terrible", the electricity "really cheap" |
| the first critic copy | the first 30 s | critic 3/10: "a capture reel cut to a click track ... nothing actually happens on the beat" |
| round 2 rhythm cut | ramps made visible, motion across cuts, the 13-shot metronome broken | "this scene randomly comes in", "boring like the character isnt moving at all", no enemy rises |
| reshoots on a new effects build | | (the first session hit its usage limit) |
| ten cuts in the second session | slate frames from 1,135 down to 974 | "this depth of field blur looks terrible", "coming from same side", "work faster please" |
| the second critic copy | a full cut that still carried 974 frames of slates | critic 4.5/10, "not production grade"; the owner asked for flips in slow motion |
| the first cut with no slates | the first full picture | **never sent**: the session died while holding it for another loop |
| a re-slot from masters | all 44 events | "What r u waiting on? Can u work faster?" |
| a cut missing 10 selects (a watcher bug) | | notes on voice placement, a choppy bow, effects cut off, a cheap glow, a shot too quick to digest; **the scope freeze**; the title notes |
| the scope-freeze cut | | the title overlapping characters, revert one shot, a frozen flip, effects on a visor, the title not 3D, crackle throughout, match the world |
| an interim cut | one shot reverted, a smooth flip | a studio mark and compression |
| a broken cut | two director processes collided: 3,319 of 3,720 frames | renamed BROKEN |
| **the approved cut** | the same cut, run alone | "Looks good cut the final 4k version master pls" |
| the 4K master, first pass | chunked 4K with the title at 4K | "what are some other options for the scene we have at 7 seconds", then the feet note |
| **the delivered 4K master** | that shot waist-up with walkers only; one chunk re-rendered | delivered |
| the raw gameplay montage | 47 s, full HUD, 19 hard cuts, the game's own score | "why werent u hitting ... its weak spots?" (its second version was cancelled) |

## The shot that took 30 hours

The horde shot at 0:07 went: a rise from the ground ("terrible"), then a field of risers, then a walking horde with
heavy depth of field ("terrible"), then the horde from the other side, then a reverse angle from the south (15 drafts,
blocked by walls), then a side two-shot ("the zombies hit the player"), then a revert, then waist-up walkers. About 46
takes and six redesigns. An animation audit and an overhead geography map on day one would have saved most of it.

## Where the film went right

- Research fanned out in minutes: 36 trailers and 10 edits measured in 75 minutes; the music measured and its splice
  found before a single shot.
- Deterministic 4K60 stepped capture of a WebGPU WebAssembly game in about three hours; slow motion as real simulation.
- The film build fixed the game's electricity at the source; the game later shipped it as its default; 10 of 11 film
  notes shipped in the game within about 36 hours.
- First-to-third-person hand-offs inside one take, and the drop seam (19.1 px/f at 13° into 19.3 px/f at 15°).
- The 3D title, eventually: placed in the world, extruded, matched to the plate, lightning on the beats.
- Resilience: every agent's state on disk; teams restarted from resume briefs in minutes.

## Where the time went

About 24 hours idle (usage limits, restarts, nobody there at the reset); GPU contention (10 parallel 4K jobs at about
1 fps, 5.6 hours of slot waits); the 30-hour shot; notes a better plan would have pre-empted; 2.5 hours of 4K master
after approval plus 1.3 hours for a swap; finished cuts held for internal loops while the owner waited.

## The gap to 11: a blind critic on the shipped film

Commissioned when the owner rated the film 6/10 and asked for a method that produces an 11/10. A blind critic (no plan,
notes, code or briefs) measured the 4K master against the reference measurements: **5.5/10 against the Black Ops 6 and 7
trailers, 4/10 against a Kaiser edit.** It estimated that fixing the first four gaps alone would make it an 8.

Filtered through the rules before use: the critic's call to hide the first-person hit feedback and the studio mark went
against the owner's explicit choices (kept, with a question about hiding the mark on the title); its "optical-flow
retime" broke the no-interpolation rule (the same effect comes from the stepped simulation: the fast part at 1x, the
slow part at 1/240 within one take); a camera kick on impacts is legitimate as part of the camera path, never a post
shake filter. **Its most important finding for the craft:** the film did contain real quarter-speed spans in six shots,
and flow analysis still found zero ramps, because the camera kept moving through them at one speed. A ramp has to be
legible.

**Measured against the references:**

| Measure | The shipped cut | The references |
|---|---|---|
| cuts per second by act | open 0.38, features 1.54, boss 1.23, coda 0.29 | rising across the film, peaking late |
| cuts per 10 s window | 4, 12, 20, 15, 7, 3, 0 (peak at 20-30 s, then slowing through the climax) | peak at 50-60 s |
| cuts within 50 ms of an audio onset | 49 % against 48 % by chance | Kaiser 51 % against 23 % |
| beat-phase motion swing | 1.37x, peaking mid-beat | Kaiser 1.6-3.3x, on the beat |
| flow around cuts | flat (0.43-0.46 of the local 90th percentile) | Kaiser 0.26, 0.63, 0.78, 0.54 (a whip across the cut) |
| constant-velocity moves | 24 of 46 measurable shots | eased crash-zooms and push-ins |
| speed ramps found | 0 | Kaiser: on every kill |
| flashes | 3.9 per minute | Kaiser about 30 |
| HUD | hit markers and points pops in at least 5 first-person shots | none in 16 labelled trailers |
| voice | 17 lines, about 80 words | 5-8 lines, 42-75 words per 60 s |
| loudness | −13.8 LUFS, range 9.2 LU; **2.3 LU across 32 s of action** | 2-4 silences followed by slams |
| music holes | 0 | 1-3 per trailer |
| the loudest 50 ms | a weapon upgrade at 35 % of runtime | the boss, an explosion or the title |
| title | drifts into frame at 91.8 %; no hit, no type, no call to action | 84.5-89.6 %, resolved in 4-17 frames, then an end card |

**The ranked gaps (about 5 points across twelve):**

1. **The mix is a wall** (−1.0): no holes, no slams, the loudest moment in the wrong place, cuts landing on onsets at
   chance. Fix: three holes (before a feature reveal, before the boss's first real reveal, total silence on the boss's
   impact frame), the boss impact as the loudest point, a layered hit on the title, a button sound, a whoosh or impact on
   most cuts.
2. **Story arc** (−0.8): the busiest cutting was the feature catalogue, not the boss fight; **the cut left the boss's
   fall before the body hit the ground**; the boss was the first frame of the film, so its later "reveal" was a repeat.
   Fix: four acts (a cold open with the boss hidden, features, a turn as the boss wakes in silhouette, the fight at the
   fastest cutting), the kill landed on its impact frame, then the breath.
3. **No hook in the first 3 s** (−0.5): four shots of 2.3-2.6 s on an idle boss, no event, no line until 4.6 s. Fix:
   an event on frame one, 4-6 shots in 4 s, or the strongest "what is this" image first.
4. **Title, end card and button** (−0.5): the title drifted in silently with no end card, no call to action and no
   stinger. Fix: earn it from the world on a downbeat with a layered hit, then an end card, then a 1.5-2 s stinger.
5. **No velocity editing** (−0.5 against the trailers, −3 against Kaiser): no ramps, no whips, no designed transitions.
   Fix: the payoff speed cycle on every hero hit, one designed slow-motion beat, 6-10 caused transitions (a scope iris, a
   foreground wipe, a match cut, black slugs on eighths).
6. **Cheap or random tells** (−0.5): HUD pops, a sphere for a head gib, a flat red fog over 60 % of a frame, ghostly
   electrocuted bodies, a floating plank barricade, an illegible six-frame smear, a low-poly prop in the hook frame.
7. **Robotic camera** (−0.4): half the moves at constant velocity, no impact kicks, one lens family. Fix: ease every
   move, motivate it, add long lenses, macro inserts and a top-down.
8. **Voice overload and mis-sync** (−0.3): lines landing before or after their picture, one unintelligible, none naming
   the game or a character. Fix: 6-8 lines on their pictures, one with a hole under it, a spoken title.
9. **No personality beat** (−0.3): the plush heroes never played on the clash with the grim world. Fix: name cards, one
   reaction shot with a line on that face, a sight gag at the campfire.
10. **Features shown, not landed** (−0.3): fix each as a 3-4 shot micro-sequence on 4 beats with its own accent colour.
11. **A flat colour script inside acts** (−0.2): one real colour turn (night to dawn) and nothing before it. Fix: a
    colour world per act and 1-2 accent flashes.
12. **No breath in the middle** (−0.2): add one held shot of 1.5-2.5 s in a music hole at about 60 % of runtime.

**What the critic said would make it 11/10,** specific to this game: the silence drop on the boss's kill; a match-cut
chain through circles ending in the logo's "O"; a tone-clash button (a plush hero toasting a marshmallow over the dead
boss); a one-take first-to-third-person move; an in-world round counter ticking up on consecutive beats; a spoken title.
These became the "beyond 10/10" list in the core chapter, and its measurable gates became the gates chapter.
