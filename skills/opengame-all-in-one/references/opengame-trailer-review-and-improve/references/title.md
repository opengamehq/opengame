# Title: a 3D title that lives in the world

The OG Clash title took six owner notes and four rebuilds. Its camera match was exact from day one (0.068 px mean
error) and it still looked like "a sticker". The lesson: **a correct camera track is not enough; the title must behave
like a physical object in that world.** The OG Snipers montage's end title took 23 hand-ins over three days and was
nearly cut altogether. Settle the title from stills on the real plate on day one.

## How the OG Clash title evolved, so you can skip it

1. Broken, dashed lightning strands (141 fragments) became traced continuous bolts.
2. A particle "forge-in" borrowed from the game's loading screen: "how it appears those particles is terrible it should
   probably just be there... and no shimmer please".
3. A static lockup with crackle on the beat: "it cant ovelrap with characters like this and also we need to make sure
   its perfectly motinon tracked and angled", then "this does not look motion tracked properly and its too big and it
   doesnt look like 3d ... not just an iamge thats motion tracked".
4. A placement solver, solid geometry and lightning from the first frame: "can we make the lighting and camos and color
   correction of the logo look like its part of the world".
5. Matched to the world and composited before the grade. Approved.

## The procedure (any engine; a 3D package such as Blender for the title)

1. **Use the game's own logo art.** Segment it into pieces (by hand or with a segmentation model), separate painted
   energy (lightning, fire) from the base colour, and keep the game's palette. Never use another game's or studio's
   logo, type or emblem as a starting point.
2. **Real geometry:** extrude the silhouettes in tiers with bevels, depth about 20 % of the logo's height; side and bevel
   faces get their own materials (OG Clash: cracked stone at roughness about 0.85, iron at about 0.45, metallic); keep
   self-illumination low (OG Clash went from 0.42 to 0.10 to 0.05); cast sun shadows.
3. **The true camera, not a feature track.** Log the engine camera on every frame of the take (position, look target,
   vertical field of view, roll). Rebuild the basis exactly (`f = normalize(look − pos); r0 = normalize(f × up);
   u0 = r0 × f`, roll applied, field of view converted to sensor and lens, axes converted per engine). Prove it with
   markers on logged joints (OG Clash: 0.068 px mean, 0.196 px max) and a background feature track (0.18 px RMS, 0.19 px
   drift). Unreal is left-handed Z-up with a horizontal field of view; Unity is left-handed Y-up with a vertical one.
4. **A fixed world object.** Anchor it in world space at a believable distance (OG Clash: 110 m out over the far pit, in
   front of 125-182 m towers) with a fixed yaw toward the final camera (25°), **never camera-facing**. Size it like an
   object at that distance: about 19-30 % of frame width at rest.
5. **Never overlap a character on any frame.** Solve the placement per frame: project the logo's bounding box and a
   conservative 3D box around characters and props on every frame of the take; search distance, height and screen
   position for a minimum pixel gap above 0 (OG Clash: no overlap on 426 frames, the tightest gap 56.6 px). If the logo
   must pass behind something, export a depth or object-ID matte from the engine.
6. **Arrival:** the logo exists from the shot's first frame (pre-rolled so it is already in frame at the cut) and the
   camera finds it (a crane up, a pull back). No particle assembly, no forge-in, no shimmer, no glint, no breathing.
   **At rest it is still:** with the camera locked and the energy off, the frames are bit-identical.
7. **Match the plate numerically** against scenery at the same depth, in ungraded plate space: the black floor lifted to
   the haze floor; a highlight knee (OG Clash: 0.55, peak 0.80); saturation (0.40 brought to 0.25 against towers at
   0.14); emissive peaks below the brightest light in the shot (lava from 250 down to 196 under torches at 253); haze
   toward the ambient (0.28); light wrap (0.30); softness (0.55 px, no sharper than the architecture); grain (0.010).
   Light it like the shot: key and rim from the sky behind, a dim fill, fire bounce only on lower faces.
8. **Composite before the grade,** so the film's look goes over plate and title together (a title composited after the
   grade looked pasted on). Deliver straight alpha; a premultiplied render clips additive light through a straight-over
   composite (`a' = max(a, max(rgb))`).
9. **Structured energy on the beats:** trace the art's painted bolts into continuous forked strokes (skeletonise, prune
   spurs under 13 px, bridge gaps up to 26 px); a thin core, an inner glow, a wide glow and a halo; a new strike every 3
   frames; discrete strike bursts on beats from `grid.json` (13 strikes over a 7 s shot, the biggest on the bar
   downbeat, the second on the home chord); **live from the logo's first visible frame**; nothing clipping (blue peak
   at most 230 of 255). Write a strike list so sound lays one designed crackle per strike.
10. **QA:** camera match (marker reprojection mean ≤ 0.1 px, maximum ≤ 0.25 px; background track ≤ 0.25 px RMS, no
    drift); centring (the centroid of alpha above 0.25); drift ≤ 0.3 px/f against the anchor; crispness (Laplacian variance at least 0.9 of the
    hold median); the settle frame; slide (ink centre against the anchor's projection); the gap to characters per frame;
    strike visibility; stillness at rest.
11. **Confirm it is in the cut.** OG Clash once rendered a 4K title that was never wired into the edit list; the cut went
    out with no title.

**Cost on OG Clash:** about 2 s a frame at 1080p and 32 samples on a quiet machine with a real-time renderer (bolts
added 50 %); about 25 s a frame at 4K and 48 samples under load (2-3 hours for 360 frames). Preflight at 720p, review at
1080p, render the master resolution only after approval. Render so a restart resumes (only missing frames, every image
verified); never delete a frame that is still being written.

## What a montage owner wanted instead

On the OG Snipers montage the owner wanted the game's name only, as a material with a life of its own:

- "it should be floating in the air not on the ground this looks liek its not part of the scene" (letters at 0.7 m read
  as standing on the ground).
- The letters come together from close by and keep closing to the last frame, faster at first ("even till the end its
  coming together"), never a lock and hold.
- Mirror chrome that reflects the scene, coloured only by the effect that lights it, occluded by the scene's smoke, with
  every visible strike heard ("chrome and have sfx for the lightning effect").
- A heavy condensed face with tight spacing, chosen from a sheet of four or five real fonts on the real plate.
- After five chrome and glass hand-ins the owner said "lets remove the text", then kept the previous glass version
  sixteen minutes later. Offer a cut without the title early, and keep the last approved version as the default while a
  new one is built beside it.
- Verify the title on the finished file against its approved comp: a fixed box's luma and saturation. A render that
  graded the finished title comp a second time delivered a darker title than the one approved.

## Where it sits

- Map and launch trailers: at 84-90 % of runtime, on the swell or after a silence, then a 4-6.5 s end card and a button.
  Story trailers may open on it (Black Ops 3 put it at 27-36 %).
- Franchise marks (flat 2D logos) use the smash-cut style: an oversized cropped piece, then a crash-zoom or pull-out to
  the lockup in 4-14 frames. A game's own 3D logo uses this chapter.
- A pixel-art game's title uses the game's own pixel font on its grid; a smooth vector title over pixel art breaks the
  one world.
