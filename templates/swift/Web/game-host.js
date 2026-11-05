// The PackageToJS loader supplies the wasm and JavaScriptKit runtime. This file
// supplies only the DOM and sound; all game state and SDK calls live in Swift.
(() => {
  let canvas, context, score, status, callbacks, frame = 0, audio, muted = true;
  let message = 'Connecting to OpenGame…';
  function mount() {
    if (canvas) return;
    const style = document.createElement('style');
    style.textContent = 'body{margin:0;background:#101521;color:#eaf0ff;font:18px system-ui;text-align:center}main{max-width:800px;margin:3vh auto;padding:20px}canvas{display:block;width:100%;background:#1b2436;border-radius:16px;touch-action:none}p{min-height:1.5em}h1{font-size:24px}';
    document.head.append(style);
    const main = document.createElement('main');
    const title = document.createElement('h1'); title.textContent = 'Swift target';
    score = document.createElement('p'); score.textContent = 'Score: 0';
    canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 450;
    canvas.tabIndex = 0; canvas.setAttribute('aria-label', 'Moving target. Click the square or press Space to score.');
    context = canvas.getContext('2d');
    status = document.createElement('p'); status.textContent = message; status.setAttribute('role', 'status');
    main.append(title, score, canvas, status); document.body.append(main);
  }
  function pointer(event) {
    const box = canvas.getBoundingClientRect();
    callbacks?.hit((event.clientX - box.left) * canvas.width / box.width, (event.clientY - box.top) * canvas.height / box.height);
  }
  function key(event) {
    if (event.code === 'Space' && !event.repeat) { event.preventDefault(); callbacks?.hit(null, null); }
  }
  function close() { callbacks?.close(); }
  globalThis.SwiftTargetHost = {
    connect(tick, hit, shutdown) {
      mount(); callbacks = { tick, hit, close: shutdown };
      canvas.addEventListener('pointerdown', pointer);
      window.addEventListener('keydown', key);
      window.addEventListener('pagehide', close);
      function next(time) { if (!callbacks) return; callbacks.tick(time); if (callbacks) frame = requestAnimationFrame(next); }
      frame = requestAnimationFrame(next);
    },
    disconnect() {
      callbacks = null; cancelAnimationFrame(frame);
      canvas?.removeEventListener('pointerdown', pointer);
      window.removeEventListener('keydown', key); window.removeEventListener('pagehide', close);
      if (audio) { void audio.close(); audio = null; }
    },
    status(text) { message = text; if (status) status.textContent = text; },
    mute(value) { muted = value; if (value && audio) void audio.suspend(); },
    beep() {
      if (muted) return;
      audio ??= new AudioContext(); void audio.resume();
      const tone = audio.createOscillator(), gain = audio.createGain();
      gain.gain.setValueAtTime(0.05, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.08);
      tone.frequency.value = 660; tone.connect(gain).connect(audio.destination);
      tone.start(); tone.stop(audio.currentTime + 0.08);
    },
    draw(x, y, points, paused) {
      context.clearRect(0, 0, 640, 450);
      context.fillStyle = '#81e7ba'; context.fillRect(x - 28, y - 28, 56, 56);
      score.textContent = `Score: ${points}`;
      if (paused) {
        context.fillStyle = '#101521dd'; context.fillRect(0, 0, 640, 450);
        context.fillStyle = '#ffffff'; context.textAlign = 'center'; context.font = '28px system-ui';
        context.fillText('Paused by OpenGame', 320, 225);
      }
    },
  };
})();
