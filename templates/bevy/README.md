# bevy starter

Export recipe. There is no Bevy source here on purpose (`EXPORT.md` says why): build your own Bevy project for the web, then point `build.output` at its output. No compiled output is supplied.

Guide: the WebAssembly page in the OpenGame docs (`/engines/webassembly`).

## Verify

After producing a real export, run `opengame check . --json` from a project whose `build.output` points to it. Read every finding. Deploy only to an authorized account; play the actual preview before submitting the release on the creator's request. OpenGame has not yet tested this starter end to end: uploaded, played in a browser and with platform services working.
