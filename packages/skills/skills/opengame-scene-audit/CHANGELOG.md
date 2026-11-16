# opengame-scene-audit changelog

## 1.1.0

Adds what OG Snipers and Last Contact taught. The helper gains an `invisible` check
(colliders with nothing drawn, the complaint OG Snipers' owner repeated most) with its own
plant, and a `gridStep` tolerance so ties are measured on the vertex grid a format ships.
"No two faces in one plane" now counts grid steps rather than a fixed 2 mm, which passed
real ties on quantised geometry; "Freeze the frame and look closely" becomes "Stills catch
joins, never motion", and a new rule judges flicker on film on a stepped clock. Floating is
measured on what is drawn, collision is audited both ways, and every check is held to a
measure different from the fix's.

## 1.0.0

First public release, in the opengamehq/opengame repository and the OpenGame CLI.
