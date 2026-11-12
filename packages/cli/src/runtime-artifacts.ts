import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetch } from "undici";
import { LIMITS } from "@opengame/shared";
import { isBundlePath, runtimeSettingsSchema, type RuntimeSettings } from "@opengame/protocol";
import { CliError } from "./output";
import { createVendorDispatcher } from "./vendor-network";
import type { RawRuntimeEvidence } from "./preflight";

const REINSTALL = " Reinstall the OpenGame CLI, then run the command again.";
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
type FileRow = { path: string; bytes: number; sha256: string; sourceSha256?: string; mime?: string };
type SourceDistribution = {
  schemaVersion: number; catalogEntrySha256: string;
  companion: { key: string; url: string; sha256: string; bytes: number; members: number; expandedBytes: number; memberManifestSha256: string; memberManifestBytes: number };
  sourceIndex: { path: string; bytes: number; sha256: string };
  publication: { schemaVersion: number; runtime: string; version: string; catalogEntrySha256: string; inspectionSha256: string; inspectionComplete: boolean;
    object: { key: string; sha256: string; bytes: number }; publicDownload: { url: string; sha256: string; bytes: number }; verifiedAt: string } | null;
};
type Runtime = { id: string; version: string; prefix: string; license: string; archive: { url: string; sha256: string }; licenses: { path: string; sha256: string; bytes: number; source: string }[]; files: FileRow[]; sourceDistribution?: SourceDistribution };
type ShellRow = FileRow & { target: string; sourcePath: string; sourceSha256: string };
export type RuntimeCatalog = { config: typeof LIMITS.platform.engineRuntimes; inventory: { schemaVersion: number; runtimes: Runtime[]; sourceDistributions: { schemaVersion: number; entries: unknown[]; publications: unknown[] }; shells: { schemaVersion: number; files: ShellRow[] } } };
type ShellInput = { runtimeId: string; version: string; asset: string; options: Record<string, unknown> };
type ShellTemplates = { files: Map<string, Buffer>; receipt: RuntimeCatalog["inventory"]["shells"] };
export type RuntimeArtifacts = { catalog: RuntimeCatalog; acquire: (runtime: Runtime) => Promise<Map<string, Uint8Array>>; shell: (row: ShellRow) => Promise<Uint8Array>;
  render: (input: ShellInput, templates: ShellTemplates) => Promise<Map<string, Uint8Array>> };
type RuntimeArtifactSession = () => Promise<RuntimeArtifacts>;
export function runtimeArtifactSession(provided?: RuntimeArtifacts, deadline = Date.now() + LIMITS.platform.vendoring.totalTimeoutMs): RuntimeArtifactSession {
  let pending: Promise<RuntimeArtifacts> | undefined;
  return () => pending ??= (async () => {
    const source = provided ?? await packagedRuntimeArtifacts({ deadline, bytes: 0 });
    await validateRuntimeCatalog(source.catalog);
    const acquired = new Map<string, Promise<Map<string, Uint8Array>>>();
    return { ...source, acquire: async (runtime: Runtime) => {
      await legalRuntime(runtime);
      let result = acquired.get(runtime.id);
      if (!result) { result = source.acquire(runtime); acquired.set(runtime.id, result); }
      return result;
    } };
  })();
}
type RuntimeAssetReceipt = { runtime: string; version: string; archive: Runtime["archive"]; licenses: Runtime["licenses"]; files: (FileRow & { destination: string; stagedSha256: string })[]; sourceDistribution?: SourceDistribution; source?: RawRuntimeEvidence };

/** The package is the trust root, like its SDK. The adjacent digest detects a
 * damaged/incomplete installation; it is not a signature against its owner. */
