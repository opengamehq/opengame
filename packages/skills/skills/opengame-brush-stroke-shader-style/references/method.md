# How the painted look is built

Read this before changing the stroke pass or porting it. It says what each layer of
the look is, how the pass makes it, and why it is made that way.

## What the references are made of

The look comes from two games by Max Vedel, Paris Freestyle and Brush Rush, and a film
in which he shows how the first was built. Study a reference's method; never copy its
code or art. Named as layers:

| Layer | In the references | Here |
| --- | --- | --- |
| The painting | one long 2D painting of about 21,800 strokes laid in passes (sketch, wash, masses, touches, details), bent into a street by the lens | strokes laid in anchor space, largest first, each smaller size earned |
| The figure | a detailed drawn character: flat regions, a painted texture, strokes, an ink outline | the `figure` and `hero` roles: its own shapes kept, stepped values, the full line |
| Shade | a blue violet, with a dot screen in its deepest part and a dotted cast shadow | shade pulled to the scheme's shade colour, with a floor, and halftone below a level |
| Paper | cream, bare at the frame's edge and wherever paint has not been laid | paper at the edge, air fading to paper, the paint-in |
| Line | dark ink, hand weight, round the figure | a line from the anchors, heavy on figures and light on the world |
| The lens | a wide field of view and a fisheye, with colour fringing | print finish: fisheye, fringe |
| Play | rush lines from the vanishing point, a three-drawing hit frame, written sounds, ribbon trails | `rush`, `hit`, `word`, wired to the game's events |
| Lettering | torn tape strips and brush capitals | the HUD kit |

## Anchor space is the whole idea

A stroke has to stay on the thing it was laid on. If strokes are placed in screen
space they hang in front of the game like a pattern on a window, and the world slides
behind them. So every pixel is given an anchor: a position in a space that moves with
the surface under that pixel.

- **The world's** anchor is its world position. The camera can do anything and the
  stroke stays on the wall.
- **A figure's** anchor is its position in its own rest pose, scaled to world units,
  plus an offset per object. The stroke stays on a character's sleeve while the arm
  bends, because the rest pose does not change when the skeleton does.
- **The sky's** anchor is the direction it is seen in, so it turns with the camera and
  does not slide when the camera only moves.

In three.js this is one extra draw of the scene with an override material that writes
the anchor into a float target (`renderAnchors`). In an engine with a depth buffer the
world anchor can be rebuilt from depth and the camera with no extra draw; figures then
need either a rest-position output or a mask and their own pass.

The fourth anchor value carries the role (0 sky, 1 world, 2 figure, 3 hero) and, in its
fraction, how much air lies between the pixel and the eye.

## Laying strokes

For each pixel the pass asks which strokes cover it. Strokes live on a lattice in
anchor space, on the plane the surface faces most (floor, or one of two walls):

1. **Size.** The pass works out how large one pixel is in anchor units at this
   surface, and from that the lattice size at which a stroke is `strokeSize` of the
   frame height. Sizes go in powers of two. Four sizes are tried, largest first. A
   size that has become too large for its place fades out stroke by stroke as the
   camera approaches, so there is never a line across the picture where sizes change.
2. **The lattice** is turned to the pull (walls are pulled down, the ground along
   `groundPull`, the sky across) and stretched along it. Rows are staggered like
   brickwork. Each cell holds one stroke with its own offset, turn, length and width.
3. **The dab.** Inside a stroke, coverage comes from a small model of a loaded brush:
   bristles in clumps, a tapered start, a split dry end, sides that wander.
4. **Colour.** The stroke's centre is carried back to the screen by stepping across
   the surface from the current pixel (the anchors of the neighbouring pixels say how
   far one pixel moves across it). The game's frame is read there, at a mip that
   matches the stroke's size, so one stroke is one flat colour.
5. **The centre must really be there.** The anchor at the centre is read too. If it is
   another kind of thing, or somewhere else, the stroke is not laid: its centre is
   hidden or off the object. That is what keeps a stroke on a wall from carrying the
   colour of the enemy standing in front of it, and why silhouettes stay exact.
6. **Earning it.** The largest size is always laid. Each smaller size is laid only
   where its colour differs from what is already there by more than a threshold. A
   plain wall stays two or three strokes; a sign, a face or a window gets the touches.

## Values and colour

Every stroke's colour goes through one function:

- **Key.** The mean brightness of the frame is read from its smallest mip. A dark game
  is brightened toward `keyTarget`. A bright game is left exactly as bright as it was.
- **Planes.** Value is stepped into `toneSteps` planes. Value and hue are separated
  first, so stepping the value does not change the hue.
- **Shade.** Below `shadeLevel` a colour is in shade. A grey or white surface in shade
  takes the shade colour almost whole; a strongly coloured one keeps its hue and only
  leans. Mixing the two halfway is what produces mud. Shade has a floor (`blackLift`)
  so it is never black.
- **Roles.** A figure takes less of the shade colour and a hero hardly any, so they
  keep their own colours when the level is pushed toward the scheme.
- **Colour strength** is applied where there is colour. A white wall stays white.

## What went wrong first

The first version of this skill painted over the finished frame of a compiled game
through a canvas laid on top, with no access to depth, following the picture's motion
with optical flow. It was rejected by the owner on sight: the HUD was smeared, enemies
could not be told from the ground, and the flow's small errors turned strokes into
swirling mush within two seconds. The lesson is the first rule of the skill: the style
has to know what things are, and that knowledge is in the game, not in its pixels.

The second mistake was in the values. With the stroke pass in the right place, the
first frames of a real game were still a filter: muddy, restless, every edge outlined.
What fixed it, in order of effect:

1. Keying only upward, and keeping whites white.
2. Fewer, larger strokes, with smaller ones made harder to earn, and every stroke
   faded in and out instead of switched.
3. Stepping value with almost no chance in it, so an evenly lit wall is one plane.
4. Taking the line off the world's inner creases and leaving it on figures.
5. Setting where shade begins for each level, so the level has two clear families of
   plane: lit and shade.
