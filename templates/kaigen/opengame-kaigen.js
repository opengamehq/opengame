// Connects a Kaigen game to OpenGame. Kaigen game code cannot call JavaScript, so the two sides talk the way OG Clash
// does on OpenGame: the game writes log lines that start with "og: ", and this page drops small JSON files on the
// game's canvas, which reach the game through its ordinary dropped-file queue. Nothing here is required: without the
// SDK, outside OpenGame or with the platform down, every call is skipped and the game plays as it is.
//
// Load it after the SDK and before the page's own module:
//   <script src="opengame-global.js"></script>      (or the copy OpenGame injects at /_og/sdk.js)
//   <script src="opengame-kaigen.js"></script>
// then wrap the engine's createGame:
//   const createGame = options => OpenGameKaigen.wrap(createEngineGame, options);
//
// Lines the game may log, from its main thread (Kaigen relays only the main thread's console to the page):
//   og: ready                      the first playable frame
//   og: score <board> <number>     a score for a board declared in opengame.json
//   og: unlock <achievement>       an achievement declared in opengame.json
//   og: event <name>               a custom event
//   og: sign-in                    ask the page to offer sign-in
// The page drops opengame_player.json whenever the player is known or changes:
//   { "signedIn": true, "handle": "fate", "look": "panda.dots.white", "character": "c3....", "serial": 3 }
// handle, look and character are null unless the player signed in and shares their OG with games.
(function () {
  "use strict";
  // Anchored after Kaigen's own prefix ("[Main Thread: 87ms] game.c:70: "), so a chat line that happens to END in
  // "og: score ..." submits nothing. A newline is another matter: an entry is one log call, and text with a newline in
  // it, such as a name a player typed, would put "og: ..." at the start of a line of its own. So an entry with a
  // newline is never read as a command at all (R36 forged a score and an unlock that way, 27 Oct 2026). Log each
  // og: line on its own, and never print a player's text in the same call.
  var LINE = /^(?:\[[^\]]*\]\s*)?(?:[\w./-]+:\d+:\s*)?og: (ready|score|unlock|event|sign-in)(?: (\S+))?(?: (-?\d+(?:\.\d+)?))?\s*$/;
  var NAME = /^[a-z][a-z0-9_-]{0,47}$/;

  function drop(canvas, name, value) {
    if (!canvas) return false;
    try {
      var transfer = new DataTransfer();
      transfer.items.add(new File([JSON.stringify(value)], name, { type: "application/json" }));
      // The engine's drop handler calls preventDefault, so a drop it took returns false here.
      return !canvas.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }));
    } catch (e) { return false; }
  }

  function wrap(createEngineGame, options) {
    options = options || {};
    var og = window.OpenGame && typeof window.OpenGame.init === "function" ? window.OpenGame : null;
    var started = og ? og.init().catch(function () { return null; }) : Promise.resolve(null);
    var canvas = options.canvas || document.querySelector("canvas");
    var serial = 0, readied = false, paused = false, muted = false, audio = options.audioContext;
    if (!audio && og) {
      // Kaigen gives the page no pause or volume call, so the page owns the game's AudioContext.
      var AC = window.AudioContext || window.webkitAudioContext;
      try { audio = AC ? new AC() : undefined; } catch (e) { audio = undefined; }
    }
    if (audio && og) {
      // Kaigen's runtime resumes a suspended context on every key, click and touch, so a plain suspend would last
      // until the next input. While OpenGame holds the sound, resume() does nothing.
      var resume = audio.resume.bind(audio);
      audio.resume = function () { return paused || muted ? Promise.resolve() : resume(); };
    }
    function hold() {
      if (!audio) return;
      (paused || muted ? audio.suspend() : audio.resume()).catch(function () {});
    }
    function sendPlayer() {
      var p = og.player, shared = p.signedIn && p.avatar;
      var message = { serial: ++serial, signedIn: !!p.signedIn, handle: p.signedIn ? p.handle : null,
        look: shared && p.avatar.look ? p.avatar.look : null, character: shared && p.avatar.character ? p.avatar.character : null };
      // The game may not be listening yet: offer the file once a second for a minute, until it takes it.
      var tries = 0;
      (function attempt() { if (message.serial === serial && !drop(canvas, "opengame_player.json", message) && ++tries < 60) setTimeout(attempt, 1000); })();
    }
    function line(text) {
      if (!og) return;
      var m = LINE.exec(text);
      if (!m) return;
      var op = m[1], name = m[2], value = m[3] === undefined ? NaN : Number(m[3]);
      started.then(function () {
        if (op === "ready" && !readied) { readied = true; requestAnimationFrame(function () { og.ready(); }); }
        else if (op === "score" && NAME.test(name || "") && isFinite(value)) og.leaderboard(name).submit(value).then(function (r) { if (!r.ok) console.warn("opengame: score " + name + ": " + (r.reason || r.error)); });
        else if (op === "unlock" && NAME.test(name || "")) og.achievements.unlock(name);
        else if (op === "event" && NAME.test(name || "")) og.track(name.replace(/-/g, "_"));
        else if (op === "sign-in") og.player.requestSignIn();
      });
    }
    if (og) started.then(function () {
      og.onPause(function (value) { paused = value; if (value && document.pointerLockElement) document.exitPointerLock(); hold(); });
      og.audio.onHostMute(function (value) { muted = value; hold(); });
      og.player.onChange(sendPlayer);
    });
    var forward = options.onEngineMessage;
    return createEngineGame(Object.assign({}, options, audio ? { audioContext: audio } : {}, {
      logRelay: true,
      onEngineMessage: function (message) {
        if (message && message.type === "engineLog") (message.lines || []).forEach(function (entry) {
          var text = String(entry[1]);
          if (!/[\r\n\u2028\u2029]/.test(text)) line(text);
        });
        if (forward) forward(message);
      },
    }));
  }

  window.OpenGameKaigen = { wrap: wrap, drop: drop };
})();
