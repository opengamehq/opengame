# Reloads and hands in the player's picture

How LC and OS staged reloads and kept hands on the gun, for "Each reload is climbed gun
by gun" and "Hands keep one size and one material" in `SKILL.md`. LC used a camera on
the player's chest; OS a conventional eye camera. Numbers are theirs; measure your own.

## The ledger

One row per weapon, two reloads per row (empty and with rounds left), refitted versions
too. Seven points scored 0 to 10, pass at 9 on every one:

| Point | What it asks |
|---|---|
| Drill | The real sequence for this mechanism, in order, nothing skipped |
| Picture | The work is in frame, the weapon under a third of the picture, the work in its lower third |
| Hands | A hand is at work through the reload; each action begins and ends with a hand travelling |
| Wrists | Wrists, elbows and forearms inside the natural band (`opengame-characters`) |
| Motion | Nothing pops, teleports, slides on rails or whirls over the lens, at 60 fps |
| Parts | Moving parts are separate objects and really move |
| Light | The work is lit; gloves are never the brightest thing in frame |

Hard limits LC added: sleeve and glove together under a sixth of the picture; no finger
through metal deeper than 1.5 mm; wrist within 70 degrees bent and 30 to the side (a
simpler pair than the per-axis joint limits in `opengame-characters`, which also apply).
Each fault names the stream or file that owns it. Read the films at speed first, then at
a quarter speed. Calibrate the ledger against the owner: LC's owner accepted all eight
pistols while the tester had scored the M1911 6/7/5/7/4/5/5; the director's reading was that
the owner judges the whole act at speed in the player's own picture, not a fingertip at
one frame. When the owner
passes what the bar fails, move the bar.

## Staging (LC)

- **Stance by the magazine well.** Place the weapon so the well sits in the picture, not
  so the hand is comfortable.
- **Cant long arms toward the lens** and keep the cant through the stage: rolled 1.2 rad,
  12 cm out, 6 cm right, muzzle up 0.15 rad. A canted M16 took 7.7% of the picture;
  upright it took 19 to 20%. Never swing a long gun through end-on: 12 end-on frames read
  as the rifle flicked over the lens.
- **Nothing within 25 cm of the lens** while a long arm is staged for a reload, stricter
  than the 9 to 16 cm floors that hold at rest (`SKILL.md`, the lens floor rule).
- **Hand paths are timed** round the weapon, 0.25 to 0.33 s, and any target jump over
  8 cm becomes a timed, eased travel (an M1897 hand had teleported 305 mm).
- **Hand parts over as the hand arrives, never by the clock.**
- **The magazine leaves empty and arrives full** through one carried part and a draw
  range on its rounds, its mouth within about 40 degrees of the lens for 6 frames.
- **A rock when a magazine is torn out** and a kick when a bolt runs forward: 8 to 10 mm
  and 4 degrees, doubled because 10 px of 1790 did not read.
- **Empty and tactical differ**: on an empty pistol the slide sits on its stop, is drawn
  overhand, and is released 0.15 s after the rack event.
- **Every action begins and ends with a hand travelling**, about a third of a second in
  and a third out, eased, so nothing appears or vanishes. This is what made the pistol
  reload the one the owner accepted.
- **Light the work.** Reloads indoors went near-dark because the chest lamp lit the wall
  above the hands: "a dark picture through a reload does not stand".
- **Check the mesh first.** A cocking handle fused into the receiver cost two leads
  eleven placings; cut moving parts out by boolean (the magazine whole with its end
  walls, handles whole) before animating any hand.

## Contact audit (OS)

Rebuild logged frames from the real models offline and measure how far each glove
vertex sits inside the gun, past the glove's own idle penetration. OS flagged clips over
6 mm. It found bolt handles rotating into the stock (fixed by a table of bolt-handle positions per rifle), a
reload path 16 cm under the rifle and a hand path through the optic; clipped game time fell from
about 24 s to 11 s. The test driver pulsed bolt presses every 0.6 s because the engine ignored
presses mid-rechamber.

- Sample every frame. Eight frames per bolt missed a black patch on the mitten through
  30% of the cycle on 7 rifles.
- Log the drawn glove scale every frame. One scale held: exactly 1.1 over 15,382 frames.
- Paint back faces one colour in a debug view to find exposed interiors.
- One material and one fill light for hands in every state: fists and armed gloves had
  differed 5x in fill.

## Finger solve (LC)

- Named skin patches (web, palm, heel, thenar) placed at millimetre positions on the
  weapon's own vertices; a six-degree-of-freedom search per finger, each closed until
  every bone bears; the thumb searched from 729 seeds; the support hand solved over the
  firing hand's glove.
- Pass: nothing deeper than 1.5 mm, counted over every vertex. A bounding-volume inside
  test was trusted only within 8 mm.
- Count on the game's own rig: the solver's 2.9 mm was 7.9 mm on the game's stretched
  forearm.
- Fix a bent wrist by moving the elbow, not the hand (`opengame-characters`).

## The glove itself (LC)

A photoreal style needed five-finger gloves. LC built them by script from a CC0 human
base: the glove as a design in fields measured from the bone frames, about 1,000
stitches as geometry sunk in a trough, a sleeve draped by a cloth solver at a 105 degree
elbow and un-skinned back to rest, a tight-elbow morph, five baked maps at 4096 and a
closed-hand fold map blended finger by finger. 14.1k triangles a glove, 12.7k a sleeve.
"Nothing regular": every repeat has a wobble on its phase. A stylised game can use a
thumb and a mitten instead (`opengame-characters`).
