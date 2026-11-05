(function () {
  let queue = [];
  let binding = null;
  function client() {
    if (!binding) throw new Error('OpenGame RenPy host is detached');
    return binding;
  }
  globalThis.OpenGameRenpyHost = {
    available: () => typeof window !== 'undefined' && !!globalThis.OpenGame?.bridge && !!globalThis.OpenGameNativeConnect,
    attach() {
      if (binding) throw new Error('OpenGame already has a RenPy owner');
      binding = globalThis.OpenGameNativeConnect((kind, id, name, json) => queue.push({ kind, id, name, json }));
    },
    request: (op, json) => client().request(op, json),
    env: () => client().env(), player: () => client().player(), ready: () => client().ready(),
    poll() { client(); const batch = queue; queue = []; return batch; },
    close() { const old = binding; binding = null; queue = []; old?.close(); },
  };
})();
