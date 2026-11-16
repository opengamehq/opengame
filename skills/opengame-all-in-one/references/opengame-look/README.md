> Carried from `opengame-look` 1.1.0. Read it when: Make a three.js browser game's image hold up. Covers a reference turned into statements and numbers, global causes before per-map tuning, one tone curve, sky, fog and horizon in every weather, the lens, small glows, the grade, graded materials, materials before props, detail and foliage that do not crawl, near fire and painterly rendering. Use when the person says it looks flat, washed out, plastic, like a prototype, too dark, things shimmer, or wants a cinematic, painterly or AAA look.


# The look

The image is decided by a handful of choices made once: what the reference measures as,
where the tone curve lives, what the grade is, which surfaces may bloom, and what
materials are allowed to be. Make them on purpose and write them down; most "it looks
like a prototype" reports are one of these left at a default, and most "it looks worse
after the fix" reports are a fix judged on a still when the fault lives in motion.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes (DK, MC,
AW, SR, ST, OC, OS, LC, OH).

## Rules

### Turn the reference into written statements first
- **Invariant:** Before the scene is built, the look exists as short sentences a stranger can mark pass or fail on a capture (lens, exposure behaviour, light sources, palette, ground, hands, HUD) plus one table of values per level, and every later change to the look edits that page, not scattered constants.
- **Technique:** Pull a frame from the reference every few seconds into contact sheets, add a handful of hand-picked stills, and write what they show as sentences anyone can check ("with nothing lit the night is black, not dusk-blue"), never "make it look like the video". Keep the palette, tone curve, grade, light rig, material rules and what may bloom in one table per level that the build reads. Keep an inventory of every kind of visible thing marked placeholder, passable or final, and promote a row only with a capture beside the reference. [references/matching-a-reference.md](references/matching-a-reference.md) has the whole method.
- **Reference configuration:** LC cut its reference film at one frame every 5 s into 4 by 3 sheets of 640 by 360 tiles plus 6 to 8 stills, and wrote statements such as "a flash shows every face for one frame, the sensor recovers in ~0.5 s" and "rain only visible in the cone and the flash". The lens and exposure matched the film; the inventory still read 0 of 73 guns photoreal at the end, which is what an honest inventory is for. DK and MC keep the grade as one table per map; ST writes a look target from the selected concept views before production.
- **Applies when:** Every game with a rendered world, and every time the owner supplies a film, trailer, concept art or mood board.
- **Verify:** A reviewer who never read the code marks each statement on a fresh capture, and the values read from the renderer and post passes at runtime match the table.

### Measure the reference's layers before tuning any of them
- **Invariant:** Every layer of the target look (strokes, line, halftone, grain, lens, grade, light levels, colour ratios, motion timings) has a name, a technique and a number measured from the reference, and an adjective in a note is never read as a setting to turn up.
- **Technique:** Open the reference itself and measure it: box luminance at fixed places in stills of the same state as the frame you judge, channel ratios of key surfaces, stroke and dot sizes in pixels, the field of view, the share of the frame a held object takes. Write the numbers into the look page, build to them, and put reference and game side by side at the same size. When a note asks for "stronger" or "scarier", match the reference first, go past it only on the owner's word after they have seen the matched version, and write down where their word overrides the reference. Study a reference's method; never copy its code or art.
- **Reference configuration:** LC's tape effect: "a bit trippy and distorted" was read as a setting to turn up and rejected as "way too aggressive"; the matched version had grain 0.05 at 4 steps per 0.5 s, scan lines 1 px in 3 at alpha 0.035 and one 14vh band drifting up over 11 s. LC's darkness came from box readings of film stills (forest 0.009 to 0.020 of white, sky 57 to 80 of 255, lamp pool tops 111 to 124) before the owner's "make it scarier" overrode it. LC once ruled a resting pistol from the film's aiming frames, and the owner answered with a rest frame. OH: 5 to 15 strokes a face at 40 to 120 px on a 1600-wide frame, halftone of about 6 px only in shadow, 30 to 40% bare paper, a 104 degree lens. OS matched dirt by channel ratio: G/R and B/R 0.63/0.36 became 0.77/0.57 against the reference's 0.80/0.54.
- **Applies when:** Matching concept art, a reference film or a named game, and any effect asked for by adjective.
- **Verify:** A table with one row per layer, reference against game, each row measured on captures of the same state, and the side-by-side picture at the same size.

