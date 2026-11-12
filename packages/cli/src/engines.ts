import { lstat, readdir, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { isBundlePath, type GameManifest, type GameRequirements } from "@opengame/protocol";
import { LIMITS } from "@opengame/shared";
import { detectEngine, ENGINE_NAMES, engineFileKind, type EngineId } from "../../preflight/src/engines";
import { withoutBom } from "./files";
import { CliError } from "./output";
import { safeReadFile, safeReadFiles } from "./safe-fs";
import { guidePage, namedEngine } from "./engine-guides.mjs";
import { THREADED_CONTRACT, THREADED_MOVES } from "@opengame/shared/runtime-contracts";
import { CURRENT_CONTRACT } from "../../../infra/worker/src/contracts";

/**
 * The contract a NEW threaded release ends up on: where the seal moves a release frozen on
 * the current contract (limits.json threadedMoves), which is 2027-04 since 2027-03 became
 * current on 26 Oct 2026. Not THREADED_CONTRACT, which is what a scan receipt asks for and
 * is still 2027-02; quoting that here would send a creator to test under the closed
 * network their release will never be served on.
 */
export const THREADED_TARGET: string = THREADED_MOVES[CURRENT_CONTRACT] ?? THREADED_CONTRACT;

/* What a threaded export gets, from the table rather than from memory. Until 24 Oct 2026
   these sentences said threaded games needed "the experimental isolation contract" and
   would "not run yet", a day after 2027-02 went live and the seal began moving threaded
   releases onto it. Until 26 Oct 2026 they also said eval was not allowed, which was true
   of every contract a release could get until 2027-03 and 2027-04 granted it. */
const THREADED_EXPORTS = `OpenGame supports threaded exports: a release whose scan finds threads is moved onto contract ${THREADED_TARGET} automatically, which adds cross-origin isolation.`;
const THREADED_FIX = `Keep the threaded export if you meant it. Try it with opengame dev . --contract ${THREADED_TARGET}, then check that its worker threads start in your hosted private preview.`;

// These are export recipes, not a support allowlist. Only fixture gates can make
// a support claim; init merely saves the creator from guessing an output folder.
//
// The folder is all the CLI owns here. Ids and names come from preflight's registry, which
// the pipeline mirrors. Until 22 Oct 2026 this file kept its own table of both, and twelve
// names had drifted from the registry's. The Record type makes tsc refuse an id the
// registry lacks or a registry id with no folder, and engine-init.test.ts checks the same
// at run time. The key order is the order --engine lists its values in.
// The Emscripten four say dist because their starters and docs build with
// `-o dist/index.html`; until 5 Nov 2026 init wrote build for them, beside docs that said dist.
const EXPORT_FOLDERS: Record<EngineId, string> = {
  threejs: "dist", phaser: "dist", pixijs: "dist", babylonjs: "dist", playcanvas: "dist",
  excalibur: "dist", kaplay: "dist", melonjs: "dist", littlejs: "dist", react: "dist", ctjs: "Export/html5",
  construct: "export", gdevelop: "export", rpgmaker: "www", cocos: "build/web-mobile", heaps: "bin", haxe: "bin",
  unity: "Build", godot: "build/web", defold: "bundle", gamemaker: "html5", emscripten: "dist", raylib: "dist",
  love2d: "build", renpy: "web", solar2d: "build", kaigen: "out/wasm/release", bevy: "dist", rust: "dist",
  ebiten: "web", go: "web", zig: "zig-out/web", swift: "Bundle", dotnet: "publish/wwwroot",
  csharp: "publish/wwwroot", kni: "publish/wwwroot", monogame: "publish/wwwroot", stride: "publish/wwwroot",
  flame: "build/web", flutter: "build/web", jsdos: ".", ruffle: ".", pyodide: ".", python: ".",
  wasmoon: ".", lua: ".", luau: "dist", gbstudio: "build/web", pico8: ".", c: "dist", cpp: "dist",
  javascript: ".", typescript: "dist", webassembly: ".", custom: ".",
};
export const ENGINE_IDS = Object.keys(EXPORT_FOLDERS) as EngineId[];
export const ENGINE_PRESETS = Object.fromEntries(ENGINE_IDS.map(id => [id, { id, name: ENGINE_NAMES[id], output: EXPORT_FOLDERS[id] }])) as Record<string, { id: string; name: string; output: string }>;
/** `requires` is what the engine cannot run without, written into the manifest by init.
 * Only an engine with one renderer and no fallback sets it; a guess here would hide the
 * game from players whose browser could have run it. */
export type EngineSetup = { id: string; name: string; output: string; evidence: string; command?: string; sourceRoot?: string; outputAmbiguous?: boolean; outputKnown?: boolean; instructions: string; docs: string; requires?: GameRequirements };

/* Every read goes through the Python helper (safe-fs.ts), one process per call, and init
   asked it about some forty files that are not there and every text file of a Vite
   project's source: 231 helper processes and nearly 4 s on a 200-file project on Linux, more
   on macOS, while the terminal sat silent after the genre question (11 Nov 2026). So a name
   is looked at with lstat first, and only a regular file within the limit costs a helper,
   and projectTexts reads a batch in one. lstat decides nothing about safety: the helper still
   opens every byte it returns without following a link, and refuses one swapped in after. */
async function readable(root: string, name: string, bytesMax: number): Promise<number | undefined> {
  if (!isBundlePath(name)) return undefined;
  const info = await lstat(join(root, name)).catch(() => null);
  return info?.isFile() && info.size <= bytesMax ? info.size : undefined;
}

export async function projectText(root: string, name: string, bytesMax = LIMITS.platform.packagingRepair.textBytesMax): Promise<string | undefined> {
  if (await readable(root, name, bytesMax) === undefined) return undefined;
  try {
    return withoutBom((await safeReadFile(root, name, bytesMax)).toString("utf8"));
  } catch (error) {
    // Source advice is optional. An unsafe, changing, oversized or non-regular
    // marker supplies no evidence; the nonblocking helper never follows it.
    if (error instanceof CliError && error.code === "build_changed") return undefined;
    if (["ENOENT", "ENOTDIR", "ELOOP"].includes((error as NodeJS.ErrnoException).code ?? "")) return undefined;
    throw error;
  }
}

/**
 * projectText for many names in one helper process: the regular files among them, in order,
 * while they fit in `budget` bytes together, each at most `bytesMax`. A name that is absent,
 * not a regular file or does not fit is left out, as projectText leaves it undefined. When the
 * batch is refused (a file changed size, or a link sits in its path) each file is asked again
 * on its own, so one bad file costs its own evidence and not everybody else's.
 */
export async function projectTexts(root: string, names: readonly string[], options: { bytesMax?: number; budget?: number } = {}): Promise<Map<string, string>> {
  const bytesMax = options.bytesMax ?? LIMITS.platform.packagingRepair.textBytesMax;
  let budget = options.budget ?? Infinity;
  const base = await realpath(root);
  const files: { path: string; byteSize: number }[] = [];
  for (const name of new Set(names)) {
    const size = await readable(base, name, Math.min(bytesMax, budget));
    if (size === undefined) continue;
    files.push({ path: name, byteSize: size }); budget -= size;
  }
  const texts = new Map<string, string>();
  if (!files.length) return texts;
  try {
    for (const [name, bytes] of await safeReadFiles(base, files)) texts.set(name, withoutBom(bytes.toString("utf8")));
  } catch (error) {
    if (!(error instanceof CliError) || error.code !== "build_changed") throw error;
    for (const file of files) {
      const text = await projectText(base, file.path, file.byteSize);
      if (text !== undefined) texts.set(file.path, text);
    }
  }
  return texts;
}

type SourceSettingDiagnostic = {
  code: string; severity: "note" | "warning"; path: string; field: string;
  value: string | boolean | number; message: string; fix: string; verify: string;
};
type SourceSettings = {
  engine: "unity" | "godot" | "flutter" | null;
  observed: { path: string; field: string; value: string | boolean | number }[];
  diagnostics: SourceSettingDiagnostic[];
  unmeasured: string[];
};

// Read only unambiguous scalar assignments in a named section. Unknown syntax,
// duplicate sections and duplicate keys are not evidence of an editor setting.
function sourceSections(text: string): Map<string, Map<string, string> | undefined> {
  const sections = new Map<string, Map<string, string> | undefined>();
  let values: Map<string, string> | undefined, seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const header = /^[ \t]*\[([^\]\r\n]+)\][ \t]*$/.exec(line);
    if (header) {
      const name = header[1]!;
      values = sections.has(name) ? undefined : new Map();
      sections.set(name, values);
      seen = new Set();
      continue;
    }
    if (/^[ \t]*\[/.test(line)) { values = undefined; continue; }
    const match = /^[ \t]*([\w/.]+)[ \t]*=(.*)$/.exec(line);
    if (!match || !values) continue;
    const key = match[1]!, value = match[2]!.trim();
    if (seen.has(key)) values.delete(key);
    else values.set(key, value);
    seen.add(key);
  }
  return sections;
}

