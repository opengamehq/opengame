---
name: opengame-assets
description: Generate, source and import a browser game's models, textures, sounds and menu films so they match and look right. Covers proving one route before a batch, spend caps, artists' models for held objects, a studio render beside a photograph, graded materials, licences on file, references for composition only, an import lint, binary-safe git and paid jobs bought once. Use when the person says generate models, use Meshy, ElevenLabs or fal, assets look fake, black or chrome, or downloads are big.
metadata:
  version: "1.1.0"
---

# Generated assets

Generation is cheap compared with what it costs to ship an asset that does not belong:
a model in a different style, a sword with a glow modelled as geometry, a sound whose
attack lands after the hit. The rules below keep a game's assets consistent, loadable
and paid for once.

Generated meshes top out at "passable" for exact hard surfaces. LC graded 0 of 73
generated weapons photoreal and had spent $307 on generation before it learned that; OS found generated props its weakest asset. So generate bodies, far props, large
forms and variety; take what the player holds from licensed artists' models or author it;
and prove one route end to end before paying for a batch.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes.

**Keys never go in the game.** Generation runs on the creator's machine at build time,
with keys from the environment, and only the finished files ship. A key in a game is a
key on a public CDN, and OpenGame rejects an upload that contains one (see `opengame-deploy`).
Paid generation runs only on the person's own account, after they have said yes to the cost.

## Rules

### Content over tuning
- **Invariant:** When the frame misses the concept, the next change adds authored content the concept has and the build lacks (a scanned material, a sculpted kit piece, a prop layer, a light, an effect) instead of another pass on grade, fog or procedural parameters.
- **Technique:** Before tuning, list what the concept shows that the frame does not, and check the renderer is already at its top settings. Use scanned CC0 material sets for surfaces and keep procedural work for wear, wetness and variation layered over them. Build kits from sculpted or image-to-3D pieces made from crops of the concept, then dress them densely. Ask before reversing an owner's earlier call on how something is made.
- **Reference configuration:** After hours of grading (`opengame-quality-bar` has that story), an OC orchestrator found Ultra, TAAU, GTAO and SSR already on, so the gap was "missing content, not tuning", and the rule became "each commit has to add something the concept has and we don't". Procedural stone read "flat" next to the concept's "dense scanned/sculpted surfaces", and the world moved to Poly Haven CC0 scans under procedural wetness and wear; the agent asked first, because it reversed the owner's "environment procedural" call. Image-to-3D from concept crops gave a 24-piece kit in about 15 minutes, and a 28-piece kit cost about $20.90 on Meshy plus $4.70 on fal. OC's project review ranked this second among the changes that moved its quality most, after scored concept sheets. OS's maps and LC's world also settled on Poly Haven CC0 scans (LC used 23 sets).
- **Applies when:** 3D games aiming at a painted or photographic concept. A flat or stylised look may be procedural by choice.
- **Verify:** Each round's change list names the content added, and the paired concept and build frames show it.

### Prove one route end to end before a batch
- **Invariant:** No batch of paid generation starts until one asset made by that route is packed, loaded in the game, captured beside its reference and accepted, and the batch stops as soon as the route is shown not to reach the bar.
- **Technique:** Make the hero asset first. Spend in stages and look at each stage before buying the next: the reference pictures before the mesh, the mesh before the rig, one before ten. Price a new service on one call and show the owner the batch cost before running it. Never buy a second candidate you cannot tell apart from the first, and never buy again what already exists: check the ledger and the files first. When a route fails, write down what it cannot do and change route for that class of asset instead of buying more of it.
- **Reference configuration:** LC had spent $307 on generation before its lead ruled that "generation alone will not reach the bar"; little more went to that route, and the rest of its $393.63, about $87, went mostly to enemies and audio. Its second candidates bought "nothing I can see". OS's working rule: "Probe one item, look at it, then batch. Never re-buy what exists". OH priced a stem-separation service on one call (990 credits a song, about $2,100 for the whole station) and the owner chose the free route. LC's zombies were checked as A-pose pictures before each mesh was bought.
- **Applies when:** Every game that uses paid generation, and every new provider or route.
- **Verify:** The first asset's in-game capture beside its reference is dated before the batch's first paid call in the ledger.

