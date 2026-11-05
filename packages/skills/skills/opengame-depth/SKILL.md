---
name: opengame-depth
description: Give a browser game depth instead of a single verb. Covers proving a natural win exists, boss health sized from real damage, a first goal reachable at spawn, a spawn controller with wave sizes and a cap, rounds that never stall, short defence objectives, a boss goal the player can read, dev staging to any moment of a run, tuned odds, and systems that interact. Use when the person says the game is boring, too hard, rounds drag, it is unclear what to do, or it feels like a tech demo.
metadata:
  version: "1.0.0"
---

# Depth

A game is deep when its systems create decisions together: what you carry changes how
you fight, the ground changes your route, what you prepare changes the next encounter.
A decorative counter, a menu for an unfinished system or a bigger map is not depth. The
fastest way to look shallow is a minigame: one verb, no consequence, nothing to learn.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes. OC's run is a wave
shooter with rounds of zombies, three generators to defend and then a boss.

## Rules

### Prove a natural win exists
- **Invariant:** Before any tuning for feel, unstaged runs by bots at several skill levels show that a player can reach and finish every stage of the run with the gear the game gives them.
- **Technique:** Write the target in rounds or minutes for a strong, an average and a new player. Run bots through the real game with no cheats and log where each run ends and why. Compare enemy health, player damage and boss health against what a full loadout can deal. Change one variable at a time between runs.
- **Reference configuration:** OC's first gameplay audit lost 7 of 7 natural bot runs: round 1 zombies had round 10 health, and each boss lock-core had 35,000 HP, more than a full loadout could deal. OC's targets: the boss wakes by round 8 to 10 for a great player, 10 to 12 for a decent one and 12 to 15 for a beginner. Difficulty later swung from "literally not even killing me" to a death in 0.37 s before settling at 3 hits to down.
- **Applies when:** Every game with a win condition, runs, waves or a boss.
- **Verify:** A bot run with no cheats reaches each stage within its target band; the report lists the round and cause of every loss.

### Boss health comes from the damage a player can deal
- **Invariant:** The boss's health and each vulnerable window are sized from the damage the expected loadout deals in that window, and one document holds the number.
- **Technique:** Compute damage per second for the loadout a player has at that stage, multiply by the length of each vulnerable window and the number of windows the fight should take, and set health from that. Keep the value in one spec file that code reads.
- **Reference configuration:** OC's spec said 400,000 HP while the code held 60,000, and the spec had 4 phases against the code's 3. The rebalance moved to the reference game's solo formula with the titan at 120,000.
- **Applies when:** Games with bosses, shields or damage gates.
- **Verify:** A bot with a middle loadout breaks one weak point inside one window, and a full fight lands inside the target length.

### The first goal is reachable at spawn
- **Invariant:** A new player can afford and see the first goal from where they start, and the objective panel, banners, voice and tips all state the same goal in the same words.
- **Technique:** Price the first purchase or gate at or below the starting money. Write each objective once, in one table, and drive the panel, banner, voice line and loading tip from it. Prompts name the action and the cost.
- **Reference configuration:** OC started the player with 500 points against a 750 gate, a design bug; the fix was a 500 gate and a "First: Quick Revive (500)" tip. OC once shipped three boss instructions at once, and its HUD still said "lock-cores 0/4" after the mechanic changed. Its prompt form: "Hold F to open the East Gate [750]".
- **Applies when:** Every game with an economy or an objective chain.
- **Verify:** A stranger reaches the first goal without help, and a search of the strings finds each objective worded once.

### A spawn controller owns wave size, the cap and placement
- **Invariant:** One controller sets how many enemies each wave has, how many may be alive at once and where they appear, and early waves are small and close to the player.
- **Technique:** A table of wave sizes and health per round, a hard cap on live enemies, spawns spread across several approaches near the player, and no spawns during breaks. Every other system asks the controller for spawns instead of creating enemies itself.
- **Reference configuration:** OC used the reference game's solo counts (6, 8, 13, 18, 24) and at most 24 alive (R110). Before the controller, early rounds flooded with spawns. Spawn accounting and the remaining-enemies counter are in `opengame-enemies`.
- **Applies when:** Wave, horde and arena games.
- **Verify:** Log spawns per second and live count across rounds 1 to 5: each wave matches the table and the live count stays at or under the cap.

