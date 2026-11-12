import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { LIMITS } from "@opengame/shared";
import { isBundlePath, type GameManifest, type RuntimeSettings } from "@opengame/protocol";
import { contractFor, CONTRACT_VERSIONS, CURRENT_CONTRACT, needsServingInventory, securityHeaders } from "../../../infra/worker/src/contracts";
import { contractCapabilities, edgeSdkContract, THREADED_MOVES } from "@opengame/shared/runtime-contracts";
import { frameAncestorsOf, GAME_AUDIO_VERSION, gameAudioRuntime } from "../../../infra/worker/src/game-audio";
import { resolveContentType } from "../../../infra/worker/src/content-types";
import { assertNoReservedRuntimePaths, loadManifest, outputFolder } from "./files";
import { build } from "./deploy";
import { safeReadFile, safeReadLargeFile, safeSnapshot, type DirectoryIdentity } from "./safe-fs";
import { selectAssetPlan } from "./unity-assets";
import { runPreflight, snapshotPreflightFiles, matchedRawRuntime } from "./preflight";
import { CliError, type Output } from "./output";
import { prepareRuntimeAssets, type RuntimeArtifacts } from "./runtime-artifacts";
import { references, updateIntegrity, assertCompressedDependenciesLocal } from "./vendor";
import { THREADED_TARGET } from "./engines";

/** The file the SDK fetches beside the page when it runs outside OpenGame. */
const SDK_LOCAL_MANIFEST = "opengame.json";

export function devHeaders(version = CURRENT_CONTRACT): Headers {
  if (!CONTRACT_VERSIONS.includes(version)) throw new CliError("runtime_contract_unknown", `This CLI does not contain runtime contract ${version}. Use --contract with one of ${CONTRACT_VERSIONS.join(", ")}, or leave it out to use ${CURRENT_CONTRACT}.`, 2);
  const headers = securityHeaders(contractFor(version), "http://localhost:* http://127.0.0.1:*");
  headers.set("Cache-Control", "no-store");
  // The game Worker is embedded by an isolated top-level play page. In dev this
  // server is the top-level page too, so COOP must be present at that boundary.
  if (contractFor(version).crossOriginEmbedderPolicy) headers.set("Cross-Origin-Opener-Policy", "same-origin");
  return headers;
}

/**
 * The contract whose releases the pipeline derives, named by the Worker's own rule rather
 * than by a date written out here (`needsServingInventory`). It is 2027-01, the one that
 * also granted eval, and it is deprecated for good: its runtime_contracts row carries
 * deprecated_at and is not default-eligible, and a threaded scan moves a release onto
 * 2027-02 instead. dev still serves it, because a contract the Worker serves is one a
 * pinned release could be on.
 */
export const ENGINE_CONTRACT = CONTRACT_VERSIONS.find(version => needsServingInventory({ contractVersion: version }))!;

/**
 * Whether production's documents under this contract carry the host runtime and the SDK
 * tag, so dev's should too. Two contracts do, by different routes that end in the same
 * document: 2027-01's derived tree has the tags written into it at scan time, and under
 * 2027-02 og-games adds them to every document it serves and answers /_og/sdk.js itself
 * (infra/worker/src/platform-sdk.ts). Asked of limits.json `sdkInjection` rather than
 * compared against either date, which is how dev missed 2027-02 when it went live: the
 * test here was `=== ENGINE_CONTRACT`, and the new contract was not that one.
 */
export function injectsPageTags(version: string): boolean {
  const mode = contractCapabilities(version)?.sdkInjection;
  return mode === "derived" || mode === "edge";
}

/**
 * `dev --contract` help, read from the capability table in limits.json so it cannot go on
 * describing a contract after the table changes. It said 2027-01 was "experimental and has
 * not been tested on the live site yet" for two days after 2027-02 replaced it and went
 * live, because the sentence was typed rather than read from anywhere.
 *
 * The network is read from the same table (`openNetwork`), because 2027-03 and 2027-04 are
 * the first contracts that differ from their neighbours mainly in what a game may reach,
 * and a help line that named only isolation and eval would describe 2027-04 and 2027-01 in
 * identical words. Which contract a threaded release moves to is read from threadedMoves
 * for the same reason: there are two pairs now, and the sentence names its source.
 */
