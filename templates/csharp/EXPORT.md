# Browser export

Install a .NET SDK with the `wasmbrowser` template and its matching `wasm-tools` workload, plus Node.js. Run `npm run build` from this starter. That command creates or reuses `.build/browser`, references the local `opengame-sdk` source project, publishes Release output, finds the browser root containing `_framework/dotnet.js`, and copies it into `dist/`.

The build then installs this starter's host files and copies `opengame-sdk/wwwroot/opengame.js` plus `lifecycle.js` into `dist/opengame-sdk/`. The C# consumer imports `/opengame-sdk/opengame.js`; that module imports `./lifecycle.js` before attaching the native callback. It also copies the SDK's `opengame-global.js` and its notice from the `@opengamehq/sdk` dependency into `dist/`, and `index.html` loads it before .NET starts. Run `npm install` before the first build. No manual helper inclusion is required.

Two settings keep the export inside OpenGame's file rules. The build publishes with `-p:CompressionEnabled=false`, because the `.br` and `.gz` copies .NET writes for encoding-aware servers include `blazor.boot.json.br`, `icudt_*.dat.gz` and `*.pdb.gz`, which OpenGame refuses as nested archives, and the runtime requests the plain files anyway. And `index.html` carries an import map that sends `process` and `module` to `node-only.js`: `_framework/dotnet.js` imports both by bare name for Node, this starter never loads them in a browser, and `opengame check` refuses a bare import with no map behind it. If you replace `index.html`, keep that map and copy `node-only.js`. If you map a library too, add it to the same map rather than a second one: the check resolves names against only the first.

`opengame.json` already points `build.output` at `dist`. Run `opengame dev .` with the approved CLI to serve the local export, and `opengame check . --json` to check the built files. The page carries its own SDK, so it does not depend on the platform injecting `/_og/sdk.js`, which the live site does only for a threaded release.

Record the tool versions and export settings with the resulting fixture. Run the actual engine in a browser before counting this recipe as implemented.
