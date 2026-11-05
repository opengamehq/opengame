import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// The SDK ships inside the build, from the same file: dependency the npm starters bundle.
// The page used to load /_og/sdk.js instead, which og-games serves only under a contract the
// live site is not on, so under 2026-11 it 404'd and the game found no OpenGame. Resolved
// before the compiler runs, so a missing SDK stops the build at once and says what to do.
const sdk = sdkGlobal();
mkdirSync('dist', { recursive: true });
const godot=process.env.GODOT_BIN || 'godot';
execFileSync(godot, ['--headless','--path','.','--import'], {stdio:'inherit'});
execFileSync(godot, ['--headless','--path','.','--export-release','Web','dist/index.html'], {stdio:'inherit'});
// The Web preset's html/head_include loads it before the engine, so main.gd's
// get_interface("OpenGame") finds it.
copyFileSync(sdk, 'dist/opengame-global.js');
copyFileSync(`${sdk}.LEGAL.txt`, 'dist/opengame-global.js.LEGAL.txt');

function sdkGlobal() {
  try {
    const path = fileURLToPath(import.meta.resolve('@opengamehq/sdk/global'));
    if (existsSync(path)) return path;
  } catch {}
  // A copy outside the repository keeps a file: link to a folder that is not there, and npm
  // install reports success anyway, so "run npm install" alone would send people in a circle.
  throw new Error(existsSync('node_modules/@opengamehq/sdk/package.json')
    ? 'The OpenGame SDK is installed but not built. Run npm run build in its packages/sdk folder, then build again.'
    : 'The OpenGame SDK is not installed. Install it as https://docs.opengame.io/quickstart describes, or inside the OpenGame repository run npm install here. Then build again.');
}
