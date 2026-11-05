// The SDK's global build, bundled from the same file: dependency the npm starters use.
// It is imported first so window.OpenGame exists before the Lua host looks for it. The
// page used to load /_og/sdk.js, which og-games serves only under a contract the live
// site is not on, so under 2026-11 it 404'd and the game threw before drawing anything.
import '@opengamehq/sdk/global';
import { LuaFactory } from 'wasmoon';
import wasmUrl from 'wasmoon/dist/glue.wasm?url';
import source from '../main.lua?raw';
import codec from '../json.lua?raw';
import bridge from '../opengame-sdk/src/opengame.lua?raw';
import wasmoon from '../opengame-sdk/hosts/wasmoon.lua?raw';
import { installWasmoon } from '../opengame-sdk/hosts/wasmoon.mjs';

const lua = await new LuaFactory(wasmUrl).createEngine();
const detach = installWasmoon(lua);
await lua.doString(`
package.preload['json'] = function(...) ${codec}\nend
package.preload['opengame'] = function(...) ${bridge}\nend
package.preload['opengame.hosts.wasmoon'] = function(...) ${wasmoon}\nend
`);
await lua.doString(source);
let stopped = false;
let work = Promise.resolve();
function inLua(code) {
  const result = work.then(() => stopped ? undefined : lua.doString(code));
  work = result.catch(error => {
    stopped = true;
    detach();
    console.error('Lua game failed.', error);
  });
  return result;
}
async function tick() {
  if (stopped) return;
  try { await inLua('poll()'); } catch { return; }
  if (!stopped) requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
document.querySelector('#target').addEventListener('click', async () => {
  try {
    const points = await inLua('return collect()');
    if (!stopped) document.querySelector('#score').textContent = String(points);
  } catch { /* inLua reports the failure and stops delivery. */ }
});
window.addEventListener('pagehide', () => {
  stopped = true;
  // Keep the VM alive until a suspended call finishes, but stop future bridge
  // delivery immediately. No queued poll may enter a closed Lua state.
  detach();
  void work.finally(() => lua.global.close());
});
