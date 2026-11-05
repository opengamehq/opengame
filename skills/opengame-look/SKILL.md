---
name: opengame-look
description: Make a three.js browser game's image hold up. Covers linear HDR rendering with one tone curve, a sky inside the exposure, fog that leaves the sky alone, the concept's lens, bloom that keeps small glows small, an authored grade, honest materials, detail that does not tile or shimmer, and a look bible. Use when the person says it looks flat, washed out, plastic, like a prototype, too dark, too bright, the sky looks pale, the colours are off, or wants a cinematic or AAA look.
metadata:
  version: "1.0.0"
---

# The look

The image is decided by a handful of choices made once: where the tone curve lives, what
the grade is, which surfaces may bloom, and what materials are allowed to be. Make them
on purpose and write them down; most "it looks like a prototype" reports are one of
these left at a default.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes (DK, MC,
AW, SR, ST, OC).

## Rules

### Render linear, tone map once
- **Invariant:** The world renders in linear light with values above display white, and exactly one tone curve maps it to the screen.
- **Technique:** Render into a half-float target with the renderer's own tone mapping off, then apply exposure, the tone curve and the grade in one composite pass. Or keep three's tone mapping and add no post. Never both. Then trace the frame from the tone curve to the screen and remove any later pass with a shoulder of its own (a grade, vignette or "filmic" pass), because a second highlight roll-off strips colour from every bright area. In three.js, `renderer.toneMapping` applies when drawing to the canvas or in `OutputPass`; a custom pass after either may not compress highlights.
- **Reference configuration:** DK, MC and AW render into half-float targets with `NoToneMapping` and run AgX, exposure and the grade in one composite (AgX rolls highlights toward white instead of clipping to a hue). SR uses ACES at exposure 1.1 with no post. The ST starter uses ACES at about 0.8 for punch. OC applied a second strong highlight roll-off after ACES that also removed blue, and the concept's colour did not come back until it was taken out.
- **Applies when:** Any lit 3D look. Pixel art, 2D and unlit retro looks use no tone mapping at all, so their colours stay exact.
- **Verify:** Search the code for every place a tone curve is applied; there is one. Render a strip of grey and saturated patches from black to well above white through the full chain: each patch keeps its hue until it reaches white, and the strip shows one shoulder. A bright emissive rolls off smoothly in a capture instead of turning a flat hue.

### Write the look bible first
- **Invariant:** Before building the scene there is one short written spec of the look: palette, tone curve, grade per level, light rig, material rules and what may bloom.
- **Technique:** A page in the repository the build reads from, with one table of values per level or map. Every later change to the look edits the table, not scattered constants.
- **Reference configuration:** DK and MC keep the grade as one table per map; ST writes a look target from the selected concept views before production.
- **Applies when:** Every game with a rendered world.
- **Verify:** The values in the running game (read them from the renderer and post passes at runtime) match the spec.

### The sky is inside the exposure range
- **Invariant:** The sky's brightness falls inside the range the tone curve can show, so any change to the sky shows on screen.
- **Technique:** Read the sky's linear value before the tone curve at the horizon and overhead, and set its intensity against the key light and the exposure, not by eye on the final frame. Keep a false-colour exposure view in the debug build. Before anyone tunes sky variants, swap two very different ones and confirm the capture changes. In three.js scale a sky texture with `scene.backgroundIntensity` or the sky shader's output, and read a half-float target before `OutputPass`.
- **Reference configuration:** OC's sky was 5 to 10 times too bright for the exposure. It clipped into the top of the display curve, so every sky variant came out the same pale grey, and agents tuned variants that could not change through rounds r04 to r06. Measured on fixed crops later, OC's sky band read 56 to 67 against a target of 72 to 78.
- **Applies when:** Any game with a visible sky, skybox or painted backdrop.
- **Verify:** Capture one view with two different sky variants: the sky pixels differ. The false-colour view shows no clipped sky away from the sun or moon.

