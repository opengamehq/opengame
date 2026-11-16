# opengame-stability changelog

## 1.1.0

New rules for a structural guard per crash class (OS), no late timer that moves the game and no silent fallback (OH, LC), one composite per frame (OH) and a fallback renderer booted on every default change (LC). The release gate now counts a recovery as a crash (OS), and the soak, watchdog, recovery and deploy rules carry OS, LC and OH numbers.

## 1.0.0

First public release, in the opengamehq/opengame repository and the OpenGame CLI.
