import { createHash, randomUUID } from "node:crypto";
import { compressedBrowserAsset } from "@opengame/preflight";
import { compressedTextReaders } from "@opengame/preflight/node-compression";
import { lstat, realpath, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { isBundlePath, withoutCover } from "@opengame/protocol";
import { assertNoReservedRuntimePaths, insideProject, loadManifest, outputFolder, replaceFile } from "./files";
import type { Output } from "./output";
import { fetch } from "undici";
import { createVendorDispatcher } from "./vendor-network";
export { createVendorDispatcher, publicVendorAddress } from "./vendor-network";
import { readProject, type Project } from "./project";
import { apiOrigin } from "./http";
import { safeReadFile, writeStage } from "./safe-fs";
import { LIMITS } from "@opengame/shared";
import { parse as parseHtml } from "parse5";
import { parseScript, type ScriptNode } from "../../preflight/src/script-source";
import { CliError } from "./output";
import type { RuntimeSettings } from "@opengame/protocol";
import { prepareRuntimeAssets, runtimeArtifactSession, type RuntimeArtifacts } from "./runtime-artifacts";

const policy = LIMITS.platform.vendoring;
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const dependencyUrl = /^https:\/\/(?:cdn\.jsdelivr\.net\/npm\/|unpkg\.com\/)/;

type RuntimeRecipe = { package: string; version: string; path: string; files: string[]; sha256: Record<string, string> };
// Preserve upstream-file recipes for other libraries. Engine package references
// are intercepted by the artifact path before this generic downloader runs.
const runtimeRecipes = () => (policy as typeof policy & { runtimeRecipes?: RuntimeRecipe[] }).runtimeRecipes ?? [];
type VendorSource = { package: string; version: string; base: string; url: URL; relative: string; directory?: { files: string[] }; expectedSha256?: string; runtime?: RuntimeRecipe };
const SUPPORTED = /\.(?:[cm]?js|css|wasm|woff2?|ttf|otf)$/i;
function approved(value: string): VendorSource {
  try {
    if (/[\\%\x00-\x20]/.test(value) || value.split(/[/?#]/).some(piece => piece === "." || piece === "..")) throw new Error();
    let url = new URL(value);
    if (url.hostname === "unpkg.com") {
      if (url.protocol !== "https:" || url.port || url.username || url.password || url.search || url.hash) throw new Error();
      url = new URL("https://cdn.jsdelivr.net/npm" + url.pathname);
    }
    const match = /^\/npm\/((?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+)@(\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?)\/(.+)$/.exec(url.pathname);
    const runtime = match ? runtimeRecipes().find(recipe => recipe.package === match[1] && recipe.version === match[2] && (recipe.path === match[3] || recipe.files.some(file => recipe.path + file === match[3]))) : undefined;
    if (runtime && (!runtime.files.length || !runtime.path.endsWith("/") || !isBundlePath(runtime.path.slice(0, -1)) || !runtime.files.every(file => isBundlePath(file) && /^[a-f0-9]{64}$/.test(runtime.sha256[file] ?? "")))) throw new Error();
    const directory = match ? (runtime?.path === match[3] ? runtime : policy.directoryRecipes.find(recipe => recipe.package === match[1] && recipe.path === match[3])) : undefined;
    const expectedSha256 = runtime ? runtime.sha256[match![3]!.slice(runtime.path.length)] : undefined;
    if (runtime && !directory && !/^[a-f0-9]{64}$/.test(expectedSha256 ?? "")) throw new Error();
    if (url.protocol !== "https:" || !policy.hosts.includes(url.hostname) || url.port || url.username || url.password || url.search || url.hash || !match
      || /[%\\]/.test(url.pathname) || match[3]!.split("/").some(piece => piece === "." || piece === "..") || (!SUPPORTED.test(match[3]!) && !directory && !runtime) || match[3]!.includes("+esm")) throw new Error();
    return { package: match[1]!, version: match[2]!, relative: match[3]!, base: `${url.origin}/npm/${match[1]}@${match[2]}/`, url, ...(directory ? { directory } : {}), ...(expectedSha256 ? { expectedSha256 } : {}), ...(runtime ? { runtime } : {}) };
  } catch { throw new CliError("vendor_source", "Use a version-pinned script, stylesheet, font or Wasm file from an approved dependency source. Bundle dependencies with other URLs in your build.", 1); }
}


type Reference = { value: string; start: number; end: number; documentRelative?: boolean; raw?: boolean };
function moduleSpecifiers(text: string): Reference[] {
  const root = parseScript(text);
  if (!root) throw new CliError("vendor_module", "A script dependency could not be parsed as JavaScript. Include it through your build tool.", 1);
  const found: Reference[] = [];
  const stack: ScriptNode[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.type === "CallExpression" && ["fetch", "importScripts"].includes(String((node.callee as ScriptNode | undefined)?.name))) {
      const args = node.arguments as ScriptNode[] | undefined;
      for (const literal of (node.callee as ScriptNode).name === "fetch" ? (args ?? []).slice(0, 1) : args ?? []) {
        if (typeof literal.value === "string") found.push({ value: literal.value, start: Number(literal.start), end: Number(literal.end), documentRelative: true });
      }
    }
    // Explicit decoder configuration is a dependency sink; a string merely
    // mentioning a CDN (including a library's documentation) is not one.
    if (node.type === "CallExpression" && (node.callee as ScriptNode | undefined)?.type === "MemberExpression") {
      const callee = node.callee as ScriptNode;
      const method = (callee.property as ScriptNode | undefined)?.name;
      if (["setDecoderPath", "setTranscoderPath"].includes(String(method))) {
        const literal = (node.arguments as ScriptNode[] | undefined)?.[0];
        if (typeof literal?.value === "string") found.push({ value: literal.value, start: Number(literal.start), end: Number(literal.end) });
      }
    }
    if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration", "ImportExpression"].includes(node.type)) {
      const source = node.source as ScriptNode | undefined;
      if (typeof source?.value === "string") found.push({ value: source.value, start: Number(source.start), end: Number(source.end) });
    }
    if (node.type === "NewExpression" && (node.callee as ScriptNode | undefined)?.type === "Identifier" && (node.callee as ScriptNode).name === "URL") {
      const args = node.arguments as ScriptNode[] | undefined;
      const literal = args?.[0], base = args?.[1];
      const meta = base?.object as ScriptNode | undefined;
      if (typeof literal?.value === "string" && base?.type === "MemberExpression" && base.computed === false
        && (base.property as ScriptNode | undefined)?.name === "url" && meta?.type === "MetaProperty"
        && (meta.meta as ScriptNode | undefined)?.name === "import" && (meta.property as ScriptNode | undefined)?.name === "meta") {
        found.push({ value: literal.value, start: Number(literal.start), end: Number(literal.end) });
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) { for (const child of value) if (child && typeof child === "object" && "type" in child) stack.push(child as ScriptNode); }
      else if (value && typeof value === "object" && "type" in value) stack.push(value as ScriptNode);
    }
  }
  return found;
}

function stylesheetSpecifiers(text: string) {
  const active = text.replace(/\/\*[\s\S]*?\*\//g, comment => " ".repeat(comment.length));
  const found: { value: string; start: number; end: number }[] = [];
  for (const match of active.matchAll(/url\(\s*(?:"([^"\n]*)"|'([^'\n]*)'|([^\s)'"\n]+))\s*\)|@import\s+(?:"([^"\n]*)"|'([^'\n]*)')/gi)) {
    const value = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5];
    if (!value || /^(?:data:|#|var\()/i.test(value)) continue;
    const start = (match.index ?? 0) + match[0].indexOf(value);
    found.push({ value, start, end: start + value.length });
  }
  return found;
}

function importMapReferences(text: string): Reference[] {
  // JSON parsing rejects expressions; the AST provides exact literal offsets.
  try { JSON.parse(text); } catch { return []; }
  const root = parseScript("(" + text + ")");
  const expression = ((root?.body as ScriptNode[] | undefined)?.[0]?.expression) as ScriptNode | undefined;
  const properties = (node: ScriptNode | undefined) => node?.type === "ObjectExpression" ? node.properties as ScriptNode[] : [];
  const found: Reference[] = [];
  const table = (node: ScriptNode | undefined) => {
    for (const property of properties(node)) {
      const value = property.value as ScriptNode;
      if (typeof value?.value === "string") found.push({ value: value.value, start: Number(value.start) - 1, end: Number(value.end) - 1 });
    }
  };
  for (const property of properties(expression)) {
    const key = (property.key as ScriptNode)?.value;
    if (key === "imports") table(property.value as ScriptNode);
    if (key === "scopes") for (const scope of properties(property.value as ScriptNode)) table(scope.value as ScriptNode);
  }
  return found;
}

/** Parse loading sites, preserving source offsets so comments and inert string
 * literals stay byte-for-byte intact even when they mention the same URL. */
export function references(name: string, text: string): Reference[] {
  if (/\.importmap$/i.test(name)) return importMapReferences(text);
  if (/\.[cm]?js$/i.test(name)) return moduleSpecifiers(text);
  if (/\.css$/i.test(name)) return stylesheetSpecifiers(text).map(row => ({ ...row, raw: true }));
  if (!/\.html?$/i.test(name)) return [];
  const found: Reference[] = [];
  type Node = { tagName?: string; attrs?: { name: string; value: string }[]; childNodes?: Node[];
    value?: string; sourceCodeLocation?: { startOffset?: number; attrs?: Record<string, { startOffset: number; endOffset: number }> } };
  const pending: Node[] = [parseHtml(text, { sourceCodeLocationInfo: true }) as Node];
  while (pending.length) {
    const node = pending.pop()!;
    pending.push(...node.childNodes ?? []);
    const attrs = Object.fromEntries((node.attrs ?? []).map(row => [row.name, row.value]));
    const attribute = node.tagName === "script" ? "src" : node.tagName === "link" && /^(?:stylesheet|modulepreload|preload)$/i.test(attrs.rel ?? "") ? "href" : undefined;
    if (attribute && attrs[attribute]) {
      const location = node.sourceCodeLocation?.attrs?.[attribute];
      if (location) {
        // Replace the complete attribute value, retaining the attribute name.
        const original = text.slice(location.startOffset, location.endOffset);
        const equal = original.indexOf("=");
        if (equal >= 0) found.push({ value: attrs[attribute]!, start: location.startOffset + equal + 1, end: location.endOffset });
      }
    }
    if (node.tagName === "script" && !attrs.src && (!attrs.type || /^(?:module|(?:text|application)\/javascript)$/i.test(attrs.type))) {
      for (const child of node.childNodes ?? []) if (child.value !== undefined && child.sourceCodeLocation?.startOffset !== undefined) {
        const offset = child.sourceCodeLocation.startOffset;
        found.push(...moduleSpecifiers(child.value).map(row => ({ ...row, start: row.start + offset, end: row.end + offset })));
      }
    }
    if (node.tagName === "script" && attrs.type === "importmap") {
      for (const child of node.childNodes ?? []) if (child.value !== undefined && child.sourceCodeLocation?.startOffset !== undefined) {
        const offset = child.sourceCodeLocation.startOffset;
        found.push(...importMapReferences(child.value).map(row => ({ ...row, start: row.start + offset, end: row.end + offset })));
      }
    }
    if (node.tagName === "style") for (const child of node.childNodes ?? []) if (child.value !== undefined && child.sourceCodeLocation?.startOffset !== undefined) {
      const offset = child.sourceCodeLocation.startOffset;
      found.push(...stylesheetSpecifiers(child.value).map(row => ({ ...row, raw: true, start: row.start + offset, end: row.end + offset })));
    }
  }
  return found;
}


type IntegrityNode = { tagName?: string; attrs?: { name: string; value: string }[]; childNodes?: IntegrityNode[];
  sourceCodeLocation?: { attrs?: Record<string, { startOffset: number; endOffset: number }> } };
export function updateIntegrity(text: string, targets: Map<string, string>, snapshot: Map<string, Uint8Array>, originalDependencies: Map<string, Uint8Array>) {
  const changes: { start: number; end: number; value: string }[] = [];
  const pending: IntegrityNode[] = [parseHtml(text, { sourceCodeLocationInfo: true }) as IntegrityNode];
  while (pending.length) {
    const node = pending.pop()!;
    pending.push(...node.childNodes ?? []);
    if (!["script", "link"].includes(node.tagName ?? "")) continue;
    const attributes = Object.fromEntries((node.attrs ?? []).map(row => [row.name, row.value]));
    const target = targets.get(attributes.src ?? attributes.href ?? "");
    const location = node.sourceCodeLocation?.attrs?.integrity;
    if (!target || !location || !attributes.integrity || !snapshot.has(target)) continue;
    const source = originalDependencies.get(target);
    if (!source) throw new CliError("vendor_integrity", "The original dependency bytes are unavailable for integrity verification. Bundle it locally.", 1);
    const tokens = attributes.integrity.split(/\s+/).map(token => /^(sha256|sha384|sha512)-([A-Za-z0-9+/_-]+=*)(?:\?.*)?$/.exec(token)).filter((token): token is RegExpExecArray => token !== null);
    const strongest = ["sha512", "sha384", "sha256"].find(algorithm => tokens.some(token => token[1] === algorithm));
    if (!strongest || !tokens.filter(token => token[1] === strongest).some(token => {
      const expected = Buffer.from(token[2]!, "base64");
      return expected.equals(createHash(strongest).update(source).digest());
    })) throw new CliError("vendor_integrity", "The downloaded dependency does not match the page's integrity value. Keep the original integrity check and confirm the dependency before changing it.", 1);
    const integrity = "sha384-" + createHash("sha384").update(snapshot.get(target)!).digest("base64");
    changes.push({ start: location.startOffset, end: location.endOffset, value: `integrity="${integrity}"` });
  }
  for (const row of changes.sort((a, b) => b.start - a.start)) text = text.slice(0, row.start) + row.value + text.slice(row.end);
  return text;
}

/** Preserve precompressed engine bytes. Rewriting their decoded source could
 * invalidate loader sizes and hashes, so require the creator's build to localize
 * dependencies instead of claiming an automatic repair that skipped them. */
export async function assertCompressedDependenciesLocal(snapshot: Map<string, Uint8Array>) {
  const ordinaryBytes = [...snapshot].reduce((sum, [path, bytes]) => sum + (compressedBrowserAsset(path) ? 0 : bytes.byteLength), 0);
  const readers = compressedTextReaders(() => ordinaryBytes);
  for (const [path, bytes] of snapshot) {
    const asset = compressedBrowserAsset(path);
    if (!asset || !/\.js$/i.test(asset.path)) continue;
    let text: string;
    try { text = await readers(path, bytes.byteLength, async () => bytes)!(); }
    catch { throw new CliError("vendor_compressed_source", "A compressed script could not be inspected within the export limits. Rebuild it with local dependencies, or export the script uncompressed, then retry.", 1, { retry: "after-fix" }); }
    if (references(asset.path, text).some(row => dependencyUrl.test(row.value) || row.value.startsWith("/_og/runtime/"))) {
      throw new CliError("vendor_compressed_source", "A compressed script requires dependency rewriting. Rebuild with dependencies bundled locally, or export that script uncompressed, then retry dev or vendor.", 1, { retry: "after-fix" });
    }
  }
}

/**
 * What a download that never got an answer (no connection, a timeout) is reported as. It
 * used to escape as undici's bare TypeError and read "The CLI hit an unexpected error",
 * which says nothing a person can act on (area F, 1 Nov 2026). It is the network, so it
 * names the host and says to retry. A refusal this module raised itself passes through.
 */
export function vendorFetchFailure(url: string, error: unknown): CliError {
  if (error instanceof CliError) return error;
  return new CliError("vendor_download", `${new URL(url).host} did not answer, so a pinned dependency could not be downloaded. Check your connection and retry, or include it through your build tool.`, 5);
}

/** Download into the in-memory packaging copy only. Pinned package metadata,
 * license bytes and both source/staged hashes travel in the receipt. Network
 * redirects, dependency execution and package-install scripts are never used. */
export async function vendorDependencies(input: Map<string, Uint8Array>, options: { fetchBytes?: (url: string) => Promise<Uint8Array>; artifacts?: RuntimeArtifacts; runtimes?: RuntimeSettings } = {}) {
  const snapshot = new Map(input);
  await assertCompressedDependenciesLocal(snapshot);
  const deadline = Date.now() + policy.totalTimeoutMs;
  const runtimeSession = runtimeArtifactSession(options.artifacts, deadline);
  const files = [...snapshot].filter(([name]) => /\.(?:html?|[cm]?js|css|importmap)$/i.test(name));
  const sourceReferences = files.flatMap(([name, bytes]) => references(name, Buffer.from(bytes).toString("utf8")).map(row => row.value));
  const runtime = await prepareRuntimeAssets(snapshot, { references: sourceReferences, vendor: true, session: runtimeSession, runtimes: options.runtimes });
  const urls = [...new Set(sourceReferences.filter(value => dependencyUrl.test(value) && !runtime.replacements.has(value)))];
  if (!urls.length && !runtime.receipts.length) return [];
  for (const [name, bytes] of runtime.files) snapshot.set(name, bytes);
  const dispatcher = createVendorDispatcher();
  let downloaded = 0;
  const receipts: { path: string; sourceUrl: string; package: string; version: string; license: string; licenseSha256: string; metadataSha256: string; sourceSha256: string; sha256: string; bytes: number }[] = [];
  const targets = new Map([...runtime.replacements].map(([source, destination]) => [source, destination.slice(1)]));
  const originalDependencies = new Map<string, Uint8Array>();
  const licenses = new Map<string, { license: string; licenseSha256: string; metadataSha256: string }>();
  async function download(url: string) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new CliError("vendor_timeout", "The dependency download window ended. Retry, or bundle the files locally.", 5);
    if (options.fetchBytes) {
      const bytes = Buffer.from(await options.fetchBytes(url));
      downloaded += bytes.byteLength;
      if (bytes.byteLength > policy.bytesPerFileMax || downloaded > policy.bytesTotalMax) throw new CliError("vendor_limit", "The dependencies exceed the download allowance. Bundle them locally with your build tool.", 1);
      return bytes;
    }
    const response = await fetch(url, { dispatcher, redirect: "error", signal: AbortSignal.timeout(Math.min(policy.timeoutMs, remaining)), headers: { accept: "application/octet-stream" } })
      .catch(error => { throw vendorFetchFailure(url, error); });
    if (response.status === 404) { await response.body?.cancel(); throw new CliError("vendor_missing", "A pinned dependency file is missing at its source. Bundle it locally with your build tool.", 1); }
    if (!response.ok || !response.body) { await response.body?.cancel(); throw new CliError("vendor_download", "A pinned dependency could not be downloaded. Retry, or include it through your build tool.", 5); }
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > policy.bytesPerFileMax) { await response.body.cancel(); throw new CliError("vendor_limit", "A dependency exceeds the per-file download allowance.", 1); }
    const chunks: Uint8Array[] = []; let bytes = 0;
    try {
      for await (const chunk of response.body) {
        bytes += chunk.byteLength; downloaded += chunk.byteLength;
        if (bytes > policy.bytesPerFileMax || downloaded > policy.bytesTotalMax) throw new CliError("vendor_limit", "The dependencies exceed the download allowance. Bundle them locally with your build tool.", 1);
        chunks.push(chunk);
      }
    } finally { await response.body.cancel().catch(() => {}); }
    return Buffer.concat(chunks);
  }
  async function vendor(value: string): Promise<string> {
    if (targets.has(value)) return targets.get(value)!;
    const retained = await prepareRuntimeAssets(snapshot, { references: [value], vendor: true, session: runtimeSession });
    if (retained.receipts.length) {
      for (const [path, bytes] of retained.files) snapshot.set(path, bytes);
      for (const [source, destination] of retained.replacements) targets.set(source, destination.slice(1));
      runtime.receipts.push(...retained.receipts);
      return targets.get(value)!;
    }
    const source = approved(value), key = source.url.href;
    if (targets.has(key)) { targets.set(value, targets.get(key)!); return targets.get(key)!; }
    if (targets.size >= policy.dependencyFilesMax) throw new CliError("vendor_limit", "There are too many dependency files to download. Bundle them locally with your build tool.", 1);
    const prefix = `.opengame-vendor/${source.package.replace("/", "_")}@${source.version}/`;
    const target = prefix + source.relative;
    if (snapshot.has(target)) throw new CliError("vendor_collision", "The vendor output folder already contains a file with that name. Remove the old staged copy, then retry.", 1);
    targets.set(key, target);
    targets.set(value, target);
    if (source.directory) {
      for (const file of source.directory.files) await vendor(source.base + source.relative + file);
      return target;
    }
    if (!licenses.has(source.base)) {
      const metadata = await download(source.base + "package.json");
      let pkg: { name?: string; version?: string; license?: string };
      try { pkg = JSON.parse(metadata.toString("utf8")); } catch { throw new CliError("vendor_license", "The dependency's package metadata could not be read.", 1); }
      if (pkg.name !== source.package || pkg.version !== source.version || typeof pkg.license !== "string" || !policy.licenses.includes(pkg.license)) throw new CliError("vendor_license", "The dependency does not declare an approved license for this pinned version. Bundle it after checking its license.", 1);
      let license: Buffer | undefined;
      for (const name of policy.licenseFiles) {
        try { license = await download(source.base + name); break; }
        catch (error) { if (!(error instanceof CliError) || error.code !== "vendor_missing") throw error; }
      }
      if (!license?.byteLength) throw new CliError("vendor_license", "The dependency has no license text at its pinned source.", 1);
      const licensePath = prefix + "LICENSE.txt";
      if (snapshot.has(licensePath)) throw new CliError("vendor_collision", "The vendor license path already exists. Remove the old staged copy, then retry.", 1);
      snapshot.set(licensePath, license);
      licenses.set(source.base, { license: pkg.license, licenseSha256: sha(license), metadataSha256: sha(metadata) });
    }
    const bytes = await download(key);
    if (source.expectedSha256 && sha(bytes) !== source.expectedSha256) throw new CliError("vendor_hash", "A dependency does not match its reviewed SHA-256. Verify its pinned recipe before publishing.", 1);
    originalDependencies.set(target, bytes);
    let staged: Uint8Array = bytes;
    if (/\.(?:[cm]?js|css)$/i.test(source.relative)) {
      let text = bytes.toString("utf8");
      if (!Buffer.from(text).equals(bytes)) throw new CliError("vendor_module", "A script or stylesheet dependency is not UTF-8. Include it through your build tool.", 1);
      const css = /\.css$/i.test(source.relative);
      const replacements = [];
      for (const item of css ? stylesheetSpecifiers(text) : moduleSpecifiers(text)) {
        // The downloaded source has not passed the staged credential scan yet.
        // A specifier can contain a key, so name the condition without its value.
        if ("documentRelative" in item && item.documentRelative && !/^https:\/\//.test(item.value)) {
          throw new CliError("vendor_document_relative", "A downloaded script uses a document- or worker-relative URL. Its base depends on the document or worker that runs it. Bundle it with an explicit URL or new URL(path, import.meta.url) before vendoring.", 1);
        }
        if (!css && !/^(?:\.{1,2}\/|https:\/\/)/.test(item.value)) throw new CliError("vendor_bare_import", "The dependency has an import without a pinned source. Include it through your build tool.", 1);
        const next = new URL(item.value, source.url).href;
        const nextTarget = await vendor(next);
        replacements.push({ ...item, replacement: css ? "/" + nextTarget : JSON.stringify("/" + nextTarget) });
      }
      for (const item of replacements.sort((a, b) => b.start - a.start)) text = text.slice(0, item.start) + item.replacement + text.slice(item.end);
      staged = Buffer.from(text);
    }
    snapshot.set(target, staged);
    receipts.push({ path: target, sourceUrl: key, package: source.package, version: source.version, ...licenses.get(source.base)!, sourceSha256: sha(bytes), sha256: sha(staged), bytes: staged.byteLength });
    if (source.runtime) for (const file of source.runtime.files) await vendor(source.base + source.runtime.path + file);
    return target;
  }
  try {
    for (const url of urls) await vendor(url);
    for (const [name, bytes] of files) {
      let text = Buffer.from(bytes).toString("utf8");
      if (/\.html?$/i.test(name)) text = updateIntegrity(text, targets, snapshot, originalDependencies);
      for (const item of references(name, text).sort((a, b) => b.start - a.start)) {
        const target = targets.get(item.value);
        if (target) text = text.slice(0, item.start) + (item.raw ? "/" + target : JSON.stringify("/" + target)) + text.slice(item.end);
      }
      snapshot.set(name, Buffer.from(text));
    }
    for (const [name, bytes] of snapshot) input.set(name, bytes);
    return [...receipts, ...runtime.receipts];
  } finally { await dispatcher.close(); }
}