### Check the global causes before tuning any one map
- **Invariant:** Before anyone tunes one map's look, the whole game passes the global checks: every sun clears the terrain framing its play space, no surface is an accidental mirror, albedo sits in physical ranges, no texture overwrites another in the build, every level of detail uses the game's own shader, no opaque material is flagged cut-out, and no map inherits another screen's grade or light.
- **Technique:** Script each check and rerun it after every engine, importer or exporter upgrade: sun elevation against the ridge along its bearing; metalness and roughness as cooked; effective albedo (texture times tint) at player height; texture names shared across levels of detail; materials left on the default shader; alpha flags computed the way the cook computes them; each map's grade and light values read from the renderer's uniforms after a trip through the menus. Zoom in before relighting: a flat black surface is a binding fault until proven otherwise.
- **Reference configuration:** OS's "literally garbage graphics" (owner) sat on five global causes: suns 2 to 10 degrees below their own ridges (the owner's "no shadows"), 462 materials drawn as mirrors because an engine upgrade read smoothness as roughness, albedo of 0.01 to 0.06 (yard dirt 0.063 where real earth is 0.15 to 0.3), 167 of 730 textures overwritten by level-of-detail name clashes, and a 1.6 times pixel-ratio stretch. Any texel with alpha under 128 made a material cut-out, so 126 materials holed their shadows and lost contact occlusion. Every map ran the parent arena's storm grade (contrast 1.30, saturation 0.74), and 7 of 17 maps had no light preset of their own. 45 fill lights went onto rocks whose far levels of detail used the default shader.
- **Applies when:** Any lit 3D game with several maps or screens, after an engine or importer upgrade, or when every map reads flat or dark.
- **Verify:** Each script reports zero, and a shadow-only view of a backlit surface shows solid shadow.

### Render linear, tone map once
- **Invariant:** The world renders in linear light with values above display white, and exactly one tone curve maps it to the screen.
- **Technique:** Render into a half-float target with the renderer's own tone mapping off, then apply exposure, the tone curve and the grade in one composite pass. Or keep three's tone mapping and add no post. Never both. Then trace the frame from the tone curve to the screen and remove any later pass with a shoulder of its own (a grade, vignette or "filmic" pass), because a second highlight roll-off strips colour from every bright area. In three.js, `renderer.toneMapping` applies when drawing to the canvas or in `OutputPass`; a custom pass after either may not compress highlights.
- **Reference configuration:** DK, MC and AW render into half-float targets with `NoToneMapping` and run AgX, exposure and the grade in one composite (AgX rolls highlights toward white instead of clipping to a hue). LC does the same on WebGPU, AgX once in its last lens pass. SR uses ACES at exposure 1.1 with no post. The ST starter uses ACES at about 0.8 for punch. OC applied a second strong highlight roll-off after ACES that also removed blue, and the concept's colour did not come back until it was taken out.
- **Applies when:** Any lit 3D look. Pixel art, 2D and unlit retro looks use no tone mapping at all, so their colours stay exact.
- **Verify:** Search the code for every place a tone curve is applied; there is one. Render a strip of grey and saturated patches from black to well above white through the full chain: each patch keeps its hue until it reaches white, and the strip shows one shoulder.

