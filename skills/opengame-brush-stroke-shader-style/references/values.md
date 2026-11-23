# Every value

Set with `brush.set({ name: value })`, or take a whole look with `brush.look(name)`. Defaults are the look called "wet".

## Strokes

| Value | Default | What it does |
| --- | --- | --- |
| `strokeSize` | 0.32 | Length of a broad stroke as a share of the frame height. The first thing to raise when a level looks busy, and the first to raise when it does not read as painted: large strokes are both louder and calmer. Below 0.25 a game tends to read as filtered. |
| `strokeAspect` | 2.6 | How many times longer a stroke is than it is wide. Above 3 strokes read as streaks. |
| `strokeWander` | 0.14 | How far a stroke's angle strays from the pull, in radians. |
| `strokeDensity` | 1 | Share of lattice cells that hold a stroke. Below 1 leaves gaps showing the wash. |
| `sizes` | 3 | How many sizes of stroke are laid, 2 to 4. Fewer is cheaper and broader. |
| `accent` | 0.25 | How bold the one stroke in eight of a bolder mix is, on coloured surfaces only. |
| `groundPull` | 1.5708 | The way ground strokes are pulled, in radians from world x. Aim it along the way the player travels. |
| `skyScale` | 2 | Stroke size in the sky as a multiple of the world's. |
| `skyKeep` | 0 | 1 keeps the sky exactly as the game drew it: a starfield, or a sky that is already a painting. |
| `dry` | 0.35 | How dry the brush runs: more breaks toward the end of each stroke. |
| `streak` | 0.05 | Contrast between the bristles of one stroke. |
| `ragged` | 1 | How ragged stroke ends and sides are. |
| `bristles` | 9 | Bristles across a stroke. |

## What a small stroke must earn

| Value | Default | What it does |
| --- | --- | --- |
| `detailMedium` | 0.2 | Colour difference that earns a stroke half the broad size. |
| `detailTouch` | 0.3 | The same for a quarter size. |
| `detailFine` | 0.42 | The same for an eighth. Raise all three for a quieter painting. |

## Roles

| Value | Default | What it does |
| --- | --- | --- |
| `figureScale` | 0.45 | Stroke size on figures and heroes as a multiple of the world's. |
| `figureClean` | 0.45 | How much of its own detail a figure keeps under the strokes, 0 to 1. |
| `heroClean` | 0.8 | The same for a hero. |
| `figureShade` | 0.6 | How far a figure takes the scheme's shade colour, 0 to 1. |
| `heroShade` | 0.15 | The same for a hero. Keep it low so heroes hold their own colours. |
| `heroHalo` | 0 | A ring of paper round every hero outside its line, 0 to 1, for games where heroes are small or the ground is as dark as they are. |
| `figureLine` | 1.25 | Line weight on figures and heroes. |
| `worldLine` | 0.8 | Line weight on the world. |

## Values and colour (the scheme)

| Value | Default | What it does |
| --- | --- | --- |
| `key` | 1 | How far a dark game is brightened toward keyTarget, 0 to 1. A bright game is never darkened. |
| `keyTarget` | 0.36 | The mean brightness a keyed game comes to. |
| `toneSteps` | 4 | How many value planes. |
| `toneStrength` | 0.8 | How hard values are pulled onto the planes, 0 to 1. |
| `shadeLevel` | 0.3 | The value below which a colour is in shade. Set per level so it splits into lit and shade. |
| `shadeColour` | 0.9 | How fully shade takes shadeTint, 0 to 1. Below 0.6 shade turns grey and the picture reads as a grade. |
| `shadeTint` | [0.36, 0.34, 0.78] | The shade colour. |
| `blackLift` | 0.16 | The floor: the darkest value shade is allowed. |
| `lightLevel` | 0.8 | The value above which lightTint applies. |
| `lightTint` | [1.02, 1.01, 0.98] | What the lightest planes are multiplied by. |
| `saturation` | 1.45 | Colour strength, applied where there is colour. Calm a restyle with `steady` and the detail thresholds, not by lowering this. |
| `contrast` | 1.08 | Contrast about mid grey. |
| `hueJitter` | 0.02 | How far hue strays from stroke to stroke, in radians. |
| `valueJitter` | 0.022 | How far value strays from stroke to stroke. |

## Line and dots

