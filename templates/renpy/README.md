# Ren'Py target

A playable short story with a title screen, shot/wait choices, score display,
and an OpenGame session. Each shot submits the current score to the `targets`
board. Desktop play works without web services and says so on screen.

Copy this entire starter as the Ren'Py project. Its `game/` includes the Python
and `.rpy` adapter; `opengame-sdk/` retains the canonical adapter, JS host,
lifecycle helper and license. No runtime file is read from a sibling
`integrations/` directory. `game/opengame_session.py` holds browser state outside
the rollback/save store and polls results through a screen timer.

## Prerequisites and export

Use the Ren'Py 8.3.7 SDK and its matching Web support package as the reference
toolchain. The export shell ordering was read from those upstream sources;
newer SDK versions still need their own validation. Install Python 3.8 or newer
for the packaging scripts, and the approved OpenGame CLI for check/dev/deploy.
No Node, public SDK npm package or provider key is required.

In the Ren'Py launcher, choose this project, install Web support if needed, and
choose **Web → Build Web Application**. Export to a directory separate from
`dist/`. This must be a real engine export containing `index.html`,
`renpy-pre.js`, `renpy.js`, wasm and `game.zip`, built from the supplied `game/`
sources. The launcher remains responsible for compilation and its runtime.

After every export, run this one command from the project directory:

```bash
python3 scripts/package-web.py /absolute/path/to/renpy-target-1.0-web
```

That script checks the archive contains the consumer and current Python
adapter, copies the entire genuine export to `dist/`, copies the browser SDK, the
JS host and the lifecycle helper, and inserts these scripts before Ren'Py starts:

```html
<script src="opengame-global.js"></script>
<script src="opengame-sdk/lifecycle.js"></script>
<script src="opengame-sdk/opengame.js"></script>
```

The SDK comes from the package archive's `sdk/opengame-global.js` and its `.LEGAL.txt`
notice: keep that `sdk/` folder in the project, or pass `--sdk` with the file's path.
Inside the OpenGame repository the script uses the built `packages/sdk` instead.
OpenGame adds `/_og/sdk.js` only to a release whose scan finds threads, so the game
ships its own copy. There is no manual shell edit. The original `game.zip`, wasm and generated
runtime remain intact. The packager replaces only its own prior `dist/`;
move an unrelated `dist/` aside first. A missing/stale adapter is an error,
requiring a fresh editor export, not a patched compiled archive.

## Check and publish

```bash
python3 scripts/publish.py check
opengame dev .
# After reviewing the local game and every check finding:
python3 scripts/publish.py deploy
opengame status --watch --json
```

`OPENGAME_BIN` can select the approved CLI executable; otherwise scripts use
`opengame` on PATH. `opengame dev .` serves `dist/` with the game page's headers, and the
SDK the packaging script copied runs platform services as a local mock there. The manifest intentionally has no
`build.command`: run the editor export and packaging command first, then check
without `--build`.

Deploy creates a private release and never submits it. Play that release's
preview. Only when the creator requests submission, run
`opengame submit --release <releaseId> --json` and complete certification.
Keep `.opengame/` across retries.

See [EXPORT.md](EXPORT.md) for the exact rebuild and validation steps. No
compiled output is supplied. OpenGame has not yet built this starter or tested
it end to end: uploaded, played in a browser and with platform services working.
Guide: the Engines page in the OpenGame docs (`/engines/overview`).

Packaging stages a complete replacement under `.build/` before swapping the
owned `dist/`. A failed copy preserves the prior export; the next invocation
recovers any interrupted swap without treating partial files as a new export.