/** Recipes and source advice must select the same unambiguous export. A preset
 * outside this project is not a safe default output for the CLI. */
function godotPresets(text: string) {
  const sections = sourceSections(text);
  const names = [...sections].filter(([section]) => /^preset\.\d+$/.test(section))
    .map(([, fields]) => /^"([^"\r\n]+)"$/.exec(fields?.get("name") ?? "")?.[1]);
  return [...sections].flatMap(([section, fields]) => {
    const id = /^preset\.(\d+)$/.exec(section)?.[1];
    if (!id || !fields || !['"Web"', '"HTML5"'].includes(fields.get("platform") ?? "")) return [];
    const target = /^"([^"\r\n]+\.html)"$/.exec(fields.get("export_path") ?? "")?.[1]?.replace(/^\.\//, "");
    if (!target || !isBundlePath(target)) return [];
    const name = /^"([^"\r\n]+)"$/.exec(fields.get("name") ?? "")?.[1];
    return [{ id, fields, target, output: dirname(target), name,
      uniqueName: !!name && names.every(name => name !== undefined) && names.filter(value => value === name).length === 1,
      options: sections.get(`preset.${id}.options`) ?? new Map<string, string>() }];
  });
}

/** Source advice precedes the build, so it cannot certify the exported bytes.
 * Godot fields below were measured in the retained 3.6.2/4.5.1 projects and the
 * starter. Unity's editor API names are not proof of their serialized YAML keys;
 * publishing/cache/hash diagnostics must wait for an actual settings fixture. */
