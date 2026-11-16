# A painterly world: OH's method

OG Hero (OH) is a five-lane rhythm game drawn as a painting: brush dabs, ink
outlines, halftone shadows, flat colour and bare paper, seen through a lively wide lens.
Seven passes that painted strokes onto the faces of 3D blocks each moved the judges'
mean by under 0.2. The rebuild below, made after the owner supplied videos showing how
the reference look was made, moved it by 0.54 in one pass. The lesson travels: when a
polish pass gains little, change the method.

## Name the layers first

Write each layer with its technique and a measured number before any code: brush dabs,
ink outlines, halftone shadows, flat colour, bare paper, rush lines, impact frames,
written sounds and the lens. Each one is a technique, never a post filter laid over a
3D render.

## Strokes are instances, one draw per layer

- A stroke is a bent ribbon (six segments) with two paints, a stamp, a seed and a pass
  number. Three tones of light, broken by chance.
- Stamps are drawn in code into one atlas, so no images are downloaded.
- Boil is off by default. Seeds are fixed, so a stroke is the same stroke every frame.

## One long painting per place

- Each place is six baked sheets (18.9 million texels, 76 MB, half that on Low) laid in
  five passes: sketch, wash, masses, touches, details.
- At most 900 strokes are baked per frame, so the bake spreads over the first frames.
- The sheets are cast back through the lens in one pass, five texture reads a pixel.
- Near ground gets a sheet laid out in the eye's own angles, because it covers four
  hundred to a thousand pixels a metre.
- Props and figures live on top of the painting, not inside it.

## The frame

The play board renders to its own full-resolution target with no lens. The world goes
through the lens (in the vertex shader, `tan(k*θ)/tan(k*half)` for a 104 degree lens)
into a target that can shrink on slower machines. One print pass composites both. Canvas
antialias, depth and stencil are off.

## What read as paint

| Choice | What happened |
| --- | --- |
| 480 to 713 large strokes a venue over solid masses | Read as structure |
| 1,704 small strokes | Read flat |
| 11,979 thin strokes | Read "hairy" |
| Figures cut from 685 to 238 strokes | Read as painted figures |
| Halftone about 6 px, core shadow only | Read as print |
| Ink weighted in screen pixels | Held its weight at every distance |
| 30 to 40% bare paper | Read as a painting rather than a coloured render |
| Figures in two flat values | Read at play size |

The reference street held about 21,800 strokes. The canyon place read only once it was
painted at density, from 3,300 to 9,300 strokes (an 11.1 ms bake).

## A place per style

17 musical styles map to 16 places. Each place has a scheme: three values, accents, a
mid-dark board, its largest colour mass and a pair for the power mode. Each has a
signature landmark in the upper third at 15% or more of the frame's height. Once the
data model existed, six places took 38 minutes. A white hero needs a dark shape behind
its head.

## Light figures about the line to the eye

Under a wide lens, light in camera space lights every surface off axis from the front.
OH builds each figure's light from `cross(up, toEye)` per fragment and uses two flat
values with one drawn edge (`opengame-lighting` has the rule).
