> Carried from `opengame-depth` 1.1.0. Read it when: Give a browser game depth, not a single verb. Covers a natural win proved by seeded skill tiers and real runs, simulated players calibrated to people, pacing in the player's own unit, an economy tuned by prices, boss health from real damage, a first goal at spawn, a spawn controller, rounds that never stall, readable bosses, honest cheats, odds and systems that interact. Use when the person says the game is boring, too hard, too easy, rounds drag, I died rich, or it feels like a tech demo.


# Depth

A game is deep when its systems create decisions together: what you carry changes how
you fight, the ground changes your route, what you prepare changes the next encounter.
A decorative counter, a menu for an unfinished system or a bigger map is not depth. The
fastest way to look shallow is a minigame: one verb, no consequence, nothing to learn.

Balance is where agents fool themselves most easily, because a simulated player is cheap
and a person is not. In LC every pacing number chosen on simulated players was later
corrected by the owner's own hands, so the rules below calibrate the simulation to a
person first and count only unflagged real runs as evidence.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes. OC's run is
a wave shooter with rounds of zombies, three generators to defend and then a boss. LC's is
a survival shooter whose levels rise on a clock, with points spent on weapons, doors and
power. OH's songs are its levels.

## Rules

### Prove a natural win exists
- **Invariant:** Before any tuning for feel, unstaged runs show that a player can reach and finish every stage of the run with the gear the game gives them: first by seeded simulated players at several skill tiers, then by real-input runs with no flags or cheats.
- **Technique:** Write the target outcome for a strong, an average and a new player. Build a headless simulation from the game's real rules, director, weapons and map, with seeded novice, average and good players over many seeds, and log where each run ends and why. Compare enemy health, player damage and boss health against what a full loadout can deal. Change one value at a time. Then play several real-input runs with no flags, logging time, cause of death, ammunition and money held. Flagged or cheat runs never count as balance evidence.
- **Reference configuration:** OC's first audit lost 7 of 7 natural bot runs: round 1 zombies had round 10 health, and each boss lock-core had 35,000 HP, more than a full loadout could deal. OC's targets: the boss wakes by round 8 to 10 for a great player, 10 to 12 for a decent one and 12 to 15 for a beginner. LC's targets: a novice alive at 3 minutes in 80% of runs, an average player restoring power in 60%, a good one winning in 30% within 25 to 40 minutes. Its simulation (hit chance near, at 30 m and on the head of 0.55/0.20/0.10, 0.74/0.36/0.27 and 0.86/0.50/0.42 by tier; 1 to 5 s a run) reached 32, 21 and 14 of 32, yet real runs died dry at 1:24 to 5:54 holding 4,000 points, because the simulated player bought and reloaded rationally.
- **Applies when:** Every game with a win condition, runs, waves or a boss.
- **Verify:** Before and after tables per tier for every change, plus three real-input runs that reach each stage within its band; the report lists the round and cause of every loss.

### Never tune difficulty on players that do not move like people
- **Invariant:** No difficulty, pacing or economy number is chosen from simulated players until they move, aim and fire at human rates, and no pacing device softens the danger to suit a simulated player.
- **Technique:** Measure three biases against real-input runs: how fast the simulated player moves while aiming, how many aimed shots it lands a minute, and the enemy's damage clock as the browser runs it. Replay a recorded real run headless on its own seed, and require the simulation to match it within a fifth. Run a passive player who never moves: if they are never downed within a few minutes, something is hiding the danger. Count difficulty in the player's unit (blows to down), change the blow rather than a health scale, and ship numbers chosen on the simulation behind a take-back, naming the population they were tuned on.
- **Reference configuration:** LC's simulated players backed away at 2.3 m/s where a person aiming backs at 1.33 ("slower than one of the dead at a walk"), killed 25 to 30 a minute where a real hand managed 13, and saw blows spaced 2.2 s where the browser spaced them 2.62. Because scripted players kept dying, LC added a shared 5 s gap between blows and made zombies take turns; a scripted novice then stood at 45:00 in 11 of 12 runs, and the owner asked "the zombeis take so long ot kill u?", then "also it should be 3 hits (without perks) to die not just 2". Settled: 34 of 100 a blow, three to down, each enemy on its own clock of about 1.1 s. Every tide figure chosen on the simulation was later corrected by the owner's play.
- **Applies when:** Every game balanced with simulated players or bots.
- **Verify:** The record test (the simulation within 20% of a real run from minute four), and the passive player downed within three minutes.

