import limits from "../../../packages/shared/limits.json";

/**
 * The speaker control belongs to the host, even when a game never implemented the
 * platform message. Install before game scripts, inside the isolated game origin.
 * This is playback plumbing, not a security boundary against a deliberately hostile
 * game. No token, cookie or parent document is exposed to the game here.
 *
 * Since 27 Sep 2026 it also answers Studio's Send screenshot (`apps/web/src/lib/play/
 * capture.ts` is the page's half). Same receiver rather than a second script, because
 * the parent allowlist, the source check and the install-before-the-game ordering are
 * the parts that have to be right, and two copies of them is how one drifts.
 *
 * Since 5 Nov 2026 it is also the player shell for engines that know nothing of
 * OpenGame, Emscripten builds above all: it resumes audio an engine started before the
 * first gesture, and hands a direct requestFullscreen to a page that has offered to take
 * it. Pointer lock and gamepads need nothing here: the frame's sandbox grants
 * allow-pointer-lock and its allow attribute grants gamepad (stage-frame.tsx), so the
 * browser's own calls work as they are.
 *
 * The version is part of every versioned document's ETag, so a change to this script
 * reaches browsers holding the old document instead of waiting out their cache.
 */
export const GAME_AUDIO_VERSION = "audio-15-paint-fullscreen-offer";

/** Only the numbers the receiver needs, so the page's half and this one read one block. */
const SCREENSHOT = (({ edgePx, jpegQualities, bytesMax, timeoutMs, intervalMs, domBudgetMs, domElementsMax, domBytesMax, domFetchesAtOnce }) =>
  ({ edgePx, jpegQualities, bytesMax, timeoutMs, intervalMs, domBudgetMs, domElementsMax, domBytesMax, domFetchesAtOnce }))(limits.studio.preview.screenshot);