async function packagedRuntimeArtifacts(budget = { deadline: Date.now() + LIMITS.platform.vendoring.totalTimeoutMs, bytes: 0 }): Promise<RuntimeArtifacts> {
  try {
    const bytes = await readFile(new URL("../dist/runtime-catalog.json", import.meta.url));
    const digest = (await readFile(new URL("../dist/runtime-catalog.sha256", import.meta.url), "utf8")).trim();
    if (sha(bytes) !== digest) throw new Error("catalog digest");
    const catalog: RuntimeCatalog = JSON.parse(bytes.toString("utf8"));
    await validateRuntimeCatalog(catalog);
    return { catalog, acquire: runtime => acquireRuntime(catalog, runtime, budget),
      shell: row => readFile(new URL("../dist/runtime-shells/" + row.path.split("/").at(-1), import.meta.url)),
      render: async (settings, templates) => {
        const moduleUrl = new URL("../dist/runtime-builder.mjs", import.meta.url).href;
        const producer = await import(moduleUrl);
        return producer.renderRuntimeShell(settings, templates);
      } };
  } catch { throw new CliError("runtime_artifact_missing", "The CLI's reviewed runtime inventory or shell artifacts are missing or invalid. Rebuild or reinstall the complete CLI package.", 2); }
}

export async function validateRuntimeCatalog(catalog: RuntimeCatalog) {
  if (catalog?.inventory?.schemaVersion !== 1 || catalog.inventory.shells?.schemaVersion !== 1 || !Array.isArray(catalog.inventory.runtimes)) throw new Error("runtime catalog");
  if (JSON.stringify(catalog.config) !== JSON.stringify(LIMITS.platform.engineRuntimes)) throw new Error("runtime pins");
  const producer = await runtimeProducer();
  if (producer.canonicalSourceJSON(catalog.inventory.sourceDistributions) !== producer.canonicalSourceJSON(producer.sourceDistributions())) throw new Error("runtime catalog");
  const seen = new Set<string>();
  for (const runtime of catalog.inventory.runtimes) {
    const pin = (catalog.config.runtimes as Record<string, { version: string; sha256: string; license: string }>)[runtime.id];
    if (!pin || seen.has(runtime.id) || runtime.version !== pin.version || runtime.archive?.sha256 !== pin.sha256 || runtime.license !== pin.license || runtime.prefix !== `/_og/runtime/${runtime.id}@${pin.version}/`) throw new Error("runtime identity");
    // Prepared rows remain valid inventory while publication is pending. Only
    // selection may demand publication; the producer owns both validations.
    producer.validateSourceDistributionReceipt(runtime, { requirePublished: false });
    seen.add(runtime.id);
    if (!runtime.files?.length || runtime.files.length > catalog.config.bounds.fileCountMax) throw new Error("runtime inventory");
    const paths = new Set<string>(); let size = 0;
    for (const row of runtime.files) {
      if (!isBundlePath(row.path) || !row.path.startsWith(runtime.prefix.slice(1)) || paths.has(row.path.toLowerCase()) || !/^[a-f0-9]{64}$/.test(row.sha256) || !Number.isSafeInteger(row.bytes) || row.bytes < 0 || row.bytes > catalog.config.bounds.fileBytesMax) throw new Error("runtime file");
      paths.add(row.path.toLowerCase()); size += row.bytes;
    }
    if (size > catalog.config.bounds.expandedBytesMax || !runtime.licenses?.length || runtime.licenses.some(row => !runtime.files.some(file => file.path === runtime.prefix.slice(1) + row.path && file.sha256 === row.sha256 && file.bytes === row.bytes))) throw new Error("runtime notices");
  }
  if (seen.size !== Object.keys(catalog.config.runtimes).length) throw new Error("incomplete runtime inventory");
  const expected = new Map([["shells/runtime-shell.html", "index.html"], ["shells/runtime-shell.js", "_og/runtime-shell.js"]]);
  if (catalog.inventory.shells.files.length !== expected.size) throw new Error("shell inventory");
  for (const row of catalog.inventory.shells.files) {
    if (expected.get(row.path) !== row.target || row.sourcePath !== `scripts/engine-runtimes/${row.path.split("/").at(-1)}` || row.sourceSha256 !== row.sha256 || !/^[a-f0-9]{64}$/.test(row.sha256) || !Number.isSafeInteger(row.bytes) || row.bytes < 1 || row.bytes > catalog.config.bounds.fileBytesMax) throw new Error("shell identity");
    expected.delete(row.path);
  }
}