export async function sourceSettingsDiagnostics(root: string, manifest: GameManifest): Promise<SourceSettings> {
  try { return await inspectSourceSettings(root, manifest); }
  catch (error) {
    // Advice must not turn a Node-only export check into a Python prerequisite.
    // Required filesystem operations keep their explicit unsupported errors.
    if (!(error instanceof CliError) || error.code !== "filesystem_unsupported") throw error;
    return { engine: null, observed: [], diagnostics: [],
      unmeasured: ["Source settings were not inspected: the optional POSIX/Python filesystem helper is unavailable. The export check still inspects the packaged bytes."] };
  }
}

async function inspectSourceSettings(root: string, manifest: GameManifest): Promise<SourceSettings> {
  const result: SourceSettings = { engine: null, observed: [], diagnostics: [], unmeasured: [] };
  const observe = (path: string, field: string, value: string | boolean | number) => { result.observed.push({ path, field, value }); };
  const advise = (code: string, severity: "note" | "warning", path: string, field: string, value: string | boolean | number, message: string, fix: string) => {
    result.diagnostics.push({ code, severity, path, field, value, message, fix, verify: "opengame check . --build --json" });
  };
  const unity = await projectText(root, "ProjectSettings/ProjectVersion.txt");
  if (unity !== undefined) {
    result.engine = "unity";
    const versions = [...unity.matchAll(/^m_EditorVersion:\s*(\d+\.\d+\.\d+[abfp]\d+)\s*\r?$/gm)];
    if (versions.length === 1) {
      const version = versions[0]![1]!;
      observe("ProjectSettings/ProjectVersion.txt", "m_EditorVersion", version);
      advise("source-unity-version", "note", "ProjectSettings/ProjectVersion.txt", "m_EditorVersion", version,
        `Unity ${version} source detected; publishing, data caching and filename hashing settings have not been measured by this check.`,
        "Review Web publishing settings in this editor, export index.html and its Build folder together, then check the actual export.");
    }
    result.unmeasured.push("Unity publishing, data caching and filename hashing: no measured ProjectSettings.asset schema is available.");
    return result;
  }
  if (await projectText(root, "project.godot") !== undefined) {
    result.engine = "godot";
    const path = "export_presets.cfg", text = await projectText(root, path);
    if (text === undefined) { result.unmeasured.push("Godot export presets are absent or unreadable."); return result; }
    const presets = godotPresets(text).filter(preset => resolve(root, preset.output) === resolve(root, manifest.build?.output ?? "."));
    if (presets.length !== 1) { result.unmeasured.push("No unique Web/HTML5 preset matches the manifest build output; source settings were not attributed to this export."); return result; }
    const preset = presets[0]!, section = `preset.${preset.id}.options`, options = preset.options;
    observe(path, `preset.${preset.id}.platform`, preset.fields.get("platform")!.slice(1, -1));
    const booleanFields = preset.fields.get("platform") === '"Web"'
      ? ["progressive_web_app/enabled", "variant/thread_support"] : ["progressive_web_app/enabled"];
    for (const field of booleanFields) {
      const raw = options.get(field);
      if (raw !== "true" && raw !== "false") { result.unmeasured.push(`${section}.${field} is absent, ambiguous or not a literal boolean.`); continue; }
      const value = raw === "true";
      observe(path, `${section}.${field}`, value);
      if (field === "progressive_web_app/enabled" && value) advise("source-godot-pwa", "warning", path, `${section}.${field}`, value,
        "The selected Godot Web preset enables Progressive Web App output; OpenGame does not run its service worker.",
        "Turn off Progressive Web App in this export preset, rebuild, and check the exported files.");
      if (field === "variant/thread_support" && value) advise("source-godot-threads", "note", path, `${section}.${field}`, value,
        `The selected Godot Web preset enables threads. ${THREADED_EXPORTS}`, THREADED_FIX);
    }
    if (preset.fields.get("platform") === '"HTML5"') {
      const raw = options.get("variant/export_type");
      if (raw === "0" || raw === "1") {
        observe(path, `${section}.variant/export_type`, Number(raw));
        if (raw === "1") advise("source-godot-threads", "note", path, `${section}.variant/export_type`, 1,
          `The selected Godot HTML5 preset uses the Threads variant. ${THREADED_EXPORTS}`, THREADED_FIX);
      } else result.unmeasured.push(`${section}.variant/export_type is not a measured Godot 3 variant.`);
    }
    return result;
  }
  const pubspec = await projectText(root, "pubspec.yaml"), web = await projectText(root, "web/index.html");
  const html = web?.replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/<(script|style|textarea|title|template)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, "");
  const bases = html?.match(/<base\b[^>]*>/gi) ?? [];
  const flutterBase = bases.length === 1 && /^<base href="\$FLUTTER_BASE_HREF">$/.test(bases[0]!);
  // The Flame starter creates its pubspec during the build. Its source template
  // still carries Flutter's exact base placeholder before that file exists.
  if ((pubspec && /^\s*flutter\s*:/m.test(pubspec)) || flutterBase) {
    result.engine = "flutter";
    if (flutterBase) {
      observe("web/index.html", "base.href", "$FLUTTER_BASE_HREF");
      advise("source-flutter-base", "note", "web/index.html", "base.href", "$FLUTTER_BASE_HREF",
        "The Flutter source uses a build-time base URL placeholder; its final value is not measured yet.",
        "Build for the game origin root and inspect the generated index.html base URL with the export check.");
    }
    const command = manifest.build?.command;
    if (command && /^flutter[ \t]+build[ \t]+web(?:[ \t]+--[\w-]+(?:=[\w./-]+)?)*[ \t]*$/.test(command)) {
      const flags = command.split(/[ \t]+/);
      if (flags.some(flag => /^--web-resources-cdn(?:=|$)/.test(flag)) && flags.some(flag => /^--no-web-resources-cdn(?:=|$)/.test(flag))) {
        result.unmeasured.push("Flutter resource flags conflict; the effective SDK setting has not been measured.");
        return result;
      }
      const local = command.split(/[ \t]+/).includes("--no-web-resources-cdn");
      observe("opengame.json", "build.command.--no-web-resources-cdn", local);
      advise("source-flutter-resources", local ? "note" : "warning", "opengame.json", "build.command.--no-web-resources-cdn", local,
        local ? "The Flutter build explicitly requests local web renderer resources; the exported files still need checking." : "The Flutter build does not explicitly request local web renderer resources.",
        "Use flutter build web --no-web-resources-cdn when supported by the installed SDK, and check that the export includes its renderer resources.");
    } else result.unmeasured.push("Flutter renderer resource flags are not measured: no direct Flutter web build command was found.");
    result.unmeasured.push("Flutter renderer selection and generated bootstrap settings require an actual export; source placeholders do not prove them.");
  }
  return result;
}

