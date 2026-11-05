/*:
 * @target MZ
 * @plugindesc OpenGame services and rooms for MZ and MV web exports (0.1.0).
 * @author OpenGame
 * @url https://opengame.io
 *
 * @param EventVariable
 * @text Latest event variable
 * @type variable
 * @default 0
 * @desc Optional variable receiving {name, room, args}. Zero disables it.
 *
 * @command Request
 * @text Call OpenGame
 * @desc Call a service. The result variable receives the complete result object.
 * @arg operation
 * @type select
 * @option init
 * @option track
 * @option signIn
 * @option fullscreen
 * @option openLink
 * @option board.submit
 * @option board.top
 * @option board.me
 * @option board.around
 * @option achievements.unlock
 * @option achievements.list
 * @option room.host
 * @option room.join
 * @option room.joinInvite
 * @option room.close
 * @option room.ready
 * @option room.phase
 * @option room.state
 * @option room.stats
 * @option room.now
 * @option room.send
 * @option room.sendTo
 * @option room.disconnectPeer
 * @default init
 * @arg arguments
 * @text Arguments (JSON object)
 * @type multiline_string
 * @default {}
 * @arg resultVariable
 * @text Result variable
 * @type variable
 * @default 0
 * @arg wait
 * @text Wait for result
 * @type boolean
 * @default true
 *
 * @command Ready
 * @text Report playable frame
 * @desc Call after the first frame the player can use, after init has completed.
 *
 * @command CloseAll
 * @text Close all owned rooms
 * @desc Cancel pending room opens and close this plugin's rooms.
 *
 * @command Dispose
 * @text Dispose plugin
 * @desc Terminal cleanup; the page must reload to use the plugin again.
 *
 * @help
 * Install as js/plugins/OpenGame.js and enable in Plugin Manager.
 * Requires the full injected window.OpenGame SDK before game startup. No CDN,
 * credentials or additional transport. Web only; no SDK means unavailable.
 *
 * MZ: Call OpenGame(init), wait, then Report playable frame when playable.
 * MV: OpenGame Request init 10 {}
 *     OpenGame Request board.submit 10 {"key":"score","score":100}
 *     OpenGame Ready
 *     OpenGame CloseAll
 *     OpenGame Dispose
 * MV Request always waits. The number is the result variable (0 discards).
 * JSON after it is joined with spaces; do not wrap the whole JSON in quotes.
 * MZ JSON supports \V[n] interpolation; MV supports it too.
 *
 * Every Request resolves {ok:true,value:...} or {ok:false,error,reason?}.
 * Hosted room errors also include retryable. Read result.ok before value.
 * Room opens return a snapshot with numeric room handle. Use that handle in
 * later JSON, e.g. {"room":1,"data":{"type":"ping"},"reliable":true}.
 * EventVariable holds only the latest event. Use OpenGameRPGMaker.on for
 * gameplay packets; it receives every event, without a lossy variable queue.
 *
 * OpenGameRPGMaker.state exposes paused/muted/fullscreen/player/environment.
 * Apply pause and mute in your game's logic/audio integration. This plugin
 * does not pause SceneManager or change the player's saved volume settings.
 * Services use the global directly. It never calls bridge.setHandler and
 * cannot replace another native adapter's exclusive bridge handler.
 * See the distributed README for command arguments and lifecycle details.
 */
