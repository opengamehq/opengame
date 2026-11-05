# pico8 starter

Export recipe requiring the installed editor, its web export module and any applicable licence. No compiled output or editor licence is supplied. Follow the engine guide, export into `dist/`, and check that real export.

Guide: the Engines page in the OpenGame docs (`/engines/overview`).

## Verify

After producing a real export, run `opengame check . --json` from a project whose `build.output` points to it. Read every finding. Deploy only to an authorized account; play the actual preview before submitting the release on the creator's request. OpenGame has not yet tested this starter end to end: uploaded, played in a browser and with platform services working.
