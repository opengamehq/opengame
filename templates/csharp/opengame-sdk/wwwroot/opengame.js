import './lifecycle.js';
let client = null;
function binding() {
  if (!client) throw new Error('OpenGame .NET bridge is closed');
  return client;
}
export function attach(handler) {
  if (client) throw new Error('OpenGame already has a .NET owner.');
  client = globalThis.OpenGameNativeConnect((kind, id, name, json) => handler(JSON.stringify({ kind, id, name, json })));
}
export function detach() { const old = client; client = null; old?.close(); }
export function request(op, json) { return binding().request(op, json); }
export function env() { return binding().env(); }
export function player() { return binding().player(); }
export function ready() { binding().ready(); }
