# opengame-world-physics changelog

## 1.1.0

Adds what OG Snipers and Last Contact taught. "Every visible solid blocks or says why not"
is rewritten as "Collision is the picture, in both directions", with separate body and
shot shapes, because both games' most repeated complaint was the invisible wall. New rules:
a pipeline that drops collision fails the build, art passes never move gameplay geometry,
openings sized to the largest body and proven by walking past them, and step heights set
from the smallest real obstacle. The measured failures now include both games' checks.

## 1.0.0

First public release, in the opengamehq/opengame repository and the OpenGame CLI.
