/**
 * Which engine a browser export was built with, and the handful of strings each engine
 * carries that look like requests and are not.
 *
 * WHAT THIS IS FOR, AND WHAT IT IS NOT. Identification, so a creator and a reviewer can
 * read "Phaser 3.90.0" rather than nine engine names printed identically for every
 * bundle. It is never a compatibility verdict and never a safety one: an engine's
 * signature is a string, and a string can be copied into anything. That is why
 * `checks.engine` in platform.ts stays a runtime question, and why nothing here can
 * relax a check on its own.
 *
 * The one thing detection does change is the wording of a finding about an exact URL
 * the detected engine is known to ship as a default. Measured on 14 Oct 2026 with real
 * Vite builds of Phaser 3.90.0, PixiJS 8.22.0 and Babylon.js 9.30.0
 * (~/Code/opengame-engine-fixtures): all three played a full minute under the runtime
 * CSP with zero requests to any other origin, and all three were refused by the
 * outbound-origin check, eight blockers between them, on constants inside the engine
 * that a creator cannot remove without editing minified vendor output. By the metric
 * that check cites, the share of first uploads that pass, three of the five engines on
 * the EN1 list scored zero.
 *
 * WHY THIS IS NOT AN ESCAPE HATCH. A URL entry needs the engine detected AND the exact
 * URL AND the engine's own line around it (SITES, below), in a script, not as an import
 * specifier. It is not keyed on file names, so a file called `phaser.js` gets nothing
 * from being called that; not on hosts, so `fetch("https://cdn.babylonjs.com/x.js")` is
 * still reported as a request; and not on the string alone, so
 * `fetch("https://phaser.io/" + id)` is a request in a real Phaser build.
 *
 * WHAT IT DECIDES SINCE THE NETWORK OPENED (26 Oct 2026). Under 2027-03 an ordinary host
 * is allowed, so "reported as a request" means a line in the external-hosts note rather
 * than a blocker, and a game that forges a Phaser signature to hide `https://phaser.io/`
 * hides it from that note and nothing else. No row is on a host in limits.json
 * `gamePolicy.blockedServices`, so no row can turn a refused service into a note. A
 * plain-http row (PixiJS's banner) stays a note only at the engine's own line; anywhere
 * else it is the mixed-content blocker.
 *
 * Where an entry is fetched on a feature path rather than never, it says so, and the two
 * where the bundle itself shows the feature is in use (a `.ktx2` texture, an `.exr`) are
 * reported as the requests they will be.
 */

import registry from "./engine-registry.json";
import files from "./engine-files.json";
import { compressedBrowserAsset } from "./names";
import type { RawRuntimeEvidence } from "./raw-runtime";
import { bytesInclude, wasmFacts, type WasmFacts } from "./wasm-module";

/** Names are a catalogue, not the list of engines that have passed gate H. */
export const ENGINE_REGISTRY = registry;

/** Which files detection reads (engine-files.json, which engines.py embeds). Until
 * 5 Nov 2026 each reader kept its own list. This side searched stylesheets and import
 * maps too; engines.py searched every `.json` and `.metadata` but no `.cjs` and nothing
 * under `.unityweb`, so a string in a `levels.json` could name an engine on the server
 * that the creator's own check never saw. Now there is one list, and the parity test asks
 * both sides about a path of every type. */
export const ENGINE_FILES = { text: files.text, module: files.module };
const extensions = (list: string[]) => new RegExp(String.raw`\.(?:${list.join("|")})$`, "i");
const ENGINE_TEXT_FILE = extensions(files.text), ENGINE_MODULE_FILE = extensions(files.module);

/** "text" for a page or script detection searches, "module" for a .wasm it walks, after
 * any browser compression wrapper, and null for everything else. engines.py
 * engine_file_kind is the same rule. */
export function engineFileKind(path: string): "text" | "module" | null {
  const plain = compressedBrowserAsset(path)?.path ?? path;
  return ENGINE_TEXT_FILE.test(plain) ? "text" : ENGINE_MODULE_FILE.test(plain) ? "module" : null;
}

export type EngineId = keyof typeof registry;
export const ENGINE_NAMES = Object.fromEntries(Object.entries(registry).map(([id, row]) => [id, row.name])) as Record<EngineId, string>;

export interface DetectedEngine {
  id: EngineId;
  name: string;
  /** As the engine reports it. Null when the build does not say. */
  version: string | null;
  /** What was recognised and where, in a few words a reviewer can check. */
  evidence: string;
}

export interface EngineReport {
  /** Unrecognised exports use `custom`; evidence distinguishes missing reads and
   * unrecognised wasm from a fully inspected plain JavaScript game. Legacy values
   * remain readable for stored reports, but are never emitted by this detector. */
  id: EngineId | "none" | "unknown";
  name: string;
  version: string | null;
  evidence: string;
  /** Further engines in the same bundle. GDevelop ships PixiJS; a game can carry two. */
  also: DetectedEngine[];
  /** Engines whose licence stamp a module carries. Never an identity and never in
   * detectedIds: it only asks for that engine's publication statement. */
  licences?: string[];
}

export interface EngineSource { path: string; text: string }

/* -------------------------------------------------------------------------- */
/* Detection                                                                   */
/* -------------------------------------------------------------------------- */

/* WHITESPACE IS SPELLED OUT, `[ \t\n\r\f\v]`, in every pattern engines.py also runs, and in
   engine-registry.json. That class is exactly Python's `\s` under re.ASCII, which is how
   engines.py matches; JavaScript's `\s` also takes U+00A0, U+FEFF, U+2028 and the rest of
   Unicode's spaces, so `__THREE__ =` named Three.js here and nothing there (review of
   #904). `[\s\S]` stays, because it is every character on both sides. The parity test
   carries a case for each, and refuses a registry pattern that writes `\s` again. */
const VERSION = String.raw`\d+(?:\.\d+){0,3}(?:[-+][\w.]+)?`;
const escape = (value: string) => value.replace(/[$]/g, "\\$&");

/**
 * The literal a minified identifier was declared with, in the same file only. Bundlers
 * rename per chunk, so `nt` in one file has nothing to do with `nt` in another, and
 * resolving across files produces a confident wrong version, which is worse than none.
 */
function declared(text: string, ident: string): string | null {
  const re = new RegExp(String.raw`(?:^|[^\w$.])${escape(ident)}[ \t\n\r\f\v]*=[ \t\n\r\f\v]*(["'\x60])(${VERSION})\1`);
  return re.exec(text)?.[2] ?? null;
}

type Probe = (text: string) => { version: string | null; evidence: string } | null;