/** Markers only suggest a recipe. No build tool runs during detection. A Cargo
 * manifest alone is not a web target, and a csproj is not proof of KNI support.
 *
 * `.luaurc` is Luau's own configuration, so it marks a Luau project, except beside
 * `default.project.json`: that is Rojo's, and a Rojo project builds for Roblox, which has no
 * web export. A Luau game on the web is a page that embeds a Luau VM compiled to
 * WebAssembly (luau-web, @luau-rs/luau), so its package dependency says the same, and its
 * build is the page's, which Vite and the like write to dist. Raw WebAssembly has no marker:
 * nothing a project carries says its loader is hand-written, so `--engine webassembly` is
 * how a creator says it. */
async function detectSourceEngine(root: string, pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }): Promise<{ id: string; evidence: string }> {
  const entries = await readdir(root, { withFileTypes: true });
  const names = entries.filter(entry => entry.isFile() && !entry.isSymbolicLink()).map(entry => entry.name);
  const has = (pattern: RegExp) => names.find(name => pattern.test(name));
  const markers = [["hzproject.hzt", "kaigen"], ["ProjectSettings/ProjectVersion.txt", "unity"], ["project.godot", "godot"], ["game.project", "defold"], ["conf.lua", "love2d"], ["config.lua", "solar2d"], ["options.rpy", "renpy"], ["game/options.rpy", "renpy"], [".luaurc", "luau"], ["main.lua", "lua"], ["build.zig", "zig"], ["Package.swift", "swift"], ["Trunk.toml", "rust"]] as const;
  const csproj = has(/\.csproj$/i);
  // Every file this asks about, in one helper process, and none at all when none is there.
  const texts = await projectTexts(root, [...markers.map(([marker]) => marker), "pubspec.yaml", "Cargo.toml", ".cargo/config.toml", "go.mod", "project.json", ...(csproj ? [csproj] : [])]);
  for (const [marker, id] of markers) {
    // Any Rojo project file, not only the default name: `rojo build foo.project.json` is as
    // common, and every one of them builds for Roblox.
    if (id === "luau" && entries.some(entry => entry.name.endsWith(".project.json"))) continue;
    if (texts.has(marker)) return { id, evidence: marker };
  }
  for (const [pattern, id] of [[/\.yyp$/i, "gamemaker"], [/\.c3p$/i, "construct"], [/\.gbsproj$/i, "gbstudio"], [/\.p8$/i, "pico8"]] as const) {
    const name = has(pattern); if (name) return { id, evidence: name };
  }
  const pubspec = texts.get("pubspec.yaml");
  if (pubspec && /\bflutter\s*:/.test(pubspec)) return { id: /\bflame\s*:/.test(pubspec) ? "flame" : "flutter", evidence: "pubspec.yaml" };
  const cargo = texts.get("Cargo.toml"), cargoConfig = texts.get(".cargo/config.toml");
  if (cargo && /wasm32|wasm-bindgen|web-sys|js-sys/.test(cargo + (cargoConfig ?? ""))) return { id: /\bbevy\b/.test(cargo) ? "bevy" : "rust", evidence: "Cargo.toml (web target)" };
  const go = texts.get("go.mod");
  if (go) return { id: /hajimehoshi\/ebiten/.test(go) ? "ebiten" : "go", evidence: "go.mod" };
  if (csproj) {
    const text = texts.get(csproj) ?? "";
    return { id: /Kni|KNI|nkast/.test(text) ? "kni" : /MonoGame/.test(text) ? "monogame" : /Stride/.test(text) ? "stride" : "dotnet", evidence: csproj };
  }
  const project = texts.get("project.json");
  if (project && /"(?:gdVersion|firstLayout|layouts)"/.test(project)) return { id: "gdevelop", evidence: "project.json (editor metadata)" };
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const packages: [string, string][] = [["three", "threejs"], ["phaser", "phaser"], ["pixi.js", "pixijs"], ["@babylonjs/core", "babylonjs"], ["babylonjs", "babylonjs"], ["playcanvas", "playcanvas"], ["excalibur", "excalibur"], ["kaplay", "kaplay"], ["melonjs", "melonjs"], ["littlejsengine", "littlejs"], ["react", "react"], ["pyodide", "pyodide"], ["wasmoon", "wasmoon"], ["luau-web", "luau"], ["@luau-rs/luau", "luau"], ["@ruffle-rs/ruffle", "ruffle"], ["js-dos", "jsdos"]];
  for (const [name, id] of packages) if (deps[name]) return { id, evidence: `package.json: ${name}` };
  return { id: "custom", evidence: "No recognised engine source marker" };
}

