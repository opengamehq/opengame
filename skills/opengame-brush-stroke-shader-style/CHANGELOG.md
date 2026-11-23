# opengame-brush-stroke-shader-style changelog

## 1.0.2

- The helpers' JSDoc object types open with a space between their two braces, so the published
  package carries no double brace, which the release check reads as a template the renderer
  skipped (it refused skills 1.8.0 for it).

## 1.0.1

- `helpers/brush-check.mjs` refuses a malformed capture (a frame of the wrong size, a size or
  sample step that is not a whole number) and fails any measure that is not a number, which
  until now passed every gate.
- `helpers/brush-core.js`: turning calm mode on drops a hit frame already asked for or part
  drawn, flash and lens push alike.
- `helpers/brush-three.js` cuts a shape the way the visible material does: the map by its
  alpha and an `alphaMap` by its green channel, as three.js reads one, so the holes in a
  fence or leaf card masked by a grey `alphaMap` are no longer painted over.

## 1.0.0

The first release: a scheme per level, roles, strokes that stay on surfaces, stepped values with coloured shade, the line, halftone, paper, a lettered HUD and drawn feedback, with the stroke pass for three.js and a plan for other engines. Its defaults are the middle ground between painted at a glance and steady to play, and `helpers/brush-check.mjs` measures both from any engine's captures.