/** Text signatures, each one a construct the engine writes about itself. Two-part where
 * one part alone is a common word: `VERSION` is everywhere, `VERSION` beside
 * `LOG_VERSION` is Phaser's constants object. */
const TEXT_PROBES: { id: EngineId; name: string; probe: Probe }[] = [
  { id: "threejs", name: "Three.js", probe: (text) => {
    /* r186 builds write the revision in place, `window.__THREE__="186"`, where earlier ones
       assigned `REVISION` by name, and a reader that took only a name gave three-racer no
       version (24 Oct 2026). Both spellings are read. */
    const registered = /__THREE__[ \t\n\r\f\v]*=[ \t\n\r\f\v]*(?:(["'])(\d+(?:dev)?)\1|([\w$]+))/.exec(text);
    if (!registered && !text.includes("Multiple instances of Three.js being imported")) return null;
    const revision = registered ? registered[2] ?? declared(text, registered[3]!) : null;
    return { version: revision && /^\d+(?:dev)?$/.test(revision) ? `r${revision}` : null,
      evidence: registered ? "window.__THREE__ registration" : "the Three.js duplicate-instance warning" };
  } },
  { id: "phaser", name: "Phaser", probe: (text) => {
    const m = new RegExp(String.raw`\bVERSION[ \t\n\r\f\v]*:[ \t\n\r\f\v]*(["'])(${VERSION})\1[\s\S]{0,400}?\bLOG_VERSION[ \t\n\r\f\v]*:`).exec(text);
    return m ? { version: m[2]!, evidence: "the VERSION and LOG_VERSION constants" } : null;
  } },
  { id: "pixijs", name: "PixiJS", probe: (text) => {
    const init = /__PIXI_APP_INIT__[ \t\n\r\f\v]*\?\.[ \t\n\r\f\v]*\([ \t\n\r\f\v]*this[ \t\n\r\f\v]*,[ \t\n\r\f\v]*([\w$]+)[ \t\n\r\f\v]*\)/.exec(text);
    const banner = /PixiJS (?:%c )?v?\$\{([\w$]+)\}/.exec(text);
    if (!init && !banner && !/__PIXI_(?:APP|RENDERER)_INIT__/.test(text)) return null;
    const version = (init && declared(text, init[1]!)) ?? (banner && declared(text, banner[1]!)) ?? null;
    return { version, evidence: init || /__PIXI_(?:APP|RENDERER)_INIT__/.test(text) ? "the PixiJS devtools hook" : "the PixiJS console banner" };
  } },
  { id: "babylonjs", name: "Babylon.js", probe: (text) => {
    const npm = new RegExp(String.raw`["']babylonjs@(${VERSION})["']`).exec(text);
    if (npm) return { version: npm[1]!, evidence: "the Engine.NpmPackage constant" };
    if (!/\b_DefaultCdnUrl[ \t\n\r\f\v]*=[ \t\n\r\f\v]*["']https:\/\/cdn\.babylonjs\.com["']/.test(text)) return null;
    const cdn = new RegExp(String.raw`\b_CdnVersion[ \t\n\r\f\v]*=[ \t\n\r\f\v]*["'](${VERSION})["']`).exec(text);
    return { version: cdn?.[1] ?? null, evidence: "the Tools default CDN constant" };
  } },
  { id: "playcanvas", name: "PlayCanvas", probe: (text) => {
    const attribute = /["']data-engine["'][ \t\n\r\f\v]*,[ \t\n\r\f\v]*(?:\x60PlayCanvas \$\{([\w$]+)\}\x60|["']PlayCanvas ["'][ \t\n\r\f\v]*\+[ \t\n\r\f\v]*([\w$]+))/.exec(text);
    if (!attribute && !/Symbol\.for\([ \t\n\r\f\v]*["']playcanvas\.inspector["'][ \t\n\r\f\v]*\)/.test(text)) return null;
    const ident = attribute?.[1] ?? attribute?.[2];
    return { version: ident ? declared(text, ident) : null,
      evidence: attribute ? "the canvas data-engine attribute" : "the PlayCanvas inspector hook" };
  } },
  { id: "gdevelop", name: "GDevelop", probe: (text) => {
    if (!/\bgdjs\.(?:RuntimeGame|projectData)\b/.test(text)) return null;
    const gd = /"gdVersion"[ \t\n\r\f\v]*:[ \t\n\r\f\v]*\{([^{}]*)\}/.exec(text)?.[1];
    const part = (key: string) => gd && new RegExp(`"${key}"[ \\t\\n\\r\\f\\v]*:[ \\t\\n\\r\\f\\v]*(\\d+)`).exec(gd)?.[1];
    const version = part("major") && part("minor") ? [part("major"), part("minor"), part("build")].filter(Boolean).join(".") : null;
    return { version, evidence: "the gdjs runtime" };
  } },
];

/** Exporters that write a recognisable folder rather than a recognisable string. */
function layoutProbes(paths: string[], sources: EngineSource[]): DetectedEngine[] {
  /* `.data.br`, `.wasm.gz`, `.framework.js.unityweb`: the suffix is how the export was
     compressed, not what it is. */
  const plain = paths.map((path) => path.replace(/\.(?:gz|br|unityweb)$/i, ""));
  const has = (re: RegExp) => plain.find((path) => re.test(path));
  const textHas = (re: RegExp) => sources.find((source) => re.test(source.text));
  const out: DetectedEngine[] = [];

  /* Godot writes three things side by side: the engine's wasm, the game's .pck, and a
     loader whose config object names both. Any one alone is somebody else's file. */
  const pck = has(/\.pck$/i), wasm = has(/\.wasm$/i);
  const godotLoader = textHas(/\bGODOT_CONFIG\b|\bGodot(?:Config|FS|OS|Runtime)\b/);
  if (pck && wasm && godotLoader) out.push({ id: "godot", name: "Godot", version: null,
    evidence: `${pck}, ${wasm} and the loader in ${godotLoader.path}` });

  const loader = has(/(?:^|\/)Build\/[^/]+\.loader\.js$/i);
  const parts = loader ? plain.filter((path) => /(?:^|\/)Build\/[^/]+\.(?:framework\.js|wasm|data)$/i.test(path)) : [];
  const legacy = has(/(?:^|\/)Build\/UnityLoader\.js$/i);
  if (((loader && parts.length > 0) || legacy) && textHas(/\bcreateUnityInstance\b|\bUnityLoader\b/)) out.push({ id: "unity", name: "Unity", version: null,
    evidence: loader ? `${loader} beside ${parts.length} build file${parts.length === 1 ? "" : "s"}` : `${legacy}` });

  const c3 = has(/(?:^|\/)(?:c3runtime\.js|scripts\/c3main\.js)$/i);
  const c2 = has(/(?:^|\/)c2runtime\.js$/i);
  const scirra = textHas(/<meta[ \t\n\r\f\v]+name=["']generator["'][ \t\n\r\f\v]+content=["']Scirra Construct/i);
  if (c3 || c2 || scirra) out.push({ id: "construct", name: c2 && !c3 ? "Construct 2" : "Construct 3", version: null,
    evidence: c3 ?? c2 ?? `the generator tag in ${scirra!.path}` });

  const gdRuntime = has(/(?:^|\/)runtimegame\.js$/i);
  if (gdRuntime) out.push({ id: "gdevelop", name: "GDevelop", version: null, evidence: gdRuntime });

  const dmloader = has(/(?:^|\/)dmloader\.js$/i);
  const archive = has(/(?:^|\/)archive\/archive_files\.json$/i);
  if ((dmloader || (archive && wasm)) && textHas(/\bEngineLoader\b|\bDEFOLD_ENGINE_VERSION\b/)) out.push({ id: "defold", name: "Defold", version: null,
    evidence: dmloader ?? `${archive} beside ${wasm}` });

  return out;
}

/** Exporters first: a GDevelop game carries PixiJS, and "PixiJS" is the wrong answer
 * to which tool the creator used. Libraries after, in the order the EN1 list names them. */
const PRIMARY_ORDER = Object.keys(registry) as EngineId[];

/* A `wasm` rule makes a signature structural: the text patterns only say which bundle
   to look at, and the match needs a module whose import section really imports every
   named function and which really carries every named custom section (wasm-module.ts).
   Kaigen is the first, after a review put its three glue names in a comment beside an
   unrelated module and was handed Kaigen ahead of Three.js. With a `wasm` rule the
   version is read from that same module's bytes: Kaigen bakes it beside its licence
   stamp and writes it nowhere in the JavaScript. `strings` asks for text the module's
   bytes must hold, for an engine with nothing structural of its own: Bevy imports only
   wasm-bindgen's functions, and its crate names are in the panic locations (EM-7).
   `importModulesWithin` asks where the imports come from rather than what they are
   called, for Emscripten, whose names say nothing once -O3 has minified them to `a.a`,
   `a.b` and on: every import must come from a listed module, and there must be one. */
type WasmRule = { imports: string[]; customSections: string[]; strings?: string[]; importModulesWithin?: string[] };
type RegistrySignature = { patterns: string[]; evidence: string; paths?: string[]; versionPattern?: string; wasm?: WasmRule };
type RegistryRow = { name: string; signatures: RegistrySignature[]; licenceStamp?: string };

/** A module as detection sees it. `strings` is every registry rule string its bytes hold.
 * `text` is its bytes one per character, kept only for a module that satisfies some
 * `wasm` rule, because only those are read for a version. `walked` says the bytes are a
 * module this reader could walk to its end, which an empty import list alone cannot say:
 * a file that is not wasm at all answers with the same empty lists. */
export interface WasmModule extends WasmFacts { text?: string; licences: string[]; strings: string[]; walked: boolean }

/** One character per byte, as Python's latin-1. TextDecoder("latin1") is windows-1252,
 * which moves 0x80 to 0x9F, and the two detectors must read the same text. */
function latin1(bytes: Uint8Array): string {
  let out = "";
  for (let at = 0; at < bytes.length; at += 0x8000) out += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return out;
}

const RULE_STRINGS = [...new Set(Object.values(registry as Record<string, RegistryRow>)
  .flatMap(row => row.signatures.flatMap(signature => signature.wasm?.strings ?? [])))];

const satisfies = (rule: WasmRule, module: WasmFacts & { strings: string[] }) =>
  rule.imports.every(name => module.imports.includes(name)) && rule.customSections.every(name => module.customSections.includes(name))
  && (rule.strings ?? []).every(text => module.strings.includes(text))
  && (!rule.importModulesWithin || (module.imports.length > 0 && module.importModules.every(name => rule.importModulesWithin!.includes(name))));

/** Everything detection needs from one `.wasm`, read once. `licences` names each engine
 * whose licence stamp the bytes carry (the registry's `licenceStamp`): it grants nothing,
 * it only asks for that engine's publication statement, so a build that hides its loader
 * from every signature still has to make the statement. */
export function wasmModule(path: string, bytes: Uint8Array): WasmModule {
  const walked = wasmFacts(path, bytes);
  // Strings count only in a module that walks to its end, so a file that merely carries
  // the words beside some glue is not a build of that engine.
  const facts = { ...(walked ?? { path, imports: [], importModules: [], customSections: [], sharedMemory: false }),
    strings: walked ? RULE_STRINGS.filter(text => bytesInclude(bytes, text)) : [] };
  const rows = Object.entries(registry as Record<string, RegistryRow>);
  const licences = rows.filter(([, row]) => row.licenceStamp && bytesInclude(bytes, row.licenceStamp)).map(([id]) => id);
  /* Only a rule with a version to read keeps the bytes. Emscripten's rule accepts nearly
     every Emscripten module, a 77 MB one among them, and reads no version from it. */
  const wanted = rows.some(([, row]) => row.signatures.some(signature => signature.wasm && signature.versionPattern && satisfies(signature.wasm, facts)));
  return { ...facts, walked: walked !== null, licences, ...(wanted ? { text: latin1(bytes) } : {}) };
}

/* Each stamp as itself and at the three base64 alignments, so a module inlined into a
   SINGLE_FILE build as a data URI or a string still asks. A slice of the encoding that
   depends only on the stamp's own bytes, whatever precedes it. */
const STAMP_NEEDLES: [string, string[]][] = Object.entries(registry as Record<string, RegistryRow>)
  .filter(([, row]) => row.licenceStamp).map(([id, row]) => {
    const stamp = new TextEncoder().encode(row.licenceStamp!);
    const encoded = [0, 1, 2].map((pad) => {
      const text = btoa(String.fromCharCode(...new Uint8Array(pad), ...stamp));
      return text.slice(Math.ceil(pad * 8 / 6), Math.floor((pad + stamp.length) * 8 / 6));
    });
    return [id, [row.licenceStamp!, ...encoded]];
  });

/** Engines whose licence stamp a text carries, raw or base64. Best effort by design: it
 * reads what the scan reads, and a stamp assembled at runtime is not visible to it. */
export function licenceStamps(text: string): string[] {
  return STAMP_NEEDLES.filter(([, needles]) => needles.some((needle) => text.includes(needle))).map(([id]) => id);
}

function registryProbes(paths: string[], sources: EngineSource[], modules: WasmModule[]): DetectedEngine[] {
  const out: DetectedEngine[] = [];
  for (const [id, row] of Object.entries(registry as Record<string, RegistryRow>)) {
    for (const signature of row.signatures) {
      if (signature.paths && !signature.paths.every(pattern => paths.some(path => new RegExp(pattern).test(path)))) continue;
      const source = sources.find(source => signature.patterns.every(pattern => new RegExp(pattern).test(source.text)));
      if (!source) continue;
      const module = signature.wasm ? modules.find(module => satisfies(signature.wasm!, module)) : undefined;
      if (signature.wasm && !module) continue;
      const read = module ? module.text : source.text;
      const version = signature.versionPattern && read != null ? new RegExp(signature.versionPattern).exec(read)?.[1] ?? null : null;
      out.push({ id: id as EngineId, name: row.name, version,
        evidence: module ? `${signature.evidence} in ${source.path} and ${module.path}` : `${signature.evidence} in ${source.path}` });
      break;
    }
  }
  return out;
}

/* RAW WEBASSEMBLY, AND WHY IT IS THE LAST ANSWER BEFORE CUSTOM. Every toolchain that
   targets the browser ends in WebAssembly.instantiate, so "the page loads a module" is true
   of Unity, Godot, Emscripten, Go, wasm-bindgen and Kaigen alike. It can only mean raw
   WebAssembly (a hand-written loader for Zig, AssemblyScript, plain wasm32 Rust or C linked
   without Emscripten) once nothing more specific has been recognised, so it is decided
   after every other probe, on a complete read, and never reported beside another engine: a
   Three.js game with a Draco decoder is Three.js, not Three.js and WebAssembly.

   A library built with Emscripten (Draco, Basis, Ammo.js, MediaPipe) carries the whole
   runtime and no main, and its own instantiate call is the library loading itself. Its
   glue is set aside before anything here is asked, so it neither counts as the game's
   loader nor keeps the game's own loader beside it from being named.

   What is left takes three facts. A page script calls the API that compiles or
   instantiates a module. A page script names a module the bundle carries as a whole name
   (`data.wasm` does not name `a.wasm`), so the claim is about the module the page loads and
   not one that sits beside it. And when that module was read, it walks to its end as
   WebAssembly. A module too large to read is taken on the page's word; bytes called
   game.wasm that are not wasm leave the bundle custom. A plain JavaScript game that loads
   one small module of its own, a hash or a physics helper, is named WebAssembly too:
   nothing in the bytes tells it from a game whose logic is all in the module, and custom
   said less.

   Some toolchains are recognised here only in part, so their glue is a reason to stay
   custom rather than to be called raw. Emscripten glue that is neither a program the
   registry names nor a whole library runtime still carries `wasmBinaryFile` or its
   "failed to asynchronously prepare wasm" message. wasm-bindgen's glue without both of the
   names the Rust row reads still says `__wbg_`. A Go module imports `runtime.*` and
   `syscall/js.*`, which wasm_exec.js supplies. A Unity, Godot or Defold loader that lost
   its folder layout still names itself. A module the page loads whose imports are
   Emscripten's or wasm-bindgen's is the same, and so is any module carrying Kaigen's
   `hz_flags` section or an engine's licence stamp: a stamp asks for that engine's
   publication statement, and naming such a build "WebAssembly" would read as an answer to
   who made it. A stamp found elsewhere (base64 in a script, a module renamed `.bin`) still
   asks for the statement through the licence search in index.ts, beside whatever name this
   gives.

   Identification only, like everything here. The words are copyable, and leaving one out
   of a forged bundle gets the forger the name "WebAssembly" and nothing else. engines.py
   raw_webassembly is the same rule and the parity test runs both. Spaces are spelled out
   rather than `\s`, which is Unicode-wide here and ASCII in engines.py. */
const INSTANTIATES = /\bWebAssembly[ \t\r\n]*\.[ \t\r\n]*(instantiate(?:Streaming)?|compile(?:Streaming)?)[ \t\r\n]*\(|\bnew[ \t\r\n]+WebAssembly[ \t\r\n]*\.[ \t\r\n]*(Module|Instance)[ \t\r\n]*\(/;
const TOOLCHAIN_GLUE = /failed to asynchronously prepare wasm|\bwasmBinaryFile\b|\b[Ee]mscripten\b|__wbindgen_|__wbg_|["']runtime\.wasmExit["']|["']syscall\/js\.|\bgo\.importObject\b|\bcreateUnityInstance\b|\bUnityLoader\b|\bGODOT_CONFIG\b|\bGodot(?:Config|FS|OS|Runtime)\b|\bEngineLoader\b|\bhz_flags\b/;
const TOOLCHAIN_IMPORT = /^(?:_?emscripten_|__syscall_|invoke_|__wbindgen_|__wbg_|runtime\.|syscall\/js\.)/;

const EMSCRIPTEN_RUNTIME = (registry as Record<string, RegistryRow>).emscripten!.signatures[0]!.patterns.slice(0, 2).map((pattern) => new RegExp(pattern));
const EMSCRIPTEN_PROGRAM = (registry as Record<string, RegistryRow>).emscripten!.signatures[0]!.patterns.map((pattern) => new RegExp(pattern));
/* Older Emscripten wrote its abort message in lower case, `"abort(" + what + "). Build
   with -s ASSERTIONS=1 for more info."`, and that glue is still everywhere: Ammo.js as
   three.js ships it (examples/jsm/libs/ammo.wasm.js, r160) is one. Its build hint is the
   same, so the hint still has to be there. This only sets a library's glue aside; it is not
   evidence of an Emscripten program, which stays the registry's measured patterns. */
const EMSCRIPTEN_LEGACY_ABORT = /\babort\((?:[\x22\x27][ \t\n\r\f\v]*\+|\$\{)/;
const emscriptenRuntime = (text: string) =>
  (EMSCRIPTEN_RUNTIME[0]!.test(text) || EMSCRIPTEN_LEGACY_ABORT.test(text)) && EMSCRIPTEN_RUNTIME[1]!.test(text);

/** Whether a text names a file as a whole name: not straight after a character a file name
 * could continue with. engines.py names_file is the same loop. */
function namesFile(text: string, name: string): boolean {
  for (let at = text.indexOf(name); at >= 0; at = text.indexOf(name, at + 1)) {
    if (at === 0 || !/[A-Za-z0-9_.-]/.test(text[at - 1]!)) return true;
  }
  return false;
}

function rawWebAssembly(paths: string[], sources: EngineSource[], modules: WasmModule[]): DetectedEngine | null {
  /* A precompressed script is read decoded under its own name, so `glue.js.br` is a script.
     An Emscripten library's glue is set aside, as the comment above says. */
  const scripts = sources.filter(source => engineFileKind(source.path) === "text" && !emscriptenRuntime(source.text));
  if (scripts.some(source => TOOLCHAIN_GLUE.test(source.text))) return null;
  if (modules.some(module => module.licences.length > 0 || module.customSections.includes("hz_flags"))) return null;
  const loader = scripts.find(source => INSTANTIATES.test(source.text));
  if (!loader) return null;
  const path = paths.find(path => engineFileKind(path) === "module"
    && scripts.some(source => namesFile(source.text, (compressedBrowserAsset(path)?.path ?? path).split("/").pop()!)));
  if (!path) return null;
  const module = modules.find(module => module.path === path);
  if (module && (!module.walked || module.imports.some(name => TOOLCHAIN_IMPORT.test(name)))) return null;
  const call = INSTANTIATES.exec(loader.text)!;
  return { id: "webassembly", name: ENGINE_NAMES.webassembly, version: null,
    evidence: `${path}, loaded by ${call[1] ? `WebAssembly.${call[1]}` : `new WebAssembly.${call[2]}`} in ${loader.path}` };
}

export function detectEngine(paths: string[], sources: EngineSource[], options: { complete: boolean; wasm?: WasmModule[] }): EngineReport {
  const found = new Map<EngineId, DetectedEngine>();
  for (const engine of [...layoutProbes(paths, sources), ...registryProbes(paths, sources, options.wasm ?? [])]) found.set(engine.id, engine);
  for (const { id, name, probe } of TEXT_PROBES) {
    for (const source of sources) {
      const hit = probe(source.text);
      if (!hit) continue;
      const known = found.get(id);
      /* A layout match has no version; a text match in the same bundle may. Keep the
         first answer that has one, and say where it came from. */
      if (!known) found.set(id, { id, name, version: hit.version, evidence: `${hit.evidence} in ${source.path}` });
      else if (!known.version && hit.version) known.version = hit.version;
      if (found.get(id)!.version) break;
    }
  }
  const engines = PRIMARY_ORDER.flatMap((id) => found.get(id) ?? []);
  if (engines.length > 0) {
    const [primary, ...rest] = engines;
    /* Emscripten is the toolchain under Unity, Godot, Pyodide, love.js, Ren'Py and more,
       and every one of their loaders is its glue. Beside an engine it names how that
       engine was built, not a second engine, so it is the answer only on its own. */
    const also = rest.filter((engine) => engine.id !== "emscripten");
    return { ...primary!, also };
  }
  const custom = (evidence: string): EngineReport => ({ id: "custom", name: ENGINE_NAMES.custom, version: null, also: [], evidence });
  if (!options.complete) return custom("some scripts were not read; engine identification is incomplete");
  /* Emscripten's glue for a program, with no module read that imports the way its build
     does: a SINGLE_FILE build with the module inside the script, a module too large or
     unreadable, or one this glue was not built with. Saying so is truer than calling the
     glue a hand-written loader, and it is not structural evidence of Emscripten. */
  const glue = sources.find((source) => EMSCRIPTEN_PROGRAM.every((pattern) => pattern.test(source.text)));
  if (glue) return custom(`Emscripten's runtime glue in ${glue.path}, but no .wasm read beside it imports the way an Emscripten build does`);
  const wasm = paths.find((path) => engineFileKind(path) === "module");
  if (!wasm) return custom("custom code");
  const raw = rawWebAssembly(paths, sources, options.wasm ?? []);
  if (raw) return { ...raw, also: [] };
  return custom(`${wasm} arrived with no loader this check recognises`);
}

export const detectedIds = (report: EngineReport | undefined): Set<EngineId> => new Set(
  report ? [...(report.id === "none" || report.id === "unknown" || report.id === "custom" ? [] : [report.id]), ...report.also.map((engine) => engine.id)] : []);

/** Internal parser receipts supplement loader detection; no manifest fields enter
 * this path. A receipt says which reader understood the bytes, never that the
 * runtime or safety gates passed. */
export function withRawRuntimeEvidence(report: EngineReport, receipts: RawRuntimeEvidence[]): EngineReport {
  const engines: DetectedEngine[] = [];
  const id = report.id;
  /* WebAssembly is a fallback like custom: a validated payload names its runtime instead. */
  const fallback = id === "custom" || id === "none" || id === "unknown" || (id === "webassembly" && receipts.length > 0);
  if (!fallback) {
    engines.push({ id, name: report.name, version: report.version, evidence: report.evidence }, ...report.also);
  }
  for (const receipt of receipts) if (!engines.some(engine => engine.id === receipt.engine)) engines.push({
    id: receipt.engine, name: ENGINE_NAMES[receipt.engine], version: null,
    evidence: `validated ${receipt.format} payload in ${receipt.path}`,
  });
  const ordered = PRIMARY_ORDER.flatMap(id => engines.find(engine => engine.id === id) ?? []);
  return ordered.length ? { ...ordered[0]!, also: ordered.slice(1) } : report;
}

/* -------------------------------------------------------------------------- */
/* Known inert defaults                                                        */
/* -------------------------------------------------------------------------- */

export interface EngineDefault {
  engine: EngineId;
  /** Exact, as it appears in the built script. Never a prefix and never a host alone. */
  value: string;
  /** What the engine does with it, in a sentence or two a creator can act on. */
  detail: string;
  /** When the bundle carries one of these, the game uses the feature the default serves,
   * so the default WILL be requested, and the ordinary finding stands. */
  neededWhen?: RegExp;
  /** The engine's own line around the literal: `before` must match the text up to and
   * including the opening quote, `after` the text from just past the URL. Required on
   * every URL row, because the value alone is a prefix in practice. See SITES. */
  before?: RegExp;
  after?: RegExp;
}

/** Text either side of a matched literal, as much as a site pattern needs to see. */
export interface Site { before: string; after: string }

/* SITES, AND WHY THE EXACT STRING WAS NOT ENOUGH. The first version of this table matched
   the URL alone, and the outbound check's URL ends at the closing quote. So
   `fetch("https://unpkg.com/fflate@0.8.2" + "/../evil@1/x.js")` matched the fflate row
   exactly, came back as a note, and reached any package on unpkg once the browser
   resolved the dots. Found by mutation-testing the row with a bundle that imitated the
   engine and fetched somewhere else, before it shipped.

   So each row names where the engine writes the literal (`Ze._DefaultCdnUrl="..."`,
   `this.gameURL=e(v,"url","..."+c.LOG_VERSION)`) and what may follow the closing quote.
   A literal anywhere else, or one with anything concatenated onto it, is an ordinary
   finding. What this does not stop is a bundle that writes the engine's exact assignment
   and then builds a URL from the property at runtime -- and that is no new hole, because
   a URL assembled at runtime from any pieces was never visible to a check that reads
   literals. The CSP sees it either way. */
const END = /^["'\x60]\s*(?:[;,})\]]|$)/;

const UNUSED = "Nothing has to change.";
const SHIP = "The request is allowed, so nothing has to change. A copy in the bundle keeps the game working if that server is slow or down.";

/**
 * URLs. Each measured in a fixture build on 14 Oct 2026, with the line of engine source it
 * came from, so the next person can check an entry rather than trust it. Add an entry the
 * same way: a real export, the exact string, and what the engine does with it.
 */
export const ENGINE_DEFAULT_ORIGINS: EngineDefault[] = [
  /* Phaser 3.90.0 Config: `this.gameURL = GetValue(config, 'url', 'https://phaser.io/' + CONST.LOG_VERSION)`.
     Printed in the banner, never requested. */
  { engine: "phaser", value: "https://phaser.io/",
    before: /\.gameURL\s*=\s*[\w$.]+\(\s*[\w$]+\s*,\s*["']url["']\s*,\s*["']$/,
    after: /^["']\s*\+\s*[\w$]+\.LOG_VERSION\s*\)/,
    detail: `This is the default for Phaser's game URL setting. Phaser prints it in its console banner and never requests it. ${UNUSED}` },
  /* PixiJS 8.22.0 sayHello: the banner is an array spread into `globalThis.console.log`,
     so the string is not an argument of the call where the sink pass can see it. */
  { engine: "pixijs", value: "http://www.pixijs.com/",
    /* The literal opens with `%c`, so it could never be an absolute URL to anywhere. */
    before: /\[\s*\x60(?:%c\s*)+PixiJS %c v\$\{[\w$]+\} \(\$\{[\w$]+\}\) $/,
    /* Vite keeps the template's two newlines as real ones; the unit test escapes them. */
    after: /^(?:\\n|\n)*\x60\s*,/,
    detail: `This is the address PixiJS prints in its console banner. It is never requested. ${UNUSED}` },
  /* Babylon.js 9.30.0 Tools._DefaultCdnUrl. The base for optional add-ons. */
  { engine: "babylonjs", value: "https://cdn.babylonjs.com", before: /[\w$]\._DefaultCdnUrl\s*=\s*["']$/, after: END,
    detail: `This is Babylon.js's default address for optional add-ons such as decoders and physics. Babylon requests it only when a game turns one on without a local copy. ${SHIP}` },
  /* Babylon.js 9.30.0 KhronosTextureContainer2.URLConfig.jsDecoderModule. */
  { engine: "babylonjs", value: "https://cdn.babylonjs.com/babylon.ktx2Decoder.js", neededWhen: /\.ktx2$/i,
    before: /\.URLConfig\s*=\s*\{\s*jsDecoderModule\s*:\s*["']$/, after: END,
    detail: `This is Babylon.js's default KTX2 decoder. Babylon requests it only to load a .ktx2 texture, and this build has none. ${UNUSED}` },
  /* Babylon.js 9.30.0 Tools._DefaultAssetsUrl. */
  { engine: "babylonjs", value: "https://assets.babylonjs.com/core", before: /[\w$]\._DefaultAssetsUrl\s*=\s*["']$/, after: END,
    detail: `This is Babylon.js's default address for its sample assets, such as the default environment texture. Babylon requests it only from helpers that load those assets. ${SHIP}` },
  /* Babylon.js 9.30.0 Animation.SnippetUrl, and the same constant on other classes. */
  { engine: "babylonjs", value: "https://snippet.babylonjs.com", before: /[\w$]\.SnippetUrl\s*=\s*["']$/, after: END,
    detail: `This is Babylon.js's snippet server. Babylon requests it only to load a snippet by id. ${SHIP}` },
  /* Babylon.js 9.30.0 EXR loader's FFLATEUrl, fetched to decompress an EXR. */
  { engine: "babylonjs", value: "https://unpkg.com/fflate@0.8.2", neededWhen: /\.exr$/i,
    before: /[\w$]\.FFLATEUrl\s*=\s*["']$/, after: END,
    detail: `This is the copy of fflate Babylon.js fetches to decompress an EXR texture, and this build has no .exr file. ${UNUSED}` },
  /* React 19.3.1 production builds of react and react-dom, formatProdErrorMessage:
     `function r(U){var b="https://react.dev/errors/"+U;if(1<arguments.length){b+="?args[]="+...`.
     The string becomes the text of a thrown error, so the sink pass never sees it as an
     argument. Found by the React starter failing its own check on 22 Oct 2026; every
     React 19 game a creator built would have failed the same way. */
  { engine: "react", value: "https://react.dev/errors/",
    before: /function\s+[\w$]+\(\s*[\w$]+\s*\)\s*\{\s*var\s+[\w$]+\s*=\s*["']$/,
    after: /^["']\s*\+\s*[\w$]+\s*;\s*if\s*\(\s*1\s*<\s*arguments\.length\s*\)\s*\{\s*[\w$]+\s*\+=\s*["']\?args\[\]=["']/,
    detail: `This is the address React writes into its production error messages, so a player can look up the error. React never requests it. ${UNUSED}` },
  /* Excalibur 0.32.0 Engine, when it falls back to Canvas 2D: `this._toaster.toast("... Visit
     [LINK] for more information and potential solutions.","https://excaliburjs.com/docs/performance")`.
     Toaster.toast makes the second argument the href of an <a> it puts in the toast, so it
     is a link and never a request. The sentence runs past the 160 characters the site
     reads, so its end is the anchor rather than the call. Found by the Excalibur starter
     failing its own check on 23 Oct 2026. */
  { engine: "excalibur", value: "https://excaliburjs.com/docs/performance",
    before: /Visit \[LINK\] for more information and potential solutions\.",\s*"$/,
    after: /^"\s*\)/,
    detail: `This is the documentation link Excalibur puts in the toast it shows when it falls back to Canvas 2D. It is a link, not a request, and the game frame does not open links. ${UNUSED}` },
  /* NO ROW FOR PYODIDE'S CDN, AND ONE WAS TRIED. Pyodide 0.27.7 writes
     `d.version.includes("dev")||n.setCdnUrl(\`https://cdn.jsdelivr.net/pyodide/v${d.version}/full/\`)`,
     and reads it only under Node, so a browser never fetches it. But the literal is a
     template: the URL is whatever `d.version` holds, on a host that serves anybody's
     package. A forged Pyodide signature with `d={version:"/../../npm/evil@1/"}` and its
     own `setCdnUrl` passed as a note (adversarial review, 23 Oct 2026). A row must be one
     exact URL, and this one cannot be, so every Pyodide distribution keeps that finding. */
];

/**
 * File names. The reference check reads a quoted name ending in an asset extension as a
 * request, and these are names an engine writes for other reasons: a download's default
 * name, a MIME type, a basename it compares against. Same evidence rule as above.
 */
export const ENGINE_DEFAULT_REFS: EngineDefault[] = [
  /* Phaser 3.90.0 CacheManager save(): `filename === undefined && (filename = 'file.json')`, then an <a download>. */
  { engine: "phaser", value: "file.json", detail: "the default name Phaser gives a file it saves for the player to download" },
  /* PixiJS 8.22.0 ExtractSystem.download(): `link.download = options.filename ?? 'image.png'`. */
  { engine: "pixijs", value: "image.png", detail: "the default name PixiJS gives a screenshot it saves for download" },
  /* PlayCanvas 2.23.2, each read in the fixture bundle. */
  { engine: "playcanvas", value: ".mapping.json", detail: "a suffix PlayCanvas adds to a model's name to look for an optional material mapping, and it carries on without one" },
  { engine: "playcanvas", value: "draco.wasm.js", detail: "the Draco decoder PlayCanvas loads only for a Draco-compressed model with no decoder path set; ship it if your models use Draco" },
  { engine: "playcanvas", value: "draco.wasm.wasm", detail: "the Draco decoder PlayCanvas loads only for a Draco-compressed model with no decoder path set; ship it if your models use Draco" },
  { engine: "playcanvas", value: "filename.glb", detail: "a placeholder name PlayCanvas hands its glTF parser" },
  /* Unity 6 WebGL framework.js, Emscripten's glue: `wasmBinaryFile = 'build.wasm'; ...
     locateFile(wasmBinaryFile)`. Unity's loader compiles the module it fetched from
     Build/<name>.wasm itself, so this default is never asked for (both real exports
     measured on 22 Oct 2026 carried it beside a differently named wasm). */
  { engine: "unity", value: "build.wasm", detail: "Emscripten's default name for the module, which Unity's loader replaces with the wasm in Build/" },
  /* Unity 2021's "Decompression Fallback" loader bundles a brotli decoder as a tiny
     CommonJS module table, and its require() calls name entries of that table, not files:
     `this.require("decompress.js")`, `e("./dictionary.bin.js")`, and the resolver's
     `t[e+"/index.js"]`. Read in Black Zen White's 2021.3.11f1 loader on 5 Nov 2026, which
     drew three "not in the folder" warnings for a build missing nothing. */
  { engine: "unity", value: "decompress.js", detail: "a module inside the brotli decoder Unity's loader carries, not a file it fetches" },
  { engine: "unity", value: "./dictionary.bin.js", detail: "a module inside the brotli decoder Unity's loader carries, not a file it fetches" },
  { engine: "unity", value: "/index.js", detail: "the module resolver inside Unity's bundled brotli decoder, not a file it fetches" },
];

/** The trailing `\n` a banner template carries is part of the matched text, not the URL. */
const trimEscapes = (value: string) => value.replace(/(?:\\[nrt])+$/, "");

/* THE LITERAL HAS TO END WHERE THE URL DOES, WITH THE QUOTE THAT OPENED IT. The URL match
   stops at any quote character, so `"https://unpkg.com/fflate@0.8.2',/../../evil@1/x.js"`
   matched the fflate row exactly while the string ran on to `evil`, and `END` accepted the
   `'` because it takes any quote. A forged Babylon signature turned that into a note.
   Found by an adversarial review of this table before it shipped. Pixi's row is the one
   whose URL sits mid-template, and its own patterns pin both backticks. */
function closesAt(site: Site): boolean {
  const open = site.before.at(-1);
  return !open || !/["'\x60]/.test(open) || site.after.startsWith(open);
}

export function engineDefault(table: EngineDefault[], engines: Set<EngineId>, value: string, bundlePaths: string[], site?: Site): EngineDefault | null {
  const exact = trimEscapes(value);
  /* A row with a site needs one, and a caller that cannot supply it gets nothing. */
  const entry = table.find((row) => engines.has(row.engine) && row.value === exact
    && (!row.before || (site !== undefined && row.before.test(site.before) && closesAt(site)))
    && (!row.after || (site !== undefined && row.after.test(site.after))));
  if (!entry) return null;
  if (entry.neededWhen && bundlePaths.some((path) => entry.neededWhen!.test(path))) return null;
  return entry;
}

/**
 * The Godot version from a .pck header, which is the one place a Godot web export states
 * it: index.js and the wasm carry Emscripten's version and the template's name, not the
 * editor's. The header is `GDPC`, then pack format, major, minor and patch, each a
 * little-endian uint32. Godot 3 writes format 1, Godot 4.0 to 4.3 format 2, 4.4 to 4.6
 * format 3, and 4.7 format 4; read from real exports, 3.6.2 wrote `1 3 6 2` and 4.5.1 wrote
 * `3 4 5 1` (22 Oct 2026), and 4.7.2 wrote `4 4 7 2` (5 Nov 2026, the engines lane's proof
 * game, which read as a Godot of no version until this took format 4). A header whose format and major disagree is not one Godot wrote, so it gets
 * no version rather than a confident wrong one. Identification only, like every version
 * here: the bytes are the creator's and can say anything.
 */
export function godotPckVersion(head: Uint8Array): string | null {
  if (head.length < 20 || head[0] !== 0x47 || head[1] !== 0x44 || head[2] !== 0x50 || head[3] !== 0x43) return null;
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const [format, major, minor, patch] = [4, 8, 12, 16].map((at) => view.getUint32(at, true)) as [number, number, number, number];
  if (!(format === 1 ? major === 3 : format >= 2 && format <= 4 && major === 4)) return null;
  if (minor > 99 || patch > 99) return null;
  return `${major}.${minor}.${patch}`;
}

/**
 * Which packs to read for that version, in order, so this and engines.py
 * (godot_pack_order) answer the same for the same bundle. The main pack first: what a
 * GODOT_CONFIG names as `mainPack`, then `<executable>.pck`, resolved beside the file that
 * declares it; then every other .pck in UTF-16 code-unit order. The first header that
 * parses wins. Parity: tests/fixtures/godot-pack-order.json, read by both test suites.
 */
export function godotPackOrder(paths: string[], sources: EngineSource[]): string[] {
  const packs = paths.filter((path) => /\.pck$/i.test(path));
  const named: string[] = [];
  for (const source of sources) {
    const at = /\bGODOT_CONFIG[ \t\n\r\f\v]*=[ \t\n\r\f\v]*\{/.exec(source.text);
    if (!at) continue;
    const config = source.text.slice(at.index, at.index + 4096);
    const dir = source.path.includes("/") ? source.path.slice(0, source.path.lastIndexOf("/") + 1) : "";
    const main = /"mainPack"[ \t\n\r\f\v]*:[ \t\n\r\f\v]*"([^"\\]+)"/.exec(config)?.[1];
    const executable = /"executable"[ \t\n\r\f\v]*:[ \t\n\r\f\v]*"([^"\\]+)"/.exec(config)?.[1];
    for (const name of [main, executable && `${executable}.pck`]) {
      if (!name || name.split("/").includes("..")) continue;
      const path = dir + name.replace(/^\.\//, "");
      if (packs.includes(path) && !named.includes(path)) named.push(path);
    }
  }
  return [...named, ...packs.filter((path) => !named.includes(path)).sort()];
}

/**
 * Where a Godot web export's loader sends a name its template asks for: the path the page
 * gives as `executable`, beside the page, so `index` here. Null without a GODOT_CONFIG.
 */
export function godotLoadPath(sources: EngineSource[]): string | null {
  for (const source of sources) {
    const at = /\bGODOT_CONFIG[ \t\n\r\f\v]*=[ \t\n\r\f\v]*\{/.exec(source.text);
    if (!at) continue;
    const executable = /"executable"[ \t\n\r\f\v]*:[ \t\n\r\f\v]*"([^"\\]+)"/.exec(source.text.slice(at.index, at.index + 4096))?.[1];
    if (!executable || executable.split("/").includes("..")) continue;
    const dir = source.path.includes("/") ? source.path.slice(0, source.path.lastIndexOf("/") + 1) : "";
    return dir + executable.replace(/^\.\//, "");
  }
  return null;
}

/* Godot 4.5's `locateFile` in index.js, in its own order, so the worklets are tested before
   the plain `.js` that would also match them. `.worker.js` is from the 4.0 to 4.2 loaders,
   whose threaded builds still had a separate worker file; 4.5's templates never ask for one. */
const GODOT_LOCATED = [".audio.worklet.js", ".audio.position.worklet.js", ".worker.js", ".js", ".side.wasm", ".wasm"];

/**
 * The file a Godot export asks for when its template calls `locateFile(name)`.
 *
 * The template is compiled once by Godot and names its files after itself:
 * `godot.web.template_release.wasm32.nothreads.wasm`, `godot.audio.worklet.js`. The
 * export's loader rewrites any name starting `godot.` to the executable plus the suffix
 * (index.js, `'locateFile': function (path)`), which is why the folder holds index.wasm
 * and index.audio.worklet.js and never the names in the code. The reference check read
 * the code's names and told every Godot creator that six files were missing (Lanternhill,
 * 24 Oct 2026). Answering with the name the loader really asks for keeps the check
 * useful: a Godot export with its worklet deleted is still told the worklet is missing.
 * Anything else, such as a GDExtension library named by its own file, is left alone.
 */
export function godotLocated(name: string, loadPath: string): string {
  if (!name.startsWith("godot.")) return name;
  const suffix = GODOT_LOCATED.find((end) => name.endsWith(end));
  return suffix ? loadPath + suffix : name;
}

/**
 * The folder a Defold export loads its archive from: the prefix its
 * `archive_location_filter` puts before a path, `"archive"` in Defold's own default
 * (dmloader.js CUSTOM_PARAMETERS) and in every template we have seen. The loader asks for
 * `loadArchiveDescription('/archive_files.json')` and the filter turns it into
 * archive/archive_files.json, so the name in the code is never the file's path (defold-pinball,
 * 25 Oct 2026). The page's own filter wins over the loader's default,
 * because the page is what overrides CUSTOM_PARAMETERS. Null when neither is a plain prefix.
 */
export function defoldArchivePrefix(sources: EngineSource[]): string | null {
  /* Read in a short window after each occurrence, so a forged bundle cannot make the
     parameter list backtrack across megabytes (review of #432: 96 s on 2 MB). A prefix that
     climbs out of the folder is not one this resolves. */
  const read = (text: string) => {
    for (let at = text.indexOf("archive_location_filter"); at >= 0; at = text.indexOf("archive_location_filter", at + 1)) {
      const prefix = /^archive_location_filter\s*:\s*function\s*\(\s*([\w$]{1,64})\s*(?:,\s*[\w$]{1,64}\s*)*\)\s*\{\s*(?:var|let|const)\s+[\w$]{1,64}\s*=\s*["']([\w.-]{0,64})["']\s*\+\s*\1\s*;/
        .exec(text.slice(at, at + 400))?.[2];
      if (prefix !== undefined && !prefix.split("/").includes("..") && prefix !== "..") return prefix;
    }
    return null;
  };
  const page = sources.filter((source) => /\.html?$/i.test(source.path)).map((source) => read(source.text)).find((prefix) => prefix !== null);
  return page ?? sources.map((source) => read(source.text)).find((prefix) => prefix !== null) ?? null;
}

/**
 * The module a Defold export's loader really fetches. Emscripten's glue asks for
 * `locateFile("dmengine_release.wasm")`, the engine's own name, and dmloader.js's
 * `Module["locateFile"]` renames any `dmengine*.wasm` to the project's: `<project>.wasm`, or
 * `<project>_pthread.wasm` where threads are available. This reads the single-thread name
 * from that function, which is the one every browser can take; the threaded name is a
 * literal of its own in the same function and is still checked as written.
 */
export function defoldEngineWasm(sources: EngineSource[]): string | null {
  for (const source of sources) {
    const at = source.text.search(/\bpath\s*==\s*["']dmengine(?:_release|_headless)?\.wasm["']/);
    if (at < 0) continue;
    const name = /\belse\s*\{\s*path\s*=\s*["']([\w.-]+\.wasm)["']/.exec(source.text.slice(at, at + 600))?.[1];
    if (name) return name;
  }
  return null;
}

export function engineLabel(report: Pick<EngineReport, "name" | "version">): string {
  return report.version ? `${report.name} ${report.version}` : report.name;
}
