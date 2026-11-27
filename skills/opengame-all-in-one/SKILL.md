---
name: opengame-all-in-one
description: Every OpenGame skill in one install, with the order to use them in, for taking a browser game from an idea to a AAA-feeling release, a trailer and a montage. Carries the platform, craft and video skills whole. Use when someone wants one skill that covers everything, says make it AAA or make it game of the year, starts a big game with agents, or does not know which OpenGame skill to load.
metadata:
  version: "1.0.20"
---

# Make a browser game that feels AAA

This skill carries every other OpenGame skill, each whole, under `references/`. Nothing
here replaces them: it is the route through them, in the order the work happens, and the
lessons that held across every game we pushed hardest. Read a carried skill when its step
comes up, not all of them at once.

**How to read a carried skill.** When one names another skill, such as `opengame-deploy`,
it is here at `references/opengame-deploy/README.md`; you do not need it installed. A path
inside a carried skill, such as references/threejs.md or helpers/spring.js, starts from
that skill's own folder, so the spring helper in `opengame-game-feel` is
`references/opengame-game-feel/helpers/spring.js`.

The lessons come from our own games, named by the codes in
[the quality bar](references/opengame-quality-bar/README.md): OG Clash (OC), a wave shooter
with a boss; OG Snipers (OS), a snipers-only multiplayer shooter with bots, about 500 builds
in 13 days; Last Contact (LC), a body-cam survival horror shooter built by up to ten agent
streams over six days; OG Hero (OH), a painterly rhythm game with 169 songs written in code. None of them
was finished by the first idea of what finished meant, and most of what cost them days is
written below so it costs you minutes.

## The bar, before anything is built

- A stranger decides in ninety seconds. A game feels AAA less because of content and more
  because the route a new player walks (title, menu, first minute, loading) has no cheap
  tells. [The quality bar](references/opengame-quality-bar/README.md) lists them.
- Turn the owner's reference (concept art, a concept film, a named shipped game) into
  written statements a stranger could mark pass or fail: the lens, how exposure behaves,
  where light comes from, the palette, the hands, the HUD. "Make it look like the video"
  is not a target; "with nothing lit, the night is black, not dusk blue" is.
- When the owner names a reference, measure it and match its numbers before tuning by
  adjective. LC read "a bit trippy" as a dial, shipped three stronger versions, and was
  told "way too aggressive"; matching the reference's numbers ended it.
- Write down what the owner asked for, in their words, and keep every later note beside
  it, ranked by how often it was repeated.

## The route

Work in this order. Each step names the carried skill that holds its rules.

1. **Brief and bar.** Genre, camera, the one thing only this game does, the reference
   frames, the budget. Then the first playable: the core loop with placeholder art, before
   any polish. ([quality bar](references/opengame-quality-bar/README.md),
   [depth](references/opengame-depth/README.md))
2. **Production setup.** A lead, owned file areas, a written contract between them, status
   files, an ask register, rounds that end in captures, and a reviewer with fresh context.
   ([production](references/opengame-production/README.md),
   [verification](references/opengame-verification/README.md))
3. **The world reads.** Light, colour, fog and post; geometry that holds up close; maps
   whose collision is exactly what is drawn. ([look](references/opengame-look/README.md),
   [lighting](references/opengame-lighting/README.md),
   [scene audit](references/opengame-scene-audit/README.md),
   [world physics](references/opengame-world-physics/README.md),
   [maps](references/opengame-maps/README.md))
4. **It feels good to play.** Input, camera, hits, recoil, then the weapons and enemies
   that use them, and the pacing in the player's own unit.
   ([game feel](references/opengame-game-feel/README.md),
   [weapons](references/opengame-weapons/README.md),
   [enemies](references/opengame-enemies/README.md),
   [rhythm](references/opengame-rhythm/README.md) for music games)
5. **Characters and assets.** Bodies, rigs, motion, models, textures, sound, each seen in
   the running game before it counts. ([characters](references/opengame-characters/README.md),
   [assets](references/opengame-assets/README.md),
   [audio](references/opengame-audio/README.md))
