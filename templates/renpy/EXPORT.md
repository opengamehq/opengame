# Rebuilding the Ren'Py browser fixture

Use Ren'Py 8.3.7 with its matching Web support. Open this starter as a project
in the launcher and build its Web application after each source change.
Keep that original export outside `dist/` so packaging cannot overwrite it.
These steps are assigned to the validating parent/creator and have not run
as part of this source implementation.

From `templates/renpy/`, or the root of the copied project:

```bash
# Substitute the actual directory returned by the genuine launcher export.
python3 scripts/package-web.py /absolute/path/to/renpy-target-1.0-web
python3 scripts/publish.py check
opengame dev . --contract 2027-01
```

To rebuild, edit `game/`, build Web again in the launcher, and repeat exactly
those commands. The packaging script replaces its own prior output and refuses
an unrelated `dist/`. It verifies `game.zip` contains the current
`opengame.py` and `opengame_session.py` bytes and the compiled/source `.rpy`
entries. It never recompiles or rewrites the archive itself.

Source fixture: `game/{script,options,screens,opengame}.rpy`,
`game/{opengame,opengame_session}.py` and `opengame-sdk/`. Generated fixture:
the complete `dist/` export including the unchanged `game.zip`, original wasm
and runtime, patched `index.html`, and
`opengame-sdk/{lifecycle.js,opengame.js,LICENSE}`. Retain the upstream runtime's
own license files. The script ordering must be SDK, lifecycle, JS host, then
the original Ren'Py scripts. Do not upload just the Python or story files.

Parent runtime checks: start at the title screen, observe init/ready after a
painted interaction, choose Start, take a shot, and inspect the board result.
Exercise waiting and returning to the menu, then start again and confirm the
client reconnects without stale callbacks or requests. Host pause must block
story advancement; its event payload is a bare JSON boolean. Resume, exercise
host mute/unmute and confirm volume restoration if audio is added. Quit or
navigate away with a request pending, and confirm cleanup.

The web runtime uses Ren'Py's real emscripten evaluation API. Its CSP/export
variant must remain compatible with the selected OpenGame runtime contract;
do not weaken hosting policy to make an incompatible export pass. Local checks
are followed by the real CLI upload, scan, preview, review and public-path
validation. They do not establish Gate H or S on their own.
