import './lifecycle.js';
import './transport.js';

/** Install before loading opengame.lua; dispose before lua.global.close(). */
export function installWasmoon(lua) {
  const transport = globalThis.OpenGameLuaTransport();
  const names = ['available', 'request', 'env', 'player', 'ready', 'poll', 'close'];
  for (const name of names) lua.global.set(`__og_wasmoon_${name}`, transport[name]);
  return () => {
    transport.close();
    for (const name of names) lua.global.set(`__og_wasmoon_${name}`, undefined);
  };
}
