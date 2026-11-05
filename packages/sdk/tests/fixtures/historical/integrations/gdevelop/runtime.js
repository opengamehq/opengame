/* Source for the onFirstSceneLoaded JavaScript event in OpenGame.json.
 * The extension embeds this file; an exported game needs no extra script. */
function installOpenGameExtension(gdjs) {
  if (gdjs.__openGameServicesV1) return;
  // A paused or pushed scene keeps receiving room messages it is not draining, so the
  // event queue drops its oldest entries past this size rather than growing until the
  // tab runs out of memory. DroppedEvents reports how many went.
  const EVENT_QUEUE_MAX = 1024;
  const OPEN_OPERATIONS = ["room.host", "room.join", "room.joinInvite"];
  const states = new WeakMap();
  let nextRoom = 0, nextRequest = 0;
  const initialResult = () => ({ id: 0, tag: "", operation: "", result: { ok: false, error: "unavailable" } });
  const initialEvent = () => ({ name: "", room: 0, value: null, bytes: null });
  const get = scene => states.get(scene);
  function state(scene) {
    let value = get(scene);
    if (!value) {
      value = { sdk: null, disposed: false, rooms: new Map(),
        controllers: new Set(), pendingInits: new Set(), subscriptions: [], results: [], events: [], droppedEvents: 0, result: initialResult(), event: initialEvent(),
        paused: false, muted: false, fullscreen: false };
      states.set(scene, value);
    }
    return value;
  }
  const error = code => Object.assign(new Error(), { code });
  // Thrown errors and returned failures (rate_limited, say) both get the catalogue hint.
  // The global is the fallback for a scene that has not bound the SDK yet.
  const catalogue = s => (s.sdk ?? globalThis.OpenGame)?.errorCatalogue ?? [];
  function hinted(s, result) {
    if (!result || result.ok !== false || result.reason) return result;
    const entry = catalogue(s).find(row => row.code === result.error);
    return entry ? { ...result, reason: entry.hint } : result;
  }
  function failure(s, value) {
    const code = value && value.code;
    if (catalogue(s).some(row => row.code === code)) return hinted(s, { ok: false, error: code });
    return { ok: false, error: ["unavailable", "closed", "invalid_request", "invalid_message", "message_too_large"].includes(code) ? code : "invalid_request" };
  }
  function object(text) {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw error("invalid_request");
    return value;
  }
  // An empty meta or props field means "none", not a JSON document to reject.
  const optional = text => (typeof text === "string" && !text.trim() ? undefined : object(text));
  const room = (s, handle) => {
    const record = s.rooms.get(handle);
    if (!record) throw error("closed");
    return record.room;
  };
  const snapshot = (handle, r) => ({ room: handle, code: r.code, role: r.role, local: r.local,
    inviteUrl: r.inviteUrl, maxPlayers: r.maxPlayers, self: r.self, peers: r.peers,
    phase: r.phaseState, readiness: r.readyState, closed: r.isClosed });
  function event(s, name, handle, value, bytes = null) {
    if (s.disposed) return;
    s.events.push({ name, room: handle, value, bytes });
    if (s.events.length > EVENT_QUEUE_MAX) {
      const excess = s.events.length - EVENT_QUEUE_MAX;
      s.events.splice(0, excess);
      s.droppedEvents += excess;
    }
  }
  function bind(s) {
    if (s.sdk) return s.sdk;
    const sdk = globalThis.OpenGame;
    if (!sdk?.multiplayer || typeof sdk.init !== "function") throw error("unavailable");
    if (s.subscriptions.length) return sdk;
    s.subscriptions.push(sdk.player.onChange(value => event(s, "player", 0, value)));
    s.subscriptions.push(sdk.onPause(value => { s.paused = value; event(s, "pause", 0, value); }));
    s.subscriptions.push(sdk.audio.onHostMute(value => { s.muted = value; event(s, "mute", 0, value); }));
    s.subscriptions.push(sdk.fullscreen.onChange(value => { s.fullscreen = value; event(s, "fullscreen", 0, value); }));
    return sdk;
  }
  function opened(s, r) {
    if (!r) return null;
    if (s.disposed) { r.close(); throw error("disposed"); }
    if (r.isClosed) throw error("closed");
    const handle = ++nextRoom;
    const record = { room: r, subscriptions: [] };
    s.rooms.set(handle, record);
    const on = (name, listener) => {
      if (r.isClosed || s.disposed) return;
      const off = r.on(name, listener);
      if (r.isClosed || s.disposed) off(); else record.subscriptions.push(off);
    };
    on("close", reason => {
      s.rooms.delete(handle);
      for (const off of record.subscriptions.splice(0)) off();
      event(s, "room.close", handle, { reason });
    });
    on("join", peer => event(s, "room.join", handle, { peer }));
    on("leave", (peer, reason) => event(s, "room.leave", handle, { peer, reason }));
    on("message", (peer, data, channel) => {
      if (data instanceof Uint8Array) event(s, "room.message", handle, { peer, channel }, Uint8Array.from(data));
      else event(s, "room.message", handle, { peer, channel, data });
    });
    for (const name of ["phase", "readiness", "clock", "signalling", "members", "configuration"])
      on(name, value => event(s, "room." + name, handle, value));
    if (r.isClosed || s.disposed) {
      r.close();
      s.rooms.delete(handle);
      for (const off of record.subscriptions.splice(0)) off();
      throw error("closed");
    }
    return snapshot(handle, r);
  }
  async function openRoom(s, operation, args) {
    const controller = new AbortController();
    s.controllers.add(controller);
    try {
      const options = { signal: controller.signal,
        ...(args.relayOnly === undefined ? {} : { relayOnly: args.relayOnly }),
        ...(operation === "room.host" && args.maxPlayers !== undefined ? { maxPlayers: args.maxPlayers } : {}) };
      const r = await (operation === "room.host" ? s.sdk.multiplayer.host(options)
        : operation === "room.join" ? s.sdk.multiplayer.join(args.code, options) : s.sdk.multiplayer.joinInvite(options));
      return { ok: true, value: opened(s, r) };
    } finally { s.controllers.delete(controller); }
  }
  function execute(s, op, a) {
    const sdk = s.sdk;
    switch (op) {
      // Bound at once, so service calls made in the same frame as Initialize reach the
      // SDK, which is built to take them before init has finished. "SDK attached" reads
      // a separate flag that only a successful init sets.
      case "init": {
        const client = bind(s);
        s.sdk = client;
        const tracked = Promise.resolve(client.init(a)).then(value => {
          if (!s.disposed) s.initialized = true;
          return { ok: true, value };
        });
        // Removed as it settles, before any held ready's allSettled sees it.
        s.pendingInits.add(tracked);
        const untrack = () => { s.pendingInits.delete(tracked); };
        tracked.then(untrack, untrack);
        return tracked;
      }
      // Playable is a claim about a game that has its session, so a Mark playable made
      // while Initialize is pending waits for every pending Initialize rather than racing
      // them, and fails if none succeeded, as the Construct addon does. Without Initialize
      // there is no SDK and run() answers unavailable. The SDK's ready() starts init
      // itself, which is why the example sheet could mark playable on its first frame
      // and nothing complained (review of 23 Oct 2026).
      case "ready": {
        // Dispose clears the flag, so a ready queued behind a scene that has gone never fires.
        const mark = () => {
          if (!s.initialized) return { ok: false, error: "unavailable" };
          s.sdk.ready();
          return { ok: true, value: null };
        };
        // Each round waits for the inits pending at that moment to settle, so it never
        // re-attaches to one that has already rejected. Doing that while an earlier init
        // was still pending spun the microtask queue for ever and froze the tab (review
        // of #375, 23 Oct 2026).
        const settle = () => (s.initialized || !s.pendingInits.size ? mark()
          : Promise.allSettled([...s.pendingInits]).then(settle));
        return settle();
      }
      case "track": return sdk.track(a.name, a.props);
      case "signIn": return sdk.player.requestSignIn();
      case "fullscreen": return sdk.fullscreen.request();
      case "openLink": return sdk.openLink(a.url);
      case "board.submit": return sdk.leaderboard(a.key).submit(a.score, a.meta);
      case "board.top": return sdk.leaderboard(a.key).top({ limit: a.limit });
      case "board.me": return sdk.leaderboard(a.key).me();
      case "board.around": return sdk.leaderboard(a.key).around();
      case "achievements.unlock": return sdk.achievements.unlock(a.id);
      case "achievements.list": return sdk.achievements.list();
      case "room.host": case "room.join": case "room.joinInvite": return openRoom(s, op, a);
      case "room.close": room(s, a.room).close(); return { ok: true, value: null };
      case "room.ready": room(s, a.room).ready(a.ready); return { ok: true, value: null };
      case "room.phase": return { ok: true, value: room(s, a.room).phase(a.name, { delayMs: a.delayMs, waitForReady: a.waitForReady }) };
      case "room.state": return { ok: true, value: snapshot(a.room, room(s, a.room)) };
      case "room.now": return { ok: true, value: room(s, a.room).now() };
      case "room.stats": return { ok: true, value: a.peer ? room(s, a.room).stats(a.peer) : room(s, a.room).stats() };
      case "room.disconnectPeer": room(s, a.room).disconnectPeer(a.peer); return { ok: true, value: null };
      case "room.send": case "room.sendBytes": {
        const r = room(s, a.room);
        let data;
        try { data = JSON.parse(a.data); } catch { throw error("invalid_message"); }
        if (op === "room.sendBytes") {
          if (!Array.isArray(data) || !data.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) throw error("invalid_message");
          if (data.length > r.maxPacketBytes) throw error("message_too_large");
          data = Uint8Array.from(data);
        }
        const value = r.send(data, { reliable: a.reliable, ...(a.peer === undefined ? {} : { peer: a.peer }) });
        return value.closed ? { ok: false, error: "closed" } : { ok: true, value };
      }
      default: throw error("invalid_request");
    }
  }
  function run(scene, tag, operation, makeArgs) {
    const s = state(scene);
    const id = ++nextRequest;
    let pending;
    try {
      if (operation !== "init" && !s.sdk) throw error("unavailable");
      // Start synchronously so fullscreen and links land inside the browser's short
      // activation window after the input; GDevelop runs this in the frame loop, not the handler.
      pending = execute(s, operation, makeArgs());
    } catch (value) { pending = failure(s, value); }
    const deliver = result => { if (!s.disposed) s.results.push({ id, tag, operation, result: hinted(s, result) }); };
    Promise.resolve(pending).then(deliver, value => deliver(failure(s, value)));
    return id;
  }
  function dispose(scene) {
    const s = get(scene);
    if (!s) return;
    s.disposed = true;
    for (const controller of s.controllers) controller.abort();
    for (const record of s.rooms.values()) {
      for (const off of record.subscriptions.splice(0)) off();
      record.room.close();
    }
    for (const off of s.subscriptions.splice(0)) off();
    s.rooms.clear();
    s.controllers.clear();
    s.results.length = s.events.length = 0;
    s.sdk = null; s.initialized = false;
    s.result = initialResult();
    s.event = initialEvent();
    states.delete(scene);
  }
  function takeResult(scene, tag) {
    const s = get(scene);
    if (!s) return;
    const i = s.results.findIndex(item => !tag || item.tag === tag);
    s.result = i < 0 ? initialResult() : s.results.splice(i, 1)[0];
    // The room may have closed between the open finishing and this read. Report that
    // rather than hand back a handle no other action can use, as the Construct adapter does.
    const { operation, result } = s.result;
    if (OPEN_OPERATIONS.includes(operation) && result.ok && result.value && !s.rooms.has(result.value.room))
      s.result = { ...s.result, result: { ok: false, error: "closed" } };
  }
  function takeEvent(scene, name, handle) {
    const s = get(scene);
    if (!s) return;
    // Unfiltered reads take the head in constant time; filtered reads scan once and
    // splice once, so draining a queue of n matching events costs O(n) per frame
    // rather than the O(n^2) of rebuilding the array on every read.
    const i = !name && !handle ? (s.events.length ? 0 : -1)
      : s.events.findIndex(item => (!name || item.name === name) && (!handle || item.room === handle));
    s.event = i < 0 ? initialEvent() : s.events.splice(i, 1)[0];
  }
  gdjs.__openGameServicesV1 = { get, object, optional, run, dispose, takeResult, takeEvent,
    initialResult, initialEvent, snapshot, room };
}
