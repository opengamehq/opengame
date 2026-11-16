> Carried from `opengame-quality-bar` 1.1.0. Read it when: The bar a browser game is judged against on OpenGame, and how to judge your own game against it without fooling yourself. Covers nineteen cheap tells, the reference written as pass and fail statements, blunt scores, model judges that are anchored, paired and bound by the owner's decisions, class sweeps with an instrument per class, frozen approvals and a fresh reviewer. Use when the person asks is my game good enough, make it feel AAA, polish it, review my game, set up judges, or before a jam.


# The quality bar

Frontier models make scenes that look impressive in a still. They fail when the frame
stops and someone looks closely, or starts playing: a hero drawn as a capsule, a menu
that is a button on black, silence, a wall you walk through. A stranger notices in
seconds. This skill is the check for that, and the other `opengame-` craft skills are
how to fix what it finds.

This skill exists to close one gap. On OS the owner found about 93% of new defects and
the team's own checks about 7%, and on LC and OH the owner's hands and ears found what no
judge, bench or test did. Every rule below is a way of seeing the game the way the owner
sees it, before the owner has to.

## How the rules are written

Every rule carries five tags, because a number that worked in one of our games is a
reference, not a law:

- **Invariant:** what must stay true in any game it applies to.
- **Technique:** one way to get there.
- **Reference configuration:** where specific values worked, and which game they came
  from. DK is Der Koloss, MC Modern Claudefare, AW World at War and Astral War, SR
  Skybreak and Smash Royale, ST the Studio that builds games on OpenGame, OC OG Clash,
  a first-person wave shooter with a boss, built for WebGPU. OS is OG Snipers, a
  first-person snipers-only multiplayer shooter on a wasm engine, with bots standing in
  for players, drawn with WebGPU. LC is Last Contact, a first-person body-camera survival
  horror wave shooter in three.js WebGPU, later with four-player lobbies. OH is OG Hero, a
  painterly five-lane rhythm game in three.js WebGL2.
- **Applies when:** the genres, cameras and scales it fits.
- **Verify:** how to show it holds, by doing something rather than by reading code.

## Rules

### No cheap tells in what a stranger sees first
- **Invariant:** None of the cheap tells is visible on the route a new player takes: the title, the menu, the first minute of play, and the loading screen before them.
- **Technique:** Walk the list in [references/cheap-tells.md](references/cheap-tells.md) against captures from the real route, and fix them in its order: core loop first, then every generated asset in the game, then the front end, then a playtest.
- **Reference configuration:** ST holds a new game's first version until a review passes it, and that review names each tell it sees. DK, MC, AW and SR clear the first twelve; they are where the list came from. OC added the next four: one lazy-load change put low-poly guns in 6 places, a wall gun charged points while its model was missing, and real iPhones crash-looped during load after every emulated phone check had passed. OS and LC added the last three: OS's owner raised flicker, invisible walls and floating plants on five or more separate days each, and LC's owner raised arms and holds about 19 times.
- **Applies when:** Every game, every genre. A flat or minimal style changes what counts as a tell (flat light is then the style, not a defect), as long as the creator chose it.
- **Verify:** A reviewer with fresh context, given the captures and the list, marks each tell present or absent and cites the capture.

### The bar is a frame from a named game
- **Invariant:** Before work starts on a screen, the target for it is a specific frame from a specific shipped game in the genre, or from the owner's own concept film, named in writing beside the concept art. The concept is the floor and the named frame is the bar.
- **Technique:** For each screen (combat, HUD, menus, boss, results) pick the genre leader and save one frame from it at the same camera and action as the concept. Put both on every comparison sheet. When the owner raises the bar mid-project, write the new reference down the same day and rescore against it.
- **Reference configuration:** OC used BO3 and BO6 for combat and the HUD, Fortnite for building and the third-person camera, Hades and Astro Bot for menus. The owner moved the bar from concept parity to "game of the year" on day 3; the critic then kept two scores, and from R67 to R77 the concept score went 4.4 to 5.3 while the reference-game score went 2.6 to 3.5. OC's HUD clusters took 25% of screen width; sized to the reference frame they take 13-15%. LC treated the owner's concept film as the floor ("the level of quality we need and ideally we even go beyond"); OH's judges scored the concept video as 10 on every criterion, and the owner stopped OH at a judge mean of 8.6.
- **Applies when:** Every game whose owner names a quality bar ("AAA", "like game X") or supplies a concept film. A game in its own invented style uses its best concept frame as both floor and bar.
- **Verify:** Every comparison sheet shows 3 panels per screen (concept, named reference frame, build) with the reference's name on it.

