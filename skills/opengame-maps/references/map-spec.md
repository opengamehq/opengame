# The map spec and the parity list

One file per map, written before the geometry and kept as the authority afterwards.
Where the spec and the built map disagree, one of them is wrong, and the spec says
which. This template is OS's, cleaned; LC kept the same facts in a plan module the
build reads.

## Identity

Three to five facts that make the place itself, in words a stranger could check from
the map at minimap scale: "the silhouettes and colour blocks must survive at minimap
scale". A central structure, a colour, a landmark on the skyline, the one route
everyone remembers.

## Footprint and scale

Example rows:

| Measure | Value | Confidence | Source |
| --- | --- | --- | --- |
| Metres per pixel of the overhead | 0.1921 | measured, two anchors within 0.4% | anchor A, anchor B |
| Crossing time, spawn A to spawn B, walking | 21 s | measured, timed crossing | recording |
| Height of the central platform | 3.2 m | estimate | concept frame 4 |

Every row is tagged fact (from data you control), measured (from the reference, with how)
or estimate (a judgement, with why). A map honest only to plus or minus 20% says so here.

Scale to the player's body by crossing time, not by raw size. If the game's body is
smaller than the reference's, scale the whole map down, and give a mantle to any jump-up
the new jump cannot reach.

## Coordinates

A table of every named place with its coordinates: spawns, objectives, doors with their
widths and states, ladder tops, devices and their landings, perches. This table is the
authority; the geometry is built from it, and the parity list cites it.

## Lanes, perches and sightlines

Example rows:

| Lane | Count per side | Length | State | Notes |
| --- | --- | --- | --- | --- |
| North street | 1 | 62 m | open | must stay one lane: no second alley |
| Centre line | 1 | 236 m | broken by a 7 m rise | keeps long duels earned |

For each dominant perch, name its counter-perch or flank. For each line that must stay
broken, say what breaks it.

## Spawns

Each spawn with its coordinates, its first view direction (down the longest open line),
the reachable area behind it, and the sightlines it must not sit in.

## Player count

Walkable area divided by the area each player needs. OS measured 70 to 280 m² per player
at 32 players and capped its maps at 12 to 24 from that, rather than adding geometry.

## Owner rulings

Every ruling the owner made about this place, verbatim, with the date and the screenshot
it was about. A ruling about one building does not become a rule for every map.

## The parity list

One row per thing a player can do, written before editing (example rows):

| Item | Verb | Where | Camera | Proof | Present |
| --- | --- | --- | --- | --- | --- |
| Jump-up on the loading dock | jump up, see into both yards | (12.0, 1.4, -3.5) | cam-07, eye on collision at 1.62 m | walk log 07 | yes |
| East door | sprint through standing | (30.2, 0, 8.0), 1.4 by 2.3 m | cam-11 | walk log 11, control wall still blocks | yes |
| Launcher | ride to the marked landing | marker (40, 6, -12) | cam-15 | 22 throws, landing error 0.00 m | yes |

A staged camera that lands inside a solid is rejected and placed again. An item that
exists in code but no camera shows is missing. Blind judges mark each item present from
its frame alone, without the spec.
