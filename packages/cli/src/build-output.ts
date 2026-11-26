import { realpath, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { LIMITS } from "@opengame/shared";
import { isBundlePath } from "@opengame/protocol";
import { CliError } from "./output";
import { entryType, insideProject, withoutBom, isExcludedPath } from "./files";
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
  /* A site framework's own config decides both whether the build can be hosted at all and
     where it lands, so it is read first, and a build that needs a server is refused here,
     with its fix, rather than surfacing later as a folder that never appears. */
  const framework = await siteFramework(base, pkg, { strict: true });
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
  /* Toolchain caches are never the export. SvelteKit keeps a prerendered copy of every page
     under .svelte-kit/output beside the real build/, and until 17 Nov 2026 that copy made
     every built SvelteKit game ask which of the two to upload. */
  const ignored = new Set(["Library", "Temp", "obj", ".godot", ".next", "target", "Packages",
    ".svelte-kit", ".astro", ".nuxt", ".parcel-cache", ".vercel", ".netlify", ".turbo", ".angular", ".docusaurus"]);
  // Search actual entries, including named editor exports, without following
  // symlinks or walking a toolchain's cache. Stop rather than guessing on overflow.
  async function walk(folder: string, depth: number) {
    const entries = await readdir(join(base, folder), { withFileTypes: true });
    for (const entry of entries) {
      const name = folder === "." ? entry.name : `${folder}/${entry.name}`;
      // Windows lists a OneDrive file as a link; entryType asks again (files.ts).
      const type = await entryType(join(base, folder), entry);
      if (isExcludedPath(name, type.isDirectory) || ignored.has(entry.name) || type.isLink) continue;
      if (++visited > LIMITS.bundle.fileCountMax) throw new CliError("build_output_required", "There are too many project files to infer an export safely. Choose --output <folder>.", 2);
      if (type.isDirectory && depth < 4) await walk(name, depth + 1);
      else if (type.isFile && entry.name === LIMITS.bundle.entryPoint) candidates.push(folder);
    }
  }
  await walk(".", 0);
  /** The engine signature of one candidate's files, read in one helper process. */
  async function exportEngine(folder: string) {
    const paths: string[] = [];
    async function list(dir: string, depth: number) {
      for (const entry of await readdir(join(base, folder, dir), { withFileTypes: true })) {
        const name = dir ? `${dir}/${entry.name}` : entry.name;
        const type = await entryType(join(base, folder, dir), entry);
        if (type.isLink || isExcludedPath(name, type.isDirectory) || ignored.has(entry.name)) continue;
        if (paths.length >= LIMITS.bundle.fileCountMax) return;
        if (type.isFile) paths.push(name);
        else if (type.isDirectory && depth < 4) await list(name, depth + 1);
      }
    }
    await list("", 0);
    return (await detectExportEngine(base, paths.map(path => folder === "." ? path : `${folder}/${path}`))).id;
  }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  // A workspace that hoists Vite to its own root leaves it out of this package.json,
  // so a build script that runs vite is evidence too. SvelteKit builds with vite too, but
  // its adapter decides the folder, which siteFramework has already read.
  const vite = Boolean(pkg.scripts?.build && (deps.vite || /(?:^|[\s;&|(])vite(?:\s|$)/.test(pkg.scripts.build)));
  const viteOut = vite && !framework ? await viteOutDir(base, pkg.scripts!.build!) : undefined;
  const bundler = pkg.scripts?.build && ["webpack", "parcel", "esbuild", "rollup"].some(name => deps[name]);
  /* parcel writes dist unless --dist-dir says otherwise. Until 17 Nov 2026 only the flag was
     read, so `parcel build src/index.html` left src/ as the only page before a build, and
     init wrote the unbuilt source as the export. */
  const parcelOut = pkg.scripts?.build && deps.parcel && /(?:^|[\s;&|(])parcel\s+build\b/.test(pkg.scripts.build) ? parcelDistDir(pkg.scripts.build) ?? "dist" : undefined;
  const webpackOut = pkg.scripts?.build && deps.webpack ? await webpackOutDir(base) : undefined;
  const bundlerOut = bundler ? parcelOut ?? webpackOut ?? "dist" : undefined;
  /* The output folder of a tool whose settings were actually read: a site framework's config,
     Vite's config or its default, parcel's --dist-dir or its default, or the plain path in a
     webpack config. esbuild and rollup name theirs in a flag this does not read, and an
     esbuild build can bundle straight into src/ (review, 11 Nov 2026), so for them a page
     under src/ is not ruled out. */
  const builtBy = framework?.output ?? viteOut ?? parcelOut ?? webpackOut;
  const insideBuilt = (folder: string) => builtBy !== undefined && (folder === builtBy || folder.startsWith(`${builtBy}/`));
  /* Tools whose input is an HTML page with a module in it: Vite, parcel, and the site
     frameworks, whose source has no index.html at all but whose public/ is copied in. */
  const bundlesHtml = vite || Boolean(framework) || parcelOut !== undefined;
  const underSrc = (folder: string) => folder === "src" || folder.startsWith("src/");
  // A nested recognised demo says nothing about the parent. Drop only known
  // build inputs: Vite's source page or CRA's unexpanded HTML template.
  const sourceRoots = new Set<string>();
  const page = (folder: string) => folder === "." ? LIMITS.bundle.entryPoint : `${folder}/${LIMITS.bundle.entryPoint}`;
  const inspectSources = Boolean(pkg.scripts?.build) || ["flutter", "flame", "rust", "bevy"].includes(engine?.id ?? "");
  // Every candidate's page in one helper process (engines.ts, projectTexts).
  const pages = inspectSources ? await projectTexts(base, candidates.map(page)) : new Map<string, string>();
  /* parse5 is loaded here, where a build's output is being looked for, not at the top of the
     file: every command reaches this file through files.ts and auto.ts, and most of them never
     read a page (round 173A, 24 Nov 2026). */
  const { parse: parseHtml } = await import("parse5");
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
    /* Vite, Next.js and Astro copy public/ into their output, and html-webpack-plugin reads
       public/index.html as the template it writes the real page from, so that folder is
       never the export unless the build writes into it. */
    if ((vite || framework || deps["html-webpack-plugin"]) && folder === "public" && !insideBuilt(folder)) sourceRoots.add(folder);
    /* A page inside the build's own folder is one more page of that export, not another
       export. A multi-page build has one in every route's folder: a Next.js export with
       trailingSlash writes out/about/index.html and out/404/index.html, and until 17 Nov 2026
       each one was offered as a separate choice beside out/. */
    if (builtBy !== undefined && folder !== builtBy && insideBuilt(folder)) sourceRoots.add(folder);
    /* Vite and parcel read src/ and write to the folder read above, so a page under src/ is
       one of their inputs or a tool page beside them, never the export. On 11 Nov 2026 a Three.js game
       built with `vite build` kept a weapons lab at src/weapons/lab/index.html, and init
       wrote that as build.output, because the root page was rightly dropped as Vite's input
       and the lab was the only index.html left. */
    if (builtBy !== undefined && !insideBuilt(folder) && underSrc(folder)) sourceRoots.add(folder);
    /* The root page, or one under src/, that loads a local module is one Vite or parcel
       serves in development and builds from. Only those two: a build script can move the
       output anywhere afterwards (`vite build && mv dist docs` publishes docs/), and the page
       it moved loads modules too. */
    if (bundlesHtml && !insideBuilt(folder) && (folder === "." || underSrc(folder))) {
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
  if (framework) { await validateOutput(framework.output); return { output: framework.output, candidates: [], inferred: true }; }
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

/** webpack's output.path, when the config spells it as a plain folder beside the config:
 * `path: path.resolve(__dirname, "build")` or `path.join(__dirname, "build")`. The config is
 * code and is not run, so anything else (a variable, two different folders, two configs) is
 * no answer, and the caller keeps its old guess of dist. */
async function webpackOutDir(base: string): Promise<string | undefined> {
  const found: string[] = [];
  for (const name of ["webpack.config.js", "webpack.config.cjs", "webpack.config.mjs", "webpack.config.ts"]) {
    const raw = await projectText(base, name);
    if (raw === undefined) continue;
    const text = withoutComments(raw);
    for (const match of text.matchAll(/\bpath\s*:\s*(?:path\.)?(?:resolve|join)\(\s*__dirname\s*,\s*(["'`])([^"'`$]+)\1\s*\)/g)) {
      found.push(match[2]!.replace(/^\.\//, "").replace(/\/+$/, ""));
    }
  }
  const distinct = [...new Set(found)];
  return distinct.length === 1 && isBundlePath(distinct[0]!) ? distinct[0] : undefined;
}

/** Line and block comments, so a commented-out option is not read as set. Strings are
 * skipped whole, so a // inside a URL or the /* that a glob such as "/images/**" holds is
 * not taken for a comment: read that way, the glob opened a comment that ran to the next
 * real one and took output: "export" with it. A regex literal is not recognised, which
 * config files rarely hold and which at worst reads as one more string. */
function withoutComments(text: string) {
  let out = "";
  for (let at = 0; at < text.length;) {
    const char = text[at]!;
    if (char === '"' || char === "'" || char === "`") {
      let end = at + 1;
      while (end < text.length && text[end] !== char && !(char !== "`" && text[end] === "\n")) end += text[end] === "\\" ? 2 : 1;
      out += text.slice(at, end + 1);
      at = end + 1;
    } else if (text.startsWith("//", at)) {
      const end = text.indexOf("\n", at);
      at = end < 0 ? text.length : end;
    } else if (text.startsWith("/*", at)) {
      const end = text.indexOf("*/", at + 2);
      at = end < 0 ? text.length : end + 2;
      out += " ";
    } else { out += char; at++; }
  }
  return out;
}

/** A site framework whose static build init knows: where it writes and what it is called. */
export type SiteFramework = { id: "next" | "astro" | "sveltekit" | "nuxt"; name: string; output: string };

/** Every config file a framework might read, comments taken out, under one name stem. */
async function frameworkConfigs(base: string, stems: string[]) {
  const texts: string[] = [];
  for (const stem of stems) for (const extension of ["js", "mjs", "cjs", "ts", "mts", "cts"]) {
    const raw = await projectText(base, `${stem}.${extension}`);
    if (raw !== undefined) texts.push(withoutComments(raw));
  }
  return texts;
}

/** What the configs say about one option: each value written as a plain string, and whether
 * the name also appears some other way (a variable, a ternary, a shorthand property), in
 * which case the value cannot be known without running the config. */
function option(texts: string[], key: string) {
  const values: string[] = [];
  let other = false;
  for (const text of texts) {
    const literals = [...text.matchAll(new RegExp(`\\b${key}\\s*:\\s*(["'\`])([^"'\`$]*)\\1`, "g"))].map(match => match[2]!);
    values.push(...literals);
    if ((text.match(new RegExp(`\\b${key}\\b`, "g"))?.length ?? 0) > literals.length) other = true;
  }
  return { values: [...new Set(values)], other, named: values.length > 0 || other };
}

/** The value an option certainly has when it is one this refuses: every way the config writes
 * it is a refused value, and nothing writes it some other way. A config that picks between two
 * by an environment variable, "export" in one build and "standalone" in another, is left to the
 * build, which knows which one it ran with; refusing it would stop a static build that works
 * (review, 17 Nov 2026). */
function certainly(found: ReturnType<typeof option>, refused: (value: string) => boolean): string | undefined {
  return !found.other && found.values.length > 0 && found.values.every(refused) ? found.values[0] : undefined;
}

/** A base path on the game's own address other than its root. A game is served at the root
 * of its own address, so a build that asks for /my-game/assets/… finds nothing there. A full
 * URL is a CDN the creator hosts the files on, which the open contracts allow, so it is theirs. */
const subPath = (value: string) => value.startsWith("/") && !value.startsWith("//") && value.replace(/\/+$/, "") !== "";

const STATIC_DOCS = "https://docs.opengame.io/guides/web-frameworks";

function staticRequired(message: string) {
  return new CliError("static_build_required", `${message} Guide: ${STATIC_DOCS}`, 1);
}

/** A base path in a framework's config, refused with its name. `override` is the value the
 * build command itself passes (`vite build --base=/`), which wins over the config's. */
function refuseBase(texts: string[], key: string, name: string, file: string, override?: string) {
  const value = override !== undefined ? (subPath(override) ? override : undefined) : certainly(option(texts, key), subPath);
  if (value !== undefined) throw staticRequired(`${file} sets ${key} to "${value}", so every page asks for its files under ${value}, and OpenGame serves your game at the root of its own address. Remove ${key} from ${file} for the OpenGame build (or set it from an environment variable your other host sets), then run this again. ${name} builds for the root by default.`);
}

/**
 * The site framework building this project, read from package.json's build script and the
 * framework's own config, or undefined when there is none.
 *
 * Any framework works on OpenGame when it builds to static files, and each of these can,
 * but only some of them do by default. A Next.js app builds a Node server unless its config
 * says `output: "export"`, SvelteKit needs adapter-static, Nuxt needs `nuxt generate`, and
 * Astro needs to stay on its default static output. Until 17 Nov 2026 none of them was read:
 * a Next.js game with three.js in it got Three.js's folder, dist, while Next writes out/, and
 * a Next.js app with API routes got the same answer and failed later with "the build folder
 * does not exist", which says nothing about why.
 *
 * Each refusal names the setting and the change. Only literal evidence refuses, a string
 * written in the config or a missing adapter in package.json, with one exception under
 * `strict`, which init uses: a Next.js config that never mentions `output` is a server
 * build, since that is Next's default. Deploy reads the same configs without `strict`, so a
 * project whose output is set somewhere this cannot read (a shared config spread in) still
 * deploys when its build writes the folder.
 */
export async function siteFramework(root: string, pkg: Package, options: { strict?: boolean } = {}): Promise<SiteFramework | undefined> {
  const script = pkg.scripts?.build ?? "";
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const runs = (tool: RegExp) => new RegExp(`(?:^|[\\s;&|(])${tool.source}`).test(script);
  const base = await realpath(root);
  if (deps.next && runs(/next\s+build\b/)) {
    const texts = await frameworkConfigs(base, ["next.config"]);
    const output = option(texts, "output");
    const fix = `Add output: "export" to next.config so next build writes a static export to out/, then run this again. A static export cannot use server actions, cookies, rewrites, middleware or route handlers that read the request; next build names any it finds.`;
    const server = certainly(output, value => value !== "export");
    if (server !== undefined) throw staticRequired(`next.config sets output to "${server}", which builds a Node server, and OpenGame hosts static files. ${fix}`);
    // `next build && next export` is how Next.js 13 and earlier wrote out/ without the option.
    if (options.strict && !output.named && !runs(/next\s+export\b/)) throw staticRequired(`This Next.js app builds a Node server, because next.config does not set output: "export", and OpenGame hosts static files. ${fix}`);
    refuseBase(texts, "basePath", "Next.js", "next.config");
    const dist = option(texts, "distDir");
    // With output: "export", distDir is where the export goes (Next's static-exports guide).
    const folder = dist.values.length === 1 && !dist.other ? dist.values[0]!.replace(/^\.\//, "").replace(/\/+$/, "") : "out";
    return { id: "next", name: "Next.js", output: isBundlePath(folder) ? folder : "out" };
  }
  if (deps.astro && runs(/astro\s+build\b/)) {
    const texts = await frameworkConfigs(base, ["astro.config"]);
    const server = certainly(option(texts, "output"), value => value === "server" || value === "hybrid");
    if (server !== undefined) throw staticRequired(`astro.config sets output to "${server}", which needs a server, and OpenGame hosts static files. Remove output (static is Astro's default) and the server adapter, then run this again.`);
    refuseBase(texts, "base", "Astro", "astro.config");
    const out = option(texts, "outDir");
    const folder = out.values.length === 1 && !out.other ? out.values[0]!.replace(/^\.\//, "").replace(/\/+$/, "") : "dist";
    return { id: "astro", name: "Astro", output: isBundlePath(folder) ? folder : "dist" };
  }
  if (deps["@sveltejs/kit"] && runs(/vite\s+build\b/)) {
    if (!deps["@sveltejs/adapter-static"]) throw staticRequired(`This SvelteKit app has no static adapter, so vite build makes a server app, and OpenGame hosts static files. Install @sveltejs/adapter-static, use it as the adapter, and add export const prerender = true to your root +layout.js (or pass fallback: "index.html" to the adapter for a game that renders in the browser), then run this again.`);
    // SvelteKit 3 takes its options in the vite plugin, earlier versions in svelte.config.
    const texts = await frameworkConfigs(base, ["svelte.config", "vite.config"]);
    refuseBase(texts, "base", "SvelteKit", "the SvelteKit config");
    const pages = option(texts, "pages");
    const folder = pages.values.length === 1 && !pages.other ? pages.values[0]!.replace(/^\.\//, "").replace(/\/+$/, "") : "build";
    return { id: "sveltekit", name: "SvelteKit", output: isBundlePath(folder) ? folder : "build" };
  }
  if (deps.nuxt && runs(/nux[ti]\s+(?:build|generate)\b/)) {
    /* Nuxt 2 generates into dist/; Nuxt 3 and later into .output/public, and `nuxt build
       --prerender` is the same static build as `nuxt generate`. */
    const nuxt2 = /^[\^~>=v\s]*2(?:\.|$)/.test(deps.nuxt);
    if (!runs(/nux[ti]\s+generate\b/) && (nuxt2 || !runs(/nux[ti]\s+build\b[^;&|]*\s--prerender\b/))) throw staticRequired(`The build script runs nuxt build, which makes a server, and OpenGame hosts static files. Change it to nuxt generate, which writes a static site to ${nuxt2 ? "dist" : ".output/public"}, then run this again.`);
    return { id: "nuxt", name: "Nuxt", output: nuxt2 ? "dist" : ".output/public" };
  }
  /* Plain Vite has the same trap under another name: `base: "/my-repo/"`, which a GitHub
     Pages tutorial adds, makes every built page ask for /my-repo/assets/…. check reported it
     as a missing import per file with no word about base. */
  /* Only the config Vite will read: a build script that names its own with --config or -c
     (say vite.opengame.config.ts beside a GitHub Pages vite.config.ts) is left to the build. */
  if ((deps.vite || runs(/vite\s+build\b/)) && !/(?:^|[\s;&|(])vite\s+build\b[^;&|)]*\s(?:--config|-c)(?:=|\s)/.test(script)) {
    const flag = /(?:^|[\s;&|(])vite\s+build\b[^;&|)]*?\s--base(?:=|\s+)(["']?)([^\s"';&|)]*)\1/.exec(script)?.[2];
    refuseBase(await frameworkConfigs(base, ["vite.config"]), "base", "Vite", "vite.config", flag);
  }
  return undefined;
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
