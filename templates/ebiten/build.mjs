import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync } from 'node:fs';
mkdirSync('dist', { recursive: true });
// go.mod and go.sum are complete and committed, so the build reads them and never
// rewrites them. -mod=mod used to resolve the module graph on every build, which left the
// repository's own copy dirty after each check and blocked a deploy until somebody reset it.
execFileSync('go', ['build', '-o', 'dist/game.wasm', '.'], { stdio: 'inherit', env: { ...process.env, GOOS: 'js', GOARCH: 'wasm' } });
const goroot=execFileSync('go',['env','GOROOT'],{encoding:'utf8'}).trim();
try { copyFileSync(`${goroot}/lib/wasm/wasm_exec.js`,'dist/wasm_exec.js'); } catch { copyFileSync(`${goroot}/misc/wasm/wasm_exec.js`,'dist/wasm_exec.js'); }
copyFileSync('shell.html','dist/index.html');
