---
name: opengame-quality-bar
description: The bar a browser game is judged against on OpenGame, and how to judge your own game against it without fooling yourself. Covers the sixteen cheap tells, blunt scores against the concept and a named reference game, sweeping a whole class from one report, the ninety-second stranger test and a fresh-context reviewer. Use when the person asks is my game good enough, make it feel AAA, polish it, review my game, what is missing, after a first playable, or before submitting to a jam.
metadata:
  version: "1.0.1"
---

# The quality bar

Frontier models make scenes that look impressive in a still. They fail when the frame
stops and someone looks closely, or starts playing: a hero drawn as a capsule, a menu
that is a button on black, silence, a wall you walk through. A stranger notices in
seconds. This skill is the check for that, and the other `opengame-` craft skills are
how to fix what it finds.

## How the rules are written

Every rule carries five tags, because a number that worked in one of our games is a
reference, not a law:

- **Invariant:** what must stay true in any game it applies to.
- **Technique:** one way to get there.
- **Reference configuration:** where specific values worked, and which game they came
  from. DK is Der Koloss, MC Modern Claudefare, AW World at War and Astral War, SR
  Skybreak and Smash Royale, ST the Studio that builds games on OpenGame, OC OG Clash,
  a first-person wave shooter with a boss, built for WebGPU.
- **Applies when:** the genres, cameras and scales it fits.
- **Verify:** how to show it holds, by doing something rather than by reading code.

## Rules

### No cheap tells in what a stranger sees first
- **Invariant:** None of the cheap tells is visible on the route a new player takes: the title, the menu, the first minute of play, and the loading screen before them.
- **Technique:** Walk the list in [references/cheap-tells.md](references/cheap-tells.md) against captures from the real route, and fix them in its order: core loop first, then every generated asset in the game, then the front end, then a playtest.
- **Reference configuration:** ST holds a new game's first version until a review passes it, and that review names each tell it sees. DK, MC, AW and SR clear the first twelve; they are where the list came from. OC added the last four: one lazy-load change put low-poly guns in 6 places, a wall gun charged points while its model was missing, and real iPhones crash-looped during load after every emulated phone check had passed.
- **Applies when:** Every game, every genre. A flat or minimal style changes what counts as a tell (flat light is then the style, not a defect), as long as the creator chose it.
- **Verify:** A reviewer with fresh context, given the captures and the list, marks each tell present or absent and cites the capture.

### The bar is a frame from a named game
- **Invariant:** Before work starts on a screen, the target for it is a specific frame from a specific shipped game in the genre, named in writing beside the concept art. The concept is the floor and the named frame is the bar.
- **Technique:** For each screen (combat, HUD, menus, boss, results) pick the genre leader and save one frame from it at the same camera and action as the concept. Put both on every comparison sheet. When the owner raises the bar mid-project, write the new reference down the same day and rescore against it.
- **Reference configuration:** OC used BO3 and BO6 for combat and the HUD, Fortnite for building and the third-person camera, Hades and Astro Bot for menus. The owner moved the bar from concept parity to "game of the year" on day 3; the critic then kept two scores, and from R67 to R77 the concept score went 4.4 to 5.3 while the reference-game score went 2.6 to 3.5. OC's HUD clusters took 25% of screen width; sized to the reference frame they take 13-15%.
- **Applies when:** Every game whose owner names a quality bar ("AAA", "like game X"). A game in its own invented style uses its best concept frame as both floor and bar.
- **Verify:** Every comparison sheet shows 3 panels per screen (concept, named reference frame, build) with the reference game's name on it.