### Spend is capped per provider and logged before every call
- **Invariant:** Each paid provider has a cap the owner set, every paid call is logged with its cost before it starts, every tool that can buy runs dry unless told otherwise, and the running total comes from the log, not from memory.
- **Technique:** Keep one spend log per project with provider, stream, job, cost and running total, written before each call. Give each stream its own cap inside the provider's. Stop and ask before a call would cross a cap, and stop short of the account balance rather than at it. Make every tool that spends money print what it would buy and what it would cost unless a flag says otherwise, and read its argument parser before running it with any flag. Check shared accounts for spend from other sessions, and reconcile the log with the provider's dashboard after each batch.
- **Reference configuration:** OC spent $178.13 by 19 Oct (Meshy $115.70, fal $34.87, ElevenLabs $27.56) against caps of $250, $150 and $500. The first day bought 55 concept images for $23.48, 1,275 audio files for $11.70, and a titan plus 5 zombies on Meshy for $10.84; 40 mocap clips cost about $2.40 and a canon titan $1.40. One agent misread "$30.96 of its $35 fal cap" when about $27 was left; another session spent about $1.20 unlogged on the shared Meshy account; voice slots ran out at 37 of 30, which blocked 9,900 lines. LC spent $393.63 of $500 (Meshy $338.92 over 1,248 calls, 86%; ElevenLabs $52.17; fal $2.54), 71% of it in one day, with caps per stream that only the lead moved; running `--help` on a generation tool bought 77 readings, after which every buying tool ran dry by default. OS spent $115.34 (Meshy $84.20, ElevenLabs $24.98, fal $6.16) under a $500 combined cap and stopped 5,000 credits short of the balance; its ledger still drifted (missing camo rows worth about $0.84, 197 rows rebuilt after a reset, a test filed under the wrong provider).
- **Applies when:** Every game that uses paid generation.
- **Verify:** The log's total for each provider matches the provider's own dashboard, and a buying tool run with no flags spends nothing.

### What the player holds comes from a source that can reach the bar
- **Invariant:** An object the player holds or studies at arm's length comes from a source that can look real at that distance (a licensed artist's model with its credit, or an authored model), with each moving part a separate named mesh and named attachment points. Generated meshes are for bodies, far props, large forms and variety, small exact parts are scripted or parametric, and code-built primitives never stand in for a hero prop.
- **Technique:** Search licensed artist models first (CC0, or CC BY with the credit shown in the game). Where no artist model exists, generate only large forms: make side pictures first and look at them before paying for the mesh, make moving and small parts separately, clean the mesh (remesh to budget, fix melted detail, bake AO) and grade its maps. Model each moving part as its own named mesh, with empties for sockets (muzzle, ejection, grips, sight) and a manifest of pivots and travel. Anything repeated or near the camera that no artist model covers can be built by script in a 3D tool. Weapons in detail: `opengame-weapons`.
- **Reference configuration:** OC's hero guns are GLBs with named moving parts, `socket_*` empties and a manifest; about 24k triangles at 2048 in first person and 10k at 512 in the world. Code-built guns were "rejected on sight since r0", and raw generated guns were called "melted, raw Meshy output". LC graded 0 of 73 generated weapons photoreal and replaced the seven most-held with CC BY artists' models, "crisp where the generated mesh was soft"; a generated flywheel came back with "EIGHT flat spokes ... (I asked six round ones)", and four generated sandbags came back as pouches. OS's generated props, about $0.60 each, were its recurring weak asset: a dropship prompt returned "a jet fighter" until rewritten as "a flat-bottomed cargo hull with no swept wings", and the owner wrote "and liek this helicopter is complete low poly not aaa slop ?...". OS settled on scripted models for anything repeated or near the player, such as a 4,806-triangle bus with an interior and sandbags placed "bag by bag ... inside the old bounds" so colliders stayed valid.
- **Applies when:** Games with held, inspected or near-camera objects. A stylised game can author or generate within its style, and the same split of near and far holds.
- **Verify:** Open each hero prop's file and list its parts and sockets against the manifest, name its source and licence, and capture it in use.

