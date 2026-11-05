# kaigen starter

Export recipe requiring the installed engine, its web add-on and any applicable licence. No compiled output or licence is supplied. Build with `hz/hzbuild wasm --release`, assemble the page in `dist/` with the SDK and `opengame-kaigen.js`, and check that real build.

`opengame-kaigen.js` connects the game to OpenGame services through the engine's log and its dropped-file queue, because Kaigen game code cannot call JavaScript. The engine guide lists the lines the game logs and the file the page drops.

Guide: the Kaigen page in the OpenGame docs (`/engines/kaigen`).

## Verify

After producing a real export, run `opengame check . --json` from a project whose `build.output` points to it. Read every finding. Deploy only to an authorized account; play the actual preview before submitting the release on the creator's request. This starter has no game in it. The transport it uses (log lines out, dropped files in) is the one OG Clash, a full Kaigen game, uses; test your own build on its private preview before telling anyone it works.
