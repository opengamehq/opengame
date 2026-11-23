> Carried from `opengame-brush-stroke-shader-style` 1.0.2. Read it when: Make a game look and play as if it were painted by hand, in any engine. Covers a colour scheme per level, roles that keep the player, enemies and pickups readable, brush strokes that sit on surfaces and stay there, stepped values with coloured shade, an ink line, halftone, bare paper, a lettered HUD, and drawn feedback such as rush lines and hit frames. Use when the person asks for a painterly, brush stroke, hand painted, gouache, comic or ink look, or wants an existing game restyled.


# Brush stroke style

A game in this style looks as if somebody painted it and plays as if they are still
painting: flat confident colour on cream paper, strokes you can count, a dark line round
whatever matters, shade that is a colour, a HUD lettered on torn tape, and speed and
impact drawn on the frame. The references are Max Vedel's Paris Freestyle and Brush
Rush. Study how they are built; copy none of their code or art.

It is not a filter. The style is built into the game: what surfaces are painted with,
how figures are drawn, what the HUD is lettered in, what the frame does when the player
does something. A stranger must play the restyled game at least as well as the
original, and must see at a glance that it is painted. Both are measured (rule 16), in
any engine, 2D or 3D, first or third person, any genre.

Rules carry five tags; `opengame-quality-bar` explains them and the codes OH (OG Hero)
and OS (OG Snipers). Two more are used here: KW is Karen Warfare, a first-person team
shooter in a bright mall, and SF is Scrapfall, mechs fighting round a ring space station,
both three.js WebGL2 games restyled with this skill, and DA is Dragon Aces, a three.js
dragon dogfight over a citadel. OS was restyled inside its own C and WebAssembly engine's
final shader. "The street" is the skill's own test scene.

## The order of work

1. List what the player must read to play (rule 2).
2. Write the scheme for each level (rule 3).
3. Give everything a role (rule 4).
4. Wire the stroke pass in before the HUD ([references/engines.md](references/engines.md)) and quiet the game's own effects that fight it.
5. Tune each level beside the references, on one repeatable still, one change at a time, starting from the defaults (they are already the middle ground: painted at a glance, steady to play).
6. Letter the HUD and draw the play.
7. Capture the same real play before and after, and a three-second still-camera pair; run `helpers/brush-check.mjs` on both (rule 16), then look at your own captures.

`helpers/brush-core.js` is the stroke pass with no engine in it, `helpers/brush-three.js`
wires it into three.js, `helpers/brush-looks.js` holds whole looks and
`helpers/brush-hud.js` is the lettered HUD. `helpers/brush-check.mjs` measures any
engine's before and after captures against the gates in
[references/values.md](references/values.md) ("Checks").
[references/method.md](references/method.md) says how the pass works and
[references/values.md](references/values.md) lists every value.

## Rules

### The style is built into the game, never laid over the frame
- **Invariant:** The stroke pass knows what each pixel is (the world, a moving figure, something the player must find, the sky) and runs before the HUD is drawn. It never runs on a finished frame it knows nothing about.
- **Technique:** Give the pass the game's own knowledge: a position that moves with each surface, a role for each object and the camera, as [references/engines.md](references/engines.md) sets out for each engine. Draw the HUD afterwards in the same hand. A build you have no source for cannot be restyled; say so instead of putting a canvas over it.
- **Reference configuration:** The first version of this skill painted over a compiled OS build through a canvas on top, following the picture by optical flow. The owner rejected it on sight: "its not just a visual filter its about how the whole game plays and looks" and "totally unplayable and unreadable thats not the point". The HUD was smeared, enemies sank into the ground, and strokes turned to swirling mush within two seconds. OH lost seven passes the same way before it changed method.
- **Applies when:** Every use of this style, in any engine.
- **Verify:** Capture a frame with the HUD on: every HUD glyph is as sharp as before. Hide an enemy's role and compare: with the role it is the first thing seen, without it it is part of the wall.