export function contractHelp(): string {
  const powers = (version: string) => {
    const caps = contractCapabilities(version)!;
    const powers = [["cross-origin isolation", caps.crossOriginIsolated], ["eval", caps.unsafeEval]] as const;
    const yes = powers.filter(([, on]) => on).map(([name]) => name), no = powers.filter(([, on]) => !on).map(([name]) => name);
    const allows = !yes.length ? `neither ${no.join(" nor ")}` : yes.join(" and ") + (no.length ? ` but not ${no.join(" or ")}` : "");
    return { allows, reach: caps.openNetwork ? "any https host" : "only OpenGame's own hosts", sdk: caps.sdkInjection === "none" ? "no SDK" : "the SDK to every page" };
  };
  // Neighbouring versions that allow the same things are named together.
  const groups: { versions: string[]; key: string }[] = [];
  for (const version of CONTRACT_VERSIONS) {
    const key = JSON.stringify(powers(version)), last = groups.at(-1);
    if (last?.key === key) last.versions.push(version); else groups.push({ versions: [version], key });
  }
  const sentences = groups.map(({ versions }) => {
    const { allows, reach, sdk } = powers(versions[0]!), one = versions.length === 1;
    const movedFrom = Object.entries(THREADED_MOVES).filter(([, to]) => versions.includes(to)).map(([from]) => from);
    return [`${versions.join(" and ")} ${one ? "allows" : "allow"} ${allows}, ${one ? "lets" : "let"} a game reach ${reach}, and ${one ? "adds" : "add"} ${sdk}.`,
      versions.includes(ENGINE_CONTRACT) && "It is deprecated, and no new release gets it.",
      movedFrom.length > 0 && `A release on ${movedFrom.join(" or ")} whose scan finds threads is moved onto it automatically.`].filter(Boolean).join(" ");
  });
  return `Runtime contract. Defaults to ${CURRENT_CONTRACT}, which new games are published under. ${sentences.join(" ")}`;
}

/**
 * Whether the manifest's `sdk.inject: false` keeps the SDK out of this contract's pages.
 * The pipeline honours it when it derives a tree. og-games never reads the manifest and
 * adds the SDK tag to every document of an edge contract, so dev does not offer an opt-out
 * there that production would ignore.
 */
export function sdkOptOutApplies(version: string): boolean {
  return !edgeSdkContract(version);
}

/**
 * What the pipeline adds to a derived release's documents, and in its order: the host
 * runtime, then the SDK unless the creator opted out (`derive` in
 * apps/pipeline/opengame_pipeline/derived_assets.py). The host version is the Worker's,
 * which is also what the pipeline's packaged host.js records.
 */
export function hostTags(sdk: boolean): string {
  return `<script src="/_og/host.js" data-og-audio="${GAME_AUDIO_VERSION}"></script>` + (sdk ? '<script src="/_og/sdk.js"></script>' : "");
}

/** Loaded ahead of the game on every contract. A bundled SDK reads `window.__OG_DEV__`
 * before it will use the local player, and the default contract does not inject
 * `/_og/sdk.js`, which is the only other copy of the marker. */
export const DEV_APPROVAL_TAG = `<script src="/_og/dev.js"></script>`;
const DEV_APPROVAL_SOURCE = "window.__OG_DEV__=1;";

/** The documents the pipeline injects: every file whose Python `Path.suffix` is .html or
 * .htm. A suffix needs a stem, so a file named `.html` is not one. */
export function isHostDocument(path: string): boolean {
  const name = path.split("/").at(-1)!, dot = name.lastIndexOf(".");
  return dot > 0 && [".html", ".htm"].includes(name.slice(dot).toLowerCase());
}