### Pace in the player's own unit
- **Invariant:** Pacing targets are written in what the player experiences (enemies met a minute, the longest lull, notes a second, blows to down), and a new player meets the game's threat within seconds and keeps meeting it, surviving the opening because early threats are weak, not because they are absent.
- **Technique:** Measure enemies met a minute (first within reach and in view) and the longest lull in recorded runs. Make early enemies die fast rather than come rarely; bring them in ahead and out of sight, and recycle stragglers. Frighten first by number, flank, voice and dark, and bring faster enemies in only after the player knows the basics. In a rhythm or timing game, set each difficulty by density, spacing and the busiest second, calibrated to the genre's measured norms, and move a piece that plays under its tier down rather than padding it. Nothing should be boring, too easy or too slow.
- **Reference configuration:** LC: "im 2 mins into game and only saw 2 zombies?... way too slow paced game play" (owner), after the director "made the opening survivable by starving it of zombies"; then "im 5 mins in and no zombeis are runnin gyet?". Targets: first contact at 10 to 15 s, at least 8 met in minute one, 14 more in minute two and 20 more in minute three, no gap over 8 s; health 80 and 100 at levels 1 and 2 so the starting weapon kills with one head shot; no surge for 75 to 90 s; runners from minute 2 and a first sprinter alone at 3:30; stragglers 45 m behind for 4 s replaced, the longest quiet down from 27 to 6 s median. OH calibrated its charts to aggregates of a published genre's charts (no audio fetched, nothing copied): median 1.61, 2.44, 3.40 and 3.98 notes a second from Easy to Expert, busiest second 4, 5, 8 and 10. "no song should be boring too play or too easy or too slow" (owner); OH set a tempo floor of 118 bpm.
- **Applies when:** Every game with a difficulty curve, waves or a tempo.
- **Verify:** Count met-per-minute (or notes a second) and the longest lull in recorded real runs, not only in simulation.

### Tune the economy through prices
- **Invariant:** The economy is tuned through prices, the first purchase fits the first purse, a better item is never the poorer buy, and a run cannot die rich.
- **Technique:** Price the first things on the route for the starting money and leave the starting money alone, since it is spent at once. Price ammunition by the round so a stronger weapon is never the worse deal. Write the economy in minutes of earnings: what comes in a minute, and what one of everything on the objective's way costs. Keep one ordered line telling the player what their money now covers. Never put a paid way out at a dead end. Log money held at every death.
- **Reference configuration:** LC: "starting points are the wrong lever (they are spent at the rack at once)". A 400-point pistol beside a 500-point start was bought within 5 s in 15 of 16 runs and cut power restored from 12 to 5 of 16; a 200-point rifle halved novice survival; the first door went from 750 to 500 to 0. Rounds cost 2.25 each, never over 750 unupgraded. About 1,000 points come in a minute, and one of everything on the objective's way costs 14,850, "fifteen minutes of earnings". One 42-minute run died with 61,030 points unspent, and another walked 219 m back for rounds while holding 3,240.
- **Applies when:** Every game with a currency, a shop or upgrades.
- **Verify:** Per run, money held at death and the time to the first purchase: a novice run buys within its first minute, and no tier dies holding more than one purchase's worth.

### Boss health comes from the damage a player can deal
- **Invariant:** The boss's health and each vulnerable window are sized from the damage the expected loadout deals in that window, and one document holds the number.
- **Technique:** Compute damage per second for the loadout a player has at that stage, multiply by the length of each vulnerable window and the number of windows the fight should take, and set health from that. Keep the value in one spec file that code reads.
- **Reference configuration:** OC's spec said 400,000 HP while the code held 60,000, and the spec had 4 phases against the code's 3. The rebalance moved to the reference game's solo formula with the titan at 120,000.
- **Applies when:** Games with bosses, shields or damage gates.
- **Verify:** A bot with a middle loadout breaks one weak point inside one window, and a full fight lands inside the target length.