(function () {
  'use strict';
  var scope = window;
  if (scope.OpenGameRPGMaker) return;
  var pluginName = 'OpenGame';
  var parameters = PluginManager.parameters(pluginName);
  var eventVariable = Number(parameters.EventVariable || 0);
  var client = null;
  var initialization = null;
  var disposed = false;
  var roomGeneration = 0;
  var nextRoom = 0;
  var rooms = new Map();
  var pendingRooms = new Set();
  var subscriptions = [];
  var listeners = new Set();
  var commandWaits = new WeakMap();
  var state = { status: 'idle', player: null, paused: false, muted: false, fullscreen: false };
  // The SDK replaces env after delayed handshakes and session changes.
  Object.defineProperty(state, 'environment', { enumerable: true, get: function () { return client ? client.env : null; } });

  function fail(code, reason) { return { ok: false, error: code, reason: reason || code }; }
  function ok(value) { return { ok: true, value: value === undefined ? null : value }; }
  function failure(error) {
    var entry = client && client.errorCatalogue && client.errorCatalogue.find(function (item) { return item.code === (error && error.code); });
    if (entry) return { ok: false, error: entry.code, reason: entry.hint, retryable: entry.retryable };
    if (error && ['disposed', 'unavailable', 'cancelled', 'closed'].indexOf(error.code) >= 0) return fail(error.code);
    return fail('invalid_request');
  }
  function emit(name, room, args) {
    if (disposed) return;
    var event = { name: name, room: room, args: args };
    if (eventVariable > 0 && scope.$gameVariables) scope.$gameVariables.setValue(eventVariable, event);
    listeners.forEach(function (listener) {
      try { Promise.resolve(listener(event)).catch(function () {}); } catch (_) { /* One event must not silence later events. */ }
    });
  }
  function getClient() {
    if (disposed) throw { code: 'disposed' };
    if (!client) throw { code: 'unavailable' };
    return client;
  }
  function init(args) {
    if (disposed) return Promise.resolve(fail('disposed'));
    if (initialization) return initialization;
    client = scope.OpenGame;
    if (!client || typeof client.init !== 'function' || !client.multiplayer) {
      client = null;
      state.status = 'unavailable';
      return Promise.resolve(fail('unavailable', 'Load the full OpenGame global before the game.'));
    }
    // Save the promise before subscribing: immediate state replay can reenter
    // init or dispose from another plugin's listener.
    var settle;
    initialization = new Promise(function (resolve) { settle = resolve; });
    state.status = 'loading';
    function attach(register) {
      if (disposed) return;
      var off = register();
      if (disposed) off(); else subscriptions.push(off);
    }
    try {
      attach(function () { return client.player.onChange(function (value) { state.player = value; emit('player', 0, [value]); }); });
      attach(function () { return client.onPause(function (value) { state.paused = value; emit('pause', 0, [value]); }); });
      attach(function () { return client.audio.onHostMute(function (value) { state.muted = value; emit('mute', 0, [value]); }); });
      attach(function () { return client.fullscreen.onChange(function (value) { state.fullscreen = value; emit('fullscreen', 0, [value]); }); });
      if (disposed) { settle(fail('disposed')); return initialization; }
      Promise.resolve(client.init(args)).then(function (environment) {
        if (disposed) { settle(fail('disposed')); return; }
        state.status = 'ready';
        settle(ok(environment));
      }, function () {
        subscriptions.splice(0).forEach(function (off) { off(); });
        if (!disposed) state.status = 'unavailable';
        settle(fail(disposed ? 'disposed' : 'unavailable'));
      });
    } catch (error) {
      subscriptions.splice(0).forEach(function (off) { off(); });
      if (!disposed) state.status = 'unavailable';
      settle(failure(error));
    }
    return initialization;
  }
  function snapshot(handle, room) {
    return { room: handle, code: room.code, role: room.role, local: room.local, inviteUrl: room.inviteUrl,
      maxPlayers: room.maxPlayers, maxPacketBytes: room.maxPacketBytes, self: room.self, peers: room.peers,
      phase: room.phaseState, readiness: room.readyState, closed: room.isClosed };
  }
  function ownRoom(room) {
    if (!room) return null;
    if (room.isClosed) throw { code: 'closed' };
    var handle = ++nextRoom;
    var entry = { room: room, off: [] };
    rooms.set(handle, entry);
    // Install cleanup first: join/readiness replay during subscription can call
    // back into this plugin and close the room before registration returns.
    function on(name, callback) {
      if (!rooms.has(handle)) return;
      var off = room.on(name, callback);
      if (rooms.has(handle)) entry.off.push(off); else off();
    }
    on('close', function (reason) {
      rooms.delete(handle);
      entry.off.splice(0).forEach(function (off) { off(); });
      emit('room.close', handle, [reason]);
    });
    ['join', 'leave', 'message', 'phase', 'readiness', 'clock', 'signalling', 'members', 'configuration', 'authority', 'migrating', 'host-left'].forEach(function (name) {
      on(name, function () { emit('room.' + name, handle, Array.prototype.slice.call(arguments)); });
    });
    if (!rooms.has(handle)) throw { code: 'closed' };
    return snapshot(handle, room);
  }
  function openRoom(op, args) {
    var service = getClient().multiplayer;
    var controller = new AbortController();
    var generation = roomGeneration;
    var signal = args.signal;
    var cancel = function () { controller.abort(); };
    if (signal) signal.addEventListener('abort', cancel, { once: true });
    if (signal && signal.aborted) cancel();
    pendingRooms.add(controller);
    function finished() {
      pendingRooms.delete(controller);
      if (signal) signal.removeEventListener('abort', cancel);
    }
    var options = { signal: controller.signal };
    if (args.relayOnly !== undefined) options.relayOnly = args.relayOnly;
    if (op === 'room.host' && args.maxPlayers !== undefined) options.maxPlayers = args.maxPlayers;
    var opening;
    try {
      if (controller.signal.aborted) throw { code: 'cancelled' };
      opening = op === 'room.host' ? service.host(options) : op === 'room.join' ? service.join(args.code, options) : service.joinInvite(options);
    } catch (error) { finished(); throw error; }
    return Promise.resolve(opening).then(function (room) {
      finished();
      if (disposed || controller.signal.aborted || generation !== roomGeneration) { if (room) room.close(); throw { code: 'cancelled' }; }
      return ok(ownRoom(room));
    }, function (error) { finished(); throw error; });
  }
  function execute(op, args) {
    if (op === 'init') return init(args);
    var sdk = getClient();
    switch (op) {
      case 'track': return sdk.track(args.name, args.props || {});
      case 'signIn': return sdk.player.requestSignIn();
      case 'fullscreen': return sdk.fullscreen.request();
      case 'openLink': return sdk.openLink(args.url);
      case 'board.submit': return sdk.leaderboard(args.key).submit(args.score, args.meta);
      case 'board.top': return sdk.leaderboard(args.key).top(args.limit === undefined ? undefined : { limit: args.limit });
      case 'board.me': return sdk.leaderboard(args.key).me();
      case 'board.around': return sdk.leaderboard(args.key).around();
      case 'achievements.unlock': return sdk.achievements.unlock(args.id);
      case 'achievements.list': return sdk.achievements.list();
      case 'room.host': case 'room.join': case 'room.joinInvite': return openRoom(op, args);
      default: {
        if (op.indexOf('room.') !== 0) return fail('invalid_request');
        var entry = rooms.get(args.room);
        if (!entry) return fail('closed');
        var room = entry.room;
        switch (op) {
          case 'room.close': room.close(); return ok();
          case 'room.ready': room.ready(args.ready === undefined ? true : args.ready); return ok();
          case 'room.phase': return ok(room.phase(args.name, { delayMs: args.delayMs, waitForReady: args.waitForReady }));
          case 'room.state': return ok(snapshot(args.room, room));
          case 'room.now': return ok(room.now());
          case 'room.stats': return ok(args.peer === undefined ? room.stats() : room.stats(args.peer));
          case 'room.send': return ok(room.send(args.data, { reliable: args.reliable === undefined ? true : args.reliable }));
          case 'room.sendTo':
            if (typeof args.peer !== 'string' || !args.peer) return fail('invalid_peer');
            return ok(room.send(args.data, { peer: args.peer, reliable: args.reliable === undefined ? true : args.reliable }));
          case 'room.disconnectPeer': room.disconnectPeer(args.peer); return ok();
          default: return fail('invalid_request');
        }
      }
    }
  }
  function request(op, args) {
    // Execute now, before a Promise turn, so gesture-gated calls retain activation.
    if (disposed) return Promise.resolve(fail('disposed'));
    if (typeof op !== 'string' || !args || typeof args !== 'object' || Array.isArray(args)) return Promise.resolve(fail('invalid_request'));
    try {
      return Promise.resolve(execute(op, args)).then(function (result) {
        return disposed ? fail('disposed') : result;
      }, failure);
    } catch (error) { return Promise.resolve(failure(error)); }
  }
  function closeAll() {
    roomGeneration++;
    pendingRooms.forEach(function (controller) { controller.abort(); });
    pendingRooms.clear();
    Array.from(rooms.values()).forEach(function (entry) { entry.room.close(); });
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    state.status = 'disposed';
    closeAll();
    subscriptions.splice(0).forEach(function (off) { off(); });
    listeners.clear();
    scope.removeEventListener('pagehide', onPageHide);
  }
  scope.OpenGameRPGMaker = Object.freeze({
    state: state,
    request: function (op, args) { return request(op, args === undefined ? {} : args); },
    ready: function () { return state.status === 'ready' ? (getClient().ready(), ok()) : fail(disposed ? 'disposed' : 'unavailable'); },
    on: function (listener) {
      if (disposed) return function () {};
      listeners.add(listener);
      return function () { listeners.delete(listener); };
    },
    closeAll: closeAll,
    dispose: dispose
  });
  function onPageHide(event) {
    // A cached page returns to this same plugin instance. End network rooms,
    // but retain the services and subscriptions that the restored game uses.
    if (event.persisted) closeAll();
    else dispose();
  }
  scope.addEventListener('pagehide', onPageHide);

  function commandRequest(interpreter, args) {
    var variable = Number(args.resultVariable || 0);
    var variables = scope.$gameVariables;
    // Bind to the current game, so an old async command cannot write into a
    // different save or a New Game created while its request was in flight.
    var token = { pending: true };
    if (args.wait !== 'false') { commandWaits.set(interpreter, token); interpreter.setWaitMode('opengame'); }
    var value;
    try {
      var json = String(args.arguments || '{}').replace(/\\V\[(\d+)\]/gi, function (_, id) { return String(variables.value(Number(id))); });
      value = JSON.parse(json);
    } catch (_) { value = null; }
    request(args.operation, value).then(function (result) {
      if (variable > 0 && variables && variables === scope.$gameVariables) variables.setValue(variable, result);
      token.pending = false;
    }, function () { token.pending = false; });
  }
  var updateWaitMode = Game_Interpreter.prototype.updateWaitMode;
  Game_Interpreter.prototype.updateWaitMode = function () {
    if (this._waitMode !== 'opengame') return updateWaitMode.call(this);
    // Pending JS callbacks cannot survive a saved game's serialization. A
    // restored interpreter has no WeakMap entry and must not wait forever.
    var token = commandWaits.get(this);
    if (token && token.pending) return true;
    commandWaits.delete(this);
    this._waitMode = '';
    return false;
  };
  if (typeof PluginManager.registerCommand === 'function') {
    PluginManager.registerCommand(pluginName, 'Request', function (args) { commandRequest(this, args); });
    PluginManager.registerCommand(pluginName, 'Ready', function () { scope.OpenGameRPGMaker.ready(); });
    PluginManager.registerCommand(pluginName, 'CloseAll', closeAll);
    PluginManager.registerCommand(pluginName, 'Dispose', dispose);
  }
  var pluginCommand = Game_Interpreter.prototype.pluginCommand;
  Game_Interpreter.prototype.pluginCommand = function (command, args) {
    if (pluginCommand) pluginCommand.call(this, command, args);
    if (command.toLowerCase() !== 'opengame') return;
    var name = String(args[0] || '').toLowerCase();
    if (name === 'request') commandRequest(this, { operation: args[1], resultVariable: args[2], arguments: args.slice(3).join(' '), wait: 'true' });
    else if (name === 'ready') scope.OpenGameRPGMaker.ready();
    else if (name === 'closeall') closeAll();
    else if (name === 'dispose') dispose();
  };
}());
