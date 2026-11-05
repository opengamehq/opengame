---
name: opengame-assets
description: Generate and import a browser game's models, textures, sounds and menu films so they match, load and look right. Covers content over tuning with scanned CC0 materials, an import lint for scale, axes, origin, material defaults, packed channels and normals, deduplicated textures, spend caps per provider, every asset seen in game, and paid jobs bought once. Use when the person says generate models, use Meshy, ElevenLabs or fal, assets look black or chrome, or downloads are big.
metadata:
  version: "1.0.0"
---

# Generated assets

Generation is cheap compared with what it costs to ship an asset that does not belong:
a model in a different style, a sword with a glow modelled as geometry, a sound whose
attack lands after the hit. The rules below keep a game's assets consistent, loadable
and paid for once.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes.

**Keys never go in the game.** Generation runs on the creator's machine at build time,
with keys from the environment, and only the finished files ship. A key in a game is a
key on a public CDN, and OpenGame rejects an upload that contains one (see `opengame-deploy`).

## Rules

### Content over tuning
- **Invariant:** When the frame misses the concept, the next change adds authored content the concept has and the build lacks (a scanned material, a sculpted kit piece, a prop layer, a light, an effect) instead of another pass on grade, fog or procedural parameters.
- **Technique:** Before tuning, list what the concept shows that the frame does not, and check the renderer is already at its top settings. Use scanned CC0 material sets for surfaces and keep procedural work for wear, wetness and variation layered over them. Build kits from sculpted or image-to-3D pieces made from crops of the concept, then dress them densely. Ask before reversing an owner's earlier call on how something is made.
- **Reference configuration:** After hours of grading (`opengame-quality-bar` has that story), an OC orchestrator found Ultra, TAAU, GTAO and SSR already on, so the gap was "missing content, not tuning", and the rule became "each commit has to add something the concept has and we don't". Procedural stone read "flat" next to the concept's "dense scanned/sculpted surfaces", and the world moved to Poly Haven CC0 scans under procedural wetness and wear; the agent asked first, because it reversed the owner's "environment procedural" call. Image-to-3D from concept crops gave a 24-piece kit in about 15 minutes, and a 28-piece kit cost about $20.90 on Meshy plus $4.70 on fal. OC's project review ranked this second among the changes that moved its quality most, after scored concept sheets.
- **Applies when:** 3D games aiming at a painted or photographic concept. A flat or stylised look may be procedural by choice.
- **Verify:** Each round's change list names the content added, and the paired concept and build frames show it.

### Material defaults and packed channels are checked on import
- **Invariant:** Every imported material has plausible metalness and roughness, its packed texture channels hold what the shader reads, its normals face out, and all of this is proven before anyone tunes light or colour.
- **Technique:** Lint each material on import: metalness zero on flesh, cloth and stone; a roughness factor that does not erase its map; a texture format that keeps every channel the shader reads; two-channel normal formats reconstructing Z; the occlusion, roughness and metal order the shader expects. Count vertices whose normals oppose their face winding. When a look is wrong in game, render albedo, normals, roughness and the lit result separately before touching any light.
- **Reference configuration:** OC: the importer's metal default of 1.0 made mirror slabs, and zombie bodies came back chrome-black whenever the renderer rebuilt a material from those defaults. Metal and roughness compressed to a two-channel format dropped the channel the shader read metal from, so iron armour rendered "like painted stone" until a four-channel format was forced. An avatar shader read a blue channel that its two-channel normal texture did not have, which inverted the normals and washed out the outfit. Opposed normals on 7.7 to 25.8% of zombie vertices made "the black horde", tuned through 10 rounds of albedo, fill and fire tint before anyone checked normals; the fix took white aprons from 12 to 34% of pixels to 0%. Zombie materials took 6 or more blind passes by 4 agents. 58 of 60 guns lacked AO. Iron without a metal flag read as grey cloth.
- **Applies when:** Every imported or generated PBR asset.
- **Verify:** The import report lists metalness, roughness, texture formats and the opposed-normal share for every asset; a studio-lit sheet shows each asset next to its channel views.

### Models follow one convention: metres, Y up, origin at the feet
- **Invariant:** Every model arrives in metres, with Y up, facing the same forward axis, with its origin at the feet or the base, so nothing is scaled, rotated or offset by hand in game code.
- **Technique:** Write the convention down on day one and convert at import, not at runtime. Check each model's bounding box for height and that its lowest point is at the origin. Leave skeleton fields that shift a skin's root unset unless the engine needs them.
- **Reference configuration:** OC found by trial that models must be metres, Y up, facing +Z, origin at the feet; the axes and units match glTF's own. A set skeleton field on the skin made every animated zombie float by its own hip height. OC's pipeline took 57 hero guns through one converter with world LODs, 32 props with 2 LODs and a 28-piece kit with 3 LODs, all in metres.
- **Applies when:** Every 3D game that imports models.
- **Verify:** Load every model at the origin beside a one-metre reference cube and capture the row from the side.