| Value | Default | What it does |
| --- | --- | --- |
| `inkWidth` | 2.6 | Line width in pixels of a 1080 frame. |
| `inkStrength` | 0.9 | Line opacity. |
| `inkWobble` | 1 | How far the line wavers. |
| `inkCrease` | 2.4 | How sharp a fold must be to earn a line. Higher leaves only outlines. |
| `ink` | [0.133, 0.125, 0.227] | The line's colour. |
| `dotsStrength` | 0.45 | Halftone strength. |
| `dotsCell` | 9 | Dot spacing in pixels of a 1080 frame. |
| `dotsAngle` | 0.49 | Screen angle in radians. |
| `dotsLevel` | 0.2 | The value below which dots are printed. |

## Paper, air and the paint-in

| Value | Default | What it does |
| --- | --- | --- |
| `paper` | [0.937, 0.902, 0.839] | The sheet's colour. |
| `paperTooth` | 0.2 | Paper grain over the paint. |
| `paperGaps` | 0 | Bare paper between strokes in place of the wash, 0 to 1. |
| `paperEdge` | 0 | How far bare paper reaches in from the frame's edge. |
| `air` | 0.45 | How far distance fades toward airColour, 0 to 1. |
| `airColour` | [0.93, 0.92, 0.9] | What distance fades toward. |
| `airDistance` | 120 | World units at which air is complete. |
| `paintedIn` | 1 | How much of the picture is laid, 0 to 1. Driven for you by paintIn(). |
| `revealMode` | 0 | 0 none, 1 from the centre, 2 along revealAngle. |
| `revealAngle` | 0 | Direction of the front for mode 2, in radians. |
| `revealSoft` | 0.06 | How long the wash trails the strokes. |
| `revealBase` | 0 | What unpainted areas show: 0 paper, 1 the game's own frame. |

## Print finish

| Value | Default | What it does |
| --- | --- | --- |
| `fisheye` | 0 | Lens bend. |
| `fringe` | 0.25 | Colour fringe toward the edges. |
| `grain` | 0.1 | Still grain. |
| `steady` | 0.86 | How much of last frame's paint is kept on each surface, 0 to 0.95. Higher is calmer; it needs an adapter that keeps a history (three.js does). |
| `boil` | 0 | Above 0, strokes are re-laid eight times a second. Leave at 0 unless the look is meant to shiver. |

## Flat pictures (2D games)

| Value | Default | What it does |
| --- | --- | --- |
| `flatEdge` | 0.22 | Colour difference that stops a stroke crossing an edge when there is no depth. |
| `flatPull` | 0.6 | The way strokes are pulled on a flat picture, in radians. |

## Checks

`helpers/brush-check.mjs` measures a restyle from captures, so it works the same for any
engine, 2D or 3D, first or third person. Shoot the same stretch twice, once as the game draws
it and once painted, at the same size and frame rate, frame for frame (a seeded replay, a
recorded input or a demo file). Then run `node helpers/brush-check.mjs before.mp4 after.mp4`
(it needs ffmpeg). It exits 1 and names each failure.

| Measure | Gate | What it says |
| --- | --- | --- |
| `paint` | at least 9 | Mean colour difference (ΔE, Lab) between matching frames. Below it the restyle cannot be told from the game. |
| `strokes` | at least 8 | The part of that difference at brush scale: laid strokes, line and dots. `grade` is the broad part (colour, value, shade). A high `paint` with low `strokes` is a colour grade, not a painting. |
| `flicker` | at most 2.2 | How much the painted picture changes from frame to frame over its quietest quarter, as a multiple of the game's own change. |
| `pop` | at most 1 % | Pixels that jump visibly between frames on those quiet frames, painted minus the game. |

Run `paint` and `strokes` on real play. Run `flicker` and `pop` on a still-camera pair as well:
three seconds with the camera held still while the world goes on moving. In a moving take the
camera's own motion swamps boiling strokes, so a restyle the owner called unplayable scored
about the same there as a calm one; in a still view it measured 4.3 times the game's change
against the calm one's 1.85.

The gates are the floor. Then set the painted frame beside a reference frame at thumbnail size:
every kind of surface (ground, walls, sky, the player's own weapon or character, enemies) must
read as painted, and everything the player must find must be as easy to find as in the game.