/** Share both the deadline and consumed transport bytes across every archive
 * and notice in one operation. The transport seam is also used by no-network
 * regressions; production supplies the DNS-bound dispatcher below. */
export function boundedRuntimeFetcher(urls: ReadonlySet<string>, bounds: RuntimeCatalog["config"]["bounds"], budget: { deadline: number; bytes: number },
  send: (url: string, options: Parameters<typeof fetch>[1]) => ReturnType<typeof fetch>) {
  return async (url: string, options: Record<string, unknown>) => {
    if (!urls.has(String(url)) || Date.now() >= budget.deadline) throw new Error("runtime acquisition boundary");
    const response = await send(String(url), { ...options, signal: AbortSignal.timeout(Math.max(1, Math.min(bounds.timeoutMs, budget.deadline - Date.now()))), redirect: "error" } as Parameters<typeof fetch>[1]);
    if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error("runtime source unavailable"); }
    const chunks: Uint8Array[] = []; let size = 0;
    try { for await (const chunk of response.body) {
      size += chunk.length; budget.bytes += chunk.length;
      if (size > bounds.downloadBytesMax || budget.bytes > bounds.expandedBytesMax) throw new Error("runtime download bound");
      chunks.push(chunk);
    } } finally { await response.body.cancel().catch(() => {}); }
    return new Response(Buffer.concat(chunks));
  };
}

/** No CDN fallback. Use the producer's exact approved archive and notice URLs,
 * on public DNS-pinned sockets, then verify every transformed output byte. */
async function acquireRuntime(catalog: RuntimeCatalog, runtime: Runtime, budget: { deadline: number; bytes: number }) {
  await legalRuntime(runtime);
  const pin = (catalog.config.runtimes as Record<string, any>)[runtime.id];
  const urls = new Set<string>([runtime.archive.url, ...pin.licenses.filter((row: any) => row.url).map((row: any) => row.url)]);
  if (pin.package) urls.add(`https://registry.npmjs.org/${encodeURIComponent(pin.package)}/${encodeURIComponent(pin.version)}`);
  const dispatcher = createVendorDispatcher(undefined, [...new Set([...urls].map(url => new URL(url).hostname))]);
  const cacheDir = await mkdtemp(join(tmpdir(), "opengame-runtime-"));
  try {
    const moduleUrl = new URL("../dist/runtime-builder.mjs", import.meta.url).href;
    const producer = await import(moduleUrl);
    const result = await producer.buildRuntime(runtime.id, pin, { bounds: catalog.config.bounds, cacheDir,
      fetcher: boundedRuntimeFetcher(urls, catalog.config.bounds, budget, (url, options) => fetch(url, { ...options, dispatcher })) });
    if (JSON.stringify(result.receipt) !== JSON.stringify(runtime)) throw new Error("runtime receipt mismatch");
    const files = new Map<string, Uint8Array>();
    for (const row of runtime.files) {
      const bytes = result.assets.get(row.path.slice(runtime.prefix.length - 1));
      if (!(bytes instanceof Uint8Array) || bytes.byteLength !== row.bytes || sha(bytes) !== row.sha256) throw new Error("runtime file mismatch");
      files.set(row.path, bytes);
    }
    if (files.size !== result.assets.size) throw new Error("runtime companion mismatch");
    return files;
  } catch { throw new CliError("runtime_artifact_missing", "The complete pinned runtime could not be acquired and verified against this CLI's inventory. No CDN replacement was used. Check connectivity or reinstall the CLI if its package artifacts are missing.", 2); }
  finally { await dispatcher.close(); await rm(cacheDir, { recursive: true, force: true }); }
}

async function runtimeProducer() {
  const moduleUrl = new URL("../dist/runtime-builder.mjs", import.meta.url).href;
  return import(moduleUrl);
}

