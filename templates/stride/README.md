# stride starter

There is no upstream browser target for this engine. No build or compiled output is supplied. Port the game to KNI and start from the KNI starter (`templates/kni`).

Guide: the Engines page in the OpenGame docs (`/engines/overview`).

## Verify

After producing a real export, run `opengame check . --json` from a project whose `build.output` points to it. Read every finding. Deploy only to an authorized account; play the actual preview before submitting the release on the creator's request. OpenGame has not yet tested this starter end to end: uploaded, played in a browser and with platform services working.