### List what the player must read before laying a stroke
- **Invariant:** Everything the player needs to see to play is at least as easy to find in the restyle as in the original, at its hardest: far, in shade, against its worst background, moving.
- **Technique:** Write the list first: the player's own character or weapon, enemies, projectiles, pickups, objectives, hazards, the crosshair, each HUD number, and what each must not be confused with. Capture each one at its hardest in both versions, side by side. Measure where you can: contrast between the thing and what is behind it, its size on screen, the contrast of HUD text. Then shrink a capture to thumbnail size: the big shapes and the hero must still read.
- **Reference configuration:** KW measured each case before and after. An enemy at 20 m in the sun went from a contrast of 1.61 with what was behind her to 2.77, and at 30 m from 1.91 to 3.03. The same check caught a failure nobody had seen: blush piers put the player's own pink team in front of pink walls, and a friend's colour difference from her background fell from 23.7 to 14.1, so the piers were repainted apricot and the first master take was shot again. OH's judges advised away its avatars' identity for most of a day before the owner asked where they had gone.
- **Applies when:** Any game with something to find, hit, dodge or collect. A toy with no goal still lists its HUD.
- **Verify:** A reviewer who has not seen the game is shown the hardest capture of each item for a second and names it. Every number from the original is matched or beaten.

### Write a scheme for each level
- **Invariant:** Each level has one written scheme: paper, ink, a shade colour, the warmth of the light, where shade begins, and one accent kept for things the player acts on. The game's own colours are kept and pushed cleaner and brighter, not replaced.
- **Technique:** Set the scheme by looking at the level's own lit frame. Where a level is one colour, give its big shapes local colours on the game's own materials first (walls, columns, floor, doors), taken from colours the game already has: no setting of the stroke pass makes one beige into a painting. Then decide where shade begins so the level splits into two clear families of plane, lit and shade. Shade takes the shade colour and keeps a floor, so it is never black; lean the shade colour away from whatever the enemies wear. Keep the values in one table the build reads, a row per lighting state, blended as the player moves between them.
- **Reference configuration:** KW is a cream mall and at the defaults was pale beige on pale beige. Its turning point was local colour on its own materials: apricot piers, mint shutters, an aqua back of house, a floor just above white. Its scheme has five rows by lighting state, with shade beginning at 0.44 of value in the atrium and 0.5 in the back corridors, blended over 0.9 seconds; the shade colour is a red violet (0.52, 0.36, 0.85) with a floor of 0.32, because the enemies wear blue. With shade starting at 0.62 the whole frame went violet. OH keeps a scheme per place: three values, accents and its largest colour mass.
- **Applies when:** Every level, map, biome or time of day that changes the light.
- **Verify:** The values in the running game match the table. A capture of each level has both families of plane, and its darkest area is a colour.

### Everything has a role
- **Invariant:** Level geometry takes the strokes. Things that move or bend carry their strokes with them and keep more of their own detail. Things the player must find stay almost wholly clean, keep their own colours and carry the heaviest line.
- **Technique:** Tag objects world, figure, hero, keep or skip. A figure's strokes are placed in its rest pose so they ride on it as it runs. Heroes are exempt from the scheme's shade colour and can be ringed in paper. Kept things (a reticle, lettering, a screen) are drawn exactly as the game drew them. Smoke, sparks, glass and decals are skipped, so they are painted as part of what is behind them. A role that is said always decides: the defaults drop alpha-cut foliage and sights.
- **Reference configuration:** The defaults keep 45% of a figure's own detail and 80% of a hero's; a figure takes 60% of the shade colour and a hero 15%. KW: enemies hero with all their own detail and a paper ring about 9 pixels wide, friends figure (the ring is the tell between them), the weapon a second anchor layer, shop signs and the sight's reticle and window kept, corpses figure and then skipped as they dissolve. Making furniture and fittings figures (benches, planters, chairs, pipes) was the biggest single gain after local colour: as world they were white blobs. An enemy at 20 m is 15 pixels wide, and with a heavy line she was all line, so the line was thinned and the ring widened. SF's mechs vanished from the anchors when the game moved them to an effects layer to fade them; its tracers, casings and jet plumes were on that layer too and were painted away as background until they were given roles.
- **Applies when:** Any game with characters, vehicles, a held weapon or pickups.
- **Verify:** Step a walking character frame by frame: its strokes move with its limbs and do not slide across it. Toggle roles off and the same character's strokes swim.