### Rounds never stall
- **Invariant:** Every round ends a short time after the player kills what they can reach, and the last enemies are easy to find.
- **Technique:** Keep early breaks short, recover stragglers that stop making progress, respawn an enemy that has been out of sight and stuck for too long, and point at the last few enemies with a marker that shows above or below. Run full games with real input to find the stalls.
- **Reference configuration:** OC's breaks are 5 s in rounds 1 to 3 and 10 to 12 s after; stragglers are recovered after 12 s; markers appear once fewer than 5 remain (the last 1 to 4 at the radar edge). One OC round took 313 s. The owner asked for faster early rounds about 9 times. Stuck-enemy recovery steps are in `opengame-enemies`.
- **Applies when:** Wave and round-based games, and any objective that waits for "kill all".
- **Verify:** Over 20 automated rounds, log time from the last reachable kill to the round end: none exceeds the straggler limit.

### Defence objectives are short and bounded
- **Invariant:** A defend-this objective has a fixed length, a limit on attackers and a readable health for the thing defended, and each one has its own sound, effects and voice.
- **Technique:** Set the duration, the number of attackers allowed at once, the spacing between their spawns and the damage each hit does to the objective. Show the objective's health while it is attacked. Give each objective its own music, effect and start, middle and end lines.
- **Reference configuration:** OC's sleeping titan wakes after three generators are defended (R89, which replaced three seals). The owner's game "crashed again while defending a generator", so each objective also needs its own soak test.
- **Applies when:** Escort, hold, capture and defend objectives.
- **Verify:** Play each objective with no damage dealt: it fails at the expected time. Play it well: it succeeds within its duration, and its health bar matches the logged hits.

### The player always knows how to hurt the boss
- **Invariant:** At every moment of a boss fight the player can tell the one current goal, where to shoot, and whether the shot did anything.
- **Technique:** One goal per phase, worded the same in the HUD, banner and voice. Weak points that are large enough on screen at any range, saturated and pulsing, in a colour that means "shoot here" everywhere in the game and does not also mean danger. Damage numbers on a hit and an "immune" cue on a blocked one. A visible break when a weak point falls. The boss's own animation and telegraphs are in `opengame-enemies`.
- **Reference configuration:** OC's owner: "its completely unclear how to take down the titan or where u hvae to aim for / shoot at", raised 4 or more times; "i couldnt tell fi ti does anything". OC's fixes: weak points at 28 to 32 px or more at any range (1.5 to 2% of frame width), pulsing; crack beats at 66% and 33% health; a 2.5 s stagger on a break; orange means immune, cyan or violet means shoot here. A test bot hit weak points for only 8 of 489 s. One redesign left the boss asleep forever in normal runs.
- **Applies when:** Any boss or multi-stage enemy.
- **Verify:** A stranger plays the fight with no briefing and says, at three random pauses, what the goal is and where to shoot. Capture the weak points at the nearest and farthest fighting range.

### Stage any moment of a run in seconds
- **Invariant:** Developers and test agents can jump to any round, phase or objective with any loadout, and none of that reaches production.
- **Technique:** Dev switches for god mode, no enemies, extra money, any weapon, every gate open, each objective complete and a jump to any round or straight to the boss. Use them to reach and test late content; judge feel and difficulty only on unstaged runs. Strip the switches from the production build or lock them behind a key the server checks.
- **Reference configuration:** OC's set: god mode, ghost town, +50,000 points and a jump to any round, after the owner told agents to "give urself god mode / infinite health". OC's production build stores the dev key only as a hash. Dev flags still leaked fake points into captures.
- **Applies when:** Every game longer than a few minutes.
- **Verify:** Reach the boss from a cold start in under a minute in a dev build; in the production build every dev switch does nothing.

### Random rewards have tuned odds and a pity timer
- **Invariant:** Random rewards follow odds set against the genre reference, a long dry streak ends, and every path that can grant a rare item goes through the same odds.
- **Technique:** Write the odds per rarity, add a pity counter, show rarity with spectacle (colour, beam, sound), and list every code path that writes to an inventory slot so a rare item cannot arrive by another route. Audit each weapon's time to kill at several stages of the run.
- **Reference configuration:** OC's wonder weapon came at 1 in 56, then about 1 in 102, against 1 in 20 to 25 in the reference game; pity after 16 to 20 pulls. Wonder weapons are crate-only, which meant auditing 11 slot-write paths. Time to kill is audited at rounds 1, 10, 20 and 30.
- **Applies when:** Games with loot boxes, drops, crates or random rewards.
- **Verify:** Simulate 10,000 pulls and compare the rates with the table; trace each slot-write path to the odds function.