### A studio render beside a real photograph is the gate
- **Invariant:** No realistic asset enters the game before a render under neutral studio light stands beside a photograph of the real thing at the same size and angle, with the in-game view as a third panel and a written verdict line by line; a silhouette score or a clean render alone passes nothing.
- **Technique:** Render at the views the game's camera actually uses, put a real photograph (or, for an invented object, the approved concept) beside it at matched scale, add the in-game capture, and list what differs. Check that baked occlusion is present and plausible, because flat colours on the right faces make a render look right without it. When the photograph wins, the asset waits.
- **Reference configuration:** LC's gloves were a scripted sculpt baked offline, never generated, and went through a studio gate beside a real photograph whose verdict line was "The photograph wins". LC's generated world props fell short the same way: a helicopter was "a crumpled shell", text-only helicopters were "toys", and its heroes moved to image-to-3D from a reference picture. OS's rifles passed 23 of 23 silhouette-overlap runs (side 0.92, top 0.88) while judges still named thick eyepieces and flat lenses. The five-part pistol that failed beside a photograph, and the floor OS set for baked occlusion, are in `opengame-weapons`.
- **Applies when:** Weapons, vehicles, machines, hands, tools and any realistic hard surface. An invented object uses its approved concept in place of the photograph.
- **Verify:** A studio, photograph and in-game sheet for every such asset, with its verdict, filed before the asset is installed.

### Every generated or scanned material is graded before use
- **Invariant:** No generated or scanned material map goes into the game ungraded: coatings read as coated metal, wood as wood, black as black, and every map is checked under the game's own light at the distances the camera reaches.
- **Technique:** Generated maps tend to arrive glossy and fully metal. Grade steel to a middling roughness with metal only where it is worn bare, soften the normal map, pull painted edge wear in and break it up with a scan, and give paint and lacquer a low metalness with the form painted into the colour. Grade scans too: compare albedo with a measured chart, and look for colour casts, baked weather, paint passing as metal and tiling that shows at range. Never darken an albedo to answer a hot spot under auto-exposure. Coatings, matte black and sheen: `opengame-look`.
- **Reference configuration:** LC's generated weapons arrived at roughness about 0.35 and fully metal and read as "wet tar and orange"; they were graded to roughness 0.55-0.67, metal only on bare wear, normals at half strength, coats at metalness 0.1-0.3. Painted edge wear, "a near-white line ... thirty times the steel beside it", was pulled in to a sixth, and a coat at metalness 0.9 under a flat fill was "a black cut-out". LC's world opened as "a clay model" after albedos had been pushed step by step to 2-3% against a hot spot, and recovered with gain 2.6, a roughness floor of 0.6 and sheen 0.12 (wood 5-8%, cloth about 10%). OS's CC0 scans had faults of their own: a warm granite (mean sRGB 132, 106, 81), a "metal-sheet scan [that] is red paint", baked rain streaks and a 1 m block grid at range. OC's generated albedos came in dark (mean sRGB 80, 65, 60).
- **Applies when:** Every PBR game using generated or scanned textures.
- **Verify:** Sweep each material's luminance at near, middle and far distances the camera reaches (LC: 0.7, 1.3 and 2.5 m) under the game's own light, and list each map's graded values beside what the generator or scan supplied.

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
- **Technique:** One script runs over every model, texture and sound and checks the convention above, triangle and texture budgets, material defaults and channels, opposed normals, skin weights (`opengame-characters`), clip counts, sockets, alpha mode and duplicate embedded images. Keep import output out of the source tree, or make it deterministic, so a rebuild never dirties the checkout. Give placeholders the real sampler settings. Break the lint on purpose once to prove it catches each fault.
- **Reference configuration:** OC's importer turned soft alpha into a hard cutoff, reset three materials to the default shader on every build without a warning, processed materials one pass late so a model failed to load, and could not read WebP. Its import output dirtied the tree on almost every merge. OS's import read height stored in alpha as cut-outs on 65 textures, palette quantising blackened transparent texels on 33 of 42, one exporter version wrote buffers that rendered black, and 74 textures had no source while stale cooked copies kept warm builds green. LC's 1x1 placeholders with nearest filtering compiled the shader without mips and left the real maps unfiltered on every weapon.
- **Applies when:** Every game with more than a handful of assets.
- **Verify:** Run the lint on the whole asset folder and on a file broken on purpose; the second run fails and names the file.

