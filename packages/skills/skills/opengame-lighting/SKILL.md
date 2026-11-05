---
name: opengame-lighting
description: Light a three.js browser game so it reads as a place. Covers characters that do not read as black silhouettes, counting light sources against the renderer's light limit, one shadow key that does not crawl, a fixed pool of real lights, real indirect light, and effects lit by the scene. Use when the person says the lighting is flat, characters look black, shadows flicker, the game stutters when lights turn on, it is too dark, add lamps or torches, or particles look pasted on.
metadata:
  version: "1.0.0"
---

# Lighting

Most flat-looking games have one problem: everything is lit by an ambient term, so
nothing is darker than anything else. The fix is a costed rig: one real shadow-casting
key, a weak fill, real indirect light, and a fixed number of point lights however many
lamps the level has.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes.

## Rules

### No character is a silhouette
- **Invariant:** Every character, creature and held item shows form and colour against every background it appears on, and none reads as a black silhouette.
- **Technique:** Light characters on purpose: an ambient or hemisphere term that reaches skinned materials, a rim from the side away from the key, and a fill so hands and faces keep detail in backlight. Confirm the character shader receives each term, because a fill that reads an empty input has no effect. Give the view model its own environment. In three.js add a `HemisphereLight`, a Fresnel rim through `onBeforeCompile` on the character's `MeshStandardMaterial`, and a PMREM environment on the view-model scene.
- **Reference configuration:** OC's first review found "black silhouettes with glowing balls stuck on them". The renderer gave skinned meshes no rim, fill or ambient, and the ambient term it did have read zero without a sky probe; fixing it took shader edits in 3 streams. The view model's studio environment gave 41% of the gun's brightness. OC keeps zombie flesh lighter than the floor (its albedo L was 17 against a target of 50 or more) and the boss at 2:1 contrast or better against its background (pit fog had cut it to 1.12:1).
- **Applies when:** Every 3D game with characters, dark scenes above all.
- **Verify:** Capture each character type in the darkest spot and the most backlit spot of each level, then sample face, hands and torso against the floor behind them.

### Count the light sources against the light limit on day one
- **Invariant:** Before anyone tunes the look, the team has counted the things that look like they emit light and measured the light limit the renderer applies, adaptive quality included.
- **Technique:** List every fire, lamp, screen and glow the concept implies and compare that count with the limit the renderer uses at runtime. Where sources outnumber lights, plan for it: bake static fire into lightmaps or probes, show the nearest sources through the pool below, and let emissive plus bloom carry the rest. Pin quality in captures so adaptive quality cannot drop lights unseen. In three.js `WebGLRenderer` shades every light for every lit fragment and recompiles when the light count changes, so route many sources through a pool.
- **Reference configuration:** OC's arena had 218 to 224 fire sites against a 32-light cap, and adaptive quality dropped captures to "8 of 224". The cap surfaced only after about 6 rejections on day one. 224 clustered lights measured about 0.2 ms, so raising the cap was cheap.
- **Applies when:** Any level lit by many practicals: fires, torches, neon, screens.
- **Verify:** Log the active light count each frame with quality pinned and unpinned. It matches the plan, and a walk past every fire shows no source going dark.

### One shadow-casting key that does not crawl
- **Invariant:** One directional light casts the world's shadows, its shadow box covers the play area around the player only, and shadow edges do not shimmer as the player walks.
- **Technique:** Follow the player with the shadow camera and snap its centre to the shadow map's texel grid. Tune depth bias and normal bias against acne and peter-panning on moving casters. Fade the shadow to nothing over the outer edge of the box rather than cutting it.
- **Reference configuration:** DK: a 34 m box biased forward of the player, texel-snapped, bias about -0.0003 to -0.00035, normal bias 0.05 to 0.10, the shadow ramped out over the outer 14% of the box, on a 2048 map. SR uses a 120 m box for its island.
- **Applies when:** Outdoor and large-interior 3D scenes with a sun or moon. A small interior lit only by practicals may use a local shadow instead.
- **Verify:** Record a slow walk along a wall edge: the shadow's stair-step outline stays still. Shrink the box on purpose and check the edge fades instead of cliff-cutting.

### Shadow is darker than light
- **Invariant:** Shadowed surfaces are clearly darker than lit ones of the same material, and the difference is warm against cool.
- **Technique:** Lower the fill before raising the key. Measure a lit surface and its shadowed neighbour in a linear capture, not by eye on a bright monitor.
- **Reference configuration:** Shadowed at 15 to 40% of lit across our games; the ST look pass targets 15 to 20%. MC: sun 3.5 at about 17 degrees elevation, hemisphere 0.18, ambient 0.34, environment 0.30. DK contrasts a cold moon (0xa8c0f0, 2.6) with warm sodium practicals (0xffb765, 5 cd, 22 m, decay 2).
- **Applies when:** Lit 3D looks. Stylised looks state their band count and ratio in the look bible instead.
- **Verify:** Sample the luminance of matched lit and shadowed pixels in a capture with the grade off and report the ratio.

