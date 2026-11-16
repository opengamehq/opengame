# Matching a reference, measured

When the owner hands over a film, a trailer, concept art or a mood board, the reference
is the acceptance bar. It only works as one once it has been turned into statements and
numbers, because "make it look like the video" cannot be checked and an adjective in a
note ("darker", "a bit trippy") cannot be tuned. This is the method LC ended up running
for its concept film, with OH's and OS's measurements beside it. Study the reference's
method and measure its picture; never copy its code, art or files into the game.

## 1. Cut the reference into stills you can lay side by side

```bash
# One frame every five seconds, tiled four by three at 640 by 360 a tile.
ffmpeg -i reference.mp4 -vf "fps=1/5,scale=640:360,tile=4x3" sheets/sheet-%02d.png
```

Add six to eight hand-picked stills of the moments that matter most. LC worked from 180
stills and 10 sheets.

## 2. Find the reference's frames of the same state

For each state you work on (rest, aim, reload, night with the lamp off, night with the
lamp on, an enemy at arm's length, a friend at 3 m), find the reference frames of that
same state before ruling anything. LC once ruled the resting pistol from the film's
aiming frames; the owner sent a rest frame, with the pistol in the bottom fifth.

## 3. Measure, layer by layer

| Layer | What to measure | Example (game) |
| --- | --- | --- |
| Light levels | Box luminance at fixed places, frame median | Forest 0.009 to 0.020 of white, sky 57 to 80 of 255, lamp pool tops 111 to 124 (LC) |
| Colour of the dark | RGB of the darkest readable surface | Snow at 15 m about (84, 83, 106), lilac (LC) |
| Surface colour | Channel ratios, not hue by eye | Dirt G/R 0.80, B/R 0.54 (OS) |
| Held object | Share of frame width, where the hands sit | Pistol 4.7% of the width (LC) |
| Strokes | Count per face, size in pixels at a known width | 5 to 15 a face at 40 to 120 px on 1600 wide (OH) |
| Halftone, paper | Dot size, where dots may appear, bare-paper share | About 6 px, core shadow only, 30 to 40% paper (OH) |
| Lens | Field of view, barrel, rim, fringe | 104 degrees (OH); barrel 0.36, rim 0.885 (LC) |
| Effects | Each parameter of the effect, with its timing | Tape grain 0.05 at 4 steps per 0.5 s (LC) |

## 4. Write the targets as numbers, and say where the owner overrides

Put the numbers in the look page. Where the owner's newer words differ from the
reference, the owner wins, and the page says so in a sentence. LC's director read the film
as "a readable cold blue"; the owner's "make it scarier" set the middle of the frame with the
lamp off to 6 to 9 of 255, and that line in the page names both.

Readings move with time of day and weather (LC's night read 11.7 against 15.6 of 255 at
one stand a weather minute apart), and with the population: an enemy in the beam moved
LC's meter by 0.8 of a stop. Take readings at a fixed weather time with enemies present.

## 5. Shoot the game the same way and put both in one picture

Same state, the owner's window shape, on the owner's path, at native size and
unbrightened. Reference on the left, game on the right, one image.

## 6. Grade every kind of visible thing

An inventory row per kind of thing (each weapon, each enemy, the ground, each prop
family), marked placeholder, passable or final. Only a close capture beside the
reference promotes a row. LC ended with 0 of 73 guns final after many "passable" ones,
and the inventory is what made that honest.

## 7. Judges compare like with like

Judges and playtesters compare game frames with reference frames "of the same kind of
moment", never a still of the game with a frame from a different state.

## What it does not catch

The method made LC's darkness, pistol size and lens right. It did not make the hands,
reloads, finishes or fire right, because those failed at speed and in motion, which
stills and sheets do not show. Judge anything that moves on film at real speed
(`opengame-verification`).