### Git never rewrites a binary asset
- **Invariant:** Every binary asset is identical, byte for byte, after a fresh clone on any machine, because the repository marks binary formats so no tool converts them as text, and every copy step compares content rather than dates.
- **Technique:** Before the first asset is committed, mark audio, image, model, font and archive types as binary in `.gitattributes` (`*.wav binary`, or `* -text` for a folder of assets), so line-ending conversion cannot touch them. Keep a manifest of each asset's size and hash, and check it after a fresh clone and after every copy or cook step, by content rather than by modification time.
- **Reference configuration:** OH: line-ending conversion corrupted 121 of one sample library's 1,776 WAVs until `* -text` stopped it, and its release now checks sizes after a clone. OS: copies that kept old modification times made an incremental cook ship old models.
- **Applies when:** Every game kept in git, above all one edited on more than one machine or operating system.
- **Verify:** Clone into a new directory and compare every asset's hash with the manifest; nothing differs.

### Embedded textures are deduplicated and sized by role
- **Invariant:** No texture ships twice, every texture is sized for how close the player sees it, and approved art is never cut to meet a budget without asking.
- **Technique:** Deduplicate images inside and across model files, size each texture by its texel density at the closest the camera gets (and at the zoom of any scope), subset fonts, and free CPU-side copies after GPU upload where nothing reads them again. After every cook, check that no compression cap has undone a size. Measure tab memory on a real phone. When a budget is tight, cut residency and shader cost before cutting approved art, and bring the tradeoff to the owner.
- **Reference configuration:** OC: the titan file was 55.7 MB because it embedded its textures three times; deduplication and a cap per level of detail took its albedo from 11.2 MB to 2.8 MB. One session's download fell from 225 MB to 103 MB raw (about 51 MB deflated) after deduplication and font subsetting; eight font atlases had cost 34 MB. Textures default to 1024 px, hero items get 2048, enemies are capped at 1024. The cap flipped between 2048 and 1024 three times. LC sizes by nearness: 2048 hero, 1024 walked round, 512 furniture; nine weapons went from 4096 to 2048 maps (604 MB on the GPU to 151) and a blind A/B could not tell them apart; KTX2 took its 23 surface sets from 801 to about 185 MB on the GPU, though the files were 2-3x the WebP size, so KTX2 buys GPU memory, not download. OS sized by texel density at closest approach (858/d px per metre at a 64-66 degree field of view and 1080p), noted that "4-10x scopes make distance no excuse", and found cook caps had undone resolution three times without a warning. Approved art and the owner's veto on cuts are in `opengame-quality-bar`.
- **Applies when:** Every game with textured models, above all on the web and on phones.
- **Verify:** List every image by hash across the shipped bundle; no hash appears twice. Compare each texture's size with its role's cap.