### The sky is inside the exposure range
- **Invariant:** The sky's brightness falls inside the range the tone curve can show, so any change to the sky shows on screen.
- **Technique:** Read the sky's linear value before the tone curve at the horizon and overhead, and set its intensity against the key light and the exposure, not by eye on the final frame. Keep a false-colour exposure view in the debug build. Before anyone tunes sky variants, swap two very different ones and confirm the capture changes. In three.js scale a sky texture with `scene.backgroundIntensity` or the sky shader's output, and read a half-float target before `OutputPass`.
- **Reference configuration:** OC's sky was 5 to 10 times too bright for the exposure. It clipped into the top of the display curve, so every sky variant came out the same pale grey, and agents tuned variants that could not change through rounds r04 to r06. OS holds the sky at 1.25 to 1.6 times a sunlit white wall; a 4 times horizon clipped (`opengame-lighting`).
- **Applies when:** Any game with a visible sky, skybox or painted backdrop.
- **Verify:** Capture one view with two different sky variants: the sky pixels differ. The false-colour view shows no clipped sky away from the sun or moon.

### Fog stops at the sky
- **Invariant:** Fog thickens geometry with distance; the sky dome and the far backdrop look as authored.
- **Technique:** Exempt sky and backdrop materials from fog, fog only the world geometry, and build atmosphere into the sky shader itself. Use height fog with gaps and banks rather than one flat veil. In three.js set `material.fog = false` on backdrop meshes; `scene.background` and a `ShaderMaterial` sky (such as the `Sky` addon) are not fogged unless they opt in.
- **Reference configuration:** OC's world fog covered its sky dome for about 3 hours before anyone exempted the sky. OC capped its fog sheets at 22% opacity so they never hid the subject.
- **Applies when:** Fogged scenes with a sky dome, skybox or backdrop geometry.
- **Verify:** Toggle fog in a debug build while looking at the horizon: the geometry changes and the sky does not.

### Fog is the horizon
- **Invariant:** Fog takes the sky's horizon colour, so distant geometry dissolves into the sky rather than into a grey or white haze.
- **Technique:** Derive the fog colour from the sky shader's horizon term in code, not as a second constant, and cap its density per weather so it never washes a play space white.
- **Reference configuration:** DK locks fog and horizon to one value. Fog density 0.003 to 0.03 by mood across our earlier games; a white horizon is one of the cheap tells. OS caps haze at 0.0012 per m starting at 60 m and sky haze at 0.3.
- **Applies when:** Any outdoor or large interior scene with fog.
- **Verify:** Capture a long sightline. The farthest geometry's colour converges on the sky behind it.

### The horizon is whole and steady, in every weather
- **Invariant:** The far plane reaches everything drawn, distance haze never shimmers, and every map in every weather keeps interiors dry, lanes readable and frames neither washed out nor crushed, from every camera the game uses.
- **Technique:** Set each map's far plane from its drawn reach, backdrops included. Apply haze inside materials from world position, never as a post pass that reads jittered depth after the temporal resolve. Decide rain per place, never per player: cast a cover grid at load so a roofed room never shows rain or a wet floor, and keep streaks straight under every camera, cinematic ones included. Run the defect and exposure sweeps in every weather preset, because clear-weather captures hide these.
- **Reference configuration:** OS: a 400 m far plane cut backdrops reaching 2.5 to 5 km, the owner's "beige outline of map below the cloudes", after three rounds chased occlusion, sun and upscaling. Haze moved into materials took a horizon from 1,693 spike pixels to 0. Haze caps cut a desert's washed-out frames from 50 to 91% to 2.5%. "if its raining and i go under a roof the whole map stops raining? ... thats not realistic" (owner). A six-preset sweep found 303 more defects, including rain in roofed rooms on six maps. Rain fanned out under a high spawn-cinematic lens while play looked fine. The matchmaking screen's "very wird looking exposure" came back three times in 20 hours, from haze painted over the page's still image and a rain grid masking haze, and the judges never saw it because their captures forced clear weather.
- **Applies when:** Large maps with backdrops, temporal anti-aliasing with haze, and any game with weather or lighting variants.
- **Verify:** Locked horizon captures with haze on and off, and every map's pre-match screen and first seconds of play in every weather with luma numbers (`opengame-lighting`).