async function legalRuntime(runtime: Runtime) {
  if (["ruffle", "wasmoon"].includes(runtime.id)) return;
  if (["pyodide", "flutter-canvaskit"].includes(runtime.id)) {
    try {
      const producer = await runtimeProducer();
      producer.validateSourceDistributionReceipt(runtime, { requirePublished: true });
      return;
    } catch { /* A prepared row without its exact publication is not admission. */ }
  }
  // js-dos still has two unresolved evidence records. The canonical validator's
  // no-op for other IDs is deliberately not an admission route for it.
  throw new CliError("runtime_source_unresolved", "This pinned runtime still lacks complete reviewed redistribution/source coverage. Supply a cleared self-contained export; the CLI will not substitute unreviewed runtime bytes.", 2);
}

/** Ordinary check validates the declaration without buying a network round trip.
 * The caller must say that the actual companion acquisition is deferred. */
export async function validateDeclaredRuntimes(settings: RuntimeSettings, provided?: RuntimeArtifacts) {
  const selected = runtimeSettingsSchema.parse(settings);
  const artifacts = provided ?? await packagedRuntimeArtifacts();
  await validateRuntimeCatalog(artifacts.catalog);
  for (const setting of selected) {
    const runtime = artifacts.catalog.inventory.runtimes.find(row => row.id === setting.id && row.version === setting.version);
    if (!runtime) throw new CliError("runtime_reference", `opengame.json asks for ${setting.id} ${setting.version}, and this CLI's runtime inventory does not carry it.${REINSTALL}`, 1);
    await legalRuntime(runtime);
  }
}