### The first goal is reachable at spawn
- **Invariant:** A new player can afford and see the first goal from where they start, and the objective panel, banners, voice and tips all state the same goal in the same words.
- **Technique:** Price the first purchase or gate at or below the starting money. Write each objective once, in one table, and drive the panel, banner, voice line and loading tip from it. Prompts name the action and the cost.
- **Reference configuration:** OC started the player with 500 points against a 750 gate, a design bug; the fix was a 500 gate and a "First: Quick Revive (500)" tip. OC once shipped three boss instructions at once, and its HUD still said "lock-cores 0/4" after the mechanic changed. Its prompt form: "Hold F to open the East Gate [750]". LC's pointer names the next place by walking distance ("YARD GATE 40 M"; `opengame-maps`).
- **Applies when:** Every game with an economy or an objective chain.
- **Verify:** A stranger reaches the first goal without help, and a search of the strings finds each objective worded once.

### A spawn controller owns wave size, the cap and placement
- **Invariant:** One controller sets how many enemies each wave has, how many may be alive at once and where they appear, and early waves are easy and close to the player without ever leaving the opening empty.
- **Technique:** A table of wave sizes and health per round or level, a hard cap on live enemies, spawns spread across several approaches near the player, and no spawns during breaks. Every other system asks the controller for spawns instead of creating enemies itself. Test that every standpoint has spawns on several sides (`opengame-maps`).
- **Reference configuration:** OC used the reference game's solo counts (6, 8, 13, 18, 24) and at most 24 alive (R110). Before the controller, early rounds flooded with spawns. LC's tide: a level every 100 s, a cap of 9 plus 0.6 a level, the first figure up at 2.5 s and one every 4 s after, the first surge at 75 s or the first generator, an ebb at two thirds of the rate, and at most 3 within 10 m of a hemmed-in player. Spawn accounting and the remaining-enemies counter are in `opengame-enemies`.
- **Applies when:** Wave, horde and arena games.
- **Verify:** Log spawns per second and live count across the first five rounds or levels: each wave matches the table and the live count stays at or under the cap.

### Rounds never stall
- **Invariant:** Every round ends a short time after the player kills what they can reach, and the last enemies are easy to find.
- **Technique:** Keep early breaks short, recover stragglers that stop making progress, respawn an enemy that has been out of sight and stuck for too long (only where no live or replay camera can show it; `opengame-enemies`), and point at the last few enemies with a marker that shows above or below. Run full games with real input to find the stalls.
- **Reference configuration:** OC's breaks are 5 s in rounds 1 to 3 and 10 to 12 s after; stragglers are recovered after 12 s; markers appear once fewer than 5 remain (the last 1 to 4 at the radar edge). One OC round took 313 s. The owner asked for faster early rounds about 9 times. Stuck-enemy recovery steps are in `opengame-enemies`.
- **Applies when:** Wave and round-based games, and any objective that waits for "kill all".
- **Verify:** Over 20 automated rounds, log time from the last reachable kill to the round end: none exceeds the straggler limit.

### Defence objectives are short and bounded
- **Invariant:** A defend-this objective has a fixed length, a limit on attackers and a readable health for the thing defended, each one has its own sound, effects and voice, and work the player puts into it is never lost.
- **Technique:** Set the duration, the number of attackers allowed at once, the spacing between their spawns and the damage each hit does to the objective. Show the objective's health while it is attacked. Give each objective its own music, effect and start, middle and end lines. Keep progress through a shot, a blow, a step away or a pause. Run timers that several players share (revives, bleed-outs, lifts) on the wall clock, not on each page's game time.
- **Reference configuration:** OC's sleeping titan wakes after three generators are defended (R89, which replaced three seals). The owner's game "crashed again while defending a generator", so each objective also needs its own soak test. LC's crank keeps its turns through a shot, a blow, a step off or a minute away; one-handed work ignores shots, and two-handed work pauses for 0.5 s. On game time, one of LC's 12 s lifts took 3 s on slow pages.
- **Applies when:** Escort, hold, capture and defend objectives.
- **Verify:** Play each objective with no damage dealt: it fails at the expected time. Play it well: it succeeds within its duration, and its health bar matches the logged hits.

### The player always knows how to hurt the boss
- **Invariant:** At every moment of a boss fight the player can tell the one current goal, where to shoot, and whether the shot did anything.
- **Technique:** One goal per phase, worded the same in the HUD, banner and voice. Weak points that are large enough on screen at any range, saturated and pulsing, in a colour that means "shoot here" everywhere in the game and does not also mean danger. Damage numbers on a hit and an "immune" cue on a blocked one. A visible break when a weak point falls. The boss's own animation and telegraphs are in `opengame-enemies`.
- **Reference configuration:** OC's owner: "its completely unclear how to take down the titan or where u hvae to aim for / shoot at", raised 4 or more times; "i couldnt tell fi ti does anything". OC's fixes: weak points at 28 to 32 px or more at any range (1.5 to 2% of frame width), pulsing; crack beats at 66% and 33% health; a 2.5 s stagger on a break; orange means immune, cyan or violet means shoot here. A test bot hit weak points for only 8 of 489 s. One redesign left the boss asleep forever in normal runs.
- **Applies when:** Any boss or multi-stage enemy.
- **Verify:** A stranger plays the fight with no briefing and says, at three random pauses, what the goal is and where to shoot. Capture the weak points at the nearest and farthest fighting range.