### Strokes belong to surfaces
- **Invariant:** A stroke stays on the surface it was laid on when the camera moves, turns or zooms, and nothing in a still view flickers.
- **Technique:** Place strokes in a space that moves with the surface: world position for the level, rest pose for figures, direction for the sky. Seeds are fixed. Boil is off unless the look asks for it. A stroke comes and goes by degrees, never at a threshold: as the camera closes on it, and as its colour difference crosses what it must earn. Where the engine can keep a history, carry last frame's paint forward to where each surface now is and work this frame's into it (`steady` 0.86). Lay no small stroke on clutter under about ten pixels: foliage, lattice, thin rails. [references/method.md](references/method.md) has the method.
- **Reference configuration:** On the street, carrying each world pixel of one frame back into the last and comparing paint gave a mean difference of 7.1 of 255 for a camera step of a thirtieth of a second, 4.6 for a hundred-and-twentieth and 0.7 for a thousandth: it falls with the step, so the paint has no flicker of its own. KW, strafing and turning at once, gave 10.4, 5.1 and 2.5 against the untouched game's 2.4, 1.1 and 0.9. OH's owner called a background that moved its strokes "shaking". OS's first restyle, with strokes cut in and out at thresholds, changed 4.3 times as much as the game in a still view and its owner said "theres too much flickers around the maps/games that make them unplayable"; soft fades and no strokes on clutter brought it to 1.85 times.
- **Applies when:** Any 3D game, and any 2D game with a scrolling camera.
- **Verify:** Run that measurement (the adapter can redraw a frame before and after painting): halve the step and the difference falls with it. With the camera still, two frames apart are identical outside moving things.

### Quiet what the game does that a painting would not
- **Invariant:** While the style is on, nothing in the game's own picture feeds flicker or dirt into the paint: no grain, no temporal jitter, no glow halos, no fine texture detail that a brush would never lay.
- **Technique:** Turn off the game's film grain, temporal antialiasing, bloom, vignette, ambient occlusion and flickering lights behind the style's switch, and flatten normal maps, occlusion maps and glossy reflections. The value step turns small frame-to-frame changes into visible changes of plane, so remove them at their source instead of softening the step. Hide particles that will be redrawn as paint.
- **Reference configuration:** With the camera still, KW as shipped changed by 0.56 to 0.72 of 255 a frame and the restyle by 0.07 to 0.18 once its grain, TAA, bloom, vignette, occlusion, reflections, dust and fixture flicker were off; switching grain back on alone raised the restyle to 0.26 to 0.37. SF's own speed lines sat sharp on top of the paint until they were hidden and the same signal drove the drawn ones.
- **Applies when:** Any game with a post stack, animated lighting or detailed materials.
- **Verify:** Hold the camera still and difference two frames a sixtieth apart: the restyle changes less than the game did. Switch each of the game's effects back on alone and see what it costs.

### Few strokes, large, and the small ones are earned
- **Invariant:** A plain surface is a few broad strokes pulled one way. Smaller strokes appear only where the picture has something to say, and a stroke is never much longer than it is wide.
- **Technique:** Lay the largest size everywhere and each smaller size only where its colour differs from what is under it. Pull walls downward, the ground along the way the player travels and the sky across. When a level looks restless, raise what a small stroke must earn before touching anything else.
- **Reference configuration:** A broad stroke is 0.32 of the frame height, 2.6 times as long as wide, with three sizes and thresholds of 0.2, 0.3 and 0.42. DA and SF, restyled a second time to be seen as painted, both settled on 0.32 to 0.34: larger strokes made them more painted and no less steady. KW had settled on 0.2; at 0.26 columns became flat fills with no stroke to see, and with stroke-to-stroke variation near 0.015 a flat wall read as a filled polygon, so it went back to 0.03. OH found 480 to 713 large strokes a place read as structure where 1,704 small ones read flat and 11,979 thin ones read "hairy", and capped a stroke at three times its width.
- **Applies when:** Every painted surface.
- **Verify:** Count the strokes across the largest wall in a capture. Squint: the wall is one shape.

### Step the values, and keep hue clean while you do
- **Invariant:** An evenly lit surface is one flat plane of colour. Planes meet in a dabbed edge. Stepping value never dirties a hue, and a bright game stays as bright as it was drawn.
- **Technique:** Separate value from hue before stepping. Leave almost no chance in which plane a stroke falls. Brighten a dark game toward a target; never darken a bright one. Strengthen colour only where there is colour, so whites stay paper.
- **Reference configuration:** Four planes at 0.6 strength. KW's first frames were mud: the pass darkened a bright mall toward a mid key, mixed beige halfway with violet and scattered strokes between planes. Keying only upward, taking shade whole on neutral surfaces and cutting the chance to a quarter fixed each in turn. A deep blue ranked by luminance alone glowed when lifted; ranking by half luminance, half brightest channel stopped it.
- **Applies when:** Every use.
- **Verify:** Put a capture beside the original: whites match, no area is greyer or darker, and a wall with even light is one colour.