function runtimeReference(value: string, catalog: RuntimeCatalog): { runtime: Runtime; path: string } | undefined {
  if (value.startsWith("/_og/runtime/")) {
    const runtime = catalog.inventory.runtimes.find(row => value.startsWith(row.prefix));
    if (!runtime || !runtime.files.some(row => "/" + row.path === value)) throw new CliError("runtime_reference", `${value} is not a file this CLI's runtimes carry. Load a runtime companion file by its exact path, not a directory or an unknown version.`, 1);
    return { runtime, path: value.slice(1) };
  }
  // Only explicit npm aliases for the retained package/version are accepted.
  // Unknown versions of these packages must never fall through to generic CDN vendoring.
  const match = /^https:\/\/(?:cdn\.jsdelivr\.net\/npm\/|unpkg\.com\/)((?:@[^/]+\/)?[^/@]+)@([^/]+)\/(.*)$/.exec(value);
  if (!match) return;
  const id = Object.entries(catalog.config.runtimes).find(([, pin]) => "package" in pin && pin.package === match[1])?.[0];
  if (!id) return;
  const runtime = catalog.inventory.runtimes.find(row => row.id === id && row.version === match[2]);
  let relative = match[3]!;
  if (["wasmoon", "jsdos"].includes(id)) relative = relative.replace(/^dist\//, "");
  if (!runtime || /[%\\?#]/.test(relative) || !runtime.files.some(row => row.path === runtime.prefix.slice(1) + relative)) throw new CliError("runtime_reference", `${value} is not a file of a runtime version this CLI carries. Load an exact carried version and one of its files, not a directory.`, 1);
  return { runtime, path: runtime.prefix.slice(1) + relative };
}

export async function prepareRuntimeAssets(snapshot: Map<string, Uint8Array>, options: { references: string[]; raw?: RawRuntimeEvidence; vendor?: boolean; artifacts?: RuntimeArtifacts; session?: RuntimeArtifactSession; runtimes?: RuntimeSettings }) {
  const settings = options.runtimes === undefined ? [] : runtimeSettingsSchema.parse(options.runtimes);
  const relevant = settings.length || options.raw || options.references.some(value => value.startsWith("/_og/runtime/") || /^https:\/\/(?:cdn\.jsdelivr\.net\/npm\/|unpkg\.com\/)(?:@ruffle-rs\/ruffle|js-dos|pyodide|wasmoon)@/.test(value));
  if (!relevant) return { files: new Map<string, Uint8Array>(), replacements: new Map<string, string>(), receipts: [] as RuntimeAssetReceipt[] };
  const artifacts = options.session ? await options.session() : options.artifacts ?? await packagedRuntimeArtifacts();
  await validateRuntimeCatalog(artifacts.catalog);
  const selected = new Map<string, Runtime>(); const replacements = new Map<string, string>();
  for (const setting of settings) {
    const runtime = artifacts.catalog.inventory.runtimes.find(row => row.id === setting.id && row.version === setting.version);
    if (!runtime) throw new CliError("runtime_reference", `opengame.json asks for ${setting.id} ${setting.version}, and this CLI's runtime inventory does not carry it.${REINSTALL}`, 1);
    selected.set(runtime.id, runtime);
  }
  const target = (path: string) => options.vendor ? path.replace(/^_og\/runtime\//, ".opengame-vendor/runtime/") : path;
  for (const value of options.references) {
    const reference = runtimeReference(value, artifacts.catalog);
    if (reference) { selected.set(reference.runtime.id, reference.runtime); replacements.set(value, "/" + target(reference.path)); }
  }
  if (options.raw) {
    const runtime = artifacts.catalog.inventory.runtimes.find(row => row.id === options.raw!.engine);
    if (!runtime) throw new CliError("runtime_reference", `This CLI has no reviewed runtime for ${options.raw.path}. Export the game to HTML with an index.html, then run opengame check again.`, 2);
    const source = snapshot.get(options.raw.path);
    if (!source || source.length !== options.raw.bytes || sha(source) !== options.raw.sha256 || !options.raw.complete || options.raw.manualReviewRequired) throw new CliError("build_changed", "The game file no longer matches what opengame check read, or the check could not read all of it. Run opengame check again.", 1);
    const setting = settings.find(row => row.id === runtime.id);
    if (setting && setting.version !== runtime.version) throw new CliError("runtime_reference", `opengame.json asks for ${runtime.id} ${setting.version}, and this CLI carries ${runtime.version}.${REINSTALL}`, 1);
    selected.set(runtime.id, runtime);
  }
  const files = new Map<string, Uint8Array>(); const receipts: RuntimeAssetReceipt[] = [];
  let total = [...snapshot.values()].reduce((sum, bytes) => sum + bytes.length, 0);
  for (const runtime of selected.values()) await legalRuntime(runtime);
  for (const runtime of selected.values()) {
    const setting = settings.find(row => row.id === runtime.id);
    if (setting && setting.version !== runtime.version) throw new CliError("runtime_reference", `opengame.json asks for ${runtime.id} ${setting.version}, and this CLI carries ${runtime.version}.${REINSTALL}`, 1);
    const assets = await artifacts.acquire(runtime);
    if (assets.size !== runtime.files.length) throw new CliError("runtime_artifact_missing", `The ${runtime.id} runtime files are incomplete. Run the command again, and if it fails again, reinstall the OpenGame CLI.`, 2);
    const rows: RuntimeAssetReceipt["files"] = [];
    for (const row of runtime.files) {
      const source = assets.get(row.path);
      if (!source || source.byteLength !== row.bytes || sha(source) !== row.sha256) throw new CliError("runtime_artifact_missing", `A ${runtime.id} runtime file does not match its recorded digest. Run the command again, and if it fails again, reinstall the OpenGame CLI.`, 2);
      let bytes = source;
      // The one namespace translation is applied to reviewed runtime bytes only;
      // it retains separate artifact and staged hashes, including worker fallbacks.
      if (options.vendor && /\.(?:[cm]?js|css|json)$/.test(row.path)) bytes = Buffer.from(Buffer.from(source).toString("utf8").split("/_og/runtime/").join("/.opengame-vendor/runtime/"));
      const destination = target(row.path);
      const existing = snapshot.get(destination) ?? files.get(destination);
      if (existing && (existing.length !== bytes.length || sha(existing) !== sha(bytes))) throw new CliError("vendor_collision", `${destination} is in your export, and the CLI writes the ${runtime.id} runtime there. Remove or rename it, then run the command again.`, 1);
      if (!existing) {
        total += bytes.length;
        if (total > LIMITS.bundle.uncompressedBytesMax || snapshot.size + files.size >= LIMITS.bundle.fileCountMax) throw new CliError("vendor_limit", "The complete runtime and game exceed bundle limits. Remove what the game does not load, then run opengame check again.", 1);
        files.set(destination, bytes);
      }
      rows.push({ ...row, destination, stagedSha256: sha(bytes) });
    }
    receipts.push({ runtime: runtime.id, version: runtime.version, archive: runtime.archive, licenses: runtime.licenses, files: rows, ...(runtime.sourceDistribution ? { sourceDistribution: runtime.sourceDistribution } : {}), ...(options.raw?.engine === runtime.id ? { source: options.raw } : {}) });
  }
  if (options.raw) {
    const runtime = selected.get(options.raw.engine)!;
    const setting = settings.find(row => row.id === runtime.id);
    const templates: ShellTemplates = { receipt: artifacts.catalog.inventory.shells, files: new Map() };
    for (const row of artifacts.catalog.inventory.shells.files) {
      const template = await artifacts.shell(row);
      if (template.length !== row.bytes || sha(template) !== row.sha256) throw new CliError("runtime_artifact_missing", `A canonical runtime shell failed its digest.${REINSTALL}`, 2);
      templates.files.set(row.path, Buffer.from(template));
    }
    let rendered: Map<string, Uint8Array>;
    try {
      rendered = await artifacts.render({ runtimeId: runtime.id, version: runtime.version, asset: options.raw.path,
        options: setting && "options" in setting ? setting.options ?? {} : {} }, templates);
    } catch { throw new CliError("runtime_artifact_missing", `The packaged canonical runtime renderer could not verify and render its shell.${REINSTALL}`, 2); }
    for (const row of artifacts.catalog.inventory.shells.files) {
      const destination = options.vendor ? row.target.replace(/^_og\//, ".opengame-vendor/") : row.target;
      if (snapshot.has(destination) || files.has(destination)) throw new CliError("vendor_collision", `The canonical runtime shell would overwrite ${destination} in your export. Remove or rename that file, then run the command again.`, 1);
      let bytes = rendered.get(row.target);
      if (!bytes) throw new CliError("runtime_artifact_missing", `The canonical renderer omitted a shell file.${REINSTALL}`, 2);
      if (options.vendor && row.target === "index.html") {
        const text = Buffer.from(bytes).toString("utf8");
        const prefix = `"prefix":${JSON.stringify(runtime.prefix)}`;
        const script = 'src="/_og/runtime-shell.js"';
        if (text.split(prefix).length !== 2 || text.split(script).length !== 2) throw new CliError("runtime_artifact_missing", `The canonical renderer's relocation fields are missing or ambiguous.${REINSTALL}`, 2);
        // Only generated URL fields move. A raw asset may legitimately contain
        // the same path segment in its own name, and its identity never moves.
        bytes = Buffer.from(text.replace(prefix, `"prefix":${JSON.stringify("/" + target(runtime.prefix.slice(1)))}`)
          .replace(script, 'src="/.opengame-vendor/runtime-shell.js"'));
      }
      files.set(destination, bytes);
      total += bytes.length;
      if (total > LIMITS.bundle.uncompressedBytesMax || snapshot.size + files.size > LIMITS.bundle.fileCountMax) throw new CliError("vendor_limit", "The canonical shell and complete runtime exceed bundle limits. Remove what the game does not load, then run opengame check again.", 1);
      receipts.find(row => row.runtime === runtime.id)!.files.push({ ...row, destination, stagedSha256: sha(bytes) });
    }
  }
  return { files, replacements, receipts };
}