### One import lint runs on every asset and names each failure
- **Invariant:** Every asset passes one automated check on import, and a failure names the asset and the problem instead of shipping a broken file or changing it without a word.
- **Technique:** One script runs over every model, texture and sound and checks the convention above, triangle and texture budgets, material defaults and channels, opposed normals, skin weights (`opengame-characters`), clip counts, sockets, alpha mode and duplicate embedded images. Keep import output out of the source tree, or make it deterministic, so a rebuild never dirties the checkout. Break the lint on purpose once to prove it catches each fault.
- **Reference configuration:** OC's importer turned soft alpha into a hard cutoff, reset three materials to the default shader on every build without a warning, processed materials one pass late so a model failed to load, and could not read WebP. Its import output dirtied the tree on almost every merge.
- **Applies when:** Every game with more than a handful of assets.
- **Verify:** Run the lint on the whole asset folder and on a file broken on purpose; the second run fails and names the file.

### Embedded textures are deduplicated and sized by role
- **Invariant:** No texture ships twice, every texture is sized for how close the player sees it, and approved art is never cut to meet a budget without asking.
- **Technique:** Deduplicate images inside and across model files, cap texture size per role and level of detail, subset fonts, and free CPU-side copies after GPU upload. Measure tab memory on a real phone. When a budget is tight, cut residency and shader cost before cutting approved art, and bring the tradeoff to the owner.
- **Reference configuration:** OC: the titan file was 55.7 MB because it embedded its textures three times; deduplication and a cap per level of detail took its albedo from 11.2 MB to 2.8 MB. One session's download fell from 225 MB to 103 MB raw (about 51 MB deflated) after deduplication and font subsetting; eight font atlases had cost 34 MB. Textures default to 1024 px, hero items get 2048, enemies are capped at 1024. The cap flipped between 2048 and 1024 three times. Approved art and the owner's veto on cuts are in `opengame-quality-bar`.
- **Applies when:** Every game with textured models, above all on the web and on phones.
- **Verify:** List every image by hash across the shipped bundle; no hash appears twice. Compare each texture's size with its role's cap.

### Spend is capped per provider and logged before every call
- **Invariant:** Each paid provider has a cap the owner set, every paid call is logged with its cost before the next one starts, and the running total comes from the log, not from memory.
- **Technique:** Keep one spend log per project with provider, job, cost and running total, written before each call. Give each stream its own cap inside the provider's. Stop and ask before a call would cross a cap. Check shared accounts for spend from other sessions.
- **Reference configuration:** OC spent $178.13 by 19 Oct (Meshy $115.70, fal $34.87, ElevenLabs $27.56) against caps of $250, $150 and $500. The first day bought 55 concept images for $23.48, 1,275 audio files for $11.70, and a titan plus 5 zombies on Meshy for $10.84; 40 mocap clips cost about $2.40 and a canon titan $1.40. Per-stream caps such as art at $80 Meshy and $35 fal were tracked; one agent misread "$30.96 of its $35 fal cap" when about $27 was left. Another session spent about $1.20 unlogged on the shared Meshy account. Voice slots ran out at 37 of 30, which blocked 9,900 lines.
- **Applies when:** Every game that uses paid generation.
- **Verify:** The log's total for each provider matches the provider's own dashboard.

### Hero props are authored with named parts and sockets
- **Invariant:** A prop the player handles or studies is an authored model with separate moving parts and named attachment points, and generated meshes get a cleanup pass before they ship.
- **Technique:** Model hero props with each moving part as its own named mesh, empties for sockets (muzzle, ejection, grips, sight), and a manifest of pivots and travel. Clean generated meshes: remesh to budget, fix melted detail, bake AO. Never ship code-built primitives as hero props.
- **Reference configuration:** OC's hero guns are GLBs with named moving parts, `socket_*` empties and a manifest; about 24k triangles at 2048 in first person and 10k at 512 in the world. Code-built guns were "rejected on sight since r0", and raw generated guns were called "melted, raw Meshy output". `opengame-weapons` has the rest.
- **Applies when:** Games with held, inspected or animated props.
- **Verify:** Open each hero prop's file and list its parts and sockets against the manifest, then capture it in use.

### One reference frame drives everything
- **Invariant:** Every generated asset in a game shares one art direction, taken from one composed reference image of the game seen from the player's camera.
- **Technique:** Make a single composed frame of the game from the real camera (player or weapon, opponents, environment, HUD space) at the quality bar, write every later prompt from the game's own source and that frame, and pass it as a reference to every image request.
- **Reference configuration:** Our originals write one composed frame per game and use it both as image-to-3D input and as the bar to climb against. Dragline's key art came out right because the prompt was built from the game's own art code; a prompt that describes a genre produces art that looks like that genre.
- **Applies when:** Every game that generates assets.
- **Verify:** Put captures of every generated asset in play beside the reference frame; a reviewer with fresh context names any that do not belong.

