# Adding to the character

The character has shapes, eyes, colours and accessories, one file each, so
several people can add to it at once without editing the same lines. Everything is
arithmetic over a grid of cells. Nothing here touches the DOM, and the same functions
draw the live canvas in onboarding, the still SVG beside a name, and the share card.

| File | Holds |
|---|---|
| `geometry.ts` | The signed-distance helpers everything else is drawn with. Reach for these before writing your own. |
| `shapes.ts` | `MASCOT_SHAPES`, `sdShape`, `FACE`, `MARKINGS`, `HEAD` |
| `eyes.ts` | `MASCOT_EYES`, `EYE_REACH`, `sampleEyes` |
| `colors.ts` | `MASCOT_COLORS`, `ramp`, the finishes, the marking inks |
| `accessories.ts` | `MASCOT_ACCESSORIES`, `ACCESSORY_ART` |
| `look.ts` | Identity and the stored value: parse, format, random |
| `render.ts` | Pose, framing, the per-cell sample, the two outputs. You should not need to touch it to add an item. |

## Ids

An id is written into `profiles.avatar_look` as `shape.eyes.color` or
`shape.eyes.color.accessory`, and into every card URL that has been shared. Female
identity adds a fifth part: `shape.eyes.color.accessory.female`. A bare female face
uses `none` in the accessory slot. Male is the default; an explicit fifth `male`
reads back as the original three- or four-part form. Identity does not replace
the selected eyes or accessory. So:

- **Never rename or remove an id.** A renamed id is every row that held it falling back
  to the default character. If you must retire one, keep the entry and map the
  old id in `RENAMED` in `look.ts`, the way `ink` and `paper` were.
- **The order of a list is the picker's order, and it may change.** Colours are grouped
  by family for that reason. Nothing reads these lists by position: a person who has not
  built a character is drawn as `DEFAULT_MASCOT`, which names its ids.
- **Lowercase letters only, 1 to 16 of them.** The database accepts three or four
  such parts, or five when the last is `male` or `female`: no digits, no hyphens,
  no capitals. `tv` is fine,
  `3eyes` and `side-eye` are not.
- **Ids are unique within their list, and `none` stays the first accessory.** Shuffle
  takes `MASCOT_ACCESSORIES.slice(1)`. `none` is only stored as a placeholder for a
  bare female face. Shuffle preserves the person's selected identity.
- The `label` is what the picker shows. Sentence case, a word or two, no punctuation
  beyond a hyphen inside a word ("Cross-eyed").

## A shape

1. Add `{ id, label }` to the end of `MASCOT_SHAPES`.
2. Add a `case` to `sdShape`: a signed distance in the -1 to 1 body box, y down, under 0
   inside. Build it from `geometry.ts` and join parts with `smin` so the seams are soft.
   Stand it on the ground: the lowest point should be near `GROUND` (0.86), because
   squash, hop and tilt all pivot there. `t` is a clock in seconds for anything that
   sways; a still face is drawn at `t = 0`.
3. Add its `FACE` entry: where the eyes centre (`x`, `y`) and how big they are (`s`, 1 on
   the circle). Keep the face inside the body with room round it; `w` spreads the eyes
   apart without growing them, for eyes on stalks.
4. `HEAD` only if a hat sits wrong. The anchors are derived from the outline (the top is
   the first row where the body is 0.36 wide, which steps over a stalk or a flame), and
   most shapes need nothing. Check with the sheet script before adding an entry.
5. `MARKINGS` if the shape has a second ink: a panda's patches, a ladybug's spots. A
   distance, under 0 inside a patch. Leave `tone` at its default, `contrast`, unless the
   marking is a material rather than a pattern (a penguin's belly is always light).

Eyes on a marking swap inks where they would not read; that is decided in `render.ts`
and you get it for free.

## An eye style

1. Add `{ id, label }` to the end of `MASCOT_EYES`.
2. Add a branch to `sampleEyes`. Work in face units: everything is offset from
   `face.x`, `face.y` and multiplied by `s`, so the style fits a pawn's small head and a
   slab's wide one. Thin strokes take `stroke` (it thickens with `cell` so a line
   survives at twenty-four cells), and `tiny` is true when there is no room for a pupil.
3. **Stay under `EYE_REACH`.** No mark, brows, tears, glyphs and straps included, may
   draw higher than `face.y - EYE_REACH * s` (0.7 today; the highest style, Raised
   brow, reaches 0.66). Eyes are drawn over an accessory, so a mark that reaches high
   prints across a hat's brim; staying low is what keeps it off the hat.
4. **Return `"sclera"` and `"pupil"`, not colours.** Those two follow the body: white
   eyes on a dark body, dark eyes on a pale one, swapped on a marking. Blush, freckles,
   tears and glyphs are in the eye colour too. The fixed inks, `"plastic"` and
   `"bead"`, are for a physical object stuck on the face that is the same colour
   whatever it is stuck to: googly eyes. A drawn eye is never a physical object, and in
   fixed white it vanishes on a white body.

## A colour

1. Add `{ id, label, swatch, inks: ramp("#RRGGBB") }` to `MASCOT_COLORS`, before the
   finishes. `ramp` builds the five tones, the rim and the eye inks from one base;
   pass a second argument only if the automatic eye colour is wrong for it (it picks
   near-black eyes on a pale body and white on a dark one by luminance).