### The lens matches the concept
- **Invariant:** The player camera's field of view matches the concept art and the genre's reference, recorded as a vertical angle, and every capture tool reads the value the game uses.
- **Technique:** Solve the camera from the concept (horizon height, subject size, camera height) and write its vertical field of view into the look page. Convert a horizontal slider value with vertical = 2 atan(tan(horizontal / 2) / aspect). Capture scripts read the live camera, not a saved settings copy. In three.js `PerspectiveCamera.fov` is vertical, in degrees; call `updateProjectionMatrix()` after setting it. A first-person view model keeps its own lens (`opengame-weapons`). A lens that distorts (barrel, a painted world's bend) is applied in one place, and the HUD anchors to the distorted position.
- **Reference configuration:** OC's concepts show a first-person lens of 50 to 55 degrees vertical, and the build ran at 66; later a capture read a stale settings copy and stayed at 66.5. OC's view model used its own 75 degree lens. LC's body camera: a 100 degree setting with barrel 0.36 and overscan 1.28 gives about 81 degrees vertical, and its plain camera projection put HUD marks 0.5 m off at 5 m until they read the post-lens position. OH bends a 104 degree lens in the vertex shader.
- **Applies when:** First- and third-person 3D games, and any game captured against concept art.
- **Verify:** Write the camera's vertical field of view into each capture's metadata and compare it with the look page. Overlay a capture on its concept: the horizon and the subject's size line up.

### Small glows stay small
- **Invariant:** Thin or tiny emissive geometry (reticles, filaments, eyes, runes, cores) glows at its own size with no bloom rings, flowers or white suns.
- **Technique:** Cap emissive intensity per material class and clamp before bloom. Draw reticles and holographic sights in a shader or sprite that bloom does not see, and give tiny glows a minimum size on screen instead of more intensity. In three.js put them on a layer excluded from `UnrealBloomPass` (three's selective bloom example does this with `Layers`), or draw them after the bloom pass.
- **Reference configuration:** An OC holographic reticle was a 0.8 mm glowing torus, and bloom turned it into a 7-ring flower. Clipped emissive halos read as "four giant white suns". OC capped emissives near HDR 3 to 4, kept eye glows at 1.5 to 2 px or more, and cut its flat-white pixel share from 10.47% to 0.58%. LC draws far guide lights as 2.5 px hard points: "a hard point's size does not bring a far light back; its level does".
- **Applies when:** Lit looks with bloom and any small emissive detail.
- **Verify:** Capture each optic, eye and glowing detail at the nearest and farthest play distance, and count pixels above 0.95: the bright area is close to the detail's footprint.

### Find the broken channel before tuning colour
- **Invariant:** A surface that looks wrong is traced to its channel (normals, albedo, material flags, light or post) and to the object that draws it before anyone changes a colour or a light.
- **Technique:** Render the asset with normals only, then unlit albedo only, then lit with post off, and see which view shows the fault. In three.js swap in `MeshNormalMaterial`, then a `MeshBasicMaterial` with the albedo map. When the owner of a fault is unsure, hide one thing at a time on a frozen frame (groups, then meshes, then material terms and lights) by moving it to a hidden layer rather than setting `visible`, which other code writes back; prove the hide on one frame first, and ask "drawn and unlit?" before "missing?".
- **Reference configuration:** OC tuned albedo, fill and fire tint on a "black horde" for 10 rounds before finding that 7.7 to 25.8% of zombie vertices had normals opposed to their faces; the importer's metalness default of 1.0 turned surfaces into mirror slabs. LC's shoulder "hole", mended three times as a hole, was drawn and unlit cloth; hiding found a fault's owner in 2 short jobs where guessing had taken 4 jobs and 9 trials.
- **Applies when:** Any asset that reads too dark, faceted, plastic or like foil, and any visual fault whose cause is not certain.
- **Verify:** The channel view or the hide that showed the fault changes after the fix, and the lit capture follows. The report carries the frames with and without the hidden thing.

### An authored grade per level
- **Invariant:** Each level has a grade chosen for it: exposure, contrast, saturation, lift and gain, with shadows and highlights pulled apart in temperature.
- **Technique:** Lift-gamma-gain in the composite, contrast on luma, values from the look page's table, starting each level from neutral rather than from another level's or a parent game's grade. Warm highlights over cool shadows is the common thread; break it on purpose.
- **Reference configuration:** DK: exposure 2.45, saturation 1.10, contrast 1.075, lift (0.030, 0.040, 0.062), gain (1.045, 1.0, 0.955). MC Rust: contrast 1.18, lift (0.010, 0.018, 0.034), gain (1.10, 1.00, 0.84) as a highlight-only tilt, contrast on luma with a 0.055 toe. OS's inherited storm grade, with negative lift, crushed every shadow until each map got its own. LC gives the dark the reference's snow hue, because "a small sensor has no colour in the dark".
- **Applies when:** Any game with more than flat colour. An ungraded style says so in its look page.
- **Verify:** Capture the same view with the grade off and on. Keep whichever reads play more clearly, and check threats, UI and team colours stay distinct.

### Bloom only where light is
- **Invariant:** Only emissive sources, specular glints and effects bloom. A lit wall never glows.
- **Technique:** Threshold bloom above display white in linear, with a soft knee and a clamp for fireflies, and author emissive and effect colours above one so they cross it.
- **Reference configuration:** Threshold about 1.0 to 1.15 linear (AW sets 95% of display white), soft knee 0.7, firefly clamp 24, strength 0.3 to 0.6. Authored emissive: sparks (3.2, 2.1, 0.9), muzzle core (5.0, 3.6, 1.9), fireball (6.0, 3.0, 0.9) (DK, MC). LC's body camera is the deliberate exception: five summed mip levels with no threshold ("a lens has none"), glow capped at 3 whites, streaks only over white, all written in its look page.
- **Applies when:** Lit 3D looks with post. Stylised looks may skip bloom entirely, and a recorder or lens look that blooms everything states so and caps the glow instead.
- **Verify:** A capture of the brightest lit surface in the level shows no halo; a capture of a muzzle flash or lamp does.

### Materials are honest
- **Invariant:** Bare metal is metal and everything else is dielectric, any value between is a deliberate entry in the look page or comes from a map, roughness never reaches the maximum, every surface varies across it, and no generated material map goes into the game ungraded.
- **Technique:** Pick roughness by material family. Base colour and emissive maps in sRGB; normal, roughness, metalness and occlusion maps linear. Grade every generated map before use, since they arrive glossy and fully metal. A paint, lacquer or parkerised coat over steel reads as coated metal with low metalness and the form put into its colour. Give painted panels a roughness floor so they do not mirror the sky.
- **Reference configuration:** Concrete 0.90 to 0.97, painted steel 0.35 to 0.55, gun steel 0.45 to 0.60, chrome trim 0.05 to 0.15. SR's plain props default to 0.78 instead of three's 1.0, with normal scale 0.35 to 0.6 and occlusion at 0.25 to 0.55. LC's generated weapons arrived near roughness 0.35, fully metal, and read as "wet tar and orange"; graded to steel at 0.55 to 0.67 with metal only on bare wear and normal tilt halved. Under a flat fill a coat at metalness 0.9 was "a black cut-out", so LC's coats sit at 0.1 to 0.3, which is why this rule allows a written in-between value. OS's painted panels at roughness 0.28 to 0.32 mirrored the sky probe as blotches until 0.5 to 0.55.
- **Applies when:** PBR looks, and every game using generated textures. Toon and flat styles follow their own banding rules.
- **Verify:** List every material at runtime with its metalness and roughness: none is at roughness one without a map, and every in-between metalness is either mapped or listed in the look page.

### Dark surfaces get dark through sheen and light, never through albedo
- **Invariant:** A dark material reads dark at every distance the camera reaches while its albedo stays above the floor for its family, and no albedo is ever lowered to answer a hot spot under auto-exposure.
- **Technique:** For matte black and char, lower the specular response (F0 and F90) or use a coloured metal, since a dielectric reflects a fixed few percent of a lamp whatever its colour. Hold albedo floors per surface family, measured at player height. When a surface burns out under a near light, change the light, its falloff or the exposure ceiling, not the texture.
- **Reference configuration:** LC: a dielectric reflects about 4% of a lamp untinted, ten times a 0.004 char albedo, so three leads tuned albedo from 0.03 to 0.002 and nothing changed; char needed F0 and F90 times 0.12. LC's first minute became "a clay model" after surfaces were darkened step by step to 2 to 3% albedo, each step answering a board that burnt out under the torch while the sensor reopened; fixed with gain 2.6, a roughness floor of 0.6 and sheen 0.12 (wood 5 to 8%, cloth about 10%). OS measured asphalt at 2% and lawn at 0.03, then set floors of 0.08 for day surfaces, 0.13 for up-facing ground and 0.07 for grass, and made dark "metals" dielectric.
- **Applies when:** Every PBR game with dark materials, near lights or auto-exposure.
- **Verify:** Sweep the material's luminance at three distances under the game's own light (LC used 0.7, 1.3 and 2.5 m), sweeping albedo and sheen separately: it holds its band at all three with albedo above the floor.

### Materials before props, in one detail language
- **Invariant:** Every hero surface holds up at 1:1 from standing distance with no visible repeat and real normal and roughness, and cliffs, rock, architecture, foliage and backdrop share one scale of finish, before any dressing pass is judged.
- **Technique:** Per-map material sets with a macro-variation layer, a detail layer and several variants per wall. Keep tiles non-directional: soot runs, strata and tracks go in vertex colour, decals or broad noise. Match the scale of detail to the object's scale. Then dress densely, inside the keep-outs (`opengame-maps`). When adding props stops moving the score, the bottleneck is the materials.
- **Reference configuration:** OS: judges' sub-scores correlated with the overall visual at 0.96 for materials, 0.86 for dressing, 0.79 for lighting and 0.45 for foliage and terrain. Roof clutter, banners and 48 decals moved one map down with all three judges: "More props didn't move the needle. All three judges name the same bottleneck: MATERIALS." Once materials held, dressing paid (47 to 131 props, plus 1.4 and 1.0 in paired judging). One map drew "fine masonry applied to monumental blocks"; soot in a 4 m tile became "vertical stripes". Early on, lighting was the cheapest first lift.
- **Applies when:** A visual score plateaus, or before any environment dressing pass.
- **Verify:** A 1:1 crop sheet of every hero material at 1080p from 2 m with its repeat period marked, and grazing frames at two and four times the tile size showing no grid.

### Break the tiling
- **Invariant:** No texture repeat is visible at play distance.
- **Technique:** A world-space triplanar detail normal that fades with distance, plus very low frequency mottling of albedo and roughness; normalise a detail texture by its mean luminance so it adds grain without darkening. Layer repeat lengths that are not multiples of each other, add a second read rotated and larger, offset UVs per box or plank, never mirror a photographic read (it flips the light baked into it), and swap rather than re-tile a scan with a memorable motif.
- **Reference configuration:** DK: detail normal at 2.6 tiles per metre, strength 0.55, faded from 3.5 to 13 m; macro mottling at about 18 m, albedo plus or minus 16%, roughness plus or minus 12%; anisotropy 8 to 16. OS: repeat lengths 5.0 and 4.3 m, dirt had repeated every 18 m, and anti-tile weights pinned to 0 and 1 at step ends took 5,843 spike pixels to 0. LC: every board of a wall was the same strip of one plank until each box got its own offset and a second sample 4 times larger and rotated.
- **Applies when:** Large textured surfaces: ground, walls, terrain.
- **Verify:** A wide capture of the largest surface from standing height shows no grid of repeats.

### Detail does not shimmer
- **Invariant:** Surfaces do not crawl with bright dashes or sparkle as the camera moves.
- **Technique:** First tell aliasing from a depth tie: if the crawl vanishes with temporal anti-aliasing off it is aliasing, and if stepping the near plane re-rolls it it is a tie (`opengame-scene-audit` films both). Band-limit generated height fields (blur before deriving normals) so the mip chain has something to average, fade normal detail and noise where a pixel covers more relief than it can show (screen derivatives), keep normals from facing away from the viewer, and widen roughness by a local average of normal variance.
- **Reference configuration:** DK: blurring prop height fields before the Sobel pass was the largest single win at a bridge doorway (32% off the oscillation); raising specular antialiasing strength made it monotonically worse (3.43 to 5.24 at above 8/255). LC's reported "zfightin" was snow-edge noise ("a 2 cm crest is four pixels by one"), normal relief under a lamp at the lens and ground relief, "nine guesses before that were wrong"; fading relief between 2 and 7 cm of ground per pixel took flips from 1.64 to 0.00 per 1000 pixels walking.
- **Applies when:** Any normal-mapped surface, generated textures, snow and fine relief above all.
- **Verify:** Film a slow pan at a grazing angle on a stepped clock and difference consecutive frames; the flicker count falls after the fix.

### Thin detail is filtered at the source, never widened or dithered
- **Invariant:** No wire, railing, slat, shingle, grate or card is thinner than about a pixel at the distance it is seen without a far substitute, so nothing crawls under temporal anti-aliasing even when no faces tie.
- **Technique:** Flatten stepped detail into one plane with the rows in albedo past near range; chamfer thin members; thicken far wires; draw fences as one box-filtered quad that settles to mean coverage; fade periodic relief with distance; sample cut-out alpha a mip or two coarser at range. Do not widen opaque geometry in a shader or dither a level-of-detail swap in screen space: both make it worse.
- **Reference configuration:** OS: 14 mm shingle risers went "under half a pixel past about 25 m"; flattening took a spot from 970 spike pixels to 0 with fewer triangles. Far wires from 1.5 to 8 cm cut flicker 74 to 79%; louvre ribs from 6 to 15 cm took a spot from 11,133 to 7; coarser alpha mips cut 32 to 37%. Opaque widening to 1.25 px made strafes 48% worse, a screen-space dither drew a "crawling dot net", and shader-wide fixes were reverted twice. The owner rejects dither and ghosting.
- **Applies when:** Temporal-AA renderers with long sightlines, scopes, industrial kits or alpha-tested plants.
- **Verify:** The same stepped motion path before and after, with a kill switch, plus a close still showing the surface still reads.

### Foliage keeps its form under motion, zoom and every quality tier
- **Invariant:** Vegetation never pops, slides, darkens at range or thins as the player moves, aims through a scope or drops quality, and plants that hide players or block sightlines keep their silhouette on every tier.
- **Technique:** Pick level of detail from straight-line distance at the unzoomed field of view, scaled while zoomed by min(1, tan(fov/2) / tan(hip/2)). Seed each instance's fade distance in world space. Make lower levels exact subsets of the top level's cards, and cull at range rather than draw a dark far version. Keep the distances of cover plants the same on every tier, and save cost with impostors, opaque cores and occluders, not thinning. Bleed leaf colour into the transparent texels so cards have no dark fringe. Ground every plant on its drawn base (`opengame-scene-audit`).
- **Reference configuration:** OS: "these patches of grass ... as u get closer they move way too much and look very srange ... like they keep flickering" (owner). Tufts had hard-swapped at 5 to 8 m and spruces at 12 to 22 m, and patches faded as the scope closed; after the fix GPU went from 9.3 to 4.3 ms on one map and held-frame flicker from 0.28% to 0.11%. "remove all these patches of whatever these black grass things are that turn green when u go closer" (owner), who also hates flat cut-out cards. The low tier turned tree crowns to sticks and let weak machines see through cover. Forest cost fell from 3.18 to 0.72 ms without thinning ("Thinning instances buys nothing" when a draw is a species and a level of detail). LC's firs: a 1,500-triangle trunk, branch slices within 15 m, crossed impostors beyond.
- **Applies when:** Alpha-tested vegetation, above all with scopes or automatic quality.
- **Verify:** Walk-toward clips before and after; a zoom sweep on one patch (OS used fields of view 70, 30, 15 and 8); one camera at the top and the lowest tier showing the same cover.

### Near fire is light, not paint
- **Invariant:** Fire, smoke and similar effects seen near the camera show no card edges, no flat fills and no column seen end-on, stay inside the frame budget, and a stream leaves the nozzle on every frame the trigger is held.
- **Technique:** Cost any live simulation first; if it does not fit, bake it offline to a flipbook and check its orientation offline. Draw it additive in HDR (white-yellow core, orange, deep red edges), faded against depth, as many small tongues rather than a few big cards, with nothing right at the eye; a stream as a tapered tube or velocity-aligned cards; flames on a burning figure's bones; smoke lit from below; the fire's light from the fixed lamp budget. Cap exposure and bloom near it, and let gameplay wait for the visual. Judge it from the player's own view at their quality tier, never from its side.
- **Reference configuration:** LC's live volumetric library ran 60.2 fps idle, 20.0 with eight alight and 3.8 with the stream; baked, 60 fps with twelve alight in a 264 KB flipbook. Camera-facing cards seen end-on became "the column on the man", the bake drew upside down for five leads, and the rain veil stippled flames that write no depth. It was made default because it was "still better than the old pale ball", judged from its side, and the owner then said "the falemthrower vfx/visuals literally looks so bad", the fourth note in 27 hours. LC caps a sprite at about an eighth of the frame and keeps flame 0.6 m from the eye.
- **Applies when:** Flamethrowers, fires, explosions, smoke and magic near the camera.
- **Verify:** Frames from the player's own view at their tier and window beside the owner's screenshot, and frame time with a dozen emitters live.

### Paint a painterly world in the painting's own space
- **Invariant:** In a painterly look, strokes live on 2D sheets laid out the way a painting is ("the edge of a house is the edge of its strokes"), not on the faces of 3D blocks, and each place has its own palette, signature landmark and props rather than a recolour.
- **Technique:** Lay each place's sheets in the passes a painter uses (sketch, wash, masses, touches, details), bake them over several frames with an instanced stroke engine, and cast them back through the lens in one pass, with props and figures on top. Keep a style-to-place table with a colour scheme per place and a signature in the upper third of the frame. When a polish pass gains little, change the method instead of repainting. [references/painterly.md](references/painterly.md) has OH's method.
- **Reference configuration:** OH: seven repaint passes that painted 3D blocks gained under 0.2 judge points each, about 12.7 hours; the "one long painting" rebuild, from method videos the owner supplied, gained 0.54 in one pass. Six sheets a place, 76 MB (half on Low), at most 900 strokes baked a frame, five reads a pixel. 16 places for 17 styles with the signature at 15% or more of the frame's height; the canyon read only at 9,300 strokes.
- **Applies when:** Painterly or illustrated worlds, and any stylised look whose passes have stopped paying.
- **Verify:** Stroke counts per sheet, a 1:1 still beside the reference, and a contact sheet of every place at play framing.

### Fewer, bigger strokes, and paint holds still
- **Invariant:** Each face is a solid mass of value with a few large strokes over it, no stroke boils or crawls, and consecutive frames differ only by eased motion.
- **Technique:** Size strokes, ink weight and halftone in screen pixels; fix every stroke's seed; put paper tooth in object space; step effect layers on threes rather than every frame; keep halftone to the core shadow; land background changes on bar boundaries, eased, never as per-beat shake.
- **Reference configuration:** OH: 480 to 713 large strokes a venue read as structure where 1,704 small ones read flat and 11,979 thin ones read "hairy"; figures went from 685 to 238 strokes; boil is off by default. "the background is hsaking so much and not looking aaa at all and just looks like slop ... so mcuh jitter ... everything neds to show super smooth" (owner); judges had been recommending a decaying 6 px shake until the owner's rule reached their rubric.
- **Applies when:** Any stylised renderer, and any "jitter" note on a still scene.
- **Verify:** Frame-difference statistics on a background crop, and a 12-frame strip.

## Further reading

Post that reacts to sprint and damage, lens finish values, the starter look's defaults
and the look pass are in [references/post-and-lens.md](references/post-and-lens.md).