### Score by eye on side-by-side sheets, bluntly
- **Invariant:** Each screen gets a 0 to 10 score by eye against its concept and its reference frame, from fixed hero frames on a side-by-side sheet. A pixel or colour metric can support a score and never closes an item on its own.
- **Technique:** Shoot the same hero frames every round. Have a critic who did not build the round mark every element in the concept present, wrong or missing, with its place in the frame. Cap the score at 5 until every element is present, and name the 3 biggest misses per frame. Ask the owner to score one sheet early and compare: a critic far above the owner is too soft and gets rewritten.
- **Reference configuration:** OC's CIELAB metric improved from 16.56 to 14.68 while the frames were about 2/10, and it scored a black loading page 29.1; "parity 7.3" labels were later called meaningless. Once frames were scored by eye against one concept each, the critic rose from 3.5 to 6.4 over about 25 rounds. The owner rated comparable builds 1/10, 2/10 and 5/10, so OC treats a critic-owner gap over 2 points as a soft critic.
- **Applies when:** Every game with concept art or a reference, from the first build the owner sees.
- **Verify:** Feed the scorer a death frame and a loading frame: both score near 0. The critic's score on one sheet is within the agreed gap of the owner's.

### One report means a sweep of the whole class
- **Invariant:** When the owner reports a defect on one instance, every instance of the same class meets the same bar before the fix is reported.
- **Technique:** Name the class (every gun, every sight, every pickup path, every perk label, every character), list its members, fix at the shared source where there is one, and capture every member on one sheet. Report the class, its count and the members that failed, not the one example.
- **Reference configuration:** OC fixed one optic on its own; a sweep of all 61 weapons, done only after the owner pushed, found 3 more defective guns. One electricity complaint led to 13 more draw sites. A launch audit found 57 of 61 guns had never been captured by QA. OC's gun sheet is 61 guns by hip, aim and third person by base, upgrade and camo, 549 views, plus 152 acquisition cases. The owner, after finding an old perk name the rename missed: "how am i finding shit like this and u arent?"
- **Applies when:** Every defect report on a member of a set. The bigger the set, the more a single fix misleads.
- **Verify:** The fix report links a sheet with every member of the class, each marked pass or fail.

### Add what the concept has; remove what it lacks
- **Invariant:** Each round adds something the concept or reference frame has and the build lacks (a model, a light, a prop layer, an effect), or removes something neither has. Retuning one layer (sky, grade, fog) while the models, surfaces, lights and density still miss is not progress.
- **Technique:** Name one person who owns the frame as a picture and one who owns the renderer, on day one. Before tuning, list what the concept shows that the build does not, and check the renderer's limits (light count, model count) against what the scene needs. Try removing a cheap element before adding a new one.
- **Reference configuration:** OC spent hours grading before the owner called the build "made with a crayon"; the frame had no owner. The render audit that finally ran found a 32-light cap against 218 fire sites, and the content side of the fix is in `opengame-assets`. A flat cyan visor strip took 3 h 40 min and 3 private builds to remove, after which the owner called that visor perfect.
- **Applies when:** Every game being pushed toward a concept or reference, most of all in 3D.
- **Verify:** Each round's notes name what was added or removed and point at it on the sheet.

### A stranger wants a second minute
- **Invariant:** Someone who has never seen the game, starting from the real menu with no explanation, understands what to do, does it, and wants to keep going.
- **Technique:** The ninety-second stranger test: open the published or preview build cold, go through the real menu (never a developer shortcut past it), play for ninety seconds, and write down every moment of confusion, waiting or boredom.
- **Reference configuration:** The bar our originals are held to: a person clicks one game, plays it for ninety seconds and forms an opinion about the studio. A game that boots to black has already answered them.
- **Applies when:** Every game.
- **Verify:** Record the ninety seconds as video or a frame sequence with input. A pass names the first action taken, when it happened, and the first consequence the player saw.

### The builder never grades its own work
- **Invariant:** The verdict on a piece of work comes from someone who did not build it and who sees the artifact, not the builder's explanation of it.
- **Technique:** Give a separate agent with fresh context the bar, the captures and the running build, never your summary. It marks every area met, gap or unverified, and names the single largest gap. Fix that gap, then ask again. The prompt is in [references/review-prompt.md](references/review-prompt.md).
- **Reference configuration:** ST runs an independent reviewer on every first version. In our own repository, a second review of one day's fixes found the first review's fixes carried the same defect classes they were fixing. OC's first independent review after integration found 30 ranked defects that every self-check had passed, and later an adversarial review of each delivery found a real bug in every one.
- **Applies when:** Every game, at every checkpoint the person will see.
- **Verify:** The review names a single largest gap, cites a capture for each verdict, and marks anything it could not observe as unverified rather than met.

