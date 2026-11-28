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
export const GAME_AUDIO_VERSION = "audio-33-every-context-heard";

/** Only the numbers the receiver needs, so the page's half and this one read one block. */
/** The recording block the receiver reads (`limits.play.recording`), less the page's own numbers. */
const RECORDING = (({ edge, shortEdge, compactEdge, compactShortEdge, fpsMax, bitsPerSecond, compactBitsPerSecond, audioBitsPerSecond, keyframeSeconds, flushMs,
  fpsMin, softwareFpsMax, captureBudgetMs, layerScanMs, domMinIntervalMs, domCostFactor, domSliceMs, domSliceIdleMs, domDeadlineMs, domStallMaxMs, domStallsMax, domStepMaxMs, domStepSlowMs, domBackoffMs, domRefreshMs, reshapeMs,
  hevcEdge, hevcShortEdge, hevcScreenPx, hevcBitsPerSecond, hevcCompactBitsPerSecond }) =>
  ({ edge, shortEdge, compactEdge, compactShortEdge, fpsMax, bitsPerSecond, compactBitsPerSecond, audioBitsPerSecond, keyframeSeconds, flushMs,
    fpsMin, softwareFpsMax, captureBudgetMs, layerScanMs, domMinIntervalMs, domCostFactor, domSliceMs, domSliceIdleMs, domDeadlineMs, domStallMaxMs, domStallsMax, domStepMaxMs, domStepSlowMs, domBackoffMs, domRefreshMs, reshapeMs,
    hevcEdge, hevcShortEdge, hevcScreenPx, hevcBitsPerSecond, hevcCompactBitsPerSecond }))(limits.play.recording);