### The line gathers on figures
- **Invariant:** The ink line is heaviest round figures and heroes, light on the world's outlines and nearly absent from its inner creases, and it thins with distance.
- **Technique:** Draw the line where the surface breaks or folds, from the anchors, weighted by role. Raise how sharp a fold must be before it earns a line until architecture stops looking traced.
- **Reference configuration:** Width 2.4 pixels of a 1080 frame, weight 1.25 on figures and 0.55 on the world, a fold threshold of 2.4. KW with a line on every crease read as an edge filter; stairs and railings were hatching. OH's figures carry an outline weighted in screen pixels so it holds at any distance.
- **Applies when:** Any look with a line. A line-free gouache look sets it to nothing.
- **Verify:** In a wide capture the eye goes to the figures first. No area of architecture is denser with line than a figure.

### Halftone only in shade
- **Invariant:** A dot screen appears only in the deepest shade, large enough to be seen as dots.
- **Technique:** Print dots below a value level, growing with depth, at a fixed angle. Keep the cell large enough to read at the game's lowest resolution.
- **Reference configuration:** A 9 pixel cell at 1080, strength 0.55, below a value of 0.2. OH printed about 6 pixel dots in the core shadow only. A 7 pixel cell over everything dark read as noise on KW.
- **Applies when:** Looks with a print finish.
- **Verify:** Lit surfaces in a capture have no dots. In shade you can count them.

### Paper is part of the picture
- **Invariant:** The sheet shows: at the frame's edge, in the distance, and wherever the painting has not yet been laid.
- **Technique:** Stop the paint in a ragged edge of whole strokes near the frame. Fade distance toward the paper rather than toward fog grey. Paint the picture in, stroke by stroke with the largest first, at a level start or a respawn.
- **Reference configuration:** Air 0.45, complete at 120 world units; the edge is off in play by default because both KW and SF read ragged paper at the frame's sides as damage beside a HUD. OH targeted 30 to 40% bare paper and opened each song on a blank sheet.
- **Applies when:** Any look on paper. Indoor levels use little edge and no air.
- **Verify:** Step through a paint-in: its front is made of strokes, never a soft wipe.

### The HUD is lettered, never painted
- **Invariant:** Every HUD element keeps its place and meaning and is redrawn in the style: tape, brush capitals, ink, paper and one accent. HUD text is at least as legible as before.
- **Technique:** Draw the HUD after the stroke pass, in the DOM where the engine allows. Use `helpers/brush-hud.js` for tape strips, meters and written words. Host a brush face you may ship.
- **Reference configuration:** KW's HUD is all DOM and was restyled in place: brush numerals in ink on paper tape (about 15 to 1), a crosshair with the same geometry to the pixel in ink with a paper edge, the minimap printed as ink walls on a paper sheet. Roughening a whole strip with the dry-edge filter bent its numerals until the clock and scores were hard to read; the torn outline and filter now sit on a layer under the lettering. In the rejected version HUD text went through the pass and could not be read.
- **Applies when:** Any game with a HUD or menus.
- **Verify:** Measure the contrast of each HUD number against what is behind it, before and after. Read every label at the game's smallest supported size.

### Play is drawn, with limits
- **Invariant:** Speed and impact are drawn on the frame from the game's own events, each with a limit on how often it may fire, and a setting turns flashes off.
- **Technique:** Rush lines follow speed and are absent at rest. The three-drawing hit frame (ink, one flat colour, the picture wiped back) is kept for the game's biggest beat, with a gap between two, and never covers the thing that was hit. A written word marks where a blow landed. Overlays are redrawn twelve times a second: often enough to read as drawn, seldom enough not to strobe. Honour a no-flashes setting. When in doubt, the game's own hit markers and less drawn feedback beat more.
- **Reference configuration:** OH's hit frame is 0.07, 0.07 and 0.12 seconds, at least eight beats and six seconds apart, and its overlays are redrawn twenty times a second so they read as drawn. KW fires the hit frame on a headshot or knife kill only, six seconds apart, with a written word on each of the player's kills; rush lines begin above a walk (5.6 m/s where a walk is 4.6) and are capped at 0.42 because 0.55 crowded every sprint; hits throw paint dabs and leave a splat on the wall behind; the paint-in is 1.3 seconds at match start. The helper drops a hit asked for within three seconds of the last and skips them all in calm mode. On OS a full-frame hit frame hid the kill it marked and was the loudest thing on screen, so it was left off.
- **Applies when:** Any game with speed or impact.
- **Verify:** Log every hit frame in a five minute session: none closer than the gap. Turn calm on: no full-frame flash remains.