### Stage any moment of a run, and keep cheats honest
- **Invariant:** Developers, test agents and the owner can jump to any round, phase or objective with any loadout, every run that used a cheat is marked as one from its first frame, and no test switch reaches production.
- **Technique:** Dev switches for god mode, no enemies, extra money, any weapon, every gate open, each objective complete and a jump to any round or straight to the boss. Use them to reach and test late content; judge feel and difficulty only on unstaged runs. When cheats are a player feature, read them once at a new run, mark the run cheated and keep it off records, stamp the cheat state into every capture's name, and test the path with every cheat the owner keeps saved. Tool-only invulnerability is a script call, never a URL flag. Strip the dev switches from the production build or lock them behind a key the server checks.
- **Reference configuration:** OC's set: god mode, ghost town, +50,000 points and a jump to any round, after the owner told agents to "give urself god mode / infinite health". OC's production build stores the dev key only as a hash. Dev flags still leaked fake points into captures. LC's owner played with every cheat saved; six saved perk grants put the gun aside for 3.5 s at spawn, reported four times, while tests ran with two. "None of my 34 earlier spawns was begun by a real press."
- **Applies when:** Every game longer than a few minutes, and every game with a player-facing cheats menu.
- **Verify:** Reach the boss from a cold start in under a minute in a dev build; in the production build every dev switch does nothing, and a run with every cheat saved starts with the weapon in hand.

### Random rewards have tuned odds and a pity timer
- **Invariant:** Random rewards follow odds set against the genre reference, a long dry streak ends, and every path that can grant a rare item goes through the same odds.
- **Technique:** Write the odds per rarity, add a pity counter, show rarity with spectacle (colour, beam, sound), and list every code path that writes to an inventory slot so a rare item cannot arrive by another route. Audit each weapon's time to kill at several stages of the run.
- **Reference configuration:** OC's wonder weapon came at 1 in 56, then about 1 in 102, against 1 in 20 to 25 in the reference game; pity after 16 to 20 pulls. Wonder weapons are crate-only, which meant auditing 11 slot-write paths. Time to kill is audited at rounds 1, 10, 20 and 30.
- **Applies when:** Games with loot boxes, drops, crates or random rewards.
- **Verify:** Simulate 10,000 pulls and compare the rates with the table; trace each slot-write path to the odds function.

### Systems are defined before code
- **Invariant:** Each system in the game exists because it changes a decision the player makes, and that change is written down before the system is built.
- **Technique:** For each system, one line each: the decision it creates, what it interacts with, and how the player learns it. Cut any system with no answer. Build the interactions, not only the systems: a power-up changes what enemies perceive, not only how the player looks, and a strong tactic carries its own counter.
- **Reference configuration:** ST's craft defaults: different weapons change tactics, terrain changes routes, preparation changes the next encounter, and a decorative counter is not evidence of depth. OS's active camouflage had to change what bots see: with it on, bots fired 0 rounds over 133 hidden sightlines. OS's scope glint shows only after 250 ms scoped, within plus or minus 20 degrees of the victim and beyond 25 m, so camping carries its own counter.
- **Applies when:** Every game with more than one mechanic.
- **Verify:** Play two runs with different choices; the runs play differently in a way you can describe.

### The whole archetype, not a minigame
- **Invariant:** The game delivers the archetype it belongs to (its loop, progression, failure and reason to return), not only the first ten seconds of it.
- **Technique:** Name the genre's archetype and list what a player of it expects from a full session. Build the loop end to end (start, escalate, fail or win, retry with something learned) before widening any one part.
- **Reference configuration:** Our originals' rule after a laser-and-prism board with one verb was filed as the thing not to make again: every game is a deep game, with systems that interact, a run that teaches, and a reason to come back tomorrow.
- **Applies when:** Every game, at every scope. A small game can be deep; a big one can be a minigame.
- **Verify:** A person who did not build it plays three sessions and can say what they would do differently next time.