### Fog stops at the sky
- **Invariant:** Fog thickens geometry with distance; the sky dome and the far backdrop look as authored.
- **Technique:** Exempt sky and backdrop materials from fog, fog only the world geometry, and build atmosphere into the sky shader itself. Use height fog with gaps and banks rather than one flat veil. In three.js set `material.fog = false` on backdrop meshes; `scene.background` and a `ShaderMaterial` sky (such as the `Sky` addon) are not fogged unless they opt in.
- **Reference configuration:** OC's world fog covered its sky dome for about 3 hours before anyone exempted the sky. OC capped its fog sheets at 22% opacity so they never hid the subject.
- **Applies when:** Fogged scenes with a sky dome, skybox or backdrop geometry.
- **Verify:** Toggle fog in a debug build while looking at the horizon: the geometry changes and the sky does not.

### The lens matches the concept
- **Invariant:** The player camera's field of view matches the concept art and the genre's reference, recorded as a vertical angle, and every capture tool reads the value the game uses.
- **Technique:** Solve the camera from the concept (horizon height, subject size, camera height) and write its vertical field of view into the look bible. Convert a horizontal slider value with vertical = 2 atan(tan(horizontal / 2) / aspect). Capture scripts read the live camera, not a saved settings copy. In three.js `PerspectiveCamera.fov` is vertical, in degrees; call `updateProjectionMatrix()` after setting it. A first-person view model keeps its own lens (`opengame-weapons`).
- **Reference configuration:** OC's concepts show a first-person lens of 50 to 55 degrees vertical, and the build ran at 66. Later a capture read a stale settings copy and stayed at 66.5 degrees. OC's view model used its own 75 degree lens.
- **Applies when:** First- and third-person 3D games, and any game captured against concept art.
- **Verify:** Write the camera's vertical field of view into each capture's metadata and compare it with the look bible. Overlay a capture on its concept: the horizon and the subject's size line up.