### Judge it beside the references, moving
- **Invariant:** The restyle is judged on captures of real play set beside reference frames, and in motion, not on settings or stills of an empty level.
- **Technique:** Put your best frame of each state (rest, a fight, a hit, speed) next to a reference frame. Then watch a moving capture frame by frame. If yours is noisy, muddy, outlined everywhere or busy with detail, it is a filter again, whatever the values say.
- **Reference configuration:** The muddy KW frames passed every stability and frame-time check; only the side-by-side showed they were wrong.
- **Applies when:** Every restyle, before anyone else sees it.
- **Verify:** A reviewer with fresh context is shown your frame and the reference and says which parts read as painted and which as filtered.

### Pay for it on purpose
- **Invariant:** The cost of the style is measured on the machine the game targets, and there is a cheaper setting that keeps the look.
- **Technique:** Measure frame time with the pass on and off behind a real sync. Lower the paint resolution before lowering stroke quality, then lay fewer sizes.
- **Reference configuration:** On an RTX 4000 SFF Ada at 1080p, KW's whole frame was 6.5 ms as shipped and 9.1 ms restyled, measured in one page with the two interleaved; an earlier comparison across two page loads on a shared card had blamed the hook for 4 ms it did not cost. The street's paint stage alone took 3.3 to 3.7 ms. Nothing here was measured on a phone or an integrated GPU.
- **Applies when:** Before release, and whenever a level is slow.
- **Verify:** State the machine with the number. Run the lowest setting and compare a capture.

### Painted at a glance, steady to play
- **Invariant:** Anyone shown one frame at thumbnail size says "painted" about every kind of surface: ground, walls, sky, the player's own weapon or character, and the enemies. In a still view the painting changes no more than about twice as much as the game does by itself. Both hold together; a restyle that passes only one has failed.
- **Technique:** Calm the paint with machinery, never by taking paint away: the soft fades and history of rule 5, the detail thresholds of rule 7, and the game's own noise turned off (rule 6). Keep it visible with large strokes (`strokeSize` 0.28 or more), clean strong colour (`saturation` 1.3 or more), shade that is a hue (`shadeColour` 0.6 or more), a line you can see round silhouettes, and a sky laid in strokes. Small strokes are what flicker, so they are what to keep scarce. Run `helpers/brush-check.mjs` on a before and after capture of real play and on a three-second still-camera pair, and tune toward its gates one value at a time.
- **Reference configuration:** OS's calm round lowered saturation, shade, line and sky and left cluttered areas unpainted: its still-camera change fell to 1.85 times the game's, its brushwork (`strokes`) fell to 4.0, and the owner said "its too subtle across all the games tbh vs the original concept". A zombie shooter that was mostly regraded scored 4.3 and drew the same note; a battle royale at 7.2 and DA at 7.4 were still "too subtle". Restyled again with the defaults' values, DA reached 7.8 to 8.1 (at the gate) and SF 15.8, both reading as painted, with frame-to-frame change 0.93 and 0.61 times the game's over their quietest frames.
- **Applies when:** Every restyle, before anyone else sees it, and after any change of values.
- **Verify:** `node helpers/brush-check.mjs before.mp4 after.mp4` passes on real play (`paint` at least 9, `strokes` at least 8), and on the still-camera pair (`flicker` at most 2.2, `pop` at most 1 %). Then set the painted frame beside a reference frame at 480 pixels wide.

## Making a new game in this style

Start from flat, simply lit geometry in clear colours: the pass does the painting, so
textures and normal maps are wasted work. Choose the scheme before modelling. For a
world built as paintings from the start (sheets of authored strokes bent by the lens),
`opengame-look` has OH's method.
