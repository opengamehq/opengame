/** LittleJS calls this plugin from its existing init/update/render callbacks.
 * No engine globals are patched, so multiple scenes still share one SDK. */
export function createOpenGamePlugin({ onPause = () => {}, onMute = () => {} } = {}) {
  let client = null, initialization = null, disposed = false, drawn = false, sentReady = false;
  const state = { status: 'idle',
    get environment() { return disposed ? null : (client?.env ?? null); },
    player: null, paused: false, muted: false, fullscreen: false };
  const subscriptions = [], pending = new Set(), rooms = new Set();
  function requireClient() {
    if (disposed || !client) throw Object.assign(new Error('OpenGame is unavailable.'), { code: disposed ? 'disposed' : 'unavailable' });
    return client;
  }
  function reportReady() {
    if (!disposed && drawn && state.status === 'ready' && !sentReady) { sentReady = true; client.ready(); }
  }
  async function init(options) {
    if (disposed) return { ok: false, error: 'disposed' };
    if (initialization) return initialization;
    client = globalThis.OpenGame;
    if (!client?.init || !client?.multiplayer) {
      client = null; state.status = 'unavailable'; return { ok: false, error: 'unavailable' };
    }
    let settle;
    initialization = new Promise(resolve => { settle = resolve; });
    state.status = 'loading';
    const attach = register => {
      if (disposed) return;
      const off = register();
      if (disposed) off(); else subscriptions.push(off);
    };
    try {
      // Save initialization first: immediate pause/mute replay may call back
      // into this plugin or dispose it before subscription registration returns.
      attach(() => client.player.onChange(value => { state.player = value; }));
      attach(() => client.onPause(value => { state.paused = value; onPause(value); }));
      attach(() => client.audio.onHostMute(value => { state.muted = value; onMute(value); }));
      attach(() => client.fullscreen.onChange(value => { state.fullscreen = value; }));
      if (disposed) settle({ ok: false, error: 'disposed' });
      else Promise.resolve(client.init(options)).then(environment => {
        if (disposed) { settle({ ok: false, error: 'disposed' }); return; }
        state.status = 'ready'; reportReady();
        settle({ ok: true, value: environment });
      }, () => {
        if (!disposed) state.status = 'unavailable';
        for (const off of subscriptions.splice(0)) off();
        settle({ ok: false, error: disposed ? 'disposed' : 'unavailable' });
      });
    } catch {
      for (const off of subscriptions.splice(0)) off();
      if (!disposed) state.status = 'unavailable';
      settle({ ok: false, error: disposed ? 'disposed' : 'unavailable' });
    }
    return initialization;
  }
  async function connect(method, code, options = {}) {
    const service = requireClient().multiplayer;
    const controller = new AbortController(); pending.add(controller);
    const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
    try {
      const room = await (method === 'join' ? service.join(code, { ...options, signal }) : service[method]({ ...options, signal }));
      if (disposed) { room?.close(); throw Object.assign(new Error('Plugin disposed.'), { code: 'disposed' }); }
      if (room && !room.isClosed) {
        rooms.add(room);
        const off = room.on('close', () => { rooms.delete(room); off(); });
      }
      return room;
    } finally { pending.delete(controller); }
  }
  return Object.freeze({
    state,
    init,
    // Call after drawing the first frame a player can use, not after loading assets.
    afterRender() { drawn = true; reportReady(); },
    leaderboard: key => requireClient().leaderboard(key),
    // The SDK's own instance, so ids declared in opengame.json and the game_reported label are its.
    achievements: () => requireClient().achievements,
    track: (name, props) => requireClient().track(name, props),
    signIn: () => requireClient().player.requestSignIn(),
    requestFullscreen: () => requireClient().fullscreen.request(),
    openLink: url => requireClient().openLink(url),
    host: options => connect('host', undefined, options),
    join: (code, options) => connect('join', code, options),
    joinInvite: options => connect('joinInvite', undefined, options),
    dispose() {
      if (disposed) return;
      disposed = true; state.status = 'disposed';
      for (const controller of pending) controller.abort();
      pending.clear();
      for (const room of [...rooms]) room.close();
      rooms.clear();
      for (const off of subscriptions.splice(0)) off();
    },
  });
}
