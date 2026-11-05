import { LIMITS } from "@opengame/shared";
import type { Finding, PreflightFile } from "./index";
import { detectedIds, godotPackOrder, godotPckVersion, type EngineReport, type EngineSource } from "./engines";
import { parseScript, type ScriptNode } from "./script-source";
import { parse as parseHtml, type DefaultTreeAdapterTypes } from "parse5";
import { engineArchive, engineArchiveMembers, engineArchiveShape } from "./names";
import { zipMemberNames } from "./raw-runtime";

/** Only runtime delivery URLs, not an engine's homepage or an arbitrary CDN file. */
export function engineRuntimeUrl(value: string): boolean {
  let url: URL;
  try { url = new URL(value.startsWith("//") ? `https:${value}` : value); } catch { return false; }
  const path = url.pathname.toLowerCase();
  if (url.hostname === "www.gstatic.com" || url.hostname === "gstatic.com") return /\/flutter-canvaskit\//.test(path);
  if (url.hostname === "js-dos.com" || url.hostname.endsWith(".js-dos.com")) return /\.(?:js|wasm)$/.test(path);
  if (!["cdn.jsdelivr.net", "unpkg.com"].includes(url.hostname)) return false;
  return /\/(?:npm\/)?(?:js-dos|@ruffle-rs\/ruffle|ruffle-mirror|pyodide|wasmoon)(?:@|\/)/.test(path)
    || /\/pyodide\/v[^/]+\/full\//.test(path);
}

function callName(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const node = value as ScriptNode;
  if (node.type === "Identifier") return String(node.name);
  if (node.type === "ChainExpression") return callName(node.expression);
  if (node.type !== "MemberExpression") return "";
  const property = node.property as ScriptNode;
  const name = node.computed ? property?.value : property?.name;
  return typeof name === "string" ? `${callName(node.object)}.${name}` : "";
}

function calls(text: string): Set<string> {
  const found = new Set<string>();
  const root = parseScript(text);
  if (!root) return found;
  // Each node carries whether it sits inside `if (<x>.config.serviceWorker ...)`.
  const pending: [ScriptNode, boolean][] = [[root, false]];
  while (pending.length) {
    const [node, guarded] = pending.pop()!;
    if (node.type === "CallExpression") {
      const name = callName(node.callee);
      /* Godot's loader carries `navigator.serviceWorker.register(this.config.serviceWorker)`
         (4.x, in installServiceWorker) and `register(me.config.serviceWorker)` (3.x, after
         callMain), each inside `if (<x>.config.serviceWorker && ...)`. Only that exact
         shape is set aside here; a register call anywhere else, with any argument, keeps
         its ordinary name. engineFindings decides what the guarded one means. */
      const argument = (node.arguments as ScriptNode[] | undefined)?.[0];
      found.add(guarded && SW_REGISTER.test(name) && CONFIG_SW.test(callName(argument)) ? CONFIG_SW_REGISTER : name);
    }
    const guards = node.type === "IfStatement" && mentions(node.test as ScriptNode, CONFIG_SW);
    for (const [key, value] of Object.entries(node)) {
      const inner = guarded || (guards && key === "consequent");
      if (Array.isArray(value)) pending.push(...value.filter((v): v is ScriptNode => Boolean(v && typeof v === "object" && "type" in v)).map((v): [ScriptNode, boolean] => [v, inner]));
      else if (value && typeof value === "object" && "type" in value) pending.push([value as ScriptNode, inner]);
    }
  }
  return found;
}

/** Whether any member expression under `node` reads as `pattern`. */
function mentions(node: ScriptNode | undefined, pattern: RegExp): boolean {
  const pending = node ? [node] : [];
  while (pending.length) {
    const next = pending.pop()!;
    if (next.type === "MemberExpression" && pattern.test(callName(next))) return true;
    for (const value of Object.values(next)) {
      if (Array.isArray(value)) pending.push(...value.filter((v): v is ScriptNode => Boolean(v && typeof v === "object" && "type" in v)));
      else if (value && typeof value === "object" && "type" in value) pending.push(value as ScriptNode);
    }
  }
  return false;
}

