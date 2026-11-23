/**
 * brush-stroke-shader-style: the lettered HUD.
 *
 * The HUD is never painted by the stroke pass. It is drawn in the same hand instead:
 * strips of torn paper tape, brush lettering, ink, paper and one accent colour. It sits
 * in the DOM above the canvas, so it stays sharp at any resolution and a screen reader
 * can still read it.
 *
 *   import { installBrushHud, tape, word } from "./brush-hud.js";
 *   installBrushHud({ font: "'Permanent Marker', 'Comic Sans MS', cursive" });
 *   hudRoot.append(tape("WOLF PINE FOREST"), tape("PLAY NOW", { tone: "accent" }));
 *   word("POW", { at: [x, y], parent: hudRoot });   // a written sound where a blow landed
 *
 * No font is shipped. Pick a brush face you may host (Permanent Marker, Caveat Brush,
 * Knewave and Kalam are open licences), serve it from the game's own files and name
 * it in installBrushHud.
 */

const CSS = /* css */ `
.brush-hud { --brush-paper: #efe6d6; --brush-ink: #22203a; --brush-accent: #e02a33; --brush-font: 'Permanent Marker', 'Comic Sans MS', cursive; }
/* The strip is a layer UNDER the lettering: the torn outline and the dry edge are on the
   paper, and the text is left exactly as the font draws it. Roughening the element
   itself bends numerals until a clock or a score is hard to read. */
.brush-tape {
  display: inline-block; box-sizing: border-box; position: relative; isolation: isolate;
  padding: 0.28em 1.1em 0.22em; font: 400 1em/1.05 var(--brush-font); letter-spacing: 0.035em; text-transform: uppercase; white-space: nowrap;
  color: var(--brush-ink);
  transform: rotate(var(--brush-tilt, -1.2deg)); transform-origin: 50% 60%;
  user-select: none;
}
.brush-tape::before {
  content: ""; position: absolute; inset: 0; z-index: -1;
  background: var(--brush-strip, var(--brush-paper));
  clip-path: var(--brush-torn, none);
  filter: url(#brush-dry);
}
.brush-tape--ink { color: var(--brush-paper); --brush-strip: var(--brush-ink); }
.brush-tape--accent { color: var(--brush-paper); --brush-strip: var(--brush-accent); }
.brush-tape--bare::before { display: none; }
.brush-tape--bare { padding-left: 0; padding-right: 0; }
.brush-word {
  position: absolute; pointer-events: none; white-space: nowrap;
  font: 400 1em/1 var(--brush-font); letter-spacing: 0.02em; text-transform: uppercase;
  color: var(--brush-ink); -webkit-text-stroke: 0.14em var(--brush-paper); paint-order: stroke fill;
  transform: translate(-50%, -50%) rotate(var(--brush-tilt, -6deg)) scale(var(--brush-scale, 1));
}
.brush-meter { display: inline-block; position: relative; height: 0.7em; background: var(--brush-ink); filter: url(#brush-dry); }
.brush-meter > i { position: absolute; inset: 0.14em; right: auto; background: var(--brush-accent); }
@media (prefers-reduced-motion: reduce) { .brush-word { transition: none !important; } }
`;

// A displacement so small it only roughens edges: the dry edge of a loaded brush.
const FILTER = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="brush-dry" x="-5%" y="-20%" width="110%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.035 0.6" numOctaves="2" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G"/></filter></svg>`;

let installed = false;

/**
 * Adds the styles and the edge filter once. Give the element that holds the HUD the
 * class "brush-hud" (or pass it as root and it is added).
 * @param { { root?: HTMLElement, font?: string, paper?: string, ink?: string, accent?: string } } [options]
 */
export function installBrushHud(options = {}) {
  if (!installed) {
    const style = document.createElement("style");
    style.setAttribute("data-brush-hud", "");
    style.textContent = CSS;
    document.head.append(style);
    document.body.insertAdjacentHTML("beforeend", FILTER);
    installed = true;
  }
  const root = options.root ?? document.documentElement;
  root.classList.add("brush-hud");
  if (options.font) root.style.setProperty("--brush-font", options.font);
  if (options.paper) root.style.setProperty("--brush-paper", options.paper);
  if (options.ink) root.style.setProperty("--brush-ink", options.ink);
  if (options.accent) root.style.setProperty("--brush-accent", options.accent);
  return root;
}

function seeded(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
function hashText(text) { let h = 7; for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) >>> 0; return h; }