### One dense hero location first
- **Invariant:** One place in the game is finished to the bar before more places are added.
- **Technique:** Pick the location the first minute happens in and finish it: layout that creates routes and choices, a focal landmark, foreground, midground and distance, grounded props, the overhead layer, light and sound. Copy its standards outward, not its props. Its spec and parity list are in `opengame-maps`.
- **Reference configuration:** MC's Rust map: about 2,900 primitives, 423 decals in one draw, 109 contact-shadow quads and 1,500 dust motes in 44 by 44 m. SR's island: 2,609 props, 6,512 grass clumps and 913 flowers. OS spread its effort over 17 maps; new ones arrived scoring 1.4 to 1.8 out of 10, the owner rated them "1/10 on parity and 1/10 on aaa level visuals", and even the best was "probs a 5/10".
- **Applies when:** Every game with a world to move through.
- **Verify:** Captures of the hero location from the player's camera pass the cheap-tells review in `opengame-quality-bar`.

### Dressing is placed by rules
- **Invariant:** Set dressing looks authored: it sits where such things would be, never blocks paths or interactions, and comes out the same every session.
- **Technique:** Scatter from a seeded generator and reject candidates by surface, slope, footprint flatness, clearance from paths, stairs, doors and interactables, and a noise mask. Place props against real walls, not in the open; dress the overhead layer with pipes, ducts, beams and cables; rotate things a few degrees off square; keep litter low enough never to block movement or become a perch. A dressing pass never moves the gameplay layer (`opengame-world-physics`).
- **Reference configuration:** DK tries 8 positions per prop, each clear of walkways and against a wall, with per-room counts (a factory: 8 crates, 7 drums, 4 rubble piles, 3 machines). The ST bar's scatter rules keep half a path's width plus 1.2 m clear of paths and 5 m clear of stairs, reject footprints less flat than 0.45 m, and vary scale 0.7 to 1.5 with tint. Litter stays under 0.3 m. OS places groups by job, each under 1.1 m, within a budget of about 3,000 props a map, and its record says "randomly scattering more barrels will not repair a featureless main structure".
- **Applies when:** Any game with dressed spaces.
- **Verify:** The scene audit passes (`opengame-scene-audit`), and the walk bot reaches every interaction point.

### Opponents telegraph
- **Invariant:** Every threat shows what it is about to do in time for the player to answer, the answer is a skill the player can improve, and every special attack can be beaten by something the player already knows how to do.
- **Technique:** Anticipation before every attack (pose, sound, light), a readable recovery after it, and attack patterns that combine the same few tells in new ways as the game escalates. Check each special attack against the player's own moves: a lunge's landing area is smaller than the distance a sidestep covers in its flight time.
- **Reference configuration:** ST's craft defaults tie anticipation, contact, recovery, sound and visual cues to every real action. OC's boss wind-ups run at least 900 ms, and 2,500 ms for attacks that down the player (`opengame-enemies`). LC's blows wind up for 0.42 s and recover for 0.55 s; its dive's landing radius was cut to 0.9 m because a strafe at 2.7 m/s covers 1.36 m in its half-second flight.
- **Applies when:** Games with opponents, hazards or bosses.
- **Verify:** Mute the game and play: every attack can still be read from the picture. Then play with the screen dimmed: the important ones can be read from sound.

### Mashing does not win
- **Invariant:** Pressing buttons at random loses to playing well, at every difficulty past the first.
- **Technique:** Commitment on actions (wind-up, recovery, resource cost), punishable whiffs, and defence that rewards timing. Test it directly with a random-input bot.
- **Reference configuration:** A rule from the plan for OpenGame's craft skills (ST). None of our games measured it, so there is no number to copy: the random-input bot is the measurement.
- **Applies when:** Action, fighting and arcade games.
- **Verify:** A bot that presses random inputs for a full match scores clearly worse than a person who plays with intent.

### Teach in the scene
- **Invariant:** The player learns each action at the moment they need it, from the game itself, and the hints match the real keys.
- **Technique:** A short hint in the world, shown when the action first becomes useful, generated from the same action table input uses. No wall of controls before play.
- **Reference configuration:** Our originals' best opening is one line beside a live match with both control legends on screen: the menu states the verb.
- **Applies when:** Every game.
- **Verify:** A stranger completes the first objective without opening a help screen.