### Everything made for the game is in the game
- **Invariant:** Every model, rig, sound, clip and image generated for this game is loaded and seen or heard on the real route, and nothing a stand-in occupies has a finished asset waiting unused. An asset counts once someone has seen it in the running game.
- **Technique:** Keep a list of every generated asset with the call site that uses it. Grep for each file name in the game's source; play to where it appears.
- **Reference configuration:** ST fails a first version on any generated work left unused, and lists those first in every playtest report. Our originals once shipped thirty models into eight games where only two games loaded a model at all. OC paid for mocap attack clips that sat in the zombie files unused, generated props were flagged because "nobody has looked at them in-engine", and the title scene's cigar clip did not play until R102, after the owner asked "where is the cigar smoking?" 3 times.
- **Applies when:** Every game that generated assets.
- **Verify:** For each asset, a source line that loads it and a capture or recording where it appears in play.

### Judge the frame people play
- **Invariant:** Quality is judged from the player's camera, at play distance, while moving, not from an editor view or a hero still.
- **Technique:** Capture from the real camera during real input: a still one second after Play, a pan, a sprint, a hit. Compare against the concept at the same camera and action.
- **Reference configuration:** ST compares player-camera captures against each selected concept view; a canvas-only capture cannot prove a HUD exists, so its captures include the DOM. OC's owner moved from judging stills to playing on day 2, and his first play-test list that evening had 50 items.
- **Applies when:** Every game with a camera.
- **Verify:** The captures are timestamped, include the HUD and are taken through the real menu path.

### Approved quality is never traded without asking
- **Invariant:** Art, effects or fidelity the owner has approved are not cut, lowered or swapped for a budget, a device or a deadline unless the owner agrees to that specific trade.
- **Technique:** When a budget is missed, optimise residency, streaming and shader cost first. If a cut is still needed, show the owner the before and after and the measured saving, and wait for a yes. Never let a device tier or fallback lower quality without saying so on screen.
- **Reference configuration:** OC agents cut camos to save memory and the owner reversed it ("do NOT cut down the sick camos"). Phone builds shipped with fewer enemies, smaller textures and half the sky without asking; all of it was reverted at R179. The owner overrode a blanket "bytes only go down" rule when the tradeoff was shown.
- **Applies when:** Every game with an owner or art director, and every budget or device fallback.
- **Verify:** Each quality cut in the change log links the owner's approval.

### Report what was observed
- **Invariant:** Every claim about the game is marked observed pass, observed failure, unverified or not applicable, and a source read is never reported as an observation.
- **Technique:** A checklist of at most six rows per checkpoint: check, route, action and expected result, observed result, evidence, next fix. Carry unresolved rows forward.
- **Reference configuration:** ST's checkpoint table, which keeps "unverified" as a first-class status so an untested claim cannot read as a pass. OC's ask register marked each ask fixed, partial, not fixed or could not check, with frame proof, after an audit found 0 of 67 inherited asks closed with on-screen proof.
- **Applies when:** Every report to the person, every submission note.
- **Verify:** Every row marked pass links a capture, clip time or test output.

## The other craft skills

Look: `opengame-look`. Light: `opengame-lighting`. Collision and movement:
`opengame-world-physics`. Geometry defects: `opengame-scene-audit`. Feel:
`opengame-game-feel`. Characters: `opengame-characters`. Sound: `opengame-audio`.
Menus and HUD: `opengame-front-end`. Frame time: `opengame-performance`. Generated
assets: `opengame-assets`. Systems: `opengame-depth`.
Proving it works: `opengame-verification`. Everyone can play: `opengame-accessibility`.
First-person weapons and viewmodels: `opengame-weapons`. Enemy AI, navigation, hordes,
bosses and deaths: `opengame-enemies`. Boot, streaming, caching and honest progress:
`opengame-loading`. Touch, phone memory and real Safari: `opengame-mobile`. Crash-free
play, budgets for every pool and error reporting: `opengame-stability`. Filming and
screenshots with a fixed clock, a clean feed and a free camera: `opengame-capture`.
Running the build loop with agents over many rounds: `opengame-production`.
