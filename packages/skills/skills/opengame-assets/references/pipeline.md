# How the Studio plans and integrates generated assets

OpenGame's Studio (ST) builds games with agents and has to get assets right without a
person checking each one. Its production plan is worth copying even for a game built by
hand.

## Plan rows, not files

Keep one compact plan of requirements, made from the brief and the reference frame
before asking for anything:

- one row per signature actor, mount, machine, landmark and core interaction;
- one row per class of item, pickup, collectible and projectile the player sees;
- one row per sound family, pointing at a cue map;
- each row with a construction choice (`image_to_3d`, `authored_3d`, `procedural`,
  `sprite` or `reuse`), a status (`missing` or `integrated`), and the final files.

A saved file alone is not integrated. A row is integrated when the game loads its files
on the real route and a capture shows them. Never delete a row to make the plan look
finished; an unfinished requirement stays visible.

## Choose the medium per asset

The art style and the player camera decide. A drawn, sketchbook, pixel, flat or 2D look,
a weapon drawn onto the first-person view, billboard enemies and icons are sprites, and
that choice is its own justification. Rigging is for a 3D character whose motion the
player sees, never for a sprite, a static prop or a drawn weapon. Replacing a signature
actor with procedural geometry needs a specific visual reason, compared at the player
camera against the concept; generation latency and cost are not reasons.

## Start long jobs early

Begin independent model and sound jobs while the core loop is being built, not after
it. Inspecting a finished creature must not delay its rider's references. Put the hero's
model first; queue item models behind it.

## Cue map

```json
{ "families": [{ "id": "footsteps-sand", "event": "Player steps on sand", "trigger": "js/audio.js",
  "files": ["assets/audio/step-sand-a.ogg", "assets/audio/step-sand-b.ogg", "assets/audio/step-sand-c.ogg"],
  "minimumVariants": 3 }] }
```

`trigger` names the source that plays the family; `files` are real recordings. Distinct
bytes are different files, not audible variety: audition them in their real triggers.

## Banner and menu art

ST makes one strong original 16:9 banner with the game's title in it, animates that exact
image for the menu film, keeps the still as the poster and the social image, and reuses
the one film behind every menu screen rather than buying a clip per screen. A film with a
different aspect ratio can sit behind a menu with an inspected crop, but it is not a
publishing asset.

## Import lint checklist (OC)

What OC's agents found by trial and wished one check had caught. Run it on every model,
texture and sound at import, and make every failure name the file.

- **Units and axes.** Metres, Y up, facing +Z, origin at the feet or base. Report the
  bounding-box height and the lowest point.
- **Skins.** Root and skeleton fields that do not offset the mesh (OC's zombies floated
  by their own hip height); waist ratio per clip; no thigh weight above the hip or across
  legs; left and right parts the same size.
- **Materials.** Metalness 0 on flesh, cloth and stone; a roughness factor that leaves
  its map visible; alpha mode kept as authored (OC's import turned soft alpha into a hard
  cutoff).
- **Packed channels.** The compressed format keeps every channel the shader reads (a
  two-channel format dropped OC's metal); two-channel normals rebuild Z; the occlusion,
  roughness, metal order matches the shader (glTF puts occlusion in R, roughness in G,
  metal in B).
- **Normals.** The share of vertices whose normal opposes the face winding. OC's horde
  ran 7.7 to 25.8%.
- **Textures.** No image embedded twice, sizes within the role's cap, AO present on
  hero props.
- **Animation.** Clip count matches what the game plays; locomotion clips present.
- **Sockets.** Every socket the code reads exists in the file.
- **Repeatability.** Import output lands outside the source tree or is identical on
  every run, so a rebuild leaves the checkout clean.

In a three.js project, `gltf-transform` covers several of these from the command line:
`gltf-transform inspect` for a report, `gltf-transform dedup` for duplicate images and
accessors, and `gltf-transform resize` for texture caps.

## Spend log (OC)

One line per paid call, written before the call is made:

```json
{"t":"2026-10-15T09:12:00Z","provider":"meshy","stream":"art","job":"kit-arch-03","usd":0.60,"provider_total":71.74,"cap":80}
```

OC measured these unit costs. A Meshy textured job 30 credits ($0.60), a Meshy clip 3
credits ($0.06), fal images $0.057 to $0.108 each, ElevenLabs about 11 credits per second
of sound effect and $0.000183 per credit. Check the log before buying anything that may
already exist.