2. Check it against its neighbours. Two swatches a person has to squint at in a grid of
   fifty-odd is the failure, and the test measures it (CIEDE2000 of the base tones,
   at least 5).

### A finish

A finish is a colour whose tone or hue moves across the dome; it goes after the solids
with a `finish`. Two optional halves, and both stay inside the five-tone dither so a
finish is still pixel art:

- `light(surface)` replaces the lit value the tones are picked from: a metal (Gold)
  reflects a bright sky and a dark floor rather than a lamp.
- `pick(surface)` picks which of `ramps` a cell uses: Holographic's hue bands.

Keep `ramps` short. The still SVG is one path per distinct colour, so a finish costs up
to five paths per ramp on every card the creator has.

## An accessory

1. Add `{ id, label }` to the end of `MASCOT_ACCESSORIES`, after `none`.
2. Add its `ACCESSORY_ART`: `main` and optional `alt` colours, each a hex value or a
   colour id (finishes included, so a crown can be `gold`), and a list of `parts`.
3. Each part is a signed distance in body space, **written against the `MascotHead`
   anchors and nothing else**: `seat` is where its lower edge rests, `top` the top of
   the skull, `w` the head's half-width, `ear` and `side` where side pieces hang, `k` a
   size unit that is 1 on the circle. Multiply heights by `k` so a small head gets a
   small hat. Written that way, one crown sits on a circle, between a cat's ears and on
   a pawn.
4. **Front first.** Parts are tried in order and the first one a cell is inside wins,
   so a jewel goes before the crown it sits on. Parts draw over the body. A `behind` part
   is only drawn where the body is not (a headphone band, the far side of a halo). A
   `flat` part is one tone with no rim and no shading, for a line too thin to light.
5. **Materials.** `main` and `alt` are the accessory's own colours and do not follow the
   body, the way googly eyes do not. `eye` draws in the body's eye colour, for a detail
   that should read as part of the face's ink.
6. **The eyes are in front.** The order is body, accessory, eyes, so a hat never covers
   an eye however low it reaches; the eyes print over it instead. That is a promise
   about the eyes, not a licence: a brim across the brows looks like a mask. If the sheet
   shows one, lift the part or narrow it. (Until 6 Oct 2026 the renderer cut every
   accessory cell inside the body below a line over the eyes, which hid most of a crown
   behind a star's points.)
7. **Height.** Keep the tallest point within `0.5 * k` of `seat` and the widest within
   the dressed frame (`MASCOT_FRAME.dressed`, -1.2 to 1.2 across, -1.4 at the top). A
   look with an accessory is drawn in that larger box, and a part that leaves it is cut
   off by the edge of every square the face is drawn in. Size horizontal reach by `k`,
   not by `w`: the cap's brim is sized by `w` and overhangs every wide head.

## Looking at it

Nothing here is finished until it has been looked at, on more than the circle. The sheet
script paints any set of looks into a PNG at a chosen cell count:

```sh
SHEET=path/to/sheet.mts   # OpenGame's sheet script, not shipped
npx tsx $SHEET shapes light /tmp/shapes.png 64        # every shape, Classic eyes, Black
npx tsx $SHEET eyes-white dark /tmp/eyes.png 52       # every eye style on a White circle
npx tsx $SHEET colors:googly light /tmp/colors.png    # every colour on a circle
npx tsx $SHEET wear:crown light /tmp/crown.png 64     # every shape wearing one accessory
npx tsx $SHEET accessories:cat,frog,pawn light /tmp/acc.png
npx tsx $SHEET looks:circle.classic.white.crown,frog.googly.lime light /tmp/l.png 28
```

The sheet script is internal to OpenGame and not part of this kit. Look at 28 cells (a small avatar), 64 (the top bar on a retina
screen) and in both themes. Every new shape wants `wear:` for each accessory, and every
new accessory wants `wear:` on every shape.

## The tests

```sh
cd packages/ui
node --import tsx --test tests/mascot-lookalike.test.ts tests/mascot-look.test.ts
MASCOT_LOOKALIKE_REPORT=1 node --import tsx --test tests/mascot-lookalike.test.ts
```

`mascot-look.test.ts` pins the stored format. `mascot-lookalike.test.ts` reads every
list from the source, so whatever you add is covered without editing it, and checks:

- no eye style draws above `EYE_REACH`, on a circle and on a frog;
- every accessory on every shape, with Googly, Goggles, One eye and Brows, at 24 and 64
  cells, covers no eye cell, adds nothing outside the dressed frame, and adds at least 14
  cells at 64;
- no two shapes share a silhouette at 28 cells (IoU under 0.93) unless their markings
  tell them apart;
- no two eye styles on a circle differ by fewer than 4 cells at 28 and 8 at 52;
- no two solid colours are under CIEDE2000 5 apart, and no two finishes are under 5
  apart on the palette they paint.

The report flag prints the ten closest pairs in each category. Read it before adding
anything that lands near the top.

If your item fails one of these, change the item. Each test has a short allowlist of
pairs that are close on purpose or known defects, each with a reason; adding to one is a
decision for whoever owns the picker, not a way to make a branch green. An entry that
stops being needed fails too, so take it out when you fix the thing it excused.