### The reference becomes written pass and fail statements
- **Invariant:** Before a visual system is built, the owner's reference (a film, a concept video, a mood board, a named game) is written down as statements a stranger can mark pass or fail on a capture, measured where it can be, and every kind of visible thing in the game is graded against them.
- **Technique:** Cut the reference into contact sheets at a fixed interval plus a handful of hand-picked stills, and for each state you will build (rest, aim, a hit, night with the light off and on) find the reference frames of that same state before ruling on it. Write the look as statements about lens, exposure behaviour, light sources, palette, ground, hands and HUD, and measure what you can: luminance boxes at fixed places, the colour of the dark, the held item's share of the frame width. Name the layers the reference is built from (strokes, line, halftone, lens, motion) and build each as a technique, not a filter. Study a reference's method, never copy its code or art. Keep an inventory of every kind of visible thing graded placeholder, passable or final, and promote a row only with a capture beside the reference. Where the owner's newer words differ from the reference, the words win and the statement says so.
- **Reference configuration:** LC cut one frame every 5 s into 4 x 3 sheets plus 8 stills and wrote statements such as "rain only visible in the cone and the flash" and "with nothing lit the night is black, not dusk-blue"; a later pass cut 180 stills and measured the pistol at 4.7% of the frame width. That method made LC's darkness, pistol size and lens right, and missed the hands, reloads and fire, which fail in motion. A menu effect cost LC a day because the owner's "a bit trippy" was taken as a strength setting while nobody opened the reference. OH named its concept's layers and, once the owner sent a method video, rebuilt the world as "one long painting" (+0.54 judge mean in one pass), with every line written from scratch.
- **Applies when:** An owner supplies a film, trailer, concept video or mood board, or names a game to match.
- **Verify:** A reviewer who never read the code marks each statement pass or fail on a fresh capture, at the same state as the reference frame beside it.

### Score by eye on side-by-side sheets, bluntly
- **Invariant:** Each screen gets a 0 to 10 score by eye against its concept and its reference frame, from fixed hero frames on a side-by-side sheet, and the bar the team scores against agrees with what the owner accepts and rejects. A pixel or colour metric can support a score and never closes an item on its own.
- **Technique:** Shoot the same hero frames every round. Have a critic who did not build the round mark every element in the concept present, wrong or missing, with its place in the frame. Cap the score at 5 until every element is present, and name the 3 biggest misses per frame. Ask the owner to score one sheet early and compare: a critic far above the owner is too soft and gets rewritten. Record the owner's acceptances as a state above the team's marks; when the owner passes what the bar fails, or fails what it passes, move the bar. Judge a moving thing as a whole act at speed before any still or crop.
- **Reference configuration:** OC's CIELAB metric improved from 16.56 to 14.68 while the frames were about 2/10, and it scored a black loading page 29.1; "parity 7.3" labels were later called meaningless. Once frames were scored by eye against one concept each, OC's critic rose from 3.5 to 6.4 over about 25 rounds; the owner rated comparable builds 1/10, 2/10 and 5/10, so OC treats a critic-owner gap over 2 points as a soft critic. OS's judges ran 1 to 2.5 points above the owner: frames they scored 2-3 got 1/10, and a map the owner called "probs a 5/10" got 7.4-7.8. LC's owner accepted all eight pistol reloads ("the pistol is pretty good reload already lets just do all the other guns") while LC's tester had marked one 6/7/5/7/4/5/5 against a pass of 9 on every point, and that ledger then stood at 0 of 73 for 27 hours.
- **Applies when:** Every game with concept art or a reference, from the first build the owner sees.
- **Verify:** Feed the scorer a death frame and a loading frame: both score near 0. Show the owner three items the bar passes and three it fails: the owner's calls match the bar's.

