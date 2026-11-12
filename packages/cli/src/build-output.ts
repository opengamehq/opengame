import { realpath, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parse as parseHtml } from "parse5";
import { LIMITS } from "@opengame/shared";
import { isBundlePath } from "@opengame/protocol";
import { CliError } from "./output";
import { insideProject, withoutBom, isExcludedPath } from "./files";
import { detectExportEngine, projectText, projectTexts, type EngineSetup } from "./engines";
import { safeReadFile } from "./safe-fs";
import { scopeOwned, published, packages } from "../../shared/npm-release.json";
import { INSTALL_CLOSED, installsOpen } from "../../shared/npm-release.mjs";

const NPM_RELEASE = { scopeOwned, published, packages };

type Package = { name?: string; description?: string; packageManager?: string; scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

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
        if (!insideProject(base, await realpath(parent))) throw new CliError("output_outside_project", "The output folder must stay inside your project. Choose --output with a folder inside the project.", 2);
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
  /** The engine signature of one candidate's files, read in one helper process. */
  async function exportEngine(folder: string) {
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
    return (await detectExportEngine(base, paths.map(path => folder === "." ? path : `${folder}/${path}`))).id;
  }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  // A workspace that hoists Vite to its own root leaves it out of this package.json,
  // so a build script that runs vite is evidence too.
  const vite = Boolean(pkg.scripts?.build && (deps.vite || /(?:^|[\s;&|(])vite(?:\s|$)/.test(pkg.scripts.build)));
  const viteOut = vite ? await viteOutDir(base, pkg.scripts!.build!) : undefined;
  const bundler = pkg.scripts?.build && ["webpack", "parcel", "esbuild", "rollup"].some(name => deps[name]);
  const parcelOut = pkg.scripts?.build && deps.parcel ? parcelDistDir(pkg.scripts.build) : undefined;
  const bundlerOut = bundler ? parcelOut ?? "dist" : undefined;
  /* The output folder of a tool whose settings were actually read: Vite's config or its
     default, or parcel's --dist-dir. webpack, esbuild and rollup name theirs in code or in a
     flag this does not read, and an esbuild build can bundle straight into src/
     (review, 11 Nov 2026), so for them a page under src/ is not ruled out. */
  const builtBy = viteOut ?? parcelOut;
  const insideBuilt = (folder: string) => builtBy !== undefined && (folder === builtBy || folder.startsWith(`${builtBy}/`));
  const underSrc = (folder: string) => folder === "src" || folder.startsWith("src/");
  // A nested recognised demo says nothing about the parent. Drop only known
  // build inputs: Vite's source page or CRA's unexpanded HTML template.
  const sourceRoots = new Set<string>();
  const page = (folder: string) => folder === "." ? LIMITS.bundle.entryPoint : `${folder}/${LIMITS.bundle.entryPoint}`;
  const inspectSources = Boolean(pkg.scripts?.build) || ["flutter", "flame", "rust", "bevy"].includes(engine?.id ?? "");
  // Every candidate's page in one helper process (engines.ts, projectTexts).
  const pages = inspectSources ? await projectTexts(base, candidates.map(page)) : new Map<string, string>();
  if (inspectSources) for (const folder of candidates) {
    const text = pages.get(page(folder));
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
    /* Vite and parcel read src/ and write to the folder read above, so a page under src/ is
       one of their inputs or a tool page beside them, never the export. On 11 Nov 2026 a Three.js game
       built with `vite build` kept a weapons lab at src/weapons/lab/index.html, and init
       wrote that as build.output, because the root page was rightly dropped as Vite's input
       and the lab was the only index.html left. */
    if (builtBy !== undefined && !insideBuilt(folder) && underSrc(folder)) sourceRoots.add(folder);
    /* The root page, or one under src/, that loads a local module is one Vite serves in
       development and builds from. Only those two: a build script can move Vite's output
       anywhere afterwards (`vite build && mv dist docs` publishes docs/), and the page it
       moved loads modules too. */
    if (vite && !insideBuilt(folder) && (folder === "." || underSrc(folder))) {
      let local = false;
      type Node = { tagName?: string; attrs?: { name: string; value: string }[]; childNodes?: Node[] };
      const pending: Node[] = [parseHtml(text) as Node];
      while (pending.length) {
        const node = pending.pop()!;
        pending.push(...node.childNodes ?? []);
        const attrs = Object.fromEntries((node.attrs ?? []).map(row => [row.name, row.value]));
        if (node.tagName === "script" && attrs.type === "module") {
          // Vite never builds into the project root, so a page there that loads any
          // local module in a project with Vite and a build script is the build's
          // input, whatever the module is called. Until 23 Oct 2026 only
          // a typed module or one under src/ counted, and Vite's own vanilla layout, a root
          // main.js, was offered as the export and would have shipped unbuilt
          // source. A prebuilt root still ships as itself without a build script
          // or without Vite, and a classic script or a CDN URL says nothing. An
          // inline module is bundled by Vite too, so it counts as local.
          const source = (attrs.src ?? "").replace(/[?#].*$/, "").replace(/^\.?\//, "");
          // What Vite writes: a hashed chunk under assets/. A page that loads only those was built.
          if (VITE_CHUNK.test(source)) continue;
          if (attrs.src === undefined || isBundlePath(source)) local = true;
        }
      }
      if (local) sourceRoots.add(folder);
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
  /* Only the one export left is read for its engine signature, after the source folders are
     set aside. Until 11 Nov 2026 every candidate was read first, a Vite project's whole root
     among them, one helper process per file, and then the root was thrown away as source. */
  if (outputs.length === 1) { await validateOutput(outputs[0]!); return { output: outputs[0]!, candidates: outputs, inferred: true, engine: await exportEngine(outputs[0]!) }; }
  if (viteOut) { await validateOutput(viteOut); return { output: viteOut, candidates: [], inferred: true }; }
  if (bundlerOut) { await validateOutput(bundlerOut); return { output: bundlerOut, candidates: [], inferred: true }; }
  if (pkg.scripts?.build && deps["react-scripts"]) { await validateOutput("build"); return { output: "build", candidates: [], inferred: true }; }
  if (engine?.outputAmbiguous) throw new CliError("build_output_ambiguous", "Several engine export presets have different possible outputs. Run opengame init --output <folder> to choose one.", 2, { next: "opengame init --output <folder>" });
  if (engine && engine.id !== "custom") { await validateOutput(engine.output); return { output: engine.output, candidates: [], inferred: true, engine: engine.id }; }
  if (!pkg.scripts?.build) return { output: ".", candidates: [], inferred: true };
  throw new CliError("build_output_required", "This project's output folder is unknown. Run opengame init --output <folder> with the folder your build produces.", 2, { next: "opengame init --output <folder>" });
}

/** A chunk Vite emits, under assets/ with a content hash in its name: index-BqT3x9aZ.js, or
 * index.4f3a2b1c.js from Vite 2. */
const VITE_CHUNK = /^assets\/[^/]+[-.][\w-]{8,}\.m?js$/;

/** Parcel's --dist-dir (or -d) from the build script, when it is a plain folder. Parcel writes
 * dist by default, as webpack, esbuild and rollup starters do; their configs are code and are
 * not read, so a different folder there is caught by check finding no index.html in dist. */
function parcelDistDir(script: string): string | undefined {
  const value = /(?:^|[\s;&|(])parcel\s+build\b[^;&|)]*?\s(?:--dist-dir|-d)(?:=|\s+)(["']?)([^\s"';&|)]+)\1/.exec(script)?.[2];
  const folder = value?.replace(/^\.\//, "").replace(/\/+$/, "");
  return folder && isBundlePath(folder) ? folder : undefined;
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

/** How a project's dependencies are installed, read from its lockfile: the locked install
 * for a fresh checkout, the install that adds to an existing tree, and the folder the lockfile
 * is in, which is where either one has to run. */
export type InstallPlan = { manager: "npm" | "pnpm" | "yarn" | "bun"; command: string; install: string; folder: string };

/** The folder a project shares with its parents, up to the filesystem root or the folder that
 * holds .git: a lockfile above the repository belongs to somebody else's project. */
async function upTo(root: string): Promise<string[]> {
  const folders: string[] = [];
  for (let folder = resolve(root); ; folder = dirname(folder)) {
    folders.push(folder);
    if (dirname(folder) === folder || await stat(join(folder, ".git")).then(() => true, () => false)) break;
  }
  return folders;
}

/**
 * The install commands the project's own lockfile asks for, or null when there is none.
 *
 * The lockfile is looked for in the game's folder and then its parents, up to the repository
 * root, because a game inside a workspace is installed from the workspace's lockfile. The
 * locked install (npm ci and the frozen installs) puts back exactly what the lockfile pins
 * and refuses to rewrite it, so a deploy builds what the creator built. Without a lockfile
 * any install resolves fresh versions and writes a new one into the creator's folder, which
 * is theirs to decide. Several lockfiles in one folder are read in init's order (pnpm, yarn,
 * bun, npm), unless package.json's packageManager names one of them, which is Corepack's own
 * reading.
 */
export async function lockfileInstall(root: string, pkg: Package): Promise<InstallPlan | null> {
  const declared = typeof pkg.packageManager === "string" ? /^([a-z]+)@(\d+)?/.exec(pkg.packageManager) : null;
  for (const folder of await upTo(root)) {
    const exists = (name: string) => stat(join(folder, name)).then(info => info.isFile(), () => false);
    // Yarn 2 and later spell a locked install --immutable and refuse --frozen-lockfile's spelling of it.
    const berry = (declared?.[1] === "yarn" && Number(declared[2] ?? 1) >= 2) || await exists(".yarnrc.yml");
    const plans: [InstallPlan, string[]][] = [
      [{ manager: "pnpm", command: "pnpm install --frozen-lockfile", install: "pnpm install", folder }, ["pnpm-lock.yaml"]],
      [{ manager: "yarn", command: berry ? "yarn install --immutable" : "yarn install --frozen-lockfile", install: "yarn install", folder }, ["yarn.lock"]],
      [{ manager: "bun", command: "bun install --frozen-lockfile", install: "bun install", folder }, ["bun.lock", "bun.lockb"]],
      [{ manager: "npm", command: "npm ci", install: "npm install", folder }, ["package-lock.json", "npm-shrinkwrap.json"]],
    ];
    const found: InstallPlan[] = [];
    for (const [plan, files] of plans) {
      for (const file of files) if (await exists(file)) { found.push(plan); break; }
    }
    if (found.length) return found.find(plan => plan.manager === declared?.[1]) ?? found[0]!;
  }
  return null;
}

/** What missingDependencies found: the packages that do not resolve, which of them are
 * devDependencies, how the lockfile installs them, and whether the game's folder has any
 * node_modules at all, which is the only case an install is safe to run unasked. */
export type MissingDependencies = { missing: string[]; dev: string[]; install: InstallPlan | null; fresh: boolean };

/**
 * What a build needs installed before it can run, or null when nothing is missing.
 *
 * On 11 Nov 2026 `opengame deploy` on a fresh clone of a Vite game ran `npm run build` and
 * died with "sh: vite: command not found", exit 127, because nobody had run npm install. A
 * deploy is often the first command anybody runs in a checkout, so deploy now installs from
 * the lockfile itself (deploy.ts, installDependencies), and this is the question it asks
 * first: does every package package.json names resolve, the way Node resolves it, walking up
 * the folders so a workspace that hoists them passes. Yarn's Plug'n'Play has no node_modules
 * and counts as installed once its .pnp.cjs is there. Only a folder with no node_modules is
 * installed unasked (`fresh`), because npm ci deletes node_modules before it installs: in a
 * tree that has one, it would take linked and patched packages with it, and offline it
 * leaves nothing.
 *
 * One case is refused here, before any install, because no install can fix it: every starter
 * takes the SDK as `file:../../packages/sdk`, a path that is only real inside the OpenGame
 * repository. Copy a starter anywhere else and `npm install` still reports success, leaving a
 * symlink to nothing, and the first build died with Rollup's "failed to resolve import" --
 * found on a stranger's first walk on 22 Oct 2026, where the cause was nowhere on screen.
 * How to get the SDK follows packages/shared/npm-release.json as it stood when this CLI was
 * built: the docs' sentence while the packages are not on npm, the npm command after. The
 * command carries @latest because without a tag npm keeps the `file:` link it finds in
 * package.json (scripts/docs-install.mjs measured it). Only the three keys are imported, so
 * the bundle carries none of the file's notes.
 */
export async function missingDependencies(root: string): Promise<MissingDependencies | null> {
  let pkg: Package;
  try { pkg = await readBuildPackage(root); } catch { return null; }
  const names = [...new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})])];
  if (!names.length) return null;
  const exists = (path: string) => stat(path).then(() => true, () => false);
  const folders: string[] = [];
  for (let folder = resolve(root); ; folder = dirname(folder)) {
    if (await exists(join(folder, ".pnp.cjs"))) return null;
    folders.push(folder);
    if (dirname(folder) === folder) break;
  }
  const missing: string[] = [];
  for (const name of names) {
    // A name that is not a plain package name cannot be a folder under node_modules.
    if (!/^(?:@[\w.-]+\/)?[\w.-]+$/.test(name) || name.startsWith(".")) continue;
    let found = false;
    for (const folder of folders) if (await exists(join(folder, "node_modules", name, "package.json"))) { found = true; break; }
    if (!found) missing.push(name);
  }
  if (!missing.length) return null;
  const spec = pkg.dependencies?.[SDK] ?? pkg.devDependencies?.[SDK];
  const local = missing.includes(SDK) && typeof spec === "string" && spec.startsWith("file:") ? resolve(root, spec.slice(5)) : null;
  if (local && !(await exists(local))) {
    const message = `The OpenGame SDK is not installed. package.json takes ${SDK} from ${spec}, a path that exists only inside the OpenGame repository.`;
    if (!installsOpen(NPM_RELEASE)) {
      throw new CliError("build_failed", `${message} ${INSTALL_CLOSED.sdk} Then point that entry in package.json at your copy and run this again.`, 1);
    }
    const install = `npm i ${packages.sdk}@latest`;
    throw new CliError("build_failed", `${message} Install it from npm with ${install}, which also updates package.json, then run this again.`, 1, { next: install });
  }
  const dev = missing.filter(name => !pkg.dependencies?.[name]);
  return { missing, dev, install: await lockfileInstall(resolve(root), pkg), fresh: !(await exists(join(root, "node_modules"))) };
}
