import { LIMITS, formatBytes } from "@opengame/shared";
import type { Finding, PreflightFile } from "./index";
import { detectedIds, godotPackOrder, godotPckVersion, type EngineReport, type EngineSource } from "./engines";
import { parseScript, type ScriptNode } from "./script-source";
import { parse as parseHtml, type DefaultTreeAdapterTypes } from "parse5";
import { compressedBrowserAsset, engineArchive, engineArchiveMembers, engineArchiveShape } from "./names";
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
  const pending: ScriptNode[] = [root];
  while (pending.length) {
    const node = pending.pop()!;
    if (node.type === "CallExpression") found.add(callName(node.callee));
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) pending.push(...value.filter((v): v is ScriptNode => Boolean(v && typeof v === "object" && "type" in v)));
      else if (value && typeof value === "object" && "type" in value) pending.push(value as ScriptNode);
    }
  }
  return found;
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
  /* No finding for a service worker, a PWA export or a register() call since 17 Nov 2026:
     a game may keep a worker on its own address, and og-games hosts it under rules of its
     own (infra/worker/src/service-worker.ts). Until then a shipped sw.js, a register() call
     and a Godot PWA export were each a note or a warning saying the worker would be refused. */
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

/* WHAT A PLAYER DOWNLOADS BEFORE THE ENGINE CAN START, IN SECONDS. Added on 17 Nov 2026, after
   an Unreal preview took a minute and a half to load, with a goal of a few seconds end to end
   for every game. size-warn says how big the whole build is; this says how long the part every play waits for
   takes on a 50 Mbps line, because that is the number a creator can act on and the one a player
   feels. The files are the ones an engine fetches whole before its first frame: its .wasm
   modules, Unity's .data and framework, Godot's .pck and Emscripten's .data. Unreal's .pak,
   .utoc and .ucas are left out: its engine reads them by range as the level asks (sending them
   whole on the first read was tried on 17 Nov 2026 and made the level later, #1758), and so is
   anything a game streams after it starts, which this cannot see.

   Each file is counted once, as the copy og-games sends: a stored .br twin at its size, else a
   stored .gz one, which is the order og-games chooses them in for a browser that takes both
   (inventory-delivery.ts, chooseEncoding), whichever is smaller; a plain .wasm at what og-games' in-transit Brotli leaves of
   one; any other plain file whole. og-games compresses a plain .pck or .data on the way too, by
   an amount that depends on what is in it, so when one is counted the note says "up to".

   It cannot tell a startup pack from a level a game loads later by name, so it says what the
   engine files come to and asks the creator to check that only the first screen's are loaded
   before the game starts, rather than claiming a player waits for all of them. */
const BOOT_FILE = /\.(?:wasm|data|pck)$|\.framework\.js$/i;
const BOOT_ADVICE: Partial<Record<string, string>> = {
  unity: "In Unity: Brotli with Decompression Fallback off, Code Optimization set to Disk Size with LTO, Strip Engine Code on and Managed Stripping Level High. Load what the first scene does not need with Addressables.",
  godot: "In Godot: build a custom export template from a profile made in Project > Tools > Engine Compilation Configuration Editor, and put later levels in their own packs loaded with ProjectSettings.load_resource_pack().",
  unreal: "In Unreal: package in Shipping and keep the startup map small.",
  emscripten: "With Emscripten: build with -O3 or -Oz, keep the default loader so the module compiles while it downloads, and preload only what the first screen needs.",
};

export function bootDownloadFindings(files: readonly { path: string; size: number }[], engines: ReadonlySet<string>): Finding[] {
  const { bootDownloadMbps, bootDownloadNoteSeconds, wasmTransitRatio } = LIMITS.performance;
  /* A bundle whose limits projection leaves these out would otherwise say "NaN s on a
     undefined Mbps connection" on every check, which is what the CLI did before its
     allowlist named them. No numbers, no note. */
  if (![bootDownloadMbps, bootDownloadNoteSeconds, wasmTransitRatio].every(value => typeof value === "number" && value > 0)) return [];
  /* The copy sent for each plain path: the smallest stored twin, else the plain file. */
  const sent = new Map<string, { path: string; size: number; stored: boolean; rank: number }>();
  for (const file of files) {
    const asset = compressedBrowserAsset(file.path);
    const plain = asset?.path ?? file.path;
    const rank = asset === null ? 0 : asset.encoding === "gz" ? 1 : 2;
    const held = sent.get(plain);
    if (!held || rank > held.rank) sent.set(plain, { path: file.path, size: file.size, stored: asset !== null, rank });
  }
  const boot = [...sent].flatMap(([plain, file]) => {
    if (!BOOT_FILE.test(plain)) return [];
    if (file.stored) return [{ path: file.path, wire: file.size, ceiling: false }];
    if (/\.wasm$/i.test(plain)) return [{ path: file.path, wire: Math.round(file.size * wasmTransitRatio), ceiling: false }];
    return [{ path: file.path, wire: file.size, ceiling: true }];
  }).sort((a, b) => b.wire - a.wire);
  const wire = boot.reduce((sum, file) => sum + file.wire, 0);
  const seconds = (wire * 8) / (bootDownloadMbps * 1_000_000);
  if (seconds < bootDownloadNoteSeconds) return [];
  const engine = ["unity", "godot", "unreal", "emscripten"].find(id => engines.has(id));
  const about = boot.some(file => file.ceiling) ? "up to about" : "about";
  const largest = boot.slice(0, 3).map(file => `${file.path} (${file.ceiling ? "up to about" : "about"} ${formatBytes(file.wire)})`).join(", ");
  return [{
    code: "boot-download", severity: "note", path: boot[0]?.path,
    title: `This build's engine files come to ${about} ${formatBytes(wire)} on the wire: ${about} ${Math.round(seconds)} s on a ${bootDownloadMbps} Mbps connection if they all load before the game starts.`,
    detail: `Largest: ${largest}. Whatever of these loads before the first frame, every player waits for on their first visit; a repeat visit reads it from the browser's cache. If some of them are levels the game loads later, they do not count. ${engine ? BOOT_ADVICE[engine] : "Load what the first screen does not need after the game starts."}`,
  }];
}