### Small glows stay small
- **Invariant:** Thin or tiny emissive geometry (reticles, filaments, eyes, runes, cores) glows at its own size with no bloom rings, flowers or white suns.
- **Technique:** Cap emissive intensity per material class and clamp before bloom. Draw reticles and holographic sights in a shader or sprite that bloom does not see, and give tiny glows a minimum size on screen instead of more intensity. In three.js put them on a layer excluded from `UnrealBloomPass` (three's selective bloom example does this with `Layers`), or draw them after the bloom pass.
- **Reference configuration:** An OC holographic reticle was a 0.8 mm glowing torus, and bloom turned it into a 7-ring flower. Clipped emissive halos read as "four giant white suns". OC capped emissives near HDR 3 to 4, kept eye glows at 1.5 to 2 px or more, and cut its flat-white pixel share from 10.47% to 0.58%.
- **Applies when:** Lit looks with bloom and any small emissive detail.
- **Verify:** Capture each optic, eye and glowing detail at the nearest and farthest play distance, and count pixels above 0.95: the bright area is close to the detail's footprint.

### Find the broken channel before tuning colour
- **Invariant:** A surface that looks wrong is traced to its channel (normals, albedo, material flags, light or post) before anyone changes a colour or a light.
- **Technique:** Render the asset with normals only, then unlit albedo only, then lit with post off, and see which view shows the fault. In three.js swap in `MeshNormalMaterial`, then a `MeshBasicMaterial` with the albedo map.
- **Reference configuration:** OC tuned albedo, fill and fire tint on a "black horde" for 10 rounds before finding that 7.7 to 25.8% of zombie vertices had normals opposed to their faces. Titan faceting blamed on decimation came from shader derivative curvature. The importer's metalness default of 1.0 turned surfaces into mirror slabs.
- **Applies when:** Any asset that reads too dark, faceted, plastic or like foil.
- **Verify:** The channel view that showed the fault changes after the fix, and the lit capture follows.

### An authored grade per level
- **Invariant:** Each level has a grade chosen for it: exposure, contrast, saturation, lift and gain, with shadows and highlights pulled apart in temperature.
- **Technique:** Lift-gamma-gain in the composite, contrast on luma, values from the look bible's table. Warm highlights over cool shadows is the common thread; break it on purpose.
- **Reference configuration:** DK: exposure 2.45, saturation 1.10, contrast 1.075, lift (0.030, 0.040, 0.062), gain (1.045, 1.0, 0.955). MC Rust: contrast 1.18, lift (0.010, 0.018, 0.034), gain (1.10, 1.00, 0.84) as a highlight-only tilt, contrast on luma with a 0.055 toe.
- **Applies when:** Any game with more than flat colour. An ungraded style says so in its bible.
- **Verify:** Capture the same view with the grade off and on. Keep whichever reads play more clearly, and check threats, UI and team colours stay distinct.

### Bloom only where light is
- **Invariant:** Only emissive sources, specular glints and effects bloom. A lit wall never glows.
- **Technique:** Threshold bloom above display white in linear, with a soft knee and a clamp for fireflies, and author emissive and effect colours above one so they cross it.
- **Reference configuration:** Threshold about 1.0 to 1.15 linear (AW sets 95% of display white), soft knee 0.7, firefly clamp 24, strength 0.3 to 0.6. Authored emissive: sparks (3.2, 2.1, 0.9), muzzle core (5.0, 3.6, 1.9), fireball (6.0, 3.0, 0.9) (DK, MC).
- **Applies when:** Lit 3D looks with post. Stylised looks may skip bloom entirely.
- **Verify:** A capture of the brightest lit surface in the level shows no halo; a capture of a muzzle flash or lamp does.

### Fog is the horizon
- **Invariant:** Fog takes the sky's horizon colour, so distant geometry dissolves into the sky rather than into a grey or white haze.
- **Technique:** Derive the fog colour from the sky shader's horizon term in code, not as a second constant.
- **Reference configuration:** DK locks fog and horizon to one value. Fog density 0.003 to 0.03 by mood across our games; a white horizon is one of the cheap tells.
- **Applies when:** Any outdoor or large interior scene with fog.
- **Verify:** Capture a long sightline. The farthest geometry's colour converges on the sky behind it.

### Materials are honest
- **Invariant:** Metalness is fully metal or fully not, roughness never reaches the maximum, and every surface has some variation across it.
- **Technique:** Anything between metal and dielectric comes from a map. Pick roughness by material family. Base colour and emissive maps in sRGB, normal, roughness, metalness and occlusion maps linear.
- **Reference configuration:** Concrete 0.90 to 0.97, painted steel 0.35 to 0.55, gun steel 0.45 to 0.60, chrome trim 0.05 to 0.15. SR's plain props default to 0.78 instead of three's 1.0, and keep normal scale 0.35 to 0.6 with occlusion at 0.25 to 0.55.
- **Applies when:** PBR looks. Toon and flat styles follow their own banding rules.
- **Verify:** List every material at runtime with its metalness and roughness; none is at roughness one without a map, none has a fractional metalness without a map.

### Break the tiling
- **Invariant:** No texture repeat is visible at play distance.
- **Technique:** A world-space triplanar detail normal that fades with distance, plus very low frequency mottling of albedo and roughness. Normalise a detail texture by its mean luminance so it adds grain without darkening.
- **Reference configuration:** DK: detail normal at 2.6 tiles per metre, strength 0.55, faded from 3.5 to 13 m; macro mottling at about 18 m, albedo plus or minus 16%, roughness plus or minus 12%. Anisotropy 8 to 16 on ground and repeated detail.
- **Applies when:** Large textured surfaces: ground, walls, terrain.
- **Verify:** A wide capture of the largest surface from standing height shows no grid of repeats.

### Detail does not shimmer
- **Invariant:** Surfaces do not crawl with bright dashes or sparkle as the camera moves.
- **Technique:** Band-limit generated height fields (blur before deriving normals) so the mip chain has something to average, then fade normal detail where a pixel covers more relief than it can show, and widen roughness by a local average of normal variance.
- **Reference configuration:** DK: blurring prop height fields before the Sobel pass was the largest single win at a bridge doorway (32% off the oscillation). Raising specular antialiasing strength instead made it monotonically worse (3.43 to 5.24 at above 8/255), because the derivative of an aliasing normal is itself aliasing.
- **Applies when:** Any normal-mapped surface, generated textures above all.
- **Verify:** Record a slow pan at a grazing angle and difference consecutive frames; the flicker is measurable and should fall after the fix.

## Further reading

Post that reacts to sprint and damage, lens finish values, and the starter look's
defaults are in [references/post-and-lens.md](references/post-and-lens.md).
