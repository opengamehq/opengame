(function () {
  // A local FFI queue, not a second platform protocol. Lua cannot be called
  // back from JS on every engine, so results and events wait here until poll.
  globalThis.OpenGameLuaTransport = function () {
    let queue = [];
    let closed = false;
    let binding;
    function check() { if (closed) throw new Error('OpenGame Lua host closed'); }
    const transport = {
      available: () => !closed,
      request: (op, json) => { check(); return binding.request(op, json); },
      env: () => { check(); return binding.env(); },
      player: () => { check(); return binding.player(); },
      ready: () => { check(); binding.ready(); },
      poll: () => { check(); const batch = queue; queue = []; return JSON.stringify(batch); },
      close: () => {
        if (closed) return;
        closed = true;
        queue = [];
        binding.close();
      },
    };
    binding = globalThis.OpenGameNativeConnect((kind, id, name, json) => { queue.push({ kind, id, name, json }); });
    return transport;
  };
})();