/** The outline of a torn strip: straight long sides that wander a hair, ragged short ends. */
export function tornEdge(seed, teeth = 5) {
  const r = seeded(seed);
  const points = [];
  const top = 6, bottom = 94;
  for (let i = 0; i <= 6; i++) points.push([3 + (94 * i) / 6, top - 5 * r() * (i % 6 === 0 ? 0 : 1)]);
  for (let i = 1; i < teeth; i++) points.push([100 - 3.2 * r() - (i % 2) * 1.6, top + ((bottom - top) * i) / teeth]);
  for (let i = 6; i >= 0; i--) points.push([3 + (94 * i) / 6, bottom + 5 * r() * (i % 6 === 0 ? 0 : 1)]);
  for (let i = teeth - 1; i >= 1; i--) points.push([3.2 * r() + (i % 2) * 1.6, top + ((bottom - top) * i) / teeth]);
  return `polygon(${points.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(", ")})`;
}

/**
 * A strip of tape with lettering on it. tone: "paper" (ink on paper), "ink" (paper on
 * ink), "accent" (paper on the accent colour, for the one thing to press) or "bare"
 * (lettering alone). Every strip is torn its own way, the same way each time for the
 * same text.
 * @param {string} text
 * @param { { tone?: "paper" | "ink" | "accent" | "bare", tilt?: number, seed?: number, tag?: string } } [options]
 */
export function tape(text, options = {}) {
  const el = document.createElement(options.tag ?? "span");
  const seed = options.seed ?? hashText(text);
  const tone = options.tone ?? "paper";
  el.className = `brush-tape${tone === "paper" ? "" : ` brush-tape--${tone}`}`;
  el.textContent = text;
  const r = seeded(seed + 11);
  el.style.setProperty("--brush-tilt", `${(options.tilt ?? (r() - 0.5) * 3.2).toFixed(2)}deg`);
  if (tone !== "bare") el.style.setProperty("--brush-torn", tornEdge(seed));
  return el;
}

/**
 * A written sound: a word lettered where something landed. It arrives at full size on
 * one frame, is redrawn twice a little differently (drawn on threes, never tweened),
 * then is gone. Returns the element; it removes itself.
 * @param {string} text
 * @param { { at: [number, number], parent?: HTMLElement, size?: number, life?: number, colour?: string, seed?: number } } options
 *        at: pixels from the parent's top left. size: em. life: seconds.
 */
export function word(text, options) {
  const parent = options.parent ?? document.body;
  const el = document.createElement("span");
  el.className = "brush-word";
  el.textContent = text;
  el.setAttribute("aria-hidden", "true");
  const r = seeded(options.seed ?? hashText(text) + Math.floor(performance.now()));
  el.style.left = `${options.at[0]}px`; el.style.top = `${options.at[1]}px`;
  el.style.fontSize = `${options.size ?? 2.4}em`;
  if (options.colour) el.style.color = options.colour;
  const tilt = (r() - 0.5) * 22;
  const life = (options.life ?? 0.45) * 1000;
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Three drawings: struck large, settled, held. Each is a whole new drawing.
  const drawings = reduced ? [[1, tilt]] : [[1.28, tilt - 3], [0.96, tilt + 2], [1, tilt]];
  let i = 0;
  const draw = () => { el.style.setProperty("--brush-scale", String(drawings[i][0])); el.style.setProperty("--brush-tilt", `${drawings[i][1].toFixed(1)}deg`); };
  draw();
  parent.append(el);
  const step = setInterval(() => { if (++i >= drawings.length) clearInterval(step); else draw(); }, 50);
  setTimeout(() => { clearInterval(step); el.remove(); }, life);
  return el;
}

/** A filled bar in ink with the accent inside it. value 0 to 1. */
export function meter(value, widthEm = 8) {
  const el = document.createElement("span");
  el.className = "brush-meter";
  el.style.width = `${widthEm}em`;
  el.setAttribute("role", "meter");
  el.setAttribute("aria-valuenow", String(Math.round(value * 100)));
  const fill = document.createElement("i");
  el.append(fill);
  el.set = (v) => { fill.style.width = `calc(${Math.max(0, Math.min(1, v)) * 100}% - 0.28em)`; el.setAttribute("aria-valuenow", String(Math.round(v * 100))); };
  el.set(value);
  return el;
}

/**
 * Plants the fault a torn edge must not have: a point outside its own box, which the
 * browser clips to nothing on one side and leaves a straight machine edge.
 */
export function selfTest() {
  const failures = [];
  let examined = 0;
  const inside = (edge) => [...edge.matchAll(/(-?[\d.]+)% (-?[\d.]+)%/g)].every(([, x, y]) => x >= 0 && x <= 100 && y >= 0 && y <= 100);
  for (let seed = 1; seed <= 200; seed++) {
    const edge = tornEdge(seed);
    examined++;
    if (!inside(edge)) { failures.push(`seed ${seed} tears outside its box`); break; }
    if (tornEdge(seed) !== edge) { failures.push(`seed ${seed} tears differently each time`); break; }
  }
  if (tornEdge(3) === tornEdge(4)) failures.push("two strips were torn alike");
  if (inside("polygon(-2% 5%, 50% 104%)")) failures.push("the planted out-of-box edge was not caught");
  return { ok: failures.length === 0, examined, failures };
}