/** Keep the original export intact. The returned folder is a complete, checked
 * game and carries a local receipt outside its uploaded files. */
export async function vendorCommand(root: string, flags: Record<string, string | boolean>, output: Output, options: { artifacts?: RuntimeArtifacts } = {}) {
  const { inspectArchive } = await import("./archive");
  const { build } = await import("./deploy");
  const manifest = await loadManifest(root, output, safeReadFile);
  if (flags.build && manifest.build?.command) await build(manifest.build.command, root, output);
  const source = await outputFolder(root, manifest);
  const base = await realpath(root);
  const relative = typeof flags.output === "string" ? flags.output : ".opengame/vendor";
  if (!isBundlePath(relative)) throw new CliError("vendor_output", "Use --output with a new relative folder inside the project.", 2);
  const target = resolve(base, relative);
  if (insideProject(target, source)) throw new CliError("vendor_output", "The staging folder cannot contain the source export.", 2);
  const replacing = await previousVendorOutput(target);
  const linked = linkedProject(await readProject(root, apiOrigin(), { readFile: safeReadFile }));
  const inspection = await inspectArchive(source, manifest, output, { vendor: true, artifacts: options.artifacts });
  assertNoReservedRuntimePaths(inspection.result.include);
  const staged = new Map<string, Uint8Array>();
  for (const name of inspection.result.include) {
    if (!isBundlePath(name)) throw new CliError("vendor_output", "The checked export contains an invalid path.", 1);
    staged.set(name, inspection.snapshot.get(inspection.result.strippedRoot + name)!);
  }
  // The staged copy is the folder that gets deployed, so a retired cover stops here too.
  staged.set("opengame.json", Buffer.from(JSON.stringify({ ...withoutCover(manifest), build: { output: "." } }, null, 2) + "\n"));
  staged.set(".opengame/vendor-receipt.json", Buffer.from(JSON.stringify(inspection.packaging, null, 2) + "\n"));
  if (linked) staged.set(".opengame/project.json", Buffer.from(JSON.stringify(linked, null, 2) + "\n"));
  if (!replacing) await writeStage(base, relative, staged);
  else {
    // The new export is written beside the old one and swapped in, so a failure part way
    // leaves the previous export whole; the old copy goes only after the swap.
    const tag = randomUUID().slice(0, 8);
    const nextRelative = join(dirname(relative), `.${basename(relative)}-next-${tag}`);
    await writeStage(base, nextRelative, staged);
    const previous = `${target}.previous-${tag}`;
    await replaceFile(target, previous);
    try { await replaceFile(resolve(base, nextRelative), target); }
    catch (error) { await replaceFile(previous, target); throw error; }
    await rm(previous, { recursive: true, force: true });
  }
  output.emit({ type: "result", command: "vendor", data: { output: target, packaging: inspection.packaging, replaced: replacing,
    message: `Created the checked export in ${relative}. Run opengame check ${JSON.stringify(relative)}, then deploy that folder. The source export is unchanged.` } });
}

/**
 * Whether the output folder is there, and if so whether this command made it. A second
 * `opengame vendor` after an edit used to refuse its own earlier .opengame/vendor and ask
 * for a new --output every time (area F, 1 Nov 2026). A folder holding the receipt vendor
 * writes is its own and is replaced; anything else at that path is still never touched.
 */
async function previousVendorOutput(target: string): Promise<boolean> {
  let folder;
  try { folder = await lstat(target); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
  const receipt = await lstat(join(target, ".opengame/vendor-receipt.json")).catch(() => null);
  if (folder.isDirectory() && !folder.isSymbolicLink() && receipt?.isFile()) return true;
  throw new CliError("vendor_output_exists", "That folder already exists and opengame vendor did not make it. Choose a new --output folder; a folder vendor did not make is never overwritten.", 2);
}

/** A staged export is a new upload for the same game, never a copy of an upload
 * or submission retry. readProject validates the origin, UUID and revision. */
export function linkedProject(state: Project): Project | undefined {
  if (!state.gameId) return undefined;
  return { version: 1, origin: state.origin, gameId: state.gameId,
    ...(state.metadataRevision === undefined ? {} : { metadataRevision: state.metadataRevision }) };
}