### Model judges are noisy instruments: anchor them, pair them, and give them only what they can perceive
- **Invariant:** A judged score change counts only when the same judges saw old and new side by side, blind, in one sitting, against fixed anchors, with an unchanged control that held still. Judges score only what their evidence carries; sound, feel, input timing and motion at speed go to a person.
- **Technique:** One fixed rubric with the reference at the top and anchor frames from your own game at low, middle and high scores, the owner's own ratings binding. Three independent read-only judges, no two from one model family where you can, the median taken, a fourth added when they spread widely. Randomise old and new and keep the key outside the packet. One unchanged control per round, and a round whose control drifts is flagged. Count fixed defects by blind same-camera crop rechecks, never by a fresh sweep finding fewer. Tell judges to open the pictures, treat captions and commit messages as claims, return located defects with what would close each, and list what they could not see; the next packet carries that list. Act first on what two or more judges share, and check a lone judge's severe finding by eye. The setup is in [references/judges.md](references/judges.md).
- **Reference configuration:** OS judges drifted 0.5-3 points on identical frames (one map read 6.3, 8.1 and 5.9 with nothing changed) and about 1 item status in 5 flipped untouched; unpaired readings had the wrong sign on three maps where paired gave +1.4, +0.8 and +0.7; anchors cut spread from about 2.0 to 0.9 over 93 panels; blind rechecks reproduced 79 of 80 fixes while open re-sweeps swung from 26 to 1. Two OS judges from one family correlated at r = 0.81, so a median of three was two votes. OH's judges scored charts from text grids at 5.5-6.2 while the owner said 2-3/10, and only the owner found chart quality, the blank board and everything about sound. LC's single blind panel gave means of 4.65, 4.15 and 3.81 over 26 dimensions ("No frame I opened reaches the film") and sat about a point below LC's own playtest scores.
- **Applies when:** Any review or hill-climb that uses model judges.
- **Verify:** The control's drift and the paired spread print beside every score, and a panel on a frame the owner has rated lands within about 1 point of the owner.

### Owner decisions travel in every judge brief, and outrank judges
- **Invariant:** No judge, critic, concept prompt or relayed note reverses a recorded owner decision or removes something the owner asked for, and the team makes no exception to an owner rule without the owner's yes. A conflicting critique becomes a question to the owner or a restyle, and one named reference sets each judged property.
- **Technique:** Keep a dated decisions file and paste it, word for word, into every judge, generator and worker brief under "must not reverse even if critics ask", with the spec facts judges must not penalise. Ask judges to score how well a choice is carried out, not the choice. Diff each panel's top fixes against the file before work starts. Relay the owner's words exactly, typos included. When the owner's verdict and the panel disagree, the owner's verdict stands.
- **Reference configuration:** Every OS judge seat ranked removing the default camo first or second, against the owner's own ask that new players spawn with that vivid camo; the lead removed it on judge advice and the owner restated it the same evening. Launchers added on one OS judge's ask cut a map's parity from 8.0 to 6.4. OS's judges never received the decisions list; the repair was the rule "Owner requests beat judges" and a prompt note to score how a choice is carried out. OH's judges erased the avatars' identity for about 18 h and recommended camera shake until the owner's rules sat in the rubric as "not a choice you may advise away"; one judge's taste flattened a pressed key the owner had asked for, and nobody noticed; OH kept slow songs as the studio's own exception to the owner's tempo rule, which cost a round trip.
- **Applies when:** Every critic, judge or image-generation loop on a game with an owner.
- **Verify:** Seed one frame that follows a decision and one that reverts it: the panel prefers the first.

### One report becomes a numeric sweep, and every class the owner keeps finding gets an instrument
- **Invariant:** A defect the owner reports on one instance is rewritten as "no X may ever Y on any Z" with a measurable bar, and every member of the class meets it before the fix is reported. Any class the owner reports twice gets an automated check that sees it the way the owner does.
- **Technique:** Name the class (every gun, sight, camo, map, spawn, camera, weather, perk label, character), list every source that could produce the symptom, fix at the shared source where there is one, and sweep every member against a number on one sheet. Four or more instances of one category in one place mean one systemic cause. After each defect the owner finds that your checks missed, ask which instrument would have caught it; if none would, build one, prove it on a planted case, and let it fail on any rise above its last count. Report the class, its count and the members that failed, not the one example.
- **Reference configuration:** OS's owner found about 93% of new issues and the team's QA about 7%; flicker, floating plants, walk-through walls and stuck bots were each reported 3-7 times until each had a class audit, after which a glove-scale sweep held at "0.00 % (15,382 frames)". "Footsteps" took OS three rounds: rival steps, a turntable tick, then ambience beds generated with gravel in the prompt. OC fixed one optic on its own; a sweep of all 61 weapons, done only after the owner pushed, found 3 more defective guns, and a launch audit found 57 of 61 guns never captured by QA. OC's gun sheet is 61 guns by hip, aim and third person by base, upgrade and camo, 549 views, plus 152 acquisition cases. The owners: "how am i finding shit like this and u arent?" (OC); "whts the gap that all my feedback u cant find urself? fix that..." (OS).
- **Applies when:** Every defect report on a member of a set, and every class the owner raises more than once.
- **Verify:** The fix report links a sheet with every member marked pass or fail, the sweep reruns on the release build with the same zero, and each class the owner has found names its instrument.