/** The recipe for an engine with nothing more specific to say. init replaces it once it
 * knows the folder, because telling somebody to "set --output" to the folder init has just
 * detected and written down reads as a step they still have to take. */
export const GENERIC_EXPORT = "Export a static web build with index.html at its root. Set --output to that folder, then run opengame check on the export. A recipe here does not mean OpenGame has tested this engine.";

/**
 * Where an engine's page lives. Until the launch docs this was a path inside the repository,
 * because the docs were private and docs.opengame.io did not resolve. The docs are public now
 * and list only the engines OpenGame has proven on the platform, so
 * every other id points at the page that covers it: an Emscripten build at the Emscripten
 * guide, anything else compiled to WebAssembly at the WebAssembly page, any JavaScript engine
 * at the JavaScript page, everything else at the overview. engine-guides.mjs is the one
 * reading of the lists, and the docs generator calls it too.
 */
export const ENGINE_DOCS = "https://docs.opengame.io/engines/";
export function engineGuide(id: string): string {
  return ENGINE_DOCS + guidePage(id);
}
export { namedEngine };

/** What init writes for a folder with one Blazor WebAssembly project. Its output is
 * publish/wwwroot; the project's own wwwroot is the input, set as `sourceRoot` beside it. */
export const BLAZOR_PUBLISH = "dotnet publish -c Release -o publish -p:CompressionEnabled=false";