6. **Other players.** Lobbies, rooms, bots that read as people.
   ([multiplayer](references/opengame-multiplayer/README.md),
   [SDK](references/opengame-sdk/README.md))
7. **The front end.** Title, menus, loading, HUD, settings, controllers.
   ([front end](references/opengame-front-end/README.md),
   [accessibility](references/opengame-accessibility/README.md))
8. **Fast and solid.** Frame-time budgets, first and second loads, phones, crashes.
   ([performance](references/opengame-performance/README.md),
   [loading](references/opengame-loading/README.md),
   [mobile](references/opengame-mobile/README.md),
   [stability](references/opengame-stability/README.md))
9. **Judge it like a stranger.** Captures from the real route, the cheap tells, blunt
   scores against the bar, the owner's own path. ([quality bar](references/opengame-quality-bar/README.md),
   [capture](references/opengame-capture/README.md),
   [verification](references/opengame-verification/README.md))
10. **Ship it on OpenGame.** ([router](references/opengame-router/README.md),
    [SDK](references/opengame-sdk/README.md),
    [deploy](references/opengame-deploy/README.md),
    [CLI](references/opengame-cli/README.md),
    [API](references/opengame-api/README.md),
    [jam](references/opengame-jam/README.md))
11. **Film it.** A launch trailer and a gameplay montage, each planned, made and reviewed
    in rounds. ([trailer plan](references/opengame-trailer-plan/README.md),
    [trailer make](references/opengame-trailer-make/README.md),
    [trailer review](references/opengame-trailer-review-and-improve/README.md),
    [montage plan](references/opengame-montage-plan/README.md),
    [montage make](references/opengame-montage-make/README.md),
    [montage review](references/opengame-montage-review-and-improve/README.md))

Steps 3 to 8 are not a waterfall. Each round touches several; when two compete, fix the
core loop first, then every generated asset, then the front end, then playtest.

## What every one of our games learned the hard way

**Proof**
- **The owner finds what your checks miss, so build checks that see the way the owner
  does.** On OS the owner found about 93% of new defects. Each class the owner reports gets
  an instrument that would have caught it.
- **Judge the build the owner plays, on the owner's path.** Saved settings, a return visit,
  a window size, a slow line, real keys, strict autoplay. Every complaint LC heard four
  times lived on a path nobody had tested. New looks sit behind a flag until a capture of
  the default build proves them.
- **Prove the instrument before believing its number.** OS and LC each acted on numbers the
  measuring tool itself produced: warm "cold" boots, culled scenes counted as optimised, a
  read-back that slowed the frame it timed. Plant a defect; a check that cannot fail it is
  not a check.
- **Motion is judged on video, at quarter speed, never on stills.** Panels of stills scored
  OS 3 to 4 for about 135 builds while the owner reported flicker and shake.
- **Hide one thing at a time before mending.** The obvious cause was usually wrong; one
  ablation found the real owner of the fault in two short jobs.
- **Agents cannot hear and cannot watch at speed.** Say "measured", never "heard", and get
  a person to listen and play before calling sound or motion right.

**Fixes**
- **Sweep the class, not the instance.** When the owner names one bad gun, prop or pose,
  find every other member of that class before replying.
- **Every fix names the neighbour it could break.** Fixes caused the next defect about 25
  times in five days on OS. Lower, softer, darker and louder each need a check from the
  player's own view.
- **Freeze what the owner approves.** Archive approved looks and diff every later change
  against them; judge advice and parity passes broke an approved scope, camo and hands.
- **When gains stall, change the method, not the polish.** Seven repaints of OH's world
  gained little; one rebuild on the reference's own method gained more than all of them.

**Assets**
- **See every generated thing in the running game before it counts.**
- **Generated hard surfaces top out at passable.** LC spent most of its generation budget
  before learning that none of 73 generated guns reached photoreal. Use licensed artists'
  models for what the player holds; generate bodies, far props and variety; grade every
  generated material; prove one asset route end to end before buying a batch.