### Add what the concept has; remove what it lacks
- **Invariant:** Each round adds something the concept or reference frame has and the build lacks (a model, a light, a prop layer, an effect), or removes something neither has. Retuning one layer (sky, grade, fog) while the models, surfaces, lights and density still miss is not progress.
- **Technique:** Name one person who owns the frame as a picture and one who owns the renderer, on day one. Before tuning, list what the concept shows that the build does not, and check the renderer's limits (light count, model count) against what the scene needs. Try removing a cheap element before adding a new one.
- **Reference configuration:** OC spent hours grading before the owner called the build "made with a crayon"; the frame had no owner. The render audit that finally ran found a 32-light cap against 218 fire sites, and the content side of the fix is in `opengame-assets`. A flat cyan visor strip took 3 h 40 min and 3 private builds to remove, after which the owner called that visor perfect.
- **Applies when:** Every game being pushed toward a concept or reference, most of all in 3D.
- **Verify:** Each round's notes name what was added or removed and point at it on the sheet.

### Change the method, not the polish, when progress stalls
- **Invariant:** When several passes in a row each move the score by little, or the owner rejects the same axis two or three times, the next pass changes the method (how the thing is made, what feeds it, who owns it) instead of polishing the current one again.
- **Technique:** Log each pass's score delta and the owner's verdict per axis. At a stall, find out how the reference itself was made (ask the owner, read a method walkthrough), rebuild one showcase on that method and score it beside the old one. Cut briefs to the top three items when the same reasons repeat, because broad passes touch many things lightly. Never let a loop work one sub-part for hours while the largest gap sits elsewhere.
- **Reference configuration:** OH's repaints gained +0.13, +0.20 and -0.07 in a row; rebuilt on the owner's method video, the world gained +0.54 in one pass. OH spent about 26.7 hours charting songs nobody on the team had written (nine owner complaints, ending at "2 or 3/10") before composing its own, and the first composed song drew "great chart" about 16 hours after the pivot. An 11-item OH pass fell where a 3-item pass rose. OS's overnight loop made about 60 builds on the fists while maps sat at 3-4/10: "Wait the whole night u worked on the fists only and thats where u got? It looks worse than when u stRted". OH treats about three passes under +0.3 as a stall.
- **Applies when:** Any long hill-climb against a concept, a reference or owner notes.
- **Verify:** Before each new round, a decision note shows the last three deltas and the owner's latest verdict, and names the method change when they show a stall.

### Once free concepts stall, targets are paint-overs of the build's own frames
- **Invariant:** A screen's visual target shares the build's camera, layout, HUD and state, so every difference between target and build can be acted on, and progress is scored on captures of the build, never on the target.
- **Technique:** Register a camera (eye, forward, field of view), capture the build there, and have an image model change only the rendering ("KEEP EXACTLY camera/layout/HUD; CHANGE ONLY THE RENDERING"), on the person's own image tool and with their yes on any cost. Pin each target by hash, reject paint-overs that invent geometry or content the camera cannot see, and have each list what it gained and what the build still misses. Move what the image model cannot draw into an engine spec. Plot the build's score and the target's score on separate lines: a paint-over score measures the generator.
- **Reference configuration:** OS's 293 free concepts stalled at a best of 8.0 against an 8.5 bar ("This is a ceiling, not slow progress"), while paint-overs of captured frames scored higher (7.3 against 6.95) and gave per-frame "still missing" lists. Failures: an invented titan, and a river "because the prompt asked for a river that this camera can't see"; writing "NO water anywhere in this frame" lifted same-scene agreement from 2/4 to 4/4. OS's paint-over medians sat at 7.5 every round while its build panel sat at 3-4. OS made 483 paint-overs at no cost on a subscription image tool.
- **Applies when:** Hill-climbing environment or screen visuals against generated targets, once free concepts stop improving.
- **Verify:** Build and paint-over scores are plotted per round on separate lines, and the next capture from each pinned camera shows the items its paint-over listed.