export async function engineSetup(root: string, pkg: Parameters<typeof detectSourceEngine>[1] & { scripts?: Record<string, string> }, explicit?: string, output?: string): Promise<EngineSetup> {
  if (explicit !== undefined && !Object.hasOwn(ENGINE_PRESETS, explicit)) throw new CliError("engine_invalid", `Choose --engine from ${ENGINE_IDS.join(", ")}.`, 2);
  const source = explicit === undefined ? await detectSourceEngine(root, pkg) : { id: explicit, evidence: "--engine" };
  const preset = ENGINE_PRESETS[source.id] ?? ENGINE_PRESETS.custom!;
  const setup: EngineSetup = { ...preset, evidence: source.evidence, instructions: GENERIC_EXPORT,
    // Luau is not a listed engine until a real game passes end to end, and a Luau game on the
    // web is a JavaScript page with a VM in it, so it reads the generic JavaScript page.
    docs: engineGuide(preset.id) };
  if (preset.id === "unity") setup.instructions = `Choose a Web build in Unity. Export index.html and the Build folder together, and select the folder containing both with --output. A threaded build (Enable Native C/C++ Multithreading) is supported: a release whose scan finds threads is moved onto contract ${THREADED_TARGET} automatically, which adds cross-origin isolation.`;
  if (preset.id === "godot") setup.instructions = `Export with a Web preset; keep the .pck, .wasm and loader together. Disable PWA/service-worker output. ${THREADED_EXPORTS}`;
  if (["construct", "gdevelop", "rpgmaker", "gamemaker", "ctjs", "cocos"].includes(preset.id)) setup.instructions = "Use the editor's HTML5/Web export. For Cocos choose Web Mobile. Select the folder containing index.html with --output; init does not run or alter the editor.";
  if (["stride", "monogame"].includes(preset.id)) setup.instructions = "This engine has no assumed native browser export. Port to a working KNI/browser target first, then select its static wwwroot. No build command is invented.";
  if (["jsdos", "ruffle"].includes(preset.id)) setup.instructions = "A single SWF or jsdos file can be uploaded once opengame check has validated its contents. opengame dev and opengame vendor add the standard player page around it only when the check read all of the file and the pinned player runtime is available and cleared for redistribution. A file name or this --engine choice does not make a file acceptable. If the runtime's source coverage is incomplete, the command fails with an error.";
  /* Kaigen has no editor export. Its build tool lives in the project, hz/hzbuild beside
     hzproject.hzt, so the command is only written when that file says this is the project
     root. Windows spells the path hz\hzbuild, and one manifest cannot carry both, so there
     the command is left to the creator. The renderer is WebGPU with no WebGL path. */
  if (preset.id === "kaigen") {
    setup.requires = { renderer: "webgpu" };
    const project = await projectText(root, "hzproject.hzt") !== undefined;
    if (project && process.platform !== "win32") setup.command = "hz/hzbuild wasm --release";
    // The build tool decides the folder, and a Kaigen source tree (cooked assets, shader caches, the
    // engine link) is far past the entry count init will search, so it refused every real project.
    if (project) setup.outputKnown = true;
    setup.instructions = "Build with hz/hzbuild wasm --release, which writes the multi-thread build to out/wasm/release. "
      + "hz/hzbuild wasm ios --release writes the single-thread build for Safari on iPhone and iPad to out/wasm-ios/release. "
      + "Copy opengame-global.js into the page, and templates/kaigen/opengame-kaigen.js after it if the game uses platform services. "
      + "If the page adds files of its own, assemble them in a staging folder such as dist/ and set build.output to it. "
      + "Kaigen renders with WebGPU, so init added requires.renderer webgpu to opengame.json."
      + (!project ? " No hzproject.hzt was found here, so init set no build command."
        : process.platform === "win32" ? " On Windows the build tool is hz\\hzbuild, so init set no build command. Run it before each check." : "");
  }
  if (preset.id === "flame" || preset.id === "flutter") setup.command = "flutter build web --no-web-resources-cdn";
  if (["rust", "bevy"].includes(preset.id) && (await projectText(root, "Trunk.toml") !== undefined || /data-trunk/.test(await projectText(root, "index.html") ?? ""))) setup.command = "trunk build --release";
  if (["emscripten", "raylib", "c", "cpp", "go", "ebiten", "love2d", "haxe", "heaps", "defold", "renpy"].includes(preset.id)) {
    const makefile = await projectText(root, "Makefile");
    if (makefile !== undefined) setup.command = "make";
  }
  if (["go", "ebiten"].includes(preset.id) && !setup.command && /^package main\s*$/m.test(await projectText(root, "main.go") ?? "") && await projectText(root, "web/index.html") !== undefined) {
    setup.command = "GOOS=js GOARCH=wasm go build -o web/game.wasm .";
    setup.instructions += " Keep wasm_exec.js matched to the Go compiler; use lib/wasm on Go 1.24+ or misc/wasm on older Go.";
  }
  /* Without CompressionEnabled=false a Blazor publish writes a .br and a .gz beside every
     framework file, for a server that picks an encoding per request. The runtime asks for
     the plain names, and the check refuses blazor.boot.json.br, icudt_*.dat.gz and the
     .pdb.gz symbols as nested archives, so the command init wrote failed its first check
     on a template-fresh Blazor app and on a KNI one (1 Nov 2026, SDK 8.0.427). */
  if (["dotnet", "csharp", "kni"].includes(preset.id)) {
    const projects = (await readdir(root, { withFileTypes: true })).filter(entry => entry.isFile() && /\.csproj$/i.test(entry.name));
    if (projects.length === 1 && /Microsoft\.NET\.Sdk\.BlazorWebAssembly/.test(await projectText(root, projects[0]!.name) ?? "")) {
      setup.command = BLAZOR_PUBLISH;
      setup.sourceRoot = "wwwroot";
    }
  }
  if (preset.id === "zig" && /wasm32/.test(await projectText(root, "build.zig") ?? "")) setup.command = "zig build";
  if (preset.id === "defold") setup.instructions = "Bundle the HTML5 / js-web target, not the build intermediates. Select the resulting folder with index.html using --output. If your project has a Makefile, init preserves its default build; it does not assume a bob.jar location or version.";
  // Honour the user's real preset name and path, including spaces. A guessed Web
  // preset creates a manifest whose build fails before a game can be checked.
  if (preset.id === "godot") {
    const config = await projectText(root, "export_presets.cfg") ?? "";
    const presets = godotPresets(config).filter(row => output === undefined || resolve(root, row.output) === resolve(root, output));
    if (presets.length === 1) {
      const selected = presets[0]!;
      setup.output = selected.output;
      if (selected.fields.get("platform") === '"Web"' && selected.name && selected.uniqueName && selected.target.split("/").at(-1) === LIMITS.bundle.entryPoint) {
        const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
        setup.command = `godot --headless --export-release ${quote(selected.name)} ${quote(selected.target)}`;
      } else if (selected.fields.get("platform") === '"HTML5"') {
        setup.instructions += " A Godot 3 HTML5 preset was found; export that preset with the matching Godot 3 editor. No Godot 4 command is applied to it.";
      } else {
        setup.instructions += " Automatic export needs a unique preset name and an index.html destination. Correct those fields or export the intended preset manually; no build command was chosen.";
      }
    } else if (presets.length > 1) {
      setup.outputAmbiguous = output === undefined;
      setup.instructions += " Several Web/HTML5 presets match. Select the export folder with --output and export the intended preset; no preset-specific build command was chosen.";
    }
  }
  if (setup.command && output !== undefined && resolve(root, setup.output) !== resolve(root, output)) {
    delete setup.command;
    setup.instructions += " The selected export differs from this recipe's build destination. Configure a build command that produces that folder before using --build; no automatic command was chosen.";
  }
  return setup;
}

/** Share preflight's signature rows. Looking at file names alone would treat any
 * wasm toolchain as Unity and would make init disagree with the actual checker. And
 * share its list of what to read (engine-files.json): this read every `.json` too until
 * 5 Nov 2026, which the checker does not count as evidence. A compressed script is left
 * out because this reads raw text and does not decode it; the read is partial anyway. */
export async function detectExportEngine(root: string, paths: string[]) {
  // One helper process for the folder, within the same byte budget the reads one by one had.
  const budget = LIMITS.platform.packagingRepair.textBytesMax;
  const wanted = paths.filter(name => engineFileKind(name) === "text" && !/\.(?:gz|br|unityweb)$/i.test(name));
  const texts = await projectTexts(root, wanted, { bytesMax: budget, budget });
  const sources = wanted.filter(path => texts.has(path)).map(path => ({ path, text: texts.get(path)! }));
  const found = detectEngine(paths, sources, { complete: false });
  const id = String(found.id);
  return { ...found, id: id === "unknown" || id === "none" ? "custom" : id };
}