### Every asset has its licence on file, and nothing is copied
- **Invariant:** Every sample, model, texture, font, voice and package in the build has its source, author and licence on file and a credit where the licence asks; nothing is copied from a reference; and a file with no known author or licence does not ship.
- **Technique:** Prefer CC0 and public-domain sources, CC BY with a credits page, and your own synthesis or art drawn in code (strokes, stamps, icons, hit sounds). Keep a licence table with the source address, author, licence and credit text of each asset, and fail the release on a file or package missing from it. An asset the owner supplies goes through the same check; when its licence is unclear, say so, keep it out of the public build and let the owner decide. Keep reference files outside the build folder and ship original names.
- **Reference configuration:** OH made its songs from eight freely licensed sample libraries (CC0 drums in 130 of 143 songs, a CC BY 3.0 piano in 40 that needs a visible credit, an electric piano with a split licence left to the owner), drew its art, icons and hit sounds in code, and fails a release on an unlisted npm package. LC's gunshots came from a CC0 firearm library and its rain from credited public-domain recordings; a file with no recorded author was dropped; its CC BY models are credited in the game. OS's licence gate refused a gunshot pack the owner supplied, a later importer let it in as a reversible test bank, and the agent flagged the copyright risk.
- **Applies when:** Any shipped content.
- **Verify:** A licence trace for every shipped file, and a release check that fails on a planted unlisted file.

### Generated photographs are references for composition only
- **Invariant:** A generated image guides the composition, mood and layout of an invented scene, never how a real object, place, text or mechanism looks; real detail comes from real photographs, drawings or measurements, and a level's layout comes from its measured plan.
- **Technique:** Label every generated reference "composition only" in the asset plan. Take real objects' detail from photographs and published drawings, and a map's layout from its measured plan rather than from a concept. Keep a list of what the image model cannot draw for this game (legible text, exact mechanisms, tileable swatches) and turn each item into a written spec with a numeric gate. Count an image as generated only when it is a new file from the generator itself.
- **Reference configuration:** LC's generated "photograph" references carried fake text and modern rail lights, so "generated references are for composition only"; its hands spent $0.12 on two such pictures and took everything else from scans and a scripted sculpt. OS's concepts invented layout, so it took layout from the reference map's measured plan and art from concepts, "never interchange them"; what its image model could not draw (ink shading, exact rifles, scope orientation, tileable swatches, legible text) moved into a limits file and engine specs with numeric gates. One OS agent drew a fake image with an image library and reported it as generated.
- **Applies when:** Every game that uses generated images as references.
- **Verify:** Every reference in the plan names its source, and no real-world detail in the game traces back only to a generated picture.

### One reference frame drives everything
- **Invariant:** Every generated asset in a game shares one art direction, taken from one composed reference image of the game seen from the player's camera.
- **Technique:** Make a single composed frame of the game from the real camera (player or weapon, opponents, environment, HUD space) at the quality bar, write every later prompt from the game's own source and that frame, and pass it as a reference to every image request. Once the build has frames of its own, paint over those rather than starting fresh concepts.
- **Reference configuration:** Our originals write one composed frame per game and use it both as image-to-3D input and as the bar to climb against. Dragline's key art came out right because the prompt was built from the game's own art code; a prompt that describes a genre produces art that looks like that genre. OS's paint-overs of its own captures beat fresh concepts with its judges (7.3 against 6.95) and became per-frame lists of what was still missing.
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
- **Technique:** Pin the model version in every request and allow-list the fields a request may send. Record the request, the provider's job id and the returned files' hashes. Download results immediately; never store a provider URL. On a timeout, poll the existing job by id before submitting anything. Check the balance before a batch.
- **Reference configuration:** Meshy deletes results after 3 days. MC measured 30 credits per textured image-to-3D job on meshy-6 and 5 per remesh. MC also found two characters generated with identical parameters came back at different quality, so inspect each one. OS allow-lists request fields because "a misspelt parameter is silently ignored and you pay full price", and journals every request because task URLs "die 3 days after".
- **Applies when:** Every paid provider.
- **Verify:** Every generated file in the game has a manifest entry with its request, job id and hash; no file is referenced by a provider URL.