### A stranger wants a second minute
- **Invariant:** Someone who has never seen the game, starting from the real menu with no explanation, understands what to do, does it, and wants to keep going.
- **Technique:** The ninety-second stranger test: open the published or preview build cold, go through the real menu (never a developer shortcut past it), play for ninety seconds, and write down every moment of confusion, waiting or boredom.
- **Reference configuration:** The bar our originals are held to: a person clicks one game, plays it for ninety seconds and forms an opinion about the studio. A game that boots to black has already answered them.
- **Applies when:** Every game.
- **Verify:** Record the ninety seconds as video or a frame sequence with input. A pass names the first action taken, when it happened, and the first consequence the player saw.

### The builder never grades its own work
- **Invariant:** The verdict on a piece of work comes from someone who did not build it and who sees the artifact, not the builder's explanation of it.
- **Technique:** Give a separate agent with fresh context the bar, the captures and the running build, never your summary. It marks every area met, gap or unverified, and names the single largest gap. Fix that gap, then ask again. The prompt is in [references/review-prompt.md](references/review-prompt.md).
- **Reference configuration:** ST runs an independent reviewer on every first version. In our own repository, a second review of one day's fixes found the first review's fixes carried the same defect classes they were fixing. OC's first independent review after integration found 30 ranked defects that every self-check had passed, and later an adversarial review of each delivery found a real bug in every one. About 30 LC lead claims were overturned when the director opened or played them.
- **Applies when:** Every game, at every checkpoint the person will see.
- **Verify:** The review names a single largest gap, cites a capture for each verdict, and marks anything it could not observe as unverified rather than met.

### Everything made for the game is in the game
- **Invariant:** Every model, rig, sound, clip and image generated for this game is loaded and seen or heard on the real route, and nothing a stand-in occupies has a finished asset waiting unused. An asset counts once someone has seen or heard it in the running game.
- **Technique:** Keep a list of every generated asset with the call site that uses it. Grep for each file name in the game's source; play to where it appears.
- **Reference configuration:** ST fails a first version on any generated work left unused, and lists those first in every playtest report. Our originals once shipped thirty models into eight games where only two games loaded a model at all. OC paid for mocap attack clips that sat in the zombie files unused, generated props were flagged because "nobody has looked at them in-engine", and the title scene's cigar clip did not play until R102, after the owner asked "where is the cigar smoking?" 3 times. LC had reload sounds for every gun that nobody on the team had heard.
- **Applies when:** Every game that generated assets.
- **Verify:** For each asset, a source line that loads it and a capture or recording where it appears in play.

### Judge the frame people play, and make a default only when it is right
- **Invariant:** Quality is judged from the player's camera, at play distance and the player's settings and window, while moving, not from an editor view or a hero still. A change becomes the default only when it is right from that view, never because it beats the placeholder it replaces, and never while its maker's own report names a failure from that view.
- **Technique:** Capture from the real camera during real input: a still one second after Play, a pan, a sprint, a hit. Compare against the concept at the same camera and action, on full-size frames, never reduced ones. Block a default while the lead's own notes name a failure from the player's view.
- **Reference configuration:** ST compares player-camera captures against each selected concept view; a canvas-only capture cannot prove a HUD exists, so its captures include the DOM. OC's owner moved from judging stills to playing on day 2, and the first play-test list that evening had 50 items. LC's baked fire was made default as "still better than the old pale ball", judged on 896 x 430 captures and from the side, while its lead had written that from the hands it was "ONE UPRIGHT COLUMN"; two hours later the owner, from the hands at Medium: "literally looks so bad".
- **Applies when:** Every game with a camera, and every default change to something the player sees.
- **Verify:** The captures are timestamped, include the HUD and are taken through the real menu path, and each default's commit cites a full-size frame from the player's view at the player's settings.