### A fixed pool of real lights
- **Invariant:** The number of real point and spot lights never changes during play, so no shader recompiles mid-game, and a lit light never jumps to a new position.
- **Technique:** Create the pool once and leave it in the scene. Each frame, show the strongest authored sources through it, swap a source in only when it clearly outranks the weakest shown one, and hand a slot over on the frame its intensity is exactly zero. Never toggle `visible` on a light; set intensity to zero. [helpers/light-pool.js](helpers/light-pool.js) does this, and its `selfTest()` plants a shrinking pool, a ranked pool and a pool without fades to prove its checks.
- **Reference configuration:** DK shows about 68 authored lamps through a small pool: 4, 6 or 8 real lights by quality tier, 1.7 times hysteresis, 0.25 s fades. DK defines a lit-light teleport as a pooled light moving more than 0.25 m in a frame with non-zero intensity, excluding sources that really moved.
- **Applies when:** More authored lights than the budget allows real ones, which is almost every level with lamps.
- **Verify:** `renderer.info.programs.length` is unchanged after walking the whole level past every lamp, and the helper's `measurePool` reports zero count changes and zero lit teleports.

### Real indirect light
- **Invariant:** Light bounces: a sunlit floor warms the wall beside it and a dark corridor is darker than an open courtyard, from an actual bounce solution rather than a brighter ambient.
- **Technique:** Bake it. Per-vertex or lightmapped irradiance for static geometry, plus a grid of spherical-harmonic probes sampled by moving actors. three's `LightProbeGrid` (examples, WebGL only) bakes probe grids on the GPU; lightmaps can be baked offline. Hemisphere fill, environment maps and ambient occlusion are not global illumination, and calling them that is a false claim.
- **Reference configuration:** SR bakes single-bounce irradiance into a per-vertex atlas for static geometry and nine-coefficient SH probes for actors, validated against a signature of the world so a stale bake refuses to load. It is the only one of our four games with real indirect light, and its scenes hold up for it.
- **Applies when:** Any game that wants depth from light, most of all interiors and mixed indoor and outdoor spaces. A flat style chosen in the look bible may skip it.
- **Verify:** Isolate the indirect term in a debug view: it varies across the level and is darker in enclosed spaces. Keep the bake source and confirm the shipped data matches the shipped geometry.

### Emissive is not a light
- **Invariant:** Anything that looks like it lights its surroundings does light them, through a real light in the pool or a baked contribution.
- **Technique:** Pair each practical (lamp, screen, fire, sign) with a pooled source or a baked contribution. Flicker a practical on three detuned sines and drive its emissive from the same value so the bulb and the light agree.
- **Reference configuration:** DK's practicals (hanging lamps, wall lamps, fluorescents, emergency domes, fires) are driven per frame with their emissive following the light.
- **Applies when:** Any scene with visible light sources.
- **Verify:** Turn a practical's light off in a debug build: the surfaces near it change, not just the bulb.

### Nothing on the camera lights the world
- **Invariant:** No light attached to the camera or the player's view model reaches the world pass.
- **Technique:** Put view-model lights on the view model's own layer and pass. A camera-parented light moving at player speed defeats shadows, pools and every measurement of the rig.
- **Reference configuration:** DK's weapon rig carries a fill light parented to the camera on its own layer, a key 1.34 and a cool rim 0.44 for the weapon only; its pool measurements exclude that fill as a source that really moves. OC moved its fill lights near the hands away and lower and halved them, instead of dimming the scene. OC's third-person muzzle light is about 0.12 of the first-person one, 30 cm ahead of the gun.
- **Applies when:** First-person games and any game with a view model.
- **Verify:** List lights at runtime with their parent chain and layers; none under the camera is on the world layer.

### Environment for reflections
- **Invariant:** Reflective materials reflect something real: the sky, or a probe of the place.
- **Technique:** A PMREM of the sky in `scene.environment`, or a captured cube of the level, regenerated after a lost WebGL context. Where areas differ, give each its own environment, and set reflection strength per material class (`envMapIntensity` in three.js).
- **Reference configuration:** DK bakes its procedural sky into a 256 PMREM; SR captures a 128 cube. OC's titan chain links at metallic 0.7 mirrored the night sky and went black, and iron without a metal flag read as grey cloth.
- **Applies when:** PBR looks with any metal or gloss.
- **Verify:** Capture a metal surface while turning: its highlight and reflection move with the view and match the sky.

### Effects take the scene's light
- **Invariant:** Particles, smoke, blood, rain and other effects are lit by the place they are in, unless they emit light themselves.
- **Technique:** Turn effect lighting on explicitly, since many particle systems ship unlit, or feed the scene's ambient and nearest light colour into the effect shader. In three.js `SpriteMaterial` and `PointsMaterial` ignore lights: draw lit effects as instanced quads with `MeshLambertMaterial` or `MeshStandardMaterial`, or pass a light colour uniform sampled from a `LightProbe` or the light pool.
- **Reference configuration:** OC's particles were unlit by default, so its blood read "salmon pink" in 3 reports and was never fixed.
- **Applies when:** Any lit 3D look with particles. Emissive effects (sparks, muzzle flash, magic) stay unlit on purpose.
- **Verify:** Fire the same effect in a fire-lit spot and in shadow: its brightness and tint follow the location.

### One owner for exposure, one rig per screen
- **Invariant:** One person or agent owns exposure and light intensity, every change is made against the merged build, and each screen (arena, menu, results) has its own rig.
- **Technique:** Keep light rigs in a table per screen in the look bible. Make brightness changes relative to the current merged values, not on top of another stream's unmerged boost, and attach a capture to each change.
- **Reference configuration:** OC's arena boosts leaked onto menu figures and gave them a foil look. Two streams' brightening would have stacked to 2.55 times. A 300,000 rifle light caused the defect agents were chasing, and light powers were "a guess". Lightning is clamped and runs at 25% in cinematics.
- **Applies when:** Any game where several people or agents touch the look.
- **Verify:** Diff light values between merged main and each pending change; each screen's capture matches its rig table.