- **If the content must match something, own the thing it matches.** OH spent 26 hours
  charting recordings and never passed "2 or 3/10"; the first song it composed and charted
  from its own notes was "great chart".

**People and machines**
- **Keep the owner's words.** Quote notes exactly. A paraphrase that strengthens or softens
  a note produces the wrong fix. Never answer a content complaint with a setup step.
- **Every picture you send is the owner's next review.** Name its flaws in its caption.
- **Never block on the owner.** One synchronous question idled fifteen agents for hours on
  OS. Decide, write the decision and its reason, and go on.
- **Design for loss.** Outages took about 37 of 98 hours on LC and 36 of 67 on OH. Only
  state in commits, docs and handover notes survived; keep nothing that matters in a
  session.
- **Size the team to what you have.** Too many agents on one model pool tripped account-wide
  rate limits on LC; too few job slots left agents queueing for captures and committing
  from unit tests alone.

## Which carried skill answers what

| Question | Read |
| --- | --- |
| Is it good enough, what is missing | [quality bar](references/opengame-quality-bar/README.md) |
| Rules, goals, progression, balance | [depth](references/opengame-depth/README.md) |
| Light, colour, fog, post | [look](references/opengame-look/README.md), [lighting](references/opengame-lighting/README.md) |
| A painted, brush stroke look for the whole game | [brush stroke style](references/opengame-brush-stroke-shader-style/README.md) |
| Geometry, props, collision | [scene audit](references/opengame-scene-audit/README.md), [world physics](references/opengame-world-physics/README.md) |
| Maps, spawns, sightlines | [maps](references/opengame-maps/README.md) |
| Floaty, stiff, hits do not land, kill cams | [game feel](references/opengame-game-feel/README.md) |
| Guns, sights, viewmodels, reloads | [weapons](references/opengame-weapons/README.md) |
| Enemy AI, hordes, bosses, bots | [enemies](references/opengame-enemies/README.md) |
| Characters, rigs, first-person bodies | [characters](references/opengame-characters/README.md) |
| A rhythm or music game | [rhythm](references/opengame-rhythm/README.md) |
| Lobbies and other players | [multiplayer](references/opengame-multiplayer/README.md) |
| Models, textures, generated assets | [assets](references/opengame-assets/README.md) |
| Sound and music | [audio](references/opengame-audio/README.md) |
| Title, menus, HUD, controllers | [front end](references/opengame-front-end/README.md) |
| Keyboard, focus, reduced motion | [accessibility](references/opengame-accessibility/README.md) |
| Frame time and memory | [performance](references/opengame-performance/README.md) |
| Boot time and caching | [loading](references/opengame-loading/README.md) |
| Phones and touch | [mobile](references/opengame-mobile/README.md) |
| Crashes and error reports | [stability](references/opengame-stability/README.md) |
| Tests and proof | [verification](references/opengame-verification/README.md) |
| Screenshots and filming | [capture](references/opengame-capture/README.md) |
| Long builds with agents and rounds of notes | [production](references/opengame-production/README.md) |
| Which skill for a task | [router](references/opengame-router/README.md) |
| The SDK in the frame | [SDK](references/opengame-sdk/README.md) |
| Check, deploy, preview, publish | [deploy](references/opengame-deploy/README.md), [CLI](references/opengame-cli/README.md) |
| Your own tools and CI | [API](references/opengame-api/README.md) |
| Jam fields and eligibility | [jam](references/opengame-jam/README.md) |
| A launch trailer | [plan](references/opengame-trailer-plan/README.md), [make](references/opengame-trailer-make/README.md), [review](references/opengame-trailer-review-and-improve/README.md) |
| A gameplay montage | [plan](references/opengame-montage-plan/README.md), [make](references/opengame-montage-make/README.md), [review](references/opengame-montage-review-and-improve/README.md) |

Each carried skill says, in its first line, the version it was carried at. The separate
skills are the same text, so install this one or those, not both: `opengame setup` and
`opengame skills add --all` leave this one out for that reason.