export const GAME_AUDIO_RUNTIME = String.raw`(() => {
  // The parent as it is before any game script runs, captured first: a report can go out the
  // moment the parent is named below, and a game's own top-level 'var parent' would replace
  // the name for every script after it.
  const host = parent;
  const allowed = __OG_AUDIO_PARENTS__;
  const trusted = (origin) => allowed.some((value) => {
    if (origin === value) return true;
    if (!value.endsWith(':*')) return false;
    try { const url = new URL(origin); return url.origin === origin && url.protocol + '//' + url.hostname === value.slice(0, -2); } catch { return false; }
  });
  // The parent cover waits for parsing, not every image or audio download. This
  // signal changes presentation only; it never means gameplay or a counted play.
  let documentParent = null;
  // WHO THE PARENT IS, FROM THE FIRST BYTE, where the browser says. Every report below waited
  // for the page's once-a-second probe to name the parent, so a first paint was told to the
  // page up to a second after it happened, and the page's cover sat that long over a drawn
  // game (5 Nov 2026). Chromium and WebKit name the parent's origin first in
  // location.ancestorOrigins; it is read here, before any game script can replace it, and
  // used only when it is an allowed parent. Firefox has no such list and keeps the probe. A
  // post addressed to the wrong origin is dropped by the browser, so this can only make a
  // report earlier, never send one anywhere new.
  try {
    const named = location.ancestorOrigins ? location.ancestorOrigins[0] : null;
    if (named && trusted(named)) documentParent = named;
  } catch { /* No list: the probe names the parent. */ }
  let lastInput = -Infinity;
  let inputSuspended = false;
  const reportInput = () => {
    if (!documentParent || inputSuspended || document.visibilityState === 'hidden' || performance.now() - lastInput < __OG_INPUT_INTERVAL__) return;
    lastInput = performance.now();
    host.postMessage({ og: 1, type: 'input' }, documentParent);
  };
  const onInput = event => { if (event.isTrusted) reportInput(); };
  for (const type of ['pointerdown', 'pointermove', 'touchmove', 'keydown']) addEventListener(type, onInput, { capture: true, passive: true });
  // Poll only while a controller is connected or a pointer is held. Values remain in this realm;
  // the page receives one activity bit, never axes, buttons or controller IDs.
  let gamepadTimer = null;
  const pressedPointers = new Set();
  const gamepads = () => { try { return Array.from(navigator.getGamepads?.() || []).filter(Boolean); } catch { return []; } };
  const pollGamepads = () => {
    const pads = gamepads();
    if (!pads.length && !pressedPointers.size) { clearInterval(gamepadTimer); gamepadTimer = null; return; }
    if (pressedPointers.size || pads.some(pad => { try { return pad.buttons.some(button => button.pressed) || pad.axes.some(axis => Math.abs(axis) > __OG_GAMEPAD_DEADZONE__); } catch { return false; } })) reportInput();
  };
  const watchGamepads = () => {
    if (!inputSuspended && !gamepadTimer && (pressedPointers.size || gamepads().length)) gamepadTimer = setInterval(pollGamepads, __OG_GAMEPAD_INTERVAL__);
  };
  addEventListener('pointerdown', event => { if (event.isTrusted && !inputSuspended) { pressedPointers.add(event.pointerId); watchGamepads(); } }, { capture: true, passive: true });
  for (const type of ['pointerup', 'pointercancel']) addEventListener(type, event => { if (event.isTrusted) pressedPointers.delete(event.pointerId); }, true);
  addEventListener('blur', () => pressedPointers.clear());
  addEventListener('gamepadconnected', watchGamepads);
  // A discarded or cached document must not retain a polling timer. On return
  // only currently connected controllers restart it; held pointers are stale.
  addEventListener('pagehide', () => { inputSuspended = true; pressedPointers.clear(); clearInterval(gamepadTimer); gamepadTimer = null; });
  addEventListener('pageshow', () => { inputSuspended = false; watchGamepads(); });
  watchGamepads();
  // SCROLLING STAYS IN THE GAME. A wheel turn or a scroll key the game does not cancel
  // goes to the nearest thing that can scroll, and in a game whose body is
  // overflow:hidden that is the page around the frame. Scrolling a list in OG Clash
  // on its game page moved the page instead (28 Oct 2026); on production that day
  // four wheel notches over the running game moved opengame.io 800px and Page Down 860px.
  // Its engine reads the wheel and the keys and cancels neither, which is ordinary for an
  // engine, so this is the platform's to fix for every game rather than that game's.
  //
  // So the wheel, the arrows, Space, Page Up/Down, Home and End are cancelled here when,
  // and only when, no box between where the input would start and this document's root
  // could move that way. That is exactly when the one thing it would scroll is the page
  // outside. A list or a long page in the game keeps its scrolling, a pointer outside the
  // frame never reaches this document, and a control that uses the keys keeps them: a
  // field types, a slider slides, Space presses a button. Space is cancelled on keypress,
  // not keydown, because a cancelled keydown also takes away the keypress a game may be
  // listening for.
  //
  // Not overscroll-behavior on the root, which is the declarative answer and was tried
  // first, measured with this script in a frame on another site on 28 Oct 2026. Chromium
  // honours it for the wheel and the keys. Firefox hands the page the keys anyway, and
  // the wheel over a root that cannot scroll. WebKit hands it the keys too, and honours
  // it for the wheel only when the frame has a wheel listener that could cancel, and with
  // that listener in place stops a game that is a long document scrolling at all: 0px
  // against 800px without it. One rule enforced here behaves the same in all three.
  //
  // Each decides last. This script runs before any game script, so a listener added
  // plainly would hear every input first and hand the game an event already marked
  // cancelled, which an engine that checks defaultPrevented would read as "not mine". A
  // capture listener moves it to the end of the window's bubble listeners each time, so
  // the game always sees the input untouched, and an input the game cancelled itself is
  // left alone. A game that stops an input's propagation keeps the old hand-off for it,
  // which is the failure to prefer over a game that stops hearing its arrows.
  const last = (type, decide) => {
    const options = { passive: false };
    addEventListener(type, () => { removeEventListener(type, decide, options); addEventListener(type, decide, options); }, { capture: true, passive: false });
    addEventListener(type, decide, options);
  };
  // A closed shadow root hides its inside from composedPath, so an input or a scroller in
  // one reads as its host, and nothing here can see what it would do. Input that lands on
  // a closed host is left alone, which is the hand-off from before this guard: measured on
  // 28 Oct 2026, cancelling there swallowed Space and the arrows in a closed root's input
  // and stopped its scroller, in all three engines. Hosts are noted as the roots are
  // attached, which this script sees because it runs before any game script. A closed
  // root declared in markup (shadowrootmode) is never attached through here, so input in
  // one is still judged by its host.
  const closedHosts = new WeakSet();
  const nativeAttachShadow = typeof Element === 'function' ? Element.prototype.attachShadow : undefined;
  if (nativeAttachShadow) {
    Element.prototype.attachShadow = function(...args) {
      const shadow = nativeAttachShadow.apply(this, args);
      if (args[0] && args[0].mode === 'closed') closedHosts.add(this);
      return shadow;
    };
  }
  const canMove = (box, dx, dy) => {
    if (dy) return dy < 0 ? box.scrollTop > 0 : box.scrollTop + box.clientHeight < box.scrollHeight - 1;
    const room = box.scrollWidth - box.clientWidth;
    if (room < 1) return false;
    // Right to left, scrollLeft runs from 0 down to minus the overflow.
    const at = Math.abs(box.scrollLeft), toEnd = getComputedStyle(box).direction === 'rtl' ? dx < 0 : dx > 0;
    return toEnd ? at < room - 1 : at > 0;
  };
  // A textarea and a listbox select scroll whatever their computed overflow says: Firefox
  // reports a textarea's as visible and WebKit a select size=n's, measured 28 Oct 2026.
  const scrolls = (node, axis) => {
    const overflow = getComputedStyle(node)[axis];
    if (/auto|scroll|overlay/.test(overflow)) return true;
    return (node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) && overflow !== 'hidden' && overflow !== 'clip';
  };
  // The path is a composed one, nearest first, so a scroller inside an open shadow root
  // counts. The walk stops at the first box that could take the scroll, and reads a box's
  // style only when its geometry says it has somewhere to go, so a deep tree of boxes
  // with nothing to scroll costs a layout read each and no style resolution.
  const leavesFrame = (path, dx, dy) => {
    if (closedHosts.has(path[0])) return false;
    const axis = dy ? 'overflowY' : 'overflowX';
    const root = document.documentElement, body = document.body;
    const rootOverflow = getComputedStyle(root)[axis];
    // Body's overflow moves to the viewport when html's is visible. Otherwise body is a
    // box like any other, and an app shell that scrolls its body is scrolling here.
    const bodyIsViewport = rootOverflow === 'visible';
    for (const node of path) {
      if (!(node instanceof Element) || node === root || (node === body && bodyIsViewport)) continue;
      if (canMove(node, dx, dy) && scrolls(node, axis)) return false;
    }
    const viewport = bodyIsViewport && body ? getComputedStyle(body)[axis] : rootOverflow;
    const scroller = document.scrollingElement;
    return !(scroller && viewport !== 'hidden' && viewport !== 'clip' && canMove(scroller, dx, dy));
  };
  // Read once, for Shift and the wheel below.
  const apple = typeof navigator === 'object' && /^(Mac|iP)/.test(navigator.platform || '');
  const usable = (event) => event.isTrusted && !event.defaultPrevented && !event.ctrlKey && !event.metaKey && !event.altKey;
  last('wheel', event => {
    // ctrlKey is a trackpad pinch, which is zoom and not this.
    if (!usable(event)) return;
    // Cancelled only when every axis the turn moves on would leave the frame, so a
    // diagonal swipe over a list still scrolls the list. The price is the other way
    // round: a slightly diagonal swipe over a sideways carousel hands its vertical part
    // to the page.
    //
    // Shift and the wheel goes whichever way the engine and the platform say, and the
    // event does not always tell. On a Mac, Chromium, WebKit and Firefox all scrolled a
    // Shift-turned deltaY vertically (28 Oct 2026), and a real mouse there has its turn
    // made sideways by the system, which arrives in deltaX. Chromium on Linux scrolls the
    // same deltaY sideways and still reports it as deltaY with deltaX at 0 (29 Oct 2026),
    // and Windows is believed to do the same; reading it as vertical cancelled every
    // Shift-scroll of a sideways strip. So off a Mac a Shift turn with no deltaX is either
    // way at once, and is cancelled only when both would leave the frame. On a Mac it is
    // read as given, because there the vertical reading is the measured one and adding the
    // sideways one would hand a strip's vertical turn to the page.
    const either = event.shiftKey && !event.deltaX && !apple ? [[Math.sign(event.deltaY), 0]] : [];
    const steps = [[Math.sign(event.deltaX), 0], [0, Math.sign(event.deltaY)], ...either].filter(([dx, dy]) => dx || dy);
    const path = event.composedPath();
    if (steps.length && steps.every(([dx, dy]) => leavesFrame(path, dx, dy))) event.preventDefault();
  });
  const scrollKeys = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], PageUp: [0, -1], PageDown: [0, 1], Home: [0, -1], End: [0, 1] };
  const ownsArrows = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="spinbutton"], [role="listbox"], [role="combobox"], [role="menu"], [role="menubar"], [role="grid"], [role="tree"], [role="tablist"], [role="radiogroup"], [role="textbox"]';
  // Not links: Space on a focused link scrolls in every browser, so it is a scroll key there.
  const ownsSpace = ownsArrows + ', button, summary, [role="button"], [role="checkbox"], [role="switch"], [role="option"], [role="menuitem"], [role="tab"]';
  let pressed = [];
  addEventListener('pointerdown', event => { if (event.isTrusted) pressed = event.composedPath(); }, { capture: true, passive: true });
  const holdKey = (event, [dx, dy], owns) => {
    if (!usable(event) || document.designMode === 'on') return;
    const path = event.composedPath(), target = path[0];
    if (target instanceof Element && target.closest(owns)) return;
    // With nothing focused the browser starts from the last thing pressed, so this does too.
    const idle = !(target instanceof Element) || target === document.body || target === document.documentElement;
    if (leavesFrame(idle && pressed[0] instanceof Element && pressed[0].isConnected ? pressed : path, dx, dy)) event.preventDefault();
  };
  last('keydown', event => { if (scrollKeys[event.key]) holdKey(event, scrollKeys[event.key], ownsArrows); });
  last('keypress', event => { if (event.key === ' ') holdKey(event, [0, event.shiftKey ? -1 : 1], ownsSpace); });
  let documentParsed = document.readyState === 'complete';
  // WHETHER ANYTHING IS ON SCREEN YET, which parsing does not say. Mario Colosseum parsed,
  // the parent's cover came off, and a player looked at a black frame for fifteen seconds
  // before the game drew its own loader (29 Oct 2026). First contentful paint is the
  // browser's own answer to "has this document drawn text, an image or a canvas", so the
  // cover waits for it. A browser without paint timing leaves 'painted' out of the
  // report, and the parent then falls back to parsing, as it did before. Presentation
  // only, like the rest of this signal: the game shares this realm and can forge it, and
  // all it buys is its own cover staying up or coming off.
  let painted = false;
  let paintTimed = false;
  try {
    if (typeof PerformanceObserver === 'function' && (PerformanceObserver.supportedEntryTypes || []).includes('paint')) {
      new PerformanceObserver((list, observer) => {
        if (!list.getEntries().some((entry) => entry.name === 'first-contentful-paint')) return;
        observer.disconnect();
        painted = true;
        if (documentParent) host.postMessage({ og: 1, type: 'painted' }, documentParent);
      }).observe({ type: 'paint', buffered: true });
      paintTimed = true;
    }
  } catch { /* No paint timing: the report below says nothing about painting. */ }
  const reportDocument = () => {
    if (documentParent && documentParsed) {
      host.postMessage(paintTimed ? { og: 1, type: 'document-loaded', painted } : { og: 1, type: 'document-loaded' }, documentParent);
    }
  };
  document.addEventListener('DOMContentLoaded', () => { documentParsed = true; reportDocument(); }, { once: true });
  // A game that moves its own frame to a second page, as Mario Colosseum does from its
  // ownership question to play.html, takes down the document the parent's cover was
  // lifted for. The next one starts blank, so the parent is told before this one goes,
  // and puts the cover back until the next document reports a paint. Only where paints
  // are timed: a browser that cannot say when the next page drew would leave the cover
  // waiting for a report that never comes.
  //
  // Every post here is to 'host', the parent captured before any game script ran, and
  // never to 'parent' read late: a game's own top-level 'var parent' replaces that name
  // for every script after it, and these all run after the game's (review, 29 Oct 2026).
  addEventListener('pagehide', () => {
    if (documentParent && paintTimed) { try { host.postMessage({ og: 1, type: 'leaving' }, documentParent); } catch { /* The parent went first. */ } }
  });
  // Back from the back-forward cache, this document is exactly what it was, drawn, and
  // no paint will be timed again; say so, or the parent's cover waits out its allowance.
  addEventListener('pageshow', (event) => { if (event.persisted) reportDocument(); });
  // A game page boots its frame under the poster before anybody presses Play, so that
  // Play is instant. Der Koloss started its menu music the moment it loaded, and a
  // visitor heard a game they had not started (25 Sep 2026). The page marks such a frame
  // with #og-hold in its src, and this starts silent before a single game script runs;
  // the parent's mute message on Play is what makes it audible. A postMessage alone was
  // too late: the first one can only be sent once the document exists, and a game that
  // plays on its first script has been heard by then. The fragment is removed at once so
  // the game never sees it, and a fragment never reaches the server or a cache key.
  let muted = typeof location !== 'undefined' && location.hash === '#og-hold';
  if (muted) {
    try { history.replaceState(history.state, '', location.pathname + location.search); } catch { /* A sandbox may refuse; the game then sees a fragment it can ignore. */ }
  }
  // THE PLAYER'S VOLUME, 0 to 1, set by the page's slider and by nothing else
  // (5 Nov 2026: the speaker opens a slider instead of muting). It scales the master gain
  // below and every media element's own volume; the game's levels underneath are left as
  // the game set them. It starts at 1 because the page sends the person's level on load,
  // on its document probe and on ready, and a page that never sends one (the embed shell,
  // an older page) should hear the game as it always did.
  //
  // The page says 0 as a mute as well, ahead of this message's arrival or not, so a host
  // built before this message existed, which a derived tree carries in its own
  // /_og/host.js, mutes at 0 and plays at full volume above it. That is the whole of the
  // compatibility story, and the reason the two messages stay separate.
  let level = 1;
  const silent = () => muted || level === 0;
  const outputs = new Map();
  // A FUNCTION THIS PUTS IN PLACE OF A BROWSER'S OWN SHOULD PASS FOR IT. The script is in
  // every uploaded game, ahead of the game's first line, and a game is entitled to look at
  // what it was handed: engines and their loaders read a function's name, its length or its
  // source to decide what a browser supports, and this has no way to know which ones do.
  // So each replacement below takes the native's name and length, and
  // Function.prototype.toString answers for it with the native's source. That one answer
  // is the part a wrapper cannot give itself: a Proxy reports "function () { [native
  // code] }", without its name, and a plain function reports this file. toString is
  // itself replaced to do it, so it is entered in the same table and answers as itself.
  // browser/audio-runtime.test.mts compares all of it with a document this script never
  // ran in. Known and left: createElement and createElementNS are own properties of
  // document rather than of Document.prototype, and a same-origin child frame has its own
  // untouched toString and Audio.
  //
  // Reflect.apply and WeakMap's get are kept now, because a game that wraps either in
  // something that turns a function into a string would otherwise make every toString in
  // the page recurse until the stack ran out.
  const natives = new WeakMap();
  const nativeToString = Function.prototype.toString;
  const apply = Reflect.apply;
  const lookup = WeakMap.prototype.get;
  const toString = new Proxy(nativeToString, {
    apply(target, self, args) { return apply(target, apply(lookup, natives, [self]) ?? self, args); }
  });
  // A stand-in realm can lack the native (a test's muted is a plain field, not an
  // accessor), and a throw here would take the parent handshake below down with it.
  const passFor = (replacement, native) => {
    if (typeof native !== 'function') return replacement;
    natives.set(replacement, native);
    for (const key of ['name', 'length']) {
      const own = Object.getOwnPropertyDescriptor(native, key);
      if (own) Object.defineProperty(replacement, key, own);
    }
    return replacement;
  };
  natives.set(toString, nativeToString);
  Function.prototype.toString = toString;
  // The scroll guard's attachShadow went in above, before this table existed, and passes
  // for the native the same way. Nothing a game runs can come between the two.
  if (nativeAttachShadow) passFor(Element.prototype.attachShadow, nativeAttachShadow);
  const nativeConnect = AudioNode.prototype.connect;
  const nativeDisconnect = AudioNode.prototype.disconnect;
  const outputFor = (destination) => {
    let output = outputs.get(destination);
    if (!output) {
      const context = destination.context;
      output = context.createGain();
      output.gain.value = silent() ? 0 : level;
      nativeConnect.call(output, destination);
      outputs.set(destination, output);
      context.addEventListener('statechange', () => { if (context.state === 'closed') outputs.delete(destination); });
      unlockLater(context);
    }
    return output;
  };
  // AUDIO THAT WAS STARTED BEFORE ANYBODY PRESSED ANYTHING. A browser starts an
  // AudioContext suspended when it is made before a gesture, and SDL, OpenAL, miniaudio
  // and most engines compiled with Emscripten make theirs while booting, under the poster.
  // Some of them resume it on a click of their own and many never do, so the game plays
  // silent for good. So every context that reaches the speakers through the connect
  // above, and has never run, is resumed here on the first trusted press or key in this
  // document, or when the page says Play (ParentPlayMessage: the press on the page is a
  // gesture, and allow="autoplay" lets this frame use it). Never while the page has the
  // game muted: that waits for the unmute, so a held frame stays silent. A context that
  // has run once is the game's from then on, so one the game paused itself stays paused.
  // One the game made before a gesture and keeps suspended on purpose, until its own
  // Start screen say, is resumed by the first press all the same: knowing would mean
  // replacing suspend() too, and most engines resume on that press anyway.
  const neverRan = new Set();
  let audioUnlocked = false;
  const unlockAudio = () => {
    if (!audioUnlocked || silent()) return;
    for (const context of neverRan) {
      try { context.resume().catch(() => {}); } catch { /* A closed context throws; its statechange removes it. */ }
    }
  };
  const unlockLater = (context) => {
    if (context.state === 'running') return;
    neverRan.add(context);
    context.addEventListener('statechange', () => { if (context.state !== 'suspended') neverRan.delete(context); });
    unlockAudio();
  };
  const onGesture = (event) => {
    if (!event.isTrusted) return;
    audioUnlocked = true;
    if (neverRan.size) unlockAudio();
  };
  // The events that grant a gesture. Capture, so the resume happens inside the press
  // even when the game stops the event from reaching anything else.
  for (const type of ['pointerdown', 'pointerup', 'keydown', 'touchend']) addEventListener(type, onGesture, { capture: true, passive: true });
  AudioNode.prototype.connect = passFor(function(destination, ...args) {
    // Offline rendering creates buffers rather than speaker output. Muting that
    // graph would permanently bake silence into assets generated during mute.
    const realtime = destination instanceof AudioDestinationNode &&
      !(typeof OfflineAudioContext !== 'undefined' && destination.context instanceof OfflineAudioContext);
    const actual = realtime ? outputFor(destination) : destination;
    const result = nativeConnect.call(this, actual, ...args);
    return result === actual ? destination : result;
  }, nativeConnect);
  AudioNode.prototype.disconnect = passFor(function(...args) {
    if (outputs.has(args[0])) args[0] = outputs.get(args[0]);
    return nativeDisconnect.apply(this, args);
  }, nativeDisconnect);
  const media = new Set();
  const desired = new WeakMap();
  const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted');
  // An element's volume is the game's own level times the player's. The game reads back
  // the level it set, not the product, because a fade written as volume -= 0.05 against
  // the product would compound the player's level into every step of it.
  //
  // Not for an element the game has routed into Web Audio: its sound reaches the
  // speakers through the master gain, which already carries the level, and scaling the
  // element as well would apply it twice wherever the browser lets an element's volume
  // reach its source node.
  const volumeDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
  const ownVolume = new WeakMap();
  const routed = new WeakSet();
  // What this script last wrote to each element, so a change it did not make, the
  // person moving a <video controls> slider, can be told apart and kept (below).
  const written = new WeakMap();
  // ONE NATIVE WRITE PER ASSIGNMENT. A game's volume is checked and normalised on a
  // detached element of this script's own, which throws exactly as the element would, and
  // only the product reaches the game's element. Writing the raw value first fired a
  // volumechange per step, three for one assignment, and a game that sets its volume
  // again on volumechange spun on them for ever once the level was below 1 (code review,
  // 5 Nov 2026).
  const scratch = volumeDescriptor?.set ? (() => { try { return document.createElement('audio'); } catch { return null; } })() : null;
  const applyVolume = (element) => {
    if (!volumeDescriptor?.set || !ownVolume.has(element)) return;
    try {
      volumeDescriptor.set.call(element, ownVolume.get(element) * (routed.has(element) ? 1 : level));
      written.set(element, volumeDescriptor.get.call(element));
    } catch { /* A detached stand-in; nothing to scale. */ }
  };
  const track = (element) => {
    if (!desired.has(element)) {
      desired.set(element, descriptor.get.call(element));
      media.add(new WeakRef(element));
    }
    if (volumeDescriptor?.get && !ownVolume.has(element)) ownVolume.set(element, volumeDescriptor.get.call(element));
    descriptor.set.call(element, silent() || desired.get(element));
    applyVolume(element);
  };
  Object.defineProperty(HTMLMediaElement.prototype, 'muted', {
    ...descriptor,
    set: passFor(function(value) { track(this); desired.set(this, !!value); descriptor.set.call(this, silent() || !!value); }, descriptor?.set)
  });
  if (volumeDescriptor?.get && volumeDescriptor.set) {
    Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
      ...volumeDescriptor,
      get: passFor(function() { return ownVolume.has(this) ? ownVolume.get(this) : volumeDescriptor.get.call(this); }, volumeDescriptor.get),
      set: passFor(function(value) {
        const check = scratch || this;
        volumeDescriptor.set.call(check, value);
        ownVolume.set(this, volumeDescriptor.get.call(check));
        track(this);
      }, volumeDescriptor.set)
    });
    // A change nobody here made is the person's, through the element's own controls, and
    // becomes the game's level, so the next play() or slider move does not snap it back.
    // Capture on the window, since volumechange does not bubble; a detached element has
    // no controls to move.
    addEventListener('volumechange', (event) => {
      const element = event.target;
      if (!event.isTrusted || !(element instanceof HTMLMediaElement) || !ownVolume.has(element)) return;
      const now = volumeDescriptor.get.call(element);
      if (now === written.get(element)) return;
      written.set(element, now);
      const scale = routed.has(element) ? 1 : level;
      if (scale > 0) ownVolume.set(element, Math.min(1, now / scale));
    }, true);
  }
  // Both ways a game routes an element into Web Audio. The element goes back to its own
  // level, and the master gain on the graph carries the player's from then on.
  const route = (element) => {
    if (!(element instanceof HTMLMediaElement)) return;
    routed.add(element);
    track(element);
  };
  const nativeSource = typeof AudioContext === 'function' ? AudioContext.prototype.createMediaElementSource : undefined;
  if (nativeSource) {
    AudioContext.prototype.createMediaElementSource = passFor(function(element, ...args) {
      const node = nativeSource.call(this, element, ...args);
      route(element);
      return node;
    }, nativeSource);
  }
  if (typeof MediaElementAudioSourceNode === 'function') {
    const NativeSourceNode = MediaElementAudioSourceNode;
    // The element is read from the node the browser made, not from the game's options a
    // second time: a getter there could name one element to the browser and another here,
    // and the other would then escape the level (security review, 5 Nov 2026).
    const mediaElement = Object.getOwnPropertyDescriptor(NativeSourceNode.prototype, 'mediaElement')?.get;
    const sourceNode = new Proxy(NativeSourceNode, {
      construct(target, args, newTarget) {
        const node = Reflect.construct(target, args, newTarget);
        if (mediaElement) route(mediaElement.call(node));
        return node;
      }
    });
    natives.set(sourceNode, NativeSourceNode);
    globalThis.MediaElementAudioSourceNode = sourceNode;
  }
  // Detached autoplay elements need tracking before playback; neither a document
  // observer nor a play() override sees new Audio(url) with autoplay enabled. A Proxy
  // forwards prototype, name, length, instanceof and subclassing without restating any of
  // them: a subclass's super() arrives here with the subclass as newTarget, and passing it
  // on is what gives the element the subclass's prototype. Only the source needs the
  // table above.
  //
  // On 28 Oct 2026 this Proxy was blamed for World at War sticking at "Entering game 99%",
  // because removing it let one local run through. It was not the cause: a trap on every
  // operation recorded the game never touching Audio at all, and the same bundle stuck
  // with no host script whatsoever once its load was slow. One run per variant could not
  // tell a load-sensitive stall from this line. Look there before blaming this again.
  if (typeof Audio === 'function') {
    const NativeAudio = Audio;
    const audio = new Proxy(NativeAudio, {
      construct(target, args, newTarget) {
        const element = Reflect.construct(target, args, newTarget);
        track(element);
        return element;
      }
    });
    natives.set(audio, NativeAudio);
    globalThis.Audio = audio;
  }
  for (const name of ['createElement', 'createElementNS']) {
    const nativeCreate = document[name];
    if (!nativeCreate) continue;
    document[name] = passFor(function(...args) {
      const element = nativeCreate.apply(this, args);
      if (element instanceof HTMLMediaElement) track(element);
      return element;
    }, nativeCreate);
  }
  const nativePlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = passFor(function(...args) { track(this); return nativePlay.apply(this, args); }, nativePlay);
  const scan = () => document.querySelectorAll('audio,video').forEach(track);
  new MutationObserver(scan).observe(document, { childList: true, subtree: true });
  scan();

  // FULLSCREEN THROUGH THE PAGE. This frame is never allowed fullscreen itself
  // (the page's FrameFullscreenMessage says why), and a game
  // that asks the browser directly, which is what Emscripten, SDL, raylib, Godot and
  // Unity all do, is refused and stays small. So a request made here, with a live
  // gesture, becomes the platform's own fullscreen message, and the page fullscreens its
  // stage with the gesture that propagated up to it. Without a gesture it is refused
  // here exactly as the browser would refuse it, so a game cannot spend one it lacks.
  //
  // document.fullscreenEnabled answers true while a request can be passed on, because
  // Emscripten's html5 library, and SDL2 through it, never call requestFullscreen when
  // it is false: that check is the whole reason their fullscreen did nothing here. The
  // promise settles when the page reports the stage's state, as the native one settles
  // on the change. document.fullscreenElement stays null, because the element that went
  // fullscreen is the page's; a game that wants the state reads the SDK's fullscreen
  // event. Leaving is not passed on: protocol.ts says why there is no message for it,
  // and exitFullscreen keeps its native answer, which is that nothing here is fullscreen.
  //
  // ONLY ONCE THE PAGE HAS SAID IT TAKES THEM. Not every parent on the list does: the
  // embed shell has no stage to fullscreen and its own frame is not allowed fullscreen
  // either. The first version handed requests to any parent that had said anything, so
  // in the embed SDL games answered fullscreenEnabled true, sized their canvas for the
  // screen, waited out a request nobody would ever serve and snapped back two seconds
  // later. So a page that takes them says so ('fullscreen-available',
  // ParentFullscreenAvailableMessage in protocol.ts), and until then every answer here is
  // the browser's own: in a frame without the permission, false, and a request refused
  // at once, which is what the engine expects of a frame it cannot fullscreen.
  //
  // Each change of the stage is announced here as a fullscreenchange on the document,
  // which is the browser's own signal to read the state again. Emscripten's html5
  // library resizes the canvas to the screen when it asks, and puts it back only on that
  // event; without it, SDL drew a 640 by 400 game into the corner of a screen-sized
  // canvas, in and out of fullscreen, measured on 5 Nov 2026. On the event it
  // reads fullscreenElement, finds this document has none, and restores the canvas, which
  // the frame then scales with the stage. That is the truth for this document, so an
  // engine reading it is not misled; one that tracks fullscreen by its own flag sees it
  // as left, and asking again while the stage is fullscreen resolves at once.
  //
  // At the top level (a game opened outside OpenGame) or in a frame that is allowed
  // fullscreen, every call goes to the browser as before.
  //
  // The page answers every request it is handed with the stage's state once its own
  // attempt settles (use-frame-bridge.ts): true when the stage is fullscreen, false when
  // the browser refused, as iPhone Safari always does for anything but a video. A false
  // answer refuses the promise at once and fires fullscreenerror at the element that
  // asked, as the browser does, and then a fullscreenchange, so an engine that resized
  // its canvas before asking puts it back. FULLSCREEN_WAIT_MS is only for a page that
  // never answers, such as one built before the answer existed.
  const FULLSCREEN_WAIT_MS = 2000;
  let pageFullscreen = false;
  // The origin of the page that said it takes fullscreen requests, and nobody else.
  let fullscreenParent = null;
  const fullscreenWaits = new Set();
  // A stand-in realm can lack Document or Element, as it can lack the natives above.
  const documents = typeof Document === 'function' ? Document.prototype : {};
  const elements = typeof Element === 'function' ? Element.prototype : {};
  const nativeEnabled = Object.getOwnPropertyDescriptor(documents, 'fullscreenEnabled');
  const nativeWebkitEnabled = Object.getOwnPropertyDescriptor(documents, 'webkitFullscreenEnabled');
  const nativeRequest = elements.requestFullscreen;
  const nativeWebkit = elements.webkitRequestFullscreen;
  const framed = () => { try { return window.top !== window; } catch { return true; } };
  const handBack = () => fullscreenParent !== null && framed() && !(nativeEnabled?.get?.call(document) || nativeWebkitEnabled?.get?.call(document));
  const askPage = () => {
    const activation = typeof navigator === 'object' ? navigator.userActivation : undefined;
    if (activation && !activation.isActive) return false;
    try { host.postMessage({ og: 1, type: 'fullscreen' }, fullscreenParent); } catch { return false; }
    return true;
  };
  const refusal = () => new TypeError('Permissions check failed');
  const dispatch = (target, types) => {
    for (const type of types) {
      try { target.dispatchEvent(new Event(type, { bubbles: true, composed: true })); } catch { /* A stand-in realm has no Event. */ }
    }
  };
  // Bubbling, as the browser's own does, so a listener on window hears it too.
  const announce = () => dispatch(document, nativeWebkit ? ['fullscreenchange', 'webkitfullscreenchange'] : ['fullscreenchange']);
  // At the element that asked, as the browser fires it, and so at the document too while
  // that element is in it.
  const announceError = (element) => dispatch(element && element.isConnected ? element : document,
    nativeWebkit ? ['fullscreenerror', 'webkitfullscreenerror'] : ['fullscreenerror']);
  // In a task of their own, as the browser fires its events after the promise settles,
  // so a game that reads the outcome from either sees the same order it would natively.
  const announceSoon = () => setTimeout(announce, 0);
  const refusedSoon = (element) => setTimeout(() => { announceError(element); announce(); }, 0);
  const settle = (wait, active) => {
    clearTimeout(wait.timer);
    fullscreenWaits.delete(wait);
    if (active) wait.resolve(); else wait.refuse(refusal());
  };
  const handOver = (element) => {
    if (pageFullscreen) { announceSoon(); return Promise.resolve(); }
    if (!askPage()) { refusedSoon(element); return Promise.reject(refusal()); }
    return new Promise((resolve, refuse) => {
      const wait = { resolve, refuse, element, timer: 0 };
      wait.timer = setTimeout(() => { settle(wait, false); refusedSoon(element); }, FULLSCREEN_WAIT_MS);
      fullscreenWaits.add(wait);
    });
  };
  for (const [key, descriptor] of [['fullscreenEnabled', nativeEnabled], ['webkitFullscreenEnabled', nativeWebkitEnabled]]) {
    if (!descriptor?.get) continue;
    Object.defineProperty(documents, key, {
      ...descriptor,
      get: passFor(function() { return descriptor.get.call(this) || (this === document && handBack()); }, descriptor.get),
    });
  }
  if (nativeRequest) {
    elements.requestFullscreen = passFor(function(...args) {
      return handBack() ? handOver(this) : apply(nativeRequest, this, args);
    }, nativeRequest);
  }
  // Safari before 16.4 has only the prefixed call, which returns nothing and reports
  // failure as an event; the hand-back is the same message.
  if (nativeWebkit) {
    elements.webkitRequestFullscreen = passFor(function(...args) {
      if (!handBack()) return apply(nativeWebkit, this, args);
      handOver(this).catch(() => {});
    }, nativeWebkit);
  }
  // A state the page reports, whether a change of its stage or its answer to a request.
  // Announced when it changed, and when it settled a request, since the engine that asked
  // may have resized its canvas and is waiting for the event to read the state again.
  const fullscreenChanged = (active) => {
    const waits = [...fullscreenWaits];
    const changed = active !== pageFullscreen;
    pageFullscreen = active;
    for (const wait of waits) settle(wait, active);
    if (!changed && !waits.length) return;
    setTimeout(() => {
      if (!active) for (const wait of waits) announceError(wait.element);
      if (handBack()) announce();
    }, 0);
  };

  // SEND SCREENSHOT. The Studio page cannot read this document's pixels, which is the
  // point of serving it from another site, so when the creator asks for a screenshot the
  // page asks here and this draws the game's own canvases and posts the picture back.
  // Nothing crosses that the game could not already post itself: the request carries
  // only an id, and the answer is pixels the game drew. The page treats the answer as
  // the game's claim about what is on screen, because a game can forge it, and the
  // creator sees it before anything is sent.
  //
  // Three natives are kept from before any game script runs. The Studio template's
  // og-platform.js holds the game's animation frames while it rests, and a capture has
  // to be drawn in a frame the game has just rendered: WebGL clears its drawing buffer
  // once the frame is shown unless the game asked to preserve it, so the copy is taken
  // in an animation frame queued after the game's own, before the browser presents it.
  // A game that renders outside requestAnimationFrame can still come back blank, and
  // the answer then says so rather than sending an empty picture.
  const shot = __OG_CAPTURE__;
  const nextFrame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame.bind(globalThis) : (callback) => setTimeout(callback, 16);
  const makeCanvas = document.createElement.bind(document, 'canvas');
  const HTML_NS = 'http://www.w3.org/1999/xhtml';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const createHtml = document.createElement.bind(document);
  const nativeCreateNS = document.createElementNS;
  const createSvg = (tag) => nativeCreateNS.call(document, SVG_NS, tag);
  const shotId = /^[A-Za-z0-9_-]{16,64}$/;
  let shooting = 0;
  let lastShot = -Infinity;
  const answerShot = (origin, id, body) => {
    try { host.postMessage(Object.assign({ og: 1, type: 'capture', id: id }, body), origin); } catch { /* The page went away. */ }
  };
  const visibleCanvases = () => {
    const found = [];
    document.querySelectorAll('canvas').forEach((canvas, order) => {
      const rect = canvas.getBoundingClientRect();
      if (!canvas.width || !canvas.height || rect.width < 1 || rect.height < 1) return;
      if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= innerWidth || rect.top >= innerHeight) return;
      const style = getComputedStyle(canvas);
      if (style.visibility === 'hidden' || Number(style.opacity) === 0) return;
      found.push({ canvas: canvas, rect: rect, z: Number.parseInt(style.zIndex, 10) || 0, order: order });
    });
    return found.sort((a, b) => a.z - b.z || a.order - b.order);
  };
  const groundOf = () => {
    for (const element of [document.body, document.documentElement]) {
      const colour = element ? getComputedStyle(element).backgroundColor : '';
      if (colour && colour !== 'transparent' && !/^rgba\([^)]*,\s*0\)$/.test(colour)) return colour;
    }
    return '#000';
  };
  // A picture of one colour is a failed capture (a cleared buffer, a canvas not yet
  // drawn), never feedback anybody meant to send. Judged on a 16 by 9 reduction.
  const uniform = (source) => {
    const probe = makeCanvas(); probe.width = 16; probe.height = 9;
    const context = probe.getContext('2d', { willReadFrequently: true });
    context.drawImage(source, 0, 0, 16, 9);
    const pixels = context.getImageData(0, 0, 16, 9).data;
    const low = [255, 255, 255]; const high = [0, 0, 0];
    for (let i = 0; i < pixels.length; i += 4) {
      for (let c = 0; c < 3; c++) { low[c] = Math.min(low[c], pixels[i + c]); high[c] = Math.max(high[c], pixels[i + c]); }
    }
    return high.every((value, c) => value - low[c] <= 2);
  };
  const encode = (canvas, quality) => new Promise((resolve) => {
    try { canvas.toBlob(resolve, 'image/jpeg', quality); } catch { resolve(null); }
  });
  // WHAT THE PLAYER SEES, NOT ONLY WHAT THE CANVASES HOLD. Until 5 Oct 2026 this drew the
  // canvases and nothing else, so a game whose HUD is HTML laid over its scene (health
  // panels, a move menu, a message box, a pause button) sent the arena with every word of
  // it missing, and one came back from a playtest to show it. So the page itself is drawn now, the way a
  // browser draws an <img> of an SVG: each visible element is copied with its computed
  // style written onto it, every canvas is replaced by the copy of it taken in the frame
  // the game just rendered, and the whole of it goes into an SVG <foreignObject> that is
  // drawn onto one canvas at the frame's own size. Stacking, transforms and opacity are
  // the browser's own, so a canvas under a HUD or a HUD under a canvas come out as they
  // stand on screen.
  //
  // It reads only this document, and fetches only from this origin, data: addresses and
  // blob: addresses this origin made, which is narrower than the runtime contract's
  // connect-src; an image or font the SVG cannot carry inline is left out rather than
  // fetched from anywhere else. So nothing from outside the game's origin enters the
  // picture. The page's own checks on the answer are unchanged, and it still treats the
  // picture as the game's claim, since the game shares this realm and can forge it.
  //
  // One deadline covers the whole drawing, from copying the canvases to decoding the SVG,
  // and one byte budget covers everything carried in it, the copies, the inlined files
  // and the markup itself. Past either, or in a browser that will not read back a canvas
  // with a foreignObject drawn on it, the canvases go alone, which is the picture this
  // sent before. Known gaps, accepted: a font added only through the FontFace API or
  // served from another origin draws in the fallback face; text sitting directly in a
  // scrolled box, rather than in an element inside it, is drawn unscrolled.
  const serialize = (node) => new XMLSerializer().serializeToString(node);
  const SKIPPED = /^(script|style|link|meta|template|noscript|title|base|head|audio|iframe|object|embed|dialog)$/;
  const KEPT_ATTRIBUTES = ['colspan', 'rowspan', 'type', 'dir', 'lang', 'start', 'reversed', 'placeholder'];
  const sameSite = (value) => {
    try {
      const url = new URL(value, document.baseURI);
      if (url.protocol === 'data:') return url.href;
      // A blob: address carries the origin that made it, and only this one's will do.
      return url.origin === location.origin ? url.href : null;
    } catch { return null; }
  };
  const asDataUrl = (blob) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
  // Past the byte budget, or past the element cap, the page is too much to carry: its own
  // error, so a page with no canvas is told that rather than told it is still loading.
  const CROWDED = 'too much to carry';
  const spend = (budget, size) => {
    budget.bytes += size;
    if (budget.bytes > shot.domBytesMax) throw new Error(CROWDED);
  };
  // A file is refused from its declared length, and cut off while it is read, once it could
  // not fit what is left of the budget as base64. Until 5 Oct 2026 it was read whole and
  // measured afterwards, so one large image cost its full download before being dropped.
  // What is left counts the bytes the other reads in flight have taken so far, so six files
  // read at once cannot each take the whole remainder.
  const room = (job) => Math.floor((shot.domBytesMax - job.bytes) * 3 / 4) - job.reading;
  const readCapped = async (response, job) => {
    const declared = Number(response.headers.get('content-length'));
    if (!response.body || (Number.isFinite(declared) && declared > room(job))) { try { await response.body?.cancel(); } catch { /* Gone already. */ } return null; }
    const reader = response.body.getReader();
    const parts = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.byteLength > room(job)) { try { await reader.cancel(); } catch { /* Gone already. */ } return null; }
        size += value.byteLength;
        job.reading += value.byteLength;
        parts.push(value);
      }
    } finally {
      job.reading -= size;
    }
    return new Blob(parts, { type: response.headers.get('content-type') || '' });
  };
  // At most domFetchesAtOnce requests in flight, so a page of a few hundred images does not
  // start a few hundred downloads from one press.
  const queued = (job, work) => new Promise((resolve) => {
    const run = () => {
      job.active++;
      work().catch(() => null).then((value) => {
        job.active--;
        const next = job.queue.shift();
        if (next) next();
        resolve(value);
      });
    };
    if (job.active < shot.domFetchesAtOnce) run(); else job.queue.push(run);
  });
  // One fetch per address per capture, and every use counted against the budget, since
  // each use is another copy in the markup.
  const inline = (value, job) => {
    const href = sameSite(value);
    if (!href) return Promise.resolve(null);
    const fetched = href.startsWith('data:') ? Promise.resolve(href) : job.cache.get(href) || queued(job, async () => {
      if (job.stop.signal.aborted) return null;
      const response = await fetch(href, { credentials: 'omit', redirect: 'error', signal: job.stop.signal });
      const blob = response.ok ? await readCapped(response, job) : null;
      return blob ? await asDataUrl(blob) : null;
    });
    job.cache.set(href, fetched);
    return fetched.then((data) => { if (data) spend(job, data.length); return data; });
  };
  const URL_IN_CSS = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
  const inlineCss = async (text, job, base) => {
    const found = [...text.matchAll(URL_IN_CSS)];
    if (!found.length) return text;
    const swaps = await Promise.all(found.map((match) => {
      let target = match[2];
      try { target = new URL(target, base || document.baseURI).href; } catch { return null; }
      return inline(target, job);
    }));
    let at = 0;
    return text.replace(URL_IN_CSS, () => { const data = swaps[at++]; return data ? 'url("' + data + '")' : 'none'; });
  };
  // ONLY WHAT DIFFERS. Every computed longhand is about 475 properties and 11 KB an element,
  // so writing all of them refused any page past about 730 elements at the byte budget, a
  // third of domElementsMax, and a page with no canvas was then told it was still drawing
  // its first frame, which no retry fixes (review, 5 Oct 2026). A property is left out only
  // when the copy will get the same value without it: equal to what the browser gives this
  // kind of element on its own, equal to what a plain element gets (so no rule in the
  // browser's own sheet sets it for this kind, as h1's font-size), and equal to the
  // parent's, which is what an inherited property takes in the copy.
  //
  // What an element gets on its own is read from a probe of the same kind inside a closed
  // shadow root under a host reset with all: initial, so none of the page's rules reach it.
  // The host is in the document only while the copy runs, which is synchronous, and the
  // walk skips it. A custom element is probed as a span: it has no rules of its own in the
  // browser's sheet, and making one in this document would run the game's constructor.
  const probe = { host: null, root: null, cache: new Map() };
  const openProbe = () => {
    const host = createHtml('div');
    // Every declaration important, or a page rule such as *{color:#fff !important} reaches the
    // host, the probes inherit it, and the root element, compared against them, is copied
    // without it. all does not reset direction or unicode-bidi, so those are named.
    host.setAttribute('style', ['all:initial', 'direction:ltr', 'unicode-bidi:normal', 'position:fixed', 'left:0', 'top:0', 'width:0', 'height:0',
      'overflow:hidden', 'visibility:hidden', 'contain:strict', 'pointer-events:none'].map((rule) => rule + ' !important').join(';'));
    const shadow = host.attachShadow({ mode: 'closed' });
    const root = createHtml('span');
    root.setAttribute('style', 'visibility:visible !important');
    shadow.appendChild(root);
    document.documentElement.appendChild(host);
    probe.host = host; probe.root = root; probe.cache = new Map();
  };
  const closeProbe = () => { if (probe.host) probe.host.remove(); probe.host = null; probe.root = null; };
  const defaultsOf = (namespace, tag) => {
    const key = namespace + ' ' + tag;
    let values = probe.cache.get(key);
    if (values) return values;
    values = new Map();
    if (probe.root) {
      const element = namespace === SVG_NS ? createSvg(tag) : createHtml(tag.includes('-') ? 'span' : tag);
      probe.root.appendChild(element);
      const style = getComputedStyle(element);
      for (let i = 0; i < style.length; i++) values.set(style[i], style.getPropertyValue(style[i]));
      element.remove();
    }
    probe.cache.set(key, values);
    return values;
  };
  const plainDefaults = () => defaultsOf(HTML_NS, 'span');
  const styleText = (style, prefix, own, parent) => {
    const plain = plainDefaults();
    let text = '';
    for (let i = 0; i < style.length; i++) {
      const name = style[i];
      let value = style.getPropertyValue(name);
      if (prefix && name === 'transform') value = prefix + (value === 'none' ? '' : value);
      else if (value === own.get(name) && value === plain.get(name) && value === (parent ? parent.getPropertyValue(name) : plain.get(name))) continue;
      text += name + ':' + value + ';';
    }
    return text;
  };
  const familyOf = (value) => value.trim().replace(/^['"]|['"]$/g, '');
  // The page's @font-face rules for the families it has loaded, with their files inlined,
  // including rules inside @media, @supports and @layer blocks and in @import-ed sheets.
  // A sheet from another origin cannot be read and is skipped; its text then draws in the
  // fallback face.
  // Only the faces the page actually loaded, matched on family, style, weight and range: a
  // family split into a hundred unicode-range files (any CJK web font) used to have every
  // file fetched and carried, which alone was past the budget (review, 5 Oct 2026). Where
  // no rule of a loaded family matches on all four, which only a difference in how the two
  // APIs spell a value would cause, every rule of that family goes, as before.
  const faceKey = (family, style, weight, range) => [family, style || 'normal', weight || 'normal', range || 'U+0-10FFFF']
    .map((part) => String(part).trim().toLowerCase().replace(/\s+/g, ' ')).join('|');
  const fontFaces = async (job) => {
    const loaded = new Set();
    const faces = new Set();
    try {
      document.fonts.forEach((face) => {
        if (face.status !== 'loaded') return;
        const family = familyOf(face.family);
        loaded.add(family);
        faces.add(faceKey(family, face.style, face.weight, face.unicodeRange));
      });
    } catch { /* No font loading API. */ }
    if (!loaded.size) return '';
    const found = [];
    const walk = (list, base, depth) => {
      if (depth > 8) return;
      for (const rule of list) {
        if (rule instanceof CSSFontFaceRule) {
          const family = familyOf(rule.style.getPropertyValue('font-family'));
          if (loaded.has(family)) found.push({ rule: rule, base: base, family: family, key: faceKey(family, rule.style.getPropertyValue('font-style'),
            rule.style.getPropertyValue('font-weight'), rule.style.getPropertyValue('unicode-range')) });
        } else if (rule instanceof CSSImportRule) {
          let inner;
          try { inner = rule.styleSheet && rule.styleSheet.cssRules; } catch { continue; }
          if (inner) walk(inner, rule.styleSheet.href || base, depth + 1);
        } else if (rule.cssRules) {
          walk(rule.cssRules, base, depth + 1);
        }
      }
    };
    for (const sheet of document.styleSheets) {
      let list;
      try { list = sheet.cssRules; } catch { continue; }
      walk(list, sheet.href || document.baseURI, 0);
    }
    const matched = new Set(found.filter((item) => faces.has(item.key)).map((item) => item.family));
    const rules = found.filter((item) => faces.has(item.key) || !matched.has(item.family)).map((item) => inlineCss(item.rule.cssText, job, item.base));
    return (await Promise.all(rules)).join('\n');
  };
  const drawPage = async (snapshots, width, height, job) => {
    // A document with no window: elements made in it are never upgraded by the game's
    // custom element definitions and never load anything, so copying runs no game code.
    const inert = document.implementation.createHTMLDocument('');
    // The copying is synchronous, so a timer cannot interrupt it; it watches the job's
    // deadline itself, or a slow machine with a big page would hold the main thread past
    // the parent's whole wait and the creator would be told the game did not answer.
    const late = () => performance.now() > job.deadline;
    // Each still is already at the size it is drawn at (see takeShot), so encoding it costs
    // what the picture needs and no more.
    const stills = new Map();
    for (const [node, still] of snapshots) {
      if (late()) throw new Error('over budget');
      const data = still.toDataURL('image/webp', 0.92);
      spend(job, data.length);
      stills.set(node, data);
    }
    let elements = 0;
    const waits = [];
    const pseudo = [];
    const copy = (node, scrolled, parent) => {
      if (node.nodeType === 3) { spend(job, node.nodeValue.length); return inert.createTextNode(node.nodeValue); }
      if (node.nodeType !== 1 || node === probe.host) return null;
      const tag = node.localName;
      if (SKIPPED.test(tag)) return null;
      if (++elements > shot.domElementsMax) throw new Error(CROWDED);
      if (late()) throw new Error('over budget');
      const style = getComputedStyle(node);
      if (style.display === 'none') return null;
      // A scrolled box moves its children by its scroll, so a message log scrolled to its
      // newest line is drawn showing that line. Written into the child's own transform,
      // before anything else can rewrite its style; a fixed child is not moved by it.
      const prefix = scrolled && style.position !== 'fixed' ? scrolled : '';
      // An SVG is copied whole: its presentation is in its own attributes, and an SVG
      // drawn as an image runs none of its scripts or handlers.
      if (node instanceof SVGSVGElement) {
        // Copied whole, so every element inside it counts, and so does its size.
        elements += node.getElementsByTagName('*').length;
        if (elements > shot.domElementsMax) throw new Error(CROWDED);
        const svg = inert.importNode(node, true);
        const text = styleText(style, prefix, defaultsOf(SVG_NS, 'svg'), parent);
        spend(job, text.length);
        svg.setAttribute('style', text);
        return svg;
      }
      if (node instanceof SVGElement) return null;
      let out;
      if (node instanceof HTMLCanvasElement || node instanceof HTMLVideoElement) {
        out = inert.createElement('img');
        const still = stills.get(node);
        if (still) out.setAttribute('src', still);
      } else if (node instanceof HTMLImageElement) {
        out = inert.createElement('img');
        // Only an image the page has finished loading: one still on its way is not on screen
        // yet, and asking for it again would be a second download of it.
        const source = node.complete && node.naturalWidth > 0 ? node.currentSrc || node.src : '';
        if (source) waits.push(inline(source, job).then((data) => { if (data) out.setAttribute('src', data); }));
      } else {
        out = inert.createElement(tag);
        for (const name of KEPT_ATTRIBUTES) if (node.hasAttribute(name)) out.setAttribute(name, node.getAttribute(name));
        if (node instanceof HTMLInputElement) {
          out.setAttribute('value', node.value);
          if (node.checked) out.setAttribute('checked', '');
        } else if (node instanceof HTMLTextAreaElement) {
          out.textContent = node.value;
        } else if (node instanceof HTMLOptionElement && node.selected) {
          out.setAttribute('selected', '');
        }
      }
      const text = styleText(style, prefix, defaultsOf(HTML_NS, out.localName), parent);
      spend(job, text.length);
      out.setAttribute('style', text);
      if (text.includes('url(')) waits.push(inlineCss(text, job).then((done) => { out.setAttribute('style', done); }));
      for (const which of ['::before', '::after']) {
        const generated = getComputedStyle(node, which);
        const content = generated.getPropertyValue('content');
        if (!content || content === 'none' || content === 'normal') continue;
        const name = 'og-shot-' + pseudo.length;
        out.classList.add(name);
        const rule = '.' + name + which + '{' + styleText(generated, '', plainDefaults(), style) + '}';
        spend(job, rule.length);
        pseudo.push(inlineCss(rule, job));
      }
      if (out.localName !== 'img' && !(node instanceof HTMLTextAreaElement)) {
        const inner = node.scrollTop || node.scrollLeft ? 'translate(' + -node.scrollLeft + 'px,' + -node.scrollTop + 'px) ' : '';
        for (const child of node.childNodes) {
          const made = copy(child, inner, style);
          if (made) out.appendChild(made);
        }
      }
      return out;
    };
    let root;
    try { openProbe(); root = copy(document.documentElement, '', null); }
    finally { closeProbe(); }
    if (!root) throw new Error('nothing to draw');
    const [faces, rules] = await Promise.all([fontFaces(job), Promise.all(pseudo), Promise.all(waits)]);
    if (late() || job.stop.signal.aborted) throw new Error('over budget');
    const sheet = inert.createElement('style');
    sheet.textContent = faces + '\n' + rules.join('\n');
    root.insertBefore(sheet, root.firstChild);
    const markup = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">'
      + '<foreignObject x="0" y="0" width="100%" height="100%">' + serialize(root) + '</foreignObject></svg>';
    // The markup is the copy that is actually held, so it is what the budget is checked
    // against last: inlined files counted once per use, plus every computed style.
    if (markup.length > shot.domBytesMax) throw new Error(CROWDED);
    if (late()) throw new Error('over budget');
    // A data: URL and not a blob: one. Chrome taints a canvas for a foreignObject drawn
    // from a blob: address and not from a data: one, measured in the test beside this.
    const picture = new Image();
    picture.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
    await picture.decode();
    return picture;
  };
  // The deadline is the job's, so whatever time the copies took comes out of it.
  const withBudget = (work, job) => new Promise((resolve, refuse) => {
    const timer = setTimeout(() => { job.stop.abort(); refuse(new Error('over budget')); }, Math.max(0, job.deadline - performance.now()));
    work.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); job.stop.abort(); refuse(error); });
  });
  const takeShot = (origin, id) => {
    const now = performance.now();
    if (shooting || now - lastShot < shot.intervalMs) { answerShot(origin, id, { ok: false, reason: 'busy' }); return; }
    const attempt = ++shooting;
    lastShot = now;
    const release = setTimeout(() => { if (shooting === attempt) shooting = 0; }, shot.timeoutMs);
    // The interval is for pictures actually taken. A capture that failed (blank, no
    // canvas) frees the next press at once, or the page would be told busy when it is not.
    const finish = (body) => { clearTimeout(release); if (shooting === attempt) shooting = 0; if (!body.ok) lastShot = -Infinity; answerShot(origin, id, body); };
    nextFrame(async () => {
      const started = performance.now();
      try {
        const canvases = visibleCanvases();
        const scale = Math.min(1, shot.edgePx / Math.max(innerWidth, innerHeight));
        const blankCanvas = () => {
          const made = makeCanvas();
          made.width = Math.max(1, Math.round(innerWidth * scale));
          made.height = Math.max(1, Math.round(innerHeight * scale));
          const context = made.getContext('2d');
          context.fillStyle = groundOf();
          context.fillRect(0, 0, made.width, made.height);
          return { canvas: made, context: context };
        };
        // Everything that has to be read in this frame is read before the first await: the
        // canvases alone, which is the picture if the page cannot be drawn, and a copy of
        // each canvas and each playing video for the page's drawing to use in its place.
        const alone = blankCanvas();
        const snapshots = new Map();
        // Each game canvas is read once, into its copy, and the canvases-alone picture is
        // drawn from the copies, so a WebGL buffer is only asked for its pixels the once.
        //
        // Each copy is made at the size it will be drawn, its box on screen at the picture's
        // scale, rather than at the canvas's own resolution: a 4096 px canvas shown in a small
        // box was copied and encoded whole, 2.65 s and 42 MB measured, so the budget ran out
        // and the HUD was lost (review, 5 Oct 2026). A video off screen is not copied at all.
        const reduced = (source, rect) => {
          const still = makeCanvas();
          const fit = Math.min(1, shot.edgePx / Math.max(rect.width * scale, rect.height * scale, 1));
          still.width = Math.max(1, Math.round(rect.width * scale * fit));
          still.height = Math.max(1, Math.round(rect.height * scale * fit));
          still.getContext('2d').drawImage(source, 0, 0, still.width, still.height);
          return still;
        };
        for (const item of canvases) {
          const still = reduced(item.canvas, item.rect);
          snapshots.set(item.canvas, still);
          alone.context.drawImage(still, item.rect.left * scale, item.rect.top * scale, item.rect.width * scale, item.rect.height * scale);
        }
        document.querySelectorAll('video').forEach((video) => {
          if (video.readyState < 2 || !video.videoWidth) return;
          const rect = video.getBoundingClientRect();
          if (rect.width < 1 || rect.height < 1 || rect.right <= 0 || rect.bottom <= 0 || rect.left >= innerWidth || rect.top >= innerHeight) return;
          try { snapshots.set(video, reduced(video, rect)); } catch { /* Not drawable. */ }
        });
        let out = null;
        let drewBlankPage = false;
        let crowded = false;
        try {
          const job = { deadline: started + shot.domBudgetMs, bytes: 0, cache: new Map(), stop: new AbortController(), active: 0, queue: [], reading: 0 };
          const page = await withBudget(drawPage(snapshots, innerWidth, innerHeight, job), job);
          const whole = blankCanvas();
          whole.context.drawImage(page, 0, 0, whole.canvas.width, whole.canvas.height);
          // Reading it back is also the test of whether the browser let it be read: one
          // that taints a canvas for a foreignObject throws here, and the canvases go alone.
          if (uniform(whole.canvas)) drewBlankPage = true; else out = whole.canvas;
        } catch (error) {
          // Over budget, refused, or too much to carry: the canvases alone.
          crowded = error instanceof Error && error.message === CROWDED;
        }
        if (!out) {
          if (!canvases.length) { finish({ ok: false, reason: drewBlankPage ? 'blank' : crowded ? 'crowded' : 'no-canvas' }); return; }
          if (uniform(alone.canvas)) { finish({ ok: false, reason: 'blank' }); return; }
          out = alone.canvas;
        }
        for (const quality of shot.jpegQualities) {
          const image = await encode(out, quality);
          if (image && image.size > 0 && image.size <= shot.bytesMax) {
            finish({ ok: true, image: image, width: out.width, height: out.height });
            return;
          }
        }
        finish({ ok: false, reason: 'too-large' });
      } catch {
        finish({ ok: false, reason: 'failed' });
      }
    });
  };

  // Silence lands at once, as the mute always did. A level change is eased over a few
  // milliseconds where the browser can schedule it, because a slider dragged through
  // forty steps would otherwise click at every one of them.
  const applyGain = (output) => {
    const target = silent() ? 0 : level;
    const param = output.gain;
    try {
      if (target > 0 && output.context.state === 'running' && typeof param.cancelAndHoldAtTime === 'function') {
        const now = output.context.currentTime;
        param.cancelAndHoldAtTime(now);
        param.setTargetAtTime(target, now, 0.015);
        return;
      }
    } catch { /* Fall through to setting it outright. */ }
    param.cancelScheduledValues(0);
    param.value = target;
  };
  const applySound = () => {
    for (const output of outputs.values()) applyGain(output);
    scan();
    for (const reference of media) {
      const element = reference.deref();
      if (element) { descriptor.set.call(element, silent() || desired.get(element)); applyVolume(element); }
      else media.delete(reference);
    }
    unlockAudio();
  };

  addEventListener('message', (event) => {
    // A browser-made message from the parent as it was before any game script ran. This
    // is not a boundary against the game, which shares this realm and can see and answer
    // anything said here; the page is what refuses a forged answer. It keeps a game from
    // steering this receiver with a synthetic event or a replaced window.parent.
    if (!event.isTrusted || event.source !== host || !trusted(event.origin)) return;
    const data = event.data;
    if (!data || data.og !== 1) return;
    if (data.type === 'fullscreen-available') {
      fullscreenParent = event.origin;
      return;
    }
    if (data.type === 'fullscreen') {
      if (typeof data.active === 'boolean') fullscreenChanged(data.active);
      return;
    }
    if (data.type === 'play') {
      audioUnlocked = true;
      unlockAudio();
      return;
    }
    if (data.type === 'document-status') {
      documentParent = event.origin;
      reportDocument();
      return;
    }
    if (data.type === 'capture') {
      if (typeof data.id === 'string' && shotId.test(data.id)) takeShot(event.origin, data.id);
      return;
    }
    if (data.type === 'volume') {
      // A number from 0 to 1 or nothing: a level out of range, NaN or a string is a page
      // this script does not understand, and guessing at it could only make a game louder.
      if (typeof data.level === 'number' && data.level >= 0 && data.level <= 1) {
        level = data.level;
        applySound();
      }
      return;
    }
    if (data.type !== 'mute' || typeof data.muted !== 'boolean') return;
    muted = data.muted;
    applySound();
  });
})();`;