### Clean, then rig, then animate
- **Invariant:** A character is rigged from its cleaned, final-polygon-count mesh, that exact mesh is kept beside its paid rig, and every character has idle, locomotion and its signature action before it appears.
- **Technique:** Set the target polygon count on the generation or remesh, inspect and clean the mesh, then rig that file and keep it unchanged, then add clips. How to order a generated person for skinning and re-bake it with a budget for the face is in `opengame-characters`. Choose animations by id from the provider's library rather than paying to see what one is, after watching its preview, because names mislead.
- **Reference configuration:** MC sets a 22,000 triangle target before rigging, because a rig binds to the mesh it was given. Meshy's rig has 24 joints and no fingers, returns one 0.3 s animation, and numbers its torso bones in the opposite direction to Mixamo, so code that assumes `Spine` is the lowest bone bends the belly. ST keeps Meshy's 678-action library as a searchable table. LC lost one figure when its prepared files were overwritten and the mesh sat 16.6 mm off its paid rig. OS found "Chest Pound Taunt" was a sword taunt.
- **Applies when:** Generated characters and creatures.
- **Verify:** The rest pose, a stretch pose and every clip in play pass the gates in `opengame-characters`.

### Web-ready files, checked through the real loader
- **Invariant:** Every model and texture in the bundle is in a web-ready format, compressed only where the game's own loader can read it, and opens in the game.
- **Technique:** GLB with meshopt or Draco geometry and KTX2 textures where the decoders ship in the bundle; otherwise plain GLB and WebP. Load every shipped model through the game's own loader in a check that prints mesh, triangle and clip counts.
- **Reference configuration:** Our originals delivered thirty models into eight games where only two games had a GLTF loader at all; a missing loader is a blank page with nothing in the console. `clips=0` in that check means the model is not animated, whatever a manifest says. AW encodes KTX2 per texture class after measuring (see `opengame-performance`). LC kept weapons in WebP at quality 74-82 because KTX2 uploads stalled frames by 150-370 ms at that point, and stores weapon geometry as quantised 16-bit positions and 8-bit normals.
- **Applies when:** Every 3D game.
- **Verify:** The loader check opens every shipped model and its clip count matches what the game plays.

### Sound prompts are directions to a recordist
- **Invariant:** A generated sound fits its action: the right source, attack and tail, starting on the frame of contact, with nothing in it the player will read as a different event.
- **Technique:** Describe source and material, attack, body, tail, distance, duration and whether it loops, in one consistent acoustic space per family. Name only the sound wanted: a bed prompt that names an event puts that event in the bed. Then edit like a recordist: trim unwanted silence before the attack, keep real tails, and remeasure loudness and true peak after any edit. Screening, mastering and casting are in `opengame-audio`.
- **Reference configuration:** ST's sound pipeline trims leading silence with a short pad and keeps the source; our originals budget 50 to 400 recorded samples per game. MC and AW measure every shipped file into a loudness manifest (see `opengame-audio`). LC's throat prompted as a woman's came back shrill in 144 of 243 takes. OS's ambience bed prompted with "gravel crunching far away" played as footsteps in the menu for three days.
- **Applies when:** Every game generating sound.
- **Verify:** Line each cue up with its animation contact in a recording; the attack lands on the contact frame.

### Menu films keep the camera and the title still
- **Invariant:** A menu or banner film moves only the atmosphere: the camera is locked, nothing enters or leaves, and the title stays exactly as drawn.
- **Technique:** Animate the approved still with an image-to-video model using a prompt that is mostly refusals (camera locked, no figure changes pose, nothing appears or disappears, only atmosphere moves). Keep the title out of the animated pixels or protect it, then play the clip out and back so the loop has no visible join.
- **Reference configuration:** Our originals use fal's MiniMax image-to-video for banner films, about three seconds played out and back; one game's clip lost its title and turned lasers into fire, and is kept as the failure to avoid. ST generates the banner at 2048 x 1152, above the 1920 x 1080 publishing minimum and divisible by 16.
- **Applies when:** Games with a menu film, banner or hover clip.
- **Verify:** Step through every frame of the loop: the title's pixels and position do not change.

## Further reading

Generation as it runs on OpenGame's own Studio, including model and sound batching, plus OC's import lint checklist, the spend log, a dry run, a licence table, where LC's assets settled and its weapon pipeline:
[references/pipeline.md](references/pipeline.md).
