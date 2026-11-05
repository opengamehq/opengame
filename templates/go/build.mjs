import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// The SDK ships inside the build, from the same file: dependency the npm starters bundle.
// The page used to load /_og/sdk.js instead, which og-games serves only under a contract the
// live site is not on, so under 2026-11 it 404'd and the game found no OpenGame. Resolved
// before the compiler runs, so a missing SDK stops the build at once and says what to do.
const sdk = sdkGlobal();
mkdirSync('dist', { recursive: true });
execFileSync('go', ['build', '-o', 'dist/game.wasm', '.'], { stdio: 'inherit', env: { ...process.env, GOOS: 'js', GOARCH: 'wasm' } });
const goroot=execFileSync('go',['env','GOROOT'],{encoding:'utf8'}).trim();
try { copyFileSync(`${goroot}/lib/wasm/wasm_exec.js`,'dist/wasm_exec.js'); } catch { copyFileSync(`${goroot}/misc/wasm/wasm_exec.js`,'dist/wasm_exec.js'); }
copyFileSync('shell.html','dist/index.html');
copyFileSync('opengame-sdk/web/lifecycle.js','dist/lifecycle.js');
copyFileSync('opengame.json','dist/opengame.json');
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
