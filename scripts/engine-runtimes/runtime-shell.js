"use strict";
(() => {
  const config = JSON.parse(document.getElementById("og-runtime-settings").textContent);
  const game = document.getElementById("game");
  const start = document.getElementById("start");
  const error = document.getElementById("error");
  const sdk = window.OpenGame?.og ?? window.OpenGame;
  const options = config.options ?? {};
  let paused = false;
  let muted = false;
  let dos = null;
  let ruffle = null;
  let ruffleLoaded = false;
  const applyPause = () => {
    if (dos) dos.setPaused(paused);
    if (ruffleLoaded) paused ? ruffle.suspend() : ruffle.resume();
  };
  const applyMute = () => {
    if (dos) dos.setVolume(muted ? 0 : 1);
    if (ruffleLoaded) ruffle.volume = muted ? 0 : 1;
  };
  // Subscribe before loading: a hidden or muted host may change state while the
  // runtime is starting. SDK subscriptions immediately deliver their snapshot.
  const unsubscribe = [];
  if (sdk) {
    unsubscribe.push(sdk.onPause(value => { paused = value; applyPause(); }));
    unsubscribe.push(sdk.audio.onHostMute(value => { muted = value; applyMute(); }));
    // Subscriptions alone do not install the parent's message bridge. Playing
    // without a host remains possible if initialization cannot connect.
    try { Promise.resolve(sdk.init()).catch(() => {}); } catch { /* standalone fallback */ }
  }
  window.addEventListener("pagehide", event => {
    if (!event.persisted) unsubscribe.forEach(dispose => dispose());
  });
  const load = src => new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => { script.remove(); reject(new Error("Runtime could not load")); };
    document.head.appendChild(script);
  });
  const launch = async () => {
    if (start.disabled) return;
    start.disabled = true;
    error.hidden = true;
    try {
      if (config.runtimeId === "jsdos") {
        const style = document.createElement("link");
        style.rel = "stylesheet"; style.href = config.prefix + "js-dos.css";
        document.head.appendChild(style);
        await load(config.prefix + "js-dos.js");
        dos = window.Dos(game, { url: config.source, pathPrefix: config.prefix + "emulators/",
          autoStart: false, kiosk: true, workerThread: true, backend: "dosbox", backendLocked: true,
          renderBackend: options.renderBackend ?? "webgl", renderAspect: options.renderAspect ?? "AsIs",
          imageRendering: options.imageRendering ?? "pixelated",
          volume: muted ? 0 : 1, autoSave: false, startIpxServer: false });
        // 8.5.3 ignores a noCloud constructor option. Apply the handle setting
        // before enabling autostart so the first running instance has the policy.
        dos.setNoCloud(true);
        applyMute();
        applyPause();
        dos.setAutoStart(true);
      } else {
        window.RufflePlayer = { config: { publicPath: config.prefix, polyfills: false, autoplay: "off",
          letterbox: options.letterbox ?? "fullscreen",
          allowScriptAccess: false, allowNetworking: "internal", openUrlMode: "deny", showSwfDownload: false } };
        await load(config.prefix + "ruffle.js");
        const player = window.RufflePlayer.newest().createPlayer();
        game.appendChild(player);
        ruffle = player.ruffle(1);
        // Load without autoplay, then apply the latest host state before resume.
        await ruffle.load({ url: config.source, autoplay: "off", letterbox: options.letterbox ?? "fullscreen",
          allowScriptAccess: false });
        ruffleLoaded = true;
        applyMute();
        applyPause();
      }
      start.remove();
    } catch (cause) {
      if (dos) await dos.stop().catch(() => {});
      dos = null; ruffle = null; ruffleLoaded = false;
      game.replaceChildren();
      error.hidden = false; error.textContent = "Game could not start: " + String(cause.message || cause);
      start.disabled = false;
    }
  };
  start.addEventListener("click", launch);
  // Both routes use the same policy and host-state ordering. Native autoplay is
  // disabled while loading so a paused host cannot briefly run the first frame.
  if (config.runtimeId === "jsdos" ? options.autoStart === true : options.autoplay === "on") void launch();
})();