// Python's `\s` on a str, which differs from JavaScript's in both directions: it takes
// U+001C to U+001F and U+0085, and does not take U+FEFF.
const SPACE = /[\t\n\v\f\r\x1c-\x20\x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]*/y;
// After html, Python's `\b` wants a character that is not a Unicode letter, digit or
// underscore, so html5 is not the doctype. Letters and numbers here are this runtime's
// Unicode tables and the pipeline's are Python's, so the two can differ where their Unicode versions do.
const DOCTYPE = /<!doctype[\t\n\v\f\r\x1c-\x20\x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+html(?![\p{L}\p{N}_])/iuy;

/**
 * A port of the pipeline's `_inject`, so that `opengame dev` serves the document a
 * derived release serves. Until 22 Oct 2026 dev had its own rules: it parsed the page,
 * deleted any existing SDK tag, put one SDK tag at <head> or before the first script,
 * left the host runtime out and touched index.html only, under every contract. The
 * pipeline keeps every byte of the original, puts the tags straight after the doctype
 * (or first, when there is none) and does it to every document. tests/fixtures/host-injection.json holds the pipeline's own
 * outputs for both to be held to.
 *
 * A leading byte order mark is dropped, as the pipeline's utf-8-sig decode drops it.
 * The pipeline's derivation fails on a document that is not UTF-8; dev has already
 * decoded the bytes by this point and does not model that failure.
 */
export function injectHostTags(html: string, tags: string): string {
  const text = html.startsWith("\ufeff") ? html.slice(1) : html;
  let cursor = 0;
  // Each leading comment once, as the pipeline consumes them; an unclosed one ends the scan.
  for (;;) {
    SPACE.lastIndex = cursor; SPACE.exec(text); cursor = SPACE.lastIndex;
    if (!text.startsWith("<!--", cursor)) break;
    const end = text.indexOf("-->", cursor + 4);
    if (end < 0) break;
    cursor = end + 3;
  }
  DOCTYPE.lastIndex = cursor;
  let point = 0, quoted: string | undefined;
  if (DOCTYPE.exec(text)) {
    for (let offset = DOCTYPE.lastIndex; offset < text.length; offset++) {
      const character = text[offset]!;
      if (quoted) { if (character === quoted) quoted = undefined; }
      else if (character === '"' || character === "'") quoted = character;
      else if (character === ">") { point = offset + 1; break; }
    }
  }
  return text.slice(0, point) + tags + text.slice(point);
}

/** Serve only bytes read through descriptor-relative opens, then held in memory.
 * A concurrent in-place edit is rejected when its metadata changes during read;
 * this is not a filesystem-wide atomic snapshot of a running build. */
export async function devSnapshot(folder: string, external?: DevExternalAssets) {
  const { snapshot } = await safeSnapshot(folder, external
    ? { externalAssets: external.paths, externalDelivery: external.delivery, rootIdentity: external.identity } : {});
  if (!snapshot.has(LIMITS.bundle.entryPoint)) {
    const result = await runPreflight(snapshotPreflightFiles(snapshot));
    if (matchedRawRuntime(result, snapshot)) return snapshot;
    throw new CliError("entry_missing", "The selected export has no index.html or complete parser-validated raw payload. Build it or correct build.output before running opengame dev.", 1);
  }
  return snapshot;
}

function requireSdkPair(sdk: Uint8Array, notice: Uint8Array | undefined): asserts notice is Uint8Array {
  if (!sdk.byteLength || !notice?.byteLength) throw new CliError("dev_sdk_missing", "The CLI's global SDK artifact or dependency notice is missing or empty. Rebuild the SDK, then the CLI, or reinstall the complete CLI package.", 5);
}

/** Keep the packaged dependency notice byte-for-byte beside the injected SDK.
 * Retaining a notice is not a determination of source or license clearance. */
export async function loadDevSdk(directory = new URL("../dist/", import.meta.url)) {
  try {
    const [sdk, sdkNotice] = await Promise.all([
      readFile(new URL("opengame-global.js", directory)),
      readFile(new URL("opengame-global.js.LEGAL.txt", directory)),
    ]);
    requireSdkPair(sdk, sdkNotice);
    return { sdk, sdkNotice };
  } catch {
    throw new CliError("dev_sdk_missing", "The CLI's global SDK artifact or dependency notice is missing or empty. Rebuild the SDK, then the CLI, or reinstall the complete CLI package.", 5);
  }
}

/**
 * An asset plan's files, which dev serves from disk on request rather than holding them in
 * the snapshot. A Kaigen export is gigabytes of cooked files, so holding it all in memory
 * was refused by the ordinary bundle limit before a single page was served (OG Clash, 3.1
 * GiB, 27 Oct 2026). Each request reads its one file through the same descriptor-relative
 * helper, against the export root's identity as dev found it, so a root swapped for a link
 * afterwards serves nothing. Nothing is hashed: dev uploads nothing.
 */
export type DevExternalAssets = { root: string; identity: DirectoryIdentity; delivery: string; paths: ReadonlySet<string>; fileBytes: number };

/** Reads of plan files at once. A page that asks for thousands of cooked files together
 * would otherwise start thousands of helper processes together. */
const EXTERNAL_READS_MAX = 8;

export async function startDevServer(options: { snapshot: Map<string, Uint8Array>; sdk?: Uint8Array; sdkNotice?: Uint8Array; contract?: string; port?: number; artifacts?: RuntimeArtifacts; runtimes?: RuntimeSettings; manifest?: GameManifest; onQueryString?: () => void; external?: DevExternalAssets }) {
  assertNoReservedRuntimePaths(options.snapshot.keys());
  if (options.sdk) requireSdkPair(options.sdk, options.sdkNotice);
  const headers = devHeaders(options.contract);
  const files = new Map(options.snapshot);
  await assertCompressedDependenciesLocal(files);
  const raw = files.has(LIMITS.bundle.entryPoint) ? undefined : matchedRawRuntime(await runPreflight(snapshotPreflightFiles(files)), files);
  const sourceReferences = [...files].filter(([path]) => /\.(?:html?|[cm]?js|css|importmap)$/i.test(path)).flatMap(([path, bytes]) => references(path, Buffer.from(bytes).toString("utf8")).map(row => row.value));
  const runtime = await prepareRuntimeAssets(files, { raw, references: sourceReferences, artifacts: options.artifacts, runtimes: options.runtimes });
  for (const [path, bytes] of runtime.files) files.set(path, bytes);
  for (const [path, bytes] of options.snapshot) {
    if (!/\.(?:html?|[cm]?js|css|importmap)$/i.test(path)) continue;
    let text = Buffer.from(bytes).toString("utf8");
    if (/\.html?$/i.test(path)) text = updateIntegrity(text,
      new Map([...runtime.replacements].map(([source, destination]) => [source, destination.slice(1)])), files, new Map());
    for (const row of references(path, text).sort((a, b) => b.start - a.start)) {
      const target = runtime.replacements.get(row.value);
      if (target) text = text.slice(0, row.start) + (row.raw ? target : JSON.stringify(target)) + text.slice(row.end);
    }
    files.set(path, Buffer.from(text));
  }
  if (!files.has(LIMITS.bundle.entryPoint)) throw new CliError("entry_missing", "The export has no index.html or complete parser-validated raw payload. Run the build, or point build.output in opengame.json at the folder that holds index.html, then run opengame dev again.", 1);
  // Production adds the SDK only under a contract that injects it (`injectsPageTags`):
  // 2027-01's derived tree, and 2027-02 at the edge. Under 2026-11 no SDK is added, so a
  // game that leans on an injected window.OpenGame fails here as it would live. (og-games
  // does add its inline host runtime to every document under every contract; dev adds it
  // only where it adds the SDK, as it did before 2027-02 existed.)
  //
  // The two production routes place the tags a little differently. The pipeline writes
  // them straight after the doctype, which `injectHostTags` ports byte for byte; og-games
  // streams them in front of the first element, inlines the host runtime and adds a `?v=`
  // naming the SDK build. Both put the host runtime and then the SDK ahead of every script
  // the game wrote, which is the part a game can observe, so dev uses the one port for
  // both rather than growing a second injector that differs only in bytes.
  // The approval marker is not one of the production tags. Every contract gets it,
  // including 2027-03, which adds no SDK, so a game that bundles the SDK still sees
  // the local player. Only this loopback server sends the file.
  const contract = options.contract ?? CURRENT_CONTRACT;
  const injectSdk = injectsPageTags(contract);
  const tags = DEV_APPROVAL_TAG + (injectSdk ? hostTags(options.sdk !== undefined) : "");
  files.set("_og/dev.js", Buffer.from(DEV_APPROVAL_SOURCE));
  for (const [path, bytes] of files) {
    if (isHostDocument(path)) files.set(path, Buffer.from(injectHostTags(Buffer.from(bytes).toString("utf8"), tags)));
  }
  if (injectSdk) {
    // Only a local page can frame dev, so its own frame-ancestors (the loopback origins)
    // are the receiver's parent list, as a preview's own list is in og-games.
    files.set("_og/host.js", Buffer.from(gameAudioRuntime(frameAncestorsOf(headers.get("Content-Security-Policy")))));
    if (options.sdk) {
      files.set("_og/sdk.js", Buffer.concat([Buffer.from(DEV_APPROVAL_SOURCE), options.sdk]));
      files.set("_og/sdk.js.LEGAL.txt", options.sdkNotice!);
    }
  }
  /* The SDK's local mode reads `opengame.json` beside the page for its boards and room
     size (`manifestInput` in packages/sdk/src/leaderboards.ts). `npm run dev` serves the
     project folder, where that file is; this server serves the export, where it is not, so
     every local score failed with "unavailable" while the console said scores stay in this
     browser. Serve the manifest dev already validated, unless the export ships its own.
     Hosted games never make this request, because the page hands the SDK the manifest,
     which is why preflight does not ask for the file in the build. */
  if (options.manifest && !files.has(SDK_LOCAL_MANIFEST)) files.set(SDK_LOCAL_MANIFEST, Buffer.from(JSON.stringify(options.manifest)));
  const external = options.external;
  let reading = 0;
  const waiting: (() => void)[] = [];
  const readExternal = async (path: string) => {
    if (reading >= EXTERNAL_READS_MAX) await new Promise<void>(resolve => waiting.push(resolve));
    reading++;
    try { return await safeReadLargeFile(external!.root, path, external!.fileBytes, external!.identity); }
    finally { reading--; waiting.shift()?.(); }
  };
  const server = createServer((request, response) => {
    for (const [key, value] of headers) response.setHeader(key, value);
    const reply = (status: number, text: string) => { response.statusCode = status; response.setHeader("Content-Type", "text/plain; charset=utf-8"); response.end(request.method === "HEAD" ? undefined : text); };
    const port = (server.address() as { port: number } | null)?.port;
    if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(request.headers.host ?? "")) return reply(403, "Use the loopback URL printed by opengame dev.");
    if (request.method !== "GET" && request.method !== "HEAD") { response.setHeader("Allow", "GET, HEAD"); return reply(405, "Method not allowed"); }
    // Decode once before normalising. URL() would erase dot segments first and
    // turn a traversal attempt into a different, apparently valid asset request.
    let path: string;
    try { path = decodeURIComponent((request.url ?? "").split("?")[0]!); } catch { return reply(400, "Invalid path"); }
    if (!path.startsWith("/") || path.startsWith("//")) return reply(400, "Invalid path");
    if (path === "/api/v1/status") {
      const body = Buffer.from(JSON.stringify({ launched: true, access: true }));
      response.statusCode = 200; response.setHeader("Content-Type", "application/json"); response.setHeader("Content-Length", body.byteLength);
      return response.end(request.method === "HEAD" ? undefined : body);
    }
    path = path === "/" ? LIMITS.bundle.entryPoint : path.slice(1);
    /* Here the export is the top-level page, so a game can read `?wave=3` from its own
       address and it works. On OpenGame a parameter added to the play page never reaches
       the game: OpenGame sets the frame's address and loads it with no referrer.
       Measured on Cinderhold on 25 Oct 2026 (UTC), whose debug waves worked in every
       local run and did nothing in production. Dev still serves the page, since a
       local-only switch is the creator's business, and says so once. The SDK's own
       local parameter `og-dev-player` and the `mute` every test harness adds are not
       the game's, so they stay quiet. */
    if (path === LIMITS.bundle.entryPoint && gameQuery(request.url ?? "")) options.onQueryString?.();
    if (!isBundlePath(path) || /[%\\\x00-\x1f]/.test(path)) return reply(400, "Invalid path");
    if (request.headers["service-worker"] === "script") return reply(403, "Service workers are not served by the game runtime.");
    const send = (bytes: Uint8Array) => {
      const type = resolveContentType(path);
      response.setHeader("Content-Type", type.contentType);
      if (type.contentEncoding) response.setHeader("Content-Encoding", type.contentEncoding);
      response.setHeader("Content-Length", bytes.byteLength);
      response.end(request.method === "HEAD" ? undefined : bytes);
    };
    const bytes = files.get(path);
    if (bytes) return send(bytes);
    if (!external?.paths.has(path)) return reply(404, "File not found");
    void readExternal(path).then(send, () => reply(404, "File not found. It is in the asset plan but is missing or changed on disk. Rebuild, then restart opengame dev."));
  });
  server.requestTimeout = LIMITS.platform.vendoring.timeoutMs;
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(options.port ?? 0, "127.0.0.1", () => { server.off("error", reject); resolve(); }); });
  return { server, url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, close: () => closeServer(server) };
}

