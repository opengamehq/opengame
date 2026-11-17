# opengame-performance changelog

## 1.1.2

`opengame setup` already installs `opengame-verification`; `opengame skills add . --skill opengame-verification` adds it to one project. (17 Nov 2026)

## 1.1.1

`landing-pacer.mjs` lets a frame whose promise rejects leave the queue, so two failed submits no longer hold every later frame; `stats()` counts them as `failed`.

## 1.1.0

New rules from LC, OS and OH for bare timing runs, pacing by what lands (with `landing-pacer.mjs`), draws counted per pass, uploads that never stall and whole-tab memory over long sessions. Frame budgets now count frames the engine ran because a page throttle never reaches a worker-thread engine (OS), resolution steps lower the world before the gameplay layer (OH, LC, OS), and a countdown may warm the first match once its map is shown (OS); a new reference covers three.js on WebGPU.

## 1.0.0

First public release, in the opengamehq/opengame repository and the OpenGame CLI.