const SCREENSHOT = (({ edgePx, jpegQualities, bytesMax, timeoutMs, intervalMs, domBudgetMs, domElementsMax, domBytesMax, domFetchesAtOnce, domSourceBytesMax }) =>
  ({ edgePx, jpegQualities, bytesMax, timeoutMs, intervalMs, domBudgetMs, domElementsMax, domBytesMax, domFetchesAtOnce, domSourceBytesMax }))(limits.studio.preview.screenshot);

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
  // GODOT'S OWN LOADING SCREEN IS NOT THE GAME, AND NOBODY SHOULD SEE IT. Every Godot web
  // export ships an HTML shell whose #status overlay (a grey #242424 ground, the boot splash
  // image, which is the Godot logo unless the creator replaced it, and a progress bar) sits
  // over the canvas while the engine downloads and compiles, and is removed by the shell the
  // moment engine.startGame() settles, which is after the engine's first frame. That splash
  // image was this document's first contentful paint, so the parent's cover came off a tenth
  // of a second in, and a player watched Godot's logo, grey and a progress bar for as long as
  // forty megabytes of wasm took, instead of our own loader (17 Nov 2026). So here, for a
  // document shaped like Godot's shell and nothing else:
  // the overlay is hidden under a parent whose cover stands in for it (hideShell, below), which
  // keeps it from showing through a cover that lifts for any other reason, and 'painted' waits
  // until the shell has
  // taken its overlay down. Godot's own failure notice (#status-notice: a browser missing a
  // feature, a file that failed) stays visible and counts as the end of the wait, because
  // the reason a game will not start is worth more than our spinner. Nothing about the
  // game's files changes; this is a stylesheet in this realm and an observer, and a shell
  // that renamed its elements simply gets the first contentful paint as before.
  // ':has' scopes the rule to the shell's exact shape: the canvas and the overlay as children
  // of body, and the progress bar inside the overlay. A browser without ':has' ignores the
  // rule, and the cover still waits, so it is only the cover lifting early that shows less.
  const SHELL = 'body:has(> canvas#canvas) > #status:has(> #status-progress)';
  let contentful = false;
  let shell = null;
  let notice = null;
  // Down is out of the document, as Godot 4's shell takes it, or hidden by the shell itself
  // (its own inline style, or anything that makes it display:none), as a customised or older
  // shell may do instead. Its computed visibility is never read: the rule below hides it.
  const shellDown = () => {
    try { return !shell.isConnected || shell.style.display === 'none' || shell.style.visibility === 'hidden' || getComputedStyle(shell).display === 'none'; } catch { return true; }
  };
  const noticeShown = () => {
    try { return Boolean(notice && notice.isConnected && getComputedStyle(notice).display !== 'none' && notice.textContent.trim()); } catch { return false; }
  };
  // UNREAL'S COVER IS THE SAME PROBLEM IN A BIGGER COAT. A UE 5.9 Wasm package's page
  // (index.html with wasm-play.js and wasm-loader.js beside it) lays an opaque #cover over its
  // canvas while the engine boots: a dark gradient, the project's name in 800-weight type, a
  // yellow bar, "Loading the level... 41 s", and a checklist at top left naming the browser,
  // the graphics card and the settings it picked. All of it showed in a private preview on
  // 17 Nov 2026, and the owner asked for ours instead. The cover's title was the first contentful paint,
  // so the parent's cover lifted onto Epic's for the whole boot, which is most of a minute.
  //
  // The page says where it is, which is what makes this cheap: wasm-play.js moves
  // body[data-cover] forward through loading, engine, level, ready, click and lifted (or
  // failed, or ended), and lifts the cover only after the engine's first frame has reached the
  // canvas ('ue-first-canvas-frame', or three seconds after ready), at which point the cover
  // takes the class 'lifting', its own rule stops hiding the canvas, and 600 ms later it is
  // hidden. So here, for a page shaped exactly like Epic's (its ue-project meta, the canvas and
  // the cover as children of body, and the cover's bar), the cover is hidden under a parent
  // whose own cover stands in for it, the stage is reported as progress, and 'painted' waits
  // for the cover to be gone. Epic's error card stays visible and ends the wait, as Godot's
  // notice does, and its end card is left alone.
  const UE_PAGE = 'html:has(> head > meta[name="ue-project"]) > body:has(> canvas#canvas)';
  const UE_COVER = '#cover:has(> #art #progressbar)';
  const UE_TOAST = '#toast:has(> #toast-text):has(> button#toast-close)';
  let ueCover = null;
  // Down is gone (hidden, which wasm-play.js sets 600 ms after the lift), waiting for the
  // click that ue-start=click asks for, or stopped: in every one the canvas, the start screen
  // or the error card is what the page shows. Not the lift itself: with the real package on a GPU worker
  // the WebGPU canvas reached the screen 370 ms after the class landed, under load, so a report
  // then had the parent's 220 ms fade end on Epic's bare #101010 for a moment (17 Nov 2026).
  // By hidden, Epic's own half-second fade has finished over a drawn canvas.
  //
  // And gone only counts once the engine has said it drew: its first canvas frame
  // ('ue-first-canvas-frame', from the WebGPU RHI) or its ready marker ('ue-ready', and the
  // older names). wasm-play.js lifts the cover by itself two minutes into the level whatever
  // the engine has done, and on a slow link on production that lift came 44 s before the level
  // drew, over a black canvas (Unreal lane's run 2, 17 Nov 2026). Until the engine speaks, the
  // stage stays 'level' and the parent's cover stays up; its ceiling still bounds the wait.
  let ueEngineDrew = false;
  let ueChanged = null;
  // The first canvas frame counts only once the page is at ready or past it: Epic's own notes
  // say frame 1 can be presented before anything drew, and one that came during the level would
  // otherwise let the two-minute lift through (review, 17 Nov 2026). The ready marker counts
  // whenever it comes.
  const ueSpoke = (event) => {
    let state = '';
    try { state = document.body ? document.body.dataset.cover : ''; } catch { /* No body yet. */ }
    if (event.type === 'ue-first-canvas-frame' && state !== 'ready' && state !== 'click' && state !== 'lifted') return;
    ueEngineDrew = true;
    if (ueChanged) ueChanged();
  };
  for (const name of ['ue-first-canvas-frame', 'ue-ready', 'ue-site-ready', 'ue-interactive']) addEventListener(name, ueSpoke);
  const ueDown = () => {
    try {
      const state = document.body ? document.body.dataset.cover : '';
      if (ueCover.classList.contains('click') || state === 'click' || state === 'failed' || state === 'ended') return true;
      return (!ueCover.isConnected || ueCover.hidden) && ueEngineDrew;
    } catch { return true; }
  };
  // The level's own count, when the engine sends one ('ue-progress', the event wasm-play.js
  // reads). Read here from the first byte, never cancelled, and kept only as a number.
  let ueLevel = null;
  addEventListener('ue-progress', (event) => {
    try {
      const fraction = event.detail && event.detail.fraction;
      if (typeof fraction === 'number' && fraction >= 0 && fraction <= 1) ueLevel = Math.max(ueLevel || 0, fraction);
    } catch { /* Not a count. */ }
  });
  const findShell = () => {
    if (shell || ueCover) return;
    try {
      const status = document.getElementById('status');
      if (status && status.isConnected && status.matches(SHELL)) { watchShell(status); return; }
      const cover = document.getElementById('cover');
      if (cover && cover.isConnected && cover.matches(UE_PAGE + ' > ' + UE_COVER)) watchUnreal(cover);
    } catch { /* No selector support for :has, or no DOM yet: no shell to wait for. */ }
  };
  // Whether Godot's loading overlay, or Unreal's cover, is still what the page is showing.
  const shellUp = () => {
    findShell();
    if (ueCover) return !ueDown();
    return Boolean(shell && !shellDown() && !noticeShown());
  };
  // A first paint from something parsed above the overlay, a title a creator added over
  // Godot's canvas, would go out before the overlay is found. So while a document whose body
  // already holds an engine's canvas is still parsing, the report waits for the parse to
  // finish. Unreal's page holds the same canvas#canvas, so this covers its cover's title too.
  const mayBeShell = () => { try { return document.readyState === 'loading' && Boolean(document.querySelector('body > canvas#canvas')); } catch { return false; } };
  const reportPaint = () => {
    if (painted || !contentful || shellUp() || (!shell && !ueCover && mayBeShell())) return;
    painted = true;
    if (documentParent) host.postMessage({ og: 1, type: 'painted' }, documentParent);
  };
  // The shell taking its overlay down is the engine having started and drawn, so it counts
  // as a paint even where the browser never times one on a WebGL canvas. Counted two
  // animation frames later, not at once: the overlay goes in a microtask after the engine's
  // first frame is drawn and before it is presented, and a report sent then can start the
  // cover's fade a frame ahead of the game, over the shell's bare body. The timer is for a
  // frame the browser has stopped animating, which nobody is looking at. Only the overlay's
  // own attributes and the notice are watched, never the whole overlay, so a shell that
  // animates its loader through inline styles costs nothing per frame here.
  // HOW FAR THE DOWNLOAD HAS GOT, so the parent can tell a slow link from a dead game. With
  // Godot's own loader hidden, the parent's cover stood over the whole engine download, and
  // its thirty-second "has not started" came up over a game that was loading fine on a slow
  // link: the QA export's engine took 60 to 90 s at 110 to 280 KB/s (17 Nov 2026). The shell already
  // knows: Godot's onProgress sets the progress bar's value and max, which reflect into its
  // attributes, so they are read here and nothing in the engine is touched. A fraction and
  // nothing else, at most once a second and only when it has grown, and never once the
  // engine has drawn. The parent treats it as the game's claim: it can delay its own notice,
  // never past a ceiling the parent keeps (use-frame-arrival.ts).
  //
  // Unreal's page adds a stage, which is the part of it a player can use: 'download', 'engine'
  // or 'level', read off body[data-cover]. A fraction rides along only where Epic's page has a
  // real count, its data cache's bytes (window.ueBootDownload) or the engine's level count
  // ('ue-progress'). og-games refuses the data cache's service worker, so on og-games the
  // download has no count and the stage goes alone; an eased bar is not a count, and is not
  // passed on. With a stage the report also goes every few seconds (limits.json) while it
  // stands, because nothing in Epic's page counts the wasm's bytes or the level's load, each
  // of which can outlast the parent's twenty quiet seconds (41 s for the level in that
  // preview). That says Epic's loader is still running and has not failed, which is what the
  // parent's notice is about; the parent's ceiling still bounds it.
  let progressShown = -1;
  let progressStage = null;
  let progressAt = 0;
  let progressTimer = 0;
  // What the page's loader says now, as [fraction or null, stage or null]. Kept so the probe
  // that names a late parent can send what was dropped before it did.
  let progressRead = null;
  const reportProgress = () => {
    if (painted || !documentParent || !progressRead) return;
    let fraction, stage;
    try { [fraction, stage] = progressRead(); } catch { return; }
    if (fraction === null && stage === null) return;
    const moved = stage !== progressStage;
    const grew = fraction !== null && fraction > (moved ? -1 : progressShown);
    const beat = stage !== null && Date.now() - progressAt >= __OG_PROGRESS_HEARTBEAT__;
    if (!grew && !moved && !beat) return;
    const wait = __OG_PROGRESS_INTERVAL__ - (Date.now() - progressAt);
    if (wait > 0) { if (!progressTimer) progressTimer = setTimeout(() => { progressTimer = 0; reportProgress(); }, wait); return; }
    progressShown = fraction === null ? -1 : Math.max(moved ? -1 : progressShown, fraction);
    progressStage = stage;
    progressAt = Date.now();
    const message = { og: 1, type: 'progress' };
    if (fraction !== null) message.fraction = progressShown;
    if (stage !== null) message.stage = stage;
    host.postMessage(message, documentParent);
  };
  // One watcher for an engine's own loader, Godot's overlay or Unreal's cover. Each change to
  // what is watched asks whether the loader is still up; while it is, still() runs (Unreal
  // reports its stage), and once it is not, the paint is counted two animation frames later,
  // as described above. over() says the loader is gone for good, which stops the watching.
  function watchLoader(targets, { over, still }) {
    let counted = false;
    const count = () => { if (!counted) { counted = true; contentful = true; reportPaint(); } };
    const watchers = [];
    const stop = () => watchers.forEach((watcher) => watcher.disconnect());
    const changed = () => {
      if (shellUp()) { if (still) still(); return; }
      if (over()) stop();
      try { requestAnimationFrame(() => requestAnimationFrame(count)); } catch { /* No frames: the timer counts it. */ }
      setTimeout(count, 500);
    };
    for (const [target, options] of targets) { const watcher = new MutationObserver(changed); watcher.observe(target, options); watchers.push(watcher); }
    return { watchers, changed };
  }
  function watchShell(status) {
    shell = status;
    notice = status.querySelector(':scope > #status-notice');
    const looks = ['style', 'class', 'hidden'];
    const targets = [[status.parentNode, { childList: true }], [status, { attributes: true, attributeFilter: looks }]];
    if (notice) targets.push([notice, { attributes: true, attributeFilter: looks, childList: true, characterData: true, subtree: true }]);
    const { watchers } = watchLoader(targets, { over: shellDown });
    const bar = status.querySelector(':scope > #status-progress');
    if (bar && paintTimed) {
      progressRead = () => {
        const value = Number(bar.getAttribute('value'));
        const max = Number(bar.getAttribute('max'));
        return [value > 0 && max > 0 ? Math.min(1, value / max) : null, null];
      };
      // Godot sets value and max for every chunk it reads, hundreds of times a second on a
      // fast link, so this does no more than read two attributes before the throttle; the
      // overlay's own watcher above disconnects it once the shell is down.
      const progress = new MutationObserver(() => { if (painted) progress.disconnect(); else reportProgress(); });
      progress.observe(bar, { attributes: true, attributeFilter: ['value', 'max'] });
      watchers.push(progress);
      reportProgress();
    }
  }
  // Unreal's cover, from the moment the parse has it. The lift is counted two animation frames
  // after the class lands, as Godot's removal is: the canvas becomes visible in that style
  // change and is presented on the next frame. Only body's data-cover and the cover's own class
  // and hidden are watched; the bar, the line and the checklist under them change four times a
  // second and are read on the report's own timer instead, while the cover is up. Epic's
  // states only move forward (wasm-play.js coverTo), so down is down for good.
  function watchUnreal(cover) {
    ueCover = cover;
    const { changed } = watchLoader([[document.body, { attributes: true, attributeFilter: ['data-cover'] }], [cover, { attributes: true, attributeFilter: ['class', 'hidden'] }]],
      { over: () => true, still: reportProgress });
    ueChanged = changed;
    if (paintTimed) {
      progressRead = () => {
        if (ueDown()) return [null, null];
        // No data-cover until the engine starts: wasm-play.js sets it only on a change, and the
        // page begins in loading, which is the download. Lifted is still the level here, since
        // this is only asked while the engine has not drawn.
        const state = document.body.dataset.cover || 'loading';
        if (state === 'engine') return [null, 'engine'];
        if (state === 'level' || state === 'ready' || state === 'lifted') return [ueLevel, 'level'];
        if (state !== 'loading') return [null, null];
        const boot = window.ueBootDownload;
        const bytes = boot && Number(boot.bytes), total = boot && Number(boot.total);
        return [bytes > 0 && total > 0 ? Math.min(1, bytes / total) : null, 'download'];
      };
      const ticker = setInterval(() => { if (painted || ueDown()) clearInterval(ticker); else reportProgress(); }, __OG_PROGRESS_INTERVAL__);
    }
    changed();
  }
  // WHAT THE BROWSER NEVER TIMES IS READ. First contentful paint is the browser's answer, and
  // for two kinds of canvas it never gives one. Both were measured in Chromium on 26 Nov 2026,
  // on pages that are a canvas and nothing else.
  //
  // A canvas handed off with transferControlToOffscreen. Drawn here with 2D, WebGL, WebGL2 or
  // WebGPU a canvas is timed; the same four drawn from a worker never are. A Kaigen game on
  // production, WebGPU from a worker and no other element in its body, was playable 3.7 s
  // after Play and stayed under the parent's cover until the stage said, at thirty seconds,
  // that it had not started (the owner's screenshots, 26 Nov 2026).
  //
  // And a WebGL canvas on this thread whose context was made before the document's first
  // paint and first drawn after it, which is an engine that makes its renderer in an inline
  // script and draws once its assets are in. Made after the first paint, the same context is
  // timed on its first draw, three seconds later or not; made before it and drawn from the
  // first frame, it is timed too.
  //
  // In both, what the canvas shows can still be copied: drawing it into a 2D canvas takes the
  // last frame a worker presented, or, inside an animation frame, the one this thread has just
  // drawn. So until the document has counted a paint some other way, canvases are copied into
  // a 64 by 36 probe, and the first that holds a picture, in a box somebody could see, is the
  // paint. Not a WebGPU canvas on this thread, which copies out empty even inside its own
  // frame; Unreal's page is one, and says for itself when it has drawn (above).
  //
  // A PICTURE, NOT A FRAME: more than one flat colour. The first cut counted any pixel that
  // was not transparent, and a WebGL context made with alpha: false, which is three.js's
  // default, copies out as opaque black before it has drawn anything: 'painted' went out
  // 272 ms after such a context was made, four seconds ahead of its first draw (review,
  // 26 Nov 2026). A cleared buffer and an engine's one-colour first frames now wait as an
  // empty canvas does, so the parent's cover never lifts onto a blank one. The browser is
  // easier on a canvas it does time, and counts a bare clear; this is the second opinion and
  // can afford to be stricter. The copy is scaled with the browser's best smoothing, which
  // averages every pixel of the canvas into the probe: a plain scaled copy samples a few
  // points, and at 1920 by 1080 a game of Pong, white paddles and a ball on black, fell
  // between them and read as one colour (review of the second cut, same day).
  //
  // AND ONLY WHAT SHOWS NOW. A canvas is asked whether it shows before it is copied, every
  // time, and nothing is remembered about it. The second cut remembered a canvas it had seen
  // a picture in, to save the copy, and one that drew a frame while hidden and was then shown
  // cleared to black counted on that memory (the same review). A hidden canvas now costs a
  // style read and no copy.
  //
  // WHICH CANVASES, AND WHEN. One handed off is noted by a replaced transferControlToOffscreen,
  // passing for the native as every replacement here does, and read four times a second from
  // then on (once a second a minute into the document): a worker's frame stays put between
  // readings, and nothing is copied until one has been presented. Every other canvas is looked
  // at once a second, inside an animation frame asked for after the game's own so its drawing
  // is still there, and only once the browser has timed this document's first paint. A frame
  // warming under the parent's poster never gets one, nor a single animation frame (none in
  // 2.5 s, measured), so the page's rule that a warm game on this thread reports no paint
  // before Play (player.tsx) stands, and the look stays in the engine the gap was measured
  // in, since the others time no first paint. A worker's game can report from under the
  // poster, as a game's own ready does. All of it ends with the first paint however it was
  // counted, slows again five minutes into the document, since a copy is a whole frame read
  // back, and skips a tab nobody is looking at. createElement, getContext,
  // requestAnimationFrame and IntersectionObserver are taken now, before any game script,
  // because engines replace them.
  //
  // WHETHER A CANVAS SHOWS IS THE BROWSER'S ANSWER TOO. A box of some size inside the viewport
  // is not enough: a worker's scratch canvas inside a parent of no height with overflow:
  // hidden has one and is clipped away entirely, and its picture would have lifted the cover
  // over a stage still blank (Greptile on #2431). Which ancestors clip which descendants
  // turns on positioning, transforms and containment, so it is not worked out here: an
  // IntersectionObserver reports how much of each canvas is left in view once every ancestor
  // has clipped it, and a canvas counts only after that report says some of it is. Where
  // there is no observer a canvas is taken on its box, as it was.
  const probeCanvas = document.createElement.bind(document, 'canvas');
  const canvasProto = typeof HTMLCanvasElement === 'function' ? HTMLCanvasElement.prototype : null;
  const probeContext = canvasProto ? canvasProto.getContext : null;
  const nativeHandOff = canvasProto ? canvasProto.transferControlToOffscreen : null;
  const probeFrame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame.bind(globalThis) : null;
  const ViewObserver = typeof IntersectionObserver === 'function' ? IntersectionObserver : null;
  // The canvases handed off and not yet counted, eight at most.
  let handedOff = [];
  let reading = false;
  let looking = false;
  let lookFrom = 0;
  let paintProbe = null;
  const holdsPicture = (canvas) => {
    if (!canvas.width || !canvas.height) return false;
    if (!paintProbe) {
      const made = probeCanvas();
      made.width = 64; made.height = 36;
      paintProbe = probeContext.call(made, '2d', { willReadFrequently: true });
      paintProbe.imageSmoothingEnabled = true;
      paintProbe.imageSmoothingQuality = 'high';
    }
    paintProbe.clearRect(0, 0, 64, 36);
    paintProbe.drawImage(canvas, 0, 0, 64, 36);
    let pixels;
    try { pixels = paintProbe.getImageData(0, 0, 64, 36).data; } catch (error) {
      // The copy tainted the probe, so the game drew another site's image into this canvas
      // without CORS. Only drawing one taints a canvas, so it holds a picture; the probe is
      // spent, and the next reading makes another.
      paintProbe = null;
      return Boolean(error && error.name === 'SecurityError');
    }
    // More than one colour: some channel, alpha among them, runs wider across the probe than
    // a scaled copy of one flat colour rounds to.
    for (let channel = 0; channel < 4; channel++) {
      let low = 255, high = 0;
      for (let at = channel; at < pixels.length; at += 4) {
        if (pixels[at] < low) low = pixels[at];
        if (pixels[at] > high) high = pixels[at];
      }
      if (high - low > 2) return true;
    }
    return false;
  };
  // How much of each watched canvas is in view, as the browser last reported it: true once a
  // pixel or more each way is left after every ancestor's clipping. Sixty-four canvases at
  // most; one past that is never counted.
  const inView = new WeakMap();
  let viewWatcher = null;
  let viewWatched = 0;
  const endViewWatch = () => { if (viewWatcher) { try { viewWatcher.disconnect(); } catch { /* Already gone. */ } viewWatcher = null; } };
  const watchView = (canvas) => {
    if (inView.has(canvas) || viewWatched >= 64) return;
    if (!viewWatcher) {
      viewWatcher = new ViewObserver((entries) => {
        for (const entry of entries) inView.set(entry.target, entry.isIntersecting && entry.intersectionRect.width >= 1 && entry.intersectionRect.height >= 1);
      }, { threshold: [0, 0.001, 0.01, 0.1, 0.5, 1] });
    }
    inView.set(canvas, false);
    viewWatched++;
    viewWatcher.observe(canvas);
  };
  // Somewhere the player could see it: some of it in view, by the browser's report or, with
  // no observer, by its box, and not hidden by its own style or anything around it. A worker's
  // scratch canvas parked off screen or clipped away is not what the player is looking at.
  const canvasShows = (canvas) => {
    if (ViewObserver) {
      watchView(canvas);
      if (inView.get(canvas) !== true) return false;
    } else {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1 || rect.right <= 0 || rect.bottom <= 0 || rect.left >= innerWidth || rect.top >= innerHeight) return false;
    }
    // Both spellings of the two options: Chromium 105 to 120 knew only the older pair, and an
    // option a browser does not know is ignored, which would leave the canvas unchecked.
    if (typeof canvas.checkVisibility === 'function') return canvas.checkVisibility({ opacityProperty: true, visibilityProperty: true, checkOpacity: true, checkVisibilityCSS: true });
    const style = getComputedStyle(canvas);
    return style.visibility !== 'hidden' && Number(style.opacity) !== 0;
  };
  const showsPicture = (canvas) => {
    try { return canvasShows(canvas) && holdsPicture(canvas); } catch { return false; /* Not readable: left to the browser's own timing. */ }
  };
  // How long until the next reading, given the quickest it may come.
  const readAgain = (soonest) => { const age = performance.now(); return age < 60000 ? soonest : age < 300000 ? 1000 : 5000; };
  const readHandedOff = () => {
    if (contentful) { handedOff = []; reading = false; endViewWatch(); return; }
    if (document.visibilityState !== 'hidden' && handedOff.some(showsPicture)) {
      contentful = true; handedOff = []; reading = false; endViewWatch();
      reportPaint();
      return;
    }
    setTimeout(readHandedOff, readAgain(250));
  };
  const lookAtCanvases = () => {
    if (contentful) { looking = false; endViewWatch(); return; }
    const again = () => setTimeout(lookAtCanvases, readAgain(1000));
    if (document.visibilityState === 'hidden') { again(); return; }
    probeFrame(() => {
      if (contentful) { looking = false; endViewWatch(); return; }
      // Eight a look, taking up where the last one stopped: a page that makes hundreds of
      // small canvases is not copied hundreds of times, and its stage, wherever it comes in
      // the document, is still reached.
      const canvases = document.getElementsByTagName('canvas');
      const count = canvases.length;
      for (let read = 0; read < count && read < 8; read++) {
        const canvas = canvases[(lookFrom + read) % count];
        if (handedOff.includes(canvas) || !showsPicture(canvas)) continue;
        contentful = true; looking = false; endViewWatch();
        reportPaint();
        return;
      }
      lookFrom = count > 8 ? (lookFrom + 8) % count : 0;
      again();
    });
  };
  const startLooking = () => {
    if (looking || contentful || !probeContext || !probeFrame || typeof setTimeout !== 'function') return;
    looking = true;
    setTimeout(lookAtCanvases, 1000);
  };
  try {
    if (typeof PerformanceObserver === 'function' && (PerformanceObserver.supportedEntryTypes || []).includes('paint')) {
      new PerformanceObserver((list, observer) => {
        const timed = list.getEntries().map((entry) => entry.name);
        if (!timed.includes('first-contentful-paint')) { if (timed.includes('first-paint')) startLooking(); return; }
        observer.disconnect();
        contentful = true;
        reportPaint();
      }).observe({ type: 'paint', buffered: true });
      paintTimed = true;
    }
  } catch { /* No paint timing: the report below says nothing about painting. */ }
  // Only where paints are timed, as everything about 'painted' is: elsewhere the parent lifts
  // its cover on parsing and waits for no report.
  if (paintTimed && probeContext && typeof nativeHandOff === 'function') {
    canvasProto.transferControlToOffscreen = function() {
      // The browser's own answer first, thrown or returned, so a refused hand-off is the
      // game's to hear exactly as it was and notes nothing.
      const offscreen = nativeHandOff.apply(this, arguments);
      if (!contentful && handedOff.length < 8) {
        handedOff.push(this);
        // Watched from now, so the browser's report on it is in by the first reading.
        try { if (ViewObserver) watchView(this); } catch { /* Not watchable: it is never counted. */ }
        if (!reading) { reading = true; setTimeout(readHandedOff, 250); }
      }
      return offscreen;
    };
  }
  // Only where paints are timed: a parent that cannot be told when the engine started lifts
  // its cover on parsing, and there Godot's own loader is better than a black frame.
  //
  // AND ONLY UNDER A PARENT WHOSE COVER STANDS IN FOR IT. Opened on its own, as
  // 'opengame dev --contract 2027-02' prints it, or framed by a page that is not one of ours,
  // nothing covers the frame, and hiding Godot's loader left a blank canvas for the whole
  // download (Greptile on #1718, 17 Nov 2026). So the loader is hidden once an allowed parent
  // is known: from the first byte where the browser lists ancestors (Chromium, WebKit and
  // Firefox since 2025), and otherwise when the page's probe names it, until which the
  // loader is under the page's cover anyway. The paint report waits for the engine either
  // way; this decides only what shows.
  let shellHidden = false;
  const hideShell = () => {
    if (shellHidden || !paintTimed || !documentParent) return;
    shellHidden = true;
    try {
      const sheet = new CSSStyleSheet();
      // Unreal's cover is hidden, not removed, because wasm-play.js keeps working on it, and
      // only while it is a loader: not once the game has ended, when the same cover carries
      // the end card, and not while it waits for the click a ue-start=click page asks for.
      // That wait is the game's own start screen, "Ready: click to play", and the click is
      // what gives the game its sound and pointer lock, so it shows, and the parent's cover
      // lifts onto it; a clear cover left the player a still frame and no reason to click
      // (code review, 17 Nov 2026). The error card shows through, as Godot's notice does.
      const ueHidden = UE_PAGE + ':not([data-cover="ended"]) > ' + UE_COVER + ':not(.click)';
      sheet.replaceSync(SHELL + '{visibility:hidden!important}' + SHELL + ' > #status-notice{visibility:visible!important}'
        + ueHidden + '{visibility:hidden!important}' + ueHidden + ' #error{visibility:visible!important}'
        // The checklist at top left, the browser, the graphics card and the settings Epic
        // picked, is the part the owner pointed at; it stays hidden on the start screen too.
        + UE_PAGE + ':not([data-cover="ended"]) > ' + UE_COVER + ' > #steps{visibility:hidden!important}'
        // And Epic's toast, a note wasm-play.js lays over the top left of the running game for
        // ten seconds after the lift: "TPPWeb590 plays best in Chrome: try it there." in a
        // browser wasm-compat.js does not take for Chrome (headless Chrome on production, 17 Nov
        // 2026), or word of a GPU restart, which goes too: only our interface goes around a
        // game on OpenGame (the owner, 17 Nov 2026), and the game plays on. Matched by its
        // markup, a child of the page's body holding the note's text and its dismiss button,
        // not by what it says, since the project's name and the note vary. Display, not
        // visibility: a visible child would show through.
        + UE_PAGE + ' > ' + UE_TOAST + '{display:none!important}'
        // wasm-loader.js writes the same advice on the cover as well, in #notice with the class
        // 'advice', and a ue-start=click page shows that cover as its start screen.
        + UE_PAGE + ' > ' + UE_COVER + ' #notice.advice{display:none!important}');
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    } catch { /* No constructable stylesheets: the cover's wait is the whole of it. */ }
  };
  hideShell();
  const reportDocument = () => {
    if (documentParent && documentParsed) {
      host.postMessage(paintTimed ? { og: 1, type: 'document-loaded', painted } : { og: 1, type: 'document-loaded' }, documentParent);
    }
  };
  document.addEventListener('DOMContentLoaded', () => { documentParsed = true; if (paintTimed) { findShell(); reportPaint(); } reportDocument(); }, { once: true });
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
  // A recording ends with the document; the recorder (RECORD AND INSTANT REPLAY) says so.
  addEventListener('pagehide', () => recordingLeft());
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
  // The same for the paint reading's transferControlToOffscreen, where it was replaced.
  if (canvasProto && typeof nativeHandOff === 'function' && canvasProto.transferControlToOffscreen !== nativeHandOff) passFor(canvasProto.transferControlToOffscreen, nativeHandOff);
  const nativeConnect = AudioNode.prototype.connect;
  const nativeDisconnect = AudioNode.prototype.disconnect;
  // Kept for the recorder's frame ordering (RECORD AND INSTANT REPLAY, below), which
  // replaces requestAnimationFrame here, ahead of every game script, passing for the native.
  const nativeRequestFrame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
  const nativeCancelFrame = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : null;
  // Which frame's callbacks are running, by its timestamp, which every callback of one frame
  // shares; null between frames. Cleared by a timer, which cannot run until the frame's
  // callbacks have all run. Only kept while a recording session runs (captureTick).
  const nativeSetTimeout = typeof setTimeout === 'function' ? setTimeout : null;
  let inFrame = null;
  let clearing = false;
  // How many frames this document has run callbacks in, so a wait can tell whether the thread
  // was free during it (a decode that holds the thread holds every frame back with it).
  let framesRun = 0;
  const markFrame = (time) => {
    if (time !== inFrame) framesRun++;
    inFrame = time;
    if (clearing || !nativeSetTimeout) return;
    clearing = true;
    nativeSetTimeout(() => { inFrame = null; clearing = false; }, 0);
  };
  let captureTick = null;
  const queueCapture = (run) => {
    if (captureTick) nativeCancelFrame.call(globalThis, captureTick.id);
    const tick = { run: run, id: 0, queuedDuring: inFrame };
    tick.id = nativeRequestFrame.call(globalThis, (time) => { markFrame(time); if (captureTick === tick) captureTick = null; run(time); });
    captureTick = tick;
  };
  if (nativeRequestFrame && nativeCancelFrame) {
    globalThis.requestAnimationFrame = passFor(function requestAnimationFrame(callback) {
      if (!captureTick || typeof callback !== 'function') return nativeRequestFrame.call(globalThis, callback);
      const id = nativeRequestFrame.call(globalThis, (time) => { markFrame(time); return callback(time); });
      // The game's callback is due next frame. So is the capture if it was queued between
      // frames or during this one; then it moves behind the game's. A capture queued before
      // this frame began is due in this frame, after the game's callback, and stays.
      if (inFrame === null || captureTick.queuedDuring === inFrame) queueCapture(captureTick.run);
      return id;
    }, nativeRequestFrame);
  }
  // THE RECORDER'S EAR, BEFORE THE PLAYER'S VOLUME. Everything the game sends to the
  // speakers is also sent to one gain per context that reaches nothing: a recording taps it
  // (RECORD AND INSTANT REPLAY, below), so a clip sounds like the game whatever the slider
  // or the mute says, and no change of either is undone after the fact. Until a recording
  // attaches a tap, nothing pulls on it, so a browser does no work for it.
  const tapInputs = new Map();
  const tapInputFor = (context) => {
    let input = tapInputs.get(context);
    if (!input) {
      input = context.createGain();
      tapInputs.set(context, input);
      context.addEventListener('statechange', () => { if (context.state === 'closed') tapInputs.delete(context); });
    }
    return input;
  };
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
    // The same output to the recorder's ear. A failure here is the recorder's alone and
    // never the game's connect, which has already happened.
    if (realtime) { try { nativeConnect.call(this, tapInputFor(destination.context), ...args); } catch { /* Not recorded. */ } }
    return result === actual ? destination : result;
  }, nativeConnect);
  AudioNode.prototype.disconnect = passFor(function(...args) {
    if (outputs.has(args[0])) {
      const input = tapInputs.get(args[0].context);
      if (input) { try { nativeDisconnect.call(this, input, ...args.slice(1)); } catch { /* Was never fanned out. */ } }
      args[0] = outputs.get(args[0]);
    }
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
  // A recording's copy of an element is taken before the element's own volume and mute
  // (SOUND FROM <audio> AND <video>, below), so the game's level for it is set again on the
  // recording's side. Told here the moment the game or the person changes it, so a fade or a
  // mute lands in the clip when the player heard it, not up to a second later at the
  // recorder's next look (Greptile on opengamehq/opengame#29, #2289).
  let heardLevel = null;
  const levelChanged = (element) => {
    if (heardLevel) { try { heardLevel(element); } catch { /* The recording's loss, never the game's. */ } }
  };
  Object.defineProperty(HTMLMediaElement.prototype, 'muted', {
    ...descriptor,
    set: passFor(function(value) { track(this); desired.set(this, !!value); descriptor.set.call(this, silent() || !!value); levelChanged(this); }, descriptor?.set)
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
        levelChanged(this);
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
      levelChanged(element);
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
  // A recording hears a media element from its first play (SOUND FROM <audio> AND <video>,
  // below), so a gunshot shorter than the recorder's once-a-second look is not missed.
  let heardPlay = null;
  HTMLMediaElement.prototype.play = passFor(function(...args) {
    track(this);
    if (heardPlay) { try { heardPlay(this); } catch { /* The recording's loss, never the game's. */ } }
    return nativePlay.apply(this, args);
  }, nativePlay);
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
  // A step of a recording's redraw that took longer than domStepMaxMs (refreshDom).
  const SLOW = 'slow';
  const spend = (budget, size) => {
    budget.bytes += size;
    if (budget.bytes > shot.domBytesMax) throw new Error(CROWDED);
  };
  // A file is refused from its declared length, and cut off while it is read, past
  // domSourceBytesMax. Until 5 Oct 2026 it was read whole and measured afterwards, so one large
  // image cost its full download before being dropped. A file carried whole must also fit what
  // is left of the drawing's budget as base64 (room, checked where it is used); a file read to
  // be resampled need not, since only the small copy goes into the drawing (27 Nov 2026: held to
  // room, a large picture shown small was left out, where it can be drawn).
  const room = (job) => Math.floor((shot.domBytesMax - job.bytes) * 3 / 4);
  // The file, or TOO_LARGE once it passes most, or null for no body.
  const TOO_LARGE = 'too large';
  const readCapped = async (response, most) => {
    if (!response.body) return null;
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > most) { try { await response.body.cancel(); } catch { /* Gone already. */ } return TOO_LARGE; }
    const reader = response.body.getReader();
    const parts = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > most) { try { await reader.cancel(); } catch { /* Gone already. */ } return TOO_LARGE; }
      parts.push(value);
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
  //
  // A recording keeps these between its redraws, so a page's files are fetched and its pictures
  // made once a session rather than once a redraw: a cache keeps its newest entries, up to a
  // count and a size in bytes, and forgets an answer that came back empty (a file cut off
  // mid-read, or refused for want of room in one redraw) so the next may try again. Until 27 Nov
  // 2026 the recording's cache was emptied whenever it passed 24 files, so a page of 30 icons
  // fetched every one of them each redraw.
  const cacheOf = (most, bytes) => { const cache = new Map(); cache.most = most; cache.bytesMax = bytes; cache.sizes = new Map(); cache.bytes = 0; return cache; };
  const forget = (cache, key) => {
    cache.delete(key);
    const size = cache.sizes.get(key);
    if (size) { cache.bytes -= size; cache.sizes.delete(key); }
  };
  const recall = (cache, key) => {
    const found = cache.get(key);
    if (found) { cache.delete(key); cache.set(key, found); }
    return found;
  };
  const sizeOf = (value) => !value ? 0 : typeof value === 'string' ? value.length : typeof value.size === 'number' ? value.size : 64;
  const remember = (cache, key, made) => {
    forget(cache, key);
    cache.set(key, made);
    // By count, the oldest answer already in; an ask still on its way is never dropped, or
    // the same file could be fetched twice in one drawing.
    while (cache.size > cache.most) {
      let oldest = null;
      for (const [held] of cache) if (cache.sizes.has(held)) { oldest = held; break; }
      if (oldest === null) break;
      forget(cache, oldest);
    }
    made.then((value) => {
      if (cache.get(key) !== made) return;
      if (!value) { forget(cache, key); return; }
      const size = sizeOf(value);
      cache.sizes.set(key, size);
      cache.bytes += size;
      // By size too, the oldest answer already in, never this one or an ask still on its way.
      while (cache.bytes > cache.bytesMax) {
        let oldest = null;
        for (const [held] of cache) if (held !== key && cache.sizes.has(held)) { oldest = held; break; }
        if (oldest === null) break;
        forget(cache, oldest);
      }
    }, () => { if (cache.get(key) === made) forget(cache, key); });
    return made;
  };
  // The caches a capture or a recording's redraws read: files fetched, files as data: addresses,
  // pictures resampled, the size of each picture file, and the files that could not be had.
  const pageCaches = () => ({ files: cacheOf(400, 32e6), cache: cacheOf(400, 16e6), pictures: cacheOf(400, 16e6), sizes: cacheOf(800, 1e6), refused: new Set() });
  // A file that could not be had (past domSourceBytesMax, not there, a redirect, a revoked
  // blob:) is not asked for again: in that drawing, by the path that falls back to carrying it
  // whole, and for the rest of the page's caches' life, so a recording does not download a file
  // it will refuse on every redraw.
  //
  // A file to be carried whole is read only within what is left of the drawing's room (most),
  // so one too large for it is refused from its declared length, never downloaded and encoded
  // to be dropped (Greptile on #2451). That refusal holds for the drawing alone, since the next
  // may have more room, and a file read that way is kept for every use, being the whole file.
  const fetchFile = (href, job, most = shot.domSourceBytesMax) => {
    if (job.refused.has(href)) return Promise.resolve(null);
    const held = recall(job.files, href);
    if (held) return held;
    const within = most < shot.domSourceBytesMax;
    const tight = job.tight || (job.tight = new Set());
    if (within && tight.has(href)) return Promise.resolve(null);
    const read = queued(job, async () => {
      if (job.stop.signal.aborted) return null;
      let found = null;
      try {
        const response = await fetch(href, { credentials: 'omit', redirect: 'error', signal: job.stop.signal });
        found = response.ok ? await readCapped(response, Math.max(0, most)) : null;
      } catch { found = null; }
      if (found instanceof Blob) return found;
      if (!job.stop.signal.aborted) {
        if (found === TOO_LARGE && within) tight.add(href);
        else {
          if (job.refused.size > 512) job.refused.clear();
          job.refused.add(href);
        }
      }
      return null;
    });
    return within ? read.then((blob) => { if (blob && !job.files.has(href)) remember(job.files, href, Promise.resolve(blob)); return blob; })
      : remember(job.files, href, read);
  };
  const used = (job) => (data) => { if (data) spend(job, data.length); return data; };
  const inline = (value, job) => {
    const href = sameSite(value);
    if (!href) return Promise.resolve(null);
    const data = href.startsWith('data:') ? Promise.resolve(href)
      : recall(job.cache, href) || remember(job.cache, href, fetchFile(href, job, room(job))
        .then((blob) => blob && blob.size <= room(job) ? asDataUrl(blob) : null));
    return data.then((found) => found && found.length <= room(job) * 4 / 3 ? used(job)(found) : null);
  };
  // PICTURES AT THE SIZE THEY ARE DRAWN (27 Nov 2026). An image went into the markup as its
  // whole file, and the browser decodes every picture inside a drawn page on the game's own
  // thread, in one go, as the page is drawn: twelve 256 px pictures shown at 48 px made a page
  // of 8 MB, and decoding it was 80 ms of a 126 ms stall, every redraw (measured headless on a
  // 1,080-element HUD, after a creator found a 100 ms hitch every 2 s while Replay ran). So a
  // picture drawn smaller than its file is resampled once to the pixels it covers in the
  // recording (its box on screen, transforms included, at the picture's scale, in steps of a
  // quarter octave so a box that grows a little reuses it) and carried as a WebP.
  //
  // Always from the file, fetched as every inlined file is (this origin only, no redirects),
  // and never from the <img> element: createImageBitmap decodes an element on this thread
  // before it returns, 177 ms for a 4096 px picture (review, 27 Nov 2026), where from a Blob
  // the decode and the scaling happen elsewhere, as convertToBlob's encoding does. A picture
  // drawn at its file's size or larger, or drawn pixelated, goes in as its file, as before.
  const STEP = Math.pow(2, 0.25);
  const stepUp = (factor) => factor >= 1 ? 1 : Math.max(1 / 64, Math.pow(STEP, Math.ceil(Math.log(Math.max(factor, 1e-6)) / Math.log(STEP))));
  const canResample = () => typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function';
  const resampled = async (blob, width, height) => {
    const bitmap = await createImageBitmap(blob, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' });
    try {
      const canvas = new OffscreenCanvas(width, height);
      canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
      return await asDataUrl(await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 }));
    } finally { bitmap.close(); }
  };
  // A file resampled to width x height, made once and kept; null where it cannot be.
  const pictureOf = (href, width, height, job) => {
    const key = href + ' ' + width + 'x' + height;
    return recall(job.pictures, key) || remember(job.pictures, key, fetchFile(href, job)
      .then((blob) => blob ? queued(job, () => resampled(blob, width, height)) : null).catch(() => null));
  };
  const crisp = (style) => /pixelated|crisp-edges/.test(style.imageRendering);
  // How much bigger the box is drawn than laid out, from the transforms on it and above it.
  const magnification = (node, rect) => {
    const laidOut = Math.max(node.offsetWidth || 0, node.offsetHeight || 0);
    return laidOut > 0 ? Math.min(8, Math.max(rect.width, rect.height) / laidOut) : 1;
  };
  const imagePicture = (node, source, style, job) => {
    const href = sameSite(source);
    const width = node.naturalWidth;
    const height = node.naturalHeight;
    // object-fit none and scale-down draw the file at its own size, which a resampled copy
    // would change.
    if (!href || href.startsWith('data:') || !canResample() || !(job.scale > 0) || !width || !height || crisp(style)
      || /^(none|scale-down)$/.test(style.objectFit)) return inline(source, job);
    const rect = node.getBoundingClientRect();
    const factor = stepUp(job.scale * Math.max(rect.width / width, rect.height / height));
    if (factor >= 1) return inline(source, job);
    return pictureOf(href, Math.max(1, Math.round(width * factor)), Math.max(1, Math.round(height * factor)), job)
      .then((data) => data ? used(job)(data) : inline(source, job));
  };
  // A list of comma-separated values, with the commas inside brackets or quotes left alone.
  const splitList = (value) => {
    const items = [];
    let depth = 0;
    let quote = '';
    let from = 0;
    for (let i = 0; i < value.length; i++) {
      const c = value[i];
      if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
      if (c === '"' || c === "'") quote = c;
      else if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ',' && depth === 0) { items.push(value.slice(from, i).trim()); from = i + 1; }
    }
    items.push(value.slice(from).trim());
    return items;
  };
  // A background is resampled the same way, for which the size it is drawn at is worked out
  // from background-size and the box. Where that size depends on the file's own size (auto in
  // both directions), the copy is given the file's size in pixels outright, since the resampled
  // file's own size is another; everywhere else the size is left as the page wrote it. Only a
  // background that scrolls with its element: a fixed one is sized against the viewport, a
  // local one against its scrolled contents. What is read from the element is read here, in the
  // walk, with the rest of its style.
  const URL_ALONE = /^url\(\s*(['"]?)(.*)\1\s*\)$/;
  const backgroundPlan = (node, style) => {
    if (!(node instanceof HTMLElement) || !style.backgroundImage.includes('url(') || !canResample() || crisp(style)
      || splitList(style.backgroundAttachment).some((attachment) => attachment !== 'scroll')) return null;
    const rect = node.getBoundingClientRect();
    const pad = (side) => Number.parseFloat(style['padding' + side]) || 0;
    const boxes = {
      'border-box': [node.offsetWidth, node.offsetHeight],
      'padding-box': [node.clientWidth, node.clientHeight],
      'content-box': [node.clientWidth - pad('Left') - pad('Right'), node.clientHeight - pad('Top') - pad('Bottom')],
    };
    return { images: splitList(style.backgroundImage), sizes: splitList(style.backgroundSize), origins: splitList(style.backgroundOrigin),
      boxes: boxes, magnified: magnification(node, rect) };
  };
  const naturalSize = (href, job) => recall(job.sizes, href) || remember(job.sizes, href, fetchFile(href, job).then(async (blob) => {
    if (!blob) return null;
    const bitmap = await createImageBitmap(blob);
    const size = [bitmap.width, bitmap.height];
    bitmap.close();
    return size;
  }).catch(() => null));
  // The size one background is drawn at, in CSS pixels, or null where it cannot be worked out.
  const drawnSize = (token, box, natural) => {
    const [width, height] = natural;
    if (token === 'cover' || token === 'contain') {
      const fit = (token === 'cover' ? Math.max : Math.min)(box[0] / width, box[1] / height);
      return [width * fit, height * fit];
    }
    const [x, y = 'auto'] = token.split(/\s+/);
    const length = (value, whole) => value === 'auto' ? null : /^-?[\d.]+px$/.test(value) ? Number.parseFloat(value)
      : /^-?[\d.]+%$/.test(value) ? Number.parseFloat(value) / 100 * whole : NaN;
    let across = length(x, box[0]);
    let down = length(y, box[1]);
    if (Number.isNaN(across) || Number.isNaN(down)) return null;
    if (across === null && down === null) { across = width; down = height; }
    else if (across === null) across = down * width / height;
    else if (down === null) down = across * height / width;
    return across > 0 && down > 0 ? [across, down] : null;
  };
  const backgroundLayer = async (plan, at, job) => {
    const token = plan.images[at];
    const sizeToken = plan.sizes[at % plan.sizes.length] || 'auto';
    const whole = async () => [(await inlineCss(token, job)), sizeToken];
    const found = URL_ALONE.exec(token);
    if (!found) return whole();
    let href = null;
    try { href = sameSite(new URL(found[2], document.baseURI).href); } catch { /* Not an address. */ }
    if (!href || href.startsWith('data:')) return whole();
    const natural = await naturalSize(href, job);
    const box = plan.boxes[plan.origins[at % plan.origins.length]] || plan.boxes['padding-box'];
    const drawn = natural && box[0] > 0 && box[1] > 0 ? drawnSize(sizeToken, box, natural) : null;
    if (!drawn) return whole();
    const factor = stepUp(job.scale * plan.magnified * Math.max(drawn[0] / natural[0], drawn[1] / natural[1]));
    if (factor >= 1) return whole();
    const data = await pictureOf(href, Math.max(1, Math.round(natural[0] * factor)), Math.max(1, Math.round(natural[1] * factor)), job);
    if (!data) return whole();
    used(job)(data);
    return ['url("' + data + '")', /^auto( auto)?$/.test(sizeToken) ? natural[0] + 'px ' + natural[1] + 'px' : sizeToken];
  };
  const BACKGROUND_PROPERTIES = new Set(['background-image', 'background-size']);
  const backgroundText = async (plan, job) => {
    const layers = await Promise.all(plan.images.map((_, at) => backgroundLayer(plan, at, job)));
    return 'background-image:' + layers.map((layer) => layer[0]).join(', ') + ';background-size:' + layers.map((layer) => layer[1]).join(', ') + ';';
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
  const probeHosts = new WeakSet();
  const openProbe = (keepCache) => {
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
    probeHosts.add(host);
    document.documentElement.appendChild(host);
    probe.host = host; probe.root = root;
    if (!keepCache) probe.cache = new Map();
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
  // AND NOTHING THAT CANNOT CHANGE THE PICTURE (27 Nov 2026). A copied element came to about
  // 1 KB, and a page's copy is decoded on the game's thread, so its size is time taken from the
  // game. Half of it could not change what is drawn:
  //   - every logical property (block-size, inset-inline-start, border-block-end-color), which
  //     the computed style lists beside the physical one it is the same value as;
  //   - the colour of a border, outline, column rule or underline that is not drawn;
  //   - transform-origin with no transform, and perspective-origin with no perspective;
  //   - a property that is not inherited, written only because the parent's differs (a HUD's
  //     ticks each carried transform:none under a strip that moved), since the copy then takes
  //     the same value as the element's own default anyway. Only properties whose default does
  //     not hang on the font size or the direction: a paragraph's 1em margin read as 16 px from
  //     the probe is not the same default on a paragraph of 20 px type.
  //   - every custom property (27 Nov 2026, later). The computed value of every real property
  //     has its var() already filled in, so the copy never reads one, and an inherited one is on
  //     every element under where it was set. World at War Zombies sets --menu-art: url(...) on
  //     its root, and each url() was inlined as a data URL: every span and paragraph carried a
  //     495 KB picture, each layer came to 6 to 7 MB, and decoding one held the game's thread
  //     for up to 240 ms, four layers in a row, every 10 to 20 s (measured headless with an NVIDIA card).
  const LOGICAL = /(^|-)(block|inline)(-|$)|^border-(start|end)-(start|end)-radius$/;
  const customOf = (style) => {
    let text = '';
    for (let i = 0; i < style.length; i++) {
      const name = style[i];
      if (!name.startsWith('--')) continue;
      const value = style.getPropertyValue(name);
      if (value.length > 512 || /url\(/i.test(value)) continue;
      text += name + ':' + value + ';';
    }
    return text;
  };
  const needlessNames = new Map();
  const needless = (name) => {
    let found = needlessNames.get(name);
    if (found === undefined) { found = name.startsWith('--') || LOGICAL.test(name); needlessNames.set(name, found); }
    return found;
  };
  const NOT_INHERITED = new Set(['transform', 'translate', 'rotate', 'scale', 'background-image', 'background-color', 'opacity', 'filter',
    'box-shadow', 'z-index', 'position', 'top', 'right', 'bottom', 'left', 'overflow-x', 'overflow-y', 'clip-path', 'mix-blend-mode',
    'isolation', 'transform-style', 'perspective', 'will-change', 'contain', 'display']);
  const SIDES_LOWER = ['top', 'right', 'bottom', 'left'];
  const unusedOf = (style, prefix) => {
    const unused = new Set();
    for (const side of SIDES_LOWER) if (/^(none|hidden)$/.test(style.getPropertyValue('border-' + side + '-style'))) unused.add('border-' + side + '-color');
    if (style.outlineStyle === 'none') unused.add('outline-color');
    if (style.columnRuleStyle === 'none') unused.add('column-rule-color');
    if (style.textDecorationLine === 'none') unused.add('text-decoration-color');
    if (!prefix && style.transform === 'none' && style.rotate === 'none' && style.scale === 'none' && style.translate === 'none') unused.add('transform-origin');
    if (style.perspective === 'none') unused.add('perspective-origin');
    return unused;
  };
  const styleText = (style, prefix, own, parent, skipped) => {
    const plain = plainDefaults();
    const unused = unusedOf(style, prefix);
    let text = '';
    for (let i = 0; i < style.length; i++) {
      const name = style[i];
      if ((skipped && skipped.has(name)) || needless(name) || unused.has(name)) continue;
      let value = style.getPropertyValue(name);
      if (prefix && name === 'transform') value = prefix + (value === 'none' ? '' : value);
      else if (value === own.get(name) && (NOT_INHERITED.has(name)
        || (value === plain.get(name) && value === (parent ? parent.getPropertyValue(name) : plain.get(name))))) continue;
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
  // Whether an element's own box puts anything on screen, so a layer holding nothing but
  // transparent boxes is not drawn at all.
  const SIDES = ['Top', 'Right', 'Bottom', 'Left'];
  const paints = (style) => !/^(transparent|rgba\([^)]*,\s*0\))$/.test(style.backgroundColor) || style.backgroundImage !== 'none' || style.boxShadow !== 'none'
    || SIDES.some((side) => Number.parseFloat(style['border' + side + 'Width']) > 0 && !/^(none|hidden)$/.test(style['border' + side + 'Style']))
    // An outline (a reticle, a selection box), a list's marker, a backdrop filter and a column
    // rule paint too: markupOf leaves a positioned box out of the layers it does not paint in.
    || (style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0)
    || (style.display === 'list-item' && (style.listStyleType !== 'none' || style.listStyleImage !== 'none')) || (style.backdropFilter && style.backdropFilter !== 'none')
    || (style.columnRuleStyle !== 'none' && Number.parseFloat(style.columnRuleWidth) > 0);
  // Out of the flow, so leaving it out of a layer moves nothing else. display: contents makes no
  // box, and its children are laid out where it sits, so it is never out of the flow.
  const outOfFlow = (style) => (style.position === 'absolute' || style.position === 'fixed') && style.display !== 'contents';
  const walkWhole = (walk) => {
    for (;;) { const step = walk.next(); if (step.done) return step.value; }
  };
  // A promise whose failure is the caller's to read, never the page's console: one that failed
  // after the drawing had already given up (too much to carry, past the deadline) used to reach
  // the game's own console as an uncaught "too much to carry".
  const settled = (promise) => { promise.catch(() => {}); return promise; };
  const idleSlice = () => new Promise((resolve) => {
    const idle = globalThis.requestIdleCallback;
    if (typeof idle === 'function') idle.call(globalThis, (deadline) => resolve(deadline), { timeout: 100 });
    else nativeSetTimeout.call(globalThis, () => resolve(null), 16);
  });
  // How long one slice may run: domSliceMs, or more of an idle period the browser says it has to
  // spare before its next frame, up to domSliceIdleMs. A slice the browser ran because its
  // timeout came, with no idle time at all, takes domSliceMs. So a page whose game leaves idle
  // time between frames is walked in a few frames rather than a few dozen, and the walk still
  // never runs into the next frame's time.
  const sliceFor = (job, deadline) => !deadline || deadline.didTimeout ? job.sliceMs
    : Math.max(job.sliceMs, Math.min(job.sliceIdleMs || job.sliceMs, deadline.timeRemaining() - 1));
  const walkSliced = async (walk, job, began, probed) => {
    job.spent = job.spent || 0;
    let budget = job.sliceMs;
    for (let started = began; ; started = performance.now()) {
      let step;
      // The probe is in the document only within a slice, never across the game's own code.
      if (probed) openProbe(true);
      try {
        do { step = walk.next(); } while (!step.done && performance.now() - started < budget);
      } finally {
        if (probed) closeProbe();
        job.spent += performance.now() - started;
      }
      if (step.done) return step.value;
      if (performance.now() > job.deadline || job.stop.signal.aborted) throw new Error('over budget');
      budget = sliceFor(job, await idleSlice());
    }
  };
  // THE MARKUP, A FEW ELEMENTS AT A TIME (27 Nov 2026). XMLSerializer writes a whole page in one
  // call, and the escaping for a data: address was one more pass over all of it: 16 ms and 22 ms
  // on a page of 8 MB, in the same task as the decode. This writes the copy as XHTML, as
  // XMLSerializer would (an SVG inside it is still handed to XMLSerializer, which knows its
  // namespaces), escaped for the address as it goes, one element a step, so walkSliced can stop
  // it anywhere. A character XML refuses (a control character, half a surrogate pair) is dropped
  // or replaced rather than left to fail the whole picture.
  //
  // The parts come back as a list. A picture is carried only by the layer it paints in: an
  // element marked with a layer gets its src, or its style with the pictures in it, as a part
  // holding both versions, and every other layer takes the one without them, since that layer
  // hides the element anyway. A subtree out of the flow (marks.loose) is a group of its own,
  // kept only in the layers marks.paintsIn says it paints in. The slot (the style that picks
  // which layer shows) is a part each layer fills in. Each list's raw counts its own markup's
  // characters, for the byte budget.
  const XHTML_NS = 'http://www.w3.org/1999/xhtml';
  const VOID_ELEMENTS = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/;
  const NOT_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;
  // Pairs are matched first and kept; what is left of the range is half a pair. No lookbehind,
  // which a Safari before 16.4 cannot parse, and a parse error here would take the whole
  // receiver with it.
  const SURROGATES = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g;
  const xmlText = (value) => value.replace(NOT_XML, '').replace(SURROGATES, (found) => found.length === 2 ? found : '\uFFFD')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const xmlAttribute = (value) => xmlText(value).replace(/"/g, '&quot;').replace(/\t/g, '&#9;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;');
  // The element's own pictures, and only those that lay nothing out: a mask, a clip path or a
  // filter given by a url() reaches its descendants, which may paint in a layer the element
  // itself does not.
  // Not list-style-image: a marker inside the item is laid out by its picture's size.
  const OWN_PICTURES = /(background-image|border-image-source):((?:url\("[^"]*"\)|[^;"])*);/g;
  const PICTURE_URL = /url\("data:[^"]*"\)/g;
  const withoutPictures = (value) => value.replace(OWN_PICTURES, (whole, name, list) => name + ':' + list.replace(PICTURE_URL, 'none') + ';');
  const HEAVY_CHARS = 512;
  // A long string (the sheet of font faces, a picture carried whole) escaped a piece a step,
  // never splitting a surrogate pair: [escaped for the address, its length before that].
  const CHUNK_CHARS = 65536;
  const escapedSliced = function* (value, escape) {
    if (value.length <= CHUNK_CHARS) { const text = escape(value); return [encodeURIComponent(text), text.length]; }
    const pieces = [];
    let raw = 0;
    for (let from = 0; from < value.length;) {
      let to = Math.min(value.length, from + CHUNK_CHARS);
      const code = value.charCodeAt(to - 1);
      if (to < value.length && code >= 0xD800 && code <= 0xDBFF) to++;
      const text = escape(value.slice(from, to));
      raw += text.length;
      pieces.push(encodeURIComponent(text));
      from = to;
      yield;
    }
    return [pieces.join(''), raw];
  };
  const markupOf = function* (root, parts, tally, slot, marks) {
    const visit = function* (node, top, into) {
      const put = (text) => { into.raw += text.length; into.parts.push(encodeURIComponent(text)); };
      if (node.nodeType === 3) {
        const [text, raw] = yield* escapedSliced(node.nodeValue, xmlText);
        into.raw += raw;
        into.parts.push(text);
        return;
      }
      if (node.nodeType !== 1) return;
      yield;
      if (node === slot) { into.parts.push(null); return; }
      if (marks && !top && marks.loose.has(node)) {
        const group = { paintsIn: marks.paintsIn.get(node) || 0, parts: [], raw: 0 };
        into.parts.push(group);
        into = group;
      }
      if (node.namespaceURI !== XHTML_NS) { put(serialize(node)); return; }
      const layer = node.getAttribute('data-l');
      let open = '<' + node.localName + (top ? ' xmlns="' + XHTML_NS + '"' : '');
      for (const attribute of node.attributes) {
        const value = attribute.value;
        const name = ' ' + attribute.name + '="';
        if (value.length < HEAVY_CHARS) { open += name + xmlAttribute(value) + '"'; continue; }
        put(open);
        open = '';
        const quoted = function* (text) {
          const [escaped, raw] = yield* escapedSliced(text, xmlAttribute);
          return [encodeURIComponent(name) + escaped + '%22', name.length + raw + 1];
        };
        const [full, fullRaw] = yield* quoted(value);
        const carries = attribute.name === 'src' ? value.startsWith('data:') : attribute.name === 'style' && value.includes('url("data:');
        if (layer === null || !carries) { into.raw += fullRaw; into.parts.push(full); continue; }
        // A hidden element ('h') paints in no layer, so none carries its pictures. A layer that
        // does not show the element has its src left out, as an image still loading is.
        const [bare, bareRaw] = attribute.name === 'src' ? ['', 0] : yield* quoted(withoutPictures(value));
        into.parts.push({ at: layer === 'h' ? -1 : Number(layer), full: full, bare: bare, fullRaw: fullRaw, bareRaw: bareRaw });
      }
      if (!node.firstChild && VOID_ELEMENTS.test(node.localName)) { put(open + ' />'); return; }
      put(open + '>');
      for (let child = node.firstChild; child; child = child.nextSibling) yield* visit(child, false, into);
      put('</' + node.localName + '>');
    };
    const whole = { parts: parts, raw: 0 };
    yield* visit(root, true, whole);
    tally.raw = whole.raw;
  };
  // One layer's markup, as the tail of a data: address, with its length before escaping.
  const layerMarkup = (parts, tally, at, slotText) => {
    const chosen = [];
    let raw = 0;
    const take = (list) => {
      for (const part of list) {
        if (typeof part === 'string') chosen.push(part);
        else if (part === null) { raw += slotText.length; chosen.push(encodeURIComponent(slotText)); }
        else if (part.parts) { if (part.paintsIn & (at > 30 ? -1 : 1 << at)) { raw += part.raw; take(part.parts); } }
        else if (part.at === at) { raw += part.fullRaw; chosen.push(part.full); }
        else { raw += part.bareRaw; chosen.push(part.bare); }
      }
    };
    take(parts);
    return { text: chosen.join(''), raw: tally.raw + raw };
  };
  // LAYERS, FOR A RECORDING. Given layers (RECORD AND INSTANT REPLAY, below), the page is
  // copied once with every canvas and video left out, each element and run of text marked
  // with the layer it paints in (how many of the recorded canvases and videos paint under
  // it), and drawn once per layer that holds anything, every other layer hidden. Those
  // pictures go between the canvases and videos, which are drawn fresh every frame, so a
  // loading screen, a menu or a HUD in HTML sits where the player saw it, over or under them.
  const drawPage = async (snapshots, width, height, job, layers) => {
    // A document with no window: elements made in it are never upgraded by the game's
    // custom element definitions and never load anything, so copying runs no game code.
    const inert = document.implementation.createHTMLDocument('');
    // The copying is synchronous, so a timer cannot interrupt it; it watches the job's
    // deadline itself, or a slow machine with a big page would hold the main thread past
    // the parent's whole wait and the creator would be told the game did not answer.
    const late = () => performance.now() > (job.walk || job.deadline);
    const began = performance.now();
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
    // Which layers paint anywhere in each copied element, as bits, and which elements sit out
    // of the flow (absolute, fixed): markupOf leaves such a subtree out of every layer it paints
    // nothing in, which moves nothing else, since nothing else is laid out around it.
    const paintsIn = new WeakMap();
    const loose = new WeakSet();
    const bit = (at) => at > 30 ? -1 : 1 << at;
    // A generator, so a recording can walk the page a few milliseconds at a time (walkSliced,
    // below) while the screenshot still walks it in one go, exactly as before (walkWhole).
    const copy = function* (node, scrolled, parent) {
      if (node.nodeType === 3) { spend(job, node.nodeValue.length); return inert.createTextNode(node.nodeValue); }
      if (node.nodeType !== 1 || node === probe.host) return null;
      const tag = node.localName;
      if (SKIPPED.test(tag)) return null;
      if (++elements > shot.domElementsMax) throw new Error(CROWDED);
      yield;
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
        // Copied whole, its own style attributes and sheets keep their var(--x), which nothing
        // else in the copy defines now that copied elements carry no custom properties: so the
        // SVG's root carries the ones it inherits, short of any picture (styleText, above).
        const text = styleText(style, prefix, defaultsOf(SVG_NS, 'svg'), parent) + customOf(style);
        spend(job, text.length);
        svg.setAttribute('style', text);
        if (layers) {
          const at = style.visibility !== 'visible' ? 'h' : layers.of(node);
          svg.setAttribute('data-l', String(at));
          if (at !== 'h') layers.used.add(at);
          paintsIn.set(svg, at === 'h' ? 0 : bit(at));
          if (outOfFlow(style)) loose.add(svg);
        }
        return svg;
      }
      if (node instanceof SVGElement) return null;
      let out;
      const own = !layers ? null : node instanceof HTMLCanvasElement || node instanceof HTMLVideoElement || style.visibility !== 'visible' ? 'h' : layers.of(node);
      if (node instanceof HTMLCanvasElement || node instanceof HTMLVideoElement) {
        out = inert.createElement('img');
        const still = stills.get(node);
        if (still) out.setAttribute('src', still);
      } else if (node instanceof HTMLImageElement) {
        out = inert.createElement('img');
        // Only an image the page has finished loading: one still on its way is not on screen
        // yet, and asking for it again would be a second download of it.
        const source = node.complete && node.naturalWidth > 0 ? node.currentSrc || node.src : '';
        if (source) waits.push(settled(imagePicture(node, source, style, job).then((data) => { if (data) out.setAttribute('src', data); })));
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
      const backgrounds = backgroundPlan(node, style);
      const text = styleText(style, prefix, defaultsOf(HTML_NS, out.localName), parent, backgrounds ? BACKGROUND_PROPERTIES : null);
      spend(job, text.length);
      out.setAttribute('style', text);
      if (text.includes('url(') || backgrounds) {
        waits.push(settled(Promise.all([text.includes('url(') ? inlineCss(text, job) : text, backgrounds ? backgroundText(backgrounds, job) : ''])
          .then(([done, drawn]) => { out.setAttribute('style', done + drawn); })));
      }
      let mask = 0;
      const mark = (at) => { layers.used.add(at); mask |= bit(at); };
      if (layers) {
        out.setAttribute('data-l', String(own));
        if (own !== 'h' && (out.localName === 'img' || out.localName === 'input' || out.localName === 'textarea' || out.localName === 'select' || paints(style))) mark(own);
      }
      for (const which of ['::before', '::after']) {
        const generated = getComputedStyle(node, which);
        const content = generated.getPropertyValue('content');
        if (!content || content === 'none' || content === 'normal') continue;
        if (layers && own !== 'h') mark(own);
        const name = 'og-shot-' + pseudo.length;
        out.classList.add(name);
        const rule = '.' + name + which + '{' + styleText(generated, '', plainDefaults(), style) + '}';
        spend(job, rule.length);
        pseudo.push(settled(inlineCss(rule, job)));
      }
      if (out.localName !== 'img' && !(node instanceof HTMLTextAreaElement)) {
        const inner = node.scrollTop || node.scrollLeft ? 'translate(' + -node.scrollLeft + 'px,' + -node.scrollTop + 'px) ' : '';
        for (const child of node.childNodes) {
          const made = yield* copy(child, inner, style);
          if (!made) continue;
          if (layers && made.nodeType === 1) mask |= paintsIn.get(made) || 0;
          // Text paints in the layer of where it sits, which is its element's unless one of
          // the recorded canvases or videos comes between them; it then gets a span to carry it.
          if (layers && own !== 'h' && made.nodeType === 3 && /\S/.test(made.nodeValue)) {
            const at = layers.of(child);
            mark(at);
            if (at !== own) {
              const carrier = inert.createElement('span');
              carrier.setAttribute('data-l', String(at));
              carrier.appendChild(made);
              out.appendChild(carrier);
              continue;
            }
          }
          out.appendChild(made);
        }
      }
      if (layers) {
        paintsIn.set(out, mask);
        if (outOfFlow(style)) loose.add(out);
      }
      return out;
    };
    let root;
    if (layers) {
      // A recording walks in slices of domSliceMs in idle time, so no one step holds the game's
      // thread long enough to cost it a frame: a page of a hundred elements took 35 to 40 ms to
      // read whole on a machine without a GPU (OG Snipes' start screen, 23 Nov 2026). The page
      // may change between slices; the watch sees that and draws it again next time.
      root = await walkSliced(copy(document.documentElement, '', null), job, began, true);
    } else {
      try { openProbe(); root = walkWhole(copy(document.documentElement, '', null)); }
      finally { closeProbe(); }
      job.spent = (job.spent || 0) + performance.now() - began;
    }
    if (!root) throw new Error('nothing to draw');
    job.walk = 0;
    const [faces, rules] = await Promise.all([fontFaces(job), Promise.all(pseudo), Promise.all(waits)]);
    if (late() || job.stop.signal.aborted) throw new Error('over budget');
    const sheet = inert.createElement('style');
    sheet.textContent = faces + '\n' + rules.join('\n');
    root.insertBefore(sheet, root.firstChild);
    const open = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">'
      + '<foreignObject x="0" y="0" width="100%" height="100%">');
    const close = encodeURIComponent('</foreignObject></svg>');
    // A data: URL and not a blob: one. Chrome taints a canvas for a foreignObject drawn
    // from a blob: address and not from a data: one, measured in the test beside this.
    const address = (markup) => 'data:image/svg+xml;charset=utf-8,' + open + markup + close;
    if (layers) {
      // One copy of the page, drawn once per layer with every other layer hidden. Hidden by
      // visibility, so each element keeps its box and its children lay out as they did.
      if (layers.used.size > layers.maxLayers) throw new Error(CROWDED);
      const shown = inert.createElement('style');
      root.insertBefore(shown, root.firstChild);
      const parts = [];
      const tally = { raw: 0 };
      await walkSliced(markupOf(root, parts, tally, shown, { paintsIn: paintsIn, loose: loose }), job, performance.now(), false);
      // Each layer is decoded in an idle task of its own, since the browser decodes a drawn
      // page on this thread in one go; each layer carries only its own pictures, so that go
      // is as short as the layer allows. job.windows keeps when each decode ran, for the
      // check that it did not cost the game a frame (refreshDom).
      const pictures = [];
      for (let at = 0; at <= layers.count; at++) {
        if (!layers.used.has(at)) { pictures.push(null); continue; }
        await idleSlice();
        if (late() || job.stop.signal.aborted) throw new Error('over budget');
        // The browser's report of the last decode has come in by now: a long frame it says was
        // neither the game's scripts nor its rendering ends the drawing here.
        if (job.windows && stalledDuring(job.windows)) throw new Error(SLOW);
        const markup = layerMarkup(parts, tally, at, '<style>[data-l]{visibility:hidden!important}[data-l="' + at + '"]{visibility:visible!important}</style>');
        // The markup is the copy that is actually held, so it is what the budget is checked
        // against last: inlined files counted once per use, plus every computed style.
        if (markup.raw > shot.domBytesMax) throw new Error(CROWDED);
        const picture = new Image();
        const decoding = performance.now();
        const framesBefore = framesRun;
        picture.src = address(markup.text);
        await picture.decode();
        // The decode is the browser's own work and nothing here can time it exactly. A long frame
        // the browser reports as neither the game's scripts nor its rendering counts it (checked
        // before the next layer, above, and at the next look, refreshDom). So does the wait for
        // it, but only a wait the game ran no frame during: a recording asks for every frame, so
        // a wait with none was the thread held. A wait the game's frames ran through was mostly
        // the game's time, and counting it stopped the HTML of a game spending 30 ms of every
        // frame on its thread within a minute (review, 27 Nov 2026). One past domStepMaxMs ends
        // the drawing there, rather than going on to decode the other layers one after another,
        // which was 0.6 to 0.8 s of World at War Zombies' thread at a time (measured 27 Nov 2026);
        // one past domStepSlowMs, a frame's worth, is kept but puts the next drawing domBackoffMs
        // off (refreshDom). The whole wait is counted in what the drawing cost, which spaces the
        // next one by domCostFactor: overcounted, it costs the clip freshness, never the game.
        const decoded = performance.now();
        const held = framesRun === framesBefore ? decoded - decoding : 0;
        job.slowest = Math.max(job.slowest || 0, held);
        job.spent = (job.spent || 0) + (decoded - decoding);
        if (job.windows) job.windows.push([decoding, decoded, held > rec.domStepMaxMs]);
        if (held > rec.domStepMaxMs) throw new Error(SLOW);
        pictures.push(picture);
      }
      if (late()) throw new Error('over budget');
      return pictures;
    }
    const parts = [];
    const tally = { raw: 0 };
    walkWhole(markupOf(root, parts, tally, null, null));
    if (tally.raw > shot.domBytesMax) throw new Error(CROWDED);
    if (late()) throw new Error('over budget');
    const picture = new Image();
    picture.src = address(parts.join(''));
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
          const job = { deadline: started + shot.domBudgetMs, bytes: 0, ...pageCaches(), scale: scale,
            stop: new AbortController(), active: 0, queue: [] };
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

  // RECORD AND INSTANT REPLAY (22 Nov 2026). The page cannot read this document's pixels, so
  // when a player records, the page asks here and this encodes what the game draws. After
  // each of the game's animation frames, the visible canvases are drawn into one picture at
  // the size the page asked for and handed to the browser's video encoder (WebCodecs), which
  // on most machines is the hardware's own and costs the game almost nothing. The game's
  // sound is tapped where every realtime context reaches the speakers (outputFor above).
  // Encoded pieces go to the page every flushMs, and the page keeps them on the player's
  // device: an MP4 is only ever written there, from pieces already encoded, so Stop costs
  // no rendering. The page treats every piece as the game's claim, as it does a screenshot.
  //
  // Frames are paced to fpsMax and dropped, never queued, while the encoder is behind, so a
  // slow machine records fewer frames rather than playing slower. Canvases and videos are
  // drawn every frame and the page's HTML in layers between them, redrawn only as it changes
  // (WHAT THE PLAYER SEES, below), and media elements are heard as well as Web Audio (SOUND
  // FROM <audio> AND <video>). Known gap, accepted: a game that draws outside
  // requestAnimationFrame records its last frame.
  const rec = __OG_RECORDING__;
  const recordId = /^[A-Za-z0-9_-]{16,64}$/;
  let recording = null;
  const tellRecord = (session, body, transfer) => {
    try { host.postMessage(Object.assign({ og: 1, type: 'record', id: session.id }, body), session.origin, transfer || []); } catch { /* The page went away. */ }
  };
  const evenOf = (value) => Math.max(2, Math.round(value / 2) * 2);
  // The long side gets the long edge whichever way the game faces: 1920x1080 for a wide
  // game, 1080x1920 for a tall one, and each shrinks until the short side fits too.
  const outputSize = (edge, shortEdge) => {
    const aspect = Math.max(0.25, Math.min(4, (innerWidth || 16) / (innerHeight || 9)));
    let width = aspect >= 1 ? edge : edge * aspect;
    let height = aspect >= 1 ? edge / aspect : edge;
    if (Math.min(width, height) > shortEdge) {
      const scale = shortEdge / Math.min(width, height);
      width *= scale; height *= scale;
    }
    return { width: evenOf(width), height: evenOf(height) };
  };
  // AN ENCODER THE BROWSER SAID YES TO CAN STILL FAIL, and one that does is not asked for again
  // on this page (26 Nov 2026). isConfigSupported answers for the configuration, not for the
  // machine as it is now: a hardware HEVC encoder can refuse at configure, or error once it
  // has started, and until then the session ended "failed" and the page left Replay greyed
  // out for the rest of the play (seen on Gravebound). Now a configuration that errors before
  // its first frame, or twice after, is set aside, and the next start takes the next one down
  // the list, H.264 after HEVC. The browser's answers are kept too, so a start after the first
  // costs no probes, where the first can take seconds on a game busy loading.
  const encoderAnswers = new Map();
  const encoderFailures = new Map();
  const refusedEncoders = new Set();
  const encoderKey = (config) => config.codec + ' ' + config.width + 'x' + config.height + ' ' + config.hardwareAcceleration;
  const encoderFailed = (config, encoded) => {
    const key = encoderKey(config);
    const failures = (encoderFailures.get(key) || 0) + 1;
    encoderFailures.set(key, failures);
    if (!encoded || failures >= 2) refusedEncoders.add(key);
  };
  const videoConfigFor = async (compactOnly) => {
    if (typeof VideoEncoder !== 'function' || typeof VideoFrame !== 'function' || typeof OffscreenCanvas !== 'function') return null;
    const sizes = [];
    // HEVC FIRST, WHERE THE HARDWARE ENCODES IT (23 Nov 2026). About the picture H.264 gives at
    // half the bits, so 1440p fits in what 1080p H.264 took, and a stage drawn at 1440 or more
    // physical pixels records at 1440p. The browser's hardware encoder only, never software:
    // a software HEVC encoder at 1440p60 would cost the game its frames. Chosen deliberately over
    // the playback cost, since Firefox on Mac and Linux and some older Android phones cannot
    // play the file; the site, iPhone, Mac and Chrome or Edge on Windows can.
    if (!compactOnly) {
      const physical = Math.max(innerWidth || 0, innerHeight || 0) * (devicePixelRatio || 1);
      const edges = physical >= rec.hevcScreenPx ? [rec.hevcEdge, rec.hevcShortEdge] : [rec.edge, rec.shortEdge];
      sizes.push({ size: outputSize(edges[0], edges[1]), edges: edges, bitrate: edges[0] === rec.hevcEdge ? rec.hevcBitsPerSecond : rec.hevcCompactBitsPerSecond,
        hardware: ['prefer-hardware'], codecs: ['hvc1.1.6.L153.B0', 'hvc1.1.6.L150.B0', 'hvc1.1.6.L123.B0'] });
      sizes.push({ size: outputSize(rec.edge, rec.shortEdge), edges: [rec.edge, rec.shortEdge], bitrate: rec.bitsPerSecond, hardware: ['prefer-hardware'] });
    }
    sizes.push({ size: outputSize(rec.compactEdge, rec.compactShortEdge), edges: [rec.compactEdge, rec.compactShortEdge], bitrate: rec.compactBitsPerSecond, hardware: ['prefer-hardware', 'no-preference'] });
    // High, Main, then Constrained Baseline, at level 4.2, which covers 1080p at 60.
    const avc = ['avc1.64002A', 'avc1.4D002A', 'avc1.42E02A'];
    for (const choice of sizes) {
      for (const hardwareAcceleration of choice.hardware) {
        for (const codec of choice.codecs || avc) {
          const hevc = codec.startsWith('hvc1');
          const config = { codec: codec, width: choice.size.width, height: choice.size.height, bitrate: choice.bitrate,
            framerate: hardwareAcceleration === 'prefer-hardware' ? rec.fpsMax : Math.min(rec.fpsMax, rec.softwareFpsMax),
            hardwareAcceleration: hardwareAcceleration, latencyMode: 'realtime' };
          if (hevc) config.hevc = { format: 'hevc' }; else config.avc = { format: 'avc' };
          const key = encoderKey(config);
          if (refusedEncoders.has(key)) continue;
          let supported = encoderAnswers.get(key);
          if (supported === undefined) {
            try {
              const answer = await VideoEncoder.isConfigSupported(config);
              supported = !!(answer && answer.supported);
            } catch { supported = false; }
            encoderAnswers.set(key, supported);
          }
          if (supported) return { config: config, edges: choice.edges, hardware: hardwareAcceleration === 'prefer-hardware' };
        }
      }
    }
    return null;
  };
  const audioConfigFor = async (sampleRate) => {
    if (typeof AudioEncoder !== 'function' || typeof AudioData !== 'function') return null;
    // AAC where the platform encodes it (macOS, Windows), at the game's own rate; Opus
    // elsewhere, which takes 48 kHz, so a 44.1 kHz game is resampled in the tap below.
    for (const codec of ['mp4a.40.2', 'opus']) {
      const config = { codec: codec, sampleRate: codec === 'opus' ? 48000 : sampleRate, numberOfChannels: 2, bitrate: rec.audioBitsPerSecond };
      try {
        const answer = await AudioEncoder.isConfigSupported(config);
        if (answer && answer.supported) return config;
      } catch { /* Try the next. */ }
    }
    return null;
  };
  // The tap is a worklet with no outputs, which a browser runs for as long as its context
  // runs, since process() keeps answering true. It hands the page about 2048 frames at a
  // time. Loaded from a blob: address, which every runtime contract's script-src allows.
  // SILENCE IS SENT TOO (27 Nov 2026). While nothing is connected to the ear, a browser hands
  // process() no channels at all, and the tap used to send nothing then. World at War Zombies
  // stops its menu music and leaves that context running when a map loads, and plays the map
  // through a second one: the quiet first context still set the track's pace (below) and sent
  // no blocks to pace by, so every block of the map's sound was queued and dropped, and the owner's
  // clip went silent at the load. A block of silence is a quantum of zeros, so a running
  // context always keeps time. Since a tap now always has something to say, untap tells it to
  // stop, or a recording's taps would post silence for the life of the page.
  const TAP = "registerProcessor('og-record-tap', class extends AudioWorkletProcessor { constructor() { super(); this.parts = []; this.size = 0; this.done = false; this.quiet = new Float32Array(typeof renderQuantumSize === 'number' ? renderQuantumSize : 128); this.port.onmessage = () => { this.done = true; }; } process(inputs) { if (this.done) return false; const input = inputs[0]; if (input && input.length) { const left = input[0]; const right = input[1] || input[0]; this.parts.push([left.slice(), right.slice()]); this.size += left.length; } else { this.parts.push([this.quiet, this.quiet]); this.size += this.quiet.length; } if (this.size >= 2048) { this.port.postMessage(this.parts); this.parts = []; this.size = 0; } return true; } });";
  let tapUrl = null;
  // Linear resampling, carried across blocks so the joins do not click: phase is where
  // the next output sample falls, in input samples from the start of the next block.
  const resampler = (step) => {
    const carry = { phase: 0, last: [0, 0] };
    return (left, right) => {
      if (step === 1) return [left, right];
      const out = [[], []];
      const input = [left, right];
      let phase = carry.phase;
      while (phase < left.length - 1) {
        const index = Math.floor(phase);
        const fraction = phase - index;
        for (let c = 0; c < 2; c++) {
          const a = index < 0 ? carry.last[c] : input[c][index];
          const b = input[c][index + 1];
          out[c].push(a + (b - a) * fraction);
        }
        phase += step;
      }
      carry.phase = phase - left.length;
      carry.last = [left[left.length - 1], right[right.length - 1]];
      return [Float32Array.from(out[0]), Float32Array.from(out[1])];
    };
  };
  // ONE TRACK FROM EVERY CONTEXT. A game may play music on one context and effects on
  // another, or close one and make the next. Each context gets its own tap, resampled to the
  // track's rate; the first running one sets the pace, and the others' sound is added to it
  // as it arrives, up to half a second of it, so a context that stalls cannot drag the track.
  // Running, not merely open: a suspended context renders nothing, so pacing on one left
  // every other context queueing and dropping its sound, and the clip went silent while
  // the game played on (Greptile on opengamehq/opengame#27). The pace is chosen again for
  // every block, so a context suspended or resumed mid-recording hands it on.
  const takeFrames = (tap, count) => {
    const left = new Float32Array(count);
    const right = new Float32Array(count);
    let at = 0;
    while (at < count && tap.queue.length) {
      const [l, r] = tap.queue[0];
      const take = Math.min(count - at, l.length);
      left.set(l.subarray(0, take), at); right.set(r.subarray(0, take), at);
      at += take;
      if (take === l.length) tap.queue.shift(); else tap.queue[0] = [l.subarray(take), r.subarray(take)];
    }
    tap.queued -= at;
    return [left, right];
  };
  const paceTap = (session) => {
    // A running context first: one the game suspended (often while a cutscene video plays)
    // never runs its worklet.
    let open = null;
    for (const tap of session.taps.values()) {
      if (!tap) continue;
      if (tap.context.state === 'running') return tap;
      if (!open && tap.context.state !== 'closed') open = tap;
    }
    return open;
  };
  const encodeMix = (session, tap, left, right) => {
    const mix = session.mix;
    if (!mix || mix.encoder.state !== 'configured') return;
    const frames = left.length;
    if (!frames) return;
    if (paceTap(session) !== tap) {
      tap.queue.push([left, right]);
      tap.queued += frames;
      while (tap.queued > mix.config.sampleRate / 2 && tap.queue.length) tap.queued -= tap.queue.shift()[0].length;
      return;
    }
    // What this tap queued while another set the pace is older than this block: dropped,
    // or it would be mixed in later, out of time, should the pace move back.
    if (tap.queued) { tap.queue = []; tap.queued = 0; }
    const data = new Float32Array(frames * 2);
    data.set(left, 0); data.set(right, frames);
    for (const other of session.taps.values()) {
      if (!other || other === tap) continue;
      const [l, r] = takeFrames(other, frames);
      for (let i = 0; i < frames; i++) { data[i] += l[i]; data[frames + i] += r[i]; }
    }
    const span = frames / mix.config.sampleRate * 1e6;
    // Timed on the same clock as the pictures, and moved forward when the sound falls a
    // tenth of a second behind them (a context the game suspended, a hidden tab). Never
    // back: blocks that queued behind a stalled main thread arrive together and are due
    // in a burst, and stamping them early would put the track out of order.
    const due = (performance.now() - session.start) * 1000 - span;
    if (mix.next < 0 || due - mix.next > 1e5) mix.next = Math.max(0, due);
    try {
      const audio = new AudioData({ format: 'f32-planar', sampleRate: mix.config.sampleRate, numberOfFrames: frames, numberOfChannels: 2, timestamp: Math.round(mix.next), data: data });
      mix.encoder.encode(audio);
      audio.close();
    } catch { /* One lost block is a click, not a failed recording. */ }
    mix.next += span;
  };
  const untap = (session) => {
    for (const tap of session.taps.values()) {
      if (!tap) continue;
      try { nativeDisconnect.call(tap.input, tap.node); } catch { /* Already gone. */ }
      tap.node.port.onmessage = null;
      try { tap.node.port.postMessage('stop'); } catch { /* Already gone. */ }
    }
    session.taps.clear();
  };
  const tapContext = async (session, context) => {
    if (session.taps.has(context) || session.mix === false || !context.audioWorklet || typeof AudioWorkletNode !== 'function') return;
    session.taps.set(context, null);
    try {
      if (!session.mix) {
        const config = await audioConfigFor(context.sampleRate);
        if (!config) { session.mix = false; return; }
        if (!session.mix) {
          // An encoder that fails takes every tap with it, or the worklets run for the life
          // of the document posting blocks nobody encodes.
          const encoder = new AudioEncoder({
            output: (chunk, meta) => queueChunk(session, 'a', chunk, meta),
            error: () => { untap(session); session.mix = false; },
          });
          encoder.configure(config);
          session.mix = { encoder: encoder, config: config, next: -1 };
        }
      }
      tapUrl = tapUrl || URL.createObjectURL(new Blob([TAP], { type: 'text/javascript' }));
      await context.audioWorklet.addModule(tapUrl);
      if (session.stopped || !session.mix || context.state === 'closed') { session.taps.delete(context); return; }
      const node = new AudioWorkletNode(context, 'og-record-tap', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 2, channelCountMode: 'explicit' });
      const tap = { context: context, node: node, input: tapInputFor(context), queue: [], queued: 0, resample: resampler(context.sampleRate / session.mix.config.sampleRate) };
      node.port.onmessage = (event) => {
        if (session.stopped) return;
        const parts = event.data.map((part) => tap.resample(part[0], part[1]));
        const frames = parts.reduce((sum, part) => sum + part[0].length, 0);
        const left = new Float32Array(frames);
        const right = new Float32Array(frames);
        let at = 0;
        for (const part of parts) { left.set(part[0], at); right.set(part[1], at); at += part[0].length; }
        encodeMix(session, tap, left, right);
      };
      nativeConnect.call(tap.input, node);
      session.taps.set(context, tap);
      context.addEventListener('statechange', () => { if (context.state === 'closed') session.taps.delete(context); });
    } catch {
      session.taps.delete(context);
    }
  };
  // SOUND FROM <audio> AND <video> (23 Nov 2026). OG Snipes plays its loading music, its menu
  // sounds and its cutscenes' sound through media elements, which never pass through a Web
  // Audio context, so none of it was in the track. Each one the game plays (tracked by play
  // and muted above, detached new Audio() included) is captured with captureStream, which
  // copies the element's sound without changing what reaches the speakers, into one context
  // of the recording's own that the tap below listens to like any other. An element the game
  // routed into Web Audio itself is already heard there and is left alone. A file from
  // another origin cannot be captured and stays out. Firefox's mozCaptureStream moves the
  // sound off the speakers rather than copying it, so it is not used.
  // The game's own level for the element, which the player's volume never touches (the
  // receiver scales the element by the player's level on top, and the copy is taken before
  // that): a muted cutscene stays silent and music at 0.2 stays at 0.2.
  // For a stream an element plays, heard from the stream itself (below), paused is silent too:
  // a capture goes quiet by itself when its element pauses, and the stream goes on sounding
  // (Greptile on #2453). Only there, since a capture is made from inside play(), before the
  // element stops being paused, and its first sound must not wait for the play event.
  const ownLevel = (element, borrowed) => desired.get(element) || (borrowed && element.paused) ? 0 : ownVolume.has(element) ? ownVolume.get(element) : 1;
  const levelTap = (session, element) => {
    const entry = session.mediaTaps.get(element);
    if (entry) entry.level.gain.value = ownLevel(element, entry.borrowed);
  };
  const tapElement = (session, element) => {
    if (session.mix === false || session.stopped || routed.has(element) || session.mediaTaps.has(element)) return;
    if (typeof AudioContext !== 'function') return;
    // AN ELEMENT PLAYING A STREAM IS HEARD FROM THAT STREAM (27 Nov 2026). Chrome's capture of
    // such an element shares the stream's own tracks, so stopping what it returned stopped the
    // game's: a video showing a canvas's stream went black when a recording let it go. Its sound
    // tracks are listened to as they are, and never stopped here; only a capture made here is.
    // By its shape rather than instanceof, so a stream made in another frame counts too.
    const own = element.srcObject;
    const borrowed = Boolean(own) && typeof own.getAudioTracks === 'function' && typeof own.addEventListener === 'function';
    if (!borrowed && typeof element.captureStream !== 'function') return;
    let stream;
    try { stream = borrowed ? own : element.captureStream(); } catch { return; }
    if (!session.mediaContext) {
      try { session.mediaContext = new AudioContext(); } catch { return; }
    }
    const context = session.mediaContext;
    const level = context.createGain();
    level.gain.value = ownLevel(element, borrowed);
    nativeConnect.call(level, tapInputFor(context));
    const entry = { stream: stream, borrowed: borrowed, level: level, sources: new Map(), done: null, added: null, removed: null, attach: null, detach: null, playing: null };
    session.mediaTaps.set(element, entry);
    // ONLY THE SOUND (27 Nov 2026). A captured <video> carries a video track too, and Chrome
    // copies every decoded frame of it into that track on the game's own thread for as long as
    // the track lives, which was the whole recording: World at War Zombies' menu plays its map
    // previews as muted videos, each copied every frame for nothing. The pictures are drawn from
    // the element itself (drawMedia), so a video track captured here is stopped the moment it
    // appears.
    const attach = (track) => {
      if (track.kind === 'video') { if (!borrowed) { try { track.stop(); } catch { /* Gone. */ } } return; }
      if (session.stopped || track.kind !== 'audio' || entry.sources.has(track)) return;
      try {
        const source = context.createMediaStreamSource(new MediaStream([track]));
        nativeConnect.call(source, level);
        entry.sources.set(track, source);
      } catch { /* Not capturable; the rest of the track goes on. */ }
    };
    const detach = (track) => {
      const source = entry.sources.get(track);
      if (source) { try { source.disconnect(); } catch { /* Gone. */ } entry.sources.delete(track); }
    };
    stream.getTracks().forEach(attach);
    entry.attach = attach;
    entry.detach = detach;
    entry.playing = () => levelTap(session, element);
    element.addEventListener('pause', entry.playing);
    element.addEventListener('play', entry.playing);
    entry.added = (event) => attach(event.track);
    entry.removed = (event) => detach(event.track);
    stream.addEventListener('addtrack', entry.added);
    stream.addEventListener('removetrack', entry.removed);
    // An element that finished lets go of its copy, so a game that makes a new Audio() for
    // every shot does not pile them up over a long recording; playing again taps it again.
    entry.done = () => releaseElement(session, element);
    element.addEventListener('ended', entry.done);
    element.addEventListener('emptied', entry.done);
    if (context.state === 'suspended') context.resume().catch(() => {});
    void tapContext(session, context);
  };
  const releaseElement = (session, element) => {
    const entry = session.mediaTaps.get(element);
    if (!entry) return;
    session.mediaTaps.delete(element);
    element.removeEventListener('ended', entry.done);
    element.removeEventListener('emptied', entry.done);
    element.removeEventListener('pause', entry.playing);
    element.removeEventListener('play', entry.playing);
    for (const source of entry.sources.values()) { try { source.disconnect(); } catch { /* Gone. */ } }
    try { entry.level.disconnect(); } catch { /* Gone. */ }
    entry.stream.removeEventListener('addtrack', entry.added);
    entry.stream.removeEventListener('removetrack', entry.removed);
    if (!entry.borrowed) for (const track of entry.stream.getTracks()) { try { track.stop(); } catch { /* Gone. */ } }
  };
  const tapMedia = (session) => {
    if (session.mix === false || session.stopped) return;
    for (const reference of media) {
      const element = reference.deref();
      if (element && !element.paused) tapElement(session, element);
    }
    for (const element of session.mediaTaps.keys()) levelTap(session, element);
    // A track the game adds to or takes from its own stream by script raises no addtrack or
    // removetrack: each look takes any it has not heard yet and lets go of any the stream no
    // longer has, without stopping it, since it is the game's.
    for (const entry of session.mediaTaps.values()) {
      if (!entry.borrowed || !entry.attach) continue;
      const tracks = entry.stream.getAudioTracks();
      tracks.forEach(entry.attach);
      for (const track of [...entry.sources.keys()]) if (!tracks.includes(track)) entry.detach(track);
    }
    const context = session.mediaContext;
    if (context && context.state === 'suspended') context.resume().catch(() => {});
  };
  const untapMedia = (session) => {
    for (const element of [...session.mediaTaps.keys()]) releaseElement(session, element);
    if (session.mediaContext) { try { void session.mediaContext.close(); } catch { /* Closed. */ } session.mediaContext = null; }
  };
  // Every context that has sent sound to the speakers, now and as the game makes more, and
  // every media element it plays.
  const tapAudio = (session) => {
    for (const context of tapInputs.keys()) if (context.state !== 'closed' && context !== session.mediaContext) void tapContext(session, context);
    tapMedia(session);
  };
  const queueChunk = (session, kind, chunk, meta) => {
    if (session.closed) return;
    const data = new ArrayBuffer(chunk.byteLength);
    chunk.copyTo(data);
    const item = { k: kind, key: chunk.type === 'key', t: chunk.timestamp, d: chunk.duration || 0, data: data };
    if (meta && meta.decoderConfig) {
      const config = meta.decoderConfig;
      let description = null;
      if (config.description) {
        const view = ArrayBuffer.isView(config.description) ? config.description : new Uint8Array(config.description);
        description = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
      }
      item.config = { codec: config.codec, width: config.codedWidth || 0, height: config.codedHeight || 0,
        sampleRate: config.sampleRate || 0, channels: config.numberOfChannels || 0, description: description };
    }
    session.pending.push(item);
  };
  // Every flush says something, an empty list when nothing was encoded (a game that drew
  // nothing and played nothing for half a second), so the page can tell a quiet game from a
  // document that went away without a word.
  // A SAVE WAITS FOR THE ENCODERS. A hardware encoder hands back a frame within a frame;
  // a software one under load can hold a second or two, and a save cut before they come out
  // loses its end (measured on 23 Nov 2026: a 4 s recording on a software encoder came back
  // 2 s long). So a save drains both encoders before it answers. The next picture after a
  // drain is a keyframe, since an encoder may start afresh once flushed.
  const drainRecord = async (session) => {
    try { if (session.encoder && session.encoder.state === 'configured') await session.encoder.flush(); } catch { /* Keep what came out. */ }
    try { if (session.mix && session.mix.encoder.state === 'configured') await session.mix.encoder.flush(); } catch { /* Keep what came out. */ }
    session.lastKey = -1;
    if (session.closed) return;
    flushRecord(session);
    tellRecord(session, { op: 'flushed' });
  };
  const flushRecord = (session) => {
    const items = session.pending;
    session.pending = [];
    const transfer = [];
    for (const item of items) {
      transfer.push(item.data);
      if (item.config && item.config.description) transfer.push(item.config.description);
    }
    tellRecord(session, { op: 'chunks', items: items }, transfer);
  };
  // WHAT THE PLAYER SEES, EVERY FRAME (23 Nov 2026). Until audio-23 a recording drew the
  // canvases and nothing else, so OG Snipes' cutscenes (videos laid over its canvas) and its
  // loading screen (HTML over it) came out as the bare canvas colour, a grey rectangle for
  // as long as they ran. Now every canvas and video on screen is drawn each frame, in the
  // order the browser paints them, with its opacity, filter, blend mode and object-fit, and
  // the page's HTML is drawn into the layers between them (drawPage, above).
  //
  // The HTML is the costly part: a walk of the whole document on the game's own thread. So
  // it is redrawn only when the page has changed (a mutation, a running CSS animation, or
  // every domRefreshMs in case something like :hover changed it), in idle time, no sooner
  // than domCostFactor times what the last walk took, in steps none of which holds the thread
  // for long, and within domDeadlineMs: a page that takes longer is left out for domBackoffMs
  // rather than allowed to stutter the game. A game that is one canvas and nothing else walks
  // once, finds nothing to draw, and costs no more than it did.
  //
  // And it is checked. Where the browser reports long frames (long-animation-frame, or
  // longtask), a redraw during whose decoding or painting the game had one that its own scripts
  // do not account for is followed by a wait of domBackoffMs, doubling each time it happens
  // again, up to domStallMaxMs. So a page whose drawing still costs a frame on some machine
  // loses its HTML's freshness in the recording, never the game's smoothness.
  //
  // Paint order is approximated. Each canvas, video and element paints at the z-index of the
  // outermost stacking context it sits in (negative under what flows, positioned or z 0 over
  // it, positive over those), and in document order within one. Rotations and skews are not
  // drawn (a box is drawn where it sits, at its size), and a blend mode set on HTML blends
  // only within its own layer.
  const FOLLOWS = 4;
  const stackOf = (element, memo) => {
    if (!element || element === document.documentElement) return { tier: 0, fixed: false };
    if (memo.has(element)) return memo.get(element);
    const above = stackOf(element.parentElement, memo);
    let state = above;
    if (!above.fixed) {
      const style = getComputedStyle(element);
      const positioned = style.position !== 'static';
      const z = Number.parseInt(style.zIndex, 10);
      if (positioned && Number.isFinite(z)) state = { tier: z < 0 ? z - 1 : z > 0 ? z + 1 : 1, fixed: true };
      else if (style.opacity !== '1' || style.transform !== 'none' || style.filter !== 'none' || style.mixBlendMode !== 'normal' || style.isolation === 'isolate') state = { tier: 1, fixed: true };
      else if (positioned) state = { tier: 1, fixed: false };
    }
    memo.set(element, state);
    return state;
  };
  const paintsBefore = (a, b) => a.tier < b.tier || (a.tier === b.tier && a.node !== b.node && Boolean(a.node.compareDocumentPosition(b.node) & FOLLOWS));
  const layersFor = (scene) => {
    const memo = new Map();
    const marks = scene.map((item) => ({ node: item.el, tier: item.tier }));
    return {
      count: marks.length,
      used: new Set(),
      maxLayers: 6,
      of: (node) => {
        // The root and the body paint the page's ground, under everything.
        if (node === document.documentElement || node === document.body) return 0;
        const mine = { node: node, tier: stackOf(node.nodeType === 1 ? node : node.parentElement, memo).tier };
        let at = 0;
        for (const mark of marks) if (paintsBefore(mark, mine)) at++;
        return at;
      },
    };
  };
  const BLENDS = new Set(['multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity']);
  // A video from another origin would mark the picture as one the page may not read, and
  // every frame after it would be refused; one the game made itself, or fetched with CORS, is
  // drawn.
  const drawable = (video) => !video.currentSrc || video.crossOrigin !== null || Boolean(sameSite(video.currentSrc));
  const sceneOf = (session) => {
    const memo = new Map();
    const found = [];
    document.querySelectorAll('canvas,video').forEach((el) => {
      const video = el instanceof HTMLVideoElement;
      if (session.skip.has(el) || (video ? !el.videoWidth || !drawable(el) : !el.width || !el.height)) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1 || rect.right <= 0 || rect.bottom <= 0 || rect.left >= innerWidth || rect.top >= innerHeight) return;
      const style = getComputedStyle(el);
      if (style.visibility !== 'visible') return;
      // Opacity multiplies down the tree, so a fading container fades the video in it.
      let alpha = Number(style.opacity);
      for (let up = el.parentElement; up && alpha > 0.004; up = up.parentElement) alpha *= Number(getComputedStyle(up).opacity);
      if (!(alpha > 0.004)) return;
      found.push({ el: el, rect: rect, alpha: Math.min(1, alpha), tier: stackOf(el, memo).tier, fit: style.objectFit, place: style.objectPosition,
        filter: style.filter && style.filter !== 'none' && !style.filter.includes('url(') ? style.filter : 'none',
        blend: BLENDS.has(style.mixBlendMode) ? style.mixBlendMode : 'source-over' });
    });
    return found.sort((a, b) => a.tier - b.tier || (a.el.compareDocumentPosition(b.el) & FOLLOWS ? -1 : 1));
  };
  const placeOf = (value) => {
    const parts = String(value || '').split(/\s+/);
    const at = (part) => /%$/.test(part || '') ? Math.min(1, Math.max(0, Number.parseFloat(part) / 100)) : 0.5;
    return [at(parts[0]), at(parts[1] || parts[0])];
  };
  const drawMedia = (context, item, left, top, scale) => {
    const el = item.el;
    const video = el instanceof HTMLVideoElement;
    if (video && el.readyState < 2) return false;
    const sw = video ? el.videoWidth : el.width;
    const sh = video ? el.videoHeight : el.height;
    if (!sw || !sh) return false;
    const dx = left + item.rect.left * scale;
    const dy = top + item.rect.top * scale;
    const dw = item.rect.width * scale;
    const dh = item.rect.height * scale;
    context.globalAlpha = item.alpha;
    context.globalCompositeOperation = item.blend;
    context.filter = item.filter;
    try {
      if (item.fit === 'cover' || item.fit === 'contain' || item.fit === 'scale-down' || item.fit === 'none') {
        const [px, py] = placeOf(item.place);
        const contain = Math.min(dw / sw, dh / sh);
        const ratio = item.fit === 'cover' ? Math.max(dw / sw, dh / sh) : item.fit === 'none' ? scale : item.fit === 'scale-down' ? Math.min(contain, scale) : contain;
        if (item.fit === 'cover' || ratio * sw > dw || ratio * sh > dh) {
          // Larger than its box (cover, or none on a small box): the part that shows.
          const cw = Math.min(sw, dw / ratio);
          const ch = Math.min(sh, dh / ratio);
          context.drawImage(el, (sw - cw) * px, (sh - ch) * py, cw, ch, dx + (dw - cw * ratio) * px, dy + (dh - ch * ratio) * py, cw * ratio, ch * ratio);
        } else {
          context.drawImage(el, dx + (dw - sw * ratio) * px, dy + (dh - sh * ratio) * py, sw * ratio, sh * ratio);
        }
      } else {
        context.drawImage(el, dx, dy, dw, dh);
      }
    } finally {
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'source-over';
      context.filter = 'none';
    }
    return true;
  };
  // Whether the browser lets a picture holding this source leave the document.
  const readable = (source) => {
    try {
      const probe = new OffscreenCanvas(1, 1);
      probe.getContext('2d').drawImage(source, 0, 0, 1, 1);
      new VideoFrame(probe, { timestamp: 0 }).close();
      return true;
    } catch { return false; }
  };
  const releaseDom = (dom) => {
    for (const layer of dom.images) if (layer) { layer.width = 0; layer.height = 0; }
    dom.images = [];
    dom.any = false;
  };
  // Long frames, as the browser reports them, kept a minute for the check after each redraw,
  // with how much of each the game does not account for. A long-animation-frame entry names the
  // scripts that ran in it and when the browser began rendering; the game's scripts (anything
  // but an idle callback, which is where this decodes and paints) and the rendering of the
  // game's own page are the game's, and what is left of the frame is what a redraw can have
  // cost. A frame counts against a redraw only where that is most of it and at least
  // STALL_MS. Otherwise a game busy in its own code or its own layout, loading say, would
  // have its HTML refreshed in the recording once a minute. A longtask entry names nothing, so
  // all of it counts.
  const STALL_MS = 40;
  const longFrames = [];
  let longFramesWatched = false;
  const watchLongFrames = () => {
    if (longFramesWatched) return;
    longFramesWatched = true;
    try {
      const types = PerformanceObserver.supportedEntryTypes || [];
      const type = types.includes('long-animation-frame') ? 'long-animation-frame' : types.includes('longtask') ? 'longtask' : '';
      if (!type) return;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const end = entry.startTime + entry.duration;
          // Rendering runs from renderStart to the end and holds the frame's animation-frame
          // callbacks, which scripts lists too: those are counted once, as rendering.
          const rendering = entry.renderStart > 0 ? Math.max(0, end - entry.renderStart) : 0;
          const theirs = (entry.scripts || []).reduce((sum, script) => sum
            + (script.invoker === 'IdleRequestCallback' || (entry.renderStart > 0 && script.startTime >= entry.renderStart) ? 0 : script.duration), 0);
          const left = entry.duration - theirs - rendering;
          if (left >= STALL_MS && left >= entry.duration / 2) longFrames.push([entry.startTime, end]);
        }
        const kept = performance.now() - 60000;
        while (longFrames.length && longFrames[0][1] < kept) longFrames.shift();
      }).observe({ type: type });
    } catch { /* No way to tell here; every step is still sliced, and a slow paint is timed. */ }
  };
  // Windows are [from, to, slow]: slow when the step timed itself past domStepMaxMs on this thread
  // (a paint), which counts whatever the browser reports.
  const stalledDuring = (windows) => windows.some(([from, to, slow]) => slow || longFrames.some(([start, end]) => start < to && end > from));
  const refreshDom = (session) => {
    const dom = session.dom;
    const now = performance.now();
    if (dom.busy || dom.broken || session.stopped || now < dom.next) return;
    // The last redraw's decoding and painting, against the long frames reported since: by now
    // (domMinIntervalMs at least) the browser has delivered any that overlapped them. A clean
    // redraw starts the doubling again from domBackoffMs.
    if (dom.windows.length) {
      const stalled = stalledDuring(dom.windows);
      dom.windows = [];
      if (!stalled) dom.stalls = 0;
      else {
        dom.stalls++;
        // A page whose drawing has cost the game a frame domStallsMax times running is not drawn
        // again while this recording lasts: its HTML is left out of the clip, and the game keeps
        // every frame. Once a minute was still a hitch a minute.
        if (dom.stalls >= rec.domStallsMax) { dom.broken = true; releaseDom(dom); return; }
        dom.next = now + Math.min(rec.domStallMaxMs, rec.domBackoffMs * Math.pow(2, dom.stalls - 1));
        return;
      }
    }
    if (!dom.dirty && now - dom.last < rec.domRefreshMs) return;
    dom.busy = true;
    dom.dirty = false;
    const run = async () => {
      if (session.stopped) { dom.busy = false; return; }
      // Watching again from here: it stopped at the first change, so a page that changes every
      // frame costs one mutation record per walk rather than one per change.
      watchPage(session);
      watchLongFrames();
      const windows = [];
      const job = { deadline: performance.now() + rec.domDeadlineMs, sliceMs: rec.domSliceMs, sliceIdleMs: rec.domSliceIdleMs, spent: 0,
        bytes: 0, slowest: 0, cache: dom.cache, files: dom.files, pictures: dom.pictures, sizes: dom.sizes, refused: dom.refused, scale: session.scale, windows: windows,
        stop: new AbortController(), active: 0, queue: [] };
      const scene = session.scene;
      const sceneId = session.sceneId;
      const width = Math.max(1, Math.round((innerWidth || 1) * session.scale));
      const height = Math.max(1, Math.round((innerHeight || 1) * session.scale));
      let images = [];
      try {
        const pictures = await withBudget(drawPage(new Map(), innerWidth, innerHeight, job, layersFor(scene)), job);
        // Painted once, here, so each frame copies pixels rather than laying out HTML again. Onto
        // a canvas of this document's: Chrome marks an ImageBitmap made from a drawn page as
        // foreign, and keeps a canvas it is drawn on readable (the screenshot relies on it).
        // Each layer in an idle task of its own, as each was decoded.
        for (const picture of pictures) {
          if (!picture) { images.push(null); continue; }
          await idleSlice();
          if (session.stopped) break;
          if (stalledDuring(windows)) throw new Error(SLOW);
          const painted = performance.now();
          const layer = makeCanvas();
          layer.width = width;
          layer.height = height;
          layer.getContext('2d').drawImage(picture, 0, 0, width, height);
          images.push(layer);
          const paintedFor = performance.now() - painted;
          windows.push([painted, performance.now(), paintedFor > rec.domStepMaxMs]);
          job.spent += paintedFor;
          job.slowest = Math.max(job.slowest || 0, paintedFor);
          if (paintedFor > rec.domStepMaxMs) throw new Error(SLOW);
        }
        // A drawing one of whose steps held the thread for a frame or more is not repeated for
        // domBackoffMs: a page that costs a frame to draw costs the game one now and then, not one
        // every second (a thousand-element HUD decodes in about 34 ms without a GPU).
        dom.next = performance.now() + Math.max(rec.domMinIntervalMs, job.spent * rec.domCostFactor, job.slowest > rec.domStepSlowMs ? rec.domBackoffMs : 0);
      } catch (error) {
        // Over the walk's time, over budget, or refused: the HTML is left out for a while,
        // rather than a stale picture of it held over a page that has moved on. The files the
        // walk was fetching were cut off, and the caches forget an empty answer, so none of
        // them is kept as missing. A step that was slow is in windows, and the check at the
        // next look applies the wait, doubling it as it recurs.
        for (const layer of images) if (layer) { layer.width = 0; layer.height = 0; }
        images = [];
        dom.next = performance.now() + (error && error.message === SLOW ? 0 : rec.domBackoffMs);
      }
      dom.windows = windows;
      dom.busy = false;
      if (session.stopped || dom.broken) return;
      releaseDom(dom);
      dom.images = images;
      dom.sceneId = sceneId;
      dom.any = images.some(Boolean);
      dom.last = performance.now();
    };
    const idle = globalThis.requestIdleCallback;
    if (typeof idle === 'function') idle.call(globalThis, () => void run(), { timeout: 250 });
    else nativeSetTimeout.call(globalThis, () => void run(), 0);
  };
  // Any change to the page but the probe drawPage adds for itself, or a canvas or video
  // resizing (drawn fresh each frame anyway), is a reason to draw the HTML again. The watch
  // stops at the first one and starts again when the page is next drawn (refreshDom).
  const markDirty = (session) => {
    session.dom.dirty = true;
    if (session.watch) { session.watch.disconnect(); session.watch = null; }
  };
  const watchPage = (session) => {
    if (session.watch || session.stopped || typeof MutationObserver !== 'function') return;
    try {
      const watch = new MutationObserver((records) => {
        for (const record of records) {
          const target = record.target;
          if (record.type === 'attributes' && (target instanceof HTMLCanvasElement || target instanceof HTMLVideoElement)) continue;
          if (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].every((node) => probeHosts.has(node))) continue;
          if (session.watch === watch) markDirty(session);
          return;
        }
      });
      watch.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
      session.watch = watch;
    } catch { session.watch = null; }
  };
  const rescan = (session, now) => {
    const scene = sceneOf(session);
    const before = session.scene;
    if (scene.length !== before.length || scene.some((item, at) => item.el !== before[at].el || item.tier !== before[at].tier)) {
      markDirty(session);
      session.sceneId++;
    }
    if (innerWidth !== session.viewport[0] || innerHeight !== session.viewport[1]) {
      session.viewport = [innerWidth, innerHeight];
      markDirty(session);
    }
    if (!session.reshaping && session.edges && shapeChanged(session)) {
      if (!session.reshapeSince) session.reshapeSince = now;
      else if (now - session.reshapeSince >= rec.reshapeMs) void reshape(session);
    } else if (!session.reshaping) {
      session.reshapeSince = 0;
    }
    session.scene = scene;
    session.ground = groundOf();
    session.lastScan = now;
    if (!session.dom.dirty && typeof document.getAnimations === 'function') {
      try {
        if (document.getAnimations().some((animation) => animation.playState === 'running' && !(animation.effect && (animation.effect.target instanceof HTMLCanvasElement || animation.effect.target instanceof HTMLVideoElement)))) markDirty(session);
      } catch { /* No answer; the timed refresh still comes. */ }
    }
    refreshDom(session);
  };
  // THE CAPTURE RUNS AFTER THE GAME, EVERY FRAME. WebGL clears a canvas once its frame is
  // shown, so a copy taken before the game draws is the cleared buffer. Callbacks run in the
  // order they were asked for, and a game asks for its next frame at any time: inside its
  // last one, from a click, from a timer that paces it to 30 frames, from the SDK waking it.
  // So while a session runs, every requestAnimationFrame the page makes moves the pending
  // capture to the back of the queue, and the capture is always the frame's last callback.
  // Outside a session the replacement only passes the call through.
  // THE STAGE CHANGED SHAPE (23 Nov 2026). The picture's size is chosen from the stage's shape
  // when the session starts, and a stage that then went fullscreen, or a window that was
  // resized, used to be drawn inside the old shape with bars beside or above it: the first OG
  // Snipes clip recorded on the site went from 1920x852 content to 1584x852 inside bars. So once the
  // stage has held another shape for reshapeMs, the encoder is drained and set to the new size,
  // and its next picture is a keyframe carrying the new configuration. An MP4 track has one
  // size, so the page starts a new stretch there (store.ts) and no clip spans the change.
  const reshape = async (session) => {
    session.reshaping = true;
    try {
      const size = outputSize(session.edges[0], session.edges[1]);
      if (size.width === session.size.width && size.height === session.size.height) return;
      const config = Object.assign({}, session.config, { width: size.width, height: size.height });
      const answer = await VideoEncoder.isConfigSupported(config).catch(() => null);
      if (!answer || !answer.supported || session.stopped) return;
      await session.encoder.flush();
      if (session.stopped || session.encoder.state !== 'configured') return;
      session.encoder.configure(config);
      session.config = config;
      session.size = size;
      session.canvas = new OffscreenCanvas(size.width, size.height);
      session.context = session.canvas.getContext('2d', { alpha: false });
      session.lastKey = -1;
      markDirty(session);
    } catch { /* It keeps the shape it has. */ }
    finally {
      session.reshaping = false;
      session.reshapeSince = 0;
    }
  };
  const shapeChanged = (session) => {
    const size = outputSize(session.edges[0], session.edges[1]);
    return Math.abs((size.width / size.height) / (session.size.width / session.size.height) - 1) > 0.02;
  };
  const captureFrame = (session, now) => {
    if (session.stopped) return;
    queueCapture((time) => captureFrame(session, time));
    if (session.reshaping) return;
    // Paced to the session's rate on any display: a frame is due every 1000 / fps ms, so a
    // 144 Hz screen records 60 a second rather than every second refresh, 48.
    if (now < session.due - 2) return;
    const step = 1000 / session.fps;
    session.due = Math.max(session.due + step, now - step);
    const encoder = session.encoder;
    if (encoder.state !== 'configured' || encoder.encodeQueueSize > 2) return;
    // The page is looked at again every layerScanMs before the copy, and outside its timing:
    // that costs the same a second whatever the picture rate, so counting it per picture would
    // push the rate down for nothing.
    if (now - session.lastScan > rec.layerScanMs) rescan(session, now);
    const began = performance.now();
    try { copyFrame(session, now, encoder); } finally { costed(session, performance.now() - began, now); }
  };
  // THE COPY IS TIMED, AND PAID FOR IN PICTURES, NEVER IN THE GAME'S FRAMES (27 Nov 2026). Each
  // copy runs on the game's own thread, and what it costs is the browser's: measured
  // headless with an NVIDIA card and no hardware encoder, drawing World at War Zombies' canvas
  // took 2.9 ms and wrapping it for the encoder 2.4 ms, 60 times a second, half a core taken
  // from the thread that forwards the player's input; on a game that draws on that thread it
  // would be a third of every frame. So every copy times itself, and about once a second the
  // recording looks at what its copies cost the game a second. Past captureBudgetMs it records
  // fewer pictures a second, 60, 30, 20, 15 and then fpsMin, and it goes back up a step only
  // where the step up would cost under half the budget, so it does not swing. A clip of a
  // machine that copies slowly is less smooth; the game is never slower. A software encoder,
  // which takes cores of its own, starts at softwareFpsMax.
  const FPS_STEPS = [60, 30, 20, 15, 10];
  const costed = (session, spent, now) => {
    // The mean of the copies since the last look, so one slow first copy decides nothing.
    session.costSum += spent;
    session.costCount++;
    if (now - session.governed < 1000) return;
    session.governed = now;
    session.cost = session.costSum / session.costCount;
    session.costSum = 0;
    session.costCount = 0;
    const steps = [session.fpsCeiling].concat(FPS_STEPS.filter((fps) => fps < session.fpsCeiling && fps >= rec.fpsMin));
    const at = steps.indexOf(session.fps);
    if (session.cost * session.fps > rec.captureBudgetMs && at >= 0 && at < steps.length - 1) session.fps = steps[at + 1];
    else if (at > 0 && session.cost * steps[at - 1] < rec.captureBudgetMs / 2) session.fps = steps[at - 1];
  };
  const copyFrame = (session, now, encoder) => {
    const dom = session.dom;
    if (!session.scene.length && !dom.any) return;
    const { width, height } = session.size;
    const pageWidth = innerWidth || width;
    const pageHeight = innerHeight || height;
    const scale = Math.min(width / pageWidth, height / pageHeight);
    session.scale = scale;
    const left = (width - pageWidth * scale) / 2;
    const top = (height - pageHeight * scale) / 2;
    const context = session.context;
    // The HTML's layers were cut around the canvases and videos on screen when it was drawn;
    // until it is drawn again after they change, they are drawn over it, as they stand now.
    const aligned = dom.sceneId === session.sceneId;
    const drawn = [];
    try {
      context.fillStyle = session.ground;
      context.fillRect(0, 0, width, height);
      const steps = Math.max(session.scene.length, dom.images.length - 1);
      for (let at = 0; at <= steps; at++) {
        const layer = aligned || at === 0 ? dom.images[at] : null;
        if (layer) context.drawImage(layer, left, top, pageWidth * scale, pageHeight * scale);
        const item = session.scene[at];
        if (item && drawMedia(context, item, left, top, scale)) drawn.push(item.el);
      }
      if (!aligned) for (let at = 1; at < dom.images.length; at++) if (dom.images[at]) context.drawImage(dom.images[at], left, top, pageWidth * scale, pageHeight * scale);
    } catch { return; /* A canvas mid-resize: the next frame tries again. */ }
    let frame;
    const timestamp = Math.max(0, Math.round((now - session.start) * 1000));
    try {
      frame = new VideoFrame(session.canvas, { timestamp: timestamp, duration: Math.round(1e6 / session.fps) });
    } catch (error) {
      // A picture the browser will not let leave this document. Each source in it is tried
      // alone and only the ones refused are left out from now on: a game's own canvas holding
      // a sprite from a CDN without CORS is refused, while the page's layers, which Chrome
      // keeps readable, are not. The canvas, which stays marked once marked, is replaced. Past
      // a few refusals nobody can be blamed for, everything drawn is left out, so a frame is
      // never rebuilt sixty times a second for nothing.
      if (error && error.name === 'SecurityError') {
        let found = false;
        for (const el of drawn) if (!readable(el)) { session.skip.add(el); found = true; }
        if (dom.images.some((layer) => layer && !readable(layer))) { dom.broken = true; releaseDom(dom); found = true; }
        if (!found && ++session.refused > 3) {
          for (const el of drawn) session.skip.add(el);
          dom.broken = true;
          releaseDom(dom);
        }
        session.canvas = new OffscreenCanvas(width, height);
        session.context = session.canvas.getContext('2d', { alpha: false });
        session.lastScan = -Infinity;
      }
      return;
    }
    try {
      const key = session.lastKey < 0 || timestamp - session.lastKey >= rec.keyframeSeconds * 1e6;
      encoder.encode(frame, { keyFrame: key });
      if (key) session.lastKey = timestamp;
    } catch { /* The next frame tries again. */ }
    frame.close();
  };
  const stopRecord = async (session, reason) => {
    if (session.stopped) return;
    session.stopped = true;
    // Whatever the teardown meets, the recorder is let go and the page is told: one that stayed
    // held would answer every later start "busy", for as long as the page stayed open. A stop can
    // arrive mid-start, before the session has an encoder or a canvas.
    try { await teardownRecord(session); } catch { /* Let go below. */ }
    session.closed = true;
    if (recording === session) recording = null;
    tellRecord(session, { op: 'stopped', reason: reason });
  };
  const teardownRecord = async (session) => {
    if (captureTick) { nativeCancelFrame.call(globalThis, captureTick.id); captureTick = null; }
    clearInterval(session.flusher);
    clearInterval(session.audioWatch);
    try { if (session.encoder && session.encoder.state === 'configured') await session.encoder.flush(); } catch { /* Keep what arrived. */ }
    const mix = session.mix;
    untap(session);
    if (mix) {
      try { if (mix.encoder.state === 'configured') await mix.encoder.flush(); } catch { /* Keep what arrived. */ }
      try { mix.encoder.close(); } catch { /* Closed. */ }
    }
    try { if (session.encoder) session.encoder.close(); } catch { /* Closed. */ }
    if (heardPlay) heardPlay = null;
    if (heardLevel) heardLevel = null;
    if (session.watch) { session.watch.disconnect(); session.watch = null; }
    releaseDom(session.dom);
    untapMedia(session);
    flushRecord(session);
  };
  const startRecord = async (origin, data) => {
    if (recording) {
      tellRecord({ id: data.id, origin: origin }, { op: 'failed', reason: 'busy' });
      return;
    }
    const session = { id: data.id, origin: origin, stopped: false, closed: false, pending: [], mix: null, taps: new Map(),
      due: -Infinity, lastKey: -1, lastScan: -Infinity, scene: [], sceneId: 0, scale: 1, skip: new WeakSet(), ground: '#000', viewport: [0, 0], refused: 0,
      reshaping: false, reshapeSince: 0, fps: rec.fpsMax, fpsCeiling: rec.fpsMax, cost: 0, costSum: 0, costCount: 0, governed: 0,
      dom: { images: [], any: false, dirty: true, busy: false, broken: false, next: 0, last: -Infinity, sceneId: -1,
        ...pageCaches(), windows: [], stalls: 0 },
      watch: null, mediaTaps: new Map(), mediaContext: null };
    recording = session;
    // The first configuration the browser takes, and if configure refuses it after all, the
    // next one down the list, until one is configured or none is left.
    let chosen = null;
    for (;;) {
      chosen = nativeRequestFrame ? await videoConfigFor(data.compact === true) : null;
      if (!chosen || session.stopped) break;
      const config = chosen.config;
      const encoder = new VideoEncoder({
        output: (chunk, meta) => { session.encoded = true; queueChunk(session, 'v', chunk, meta); },
        // The configuration it failed at, which a reshape since may have changed (Greptile on #2438).
        error: () => { encoderFailed(session.config || config, session.encoded === true); void stopRecord(session, 'failed'); },
      });
      try { encoder.configure(config); session.encoder = encoder; break; }
      catch { encoderFailed(config, false); try { encoder.close(); } catch { /* Closed. */ } }
    }
    if (!chosen || session.stopped) {
      // A stop that came in while the encoder was being made: the hardware session goes too.
      try { if (session.encoder) session.encoder.close(); } catch { /* Closed. */ }
      if (recording === session) recording = null;
      if (!session.stopped) tellRecord(session, { op: 'failed', reason: 'unsupported' });
      return;
    }
    session.size = { width: chosen.config.width, height: chosen.config.height };
    session.config = chosen.config;
    session.fpsCeiling = chosen.config.framerate;
    session.fps = session.fpsCeiling;
    session.edges = chosen.edges;
    session.canvas = new OffscreenCanvas(session.size.width, session.size.height);
    session.context = session.canvas.getContext('2d', { alpha: false });
    session.start = performance.now();
    session.governed = session.start;
    tellRecord(session, { op: 'started', width: session.size.width, height: session.size.height, fps: session.fps,
      codec: chosen.config.codec, hardware: chosen.hardware });
    session.flusher = setInterval(() => flushRecord(session), rec.flushMs);
    watchPage(session);
    // A game that makes its sound only after the first press has no context yet, and one may
    // make another later; look again every second.
    session.audioWatch = setInterval(() => tapAudio(session), 1000);
    heardPlay = (element) => tapElement(session, element);
    heardLevel = (element) => levelTap(session, element);
    tapAudio(session);
    queueCapture((time) => captureFrame(session, time));
  };
  // Registered near the top (recordingLeft), ahead of the receiver's other pagehide work.
  function recordingLeft() { if (recording) void stopRecord(recording, 'left'); }

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
      hideShell();
      reportDocument();
      reportProgress();
      return;
    }
    if (data.type === 'capture') {
      if (typeof data.id === 'string' && shotId.test(data.id)) takeShot(event.origin, data.id);
      return;
    }
    if (data.type === 'record') {
      if (typeof data.id !== 'string' || !recordId.test(data.id)) return;
      if (data.op === 'start') void startRecord(event.origin, data);
      else if (data.op === 'stop' && recording && recording.id === data.id) void stopRecord(recording, 'asked');
      // A save asks for what is waiting first, so a replay ends on the frame that was on
      // screen when the player pressed, not up to flushMs before it.
      else if (data.op === 'flush' && recording && recording.id === data.id) void drainRecord(recording);
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
    .replaceAll("__OG_PROGRESS_INTERVAL__", () => String(limits.play.frameProgress.reportIntervalMs))
    .replaceAll("__OG_PROGRESS_HEARTBEAT__", () => String(limits.play.frameProgress.heartbeatMs))
    .replace("__OG_GAMEPAD_INTERVAL__", () => String(limits.analytics.runtime.inputIntervalMs))
    .replace("__OG_GAMEPAD_DEADZONE__", () => String(limits.analytics.runtime.gamepadDeadzone))
    .replace("__OG_CAPTURE__", () => capture)
    .replace("__OG_RECORDING__", () => JSON.stringify(RECORDING))
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
