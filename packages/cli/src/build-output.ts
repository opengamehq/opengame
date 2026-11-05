import { realpath, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parse as parseHtml } from "parse5";
import { LIMITS } from "@opengame/shared";
import { isBundlePath } from "@opengame/protocol";
import { CliError } from "./output";
import { insideProject, withoutBom, isExcludedPath } from "./files";
import { detectExportEngine, projectText, type EngineSetup } from "./engines";
import { safeReadFile } from "./safe-fs";
import { scopeOwned, published, packages } from "../../shared/npm-release.json";
import { INSTALL_CLOSED, installsOpen } from "../../shared/npm-release.mjs";

const NPM_RELEASE = { scopeOwned, published, packages };

type Package = { name?: string; description?: string; scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

/** Existing exports take precedence over a framework's default directory. Several
 * exports require a choice because a level editor can also contain index.html. */
export async function detectBuildOutput(root: string, pkg: Package, explicit?: string, engine?: EngineSetup) {
  const base = await realpath(root);
  async function validateOutput(output: string) {
    if (output !== "." && !isBundlePath(output)) throw new CliError("build_output_invalid", "Use --output with a relative folder inside your project.", 2);
    const target = resolve(base, output);
    // A not-yet-built directory is allowed. Existing parents must still be local.
    let parent = target;
    for (;;) {
      try {
        if (!insideProject(base, await realpath(parent))) throw new CliError("output_outside_project", "The output folder must stay inside your project.", 2);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        const next = resolve(parent, "..");
        if (next === parent) throw error;
        parent = next;
      }
    }
  }
  if (explicit !== undefined) {
    await validateOutput(explicit);
    return { output: explicit, candidates: [explicit], inferred: false };
  }
  if (engine?.outputKnown) {
    await validateOutput(engine.output);
    return { output: engine.output, candidates: [engine.output], inferred: true };
  }
  const candidates: string[] = [];
  const exports = new Map<string, string>();
  let visited = 0;
  const ignored = new Set(["Library", "Temp", "obj", ".godot", ".next", "target", "Packages"]);
  // Search actual entries, including named editor exports, without following
  // symlinks or walking a toolchain's cache. Stop rather than guessing on overflow.
  async function walk(folder: string, depth: number) {
    const entries = await readdir(join(base, folder), { withFileTypes: true });
    for (const entry of entries) {
      const name = folder === "." ? entry.name : `${folder}/${entry.name}`;
      if (isExcludedPath(name) || ignored.has(entry.name) || entry.isSymbolicLink()) continue;
      if (++visited > LIMITS.bundle.fileCountMax) throw new CliError("build_output_required", "There are too many project files to infer an export safely. Choose --output <folder>.", 2);
      if (entry.isDirectory() && depth < 4) await walk(name, depth + 1);
      else if (entry.isFile() && entry.name === LIMITS.bundle.entryPoint) candidates.push(folder);
    }
  }
  await walk(".", 0);
  for (const folder of candidates) {
    const paths: string[] = [];
    async function list(dir: string, depth: number) {
      for (const entry of await readdir(join(base, folder, dir), { withFileTypes: true })) {
        const name = dir ? `${dir}/${entry.name}` : entry.name;
        if (entry.isSymbolicLink() || isExcludedPath(name) || ignored.has(entry.name)) continue;
        if (paths.length >= LIMITS.bundle.fileCountMax) return;
        if (entry.isFile()) paths.push(name);
        else if (entry.isDirectory() && depth < 4) await list(name, depth + 1);
      }
    }
    await list("", 0);
    exports.set(folder, (await detectExportEngine(base, paths.map(path => folder === "." ? path : `${folder}/${path}`))).id);
  }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  // A workspace that hoists Vite to its own root leaves it out of this package.json,
  // so a build script that runs vite is evidence too.
  const vite = Boolean(pkg.scripts?.build && (deps.vite || /(?:^|[\s;&|(])vite(?:\s|$)/.test(pkg.scripts.build)));
  const viteOut = vite ? await viteOutDir(base, pkg.scripts!.build!) : undefined;
  // A nested recognised demo says nothing about the parent. Drop only known
  // build inputs: Vite's source page or CRA's unexpanded HTML template.
  const sourceRoots = new Set<string>();
  if (pkg.scripts?.build || ["flutter", "flame", "rust", "bevy"].includes(engine?.id ?? "")) for (const folder of candidates) {
    const text = await projectText(base, folder === "." ? LIMITS.bundle.entryPoint : `${folder}/${LIMITS.bundle.entryPoint}`);
    if (text === undefined) throw new CliError("build_output_required", "A candidate export could not be safely inspected within the source-text limit. Choose --output <folder> after checking that export.", 2);
    if (deps["react-scripts"] && folder === "public" && text.includes("%PUBLIC_URL%")) sourceRoots.add(folder);
    type SourceNode = { tagName?: string; attrs?: { name: string; value: string }[]; childNodes?: SourceNode[] };
    const sourceNodes: SourceNode[] = [parseHtml(text) as SourceNode];
    while (sourceNodes.length) {
      const node = sourceNodes.pop()!;
      sourceNodes.push(...node.childNodes ?? []);
      if (["flutter", "flame"].includes(engine?.id ?? "") && folder === "web" && node.tagName === "base" &&
          node.attrs?.some(attr => attr.name === "href" && attr.value === "$FLUTTER_BASE_HREF")) sourceRoots.add(folder);
      if (["rust", "bevy"].includes(engine?.id ?? "") && folder === "." &&
          node.attrs?.some(attr => attr.name === "data-trunk")) sourceRoots.add(folder);
    }
    // Vite copies public/ into its output, so that folder is never the export.
    if (vite && folder === "public") sourceRoots.add(folder);
    if (vite && folder === ".") {
      type Node = { tagName?: string; attrs?: { name: string; value: string }[]; childNodes?: Node[] };
      const pending: Node[] = [parseHtml(text) as Node];
      while (pending.length) {
        const node = pending.pop()!;
        pending.push(...node.childNodes ?? []);
        const attrs = Object.fromEntries((node.attrs ?? []).map(row => [row.name, row.value]));
        if (node.tagName === "script" && attrs.type === "module") {
          // Vite never builds into the project root, so a root page that loads any
          // local module in a project with Vite and a build script is the build's
          // input, whatever the module is called. Until 23 Oct 2026 only a typed
          // module or one under src/ counted, and Vite's own vanilla layout, a root
          // main.js, was offered as the export and would have shipped unbuilt
          // source. A prebuilt root still ships as itself without a build script
          // or without Vite, and a classic script or a CDN URL says nothing. An
          // inline module is bundled by Vite too, so it counts as local.
          const source = (attrs.src ?? "").replace(/[?#].*$/, "").replace(/^\.?\//, "");
          if (attrs.src === undefined || isBundlePath(source)) sourceRoots.add(folder);
        }
      }
    }
  }
  /* A Blazor WebAssembly project keeps its page in wwwroot beside the .csproj, and publish
     copies that into publish/wwwroot with _framework added. Offered as the export, it
     shipped a page whose blazor.webassembly.js does not exist, and since it differs from
     the recipe's folder init dropped the publish command too; once published it made the
     two folders ambiguous. Every `dotnet new blazorwasm` and KNI web project has one, and
     the test fixture, a bare .csproj, did not (1 Nov 2026). engines.ts sets sourceRoot for a
     folder with one Blazor WebAssembly .csproj, whatever build command init then writes:
     an npm build script beside it does not make wwwroot the export. */
  if (engine?.sourceRoot) sourceRoots.add(engine.sourceRoot);
  const outputs = candidates.filter(name => !sourceRoots.has(name));
  if (outputs.length > 1) throw new CliError("build_output_ambiguous", `Several build folders contain index.html: ${outputs.join(", ")}. Run opengame init --output <folder> to choose one.`, 2, { next: "opengame init --output <folder>" });
  if (outputs.length === 1) { await validateOutput(outputs[0]!); return { output: outputs[0]!, candidates: outputs, inferred: true, engine: exports.get(outputs[0]!) }; }
  if (viteOut) { await validateOutput(viteOut); return { output: viteOut, candidates: [], inferred: true }; }
  if (pkg.scripts?.build && ["webpack", "parcel", "esbuild", "rollup"].some(name => deps[name])) { await validateOutput("dist"); return { output: "dist", candidates: [], inferred: true }; }
  if (pkg.scripts?.build && deps["react-scripts"]) { await validateOutput("build"); return { output: "build", candidates: [], inferred: true }; }
  if (engine?.outputAmbiguous) throw new CliError("build_output_ambiguous", "Several engine export presets have different possible outputs. Run opengame init --output <folder> to choose one.", 2, { next: "opengame init --output <folder>" });
  if (engine && engine.id !== "custom") { await validateOutput(engine.output); return { output: engine.output, candidates: [], inferred: true, engine: engine.id }; }
  if (!pkg.scripts?.build) return { output: ".", candidates: [], inferred: true };
  throw new CliError("build_output_required", "This project's output folder is unknown. Run opengame init --output <folder> with the folder your build produces.", 2, { next: "opengame init --output <folder>" });
}

const VITE_CONFIGS = ["vite.config.js", "vite.config.mjs", "vite.config.cjs", "vite.config.ts", "vite.config.mts", "vite.config.cts"];

/** Vite's output folder: dist, unless the config names another as a plain string.
 * The config is code and is never run here, so a computed outDir, two configs, two
 * different literals or a `root` option (which moves both the page and the output)
 * give no answer and the creator is asked to choose. A plugin's own outDir option
 * is read as the build's; the folder it names then has no index.html and `check`
 * says so, which is a refusal rather than an upload of the wrong files. */
async function viteOutDir(base: string, script: string) {
  const found: string[] = [];
  // The build script can say the same things on the command line. `vite build app`
  // builds app/index.html into app/dist, and that page would otherwise be the only
  // candidate left and ship unbuilt, so a positional root, --root or another
  // --config asks. Any word not known to be a flag's value is read as a root.
  for (const run of script.matchAll(/(?:^|[\s;&|(])vite\s+build\b([^;&|)]*)/g)) {
    const words = run[1]!.trim().split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      const [flag, inline] = words[i]!.split("=", 2) as [string, string | undefined];
      if (flag === "--outDir") { const value = inline ?? words[++i]; found.push(value ? value.replace(/^["']|["']$/g, "").replace(/^\.\//, "").replace(/\/+$/, "") : ""); }
      else if (["--root", "--config", "-c"].includes(flag) || !flag.startsWith("-")) found.push("");
      else if (inline === undefined && ["--mode", "-m", "--base", "--assetsDir", "--logLevel", "-l", "--filter", "-f", "--target"].includes(flag)) i++;
    }
  }
  let configs = 0;
  for (const name of VITE_CONFIGS) {
    const raw = await projectText(base, name);
    if (raw === undefined) continue;
    configs++;
    // Whole-line and block comments only: a // inside a URL string is not one.
    const text = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    if (/\broot\s*:/.test(text)) found.push("");
    const mentions = text.match(/\boutDir\b/g)?.length ?? 0;
    const literals = [...text.matchAll(/\boutDir\s*:\s*(["'`])([^"'`$]+)\1/g)].map(match => match[2]!.replace(/^\.\//, "").replace(/\/+$/, ""));
    // Any outDir that is not a plain string literal is computed, and unknowable here.
    if (mentions > literals.length) found.push("");
    found.push(...literals);
  }
  const distinct = [...new Set(found)];
  if (!distinct.length) return "dist";
  if (configs > 1 || distinct.length > 1 || !distinct[0] || !isBundlePath(distinct[0])) {
    throw new CliError("build_output_required", "Vite's root or output folder is set in a way that cannot be read without running the build. Run opengame init --output <folder> with the folder your build produces.", 2, { next: "opengame init --output <folder>" });
  }
  return distinct[0];
}

export async function readBuildPackage(root: string): Promise<Package> {
  try {
    const bytes = await safeReadFile(await realpath(root), "package.json", LIMITS.platform.manifest.bytesMax);
    const value: unknown = JSON.parse(withoutBom(bytes.toString("utf8")));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Package;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    if (error instanceof CliError && error.code === "filesystem_unsupported") throw error;
    throw new CliError("package_unreadable", "Could not read package.json as bounded regular JSON. Correct the file, then retry.", 2);
  }
}

const SDK = "@opengamehq/sdk";

/**
 * Refuse a build whose SDK is not installed, before the bundler gets to say it its own way.
 *
 * Every starter takes the SDK as `file:../../packages/sdk`, and until the packages are on npm
 * its `.npmrc` points the scope at a host that cannot resolve (see
 * scripts/npm-release-sync.mjs). That path is only real inside the OpenGame repository. Copy
 * a starter anywhere else and `npm install` still reports success, leaving a symlink to
 * nothing, and the first build dies with Rollup's "failed to resolve import" -- found on a
 * stranger's first walk on 22 Oct 2026, where the cause was nowhere on screen.
 *
 * How to get the SDK follows packages/shared/npm-release.json as it stood when this CLI was
 * built: the docs' sentence while the packages are not on npm, the npm command after. The
 * command carries @latest because without a tag npm keeps the `file:` link it finds in
 * package.json (scripts/docs-install.mjs measured it). Only the three keys are imported, so
 * the bundle carries none of the file's notes.
 *
 * Resolution walks up the folders as Node's does, so a workspace that hoists the package
 * passes. Yarn's Plug'n'Play has no node_modules to look in and is left to its own errors.
 */
export async function assertSdkInstalled(root: string) {
  let pkg: Package;
  try { pkg = await readBuildPackage(root); } catch { return; }
  const spec = pkg.dependencies?.[SDK] ?? pkg.devDependencies?.[SDK];
  if (typeof spec !== "string") return;
  const exists = (path: string) => stat(path).then(() => true, () => false);
  if (await exists(join(root, ".pnp.cjs"))) return;
  for (let folder = resolve(root); ; folder = dirname(folder)) {
    if (await exists(join(folder, "node_modules", SDK, "package.json"))) return;
    if (dirname(folder) === folder) break;
  }
  const local = spec.startsWith("file:") ? resolve(root, spec.slice(5)) : null;
  if (local && !(await exists(local))) {
    const missing = `The OpenGame SDK is not installed. package.json takes ${SDK} from ${spec}, a path that exists only inside the OpenGame repository.`;
    if (!installsOpen(NPM_RELEASE)) {
      throw new CliError("build_failed", `${missing} ${INSTALL_CLOSED.sdk} Then point that entry in package.json at your copy and run this again.`, 1);
    }
    const install = `npm i ${packages.sdk}@latest`;
    throw new CliError("build_failed", `${missing} Install it from npm with ${install}, which also updates package.json, then run this again.`, 1, { next: install });
  }
  throw new CliError("build_failed", `The OpenGame SDK is in package.json but not installed. Install the project's dependencies, for example with npm install, then run this again.`, 1, { next: "npm install" });
}
