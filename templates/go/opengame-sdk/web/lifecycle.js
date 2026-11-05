// Distributed unchanged with the native adapters. The SDK has one handler slot,
// so one native session owns it at a time, and a session sees only the results
// of requests it made. The core cannot cancel a promise, so a result that
// arrives after its session closed is dropped here instead.
(function () {
  if (globalThis.OpenGameNativeConnect) return;
  const owners = new WeakMap();
  // `connected` receives the session before the handler is installed, because
  // raw wasm entry points can be called by the synchronous state replay.
  globalThis.OpenGameNativeConnect = function (handler, connected) {
    const bridge = globalThis.OpenGame?.bridge;
    if (typeof window === 'undefined' || !bridge) throw new Error('OpenGame unavailable');
    if (owners.has(bridge)) throw new Error('OpenGame already has a native owner');
    const requests = new Set();
    let active = true;
    const check = () => { if (!active) throw new Error('OpenGame bridge is closed'); };
    const client = {
      request(op, json) {
        check();
        const id = bridge.request(op, json);
        requests.add(id);
        return id;
      },
      env: () => { check(); return bridge.env(); },
      player: () => { check(); return bridge.player(); },
      ready: () => { check(); bridge.ready(); },
      close() {
        if (!active) return;
        active = false;
        requests.clear();
        if (owners.get(bridge) === client) {
          owners.delete(bridge);
          bridge.setHandler(null);
        }
      },
    };
    owners.set(bridge, client);
    try { connected?.(client); } catch (error) { client.close(); throw error; }
    if (!active) return client;
    try {
      // Installing the handler replays player, pause, mute and fullscreen state.
      bridge.setHandler((kind, id, name, json) => {
        if (!active || (kind === 'result' && !requests.delete(id))) return;
        handler(kind, id, name, json);
      });
    } catch (error) { client.close(); throw error; }
    return client;
  };
})();