const SW_REGISTER = /^(?:(?:window|globalThis|self)\.)?navigator\.serviceWorker\.register$/;
const CONFIG_SW = /(?:^|\.)config\.serviceWorker$/;
const CONFIG_SW_REGISTER = "navigator.serviceWorker.register(config.serviceWorker)";

/* Where a bundle gives `serviceWorker` a value. Godot itself writes two, both empty or
   copied: the EngineConfig default `serviceWorker: ''` and
   `this.serviceWorker = parse('serviceWorker', this.serviceWorker)`. Anything else, a PWA
   export's `"serviceWorker":"index.service.worker.js"` or a game's own
   `{...GODOT_CONFIG, serviceWorker: "x.js"}`, arms Godot's guarded register with a worker
   of any name. A key assembled at runtime from pieces is not visible to this, which is
   why it is advice: the games origin refuses service-worker scripts either way. */
function namedWorker(sources: EngineSource[]): string | undefined {
  for (const source of sources) {
    for (const match of source.text.matchAll(/\bserviceWorker\b\s*["']?\s*\]?\s*(?::|=(?!=))/g)) {
      const rest = source.text.slice(match.index, match.index + 80);
      if (/^serviceWorker["']?\s*:\s*(["'])\1/.test(rest)) continue;
      if (/^serviceWorker\s*=\s*parse\(\s*["']serviceWorker["']\s*,\s*this\.serviceWorker\s*\)/.test(rest)) continue;
      return source.path;
    }
  }
  return undefined;
}

/** Observe explicit thread use, not a SharedArrayBuffer feature-detection check.

   Two shapes were added on 27 Oct 2026, both measured rather than imagined. Emscripten
   writes the memory descriptor with QUOTED keys, `"shared": true`, so Closure cannot rename
   them; the unquoted pattern alone missed the real moderngekko.js glue (marcol-og), which
   was caught only because it also kept the names `PThread` and `ENVIRONMENT_IS_PTHREAD`. A
   build through Closure is free to rename both, and what survives is the quoted key and
   the worker's name, `"em-pthread"`, which recent emscripten gives each pthread worker it
   spawns and nothing else (both real glues here pass it to `new Worker`). `typeof
   SharedArrayBuffer` and `crossOriginIsolated` are still not evidence: three.js, Godot's
   no-threads loader and every capability probe ask them. The module itself is the
   stronger witness, and index.ts reads its memory flags beside this. */
export function sourceUsesThreads(text: string): boolean {
  return /\bGODOT_THREADS_ENABLED\s*=\s*(?:true|!0)\b/.test(text)
    || /\b(?:pthreadPoolSize|pthread_pool_size)\s*[:=]\s*[1-9]\d*/.test(text)
    || (/\bPThread\b/.test(text) && /\bENVIRONMENT_IS_PTHREAD\b/.test(text))
    || /\bnew\s+(?:window\.|globalThis\.)?SharedArrayBuffer\s*\(/.test(text)
    || /\bnew\s+WebAssembly\.Memory\s*\(\s*\{[^}]*\bshared["']?\s*:\s*(?:true|!0)\b/.test(text)
    || /["'`]em-pthread\b/.test(text);
}

/* NO PIXIJS EVAL WARNING ANY MORE, AND THERE WAS ONE. PixiJS 8 compiles its uniform and
   shader upload code with `new Function` and throws "Current environment does not allow
   unsafe-eval" in its renderer's constructor when the page forbids it, so the starter as
   shipped on 22 Oct 2026 drew nothing under 2026-11 while every static check passed it.
   `pixijs-unsafe-eval` warned about a PixiJS 8 build without `pixi.js/unsafe-eval`.

   New uploads are published under 2027-03, which grants 'unsafe-eval', and a threaded one
   moves to 2027-04, which does too (limits.json threadedMoves). So the guard passes on
   every contract an upload can now reach, the warning described a failure that cannot
   happen, and it went (26 Oct 2026). The polyfill is harmless where a starter still
   carries it. */

/** Source hints travel with the upload; only the runtime probe settles compatibility.
 * `sharedModules` are the .wasm files whose memory is shared (wasm-module.ts), so a build
 * whose glue says nothing readable about threads still gets the one threads note, and the
 * note and the receipt's `threaded` cannot disagree. */
export function engineFindings(paths: string[], sources: EngineSource[], report: EngineReport, sharedModules: string[] = []): Finding[] {
  const ids = detectedIds(report), findings: Finding[] = [];
  const hit = (pattern: RegExp) => sources.find(source => pattern.test(source.text));
  const add = (code: string, severity: Finding["severity"], title: string, detail: string, path?: string) =>
    findings.push({ code, severity, title, detail, ...(path ? { path } : {}) });
  const threaded = sources.find(source => sourceUsesThreads(source.text)) ?? (sharedModules.length ? { path: sharedModules[0]! } : undefined);
  /* One message for every engine. A threaded export is moved at seal onto the isolated
     contract (limits.json runtimeContracts.threadedMoves: 2027-03, where new uploads are
     published, moves to 2027-04, the same plus cross-origin isolation) because the scan
     receipt reports `threaded`, so the creator has
     nothing to choose or change. This said "the current game contract is not cross-origin
     isolated" and told Godot creators to export again without threads, both true only
     until that contract existed (23 Oct 2026). */
  if (threaded) add("engine-threads", "note", "This export uses WebAssembly threads.",
    "A threaded export runs on an isolated contract that OpenGame selects when it scans the upload. Nothing to change in the build. The playtest still checks that it starts.", threaded.path);
  let manifest: unknown;
  try { manifest = JSON.parse(sources.find(source => source.path === "opengame.json")?.text ?? "null"); } catch { /* Other checks report malformed manifests. */ }
  const renderer = (manifest as { requires?: { renderer?: string } } | null)?.requires?.renderer;
  // Bundled renderers carry adapter probes for optional backends. Their mere
  // presence does not mean the export selected that backend.
  // Defold's dmloader.js probes for a WebGPU adapter on every build (probeWebGPUSupport) and
  // renders with WebGL unless the project was built for WebGPU (defold-pinball, 25 Oct 2026).
  const optionalBackend = (["pixijs", "babylonjs", "threejs", "playcanvas", "defold"] as const).some(id => ids.has(id));
  const webgpu = (ids.has("kaigen") ? sources.find(source => /\bcreateGame\s*\(/.test(source.text)) : undefined)
    ?? hit(/\brenderer\s*[:=]\s*["']webgpu["']|\bnew\s+(?:BABYLON\.)?WebGPUEngine\s*\(|\bnew\s+WebGPURenderer\s*\(/)
    ?? (optionalBackend ? undefined : hit(/\bnavigator\.gpu\s*\.\s*requestAdapter\s*\(/));
  if (webgpu && renderer !== "webgpu") add("engine-webgpu-undeclared", "warning", "This export contains a WebGPU renderer.",
    'If WebGPU is required, add "requires": { "renderer": "webgpu" } to opengame.json so players without it get a clear message.', webgpu.path);
  // Each call name, with the first file it appears in.
  const scriptCalls = new Map<string, string>();
  for (const source of sources) {
    if (/\.html?$/i.test(source.path)) {
      const pending: DefaultTreeAdapterTypes.Node[] = [parseHtml(source.text)];
      while (pending.length) {
        const node = pending.pop()!;
        if ("childNodes" in node) pending.push(...node.childNodes);
        if ("tagName" in node && node.tagName === "script" && "childNodes" in node) {
          const text = node.childNodes.filter(child => "value" in child).map(child => "value" in child ? child.value : "").join("");
          for (const call of calls(text)) if (!scriptCalls.has(call)) scriptCalls.set(call, source.path);
        }
      }
    } else if (/\.[cm]?js(?:\.(?:br|gz|unityweb))?$/i.test(source.path)) {
      for (const call of calls(source.text)) if (!scriptCalls.has(call)) scriptCalls.set(call, source.path);
    }
  }
  /* A worker counts when one ships or when something registers one, whatever its file is
     called. Godot's own guarded register(config.serviceWorker) is set aside only in a
     Godot export whose config never names a worker; once something does, that register
     call is a registration like any other, and the notice points at whatever named it. */
  const register = [...scriptCalls].find(([call]) => SW_REGISTER.test(call))?.[1];
  const guarded = scriptCalls.get(CONFIG_SW_REGISTER);
  const armed = guarded === undefined ? undefined : !ids.has("godot") ? guarded : namedWorker(sources);
  const serviceWorker = paths.find(path => /(?:^|\/)(?:sw\.js|service-worker\.js|[^/]+\.service\.worker\.js)$/.test(path)) ?? register ?? armed;
  if (serviceWorker) add("engine-service-worker", "note", "This export includes a service worker.",
    "Game origins refuse service-worker scripts. Disable offline or PWA export features and verify the game starts without its install step.", serviceWorker);
  if ([...scriptCalls.keys()].some(call => /^(?:(?:window|globalThis)\.)?(?:alert|confirm|prompt)$/.test(call))) add("engine-modal-dialog", "note",
    "This export calls a browser modal dialog.", "The game frame does not allow modal dialogs. Replace alert, confirm, prompt or GameMaker show_message with an in-game panel.");
  if (ids.has("unity")) {
    const fallback = paths.find(path => /\.unityweb$/i.test(path));
    if (fallback) add("unity-decompression-fallback", "note", "This Unity export uses Decompression Fallback.",
      "The fallback loader decompresses files in JavaScript. On OpenGame a native Brotli or gzip export loads without it, because the games origin serves .br and .gz files with Content-Encoding.", fallback);
    const development = hit(/\[Development Build\]|\b(?:developmentBuild|DEVELOPMENT_BUILD)\s*[:=]\s*(?:true|1|!0)\b/);
    if (development) add("unity-development-build", "warning", "This is a Unity development build.", "Export a release build to reduce download size and runtime overhead.", development.path);
  }
  /* GDExtension is identified, and no longer refused. A Godot 4 web export with extension
     support loads each library through Emscripten's dynamic linker, which builds its glue
     with eval (`ASM_CONSTS[start]=eval(func)`, `moduleExports[name]=eval(func)`, measured
     in a public 4.x export on 23 Oct 2026). Until 26 Oct 2026 no contract an upload could
     reach granted 'unsafe-eval', so this was a blocker: the export passed every check and
     then failed to start. 2027-03 and 2027-04 grant it, so the finding is now a note that
     tells a reviewer why the build uses eval, and the playtest is what says it starts.
     Three signals, any one enough in an export detected as Godot: the side module or
     extension list in the tree, a non-empty `gdextensionLibs` in GODOT_CONFIG, or the
     linker's eval in its glue. Ordinary Godot exports carry `"gdextensionLibs":[]` and
     none of the eval. */
  // All three only in a Godot export: a side module or a linker pattern in some other
  // Emscripten game is that game's business, not this finding's.
  const gdextension = !ids.has("godot") ? undefined
    : paths.find(path => /(?:\.side\.wasm|\.gdextension|(?:^|\/)extension_list\.cfg)$/i.test(path))
      ?? hit(/["']?\bgdextensionLibs["']?\s*:\s*\[\s*["'`]/)?.path
      ?? hit(/\b(?:ASM_CONSTS\[start\]|moduleExports\[name\])\s*=\s*eval\(/)?.path;
  if (gdextension) add("godot-gdextension-unsupported", "note", "This Godot export uses GDExtension.",
    "Its libraries are linked in the browser with eval(), which OpenGame allows. Nothing has to change. The playtest checks that the game starts.", gdextension);
  /* Ren'Py's web build reaches JavaScript through Emscripten's run_script family, which
     renpy.js implements as `eval(UTF8ToString(ptr))`, and it calls that during boot
     (renpy/main.py, emscripten.run_script_int). Until 26 Oct 2026 no contract an upload
     could reach granted 'unsafe-eval', so the page stopped on Ren'Py's loader with an
     EvalError (measured with the 8.3.7 SDK's web export under the live headers on 23 Oct
     2026) and this was a blocker on detection. 2027-03 and 2027-04 grant eval, so it is a
     note now, and the playtest is what says the game starts.

     THE BLOCKER ALSO HELD A SECOND DOOR, AND IT IS HELD ELSEWHERE NOW. Being read as Ren'Py
     is what admits its game.zip as an engine archive rather than a nested one, and while
     every Ren'Py detection was refused, a forged signature beside an arbitrary zip got
     nowhere. Downgrading this would have reopened that, except that
     engineArchiveShapeFindings (24 Oct 2026) now refuses a game.zip without a Ren'Py
     script under game/, here and in the archive stage, and the stage decodes and scans
     every member of whatever it admits. That check, not this note, is what stands between
     a copied signature and an uninspected archive.

     The registry's signature still matches only older renpyweb runtimes, not 8.3.7, whose
     export is refused as a nested archive instead. A wider signature was tried and taken
     out in review: the legacy pipeline path (stage.py, platform=False) admits engine
     archives without running this preflight, so widening detection widened admission. */
  if (ids.has("renpy")) add("renpy-needs-eval", "note", "This Ren'Py web export runs JavaScript through eval().",
    "OpenGame allows eval(), so nothing has to change. The playtest checks that the game starts.",
    hit(/\b_emscripten_run_script/)?.path);
  if (ids.has("godot")) {
    const pwa = paths.find(path => /\.service\.worker\.js$/i.test(path)) ?? hit(/\bserviceWorker\s*["']?\s*:\s*(?:true|["'][^"']+\.js["'])/)?.path;
    if (pwa) add("godot-pwa", "warning", "This Godot export enables Progressive Web App support.",
      "Turn off Progressive Web App in the export preset. Game origins refuse service workers, and the PWA install step can prevent the game from starting.", pwa);
  }
  if (ids.has("cocos")) {
    const desktop = paths.find(path => /(?:^|\/)web-desktop\//i.test(path)) ?? hit(/#GameDiv\s*\{[^}]*\b(?:width|height)\s*:\s*\d+px/i)?.path;
    if (desktop) add("cocos-web-desktop", "warning", "This Cocos export uses a desktop-sized container.",
      "Export Web Mobile or make the canvas container resize to the game frame, then test desktop and phone sizes.", desktop);
  }
  if ((["dotnet", "kni", "monogame"] as const).some(id => ids.has(id))) {
    const base = hit(/<base\b[^>]*\bhref\s*=\s*["'](?:\/|https?:\/\/)/i);
    if (base) add("dotnet-base-href", "warning", "This .NET export uses an absolute base URL.",
      'Use <base href="./"> so the same bundle loads from its preview and published location.', base.path);
  }
  return findings;
}

/** Version a detected Godot export from its .pck header (engines.ts, godotPckVersion),
 * trying packs in godotPackOrder until one parses. Only the adapter's ranged `head` is
 * used: a pack can be hundreds of megabytes and twenty bytes answer the question, so an
 * adapter without one gets no version rather than a whole-file read. Advisory: a failed
 * read leaves the version null and changes nothing else. */
export async function withGodotPckVersion(report: EngineReport, files: PreflightFile[], sources: EngineSource[]): Promise<EngineReport> {
  const godot = report.id === "godot" ? report : report.also.find(engine => engine.id === "godot");
  if (!godot || godot.version) return report;
  for (const path of godotPackOrder(files.map(file => file.path), sources)) {
    const pack = files.find(file => file.path === path);
    if (!pack?.head) continue;
    let version: string | null = null;
    try { version = godotPckVersion((await pack.head(20)).subarray(0, 20)); } catch { /* advisory */ }
    if (!version) continue;
    const evidence = `${godot.evidence}; version from the ${path} header`;
    return report.id === "godot" ? { ...report, version, evidence }
      : { ...report, also: report.also.map(engine => engine.id === "godot" ? { ...engine, version, evidence } : engine) };
  }
  return report;
}

/** Header inspection uses an adapter's bounded read where available, otherwise its
 * existing binary reader. GDPC v2 puts directory encryption at bit zero of byte 20, and
 * v3 (Godot 4.4 on) and v4 (Godot 4.7) keep the flags there. This read v2 only until
 * 22 Oct 2026, so an encrypted pack from any current Godot came back with no finding, and
 * v3 only until 5 Nov 2026, the same mistake one format later. */
export async function encryptedPckFindings(files: PreflightFile[]): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const file of files) {
    if (!/\.pck$/i.test(file.path) || (!file.head && !file.bytes)) continue;
    let bytes: Uint8Array;
    try { bytes = file.head ? await file.head(24) : (await file.bytes!()).subarray(0, 24); } catch { continue; }
    if (bytes.length < 24 || bytes[0] !== 0x47 || bytes[1] !== 0x44 || bytes[2] !== 0x50 || bytes[3] !== 0x43) continue;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if ([2, 3, 4].includes(view.getUint32(4, true)) && (view.getUint32(20, true) & 1)) findings.push({ code: "godot-pck-encrypted", severity: "warning",
      title: "This Godot pack is encrypted, so OpenGame can't scan it.", path: file.path,
      detail: "Export it without encryption. OpenGame does not accept an encrypted pack when you deploy (engine_archive_encrypted)." });
  }
  return findings;
}

/** names.py engine_archive_shape, run where the bytes are. nameFindings admits a
 * game.love or game.zip on the detected engine alone, and detection is a signature
 * any file can copy: one line of love.js beside a renamed zip was enough on 24 Oct
 * 2026. So an archive admitted that way must also hold what its engine's own loader
 * looks for, read from its central directory. The archive stage applies the same rule
 * to every upload, including the jam and Studio uploads that never run this check, and
 * it alone holds a love.js .data to it: this check does not read packager tables, so a
 * .data that is really a game.love is the stage's to refuse. An archive whose directory
 * cannot be read is refused here too, as the stage would refuse it. This is a shape
 * check, not an honesty check: an empty main.lua passes it, and the stage still decodes
 * and scans every member of whatever it admits. */
export async function engineArchiveShapeFindings(files: PreflightFile[], engineIds: Iterable<string>): Promise<Finding[]> {
  const ids = [...engineIds], findings: Finding[] = [];
  for (const file of files) {
    const suffix = engineArchive(file.path, ids), rule = suffix ? engineArchiveMembers(suffix) : null;
    if (!suffix || !rule) continue;
    let names: string[] | null = null;
    try { names = file.bytes ? zipMemberNames(await file.bytes()) : null; } catch { names = null; }
    if (names && engineArchiveShape(suffix, names)) continue;
    findings.push({ code: "engine-archive-structure", severity: "blocker", path: file.path,
      title: names ? `${file.path} has an engine archive's name but not ${rule.requirement}.`
        : `${file.path} has an engine archive's name but its file list could not be read.`,
      detail: "OpenGame accepts an archive inside a game only when it is one the engine itself loads. Unpack this one into the folder, or upload the archive your engine exported." });
  }
  return findings;
}