### Systems are defined before code
- **Invariant:** Each system in the game exists because it changes a decision the player makes, and that change is written down before the system is built.
- **Technique:** For each system, one line each: the decision it creates, what it interacts with, and how the player learns it. Cut any system with no answer. Build the interactions, not only the systems.
- **Reference configuration:** ST's craft defaults: different weapons change tactics, terrain changes routes, preparation changes the next encounter, and a decorative counter is not evidence of depth.
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
- **Technique:** Pick the location the first minute happens in and finish it: layout that creates routes and choices, a focal landmark, foreground, midground and distance, grounded props, the overhead layer, light and sound. Copy its standards outward, not its props.
- **Reference configuration:** MC's Rust map: about 2,900 primitives, 423 decals in one draw, 109 contact-shadow quads and 1,500 dust motes in 44 by 44 m. SR's island: 2,609 props, 6,512 grass clumps and 913 flowers.
- **Applies when:** Every game with a world to move through.
- **Verify:** Captures of the hero location from the player's camera pass the cheap-tells review in `opengame-quality-bar`.

### Dressing is placed by rules
- **Invariant:** Set dressing looks authored: it sits where such things would be, never blocks paths or interactions, and comes out the same every session.
- **Technique:** Scatter from a seeded generator and reject candidates by surface, slope, footprint flatness, clearance from paths, stairs, doors and interactables, and a noise mask. Place props against real walls, not in the open; dress the overhead layer with pipes, ducts, beams and cables; rotate things a few degrees off square; keep litter low enough never to block movement.
- **Reference configuration:** DK tries 8 positions per prop, each clear of walkways and against a wall, with per-room counts (a factory: 8 crates, 7 drums, 4 rubble piles, 3 machines). The ST bar's scatter rules keep half a path's width plus 1.2 m clear of paths and 5 m clear of stairs, reject footprints less flat than 0.45 m, and vary scale 0.7 to 1.5 with tint. Litter stays under 0.3 m.
- **Applies when:** Any game with dressed spaces.
- **Verify:** The scene audit passes (`opengame-scene-audit`), and the walk bot reaches every interaction point.

### Opponents telegraph
- **Invariant:** Every threat shows what it is about to do in time for the player to answer, and the answer is a skill the player can improve.
- **Technique:** Anticipation before every attack (pose, sound, light), a readable recovery after it, and attack patterns that combine the same few tells in new ways as the game escalates.
- **Reference configuration:** ST's craft defaults tie anticipation, contact, recovery, sound and visual cues to every real action, and its sound plan gives every enemy anticipation, action and reaction cues. OC's boss wind-ups run at least 900 ms, and 2,500 ms for attacks that down the player (`opengame-enemies`).
- **Applies when:** Games with opponents, hazards or bosses.
- **Verify:** Mute the game and play: every attack can still be read from the picture. Then play with the screen dimmed: the important ones can be read from sound.

### Mashing does not win
- **Invariant:** Pressing buttons at random loses to playing well, at every difficulty past the first.
- **Technique:** Commitment on actions (wind-up, recovery, resource cost), punishable whiffs, and defence that rewards timing. Test it directly with a random-input bot.
- **Reference configuration:** A rule from the plan for OpenGame's craft skills (ST). None of our four games measured it, so there is no number to copy: the random-input bot is the measurement.
- **Applies when:** Action, fighting and arcade games.
- **Verify:** A bot that presses random inputs for a full match scores clearly worse than a person who plays with intent.

### Teach in the scene
- **Invariant:** The player learns each action at the moment they need it, from the game itself, and the hints match the real keys.
- **Technique:** A short hint in the world, shown when the action first becomes useful, generated from the same action table input uses. No wall of controls before play.
- **Reference configuration:** Our originals' best opening is one line beside a live match with both control legends on screen: the menu states the verb.
- **Applies when:** Every game.
- **Verify:** A stranger completes the first objective without opening a help screen.
