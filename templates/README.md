# Browser-game starters

`catalog.json` maps each engine or language guide to its starter and prerequisites. A starter is source or an export recipe, not evidence that the engine passed hosting checks.

- `npm`: a browser source project. Install its declared dependencies before building.
- `toolchain`: source that needs an external compiler or engine export tool.
- `editor`: an export recipe requiring an installed editor and, where applicable, a licence.
- `export`: an editor-export recipe without a checked-in compiled game.
- `payload`: a real game payload and a locally installed runtime are required.
- `unavailable`: the engine has no upstream web target. There is no build to run.

Run `npm run check:templates` for available projects. Use `--require-all` when the build environment is expected to have every prerequisite; missing exports or tools then fail instead of passing as skips. The report prints skipped prerequisites separately from builds checked by the CLI.

Unreal exports are not accepted yet.

The prerequisite-check regressions are in `templates/tests/check-catalog.test.mjs`. Run them with `node --test templates/tests/check-catalog.test.mjs`. They check missing exports/tools and ESM package discovery; they do not compile a game or establish hosting support.