/**
 * The receiver with its policy blanks filled: parent origins, input cadence and screenshot
 * limits. Exported so `apps/web/tests/browser/frame-capture-page.browser.mts` runs in a
 * real browser exactly what this Worker injects, rather than a copy of the filling-in.
 */
export function gameAudioRuntime(origins: string[]): string {
  // Replacer functions, so a `$` in either value is copied rather than read as a pattern.
  const parents = JSON.stringify(origins).replaceAll("<", "\\u003c");
  const capture = JSON.stringify(SCREENSHOT);
  return GAME_AUDIO_RUNTIME
    .replace("__OG_INPUT_INTERVAL__", () => String(limits.analytics.runtime.inputIntervalMs))
    .replace("__OG_GAMEPAD_INTERVAL__", () => String(limits.analytics.runtime.inputIntervalMs))
    .replace("__OG_GAMEPAD_DEADZONE__", () => String(limits.analytics.runtime.gamepadDeadzone))
    .replace("__OG_CAPTURE__", () => capture)
    .replace("__OG_AUDIO_PARENTS__", () => parents);
}

/** The origins a policy's frame-ancestors names, as the receiver's parent list. */
export function frameAncestorsOf(policy: string | null): string[] {
  const ancestors = policy?.split(";")
    .find((directive) => directive.trim().startsWith("frame-ancestors "))?.trim().split(/\s+/).slice(1) ?? [];
  return ancestors.filter((value) => /^https?:\/\/[^\s<>"']+$/.test(value));
}

/**
 * Preserve the doctype and stream the document; never buffer an uploaded game.
 *
 * `parents` is passed in rather than read off the response, and that is the point of it.
 * Until 21 Oct 2026 this read the response's own frame-ancestors, which on a published
 * game also lists every embed partner the creator approved -- because frame-ancestors is
 * checked against every ancestor, and a partner is the grandparent of a game inside the
 * opengame.io embed shell. The same list then let a partner frame <label>.opengame.gg
 * directly, skip the shell, and be answered here as a trusted parent: a screenshot of the
 * game on request, its sound, and a feed of the player's input activity. A partner
 * is never meant to be the game's parent. The shell is, and it is on the platform list,
 * so callers pass the platform's ancestors and nothing a creator added.
 */
export function withGameAudio(response: Response, parents: string[], after = ""): Response {
  const runtime = gameAudioRuntime(parents);
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  let inserted = false;
  return new HTMLRewriter().on("*", {
    element(element) {
      if (inserted) return;
      inserted = true;
      // `after` is the edge SDK tag (platform-sdk.ts), placed behind the host runtime as
      // a derived tree places /_og/sdk.js behind /_og/host.js, and before any game script.
      element.before(`<script data-og-audio="${GAME_AUDIO_VERSION}">${runtime}</script>${after}`, { html: true });
    },
  }).transform(new Response(response.body, { status: response.status, headers }));
}