### Approved quality is frozen: never traded, never made worse
- **Invariant:** Art, effects or fidelity the owner has approved or accepted are not cut, lowered or swapped for a budget, a device, a deadline or a judge's advice unless the owner agrees to that specific trade. The approved frame and commit are the target no later pass may make worse, and a regression is fixed by exact restore first.
- **Technique:** Keep an approved-looks record (frame, commit, the owner's words, date) and an accepted list. A change to an approved surface ships with a board of approved, current and proposed at one zoom and must beat both the approval and the reference. When a budget is missed, optimise residency, streaming and shader cost first; if a cut is still needed, show the before, the after and the measured saving, and wait for a yes. On "worse than round N", A/B a straight revert (asset, transforms and shader together) against the fix-forward before anything else. Never let a device tier or fallback lower quality without saying so on screen.
- **Reference configuration:** OC agents cut camos to save memory and the owner reversed it ("do NOT cut down the sick camos"); phone builds shipped fewer enemies, smaller textures and half the sky without asking, all reverted at R179, and the owner overrode a blanket "bytes only go down" rule once the tradeoff was shown. OS's approved scope was broken by a parity pass and then by a rebuild "from measurements" ("it used to be perfect this scope this is what we need to bring it back to"), and only restoring the approved commit fixed it; an arm regression was fixed forward until "the arms and hands looked MUCH better in l169". OS's "im fine with the fists/hands view as is no need to spned more time on that piece" ended hands work at a judge score of 3.7: an acceptance is a stop.
- **Applies when:** Any surface the owner has praised, accepted or used as a comparison, and every budget or device fallback.
- **Verify:** Each quality cut in the change log links the owner's approval, every change to an approved surface has its board, and no later owner note says "it used to be".

### Every picture sent to the owner is held to the ship bar
- **Invariant:** No image in a progress report shows a flaw its caption does not name, because the owner reviews every picture sent, whatever it was meant to show.
- **Technique:** Before posting a frame, list its visible defects at full size. Prefer frames from the current default build at the player's view over crops of working composites. Put the images themselves in the message, never file paths. A dark frame brightened to be read says so on the image.
- **Reference configuration:** LC's first two owner screenshots were crops of the director's own composites, posted to show materials and a playtest bug; the owner rejected the hold and the resolution in them instead. OS's owner: "when you send comparison sheets i need u to send the actual iamges here in the chat! i cant see anything". LC stamped every brightened tile with its gain, so no lifted picture was mistaken for the player's.
- **Applies when:** Every status update or report with images.
- **Verify:** Each posted image carries a defect list or "none seen at full size", and none is a path.

### Report what was observed
- **Invariant:** Every claim about the game is marked observed pass, observed failure, unverified or not applicable, and a source read is never reported as an observation.
- **Technique:** A checklist of at most six rows per checkpoint: check, route, action and expected result, observed result, evidence, next fix. Carry unresolved rows forward. Grade each claim by its evidence: seen in the build the owner plays, seen in someone else's capture and not opened by you, by count, by test only, or behind a flag and unseen. Read every reported commit hash back from the repository.
- **Reference configuration:** ST's checkpoint table keeps "unverified" as a first-class status so an untested claim cannot read as a pass. OC's ask register marked each ask fixed, partial, not fixed or could not check, with frame proof, after an audit found 0 of 67 inherited asks closed with on-screen proof. LC graded every claim this way after reporting work as "in" on the strength of commit messages ("I should have said 'written, unseen'"). OH found one fabricated commit hash in its own reports by reading the repository.
- **Applies when:** Every report to the person, every submission note.
- **Verify:** Every row marked pass links a capture, clip time or test output.

## The other craft skills

Look: `opengame-look`. Light: `opengame-lighting`. Collision and movement:
`opengame-world-physics`. Geometry defects: `opengame-scene-audit`. Levels, spawns and
lanes: `opengame-maps`. Feel: `opengame-game-feel`. Characters: `opengame-characters`.
Sound: `opengame-audio`. Menus and HUD: `opengame-front-end`. Frame time:
`opengame-performance`. Generated assets: `opengame-assets`. Systems: `opengame-depth`.
Proving it works: `opengame-verification`. Everyone can play: `opengame-accessibility`.
First-person weapons and viewmodels: `opengame-weapons`. Enemy AI, navigation, hordes,
bosses and deaths: `opengame-enemies`. Boot, streaming, caching and honest progress:
`opengame-loading`. Touch, phone memory and real Safari: `opengame-mobile`. Crash-free
play, budgets for every pool and error reporting: `opengame-stability`. Lobbies and
netcode: `opengame-multiplayer`. Rhythm games: `opengame-rhythm`. Filming and
screenshots with a fixed clock, a clean feed and a free camera: `opengame-capture`.
Running the build loop with agents over many rounds: `opengame-production`.