const SDK_LOCAL_PARAMETERS = new Set(["join", "og-dev-player", "mute"]);

/** Whether a request's query string carries a parameter the game itself might read. */
function gameQuery(url: string): boolean {
  const at = url.indexOf("?");
  if (at < 0) return false;
  return [...new URLSearchParams(url.slice(at + 1)).keys()].some(key => !SDK_LOCAL_PARAMETERS.has(key));
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
}

export async function devCommand(root: string, flags: Record<string, string | boolean>, output: Output) {
  const manifest = await loadManifest(root, output, safeReadFile);
  if (flags.build && manifest.build?.command) await build(manifest.build.command, root, output, undefined, { install: !flags["no-install"], rerun: "opengame dev --build" });
  const contract = typeof flags.contract === "string" ? flags.contract : CURRENT_CONTRACT;
  devHeaders(contract);
  const port = flags.port === undefined ? 0 : Number(flags.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535 || (flags.port !== undefined && !/^\d+$/.test(String(flags.port)))) throw new CliError("port_invalid", "Use --port with an integer from 0 to 65535. Zero selects a free port.", 2);
  const folder = await outputFolder(root, manifest);
  const planPath = flags["external-assets"];
  const plan = typeof planPath === "string" ? await selectAssetPlan(folder, root, planPath, { unityOnly: false }) : undefined;
  const external: DevExternalAssets | undefined = plan && { root: plan.sourceRoot, identity: plan.sourceIdentity, delivery: plan.delivery,
    paths: new Set(plan.paths), fileBytes: plan.limits.fileBytesMax };
  const snapshot = await devSnapshot(folder, external);
  const optedOut = sdkOptOutApplies(contract) && (manifest as unknown as { sdk?: { inject?: boolean } }).sdk?.inject === false;
  const sdk = injectsPageTags(contract) && !optedOut ? await loadDevSdk() : {};
  let toldAboutQuery = false;
  const onQueryString = () => {
    if (toldAboutQuery) return;
    toldAboutQuery = true;
    output.emitLate({ type: "notice", code: "query_not_forwarded", message: "A parameter added to the play page's address never reaches your game on OpenGame." });
  };
  const running = await startDevServer({ snapshot, ...sdk, contract, port, runtimes: manifest.runtimes, manifest, onQueryString, external });
  // A warning only where dev's contract differs from what a release can get. Until 24 Oct
  // 2026 every contract but the default was called experimental and untested here, which
  // stopped being true of 2027-02 when it went live the day before.
  const deprecated = contract === ENGINE_CONTRACT;
  const fromDisk = external ? `${external.paths.size.toLocaleString("en-GB")} files in the asset plan are read from disk when the game asks for them. ` : "";
  output.emit({ type: "result", command: "dev", data: { url: running.url, runtimeContract: contract, deprecated, ...(external ? { externalAssets: external.paths.size } : {}),
    message: `Serving ${running.url} under contract ${contract}. ${fromDisk}${deprecated ? `Contract ${contract} is deprecated, and no new release gets it. A threaded game is moved onto ${THREADED_TARGET}, so test with --contract ${THREADED_TARGET}. ` : ""}Restart after rebuilding. Press Ctrl+C to stop.` } });
  await new Promise<void>(resolve => {
    const stop = () => { process.off("SIGINT", stop); process.off("SIGTERM", stop); void running.close().then(resolve, resolve); };
    process.once("SIGINT", stop); process.once("SIGTERM", stop);
  });
}