### Model each item from a clean reference of itself
- **Invariant:** A held, thrown or collected item is a model of that item, made from an image of the item alone.
- **Technique:** Generate a neutral reference per item class: the item centred on a plain background, no rim light, glow, frame or sparkles, using the game's reference frame and the item's HUD icon as inputs. One model per class, tinted for variants; the container an item comes out of is a class of its own.
- **Reference configuration:** ST: image-to-3D models a glow as geometry, so references never glow. ST plans item models in the same first batch as the actors and ships a procedural version that meets the item bar only when a model has not landed in time.
- **Applies when:** 3D games with a modelled look. Drawn, pixel and 2D styles make each item a single standalone image instead.
- **Verify:** Capture each item class on the ground and in use, at play distance, beside its HUD icon.

### Paid jobs are pinned, saved and never bought twice
- **Invariant:** Every paid generation is reproducible from a recorded request, saved locally as soon as it finishes, and recovered rather than repurchased when a request times out.
- **Technique:** Pin the model version in every request. Record the request, the provider's job id and the returned files' hashes. Download results immediately; never store a provider URL. On a timeout, poll the existing job by id before submitting anything. Check the balance before a batch.
- **Reference configuration:** Meshy deletes results after 3 days. MC measured 30 credits per textured image-to-3D job on meshy-6 and 5 per remesh. MC also found two characters generated with identical parameters came back at different quality, so inspect each one.
- **Applies when:** Every paid provider.
- **Verify:** Every generated file in the game has a manifest entry with its request, job id and hash; no file is referenced by a provider URL.

### Clean, then rig, then animate
- **Invariant:** A character is rigged from its cleaned, final-polygon-count mesh, and every character has idle, locomotion and its signature action before it appears.
- **Technique:** Set the target polygon count on the generation or remesh, inspect and clean the mesh, then rig that file, then add clips. Choose animations by id from the provider's library rather than paying to see what one is.
- **Reference configuration:** MC sets a 22,000 triangle target before rigging, because a rig binds to the mesh it was given. Meshy's rig has 24 joints and no fingers, returns one 0.3 s animation, and numbers its torso bones in the opposite direction to Mixamo, so code that assumes `Spine` is the lowest bone bends the belly. ST keeps Meshy's 678-action library as a searchable table.
- **Applies when:** Generated characters and creatures.
- **Verify:** The rest pose, a stretch pose and every clip in play pass the gates in `opengame-characters`.

### Web-ready files, checked through the real loader
- **Invariant:** Every model and texture in the bundle is in a web-ready format, compressed only where the game's own loader can read it, and opens in the game.
- **Technique:** GLB with meshopt or Draco geometry and KTX2 textures where the decoders ship in the bundle; otherwise plain GLB and WebP. Load every shipped model through the game's own loader in a check that prints mesh, triangle and clip counts.
- **Reference configuration:** Our originals delivered thirty models into eight games where only two games had a GLTF loader at all; a missing loader is a blank page with nothing in the console. `clips=0` in that check means the model is not animated, whatever a manifest says. AW encodes KTX2 per texture class after measuring (see `opengame-performance`).
- **Applies when:** Every 3D game.
- **Verify:** The loader check opens every shipped model and its clip count matches what the game plays.

### Sound prompts are directions to a recordist
- **Invariant:** A generated sound fits its action: the right source, attack and tail, starting on the frame of contact.
- **Technique:** Describe source and material, attack, body, tail, distance, duration and whether it loops, in one consistent acoustic space per family. Then edit like a recordist: trim unwanted silence before the attack, keep real tails, and remeasure loudness and true peak after any edit.
- **Reference configuration:** ST's sound pipeline trims leading silence with a short pad and keeps the source; our originals budget 50 to 400 recorded samples per game. MC and AW measure every shipped file into a loudness manifest (see `opengame-audio`).
- **Applies when:** Every game generating sound.
- **Verify:** Line each cue up with its animation contact in a recording; the attack lands on the contact frame.

### Menu films keep the camera and the title still
- **Invariant:** A menu or banner film moves only the atmosphere: the camera is locked, nothing enters or leaves, and the title stays exactly as drawn.
- **Technique:** Animate the approved still with an image-to-video model using a prompt that is mostly refusals (camera locked, no figure changes pose, nothing appears or disappears, only atmosphere moves). Keep the title out of the animated pixels or protect it, then play the clip out and back so the loop has no visible join.
- **Reference configuration:** Our originals use fal's MiniMax image-to-video for banner films, about three seconds played out and back; one game's clip lost its title and turned lasers into fire, and is kept as the failure to avoid. ST generates the banner at 2048 x 1152, above the 1920 x 1080 publishing minimum and divisible by 16.
- **Applies when:** Games with a menu film, banner or hover clip.
- **Verify:** Step through every frame of the loop: the title's pixels and position do not change.

## Further reading

Generation as it runs on OpenGame's own Studio, including model and sound batching, plus OC's import lint checklist and spend log:
[references/pipeline.md](references/pipeline.md).
