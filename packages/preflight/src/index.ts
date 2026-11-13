import { LARGE_ASSET_DELIVERY, isLargeAssetPath, largeAssetLimits, largeAssetPlan, largeAssetPlanAdmits, validateLargeAssetFiles, type LargeAssetFile } from "@opengame/shared/large-assets";
import { engineFindings, encryptedPckFindings, engineArchiveShapeFindings, engineRuntimeUrl, sourceUsesThreads, withGodotPckVersion } from "./engine-findings";
import { defoldCustomKeyFindings } from "./defold-archive";
import { nameFindings, compressedBrowserAsset, canonicalName, precompressedAsset } from "./names";
import { modulePathAnalysis } from "./module-paths";
import { redactFinding } from "./diagnostic-text";
import { nativeBuild, nativeBuildWords } from "./native-build";
import { defoldArchivePrefix, defoldEngineWasm, detectEngine, detectedIds, engineFileKind, godotLoadPath, godotLocated, licenceStamps, wasmModule, withRawRuntimeEvidence, type WasmModule, engineDefault, ENGINE_DEFAULT_ORIGINS, ENGINE_DEFAULT_REFS, ENGINE_NAMES, type EngineDefault, type EngineId, type EngineReport, type Site } from "./engines";
import { inspectRawRuntime, RawRuntimeError, type RawRuntimeEvidence, type RawInflater } from "./raw-runtime";
import {
  BUNDLE,
  LIMITS,
  compiledCredentialPatterns,
  formatBytes,
  gameConnectOrigins,
  trustedAssetHosts,
} from "@opengame/shared";
import { blockedPackageForUrl, blockedPatternHits, blockedServiceForHost, policyRule, reviewSignalHits, type BlockedService, type PackageHit } from "@opengame/shared/game-policy";
import { URL_START, ExpansionLimit, Mapped, compose, concat, cssUnescape, decodeReferences, dropUrlWhitespace, foldHosts, foldWindows, jsonUnescape, xmlExpand, xmlWalk, type ReferenceMode, type XmlDocument } from "./assembled";

/**
 * The preflight. This runs in the browser, before a single byte is uploaded.
 *
 * Section 05 of the build plan is blunt about why it exists: packaging is where
 * most submissions will fail, and it is the most expensive possible place to
 * lose someone — after all the work, before any of the reward. Somebody who
 * dragged the wrong folder should learn in under a second, not after a 200 MB
 * upload and a pipeline round trip.
 *
 * Two rules govern every check below.
 *
 * **If the intent is unambiguous, fix it silently and say what was done.** One
 * top-level directory containing an `index.html` is unambiguous, so the level
 * gets stripped and a note is left. Source maps are unambiguous, so they are
 * dropped. Absolute paths like `/assets/rock.png` are unambiguous and correct,
 * because each game owns its whole subdomain, so they are not mentioned at all.
 *
 * **If it is ambiguous, refuse and be specific.** Never "invalid bundle". Name
 * the directory, the file, the line, the count, and what to do instead. Every
 * blocker in this file should be readable by somebody who has never seen a
 * build pipeline and should tell them their next action.
 *
 * The function is deliberately pure over a file list plus a text reader, with
 * no DOM in sight, so it can be run against a real folder from Node — which is
 * the only way to know it catches what it claims to catch.
 */

/* -------------------------------------------------------------------------- */
/* Inputs and outputs                                                          */
/* -------------------------------------------------------------------------- */

/** What to change when a `.br`, `.gz` or `.unityweb` file could not be decompressed: the export
 * setting that writes it, and that a build which plays locally is worth one more deploy. */
const UNREADABLE_COMPRESSED = "It is compressed and could not be decompressed. In Unity, open Player Settings, then Publishing Settings, set Compression Format to Gzip or Disabled (or tick Decompression Fallback), build again and deploy. If this build plays with opengame dev, deploy it once more, since the fault may be ours.";

export interface PreflightFile {
  /** POSIX path relative to the drop root. Never leading `./` or `/`. */
  path: string;
  size: number;
  /** Contents, decoded as UTF-8. Only ever called for scannable text files. */
  text: () => Promise<string>;
  /** Validated, bounded decoding supplied by the runtime's compression reader.
   * The original text reader remains available for raw header credential checks. */
  decodedText?: (() => Promise<string>) & { decodedByteLength?: () => number | undefined };
  /** Private server inspection may also read bytes to distinguish binary formats. */
  bytes?: () => Promise<Uint8Array>;
  /** Bounded header reader, when the caller can inspect binary formats. */
  head?: (length: number) => Promise<Uint8Array>;
  /** Raw source spelling before the preflight's legacy path normalization. */
  sourcePath?: string;
}

export type Severity = "blocker" | "warning" | "note";

export interface Finding {
  /** Stable identifier. The UI groups and orders on this, never on the prose. */
  code: string;
  severity: Severity;
  /** One line. Specific enough to act on without reading the detail. */
  title: string;
  /** What to do about it, in plain words. */
  detail?: string;
  /** The offending file, and the line inside it where we can name one. */
  path?: string;
  line?: number;
  /** Further offenders, when naming one is not enough. Rendered as a short list. */
  more?: string[];
  /** Reserved for independently verified platform provenance. Bundle contents and
   * SDK-looking strings cannot establish that a network destination is unused. */
  ours?: true;
}

export interface PreflightResult {
  /** Explicit coverage of the text credential policy, never inferred from findings. */
  credentialScan?: { policyVersion: "1"; complete: boolean; expectedFiles: number; inspectedFiles: number; blocked: boolean; files: { path: string; required: boolean; inspected: boolean }[] };
  /** No blockers. Warnings do not stop an upload; they travel with it. */
  ok: boolean;
  findings: Finding[];
  /** The directory prefix that was stripped, e.g. `my-game/dist/`. Empty if none. */
  strippedRoot: string;
  /**
   * Every directory holding an entry point, when there is more than one. The UI
   * renders these as a choice and calls `preflight` again with `root` set —
   * which is the whole reason this is data rather than only prose in a finding.
   */
  entryCandidates: string[];
  /** Paths, relative to the new root, that will go into the archive. */
  include: string[];
  fileCount: number;
  totalBytes: number;
  /** True once an `index.html` has been located and the root normalised. */
  hasEntryPoint: boolean;
  /** Which engine the scripts say they are. Identification only; see engines.ts. Absent
   * when the check stopped before reading any script. */
  engine?: EngineReport;
  /** Validated raw source identity. It can request a derived shell, but never
   * replaces the final tree's content, antivirus and runtime checks. */
  rawRuntimes?: RawRuntimeEvidence[];
  /** Frozen external source identities. Content coverage remains deferred to the
   * pipeline's bounded decoded-content and antivirus inspections. */
  externalAssets?: LargeAssetFile[];
  /** Omitted when unreadable text or uninspected wasm leaves thread use unknown. */
  threaded?: boolean;
}

/* -------------------------------------------------------------------------- */
/* What we ignore, drop and refuse                                             */
/* -------------------------------------------------------------------------- */

/** Filesystem litter. Dropped without comment; nobody put these there on purpose. */
const JUNK = /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini|__MACOSX\/)/i;

/** Dropped with a note, because the creator may not know they were being shipped. */
const SOURCE_MAP = /\.(?:js|mjs|cjs|css|wasm)\.map$/i;

/**
 * Credential-shaped. This check protects the submitter rather than the platform,
 * which is why it is a blocker and why the copy is urgent: a published `.env` is
 * a very bad day, and it is a bad day we would have caused by serving it.
 */
const CREDENTIAL = [
  { re: /(^|\/)\.env(\.|$)/i, what: "an environment file" },
  { re: /(^|\/)\.npmrc$/i, what: "an npm token file" },
  { re: /(^|\/)\.netrc$/i, what: "a netrc credential file" },
  { re: /(^|\/)(id_rsa|id_ed25519|id_ecdsa|id_dsa)(\.pub)?$/i, what: "an SSH private key" },
  { re: /\.(pem|key|p12|pfx|jks|keystore)$/i, what: "a private key" },
  { re: /(^|\/)(credentials|service[-_]account.*|gcp[-_]key.*|firebase[-_]adminsdk.*)\.json$/i, what: "a service-account key" },
  { re: /(^|\/)\.aws\//i, what: "an AWS credentials directory" },
  { re: /(^|\/)(secrets?|apikeys?)\.(json|ya?ml|txt)$/i, what: "a secrets file" },
];

/** Directories that mean the wrong thing was dragged, each with its own sentence. */
const FORBIDDEN_DIRS = [
  {
    name: "node_modules",
    re: /(^|\/)node_modules\//,
    detail:
      "Dependencies belong inside your built JavaScript, not beside it. Upload what your build step produces. node_modules would blow the file limit on its own.",
  },
  {
    name: ".git",
    re: /(^|\/)\.git\//,
    detail:
      "The repository history would be served publicly along with everything ever committed to it, including anything you have since deleted.",
  },
];

/** Extensions worth reading. Everything else is bytes we do not need to look at. */
const SCANNABLE = /\.(?:html?|js|mjs|cjs|css|importmap|svg|xml)$/i;

/**
 * Extensions worth reading *only* for a credential.
 *
 * Wider than `SCANNABLE` on purpose, and the width is the point: a key gets left
 * in a `config.json` or a `settings.yml` at least as often as in a `.js`, and the
 * origin and reference checks have no business in either. This list is
 * `content.py`'s TEXT_SUFFIXES minus two, and it is NOT what the pipeline
 * searches for credentials: `_credential_chunks` reads every file's bytes
 * whatever it is called, so a key in a renamed `data.bin` or inside a `.wasm` is
 * found there and never here. That difference is deliberate, since this check
 * runs on the creator's machine on a budget and the server's is the one that
 * refuses, but it means a pattern that misfires on binaries shows up only after
 * an upload. It is how the banner-only private key rule refused every Godot web
 * export on the server while `opengame check` passed the same folder.
 *
 * `.env` is missing because a file called that is already refused by name above,
 * and `.map` because source maps never reach the archive -- they are dropped a few
 * lines further down, so a secret in one is a secret nobody is ever served.
 */
const CREDENTIAL_SCANNABLE =
  /\.(?:html?|xhtml|js|mjs|cjs|jsx|ts|tsx|css|json|txt|md|xml|svg|webmanifest|ya?ml|toml|ini|cfg|sh|py|importmap)$/i;

/** Referenced paths we bother to resolve. Broad enough to catch the misses that matter. */
const ASSET_EXT =
  /\.(?:png|jpe?g|webp|avif|gif|svg|bmp|ktx2?|basis|dds|hdr|exr|glb|gltf|bin|obj|mtl|fbx|drc|mp3|ogg|opus|wav|m4a|mp4|webm|json|js|mjs|cjs|css|wasm|txt|csv|fnt|ttf|otf|woff2?|vert|frag|glsl)$/i;
const isAssetReference = (path: string) => ASSET_EXT.test(path) || compressedBrowserAsset(path) !== null;

/**
 * URLs that are not network requests. `xmlns="http://www.w3.org/2000/svg"` is in
 * every inlined SVG in every bundle, and flagging it would train people to
 * ignore this check — which is the only way a check like this actually fails.
 */
const NOT_A_REQUEST = /^https?:\/\/(?:www\.)?w3\.org\//i;

/**
 * The same namespace inside a percent-encoded SVG `data:` URI, where the colon after
 * `http` is written `%3A`. The origin match below takes `//www.w3.org/2000/svg` for a
 * protocol-relative URL, and NOT_A_REQUEST, which wants a scheme, did not know it: Babylon.js
 * 9.31's VR button is `"data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg..."`,
 * and the Babylon starter carried a blocker for it (23 Oct 2026).
 *
 * Only an encoded scheme directly before the slashes counts. A bare `//www.w3.org/x` with
 * nothing before it is a protocol-relative fetch and stays a finding, and the host match
 * is greedy, so `//www.w3.org.example.com/` never reaches this test as w3.org.
 */
const ENCODED_SCHEME = /https?%3A$/i;
const isEncodedNamespace = (text: string, at: number, url: string) =>
  url.startsWith("//") && ENCODED_SCHEME.test(text.slice(Math.max(0, at - 8), at)) && NOT_A_REQUEST.test(`http:${url}`);

/**
 * The other half of that argument, and the one that mattered: a URL inside a
 * comment. Library source is full of them — three.js alone cites GitHub issues,
 * a jcgt.org paper and a blog post in ordinary `//` comments — and a bundle that
 * vendors three.js the way the contract asks for was refused with three
 * blockers naming lines nobody wrote and cannot change. That is the one engine
 * this jam accepts, so the check as written refused every honest submission.
 *
 * Comments are found by walking the file rather than by regex, because the only
 * way to tell `// see https://…` from `fetch("https://…")` is to know which
 * quotes and slashes are open at that byte.
 */
const COMMENTABLE = /\.(?:html?|js|mjs|cjs|css|svg|xml)$/i;

/** Reading every byte of a 200 MB bundle in the main thread is not free. */
const MAX_SCAN_BYTES_PER_FILE = 2 * 1024 * 1024;
const MAX_SCAN_BYTES_TOTAL = 24 * 1024 * 1024;

/**
 * A `[from, to)` byte range, and the question every scan asks of one.
 *
 * Both the origin check and the reference check need to know whether the thing
 * they just matched is live code or something a person wrote *about* code. They
 * used to answer that question differently — the origin check consulted the
 * scanner, the reference check did not — which is why a vendored three.js came
 * back with three phantom textures from a JSDoc example that shows how to load
 * one. One walk, one answer, both callers.
 */
type Span = [number, number];

const spanIndexes = new WeakMap<Span[], { length: number; ranges: Span[] }>();
function isInert(spans: Span[], at: number): boolean {
  let index = spanIndexes.get(spans);
  if (!index || index.length !== spans.length) {
    index = { length: spans.length, ranges: mergeSpans(spans) };
    spanIndexes.set(spans, index);
  }
  let low = 0, high = index.ranges.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (index.ranges[middle]![0] <= at) low = middle + 1;
    else high = middle;
  }
  return low > 0 && at < index.ranges[low - 1]![1];
}

/* -------------------------------------------------------------------------- */
/* Path helpers                                                                */
/* -------------------------------------------------------------------------- */

/** Windows separators, `./` prefixes and stray leading slashes, all gone. */
function normalise(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i + 1);
}

/** Resolve `href` against the directory of the file that referenced it. */
function resolveRef(fromDir: string, ref: string): string | null {
  try { ref = decodeURIComponent(ref).normalize("NFC"); } catch { return null; }
  const base = ref.startsWith("/") ? "" : fromDir;
  const parts: string[] = [];
  for (const seg of (base + ref.replace(/^\//, "")).split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      /* Escaping the bundle root is not a path we can serve, and it is a
         different finding from a case mismatch. Give up on this reference. */
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return parts.join("/");
}

/** Line number of a byte offset, 1-based, so a finding can point at a line. */
function lineLocator(text: string): (index: number) => number {
  // Each regex pass advances monotonically. Start over only when a different
  // pass moves backwards, rather than rescanning the prefix for every match.
  let cursor = 0, line = 1;
  return (index) => {
    if (index < cursor) { cursor = 0; line = 1; }
    while (cursor < index && cursor < text.length) if (text.charCodeAt(cursor++) === 10) line += 1;
    return line;
  };
}

/* -------------------------------------------------------------------------- */
/* The preflight                                                               */
/* -------------------------------------------------------------------------- */

export interface PreflightOptions {
  /**
   * Use this directory as the bundle root instead of working it out. Set only
   * when the submitter has answered the "which of these is the game" question,
   * so their answer survives the re-run rather than being re-derived and lost.
   */
  root?: string;
  /** Server and CLI checks must inspect all text within the archive budget. */
  authoritative?: boolean;
  /** Host-provided bounded decoder. Browser callers use the streaming fallback. */
  rawInflater?: RawInflater;
  /** Trusted frozen plan, never an uploaded manifest setting. All external
   * content still requires the pipeline's complete decoded scans. */
  externalAssets?: readonly LargeAssetFile[];
  /** Reference-only names from a separately verified external plan. These do
   * not become included files, engine evidence, bytes or inspected content. */
  externalPaths?: readonly string[];
  /** The plan kind (limits.json largeAssetPlans) the two fields above belong to. Absent
   * means unity-assets-v1, the kind that existed before this field. */
  externalDelivery?: string;
  /**
   * The manifest's `requires`, from a caller that read opengame.json itself. The CLI
   * leaves the manifest out of the files it hands this check (and out of the archive), so
   * the WebGPU rule never saw `"requires": { "renderer": "webgpu" }` and told every
   * declared WebGPU game to declare it (Hearthguard, 24 Oct 2026). When given, it is the
   * answer, ahead of any opengame.json among the files.
   */
  manifestRequires?: unknown;
}

/** Portable comparison keys never replace the original serving paths. A file
 * cannot also be the directory through which another input is reached. */
const pathEncoder = new TextEncoder();
function withinPathByteLimit(path: unknown): path is string {
  // UTF-8 cannot use fewer bytes than UTF-16 code units. Bound that cheap count
  // before allocating encoded bytes, then account for multibyte names exactly.
  return typeof path === "string" && path.length <= BUNDLE.pathBytesMax &&
    pathEncoder.encode(path).byteLength <= BUNDLE.pathBytesMax;
}

function hasCanonicalPathCollision(paths: readonly string[]): boolean {
  // Every caller rejects this as its own invalid-path finding. Keep the guard
  // here too so a future caller cannot expand an unbounded prefix list.
  if (paths.some(path => !withinPathByteLimit(path))) return true;
  const keys = new Set(paths.map(canonicalName));
  if (keys.size !== paths.length) return true;
  for (const key of keys) {
    const parts = key.split("/");
    for (let end = 1; end < parts.length; end++) {
      if (keys.has(parts.slice(0, end).join("/"))) return true;
    }
  }
  return false;
}

/** engine_archives.py `compressed_asset_mismatch`. og-games answers a request for
 * `main.js` with `main.js.br` when the browser accepts brotli, while every check and
 * the playtest read `main.js`, so the two must be the same bytes. The server compares
 * SHA-256 of the decoded stream; this compares the decoded text the reader already
 * produced, and skips a pair it cannot read rather than guessing. */
async function compressedSiblingFindings(kept: PreflightFile[], reading: PreflightFile[], texts: (string | null | undefined)[]): Promise<Finding[]> {
  const byPath = new Map(kept.map(file => [file.path, file] as const));
  const mismatched: string[] = [];
  const strip = (text: string) => text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (const [index, file] of reading.entries()) {
    const asset = precompressedAsset(file.path), decoded = texts[index];
    const sibling = asset ? byPath.get(asset.path) : undefined;
    if (!asset || !sibling || decoded == null) continue;
    const decodedBytes = file.decodedText?.decodedByteLength?.();
    let same: boolean | null;
    try {
      if (decodedBytes !== undefined && decodedBytes !== sibling.size) same = false;
      else if (/\.js$/i.test(asset.path)) {
        const other = sibling.bytes ? new TextDecoder("utf-8", { fatal: true }).decode(await sibling.bytes()) : await sibling.text();
        same = strip(other) === strip(decoded);
      } else if (sibling.bytes) {
        // Non-script payloads are decoded one byte per character (latin1).
        const bytes = await sibling.bytes();
        same = bytes.length === decoded.length && bytes.every((byte, i) => decoded.charCodeAt(i) === byte);
      } else same = null;
    } catch { same = false; }
    if (same === false) mismatched.push(file.path);
  }
  if (!mismatched.length) return [];
  const first = mismatched[0]!, plain = precompressedAsset(first)!.path;
  return [{ code: "compressed-asset-mismatch", severity: "blocker", path: first, more: mismatched.slice(1),
    title: `${first} does not decode to the same bytes as ${plain}.`,
    detail: `Browsers that accept the compressed copy would get a different file from the one that was checked. Recompress it from ${plain}, or remove it.` }];
}

export async function preflight(
  input: PreflightFile[],
  options: PreflightOptions = {},
): Promise<PreflightResult> {
  const findings: Finding[] = [];
  const externalPaths = options.externalPaths ?? [];
  const delivery = options.externalDelivery ?? LARGE_ASSET_DELIVERY;
  const lane = largeAssetLimits(delivery);
  if (!lane || !Array.isArray(externalPaths) || externalPaths.length > lane.fileCountMax ||
      externalPaths.some(path => !withinPathByteLimit(path)) ||
      externalPaths.some(path => !isLargeAssetPath(path, delivery)) ||
      hasCanonicalPathCollision(externalPaths)) {
    return { ok: false, findings: [{ code: "external-reference-path-invalid", severity: "blocker",
      title: "The external reference paths are not canonical." }], strippedRoot: "", entryCandidates: [],
      include: [], fileCount: input.length, totalBytes: input.reduce((sum, file) => sum + file.size, 0), hasEntryPoint: false };
  }
  if (options.externalAssets !== undefined && input.some(file => !withinPathByteLimit(file.path))) {
    return { ok: false, findings: [{ code: "external-assets-invalid", severity: "blocker",
      title: `A file path is longer than ${BUNDLE.pathBytesMax} bytes.`,
      detail: `A file's path inside the game, folders included, can be at most ${BUNDLE.pathBytesMax} bytes. Shorten the folder or file names.`,
    }], strippedRoot: "", entryCandidates: [], include: [], fileCount: input.length,
    totalBytes: input.reduce((sum, file) => sum + file.size, 0), hasEntryPoint: false };
  }
  const oversizedAssetPath = Array.isArray(options.externalAssets) &&
    options.externalAssets.some(row => typeof row?.path === "string" && !withinPathByteLimit(row.path));
  const externalAssets = oversizedAssetPath ? null :
    options.externalAssets === undefined ? [] : validateLargeAssetFiles(options.externalAssets, delivery);
  const external = new Map((externalAssets ?? []).map(row => [row.path, row]));
  // How many inputs carry each path at each size, counted once: a search per planned
  // asset was 170 million comparisons for OG Clash's 13,068 files.
  const inputCounts = new Map<string, number>();
  if (external.size) for (const file of input) inputCounts.set(`${file.size}:${file.path}`, (inputCounts.get(`${file.size}:${file.path}`) ?? 0) + 1);
  if (externalAssets === null || (external.size > 0 && (
    input.length > lane.combinedFileCountMax ||
    hasCanonicalPathCollision(input.map(file => file.path)) ||
    input.some(file => !Number.isSafeInteger(file.size) || file.size < 0 || normalise(file.path) !== file.path) ||
    externalAssets.some(row => inputCounts.get(`${row.byteSize}:${row.path}`) !== 1) ||
    input.filter(file => !external.has(file.path)).reduce((sum, file) => sum + file.size, 0) > BUNDLE.uncompressedBytesMax
  ))) {
    return { ok: false, findings: [{ code: "external-assets-invalid", severity: "blocker",
      title: "The external asset plan does not match the game tree." }], strippedRoot: "", entryCandidates: [],
      include: [], fileCount: input.length, totalBytes: input.reduce((sum, file) => sum + file.size, 0), hasEntryPoint: false };
  }

  /* Normalise and drop junk in one walk. Two chained passes over a list that can be
     1500 entries is not expensive on its own — the point is that this runs on the
     creator's machine before anything else in preflight, and every pass here is one
     they wait through. */
  const files: typeof input = [];
  for (const f of input) {
    const path = normalise(f.path);
    if (path === "" || JUNK.test(path)) continue;
    files.push({ ...f, path, sourcePath: f.path });
  }

  if (files.length === 0) {
    return {
      ok: false,
      findings: [
        {
          code: "empty",
          severity: "blocker",
          title: "That folder is empty.",
          detail:
            "Nothing readable came through. If you dropped an alias or a shortcut, drop the real folder instead.",
        },
      ],
      strippedRoot: "",
      entryCandidates: [],
      include: [],
      fileCount: 0,
      totalBytes: 0,
      hasEntryPoint: false,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Credentials first, always                                              */
  /* ---------------------------------------------------------------------- */

  /* Ahead of everything else, and reported against the raw tree rather than the
     normalised one. A key sitting in a directory we were about to strip is still
     a key sitting in the folder they were about to publish, and telling them is
     worth more than telling them their root is wrong. */
  /* One walk of the file list, testing every pattern as it goes, rather than a
     fresh walk per pattern. There are a dozen or so credential shapes and a bundle
     may hold 1500 files, so the old form did tens of thousands of regex tests plus
     a second pass to collect each result — for a check that runs while somebody
     watches a spinner. */
  const credentialHits = new Map<string, string[]>();
  for (const file of credentialChecks() ? files : []) {
    for (const { re, what } of CREDENTIAL) {
      if (!re.test(file.path)) continue;
      const found = credentialHits.get(what);
      if (found) found.push(file.path);
      else credentialHits.set(what, [file.path]);
    }
  }

  for (const { what } of CREDENTIAL) {
    const hits = credentialHits.get(what);
    if (!hits || hits.length === 0) continue;
    findings.push({
      code: "credential",
      severity: "blocker",
      title: `${hits[0]} looks like ${what}.`,
      detail:
        "We refuse this before the bytes are ever uploaded, because publishing it would put it in front of everybody who plays the game. Delete it from the folder, and if it holds a real credential, rotate that credential now rather than later.",
      path: hits[0],
      more: hits.slice(1),
    });
  }

  /* ---------------------------------------------------------------------- */
  /* The wrong directory entirely                                           */
  /* ---------------------------------------------------------------------- */

  for (const dir of FORBIDDEN_DIRS) {
    const hits = files.filter((f) => dir.re.test(f.path));
    if (hits.length === 0) continue;
    const bytes = hits.reduce((n, f) => n + f.size, 0);
    findings.push({
      code: "forbidden-dir",
      severity: "blocker",
      title: `${dir.name}/ is in the folder: ${hits.length.toLocaleString("en-GB")} file${hits.length === 1 ? "" : "s"}, ${formatBytes(bytes)}.`,
      detail: dir.detail,
      path: hits[0].path,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Find the root                                                          */
  /* ---------------------------------------------------------------------- */

  const entryName = BUNDLE.entryPoint;
  const entries = files.filter(
    (f) => f.path.toLowerCase().endsWith(`/${entryName}`) || f.path.toLowerCase() === entryName,
  );
  const roots = entries.map((f) => dirOf(f.path));
  const candidates = [...roots].sort(
    (a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b),
  );

  let strippedRoot = "";
  let hasEntryPoint = false;

  if (options.root !== undefined && roots.includes(options.root)) {
    /* They answered the question below. Take the answer. */
    strippedRoot = options.root;
    hasEntryPoint = true;
    if (strippedRoot) {
      findings.push({
        code: "root-chosen",
        severity: "note",
        title: `Serving ${strippedRoot}${entryName} as the game.`,
        detail: `Everything outside ${strippedRoot} was left out of the archive.`,
      });
    }
  } else if (roots.includes("")) {
    /* Already the right shape. Say nothing — a check that congratulates you for
       doing the ordinary thing is noise. */
    hasEntryPoint = true;
  } else if (roots.length === 1) {
    /* The single most common upload shape: they zipped the folder, or the build
       wrote to dist/. One candidate is unambiguous, so fix it and say so. */
    strippedRoot = roots[0];
    hasEntryPoint = true;
    findings.push({
      code: "root-stripped",
      severity: "note",
      title: `Using ${strippedRoot}${entryName} as the root.`,
      detail: `Everything above ${strippedRoot} was dropped, so the game serves from its own root the way it will on OpenGame.`,
    });
  } else if (roots.length > 1) {
    /* Guessing here is how you publish somebody's level editor instead of their
       game. So do not guess, and do not make them re-drag the folder either:
       `entryCandidates` goes to the UI as a list of buttons, and the answer
       comes back as `options.root`. */
    findings.push({
      code: "root-ambiguous",
      severity: "blocker",
      title: `There are ${roots.length} ${entryName} files here, and only you know which one is the game.`,
      detail:
        "Pick the one a player should land on. Everything outside that directory is left out of the archive, so if your level editor or a marketing page is in there too, this is where it stops.",
      more: candidates.map((r) => `${r}${entryName}`),
    });
  } else {
    findings.push(diagnoseMissingEntry(files));
  }

  /* ---------------------------------------------------------------------- */
  /* Apply the root, then the exclusions                                    */
  /* ---------------------------------------------------------------------- */

  const scoped = (strippedRoot ? files.filter((f) => f.path.startsWith(strippedRoot)) : files).map((f) => ({
    ...f,
    path: f.path.slice(strippedRoot.length),
  }));

  const maps = scoped.filter((f) => SOURCE_MAP.test(f.path));
  if (maps.length > 0) {
    findings.push({
      code: "source-maps-dropped",
      severity: "note",
      title: `Left out ${maps.length} source map${maps.length === 1 ? "" : "s"}.`,
      detail:
        "Source maps publish your original source alongside the build and are never needed to play. They are excluded from the archive.",
      path: maps[0].path,
    });
  }

  const kept = scoped.filter(
    (f) => !SOURCE_MAP.test(f.path) && !FORBIDDEN_DIRS.some((d) => d.re.test(f.path)),
  );

  const totalBytes = kept.reduce((n, f) => n + f.size, 0);

  // Ordinary files and reference-only assets occupy one final namespace after
  // root selection and exclusions. Reject overlap before any content readers;
  // reference names still do not become inspected or included files.
  const retainedPaths = kept.map(file => file.path);
  const overlongRetainedPath = retainedPaths.some(path => !withinPathByteLimit(path));
  if (overlongRetainedPath || hasCanonicalPathCollision([...retainedPaths, ...externalPaths])) {
    if (externalPaths.length > 0) {
      findings.push({
        code: "external-reference-path-invalid", severity: "blocker",
        title: overlongRetainedPath ? `A retained game path exceeds ${BUNDLE.pathBytesMax} bytes.` :
          "The external reference paths overlap the retained game files.",
      });
    } else if (overlongRetainedPath) {
      findings.push({
        code: "path-too-long", severity: "blocker",
        title: `A file path is longer than ${BUNDLE.pathBytesMax} bytes.`,
        detail: `A file's path inside the game, folders included, can be at most ${BUNDLE.pathBytesMax} bytes. Shorten the folder or file names.`,
      });
    } else {
      const collisions = nameFindings(retainedPaths).filter(finding =>
        finding.code === "case-collision" || finding.code === "unicode-collision");
      findings.push(...(collisions.length ? collisions : [{
        code: "case-collision", severity: "blocker" as const,
        title: "Some game paths identify the same file or use a file as a directory.",
        detail: "Rename the overlapping file or directory so every file has a distinct portable path.",
      }]));
    }
    return { ok: false, findings: order(findings).map(redactFinding),
    strippedRoot, entryCandidates: candidates.length > 1 ? candidates : [],
    include: [], fileCount: kept.length, totalBytes, hasEntryPoint };
  }

  /* ---------------------------------------------------------------------- */
  /* Counts                                                                 */
  /* ---------------------------------------------------------------------- */

  // A large-asset plan holds the whole tree to its own count; the boot bytes below keep
  // the bundle's limit either way.
  const filesMax = external.size ? lane.combinedFileCountMax : BUNDLE.fileCountMax;
  if (kept.length > filesMax) {
    findings.push({
      code: "file-count",
      severity: "blocker",
      title: `${kept.length.toLocaleString("en-GB")} files. The limit is ${filesMax.toLocaleString("en-GB")}.`,
      detail:
        "Usually this is a texture or audio directory that was never atlased or packed. Combining them also cuts the number of requests the game makes on load, which is the number players feel.",
    });
  }

  // One file past bundle.fileBytesMax: the pipeline refuses it before opening the archive
  // (inspect_zip), so it is a blocker here too. A plan's external files keep their own cap.
  const oversized = kept.filter(file => !external.has(file.path) && file.size > BUNDLE.fileBytesMax);
  if (oversized.length) {
    const largest = oversized.reduce((a, b) => (b.size > a.size ? b : a));
    findings.push({
      code: "file-size",
      severity: "blocker",
      title: `${largest.path} is ${formatBytes(largest.size)}. One file can be at most ${formatBytes(BUNDLE.fileBytesMax)}.`,
      detail: oversized.length > 1
        ? `${oversized.length} files are over it. Split each one, or compress it in a format the game decodes itself.`
        : "Split it, or compress it in a format the game decodes itself.",
      path: largest.path,
    });
  }

  const bootBytes = kept.filter(file => !external.has(file.path)).reduce((sum, file) => sum + file.size, 0);
  if (bootBytes > BUNDLE.uncompressedBytesMax) {
    findings.push({
      code: "uncompressed-size",
      severity: "blocker",
      title: `${formatBytes(totalBytes)} uncompressed. The limit is ${formatBytes(BUNDLE.uncompressedBytesMax)}.`,
      detail:
        "Textures are almost always the cause. KTX2 rather than PNG, Draco or meshopt on meshes, Opus rather than wav. See section 7 of /agent.md.",
    });
  } else if (totalBytes > LIMITS.performance.initialTransferBytesWarn) {
    findings.push({
      code: "size-warn",
      severity: "warning",
      title: `${formatBytes(totalBytes)} uncompressed.`,
      detail: `Within the limit. Worth checking that under ${formatBytes(LIMITS.performance.initialTransferBytesWarn)} of it is needed before the first playable frame. That is the number judges feel, and it is scored under technical execution.`,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Read the text files: outbound origins, then capitalisation             */
  /* ---------------------------------------------------------------------- */

  const byLowerPath = new Map([...externalPaths.map(path => [path.toLowerCase(), path] as const),
    ...kept.map((f) => [f.path.toLowerCase(), f.path] as const)]);
  const exact = new Set([...externalPaths, ...kept.map((f) => f.path)]);

  /* Standalone SVG and XML documents last, so on the creator's machine, where the budget below binds, they can
     never push the game's own pages and scripts out of it. */
  const scannable = kept.filter((f) => !external.has(f.path) && SCANNABLE.test(compressedBrowserAsset(f.path)?.path ?? f.path) && (options.authoritative || f.size <= MAX_SCAN_BYTES_PER_FILE))
    .sort((a, b) => Number(XML_DOCUMENT.test(compressedBrowserAsset(a.path)?.path ?? a.path)) - Number(XML_DOCUMENT.test(compressedBrowserAsset(b.path)?.path ?? b.path)));
  /* Everything else a credential could be sitting in. Kept as a second list rather
     than folded into the first because the origin and reference checks would produce
     nothing but noise over a YAML file, and because of the budget below.
     A precompressed asset (.wasm.br, .data.gz) is on this list too, and that read is not
     only for credentials: it is where the stream is decoded, so a malformed or nested one
     is refused and its copy is compared with the plain file beside it. So with credential
     checks off (credentialChecks) the compressed assets are still read and only the plain
     credential-shaped files are left out; findCredentials then finds nothing in them. */
  const credentialOnly = kept.filter(
    (f) =>
      !external.has(f.path) && !SCANNABLE.test(compressedBrowserAsset(f.path)?.path ?? f.path) &&
      ((credentialChecks() && CREDENTIAL_SCANNABLE.test(f.path)) || compressedBrowserAsset(f.path) !== null) &&
      (options.authoritative || f.size <= MAX_SCAN_BYTES_PER_FILE),
  );
  let scanned = 0;

  const origins: Finding[] = [];
  /* Everything gamePolicy refuses or asks a reviewer about, by host or by code shape.
     Its own list and its own cap, so six plain-http blockers cannot push a Stripe import
     out of the six origin findings a creator is shown. */
  const policy: Finding[] = [];
  const signals = new Map<string, { finding: Finding; more: string[] }>();
  /* Hosts outside OpenGame that the game may now reach, with where each is first named.
     Allowed, so they become one note rather than a finding apiece. */
  const externalHosts = new Map<string, string>();
  const caseMismatch: Finding[] = [];
  const missingImports: Finding[] = [];
  // Keyed by the missing file: the title counts files, and the SDK's mock asks for
  // opengame.json twice from one line, which read as "2 referenced files".
  const missingRefs = new Map<string, string>();
  const credentials: Finding[] = [];
  const possibleSecrets: Finding[] = [];

  /* Which files fit the budget is decided from `size`, which is already known — so
     the set is identical to what the old serial loop would have reached, and the
     reads no longer have to happen one after another to find out. That mattered:
     this is hundreds of small reads on the creator's machine while they watch a
     spinner, and in series it was the slowest part of preflight by a wide margin. */
  /* ONE BUDGET, AND THE SCANNABLE FILES TAKE FROM IT FIRST. Widening what gets read
     for credentials must not quietly narrow what gets read for origins: give the two
     lists a budget each and a 200 MB bundle doubles the bytes pulled through the main
     thread, share one with the data files at the front and a fat `levels.json` can push
     the game's own JavaScript out of a check it used to pass through. So the order is
     fixed and today's selection is exactly today's selection, with the credential-only
     files taking whatever is left. */
  const inBudget: typeof scannable = [];
  for (const file of scannable) {
    if (!options.authoritative && scanned > MAX_SCAN_BYTES_TOTAL) break;
    scanned += file.size;
    inBudget.push(file);
  }

  const credentialExtras: typeof credentialOnly = [];
  for (const file of credentialOnly) {
    if (!options.authoritative && scanned > MAX_SCAN_BYTES_TOTAL) break;
    scanned += file.size;
    credentialExtras.push(file);
  }

  /* Compiled once for the whole run rather than per file, and inside the function
     rather than at module scope: a malformed pattern in limits.json should break an
     upload loudly, not throw while Next is collecting page data for an unrelated
     route. */
  /* None at all on the minimal checks (see credentialChecks): findCredentials then finds
     nothing, and the credential-only files above were never selected for reading. */
  const blockingCredentials = credentialChecks() ? compiledCredentialPatterns("content") : [];
  const weakCredentials = credentialChecks() ? compiledCredentialPatterns("suspicious") : [];
  for (const file of kept) {
    for (const found of findCredentials(file.path, file.path, blockingCredentials, weakCredentials))
      (found.severity === "blocker" ? credentials : possibleSecrets).push({ ...found,
        title: `${file.path} has a credential-shaped value in its name.`,
        detail: "Rename the file and update its references. Players can read every served filename. If the value was real, rotate it." });
  }

  const reading = [...inBudget, ...credentialExtras];
  const texts = await Promise.all(reading.map(async (file) => {
    if (!compressedBrowserAsset(file.path)) return file.text().catch(() => null);
    try {
      const raw = await file.text();
      for (const found of findCredentials(file.path, raw, blockingCredentials, weakCredentials))
        (found.severity === "blocker" ? credentials : possibleSecrets).push(found);
      return file.decodedText ? await file.decodedText() : null;
    } catch { return null; }
  }));

  findings.push(...await compressedSiblingFindings(kept, reading, texts));

  const modules = modulePathAnalysis(inBudget.flatMap((file, i) => texts[i] == null ? [] : [{ path: file.path, text: texts[i]! }]), new Set(kept.map(file => file.path)));
  findings.push(...modules.findings);
  /* The entry document only. A level editor beside the game that loads its own `.ts` is
     not what a player opens, and refusing the game for it would be refusing the wrong
     page. The root has been applied by now, so the entry is at the top whatever case its
     name was matched in. */
  const unbuilt = [...new Map(modules.sourceLoads.filter((row) => row.document.toLowerCase() === entryName)
    .map((row) => [`${row.document}:${row.target}`, row])).values()];
  if (unbuilt.length) findings.push(sourceEntryFinding(unbuilt, files));

  /* Before the loop, because what the loop says about an engine's own defaults depends
     on which engine this is. The pages and scripts engine-files.json names, which is the
     list engines.py reads too: a `levels.json` or a stylesheet is not evidence. Each is
     scannable, so a complete read is every one of them in the budget and decoded. */
  const engineText = kept.filter(file => !external.has(file.path) && engineFileKind(file.path) === "text");
  const readAt = new Map(inBudget.map((file, i) => [file, i]));
  const completeEngineText = engineText.every(file => readAt.has(file) && texts[readAt.get(file)!] != null);
  const rawRuntimes: RawRuntimeEvidence[] = [];
  const rawCandidates = kept.filter(file => /\.(?:swf|jsdos)$/i.test(file.path));
  // Compressed text readers ran above, within their own shared budget. Charge
  // their actual decoded strings before granting raw parsers the remainder.
  // UTF-8 decoding can discard a three-byte BOM; reserve it conservatively.
  let logicalBytes = bootBytes, decodedUnavailable = false;
  for (const file of rawCandidates.length ? kept.filter(file => !external.has(file.path) && compressedBrowserAsset(file.path)) : []) {
    const i = reading.indexOf(file), text = texts[i];
    if (i < 0 || text == null) { decodedUnavailable = true; continue; }
    const asset = compressedBrowserAsset(file.path)!;
    let decodedBytes = file.decodedText?.decodedByteLength?.();
    if (decodedBytes === undefined && /\.js$/i.test(asset.path)) {
      decodedBytes = 3;
      for(const char of text) {
        const point=char.codePointAt(0)!;
        decodedBytes += point<0x80?1:point<0x800?2:point<0x10000?3:4;
      }
    }
    decodedBytes ??= text.length;
    if(!Number.isSafeInteger(decodedBytes) || decodedBytes<0) { decodedUnavailable=true; continue; }
    logicalBytes += Math.max(0, decodedBytes - file.size);
  }
  let rawExtraBytes = 0, rawMembers = 0;
  if (kept.length <= BUNDLE.fileCountMax && bootBytes <= BUNDLE.uncompressedBytesMax) for (const file of rawCandidates) {
    try {
      if (decodedUnavailable || logicalBytes > BUNDLE.uncompressedBytesMax) throw new RawRuntimeError("engine_archive_byte_limit");
      const receipt = await inspectRawRuntime(file, {
        maximum: BUNDLE.uncompressedBytesMax - logicalBytes - rawExtraBytes + file.size,
        members: BUNDLE.fileCountMax - kept.length - rawMembers, inflate: options.rawInflater,
      });
      if (!receipt) continue;
      rawRuntimes.push(receipt);
      rawExtraBytes += Math.max(0, receipt.expandedBytes - receipt.bytes);
      rawMembers += receipt.memberCount;
      if (receipt.manualReviewRequired) findings.push({ code: "engine-archive-not-inspected", severity: "warning", path: file.path,
        title: `${file.path} contains data that needs manual inspection.`, detail: "A canonical shell cannot be selected automatically until the payload is completely inspected." });
    } catch (error) {
      findings.push({ code: error instanceof RawRuntimeError ? error.message : "engine_archive_invalid", severity: "blocker", path: file.path,
        title: `${file.path} could not be completely inspected.`, detail: "Rebuild or unpack the payload before uploading it." });
      // A failed inflater may have spent the remaining allowance already.
      break;
    }
  }
  const eligible = rawRuntimes.filter(row => row.complete && !row.manualReviewRequired);
  if (!hasEntryPoint && entries.length === 0 && kept.filter(file => /\.(?:swf|jsdos)$/i.test(file.path)).length === 1 && eligible.length === 1) {
    // Preserve source-tree diagnostics even if a valid raw game was left beside
    // the project's source. Only a missing HTML entry can be supplied for it.
    const index = findings.findIndex(row => row.code === "no-entry");
    if (index >= 0) {
      findings.splice(index, 1);
      findings.push({ code: "raw-runtime-shell", severity: "note", path: eligible[0]!.path,
        title: "A pinned runtime shell will be derived for this payload.",
        detail: "The server verifies the source identity, scans the decoded content, then scans and reviews the complete derived game." });
    }
  }
  const engineSources = inBudget.flatMap((file, i) => texts[i] == null || engineFileKind(file.path) !== "text" ? [] : [{ path: file.path, text: texts[i]! }]);
  /* Every module is read, because two answers live only in the wasm: whether a
     structural signature's imports and sections are really there (engines.ts, `wasm`), and
     whether the bytes carry an engine's licence stamp, which asks for that engine's
     publication statement however well the loader is hidden. A decoded copy the
     credential pass already holds is reused. Reading stops early only once nothing more
     can change: an engine matched structurally, with its version, and its stamp seen. */
  const wasmModules: WasmModule[] = [];
  const wasmFiles = kept.filter((f) => !external.has(f.path) && engineFileKind(f.path) === "module")
    .sort((a, b) => Number(Boolean(compressedBrowserAsset(a.path))) - Number(Boolean(compressedBrowserAsset(b.path))));
  let detected = detectEngine(kept.map((f) => f.path), engineSources, { complete: completeEngineText });
  /* Thread use can still change while a module is unread, so the early stop below waits for
     it too, unless the glue already said so. Not waiting would be cheap and wrong: a build
     whose engine settles on its first module would never have its second one asked whether
     its memory is shared. */
  const glueThreaded = engineSources.some((source) => sourceUsesThreads(source.text));
  for (const file of wasmFiles) {
    let bytes: Uint8Array | null = null;
    try {
      const held = reading.indexOf(file);
      const decoded = held >= 0 ? texts[held] ?? null : null;
      if (decoded != null) bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0) & 0xff);
      else if (!compressedBrowserAsset(file.path)) bytes = file.bytes ? await file.bytes() : new TextEncoder().encode(await file.text());
      else if (file.decodedText) bytes = Uint8Array.from(await file.decodedText(), (char) => char.charCodeAt(0) & 0xff);
    } catch { bytes = null; }
    if (!bytes) continue;
    wasmModules.push(wasmModule(file.path, bytes));
    detected = detectEngine(kept.map((f) => f.path), engineSources, { complete: completeEngineText, wasm: wasmModules });
    const settled = [detected, ...detected.also].some((e) => e.version && wasmModules.some((m) => e.evidence.endsWith(` and ${m.path}`)))
      && wasmModules.some((m) => m.licences.length) && (glueThreaded || wasmModules.some((m) => m.sharedMemory));
    if (settled) break;
  }
  /* THE STAMP SEARCH IS BROADER THAN THE MODULES, AND BEST EFFORT. A module renamed
     `game.bin` or `x.data`, or inlined as base64 in a SINGLE_FILE page, carries the same
     stamp. So every text this scan already holds is searched (scripts, credential reads,
     decoded compressed assets), raw and at the three base64 alignments, and any other
     file whose first bytes are a wasm header is read as a module. What could not be read,
     a decode skipped for its budget above all, is named in a finding rather than taken
     as "no stamp". A stamp built at runtime from pieces is beyond any of this. */
  const wasmNames = new Set(wasmFiles.map((f) => f.path));
  const stampsSeen = new Set(wasmModules.flatMap((m) => m.licences));
  const unsearched: string[] = wasmFiles.filter((f) => !wasmModules.some((m) => m.path === f.path)).map((f) => f.path)
    .filter((path) => !stampsSeen.size);
  reading.forEach((file, i) => {
    const text = texts[i];
    if (text == null) { if (compressedBrowserAsset(file.path) && !wasmNames.has(file.path)) unsearched.push(file.path); return; }
    for (const id of licenceStamps(text)) stampsSeen.add(id);
  });
  for (const file of kept) {
    if (external.has(file.path) || wasmNames.has(file.path) || reading.includes(file) || !file.head) continue;
    try {
      const head = await file.head(4);
      if (head[0] !== 0 || head[1] !== 0x61 || head[2] !== 0x73 || head[3] !== 0x6d || !file.bytes) continue;
      const module = wasmModule(file.path, await file.bytes());
      wasmModules.push(module);
      for (const id of module.licences) stampsSeen.add(id);
    } catch { unsearched.push(file.path); }
  }
  /* A module found by its header under another name is asked for a licence stamp above and
     never for an engine, which is the rule engines.ts states and engines.py keeps: until
     5 Nov 2026 these modules went back into detection here, so a Kaigen module renamed
     `game.bin` could name Kaigen on this side alone. Detection already holds every .wasm. */
  for (const module of wasmModules) delete module.text;
  if (unsearched.length) findings.push({ code: "licence-search-incomplete", severity: "note", path: unsearched[0], more: unsearched.slice(1, 10),
    title: `${unsearched.length} file${unsearched.length === 1 ? " was" : "s were"} not searched for an engine licence stamp.`,
    detail: "A stamp asks for that engine's publication statement. These files could not be read within the check's budget, so the search is incomplete for them; the server's scan reads them again." });
  detected = await withGodotPckVersion(detected, kept, engineSources);
  const licences = [...stampsSeen].sort();
  const engine = { ...withRawRuntimeEvidence(detected, rawRuntimes), ...(licences.length ? { licences } : {}) };
  const engineIds = detectedIds(engine);
  /* SAID OUT LOUD, AND NEVER A FAILURE. A Kaigen build carries its licence's stamp by
     design, ingest token included, and a creator who has seen a stamped string near a scan
     for keys reasonably wonders whether it is about to refuse them. It is not: the token is
     forty hex characters and matches none of limits.json's credential shapes, here or in
     content.py, so nothing is exempted for it. A key-shaped value in a script or a text file
     is refused here as before, stamp or none (tests/kaigen-stamp.test.ts). This check does
     not read a .wasm for keys at all (CREDENTIAL_SCANNABLE says why); content.py reads every
     byte on the server and refuses a key inside the stamped module there
     (test_credential_patterns.py). The stamp asks for the publication statement, which is
     the server's to collect. "Normal" is said only of a build recognised as that engine's:
     a stamp in anything else is a copied string, and the note says that instead. */
  for (const id of licences) {
    const name = ENGINE_NAMES[id as EngineId] ?? id;
    findings.push({ code: "engine-licence-stamp", severity: "note",
      title: engineIds.has(id as EngineId)
        ? `${name} licence stamp found; this is normal for ${name} web builds.`
        : `${name} licence stamp found in a build that is not recognised as a ${name} export.`,
      detail: "Leave the .wasm as the engine built it. Publishing asks you to accept the engine's publication statement." });
  }
  /* Engine identity is routing, not admission: a 105-byte wasm with Kaigen's import
     names reads as Kaigen. This tells a creator early that the plan they chose does not
     fit their export. What admits a plan is the account's lane grant, on the server; the
     statement and the licence stamp are checks beside it, and the stamp is a copyable
     string, not a control. It is checked here so a creator without one hears it before
     uploading 3 GiB. */
  const plan = largeAssetPlan(delivery);
  const keptPaths = new Set(kept.map(file => file.path));
  /* An anyEngine plan (large-game-v1) admits a build whatever it is, or nothing, unless it
     carries an engine whose own lane asks for a statement; the boot text must still have
     been read completely, or "no Kaigen here" would be a guess. A licence stamp counts as
     that engine whatever detection said: a review of 27 Oct 2026 hid a real Kaigen export
     from detection by quoting one glue key and renaming its worker to .cjs, and the stamp
     was still in its wasm. */
  const claimed = new Set<string>([...engineIds, ...licences]);
  if (external.size && (!plan || !largeAssetPlanAdmits(delivery, claimed) || !completeEngineText || strippedRoot ||
      externalAssets!.some(row => !keptPaths.has(row.path)))) {
    const refused = plan?.anyEngine ? [...claimed].filter(id => (plan.refusedEngines ?? []).includes(id)) : [];
    const names = (plan?.engines ?? []).map(id => id[0]!.toUpperCase() + id.slice(1)).join(" or ");
    findings.push({ code: delivery === LARGE_ASSET_DELIVERY ? "external-assets-unity-required" : "external-assets-engine-required", severity: "blocker",
      title: refused.length
        ? `This is a ${ENGINE_NAMES[refused[0] as EngineId] ?? refused[0]} export, so its external assets go through that engine's own asset plan, not ${delivery}.`
        : `External assets require a completely inspected ${names || "supported"} boot tree.` });
  } else if (external.size && plan?.licenceStamp && !licences.includes(plan.licenceStamp)) {
    findings.push({ code: "external-assets-licence-required", severity: "blocker",
      title: "None of the boot .wasm files has the engine's licence stamp.",
      detail: "This upload route is for licensed engine exports. Upload the build the engine produced, with its .wasm unchanged." });
  }
  // Name admission follows detection: a configured suffix permits a parser only
  // for its engine, and the archive stage still inspects the actual bytes. Detection
  // is copyable text, so an engine ZIP must also have its engine's own members.
  const sharedModules = wasmModules.filter((m) => m.sharedMemory).map((m) => m.path);
  findings.push(...nameFindings(kept.map((f) => f.path), engineIds));
  findings.push(...await engineArchiveShapeFindings(kept, engineIds));
  findings.push(...engineFindings(kept.map((f) => f.path), inBudget.flatMap((file, i) =>
    texts[i] == null ? [] : [{ path: file.path, text: texts[i]! }]).concat(reading.flatMap((file, i) =>
      file.path === "opengame.json" && texts[i] != null && options.manifestRequires === undefined ? [{ path: file.path, text: texts[i]! }] : []))
    .concat(options.manifestRequires === undefined ? [] : [{ path: "opengame.json", text: JSON.stringify({ requires: options.manifestRequires }) }]), engine, sharedModules));
  findings.push(...await encryptedPckFindings(kept));
  if (engineIds.has("defold")) findings.push(...await defoldCustomKeyFindings(kept));
  /* The glue's word or the module's own memory flags, whichever speaks. The second is the
     one minification cannot touch, and it is what `threaded` in the scan receipt, and so the
     move onto an isolated contract, now rests on when the glue has been renamed into
     silence (wasm-module.ts). A module that was not read says nothing either way. */
  const threaded = glueThreaded || sharedModules.length > 0;
  const bundlePaths = kept.map((f) => f.path);
  const fileNames = new Set([...exact].map((path) => path.slice(path.lastIndexOf("/") + 1)));
  const knownOrigin = (url: string, site: Site) => engineDefault(ENGINE_DEFAULT_ORIGINS, engineIds, url, bundlePaths, site);
  const engineRefs = new Map<EngineId, Map<string, { at: string; value: string; why: string }>>();
  const godotLoad = engineIds.has("godot") ? godotLoadPath(engineSources) : null;
  const defoldArchive = engineIds.has("defold") ? defoldArchivePrefix(engineSources) : null;
  const defoldWasm = engineIds.has("defold") ? defoldEngineWasm(engineSources) : null;

  for (const [i, file] of reading.entries()) {
    const text = texts[i];
    /* An unreadable file is skipped, exactly as the serial version did — a folder
       can hold something the browser will not hand us, and that is not a reason to
       refuse the whole bundle. */
    if (text === null || text === undefined) {
      if (options.authoritative) findings.push({ code: "unreadable-file", severity: "blocker",
        title: `Could not read ${file.path}.`, path: file.path,
        /* A compressed engine file that would not decompress says what to change in the
           engine, since "make the file readable" means nothing to somebody holding a
           default Unity export (launch E2E, J-opus-E2 and J-astra-E2, 13 Nov 2026). */
        detail: compressedBrowserAsset(file.path) ? UNREADABLE_COMPRESSED : "Make the file readable, finish building, then run the check again." });
      continue;
    }

    /* Credentials before anything else, and asked of every file that was opened.
       Deliberately without the inert walk the two checks below depend on: a key
       commented out is still a key on a public CDN, and `content.py` says the same
       thing in its own words for the same reason. */
    for (const found of findCredentials(file.path, text, blockingCredentials, weakCredentials)) {
      (found.severity === "blocker" ? credentials : possibleSecrets).push(found);
    }

    /* The rest of the loop asks questions only a page, a script or a stylesheet can
       answer. A `levels.json` was opened for the credential scan alone. A shipped source
       file is asked the policy's question and no other, at warning, because SHIPPED_SOURCE
       says why it is public text that never runs. */
    if (i >= inBudget.length) {
      if (SHIPPED_SOURCE_FILE.test(file.path)) {
        const inert = inertRanges(file.path, text);
        const views = assembledViews(file.path, text);
        for (const finding of findOutboundOrigins(file.path, text, inert, undefined, new Map(), true, views))
          if (finding.code === "blocked-service") policy.push(finding);
        policy.push(...findPolicyPatterns(file.path, text, inert, true, views));
      }
      continue;
    }

    const sourcePath = compressedBrowserAsset(file.path)?.path ?? file.path;
    const inert = COMMENTABLE.test(sourcePath) ? inertRanges(sourcePath, text) : [];
    let views: AssembledView[] = [];
    try {
      views = assembledViews(sourcePath, text);
    } catch (error) {
      if (!(error instanceof ExpansionLimit)) throw error;
      /* Judged on what it says as written, and held, as content.py holds it. */
      findings.push({ code: "unreadable-file", severity: "blocker", title: `Could not read ${file.path}.`, path: file.path,
        detail: "It declares XML entities that expand past what the check reads, so it is held. Write the text out instead of using entities, then check again." });
    }
    /* A standalone `.svg` or `.xml`, since 7 Nov 2026: a frame, an `<object>` or a navigation runs
       one as a document, scripts and all, and until then nothing asked it the policy. The policy
       is all it is asked: its namespaces are `http://` URLs that are no request, and its
       references are an image's or a level's, not the game's. content.py asks the same. */
    if (XML_DOCUMENT.test(sourcePath)) {
      for (const finding of findOutboundOrigins(sourcePath, text, inert, undefined, new Map(), false, views))
        if (finding.code === "blocked-service") policy.push({ ...finding, path: file.path });
      policy.push(...findPolicyPatterns(sourcePath, text, inert, false, views).map(finding => ({ ...finding, path: file.path })));
      findReviewSignals(sourcePath, text, inert, signals);
      continue;
    }
    for (const finding of findOutboundOrigins(sourcePath, text, inert, knownOrigin, externalHosts, false, views))
      (finding.code === "blocked-service" ? policy : origins).push({ ...finding, path: file.path });
    policy.push(...findPolicyPatterns(sourcePath, text, inert, false, views).map(finding => ({ ...finding, path: file.path })));
    findReviewSignals(sourcePath, text, inert, signals);

    for (const written of extractReferences(sourcePath, text, inert)) {
      /* A name Godot's template asks for is the name its loader rewrites. engines.ts,
         `godotLocated`, has why; the rewritten name is resolved against the page. */
      /* And Defold's: its engine module by the project's name, and the archive list from the
         archive folder (engines.ts, `defoldEngineWasm` and `defoldArchivePrefix`). */
      const located = written.locate && godotLoad ? godotLocated(written.value, godotLoad)
        : written.locate && defoldWasm && /^dmengine(?:_release|_headless)?\.wasm$/.test(written.value) ? defoldWasm
        : written.archive && defoldArchive !== null ? `${defoldArchive}/${written.value.replace(/^\//, "")}` : written.value;
      const ref: Reference = located === written.value ? written : { ...written, value: located, base: "document" };
      if (ref.kind === "static" && /\.[cm]?js$/i.test(sourcePath) && modules.checkedSpecifiers.has(`${file.path}:${ref.value}`)) continue;
      /* Where a relative path in this file resolves *to*, and there can be two
         answers. A URL in HTML or CSS is resolved against that document; a bare
         string handed to `fetch`, `new Image()` or `TextureLoader.load` is
         resolved against the page, which is index.html at the bundle root — not
         against the module that happens to contain the string. Guessing one and
         reporting the other is how `src/main.js` loading `./assets/grid.png`,
         which works, was reported as a missing `src/assets/grid.png`, which was
         never asked for. Neither base is knowable without running the thing, so
         a reference is satisfied when *either* is, and only reported when both
         come back empty. The one case that IS knowable is a URL built against the
         page's own address (`new URL(x, location.href)`): that has one answer, the
         entry document, and it is the only base asked. */
      const bases = ref.base === "document" ? [ENTRY_DOCUMENT_DIR]
        : /\.[cm]?js$/i.test(sourcePath)
          ? [dirOf(file.path), ""]
          : [dirOf(modules.documentBases.get(file.path) ?? file.path)];
      const candidates = bases
        .map((base) => resolveRef(base, ref.value))
        .filter((r): r is string => r !== null && r !== "");
      if (candidates.length === 0) continue;
      if (candidates.some((c) => exact.has(c))) continue;
      /* A bare file name in a script, with a file of exactly that name elsewhere in the
         folder, is a name a loader joins to a folder it is told about while the game runs:
         three.js's KTX2Loader after setTranscoderPath, DRACOLoader after setDecoderPath, and
         Emscripten's glue through locateFile, which every one of those transcoders carries.
         Trailer Park Warfare (12 Nov 2026) keeps basis_transcoder.wasm in basis/ and points
         KTX2Loader there, and was told the file was missing because the glue beside the
         bundler's copy names it bare. Neither base this check knows is the one the loader
         uses, so the file being in the folder at all is the evidence there is. */
      /* Not a name built against the page's own address, `new URL("level.json", location.href)`:
         that has one answer, the bundle root, and a file of the name elsewhere does not
         serve it (Greptile on opengamehq/opengame#7). */
      if (ref.kind === "runtime" && ref.base !== "document" && /\.[cm]?js$/i.test(sourcePath)
          && !ref.value.includes("/") && fileNames.has(ref.value)) continue;

      /* The candidate to talk about. For a case mismatch it has to be the one
         that actually matched, or the sentence names two paths that have
         nothing to do with each other; for a miss, the first, which is the
         reference read the way it is written. */
      const near = candidates
        .map((c) => [c, byLowerPath.get(c.toLowerCase())] as const)
        .find(([, onDisk]) => onDisk);
      const resolved = near ? near[0] : candidates[0];
      const onDisk = near?.[1];
      /* A compared name, `path == "dmengine.wasm"`, or a slash-less suffix after a `+`,
         `exeName + '_pthread.wasm'`, that names nothing on disk is not called missing. One
         that names a file in the wrong case is still the request it looks like, `x ===
         "assets/Hero.PNG"`, and keeps its case-mismatch blocker (two reviews of #432). A full
         path after `+`, `DATA + "levels/one.json"`, is an ordinary reference. */
      if (ref.appended && !onDisk) continue;
      if (onDisk) {
        /* Works on their Mac, 404s on our CDN. Enormously common, and close to
           impossible to diagnose from the other end — which is exactly why it
           is worth the effort of catching here. */
        if (caseMismatch.length < 8) caseMismatch.push({
          code: "case-mismatch",
          severity: ref.optional ? "warning" : "blocker",
          title: `${file.path} line ${ref.line} asks for ${resolved}, but the file is ${onDisk}.`,
          detail:
            "macOS and Windows do not care about capitalisation. The servers that hand your game to a player do. So this loads on your machine and the file is missing for everybody else. Fix the reference or rename the file so the two match exactly.",
          path: file.path,
          line: ref.line,
        });
      } else if (ref.kind === "static") {
        /* A static import of a file that is not here is a game that does not start.
           `three.module.js` shipped without `three.core.js` used to land in the
           warning below as "may be generated while the game runs", Upload stayed
           lit, and the creator learned from a reviewer days later that nothing
           rendered. Named file to named file, because the fix is one of exactly
           two things and both need the names. */
        if (missingImports.length < 8) missingImports.push({
          code: "missing-import",
          severity: "blocker",
          title: `${file.path} imports ${resolved}, and it is not in the folder.`,
          detail:
            "The game will not start until it is. Copy the file in beside the one that imports it, or rebuild so the bundler includes it.",
          path: file.path,
          line: ref.line,
        });
      } else if (ref.base === "document" && resolved === SDK_LOCAL_MANIFEST) {
        /* The SDK reads `opengame.json` beside the page only when the game is running
           outside OpenGame (`npm run dev`, a file opened by hand), so a game can test its
           boards and room size locally. On OpenGame the page hands the SDK the manifest,
           and the request is never made, so the file being absent from the build is the
           expected state, not a defect. Every starter printed this as "Worth a look"
           on every deploy, and an agent told to look at it had nothing to fix. */
      } else if (isAssetReference(resolved)) {
        /* A name the detected engine writes for some other reason than loading it. Only
           a plain runtime string in a script: an import, an HTML attribute or a URL built
           against the page is a request whatever it is called. */
        const known = ref.kind === "runtime" && ref.base !== "document" && /\.[cm]?js$/i.test(sourcePath)
          ? engineDefault(ENGINE_DEFAULT_REFS, engineIds, ref.value, bundlePaths) : null;
        if (known) {
          const rows = engineRefs.get(known.engine) ?? new Map<string, { at: string; value: string; why: string }>();
          if (!rows.has(resolved)) rows.set(resolved, { at: `${file.path}:${ref.line}`, value: known.value, why: known.detail });
          engineRefs.set(known.engine, rows);
        } else if (!missingRefs.has(resolved)) missingRefs.set(resolved, `${file.path}:${ref.line} → ${resolved}`);
      }
    }
  }

  /* Report at most a few of each, so one bad loop does not produce four hundred
     findings and bury the one that matters. */
  findings.push(...credentials.slice(0, 8));
  findings.push(...possibleSecrets.slice(0, 4));
  findings.push(...order(dedupe(policy)).slice(0, 6));
  findings.push(...[...signals.values()].map(({ finding, more }) => more.length ? { ...finding, more } : finding));
  findings.push(...order(dedupe(origins.filter((f) => f.code !== "engine-default"))).slice(0, 6));
  findings.push(...dedupe(origins.filter((f) => f.code === "engine-default")).slice(0, 6));
  if (externalHosts.size) findings.push(externalHostsNote(externalHosts));
  findings.push(...dedupe(caseMismatch).slice(0, 8));
  findings.push(...dedupe(missingImports).slice(0, 8));

  const missingRefCount = missingRefs.size;
  if (missingRefCount > 0) {
    findings.push({
      code: "missing-ref",
      severity: "warning",
      title: `${missingRefCount} referenced file${missingRefCount === 1 ? " is" : "s are"} not in the folder.`,
      detail:
        "These are asked for while the game runs, so they may be generated on the way, in which case ignore this. If they are not, the game will go looking for them once it is published and find them missing.",
      more: [...missingRefs.values()].slice(0, 10),
    });
  }
  /* Kept rather than dropped, because two of them are fetched on a feature path and a
     creator using that feature should still be told. One note per engine, so seven
     PlayCanvas names are one line in the terminal rather than seven. */
  for (const [id, rows] of engineRefs) {
    findings.push({
      code: "engine-default",
      severity: "note",
      title: `${ENGINE_NAMES[id]}'s own code names ${rows.size} file${rows.size === 1 ? "" : "s"} this game does not have to ship.`,
      /* The reasons go in the sentence, because the CLI prints a note's title and detail
         and not its list: "listed beside each" above an empty space was the first draft. */
      detail: `${[...rows.values()].slice(0, 10).map((row) => `${row.value} is ${row.why}.`).join(" ")} Nothing has to change unless your game uses the feature named.`,
      more: [...rows.values()].slice(0, 10).map((row) => `${row.at} → ${row.value}`),
    });
  }

  /* ---------------------------------------------------------------------- */

  const ok = !findings.some((f) => f.severity === "blocker");
  const inspected = new Set(reading.filter((_, i) => texts[i] !== null && texts[i] !== undefined).map(file => file.path));

  return {
    ok,
    findings: order(findings).map(redactFinding),
    strippedRoot,
    entryCandidates: candidates.length > 1 ? candidates : [],
    include: kept.map((f) => f.path),
    fileCount: kept.length,
    totalBytes,
    hasEntryPoint,
    engine,
    ...(rawRuntimes.length ? { rawRuntimes } : {}),
    ...(externalAssets?.length ? { externalAssets } : {}),
    ...(threaded || (completeEngineText && !kept.some(file => /\.wasm(?:\.(?:gz|br|unityweb))?$/i.test(file.path))) ? { threaded } : {}),
    credentialScan: {
      policyVersion: "1",
      files: kept.map(file => ({ path: file.path, required: external.has(file.path) || SCANNABLE.test(file.path) || CREDENTIAL_SCANNABLE.test(file.path) || compressedBrowserAsset(file.path) !== null, inspected: inspected.has(file.path) })),
      complete: options.authoritative === true && external.size === 0 && rawCandidates.length === 0 && texts.every((text) => text !== null && text !== undefined),
      expectedFiles: scannable.length + credentialOnly.length + external.size,
      inspectedFiles: texts.filter((text) => text !== null && text !== undefined).length,
      blocked: credentials.length > 0 || credentialHits.size > 0,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* No index.html anywhere: say which of the two reasons it is                  */
/* -------------------------------------------------------------------------- */

/**
 * "Invalid bundle" is the failure this whole file exists to avoid. If there is
 * no entry point, there are really only two situations, and they need different
 * sentences: they uploaded a source tree that has never been built, or they
 * uploaded something that is not a web game at all.
 */
function diagnoseMissingEntry(files: { path: string; size: number }[]): Finding {
  const has = (re: RegExp) => files.some((f) => re.test(f.path));

  const looksLikeSource =
    has(/(^|\/)package\.json$/i) ||
    has(/(^|\/)src\//i) ||
    has(/\.(?:tsx?|jsx|svelte|vue)$/i);

  if (looksLikeSource) {
    return {
      code: "source-not-build",
      severity: "blocker",
      title: `This looks like source rather than a build. There is no ${BUNDLE.entryPoint} anywhere in it.`,
      detail: buildAdvice(files),
    };
  }

  /* After the source check: a project that carries a tool .exe is still a project to build. */
  const native = nativeBuild(files);
  if (native) {
    return {
      code: "native-build",
      severity: "blocker",
      ...nativeBuildWords(native, BUNDLE.entryPoint),
      path: native.path,
    };
  }

  return {
    code: "no-entry",
    severity: "blocker",
    title: `No ${BUNDLE.entryPoint} anywhere in that folder.`,
    detail:
      `Every game is served by opening ${BUNDLE.entryPoint} at its root. If yours is called something else, rename it. If you meant to drop a different folder, this one has ` +
      (files.length === 1
        ? "one file in it and it is not a page."
        : `${files.length.toLocaleString("en-GB")} files in it and none of them is a page.`),
  };
}

/* Which build tool, so we can name the directory they should be uploading instead of
   telling them to go and find out. One table for both ways an unbuilt project arrives,
   with no page at all or with a page that loads its source, so the two sentences cannot
   disagree about where Vite writes its build. */
const TOOLCHAINS: [RegExp, string, string][] = [
  [/(^|\/)vite\.config\.[cm]?[jt]s$/i, "Vite", "dist/"],
  [/(^|\/)next\.config\.[cm]?[jt]s$/i, "Next.js", "out/ (after `next build` with `output: \"export\"`)"],
  [/(^|\/)(webpack|rspack)\.config\.[cm]?[jt]s$/i, "webpack", "dist/"],
  [/(^|\/)rollup\.config\.[cm]?[jt]s$/i, "Rollup", "dist/"],
  [/(^|\/)svelte\.config\.[cm]?[jt]s$/i, "SvelteKit", "build/"],
  [/(^|\/)angular\.json$/i, "Angular", "dist/"],
];

function buildAdvice(files: { path: string }[]): string {
  const matched = TOOLCHAINS.find(([re]) => files.some((f) => re.test(f.path)));
  const where = matched ? matched[2] : "dist/";
  const tool = matched ? `${matched[1]} ` : "";
  return `Run your ${tool}build step and upload what it produces, usually ${where}. What we host is static files; there is no build server on our side, so a project that needs \`npm run build\` before it will open cannot be served.`;
}

/**
 * The other way an unbuilt project arrives, and the commoner one: WITH an index.html.
 * A Vite project's root page is `<script type="module" src="/src/main.ts">`, the dev
 * server compiles that file on request, and nothing here does. So the upload had a page,
 * every reference resolved, and it passed, while a player would have got a blank page.
 * og-games serves a `.ts` as `application/octet-stream` (infra/worker/src/content-types.ts),
 * so the browser refuses it as a module before parsing a byte, and a classic script that
 * did get parsed would stop at the first type annotation. Either way the only clue is in
 * a console the creator never opens. Named file to named file, because what they need to
 * see is that the page asks for their source.
 */
function sourceEntryFinding(loads: { document: string; target: string }[], files: { path: string }[]): Finding {
  const [first] = loads;
  const ext = first!.target.slice(first!.target.lastIndexOf(".") + 1).toLowerCase();
  const kind = ext === "jsx" ? "JSX" : ext === "vue" ? "a Vue component" : ext === "svelte" ? "a Svelte component" : "TypeScript";
  return {
    code: "source-not-build",
    severity: "blocker",
    path: first!.document,
    title: `This looks like source rather than a build. ${first!.document} loads ${first!.target}, which is ${kind}, and no browser runs that, so the game would open on a blank page.`,
    detail: buildAdvice(files),
    ...(loads.length > 1 ? { more: loads.map((row) => `${row.document} → ${row.target}`).slice(0, 10) } : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* Credentials in the contents of a file                                       */
/* -------------------------------------------------------------------------- */

/**
 * A key somebody left in their source.
 *
 * THE CAPTION UNDER THE DROP ZONE PROMISED THIS FOR WEEKS AND NOTHING DID IT.
 * The check above matches credential FILE NAMES, which catches a `.env` and
 * nothing else; a zip whose `js/main.js` carried an OpenAI key, an `AKIA` id, an
 * AWS secret, a Stripe live key and a GitHub token came back "This build is ready
 * to upload. Nothing else to look at." The creator was protected minutes later,
 * by `content.py`, behind an upload and an email, which is not what the sentence
 * on the page said. So the sentence is now true at the moment it is said.
 *
 * The patterns are not written here. They are in `packages/shared/limits.json`,
 * where `content.py` reads the same two lists, because two implementations of one
 * credential check is how the weaker one ends up on the surface nobody re-reads.
 * `scripts/check-contract-parity.mjs` compiles every one of them in both engines
 * and runs one probe corpus through each, so a pattern that means something
 * different to `RegExp` and to `re` fails a check rather than a submission.
 *
 * TWO THINGS THIS DOES NOT DO, both deliberate:
 *
 * It never reports the matched text. Repeating a secret would copy it into a
 * React tree, a screenshot and whatever the creator pastes into a support thread,
 * which is a second place it leaks from. `content.py` withholds it for the same
 * reason and says so.
 *
 * It does not consult the inert ranges. Every other scan in this file skips
 * comments, because a URL somebody wrote *about* code is not a request. A key in
 * a comment is not like that: it ships, it is served, and it is readable. The one
 * check here that ignores the comment walk is the one where a comment changes
 * nothing about the consequence.
 *
 * ONE FINDING PER FILE, NOT PER PATTERN, AND THE RENDERER IS THE REASON.
 * `groupFindings` collapses findings that share a code and a detail into one row
 * with a list of locations under it, which is right and is what stops sixty words
 * being printed six times. But the location list is bare paths, so a file holding
 * an OpenAI key, an AWS id, a Stripe live key and a GitHub token reported four
 * ways came out as one row naming whichever pattern happened to be first and five
 * line numbers under it. The kind is the actionable half here: it is the
 * difference between rotating something at Stripe and rotating it at GitHub. So a
 * file with more than one gets a count in the title and `more` carries the line
 * and the kind of each, which is the field the row already renders for exactly
 * this.
 */
/**
 * Whether this preflight looks for credentials at all. Not since 12 Nov 2026, when the
 * deploy path was cut to what keeps the platform working (limits.json
 * platform.deploy.minimalChecks): a key a creator ships is theirs to rotate, and a
 * refusal for one was the most common way a working game failed to deploy. Read per call
 * rather than at module scope so a test can flip it.
 */
export function credentialChecks(): boolean {
  return (LIMITS.platform.deploy as { minimalChecks?: boolean }).minimalChecks !== true;
}

function findCredentials(
  path: string,
  text: string,
  blocking: { label: string; re: RegExp }[],
  weak: { label: string; re: RegExp }[],
): Finding[] {
  text = text.replace(/\0/g, "");
  const lineAt = lineLocator(text);
  const out: Finding[] = [];

  const collect = (patterns: { label: string; re: RegExp }[]) => {
    const hits: { label: string; line: number }[] = [];
    for (const { label, re } of patterns) {
      /* `exec` on a pattern compiled without `g`, so there is no `lastIndex` to
         carry from one file into the next. The first hit is all we report anyway:
         a key pasted into a loop is one mistake. */
      const m = re.exec(text);
      if (m) hits.push({ label, line: lineAt(m.index) });
    }
    return hits.sort((a, b) => a.line - b.line);
  };

  const found = collect(blocking);
  if (found.length > 0) {
    out.push({
      code: "credential-in-file",
      severity: "blocker",
      title:
        found.length === 1
          ? `${path} line ${found[0].line} contains what looks like ${found[0].label}.`
          : `${found.length} things in ${path} look like credentials.`,
      detail:
        "The value is not printed here, and the upload has not started. Players download every file in a bundle, so a key inside one is public the moment the game goes live. Delete it from the file. If it was real, rotate it today.",
      path,
      line: found[0].line,
      more: found.length === 1 ? undefined : found.map((h) => `line ${h.line}, ${h.label}`),
    });
  }

  const soft = collect(weak);
  if (soft.length > 0) {
    out.push({
      code: "possible-secret",
      severity: "warning",
      title:
        soft.length === 1
          ? `${path} line ${soft[0].line} has ${soft[0].label}.`
          : `${soft.length} lines in ${path} look like they hold secrets.`,
      detail:
        "It does not stop the upload. Minified libraries carry strings like this and most are placeholders, so open the line and look. If the value is real, every player can read it.",
      path,
      line: soft[0].line,
      more: soft.length === 1 ? undefined : soft.map((h) => `line ${h.line}, ${h.label}`),
    });
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* Outbound origins                                                            */
/* -------------------------------------------------------------------------- */

/**
 * What the game names outside OpenGame, sorted by what it costs.
 *
 * THIS USED TO BE A LIST OF EVERYTHING THE CSP WOULD REFUSE, AND THE CSP REFUSES ALMOST
 * NOTHING NOW. Until 26 Oct 2026 a game could reach OpenGame's own hosts and nothing else,
 * so any other origin was a black screen waiting to happen and this check turned it into a
 * sentence first. New uploads are published under 2027-03, which lets a game call an AI
 * model, any API, its own multiplayer server and a script CDN (limits.json
 * `runtimeContracts`, and `contract2027_03` in infra/worker for the reasoning). So what is
 * left to say, in order of cost:
 *
 * - A host on gamePolicy's blocked list -- a payment provider, a wallet, a sign-in
 *   service, an ad network -- is a blocker when the game can act on it, and a warning when
 *   it is only a link or a value. THIS CHECK IS NOW PART OF THE CONTROL, NOT ADVICE BEFORE
 *   IT. A CSP can only list what to allow, so once it says `https:` nothing in the browser
 *   refuses js.stripe.com. What refuses it is this check, the jam scan in content.py, the
 *   sandbox run's `net` verdict and the reviewer, and every skip below that used to say
 *   "the CSP refuses it either way" now leans on the last two of those instead.
 * - A plain `http://` or `ws://` request is still a blocker, for a reason that has nothing
 *   to do with us: the game page is https, and a browser blocks insecure requests from it.
 * - Everything else is allowed, and is summarised in one `external-hosts` note so a creator
 *   and a reviewer can see what the game talks to without a finding per line.
 *
 * content.py's `_outbound_policy_findings` is the jam scan's copy of the blocked half of
 * this, skip for skip, so the two refuse the same bundle. A change to which URL counts as
 * a request here is a change there too.
 *
 * `shippedSource` is a `.ts`, `.tsx` or `.jsx` file in the bundle: every blocked service in
 * it is a warning, for the reason SHIPPED_SOURCE gives.
 */
function findOutboundOrigins(
  path: string,
  text: string,
  inert: Span[],
  knownOrigin: (url: string, site: Site) => EngineDefault | null = () => null,
  external: Map<string, string> = new Map(),
  shippedSource = false,
  views: AssembledView[] = [],
): Finding[] {
  const lineAt = lineLocator(text);
  const allowed = gameConnectOrigins().map((u) => u.replace(/^\w+:\/\//, "").toLowerCase());
  const trusted = new Set(trustedAssetHosts());
  const script = /\.(?:[cm]?js|jsx|tsx?)$/i.test(path);
  const policySeverity = (severity: "blocker" | "warning") => shippedSource ? "warning" : severity;

  const out: Finding[] = [];
  /* Six of each kind per file, as before, so one bad loop is one screen and not four
     hundred findings burying the one that matters. */
  const room = (code: string, severity: Severity) =>
    out.filter((finding) => finding.code === code && finding.severity === severity).length < 6;
  /* The userinfo is stepped over, as a browser does, so `https://x@buy.stripe.com/` is read
     as the Stripe page a navigation would open rather than as no host at all. It is greedy
     up to the LAST `@`, the WHATWG rule limits.py's blocked_service_for_url follows. */
  const re = /(?:https?:)?\/\/(?:[^\s/\\?#"'`<>]*@)?([a-z0-9.-]+\.[a-z]{2,})(\/[^\s"'`)<>]*)?/gi;

  /* `url` reaches `host` from offset `at`, where the page has `written`: the same text for a URL
     matched as written, and the encoded one for a URL decoded out of it, which is what the
     heuristics below read beside its neighbours. */
  const judge = (at: number, url: string, host: string, written: string): void => {

    if (NOT_A_REQUEST.test(url) || isEncodedNamespace(text, at, url)) return;
    if (isInert(inert, at)) return;
    if (isPackageMetadata(text, at)) return;
    if (host === "opengame.io" || host === "opengame.gg" || host.endsWith(".opengame.io")) return;
    if (allowed.some((a) => host === a)) return;
    /* Trusted asset hosts -- stylesheets and fonts -- from limits.json, which is also
       where every contract's `style-src` and `font-src` get them. They are allowed on the
       strict contracts too, so they are not news to a reviewer and stay out of the note. */
    if (trusted.has(host)) return;
    /* `.invalid` is reserved by RFC 6761 so that it never resolves, anywhere. A name under
       it is not a host the game can reach and not one an attacker can register, so
       nothing leaves the frame. Engines use one as a key that must not collide with a real
       URL: OG Clash names its cooked files `https://oc-cooked.invalid/<hash>` in Cache
       Storage, and failed this check for a request it never makes (27 Oct 2026). Only this
       TLD: `.test`, `.example` and `.localhost` are reserved too, but a machine can be set
       up to answer them, so they stay findings. */
    if (host.endsWith(".invalid")) return;

    const line = lineAt(at);
    const isImport = isImportSpecifier(text, at);
    const blocked = blockedServiceForHost(host);
    /* A blocked SDK from a CDN the policy allows: `https://esm.sh/@stripe/stripe-js`. */
    const pkg = blocked ? null : blockedPackageForUrl(url);
    /* Plain http, or plain ws. The pattern starts at the `//` for any scheme it does not
       spell, so `ws://x.example` arrives here as `//x.example` with `ws:` in front of it. */
    const plain = /^http:/i.test(url)
      || (url.startsWith("//") && /(?:^|[^\w+.-])ws:$/i.test(text.slice(Math.max(0, at - 4), at)));

    /* A LINK IS NOT A SUBRESOURCE, AND THIS REFUSED BOTH OF OUR OWN GAMES FOR ONE.
     *
     * Der Koloss credits its author and links its source; Modern Claudefare does
     * the same. Each was a blocker, so the wizard turned away the only two games
     * the platform has published, and would turn away any jam entry that credits
     * anybody. A creator-flow test hit it on real bundles.
     *
     * An `<a href>` fetches nothing until it is clicked, and `stage-frame.tsx` sandboxes
     * the frame with `allow-scripts allow-same-origin allow-pointer-lock`, so there is no
     * `allow-popups` and no `allow-top-navigation` and the link does nothing at all when a
     * player clicks it. That is worth knowing before publishing and is not worth refusing
     * over. Warning, with the accurate reason. `target="_blank"` included: without
     * `allow-popups` it is the same nothing. A link to a blocked service is a warning for
     * the same reason, with the rule beside it, because it is still a door somebody meant
     * to open. */
    const anchorHref = isAnchorHref(text, at) || isAnchorText(text, at, written);

    /* `og.openLink(url)` IS HOW A GAME LINKS OUT.
     *
     * The SDK hands the URL to the OpenGame page over postMessage; the page shows the
     * destination and opens it outside the frame (CT5). The game origin fetches nothing,
     * and the SDK README's own example is `og.openLink('https://example.com/credits')`, so
     * a literal passed straight to it is skipped -- unless it names a blocked service.
     * Unlike an anchor, this one WORKS: it opens a real tab, which is exactly how a tip
     * jar or a checkout would reach a player. So it is a blocker here, and the page that
     * opens links refuses the same hosts (use-frame-bridge.ts, protocol.ts). */
    if (isOpenLinkArgument(text, at)) {
      if (blocked && room("blocked-service", policySeverity("blocker"))) out.push(blockedFinding(path, line, host, blocked, policySeverity("blocker"),
        shippedSource ? SHIPPED_SOURCE : "og.openLink opens this outside the game, so a player would land on it. Remove the link, then check again."));
      /* A package page on a CDN is source code, not a checkout, so a link to one is the
         warning an anchor gets rather than the blocker a load gets. */
      if (pkg && room("blocked-service", "warning")) out.push(packageFinding(path, line, host, pkg, "warning",
        shippedSource ? SHIPPED_SOURCE : "og.openLink opens this outside the game. It is a page of source code rather than the service, so nothing is refused. Remove the link unless the game needs it."));
      return;
    }
    if (!isImport && !anchorHref && script && isProseUrl(text, at)) return;
    if (!isImport && script && isProseAnchor(text, at, written)) return;

    /* An exact URL the detected engine ships as a default, at the line of engine code
       that writes it, in a script, and not as something imported. engines.ts has the
       table, the evidence behind each row, and the argument for why this cannot be used
       to hide a request. No row is on a blocked host, so it cannot launder one. */
    const known = !anchorHref && !isImport && script
      ? knownOrigin(url, { before: text.slice(Math.max(0, at - 160), at), after: text.slice(at + written.length, at + written.length + 80) })
      : null;
    if (known) {
      if (room("engine-default", "note")) out.push({
        code: "engine-default",
        severity: "note",
        /* "an Excalibur default". No engine in the table is a vowel letter read as a
           consonant, the way Unity would be, so the letter is enough. */
        title: `${path} line ${line} names ${host}, ${/^[AEIO]/.test(ENGINE_NAMES[known.engine]) ? "an" : "a"} ${ENGINE_NAMES[known.engine]} default.`,
        detail: known.detail,
        path,
        line,
      });
      return;
    }

    const runtime = !anchorHref && engineRuntimeUrl(url);
    /* Scripts only: in an HTML page the same shape is an import map, which the browser
       does fetch. See isDataValue for what this trades. Not for a host the engine table
       knows: there the table has measured which values the engine fetches (Babylon's KTX2
       decoder is a config value it requests the moment a .ktx2 is loaded). */
    const data = !anchorHref && !runtime && !isImport && script
      && !ENGINE_DEFAULT_HOSTS.has(host) && isDataValue(text, at, written);

    if (blocked) {
      const passive = anchorHref || data;
      const severity = policySeverity(passive ? "warning" : "blocker");
      if (room("blocked-service", severity)) out.push(blockedFinding(path, line, host, blocked, severity,
        shippedSource ? SHIPPED_SOURCE
          : anchorHref
          ? "This is a link, and the game frame does not open links, so nothing happens when a player clicks it. A link to this service still breaks the rule, so remove it."
          : data
          ? "It is written as a value, and nothing this check can see requests it. If the game does use it, that breaks the rule above, so remove it."
          : "Remove it and the code that uses it, then check again."));
      return;
    }

    /* Not `continue`d: the CDN itself is an allowed host, and the note below still names
       it. Passive by the same rule as a blocked host, except that the engine-default host
       exclusion in `data` is not applied, because no engine default is a blocked package
       and content.py has no copy of that table to agree with. */
    if (pkg) {
      const passive = anchorHref || (!isImport && script && isDataValue(text, at, written));
      const severity = policySeverity(passive ? "warning" : pkg.severity);
      if (room("blocked-service", severity)) out.push(packageFinding(path, line, host, pkg, severity,
        shippedSource ? SHIPPED_SOURCE
          : anchorHref
          ? "This is a link, and the game frame does not open links, so nothing happens when a player clicks it. A link to this service still breaks the rule, so remove it."
          : passive
          ? "It is written as a value, and nothing this check can see requests it. If the game does load it, that breaks the rule above, so remove it."
          : severity === "warning"
          ? "This does not stop the upload, because a game can use the library for something the rule allows. Make sure the game uses it only for that."
          : "Remove it and the code that uses it, then check again."));
    }

    if (anchorHref) {
      if (room("outbound-origin", "warning")) out.push({
        code: "outbound-origin",
        severity: "warning",
        title: `${path} line ${line} reaches ${host}.`,
        detail: "This is a link, so nothing is fetched. It will not work either: the game frame is sandboxed without `allow-popups` or `allow-top-navigation`, so clicking it does nothing at all. To send players somewhere, call og.openLink with the address. Keep it if it is a credit somebody should be able to read.",
        path,
        line,
      });
      return;
    }

    if (plain && script && !isImport && isWordListItem(text, at)) return;
    if (plain) {
      /* The anchor-href precedent for a value: the same code, a warning, and the reason
         that is true. A request is a blocker, because it cannot succeed. */
      if (room("outbound-origin", data ? "warning" : "blocker")) out.push({
        code: "outbound-origin",
        severity: data ? "warning" : "blocker",
        title: data
          ? `${path} line ${line} names ${host} over plain http in a data value.`
          : `${path} line ${line} reaches ${host} over plain http.`,
        detail: data
          ? "It does not stop the upload: it is written as a value in an object, and nothing this check can see requests it. If the game does request it, the browser blocks it, because the game page is https. Use https:// if the game needs it."
          : "The game page is served over https, and a browser blocks plain http:// and ws:// requests from an https page, so this fails while the game runs. Change it to https:// or wss://. A server without TLS cannot be reached from a published game.",
        path,
        line,
      });
      return;
    }

    if (runtime) {
      if (room("engine-cdn-runtime", "warning")) out.push({
        code: "engine-cdn-runtime",
        severity: "warning",
        title: `${path} line ${line} loads its engine runtime from ${host}.`,
        detail: "This is allowed, but it is the riskiest way to ship an engine. If the CDN is slow, down or serves a different file, the game breaks, and what review tested may not be what players get. Run opengame vendor to copy the pinned runtime into the bundle, then check again.",
        path,
        line,
      });
    }

    /* Allowed: an API, a model, a game server, a CDN. Named once, in the note. */
    if (!external.has(host)) external.set(host, `${path} line ${line}`);
    };

  for (const m of text.matchAll(re)) judge(m.index ?? 0, m[0], m[1].toLowerCase(), m[0]);

  /* THE TEXTS THE BROWSER ASSEMBLES (`assembledViews`). A URL found in one is judged at the byte
     of the page it was read from, by the same rules as a URL written plainly there, and only
     where the page as written had no blocked URL beginning between its start and its host:
     `&#104;ttps://js.stripe.com` is the `//js.stripe.com` already matched, and
     `https://js.stripe&#46;com` is a URL nothing matched before. Only blocked services and
     packages are asked of a view, as content.py asks them; an allowed host decoded out of an
     attribute is the CSP's business and the sandbox run's. */
  const blocking = (url: string, host: string) => blockedServiceForHost(host) !== null || blockedPackageForUrl(url) !== null;
  /* Only a URL written plainly and live answers for one assembled over it. Until the review of
     7 Nov 2026 an inert one did too, and `https:/<!--//api.stripe.com-->/api.str<!---->ipe.com`
     in an SVG script was answered for by the copy in its comment. */
  const writtenStarts = [...text.matchAll(re)].filter((m) => blocking(m[0], m[1].toLowerCase()) && !isInert(inert, m.index ?? 0)).map((m) => m.index ?? 0);
  const seen = new Set<string>();
  const located = new RegExp(re.source, "gid");
  const loose = new RegExp(LOOSE_URL.source, "gid");
  const passes: [AssembledView, RegExp][] = [[{ text: Mapped.of(text), inert: null, code: false }, loose],
    ...views.flatMap((view): [AssembledView, RegExp][] => [[view, located], [view, loose]])];
  for (const [view, pattern] of passes) {
    const assembled = view.text;
    for (const m of assembled.text.matchAll(pattern)) {
      const host = m[1].toLowerCase();
      if (!blocking(m[0], host)) continue;
      const start = m.index ?? 0;
      const at = assembled.rawAt(start)[0];
      const hostAt = assembled.rawAt(m.indices![1]![0])[0];
      let lo = 0;
      let hi = writtenStarts.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (writtenStarts[mid] < at) lo = mid + 1; else hi = mid; }
      if (lo < writtenStarts.length && writtenStarts[lo] <= hostAt) continue;
      /* A view's own inert ranges first: two readings can join an SVG script differently, and the
         URL one of them has in a comment must not mark the other's live copy seen. */
      if (view.inert && isInert(view.inert, at)) continue;
      if (seen.has(`${at}:${host}`)) continue;
      seen.add(`${at}:${host}`);
      judge(at, m[0], host, text.slice(at, assembled.rawAt(start + m[0].length - 1)[1]));
    }
  }

  out.push(...findIceServers(path, text, inert));
  return out;
}

/* The URL parser's other spellings of a special scheme's authority: any run of `/` and `\` after
   `https:` or `wss:` (`https:\\js.stripe.com`, `https:/js.stripe.com`, and none at all from a
   page of another scheme), and `\\` or `/\` for `//`. Chromium and Firefox both loaded Stripe
   through the first two on 7 Nov 2026. Asked of the page and of every assembled text, beside the
   URL pattern above, and reported only where that found nothing. content.py's LOOSE_URL_RE. */
const LOOSE_URL = /(?:(?:https?|wss?):[\\/]*|[\\/][\\/])(?:[^\s/\\?#"'`<>]*@)?([a-z0-9.-]+\.[a-z]{2,})([/\\][^\s"'`)<>]*)?/i;

/**
 * A `.ts`, `.tsx` or `.jsx` file shipped in the bundle, which the browser never runs: the
 * games origin serves those extensions as `application/octet-stream` with `nosniff`
 * (infra/worker/src/content-types.ts), so a `<script src>` pointed at one is refused. It is
 * still public text, and it usually means the build copied the source folder beside its
 * output, so a blocked service in it is a warning rather than nothing: if the source
 * reaches Stripe, the built game probably does too, and the built game is what is judged
 * as a request. content.py makes the same call for the same extensions.
 */
const SHIPPED_SOURCE_FILE = /\.(?:tsx?|jsx)$/i;
const SHIPPED_SOURCE =
  "It is in a source file, which the browser does not run, so nothing is refused for it here. Leave source files out of the upload; if the built game does the same thing, that is refused.";

/** One sentence naming the host and the service, then the rule, then what to do. */
function blockedFinding(path: string, line: number, host: string, service: BlockedService, severity: "blocker" | "warning", todo: string): Finding {
  return {
    code: "blocked-service",
    severity,
    title: `${path} line ${line} reaches ${host}, ${service.name}.`,
    detail: `${policyRule(service.category)} ${todo}`,
    path,
    line,
  };
}

/** The same for a blocked package on a script CDN, naming the package as it was typed. */
function packageFinding(path: string, line: number, host: string, pkg: PackageHit, severity: "blocker" | "warning", todo: string): Finding {
  return {
    code: "blocked-service",
    severity,
    title: `${path} line ${line} loads ${pkg.package} from ${host}, ${pkg.service}.`,
    detail: `${policyRule(pkg.category)} ${todo}`,
    path,
    line,
  };
}

/**
 * The code shapes of a blocked service: `Stripe("pk_live_`, `window.ethereum`,
 * `google.accounts.id.`, `FB.login(`. The host check above cannot see these, because the
 * SDK that makes the request is usually loaded from a host the check has no reason to
 * know, or bundled into the game where there is no host at all.
 *
 * Skips what the origin check skips and for the same reason: a comment, a console message
 * and a vendored library's manifest are not calls. One finding per service per file and
 * severity, at its first line, because a wallet library names `window.ethereum` forty
 * times and that is one fact.
 *
 * A URL-shaped pattern inside an anchor's href (`docs.google.com/forms/`, an OAuth
 * authorize page) drops to a warning for the reason a link to a blocked host does: the
 * frame does not open links. Passed to og.openLink, it stays what the table says.
 */
function findPolicyPatterns(path: string, text: string, inert: Span[], shippedSource = false, views: AssembledView[] = []): Finding[] {
  const lineAt = lineLocator(text);
  const out: Finding[] = [];
  const seen = new Set<string>();
  /* A signature in a text the browser assembles that is code (an event handler, an SVG script),
     at the byte it was read from: `onclick="Stripe(&quot;pk_live_..."` is the call. */
  const hits = blockedPatternHits(text);
  const written = new Set(hits.map((hit) => `${hit.index}:${hit.service}`));
  for (const view of views) {
    if (!view.code) continue;
    for (const hit of blockedPatternHits(view.text.text)) {
      const at = view.text.rawAt(hit.index)[0];
      if (written.has(`${at}:${hit.service}`) || (view.inert && isInert(view.inert, at))) continue;
      written.add(`${at}:${hit.service}`);
      hits.push({ ...hit, index: at });
    }
  }
  for (const hit of hits) {
    if (isInert(inert, hit.index) || isPackageMetadata(text, hit.index)) continue;
    const severity = shippedSource ? "warning" : hit.severity === "blocker" && isAnchorHref(text, hit.index) ? "warning" : hit.severity;
    const key = `${hit.service}:${severity}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const line = lineAt(hit.index);
    out.push({
      code: "blocked-service",
      severity,
      title: `${path} line ${line} uses ${hit.service}.`,
      detail: shippedSource
        ? `${policyRule(hit.category)} ${SHIPPED_SOURCE}`
        : severity === "blocker"
        ? `${policyRule(hit.category)} Remove it and the code that calls it, then check again.`
        : hit.severity === "blocker"
        ? `${policyRule(hit.category)} This is a link, and the game frame does not open links, so nothing happens when a player clicks it. A link to this service still breaks the rule, so remove it.`
        : `${policyRule(hit.category)} This does not stop the upload, because the same name ships inside libraries a game uses for other things, such as an anonymous sign-in for a multiplayer id. Make sure the game never asks a player to sign up or sign in, which the rule forbids however it is built.`,
      path,
      line,
    });
  }
  return out;
}

/**
 * Shapes a reviewer should look at that refuse nothing: an email field, a password field.
 * Either is how a sign-up wall starts, and either is also how a game asks for a room
 * password or a name on a high-score table, so the reviewer decides by playing. One
 * finding per kind for the whole bundle, with the other places listed under it.
 */
function findReviewSignals(path: string, text: string, inert: Span[], into: Map<string, { finding: Finding; more: string[] }>): void {
  const lineAt = lineLocator(text);
  for (const hit of reviewSignalHits(text)) {
    if (isInert(inert, hit.index)) continue;
    const line = lineAt(hit.index);
    const existing = into.get(hit.label);
    if (existing) {
      if (existing.more.length < 5) existing.more.push(`${path} line ${line}`);
      continue;
    }
    into.set(hit.label, {
      more: [],
      finding: {
        code: "review-signal",
        severity: "warning",
        title: `${path} line ${line} has ${hit.label}.`,
        detail: `This does not stop the upload. Make sure a player can start the game without signing up; nothing has to change if they can. ${policyRule(hit.category)}`,
        path,
        line,
      },
    });
  }
}

/** The one note listing what the game talks to outside OpenGame. The CLI prints a note's
 *  title and detail and not its list, so the hosts go in the title. */
function externalHostsNote(hosts: Map<string, string>): Finding {
  const names = [...hosts.keys()];
  const shown = names.slice(0, 8);
  const rest = names.length - shown.length;
  const list = rest > 0 ? `${shown.join(", ")} and ${rest} more`
    : shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}` : shown[0];
  return {
    code: "external-hosts",
    severity: "note",
    title: `This game names ${names.length} host${names.length === 1 ? "" : "s"} outside OpenGame: ${list}.`,
    detail: "Games may call other APIs, AI models, their own servers and script CDNs, so nothing has to change. The game should still start when one of these is slow or down.",
    more: [...hosts.entries()].slice(0, 8).map(([host, at]) => `${at} → ${host}`),
  };
}

/**
 * ICE servers the bundle names itself.
 *
 * THE SCANNER COULD NOT SEE THESE AT ALL, and the CSP cannot either.
 *
 * The origin check above matches on `//`, so `turn:eu-0.turn.peerjs.com:3478` and
 * `stun:stun.l.google.com:19302` went straight past it -- and `connect-src` does not
 * govern STUN or TURN, because those are dialled by the WebRTC stack rather than by
 * `fetch` or `WebSocket`. So a submitted game naming a third-party relay was invisible to
 * the preflight AND unblocked at runtime, which is the one combination that means nothing
 * in the platform was looking.
 *
 * It matters because of what a relay sees. `AGENTS.md` describes `og-platform.js` as
 * carrying "the ICE configuration that decides whether a player's IP is exposed", and a
 * game that dials somebody else's TURN sends its players' traffic, and their addresses,
 * through a stranger. Ours come from the broker at `rtcHttps` at runtime, so a game on
 * OpenGame rooms has no reason to carry any.
 *
 * STILL A WARNING ON THE OPEN NETWORK, WITH A DIFFERENT QUESTION. Since 2027-03 a game may
 * run its own multiplayer server, and its own relay is part of that, so naming one is not
 * a mistake any more. What has not changed is what a relay sees: every player's address.
 * So the finding asks the creator to mean it and to say so, rather than to remove it.
 *
 * A WARNING, NOT A BLOCKER, and the reason is the one this file has learned twice.
 * `peerjs.min.js` ships its own cloud servers as the default it uses when a game does not
 * override them -- which ours do -- so refusing on the string would turn away every
 * bundle that vendors PeerJS, exactly like the manifest fields below and the anchor hrefs
 * above. The creator is told what it would mean if their game really uses it, and left to
 * decide.
 */
/* The public relays WebRTC libraries ship as their defaults, which are a note rather than
   the warning a relay of the game's own choosing gets. Trailer Park Warfare (12 Nov 2026)
   vendors PeerJS unchanged and was told to explain three relays in its description before
   anyone would let it through, for servers every PeerJS game on the web dials. A note still
   names them, and the warning stays for any other host, which is the one a creator chose
   and a player could not guess. */
const PUBLIC_LIBRARY_RELAYS: readonly RegExp[] = [
  /^stun[0-4]?\.l\.google\.com$/, /^(?:[a-z]{2}-\d+\.)?turn\.peerjs\.com$/, /^stun\.cloudflare\.com$/,
];

function findIceServers(path: string, text: string, inert: Span[]): Finding[] {
  const lineAt = lineLocator(text);
  const out: Finding[] = [];
  /* `turns:` too. A scheme, a host, and optionally a port -- ICE URLs have no `//`. */
  const re = /\b(stun|turn|turns):([a-z0-9.-]+\.[a-z]{2,})(?::\d+)?/gi;

  const ours = new Set(
    Object.values(LIMITS.allowedGameOrigins)
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.replace(/^\w+:\/\//, "").replace(/\/.*$/, "").toLowerCase()),
  );

  // Only destinations in the configured network policy are exempt. Finding an SDK
  // marker, even beside a vendored PeerJS default, says nothing about which peer
  // connection the rest of this untrusted game actually creates.
  for (const url of LIMITS.platform.sdk.roomStunUrls) ours.add(url.replace(/^\w+:/, "").replace(/:\d+$/, "").toLowerCase());

  const seen = new Set<string>();
  const library: { host: string; line: number }[] = [];
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (isInert(inert, at)) continue;
    const host = m[2].toLowerCase();
    if (ours.has(host) || host.endsWith(".opengame.gg")) continue;
    /* Once per host per file. A library that lists four regional relays is one fact. */
    if (seen.has(host)) continue;
    seen.add(host);
    if (PUBLIC_LIBRARY_RELAYS.some((relay) => relay.test(host))) {
      library.push({ host, line: lineAt(at) });
      continue;
    }
    if (out.length >= 4) continue;

    const finding: Finding = {
      code: "ice-server",
      severity: "warning",
      title: `${path} line ${lineAt(at)} names the relay ${host}.`,
      detail:
        `This is a STUN or TURN server. If your game uses it, your players' connections ` +
        `and their IP addresses go through it. That is allowed when it is your own relay ` +
        `or one you chose on purpose, and the game's description should say so. Games on ` +
        `OpenGame rooms get relay credentials from the broker while they run and do not ` +
        `need to name one. If this is a library default your game overrides, it is dead ` +
        `code and you can ignore this.`,
      path,
      line: lineAt(at),
    };
    out.push(finding);
  }
  if (library.length) {
    const hosts = library.map((row) => row.host);
    out.push({
      code: "ice-server",
      severity: "note",
      title: `${path} line ${library[0]!.line} names the public relays WebRTC libraries use by default: ${
        hosts.length === 1 ? hosts[0] : `${hosts.slice(0, -1).join(", ")} and ${hosts.at(-1)}`}.`,
      detail:
        "Nothing has to change. PeerJS and most WebRTC libraries connect players through these unless the game " +
        "names its own. A STUN server sees each player's address while a connection is set up, and a TURN relay " +
        "carries a connection only when a direct one cannot be made, as on any site that uses the library.",
      path,
      line: library[0]!.line,
    });
  }

  return out;
}

/**
 * Is this URL a field of an inlined package manifest?
 *
 * THIS REFUSED DER KOLOSS, AND WOULD REFUSE MOST BUNDLES THAT VENDOR ANYTHING.
 * `vendor/peerjs.min.js` carries its own `package.json` inlined by the bundler, which is
 * ordinary: a library that wants its version at runtime ships the manifest that has it,
 * and the manifest brings `bugs`, `funding` and `homepage` with it. So a real upload of
 * our own flagship game came back with three blockers, two of which were
 * `"bugs":{"url":"https://github.com/peers/peerjs/issues"}` and
 * `"funding":{"url":"https://opencollective.com/peer"}` -- strings nobody fetches, in a
 * minified file the creator cannot edit.
 *
 * The third was real and still is: `turn:eu-0.turn.peerjs.com:3478` and
 * `CLOUD_HOST="0.peerjs.com"` are PeerJS's own cloud, and a game that reaches them is a
 * game not using our broker -- the exact failure `AGENTS.md` records as four 401s and a
 * lobby code that never filled. Skipping the metadata leaves that one standing, because
 * it appears elsewhere in the file as a TURN URL rather than as a manifest field.
 *
 * Skipped rather than downgraded to a warning, which is where this differs from the
 * anchor case above. A link that will not work is worth telling a creator about. A
 * funding URL inside a vendored library is worth nothing to them and they cannot act on
 * it, and eighty such lines are how the three that matter become invisible.
 *
 * IT IS A HOLE, NARROWLY, AND WORTH NAMING, AND IT GOT WIDER ON 26 OCT 2026. Something
 * could put a real endpoint in `"homepage"` and fetch it at runtime. While the CSP named
 * only OpenGame's hosts that cost a black screen and nothing more. Under 2027-03 the CSP
 * allows any https host, so a blocked service hidden here is caught by the sandbox run's
 * `net` verdict and the reviewer rather than by the browser (findOutboundOrigins says why).
 *
 * The lookback is bounded so the enclosing key has to be genuinely adjacent -- a metadata
 * key thousands of characters away cannot launder a URL next to a `fetch`.
 */
const MANIFEST_FIELDS = new Set([
  "homepage",
  "bugs",
  "repository",
  "funding",
  "collective",
  "docs",
  "documentation",
  "author",
  "contributors",
  "maintainers",
]);

function isPackageMetadata(text: string, at: number): boolean {
  const head = text.slice(Math.max(0, at - 200), at);

  /* The key whose string value this URL sits in: `"homepage":"<here>`. */
  const direct = head.match(/"([a-zA-Z_-]+)"\s*:\s*"[^"]*$/);
  if (!direct) return false;
  const key = direct[1].toLowerCase();
  if (MANIFEST_FIELDS.has(key)) return true;

  /* `"bugs":{"url":"<here>` and `"funding":{"type":"...","url":"<here>`. The inner key is
     `url`, so the one that decides is the object it is inside. */
  if (key !== "url") return false;
  const outer = head.slice(0, head.length - direct[0].length);
  const enclosing = outer.match(/"([a-zA-Z_-]+)"\s*:\s*\{[^{}]*$/);
  return enclosing ? MANIFEST_FIELDS.has(enclosing[1].toLowerCase()) : false;
}

/**
 * Is this URL, whole, the value of a property in an object literal, and nothing else?
 * `{dnsResolver:"https://cloudflare-dns.com/dns-query",textCharsMax:200}` is; the same
 * string handed to `fetch(`, assigned to `.src`, concatenated onto, interpolated, or
 * sitting in an import map is not.
 *
 * WHY THIS IS A WARNING AND NOT A PASS. OG Clash (22 Oct 2026) was refused on two hosts
 * it never contacts: a DNS resolver address and the Creative Commons licence URLs, both
 * inside a copy of our own limits.json that its catalogue bundles. Neither is in a
 * comment, so the comment walk could not help, and neither is an engine default, so the
 * table in engines.ts could not either. A value in a data table is the shape licence
 * lists, credits and config files take, and a creator cannot tell this check which ones
 * the game reads later.
 *
 * WHAT IT COSTS, NAMED. `const cfg = {api:"https://x.example"}; fetch(cfg.api)` is now
 * a warning rather than a blocker, because nothing that reads one literal can follow
 * `cfg.api` to the call. That moves a real failure from a sentence at upload to the
 * playtest. On the strict contracts connect-src refused the request either way. On 2027-03
 * an ordinary host is allowed anyway, and a blocked one in a value is still a warning
 * naming the rule, with the sandbox run's `net` verdict and the reviewer behind it.
 * Everything with a visible request shape is judged as a request, and so is any
 * concatenation, because `{u:"https://x/" + id}` is not a value but an expression.
 */
const ENGINE_DEFAULT_HOSTS = new Set(ENGINE_DEFAULT_ORIGINS.map((row) => new URL(row.value).hostname.toLowerCase()));

function isDataValue(text: string, at: number, url: string): boolean {
  const quote = text[at - 1];
  if (quote !== '"' && quote !== "'") return false;
  if (text[at + url.length] !== quote) return false;
  const before = text.slice(Math.max(0, at - 1 - 120), at - 1);
  const after = text.slice(at + url.length + 1, at + url.length + 64);
  if (/^\s*[,}]/.test(after) && /[{,]\s*(?:[A-Za-z_$][\w$]*|"[^"\\\n]{0,80}"|'[^'\\\n]{0,80}')\s*:\s*$/.test(before)) return true;
  return STRING_LIST_BEFORE.test(before) && STRING_LIST_AFTER.test(after) && !CALL_ARGS_BEFORE.test(before);
}

/* A member of a list of plain words: a quoted string with no colon in it on each side,
   separated by commas. PostHog's browser library carries its bot-detection list this
   way, `"facebookcatalog","http://yandex.com/bots","hubspot"`: user-agent substrings, one
   of which happens to be a URL, and nothing ever requests it. Read as a request, it
   refused every game that vendors PostHog with "reaches yandex.com over plain http"
   (Super Mario Zombies, 27 Oct 2026), while content.py, which only judges request shapes
   for plain http, let the same bytes through.

   Both neighbours, and both without a colon, because that is the shape a request does not
   take: `xhr.open("GET", "http://x")` has a word before it and a parenthesis after,
   `fetch(base, "http://x")` has no string before it, and a list of addresses
   (`["http://a","http://b"].map(fetch)`) has URLs, which carry a colon, for neighbours.
   content.py's `_STRING_LIST_BEFORE` and `_STRING_LIST_AFTER` are the same two
   patterns, so a blocked host in such a list is a warning on both sides. */
const STRING_LIST_BEFORE = /(?:"[^"\\\n:]{1,80}"|'[^'\\\n:]{1,80}')\s*,\s*$/;
/* Unless the run of words opens a CALL. `importScripts("a.js", "https://js.stripe.com/v3",
   "b.js")` is the same shape between its commas and is a load, so a list that starts at
   a parenthesis is an argument list and stays a request. Found reviewing this rule on
   27 Oct 2026, where it had turned that importScripts from a blocker into a warning in
   both checkers. content.py's `_CALL_ARGS_BEFORE` is the same pattern. */
const CALL_ARGS_BEFORE = /\(\s*(?:(?:"[^"\\\n]{0,80}"|'[^'\\\n]{0,80}')\s*,\s*)+$/;
const STRING_LIST_AFTER = /^\s*,\s*(?:"[^"\\\n:]{1,80}"|'[^'\\\n:]{1,80}')/;

/* The same list written as one string. PostHog's newer builds carry the bot list as
   `amazonbot,...,facebookcatalog,http://yandex.com/bots,hubspot,...` and split it on
   commas, so the URL is one item of a longer string, with a plain word on each side, and
   the string as a whole is not an address anything could request. The older list shape
   above did not match it, and on 12 Nov 2026 Trailer Park Warfare was refused for
   "reaches yandex.com over plain http" and had to take analytics out to get through.
   Plain http only, where the cost of a miss is a request the browser refuses anyway; a
   blocked host or package in the same place is still judged above. Both neighbours, by
   the rule STRING_LIST_BEFORE gives: words without a colon, bracket, brace, semicolon or
   equals sign, which no argument list, object or template expression is. */
function isWordListItem(text: string, at: number): boolean {
  if (text[at - 1] !== ",") return false;
  const comma = text.indexOf(",", at);
  if (comma < 0 || comma - at > 300 || /[\s"'`]/.test(text.slice(at, comma))) return false;
  return WORD_ITEM_BEFORE.test(text.slice(Math.max(0, at - 1 - 120), at - 1))
    && WORD_ITEM_AFTER.test(text.slice(comma + 1, comma + 1 + 120));
}
const WORD_ITEM_BEFORE = /(?:^|[,`"'])[^,`"'\\\n:(){};=$]{1,80}$/;
const WORD_ITEM_AFTER = /^[^,`"'\\\n:(){};=$]{1,80}[,`"']/;

/**
 * Is this URL in the middle of a sentence, in a script? `"... is not supported in most
 * browsers. See https://emscripten.org/docs/..."`, `'Refer to https://docs.unity3d.com/...'`,
 * `'Applying workaround to Firefox bug https://bugzilla.mozilla.org/...'`, and the
 * parenthesised `"the docs (https://openrouter.ai/docs/...)"` in a bundled copy of limits.json.
 *
 * Every stock Godot 3 and 4 export and every unmodified Unity WebGL build failed
 * `opengame check` on lines like these (22 Oct 2026): documentation links inside
 * Emscripten's and Unity's error and deprecation messages. They reach the console through
 * `err`, `warnOnce`, `abort` or a variable assigned first, none of which the sink pass in
 * diagnosticRanges can follow, and listing every engine's private logger would be a table
 * that is never finished. The shape they share is the one a request cannot have: a word
 * and a space before the scheme, inside the same string. `fetch("See https://x")` asks
 * for a relative path, never for x.
 *
 * WHAT IT COSTS, NAMED. A script that writes a URL into a sentence and then cuts it out
 * at runtime (`"go https://x".split(" ")[1]`) is not reported. That is the runtime-assembly
 * case every literal reader already misses, and what is left to catch it is the sandbox
 * run's `net` verdict, which watches the requests rather than reading them. A word before the URL is required, so `srcset`'s `"a.png 1x, https://..."`
 * (a number and a comma) is still read as the fetch it is.
 *
 * A question or an exclamation ends a sentence as well as a full stop does. Excalibur
 * 0.32.0 asks `"Did you forget to add this to a loader? https://excaliburjs.com/docs/loaders/"`
 * through its own logger, twice, and the Excalibur starter failed its check on both
 * (23 Oct 2026). In code a `?` or `!` before a URL is a ternary or a negation, and the
 * URL after one is a string literal, so the quote sits between them and this never matches.
 */
function isProseUrl(text: string, at: number): boolean {
  /* No quote is looked for: a comment string in a bundled config can run for kilobytes,
     and outside a string and a comment (comments are inert already) a word, a space and
     then `https://` is not JavaScript at all. */
  return /[A-Za-z]{2,}[:.,;?!]?[ \t]+\(?$/.test(text.slice(Math.max(0, at - 64), at));
}

/**
 * Is this URL inside a link that sits in a sentence, in a script: the `href` or the text of
 * an `<a>` that follows a word and a space? Unity's loader writes its Brotli error as HTML
 * for its own banner, `'... See <a href="https://bugzilla.mozilla.org/...">https://...</a>
 * for more information.'`, and every Unity WebGL export was told it links to Mozilla's bug
 * tracker (Cinderhold, 24 Oct 2026). That is Unity's message, not the creator's credit, so
 * the warning an anchor gets in a page asks them about a link they never wrote. The same
 * shape as `isProseUrl` one tag further out, with the same cost: a script that cuts the URL
 * back out of the sentence at runtime is not reported, and the sandbox run sees it. An
 * `<a>` in a page is still reported, because there it is the creator's own markup.
 */
function isProseAnchor(text: string, at: number, url: string): boolean {
  const open = text.lastIndexOf("<a", at);
  if (open === -1 || at - open > 400) return false;
  return (ANCHOR_HREF.test(text.slice(open, at)) || isAnchorText(text, at, url)) && isProseUrl(text, open);
}

/* THE ONE SHAPE UNITY WRITES, AND NOTHING WIDER. Four reviews on 24 Oct 2026 each found a
   way for a general anchor grammar to read real code as a tag and hide a request: a string
   ending in `<a href=`, an assignment after `'<a '`, a tag spelled across lines by automatic
   semicolon insertion, and a ternary's colon taken for an attribute name (`ok ? count <a :
   href="https://x"`). Each fix produced the next, so the grammar went. A skip takes `<a`, a
   space and `href` as the first and only attribute, double- or single-quoted, on one line;
   for the link text, that tag closed. `x <a href="..."` is never valid JavaScript, so code
   cannot spell it, and Unity's banner is exactly this. A credit with more attributes in a
   script keeps the warning an anchor gets anywhere else. */
const ANCHOR_TAG_MAX = 4096;
const ANCHOR_HREF = /^<a[ \t]+href[ \t]*=[ \t]*["'][ \t]*$/i;
const ANCHOR_TEXT = /^<a[ \t]+href[ \t]*=[ \t]*(?:"([^"\n]*)"|'([^'\n]*)')[ \t]*>[ \t]*$/i;

/**
 * Is this URL the first thing inside an `<a>`, its visible text? `<a href="X">X</a>` is how
 * a credit and Unity's banner both print an address, and the text is no more a request than
 * the href. It used to be reported as a fetch and hidden only because `dedupe` kept the
 * href's warning ahead of it. Read with the strict grammar, since `<a ';x=">https://y` is a
 * string ending in a quote and a bracket, not a tag.
 */
function isAnchorText(text: string, at: number, url: string): boolean {
  const open = text.lastIndexOf("<a", at);
  if (open === -1 || at - open > 400) return false;
  /* The href has to be this same address. Otherwise a quoted "value" can be the gap between
     two strings: `"See <a href=";fetch(">https://x".slice(1))` closes a string, runs through
     code and opens the next, and read as `<a href="...">` it hid a real request (fifth
     review, 24 Oct 2026). An address sitting in code is a label and a comment, so code
     cannot repeat the URL there, and Unity's banner links the text to itself. */
  const tag = ANCHOR_TEXT.exec(text.slice(open, at));
  return tag !== null && (tag[1] ?? tag[2]) === url;
}

/** The URL at `at` is the literal first argument of an `openLink(` call. */
function isOpenLinkArgument(text: string, at: number): boolean {
  return /(?:^|[^\w$])openLink\s*\(\s*["'`]$/.test(text.slice(Math.max(0, at - 64), at));
}

/**
 * Is this URL the `href` of an anchor, rather than something the page fetches?
 *
 * Looks back to the tag that opens it and checks two things: that the tag is an
 * `<a>`, and that the attribute the URL sits in is `href`. `<a>` alone is not
 * enough -- an `<a>` carrying a `style` with a `url()` in it is still a fetch, and
 * so is one with a `data-` attribute somebody's script reads and requests.
 */
function isAnchorHref(text: string, at: number): boolean {
  const open = text.lastIndexOf("<", at);
  /* Bounded, because the attribute match below is quadratic in the length of the tag, and
     a `<a ` followed by megabytes with no `>` would hold the scan for hours. No real tag
     puts 4 KB of attributes before its href; past that it is read as the request it may
     be. content.py's `_is_anchor_href` carries the same bound. */
  if (open === -1 || at - open > ANCHOR_TAG_MAX) return false;
  const close = text.indexOf(">", open);
  if (close !== -1 && close < at) return false;
  const head = text.slice(open, at);
  if (!/^<a\s/i.test(head)) return false;
  /* The attribute immediately containing this position. `href` may appear earlier
     in the tag on a different attribute, so it is the last one before `at` that
     decides. */
  const attr = head.match(/([a-zA-Z-]+)\s*=\s*["']?[^"']*$/);
  return attr ? attr[1].toLowerCase() === "href" : false;
}

/**
 * Every byte range in a file that cannot be a request, as `[from, to)` pairs.
 *
 * Comments, and regex literals. The second one is the same false positive as the
 * first arriving by a door nobody had checked: three.js decides whether a URL is
 * absolute with `/^(https?:)?\/\//i.test( url )`, and the two characters before
 * that `i` flag are a real, adjacent `//` — so the origin scanner read the flag
 * and the method after it as the host `i.test` and refused the bundle with
 * "reaches i.test" on a line nobody wrote. The scanner already walked past regex
 * literals to keep their slashes and quotes from derailing it; it simply never
 * wrote down where they were. Strings are deliberately *not* inert: a URL in a
 * string literal is exactly what this is looking for.
 *
 * Deliberately a scanner rather than a regex. `//` inside a string literal is
 * the middle of a URL and must not open a comment; a quote inside a comment must
 * not open a string. Only something that walks the file in order knows which.
 *
 * Where it is inexact it is inexact in the safe direction. A regex literal is
 * recognised by what precedes it — the standard heuristic, and the only one
 * available without a parser — so a pathological case ends with a range that is
 * slightly wrong. The consequence of the wrong guess is at worst one outbound
 * origin not reported, never a bundle refused for a URL nobody wrote, and the
 * whole reason this function exists is that the second failure is much the
 * more expensive of the two.
 *
 * EXPORTED FOR A MEASUREMENT, the same reason `endOfHole` is. A walk that goes
 * wrong in the inert direction reports nothing at all, so no finding-level test
 * notices it; `tests/inert-walk.test.ts` asks how much of a real minified
 * library this answers "cannot be a request" for, which is the only question
 * that showed the template and regex derailments below for what they were.
 */
export function inertRanges(path: string, text: string): Span[] {
  const html = /\.html?$/i.test(path);
  const css = /\.css$/i.test(path);

  /* HTML is walked once, in the order the browser's tokenizer reads it (`htmlReadings`,
     below), for its comments and its script elements, because a URL cited in a
     comment in an inline script is the same false positive arriving by a different
     door. */
  if (html) {
    /* THE MASK IS GONE, AND ITS REMOVAL WAS THE FIX. It blanked comments and the
       raw-text elements before both walks, to stop a decoy `<script ... ld+json>`
       opening a range from somewhere it is only text. It closed that, and broke two
       things that were working. A raw-text tag inside a real script body is just
       characters there, and the mask blanked it anyway, taking a JavaScript block
       comment's closing delimiter with it, so `scanCode` ran off the end and marked a
       live `fetch` inert. The mirror case refused a good bundle. So comments are
       skipped by RANGE rather than by rewriting the text, which cannot corrupt the
       scanner because it does not touch what the scanner reads.

       THE REGEXES THAT REPLACED IT ARE GONE TOO, 6 Nov 2026. `/<!--[\s\S]*?(?:-->|$)/`
       over the whole document opened a range at every `<!--`, inside a `<script>`
       as well, where the browser reads it as script data and runs the code after it
       (security audit run 2: `<script><!--` on its own line, or `var m = "<!--"` in an
       inlined library, hid a Stripe call up to the next `-->`). The same regex opened
       one inside an attribute value, a `<title>` or a `<style>`, and closed one later
       than the browser does. Under 2027-03 connect-src refuses only plain http, so
       each of those was a blocked service hidden from this check rather than a
       missed warning. `htmlReadings` opens a range only where the tokenizer, in the data
       state, would; `content.py`'s `inert.py` has the same walk as `html_readings`, and
       the bundles in game-policy-probes.json hold the two to one answer.

       Inline SVG and MathML change what a `<script>` start tag means, and until 7 Nov
       2026 this read them as HTML: seven pages ran a `fetch` in Chromium and Firefox that
       both checkers read as a comment. The walk now carries the foreign-content part of the
       tree builder's stack (FOREIGN CONTENT, below). A `<frameset>` still reads as HTML,
       which only makes it check more: nothing after one runs. */
    const { readings, clip } = htmlReadings(text);
    /* Readings share their scripts, so each body is walked once. */
    const bodies = new Map<string, Span[]>();
    const walked = (key: string, scan: () => Span[]) => {
      let found = bodies.get(key);
      if (!found) { found = scan(); bodies.set(key, found); }
      return found;
    };
    const spansOf = (reading: HtmlReading): Span[] => {
      const ranges: Span[] = [...reading.comments];
      for (const script of reading.scripts) {
        const body = text.slice(script.body, script.close);
        pushAll(ranges, walked(`${script.body}:${script.close}`, () => scanScript(body).map(([a, b]): Span => [script.body + a, script.body + b])));
        /* A body the browser does not run (a template, a shader) keeps reading `<!--` as a
           comment, as it was read before, so a template that parks a URL in one does not
           start failing. Not one read as JSON: an import map's `"<!--"` is a string, and the
           URL after it is fetched. */
        const type = scriptType(script.attrs);
        if (JS_TYPES.has(type)) continue;
        if (!RUN_LATER_TYPES.has(type) && type !== "importmap" && type !== "speculationrules" && !type.endsWith("json")) {
          pushAll(ranges, walked(`c${script.body}:${script.close}`, () => commentSpans(body).map(([a, b]): Span => [script.body + a, script.body + b])));
        }
        /* JSON-LD is a document about the game, not a fetch list. Its `@id` and `url` are
           identifiers, often the game's marketing site, and a search engine reads them
           from its own copy. Taken from the walk and the element's own parsed `type`,
           never from a regex over the raw text: matching `<script ... ld+json>` to the
           next `</script>` let a decoy opening tag in a comment, a string or a raw-text
           element turn everything up to the next `</script>` inert, `fetch` calls
           included, and `data-type=" type=application/ld+json"` read as the type. A range
           an author can open at will is not a range, it is an off switch. Only a closed
           element counts, as only a closed one ever did. */
        if (type === "application/ld+json" && script.close < text.length) ranges.push([script.start, script.close]);
      }
      /* A script inside SVG, read as the JavaScript the browser runs. In SVG a script of the
         JSON-LD type is markup, not a document about the game, so it has no allowance. */
      for (const script of reading.svgScripts) {
        pushAll(ranges, walked(`s${script.segs.flat().join(",")}`, () => svgScriptSpans(text, script.segs)));
      }

      /* SOCIAL METADATA IS NOT A REQUEST, AND THIS IS THE THIRD DOOR.
       *
       * `<meta property="og:image" content="https://example.com/card.jpg">` is fetched by
       * a crawler, on a crawler's server, from a copy of the page it already has. The
       * player's browser never asks for it: it is not a subresource, it is not governed by
       * `connect-src`, and no CSP directive in the runtime contract mentions it. The same
       * goes for `og:url`, `twitter:*`, and a `<link rel="canonical">`.
       *
       * Both OpenGame Originals were refused for exactly this. Der Koloss's own index.html
       * -- the entry point of a game live in production -- was blocked three times on
       * `og:url`, `og:image` and `og:image:secure_url`, and Modern Claudefare the same way.
       * Neither bundle can reach either host at runtime, and neither was trying to; they
       * were declaring where their share card lives, which is what a shipped game does.
       *
       * A blocker refuses the upload outright, so this was the wizard's most consequential
       * code rejecting the only two games the platform has ever published, for metadata
       * that cannot make a request. The comment above about a false positive "arriving by a
       * different door" applies unchanged.
       *
       * Only `content` and `href` ON A META OR LINK ELEMENT. A `<link rel="preload"
       * href="https://cdn...">` IS a request and must keep failing, so `rel` is checked
       * rather than the tag name alone. Where it is inexact it is inexact toward blocking.
       *
       * Both tags come from `htmlReadings`, as the start tags it reaches in the data state, with
       * their parsed attributes. Matched off the raw text, `var s = "<meta property=og:a "`
       * or `"<link rel=canonical "` in a script made every byte up to the next `>` inert,
       * the request between them included. */
      for (const tag of reading.tags) {
        /* A meta carrying `http-equiv` is a pragma, and `refresh` is a navigation, whatever
           card it also claims to be. */
        if (tag.name !== "meta" || tag.attrs.has("http-equiv")) continue;
        if (!["property", "name"].some((key) => /^(?:og:|twitter:|fb:)/i.test(tag.attrs.get(key) ?? ""))) continue;
        ranges.push([tag.start, tag.end]);
      }
      for (const tag of reading.tags) {
        if (tag.name !== "link") continue;
        /* EVERY TOKEN IN THE REL LIST, NOT THE FIRST ONE. `rel` is a space-separated
           set, and the first draft matched on the leading token -- so
           `rel="me preload"` and `rel="alternate stylesheet"` both went inert while
           the browser honoured `preload` and `stylesheet` and fetched the URL. That
           is a hole in exactly the direction this whole allowance had to avoid, and
           the test written to prevent it pinned the literal string `rel="preload"`,
           which is the one spelling that was never the problem.
         
           `alternate` is only safe alone: paired with `stylesheet` it IS a fetch. So
           the rule is that the whole set must be safe, not that any member is. */
        /* The parsed `rel`, the first one on the tag, as the browser reads it. A pattern
           over the tag was caught twice: `\brel=` matched inside `data-rel=`, so
           `<link data-rel="canonical" rel="preload" href="https://evil...">` read the
           decoy, went inert, and the browser preloaded the script. Reversing the
           attribute order flagged correctly, which is what made it look fixed. */
        /* Split on ASCII whitespace, as the browser splits it. */
        const tokens = (tag.attrs.get("rel") ?? "").toLowerCase().split(/[\t\n\f\r ]+/).filter(Boolean);
        if (tokens.length === 0) continue;
        const INERT_REL = ["canonical", "alternate", "me", "author", "license"];
        if (!tokens.every((t) => INERT_REL.includes(t))) continue;
        ranges.push([tag.start, tag.end]);
      }

      return ranges;
    };
    /* Where the walk read the page more than one way, a byte is inert only where every
       reading says so. */
    return combineReadings(readings, clip, spansOf);
  }

  if (XML_DOCUMENT.test(path)) {
    try {
      return svgInert(text);
    } catch (error) {
      /* Nothing is inert; `assembledViews` throws the same, and the file is held. */
      if (error instanceof ExpansionLimit) return [];
      throw error;
    }
  }
  return css ? scanCode(text, true) : scanScript(text);
}

/* `htmlReadings` and its parts: `html_readings` in the pipeline's `inert.py`, line for
   line. The tokenizer's whitespace, plus CR, which the browser has already made LF. The
   `/i` patterns have no `u` flag, so U+017F does not fold to `s`, as the browser's does not. */
const HTML_WS = "\t\n\f\r ";
const ASCII_ALPHA = /^[A-Za-z]$/;
const TAG_NAME_RE = /[A-Za-z][^\t\n\f\r />]*/y;
const ATTR_NAME_RE = /[^\t\n\f\r />][^\t\n\f\r />=]*/y;
const WS_RUN_RE = /[\t\n\f\r ]*/y;
const UNQUOTED_RE = /[^\t\n\f\r >]*/y;
/* From just past `<!--`: `<!-->` and `<!--->` close at once, then `-->` or `--!>`. */
const COMMENT_END_RE = /-?>|[\s\S]*?(?:--!?>|$)/y;
const SCRIPT_DATA_RE = /<!--|<\/script(?=[\t\n\f\r \/>])/gi;
const SCRIPT_ESCAPED_RE = /-->|<\/script(?=[\t\n\f\r \/>])|<script(?=[\t\n\f\r \/>])/gi;
const SCRIPT_DOUBLE_RE = /-->|<\/script(?=[\t\n\f\r \/>])/gi;
const RAW_TEXT_END = new Map(["style", "xmp", "iframe", "noembed", "noframes", "noscript", "textarea", "title"]
  .map((name) => [name, new RegExp(`</${name}(?=[\\t\\n\\f\\r />])`, "gi")]));
/* The JavaScript MIME type essences, from the HTML standard's list. */
/* Script types a library on the page runs as JavaScript after the browser has passed them by:
   Babel's standalone build compiles and runs `text/babel` and `text/jsx`, and a consent manager
   (Cookiebot, OneTrust, Klaro, CookieYes and the rest) parks a tracker as `text/plain` and swaps
   the type once a player agrees. Their bodies are JavaScript to whatever runs them, so `<!--` in
   one is not an HTML comment over what follows. Until 7 Nov 2026 it was read as one, and `<!--`
   on the line above a `fetch` hid it. */
const RUN_LATER_TYPES = new Set(["text/babel", "text/jsx", "text/plain"]);
const JS_TYPES = new Set([
  "", "module", "application/ecmascript", "application/javascript", "application/x-ecmascript",
  "application/x-javascript", "text/ecmascript", "text/javascript", "text/javascript1.0",
  "text/javascript1.1", "text/javascript1.2", "text/javascript1.3", "text/javascript1.4",
  "text/javascript1.5", "text/jscript", "text/livescript", "text/x-ecmascript", "text/x-javascript",
]);

function stickyEnd(re: RegExp, text: string, at: number): number {
  re.lastIndex = at;
  const m = re.exec(text);
  return m ? at + m[0].length : at;
}

function searchFrom(re: RegExp, text: string, at: number): RegExpExecArray | null {
  re.lastIndex = at;
  return re.exec(text);
}

/* Where a tag whose name ends at `i` ends, its attributes, first one of a name wins, and
   whether it closed itself. A quote opens a value only straight after `=`, so a `>` inside
   one does not end the tag, and a `/` before the `>` closes it only outside an unquoted
   value. Null when the file ends inside the tag, where the browser drops it. */
function htmlTag(text: string, i: number): [number, Map<string, string>, boolean] | null {
  const attrs = new Map<string, string>();
  const n = text.length;
  const keep = (name: string, value: string) => { if (!attrs.has(name)) attrs.set(name, value); };
  while (i < n) {
    const c = text[i];
    if (c === ">") return [i + 1, attrs, false];
    if (c === "/" && i + 1 < n && text[i + 1] === ">") return [i + 2, attrs, true];
    if (HTML_WS.includes(c) || c === "/") { i += 1; continue; }
    const nameEnd = stickyEnd(ATTR_NAME_RE, text, i);
    const name = text.slice(i, nameEnd).toLowerCase();
    const j = stickyEnd(WS_RUN_RE, text, nameEnd);
    if (j >= n || text[j] !== "=") { keep(name, ""); i = j; continue; }
    i = stickyEnd(WS_RUN_RE, text, j + 1);
    if (i >= n) return null;
    if (text[i] === '"' || text[i] === "'") {
      const close = text.indexOf(text[i], i + 1);
      if (close === -1) return null;
      keep(name, text.slice(i + 1, close));
      i = close + 1;
    } else {
      const end = stickyEnd(UNQUOTED_RE, text, i);
      keep(name, text.slice(i, end));
      i = end;
    }
  }
  return null;
}

/* Where the `</script` that closes a script element whose body starts at `i` is. After
   `<!--`, a `<script` makes the next `</script` text until a `-->`; stopping at that one
   would walk the rest of the live script as HTML, where its next `<!--` would open a
   comment again. */
function scriptClose(text: string, i: number): number {
  const n = text.length;
  for (;;) {
    const m = searchFrom(SCRIPT_DATA_RE, text, i);
    if (!m) return n;
    if (m[0][1] === "/") return m.index;
    i = m.index + m[0].length - 2; // the escape's own dashes count toward `-->`
    for (;;) {
      const e = searchFrom(SCRIPT_ESCAPED_RE, text, i);
      if (!e) return n;
      if (e[0] === "-->") { i = e.index + 3; break; }
      if (e[0][1] === "/") return e.index;
      const d = searchFrom(SCRIPT_DOUBLE_RE, text, e.index + e[0].length + 1);
      if (!d) return n;
      i = d.index + d[0].length + (d[0] === "-->" ? 0 : 1);
      if (d[0] === "-->") break;
    }
  }
}

/* FOREIGN CONTENT: `html_readings` in the pipeline's `inert.py`, line for line, and the
   reasoning is there in full. In short: inside `<svg>` and `<math>` a `<script>`, `<style>`
   or `<title>` start tag does not switch the tokenizer, `<![CDATA[` holds text, and
   `</script>` closes the element wherever it stands; the integration points let HTML back
   in; forty-odd start tags break out. So the walk carries the open SVG and MathML elements
   and the HTML elements opened inside an integration point, and where the stack the browser
   holds depends on something it does not model it reads the page each way from that token
   on, up to MAX_HTML_READINGS, and keeps a byte inert only where every reading does. */
const NS_SVG = "svg", NS_MATH = "math", NS_HTML = "html", NS_UNKNOWN = "?";
const HTML_IP = 1, TEXT_IP = 2, SPECIAL = 4;
const MAX_HTML_READINGS = 16;
/* What the readings may spend between them, in open elements looked at, per character: an end
   tag costs the stack's depth, and nested `<g>`s with stray end tags went quadratic in the first
   draft (71 s for 28 KB). Past it, or past MAX_FOREIGN_DEPTH, nothing after that point is inert. */
const HTML_BUDGET_PER_CHAR = 4;
const HTML_BUDGET_FLOOR = 1 << 16;
const MAX_FOREIGN_DEPTH = 256;
const words = (s: string) => new Set(s.split(" "));
const BREAKOUT = words(
  "b big blockquote body br center code dd div dl dt em embed h1 h2 h3 h4 h5 h6 head hr i img " +
  "li listing menu meta nobr ol p pre ruby s small span strong strike sub sup table tt u ul var");
const FONT_BREAKOUT = ["color", "face", "size"];
const SVG_HTML_IP = words("foreignobject desc title");
const MATH_TEXT_IP = words("mi mo mn ms mtext");
const HTML_SPECIAL = words(
  "address applet area article aside base basefont bgsound blockquote body br button caption " +
  "center col colgroup dd details dir div dl dt embed fieldset figcaption figure footer form " +
  "frame frameset h1 h2 h3 h4 h5 h6 head header hgroup hr html iframe img input keygen li link " +
  "listing main marquee menu meta nav noembed noframes noscript object ol p param plaintext pre " +
  "script search section select source style summary table tbody td template textarea tfoot th " +
  "thead title tr track ul wbr xmp");
const VOID = words(
  "area base basefont bgsound br col embed frame hr image img input keygen link meta param " +
  "source track wbr");
const HEADINGS = words("h1 h2 h3 h4 h5 h6");
const FORMATTING = words("a b big code em font i nobr s small strike strong tt u");
const CLOSES_P = words(
  "address article aside blockquote center details dialog dir div dl fieldset figcaption " +
  "figure footer header hgroup main menu nav ol p search section summary ul h1 h2 h3 h4 h5 h6 " +
  "pre listing form hr xmp plaintext li dd dt");
const TABLE_PARTS = words("table caption colgroup col tbody thead tfoot tr td th");
const RUBY = words("ruby rb rp rt rtc");
/* ASCII only, as the tokenizer lowercases a tag name: `toLowerCase` makes the Kelvin sign a `k`. */
const asciiLower = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

type Seg = [number, number, boolean];
class FNode {
  constructor(public ns: string, public name: string, public flags = 0, public start = -1,
              public segs: Seg[] | null = null) {}
  copy(): FNode { return new FNode(this.ns, this.name, this.flags, this.start, this.segs ? [...this.segs] : null); }
}
type Stack = FNode[];
const unknown = () => new FNode(NS_UNKNOWN, "");

function htmlRun(stack: Stack): number {
  let k = stack.length;
  while (k && stack[k - 1].ns === NS_HTML) k -= 1;
  return k;
}

function dirty(stack: Stack): Stack {
  const k = htmlRun(stack);
  if (k && stack[k - 1].ns === NS_UNKNOWN) return stack.slice(0, k);
  return [...stack.slice(0, k), unknown()];
}

function dedupeStacks(stacks: Stack[]): Stack[] {
  const out: Stack[] = [];
  for (const st of stacks) {
    if (!out.some((o) => o.length === st.length && o.every((nd, i) => nd === st[i]))) out.push(st);
  }
  return out;
}

const sameEnd = (entry: string, name: string) => entry === name || (HEADINGS.has(entry) && HEADINGS.has(name));

function htmlEnd(stack: Stack, name: string): Stack[] {
  if (name === "template") {
    const out: Stack[] = [stack];
    stack.forEach((nd, k) => { if (nd.ns === NS_HTML && nd.name === "template") out.push(stack.slice(0, k)); });
    stack.forEach((nd, k) => { if (nd.ns === NS_UNKNOWN) out.push(stack.slice(0, k + 1)); });
    out.push([]);
    return dedupeStacks(out);
  }
  /* In a table or a template these pop back to the table, through any SVG on the way. */
  const table: Stack[] = TABLE_PARTS.has(name) ? [[]] : [];
  for (let k = stack.length - 1; k >= 0; k -= 1) {
    const nd = stack[k];
    if (nd.ns === NS_UNKNOWN) return dedupeStacks([stack, ...(k + 1 < stack.length ? [stack.slice(0, k + 1)] : []), ...table]);
    if (nd.ns === NS_HTML) {
      if (sameEnd(nd.name, name)) {
        /* A formatting element popped on the way is opened again by the next text or start
           tag, which keeps a later `</foreignObject>` from closing (`<p><b></p>x`). */
        if (stack.slice(k + 1).some((above) => above.ns === NS_HTML && FORMATTING.has(above.name))) return [dirty(stack.slice(0, k))];
        return [stack.slice(0, k)];
      }
      if (HTML_SPECIAL.has(nd.name)) {
        const rs = htmlRun(stack.slice(0, k + 1));
        let deeper = -1;
        for (let j = k - 1; j >= rs; j -= 1) if (sameEnd(stack[j].name, name)) { deeper = j; break; }
        if (deeper >= 0) return dedupeStacks([stack, stack.slice(0, deeper), [...stack.slice(0, rs), unknown(), ...stack.slice(k + 1)], ...table]);
        return dedupeStacks([stack, ...table]);
      }
      continue;
    }
    if (nd.flags & SPECIAL) return dedupeStacks([stack, ...table]);
  }
  if (name === "body" || name === "html" || name === "br" || name === "p") return [stack];
  return [stack, []];
}

function foreignEnd(stack: Stack, name: string, top?: number): Stack[] {
  if (name === "br" || name === "p") {
    let k = stack.length;
    while (k && (stack[k - 1].ns === NS_SVG || stack[k - 1].ns === NS_MATH) && !(stack[k - 1].flags & (HTML_IP | TEXT_IP))) k -= 1;
    return htmlEnd(stack.slice(0, k), name);
  }
  for (let k = top ?? stack.length - 1; k >= 0; k -= 1) {
    const nd = stack[k];
    if (nd.ns === NS_HTML) return htmlEnd(stack, name);
    if (nd.ns === NS_UNKNOWN) {
      return dedupeStacks([...htmlEnd(stack, name), ...foreignEnd([...stack.slice(0, k), ...stack.slice(k + 1)], name, k - 1)]);
    }
    if (nd.name === name) return [stack.slice(0, k)];
  }
  return htmlEnd(stack, name);
}

function endTag(stack: Stack, name: string): Stack[] {
  if (!stack.length) return [stack];
  const top = stack[stack.length - 1];
  if (top.ns === NS_HTML) return htmlEnd(stack, name);
  if (top.ns === NS_UNKNOWN) return dedupeStacks([...htmlEnd(stack, name), ...foreignEnd(stack.slice(0, -1), name)]);
  return foreignEnd(stack, name);
}

function dirties(name: string, run: string[]): boolean {
  const last = run[run.length - 1];
  return (CLOSES_P.has(name) && run.includes("p"))
    || (name === "li" && run.includes("li"))
    || ((name === "dd" || name === "dt") && (run.includes("dd") || run.includes("dt")))
    || (HEADINGS.has(name) && HEADINGS.has(last))
    || ((name === "a" || name === "nobr" || name === "button") && run.includes(name))
    || ((name === "option" || name === "optgroup") && (last === "option" || last === "optgroup"))
    || (RUBY.has(name) && run.some((r) => RUBY.has(r)));
}

function htmlStart(stack: Stack, name: string, sc: boolean, at: number): Stack[] {
  if (name === NS_SVG || name === NS_MATH) return [sc ? stack : [...stack, new FNode(name, name, 0, at)]];
  if (!stack.length) return [stack];
  if (TABLE_PARTS.has(name) || name === "frameset") return [name === "table" ? dirty(stack) : stack, []];
  if (name === "template" || name === "select" || name === "form") return [dirty(stack)];
  if (name === "body" || name === "html" || name === "head" || name === "frame") return [stack];
  const k = htmlRun(stack);
  if (k && stack[k - 1].ns === NS_UNKNOWN) return [stack];
  const run = stack.slice(k).map((nd) => nd.name);
  if (run.length && dirties(name, run)) return [dirty(stack)];
  if (VOID.has(name) || RAW_TEXT_END.has(name) || name === "script" || name === "plaintext") return [stack];
  return [[...stack, new FNode(NS_HTML, name, 0, at)]];
}

function foreignPush(stack: Stack, name: string, attrs: Map<string, string>, sc: boolean, at: number): Stack[] {
  const ns = stack[stack.length - 1].ns;
  if (sc) return [stack];
  if (ns === NS_SVG) {
    return [[...stack, new FNode(ns, name, SVG_HTML_IP.has(name) ? HTML_IP | SPECIAL : 0, at, name === "script" || name === "style" ? [] : null)]];
  }
  if (MATH_TEXT_IP.has(name)) return [[...stack, new FNode(ns, name, TEXT_IP | SPECIAL, at)]];
  if (name === "annotation-xml" && attrs.has("encoding")) {
    const encoding = attrs.get("encoding") ?? "";
    const html = ["text/html", "application/xhtml+xml"].includes(asciiLower(encoding));
    /* A character reference the walk does not decode could spell either. */
    if (encoding.includes("&")) return [[...stack, new FNode(ns, name, HTML_IP | SPECIAL, at)], [...stack, new FNode(ns, name, SPECIAL, at)]];
    return [[...stack, new FNode(ns, name, (html ? HTML_IP : 0) | SPECIAL, at)]];
  }
  return [[...stack, new FNode(ns, name, name === "annotation-xml" ? SPECIAL : 0, at)]];
}

function startTag(stack: Stack, name: string, attrs: Map<string, string>, sc: boolean, at: number): [Stack, boolean][] {
  const html = (st: Stack): [Stack, boolean][] => htmlStart(st, name, sc, at).map((s) => [s, true]);
  if (!stack.length || stack[stack.length - 1].ns === NS_HTML) return html(stack);
  const top = stack[stack.length - 1];
  if (top.ns === NS_UNKNOWN) {
    if (stack[stack.length - 2].flags & TEXT_IP && (name === "mglyph" || name === "malignmark")) {
      return [...html(stack), ...foreignPush(stack.slice(0, -1), name, attrs, sc, at).map((s): [Stack, boolean] => [s, false])];
    }
    return html(stack);
  }
  if ((top.flags & TEXT_IP && name !== "mglyph" && name !== "malignmark") || top.flags & HTML_IP
      || (top.ns === NS_MATH && top.name === "annotation-xml" && name === NS_SVG)) return html(stack);
  if (BREAKOUT.has(name) || (name === "font" && FONT_BREAKOUT.some((a) => attrs.has(a)))) {
    let k = stack.length;
    while (k && (stack[k - 1].ns === NS_SVG || stack[k - 1].ns === NS_MATH) && !(stack[k - 1].flags & (HTML_IP | TEXT_IP))) k -= 1;
    return html(stack.slice(0, k));
  }
  return foreignPush(stack, name, attrs, sc, at).map((s) => [s, false]);
}

type HtmlScript = { start: number; attrs: Map<string, string>; body: number; close: number };
type HtmlTag = { start: number; end: number; name: string; attrs: Map<string, string> };
type SvgScript = { start: number; segs: Seg[] };
/* One reading of a page, and the bytes [start, end) it is answerable for. The last three are for
   `assembledViews`, which reads what the browser decodes rather than what is written: every start
   tag as [start, end of its name, end], each HTML `<style>` body, and the text directly in each
   SVG `<style>`. */
type HtmlReading = { comments: Span[]; scripts: HtmlScript[]; svgScripts: SvgScript[]; tags: HtmlTag[];
  startTags: [number, number, number][]; styles: Span[]; svgStyles: SvgScript[]; start: number; end: number };

const newReading = (): HtmlReading => ({ comments: [], scripts: [], svgScripts: [], tags: [], startTags: [], styles: [], svgStyles: [], start: 0, end: 0 });
const forkReading = (r: HtmlReading, start: number): HtmlReading =>
  ({ comments: [...r.comments], scripts: [...r.scripts], svgScripts: [...r.svgScripts], tags: [...r.tags],
     startTags: [...r.startTags], styles: [...r.styles], svgStyles: [...r.svgStyles], start, end: 0 });

/* Past the end tag that starts at `at`, or the end of the file. */
function endOf(text: string, at: number): number {
  const tag = htmlTag(text, stickyEnd(TAG_NAME_RE, text, at + 2));
  return tag ? tag[0] : text.length;
}

/* Every reading of a page the walk could not choose between, and the offset past which none
   of them is trusted. */
function htmlReadings(text: string): { readings: HtmlReading[]; clip: number } {
  const n = text.length;
  const readings: HtmlReading[] = [];
  const pending: [number, Stack, HtmlReading, number, number][] = [];
  const settled = new Set<number>();
  let forked = false;
  let clip = n;
  let budget = Math.max(HTML_BUDGET_FLOOR, HTML_BUDGET_PER_CHAR * n);

  const close = (r: HtmlReading, old: Stack, next: Stack) => {
    /* Every outcome keeps the foreign elements it does not pop, so a stack no shorter than
       before has closed no SVG script. */
    if (next.length >= old.length) return;
    const kept = new Set(next);
    for (const nd of old) {
      if (nd.segs && !kept.has(nd)) (nd.name === "script" ? r.svgScripts : r.svgStyles).push({ start: nd.start, segs: [...nd.segs] });
    }
  };

  const choose = (r: HtmlReading, at: number, old: Stack, count: number, force: [number, number]): number => {
    if (force[0] === at) return force[1];
    if (count > 1) {
      forked = true;
      const begin = Math.min(at, ...old.filter((nd) => nd.segs && nd.name === "script").map((nd) => nd.start));
      for (let k = 1; k < count; k += 1) {
        if (readings.length + pending.length >= MAX_HTML_READINGS) { clip = Math.min(clip, begin); break; }
        pending.push([at, old.map((nd) => nd.copy()), forkReading(r, begin), at, k]);
      }
    }
    return 0;
  };

  const run = (start: number, initial: Stack, r: HtmlReading, force: [number, number]) => {
    let i = start;
    let mark = start;
    let stack = initial;
    const textTo = (at: number) => {
      const top = stack[stack.length - 1];
      if (mark < at && top?.segs) top.segs.push([mark, at, false]);
    };
    const finish = (at: number) => { r.end = at; close(r, stack, []); };
    /* Out of budget or depth: nothing from here is inert, in any reading, and an SVG script
       still open is left unread, so its text stays live. It and an open SVG style are still
       handed on, with the rest of the file as their last piece, so `assembledViews` reads them:
       past the clip their inert ranges count for nothing, and what they decode to only adds to
       what is checked. */
    const giveUp = (at: number) => {
      clip = Math.min(clip, at, ...stack.filter((nd) => nd.segs && nd.name === "script").map((nd) => nd.start));
      r.end = at;
      for (const nd of stack) {
        if (nd.segs) (nd.name === "script" ? r.svgScripts : r.svgStyles).push({ start: nd.start, segs: [...nd.segs, [mark, n, false]] });
      }
    };
    for (;;) {
      if (i >= clip) return giveUp(i);
      if (!stack.length && forked && i !== force[0]) {
        if (settled.has(i)) return finish(i);
        settled.add(i);
      }
      const j = text.indexOf("<", i);
      if (j === -1 || j + 1 >= n) { textTo(n); return finish(n); }
      const c = text[j + 1];
      budget -= 1 + stack.length;
      if (budget < 0 || stack.length > MAX_FOREIGN_DEPTH) return giveUp(j);
      if (text.startsWith("<!--", j)) {
        textTo(j);
        const end = stickyEnd(COMMENT_END_RE, text, j + 4);
        r.comments.push([j, end]);
        i = mark = end;
      } else if (text.startsWith("<![CDATA[", j) && stack.length && stack[stack.length - 1].ns !== NS_HTML) {
        /* The standard opens a CDATA section wherever the current node is not HTML, and
           Firefox does; Chromium does not at an integration point, so there it is read both
           ways. An unknown run of HTML is a section only if it is empty. */
        textTo(j);
        let top = stack[stack.length - 1];
        const both = top.ns === NS_UNKNOWN || Boolean(top.flags & (HTML_IP | TEXT_IP));
        if (choose(r, j, stack, both ? 2 : 1, force) === 1) {
          const end = text.indexOf(">", j + 2);
          if (end === -1) return finish(n);
          i = mark = end + 1;
          continue;
        }
        if (top.ns === NS_UNKNOWN) { stack = stack.slice(0, -1); top = stack[stack.length - 1]; }
        const end = text.indexOf("]]>", j + 9);
        const inner = end === -1 ? n : end;
        if (top.segs && j + 9 < inner) top.segs.push([j + 9, inner, true]);
        if (end === -1) return finish(n);
        i = mark = end + 3;
      } else if (c === "!" || c === "?" || (c === "/" && j + 2 < n && !ASCII_ALPHA.test(text[j + 2]) && text[j + 2] !== ">")) {
        /* A bogus comment, a doctype, or `<![CDATA[` outside foreign content: to the next `>`. */
        textTo(j);
        const end = text.indexOf(">", j + 2);
        if (end === -1) return finish(n);
        i = mark = end + 1;
      } else if (c === "/" || ASCII_ALPHA.test(c)) {
        const tagStart = c === "/" ? j + 2 : j + 1;
        if (tagStart >= n) { textTo(n); return finish(n); }
        if (c === "/" && text[tagStart] === ">") { textTo(j); i = mark = tagStart + 1; continue; }
        const nameEnd = stickyEnd(TAG_NAME_RE, text, tagStart);
        const tag = htmlTag(text, nameEnd);
        textTo(j);
        if (!tag) return finish(n);
        const [tagEnd, attrs, sc] = tag;
        i = mark = tagEnd;
        const name = asciiLower(text.slice(tagStart, nameEnd));
        if (c === "/") {
          const outs = endTag(stack, name);
          const next = outs[choose(r, j, stack, outs.length, force)];
          close(r, stack, next);
          stack = next;
          continue;
        }
        const starts = startTag(stack, name, attrs, sc, j);
        const [next, asHtml] = starts[choose(r, j, stack, starts.length, force)];
        close(r, stack, next);
        stack = next;
        r.startTags.push([j, nameEnd, i]);
        if (name === "link" || name === "meta") r.tags.push({ start: j, end: i, name, attrs });
        if (!asHtml) continue;
        const raw = RAW_TEXT_END.get(name);
        if (name === "script") {
          const bodyEnd = scriptClose(text, i);
          r.scripts.push({ start: j, attrs, body: i, close: bodyEnd });
          i = mark = bodyEnd < n ? endOf(text, bodyEnd) : n;
        } else if (raw) {
          const found = searchFrom(raw, text, i);
          if (name === "style") r.styles.push([i, found ? found.index : n]);
          if (!found) return finish(n);
          i = mark = endOf(text, found.index);
        } else if (name === "plaintext") {
          return finish(n);
        }
      } else {
        i = j + 1;
      }
    }
  };

  pending.push([0, [], newReading(), -1, 0]);
  while (pending.length) {
    const [at, stack, reading, token, outcome] = pending.pop()!;
    readings.push(reading);
    run(at, stack, reading, [token, outcome]);
  }
  return { readings, clip };
}

/* `target.push(...items)` passes every item as an argument, and past about 120,000 spans V8
   throws: a 1 MB inline script of comments did, in this walk's first draft. */
function pushAll<T>(target: T[], items: T[]): void {
  for (const item of items) target.push(item);
}

function mergedSpans(spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const [a, b] of [...spans].sort((x, y) => x[0] - y[0] || x[1] - y[1])) {
    if (b <= a) continue;
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/* Merged `spans` less merged `cut`. */
function subtractSpans(spans: Span[], cut: Span[]): Span[] {
  const out: Span[] = [];
  let k = 0;
  for (let [a, b] of spans) {
    while (k < cut.length && cut[k][1] <= a) k += 1;
    let j = k;
    while (a < b) {
      if (j >= cut.length || cut[j][0] >= b) { out.push([a, b]); break; }
      if (cut[j][0] > a) out.push([a, cut[j][0]]);
      a = Math.max(a, cut[j][1]);
      j += 1;
    }
  }
  return out;
}

/* What every reading agrees cannot be a request: inert where some reading says so and no
   reading answerable for the byte says otherwise, and nothing past `clip`. */
function combineReadings(readings: HtmlReading[], clip: number, spansOf: (r: HtmlReading) => Span[]): Span[] {
  let out: Span[];
  if (readings.length === 1) out = mergedSpans(spansOf(readings[0]));
  else {
    const inert: Span[] = [];
    const live: Span[] = [];
    for (const r of readings) {
      const mine = mergedSpans(spansOf(r));
      pushAll(inert, mine);
      pushAll(live, subtractSpans([[r.start, r.end]], mine));
    }
    out = subtractSpans(mergedSpans(inert), mergedSpans(live));
  }
  return out.filter(([a]) => a < clip).map(([a, b]): Span => [a, Math.min(b, clip)]);
}

/* The text an SVG script or style runs: the pieces directly in it, joined, with the character
   references outside CDATA decoded, as the tree builder hands them over. `mode` is "xml" in a
   standalone SVG, and `base` maps that document's offsets onto the file. */
function svgText(text: string, segs: Seg[], mode: ReferenceMode = "text", base: Mapped = Mapped.of(text)): Mapped {
  return concat(segs.map(([a, b, cdata]) => {
    const piece = compose(base, Mapped.of(text, a, b));
    return cdata ? piece : decodeReferences(piece, mode);
  }));
}

/* The inert ranges of an SVG script, read as the JavaScript the browser runs (`svgText`), mapped
   back onto the page piece by piece, so the comment it was joined across is never covered.
   Until this read character references, a script holding one kept no inert range, which only
   ever checked more; now `/* &#42;/ fetch(...)` is read as the browser runs it. */
function svgScriptSpans(text: string, segs: Seg[], mode: ReferenceMode = "text", base?: Mapped): Span[] {
  if (!segs.length) return [];
  const source = svgText(text, segs, mode, base);
  return source.rawSpans(scanScript(source.text));
}

/* The type a browser decides a script element by, read toward JavaScript: a value with a
   character reference in it, or parameters, is not decoded and is taken as script. */
function scriptType(attrs: Map<string, string>): string {
  let value: string;
  if (attrs.has("type")) value = attrs.get("type") ?? "";
  else if (attrs.get("language")) value = `text/${attrs.get("language")}`;
  else return "";
  if (value.includes("&")) return "";
  return value.split(";", 1)[0].replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "").toLowerCase();
}

function commentSpans(text: string): Span[] {
  const out: Span[] = [];
  let i = text.indexOf("<!--");
  while (i !== -1) {
    const end = stickyEnd(COMMENT_END_RE, text, i + 4);
    out.push([i, end]);
    i = text.indexOf("<!--", end);
  }
  return out;
}

/* --- what the browser assembles ---------------------------------------------------------------
 *
 * Everything above reads the page as written. What follows reads it as the browser decodes it
 * (assembled.ts says why), and hands `findOutboundOrigins` each decoded text as a view: the text,
 * mapped onto the page, with any inert ranges only that reading of it has, and whether it is code
 * a policy signature such as `Stripe('pk_live_` can be found in. A view never removes anything the
 * page as written was judged on; a URL is reported from one only where the page as written had no
 * blocked URL beginning between its start and its host. `assembled_views` in the pipeline's
 * inert.py is the same, function for function.
 */
/* A standalone SVG or XML file, read as the XML document a frame, an `<object>` or a navigation
   runs it as. og-games serves `.xml` as application/xml, where an XHTML `<script>` runs. */
const XML_DOCUMENT = /\.(?:svg|xml)$/i;
type AssembledView = { text: Mapped; inert: Span[] | null; code: boolean };

/* What can make an attribute value read differently from how it is written: a character
   reference, a percent escape or a character the host parser folds, the tab, LF and CR the URL
   parser drops, and in a `style`, a CSS escape. */
const VALUE_TRIGGER = /[&%\t\n\r\\]|[^\x00-\x7f]/;
const CSS_TRIGGER = /[\\%]|[^\x00-\x7f]/;
const TAIL_MARKUP = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[|\]\]>/g;
const MAX_SRCDOC_DEPTH = 3;
/* Every level of nesting is one more `&amp;`, and a decoding that changes anything shortens the
   text, so this bound is the nesting of a page some thousand frames deep. */
const MAX_SRCDOC_DECODINGS = 1024;
/* What the URL parser takes for a `javascript:` URL once tabs and line breaks are gone: leading C0
   controls and spaces stripped, the scheme in any case. */
const JAVASCRIPT_URL = /^[\x00-\x20]*javascript:/i;
const triggered = (re: RegExp, text: string, a: number, b: number) => re.test(text.slice(a, b));

/* Every attribute of the tag whose name ends at `i`, as [name, value start, value end], read by
   the tokenizer states `htmlTag` reads, duplicates included: the browser keeps the first, and
   decoding all of them only reads more. */
function attrValues(text: string, i: number): [string, number, number][] {
  const out: [string, number, number][] = [];
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === ">" || (c === "/" && i + 1 < n && text[i + 1] === ">")) break;
    if (HTML_WS.includes(c) || c === "/") { i += 1; continue; }
    const nameEnd = stickyEnd(ATTR_NAME_RE, text, i);
    const name = text.slice(i, nameEnd).toLowerCase();
    const j = stickyEnd(WS_RUN_RE, text, nameEnd);
    if (j >= n || text[j] !== "=") { i = j; continue; }
    i = stickyEnd(WS_RUN_RE, text, j + 1);
    if (i >= n) break;
    if (text[i] === '"' || text[i] === "'") {
      const close = text.indexOf(text[i], i + 1);
      if (close === -1) break;
      out.push([name, i + 1, close]);
      i = close + 1;
    } else {
      const end = stickyEnd(UNQUOTED_RE, text, i);
      out.push([name, i, end]);
      i = end;
    }
  }
  return out;
}

/* An attribute value as the browser reads it: references decoded by the attribute rules, and
   then, for a URL, the tab and line breaks the URL parser drops and the host folded. A `style`
   is CSS, so its escapes are read too. A `srcdoc` is a whole page, read again. */
function valueViews(doc: Mapped, name: string, a: number, b: number, depth: number, xml: boolean): AssembledView[] {
  let value = compose(doc, Mapped.of(doc.text, a, b));
  /* XML normalises a literal tab or line break in an attribute to a space before it decodes
     references; one written as `&#10;` stays a line break. */
  if (xml) value = value.withText(value.text.replace(/[\t\n\r]/g, " "));
  value = decodeReferences(value, xml ? "xml" : "attribute");
  const out: AssembledView[] = [];
  if (name === "srcdoc" && !xml) pushAll(out, nestedPage(value, depth));
  const url = dropUrlWhitespace(name === "style" ? cssUnescape(value) : value);
  /* Code is an event handler or a `javascript:` URL, and only code is searched for a signature.
     A URL needs a start (`URL_START`), which no folding makes, so a value without one after
     decoding (most of them: `title="Tom &amp; Jerry"`) is no view at all. Until mutation testing
     on 7 Nov 2026 that asked for `//`, and `https:&#92;&#92;` got past. */
  const code = name.startsWith("on") || JAVASCRIPT_URL.test(url.text);
  if (code || URL_START.test(url.text)) out.push({ text: foldHosts(url), inert: null, code });
  return out;
}

/* A `srcdoc` page, which the frame parses and decodes again. Past MAX_SRCDOC_DEPTH it is decoded
   until it stops changing and read as one text, which only reads more. Until the review of
   7 Nov 2026 that stopped after eight more decodings, and Chromium ran a script nested in twelve
   frames. */
function nestedPage(page: Mapped, depth: number): AssembledView[] {
  if (depth >= MAX_SRCDOC_DEPTH) {
    for (let k = 0; k < MAX_SRCDOC_DECODINGS; k += 1) {
      const again = decodeReferences(page, "text");
      if (again.text === page.text) break;
      page = again;
    }
    return [{ text: foldHosts(dropUrlWhitespace(page)), inert: null, code: true }];
  }
  const nestedInert = page.rawSpans(mergedSpans(inertRanges("srcdoc.html", page.text)));
  const out: AssembledView[] = [{ text: page, inert: nestedInert, code: true }];
  for (const view of htmlViews(page, depth + 1)) out.push({ ...view, inert: [...nestedInert, ...(view.inert ?? [])] });
  return out;
}

/* Past the walk's clip it trusts no structure, so the rest is read every way that could assemble
   a URL: references decoded and line breaks dropped, and again with comments and CDATA markers
   taken out, as an SVG script's text would be. */
function tailViews(doc: Mapped, start: number): AssembledView[] {
  const text = doc.text;
  const tail = compose(doc, Mapped.of(text, start, text.length));
  const pieces: Mapped[] = [];
  let run = start;
  TAIL_MARKUP.lastIndex = start;
  for (let m = TAIL_MARKUP.exec(text); m; m = TAIL_MARKUP.exec(text)) {
    pieces.push(compose(doc, Mapped.of(text, run, m.index)));
    run = m.index + m[0].length;
    if (m[0].length === 0) TAIL_MARKUP.lastIndex += 1;
  }
  pieces.push(compose(doc, Mapped.of(text, run, text.length)));
  return [{ text: foldHosts(dropUrlWhitespace(decodeReferences(tail, "text"))), inert: null, code: true },
          { text: foldHosts(decodeReferences(concat(pieces), "text")), inert: null, code: true }];
}

const windowViews = (doc: Mapped): AssembledView[] =>
  foldWindows(doc.text).map((w) => ({ text: compose(doc, w), inert: null, code: false }));

function htmlViews(doc: Mapped, depth = 0): AssembledView[] {
  const text = doc.text;
  const { readings, clip } = htmlReadings(text);
  const views = windowViews(doc);
  const seenTags = new Set<number>();
  const seenTexts = new Set<string>();
  for (const r of readings) {
    for (const [start, nameEnd, end] of r.startTags) {
      if (seenTags.has(start)) continue;
      seenTags.add(start);
      if (!triggered(VALUE_TRIGGER, text, nameEnd, end)) continue;
      for (const [name, a, b] of attrValues(text, nameEnd)) {
        if (triggered(VALUE_TRIGGER, text, a, b)) pushAll(views, valueViews(doc, name, a, b, depth, false));
      }
    }
    for (const script of r.svgScripts) {
      const key = `s${script.segs.flat().join(",")}`;
      if (seenTexts.has(key)) continue;
      seenTexts.add(key);
      const source = svgText(text, script.segs, "text", doc);
      views.push({ text: foldHosts(source), inert: source.rawSpans(scanScript(source.text)), code: true });
    }
    for (const style of r.svgStyles) {
      const key = `c${style.segs.flat().join(",")}`;
      if (seenTexts.has(key)) continue;
      seenTexts.add(key);
      views.push({ text: foldHosts(cssUnescape(svgText(text, style.segs, "text", doc))), inert: null, code: false });
    }
    for (const script of r.scripts) {
      const type = scriptType(script.attrs);
      if ((type !== "importmap" && type !== "speculationrules") || seenTexts.has(`j${script.body}`)) continue;
      seenTexts.add(`j${script.body}`);
      if (text.slice(script.body, script.close).includes("\\")) {
        views.push({ text: foldHosts(jsonUnescape(compose(doc, Mapped.of(text, script.body, script.close)))), inert: null, code: false });
      }
    }
    for (const [a, b] of r.styles) {
      const key = `h${a},${b}`;
      if (seenTexts.has(key)) continue;
      seenTexts.add(key);
      if (triggered(CSS_TRIGGER, text, a, b)) views.push({ text: foldHosts(cssUnescape(compose(doc, Mapped.of(text, a, b)))), inert: null, code: false });
    }
  }
  if (clip < text.length) pushAll(views, tailViews(doc, clip));
  return views;
}

function svgDocument(text: string): [Mapped, XmlDocument] {
  const doc = xmlExpand(text);
  return [doc, xmlWalk(doc.text)];
}

function svgInert(text: string): Span[] {
  const [doc, walk] = svgDocument(text);
  const spans = doc.rawSpans(walk.comments);
  for (const segs of walk.scripts) pushAll(spans, svgScriptSpans(doc.text, segs, "xml", doc));
  if (walk.clip >= doc.text.length) return spans;
  return spans.filter(([a]) => a < walk.clip).map(([a, b]): Span => [a, Math.min(b, walk.clip)]);
}

/* A standalone SVG, which a frame, an `<object>` or a navigation runs as a document: its entities
   expanded, its attribute values and script and style text decoded by XML's rules. */
function svgViews(text: string): AssembledView[] {
  const [doc, walk] = svgDocument(text);
  const t = doc.text;
  const views = windowViews(Mapped.of(text));
  if (t !== text) views.push({ text: doc, inert: null, code: true });
  for (const [a, b] of walk.values) {
    if (triggered(VALUE_TRIGGER, t, a, b)) pushAll(views, valueViews(doc, "", a, b, 0, true));
  }
  for (const segs of walk.scripts) {
    const source = svgText(t, segs, "xml", doc);
    views.push({ text: foldHosts(source), inert: source.rawSpans(scanScript(source.text)), code: true });
  }
  for (const segs of walk.styles) views.push({ text: foldHosts(cssUnescape(svgText(t, segs, "xml", doc))), inert: null, code: false });
  if (walk.clip < t.length) pushAll(views, tailViews(doc, walk.clip));
  return views;
}

/** Every text the browser assembles out of this file that is not the file as written. An honest
    page written in ASCII, with no character reference in an attribute, no escape in a stylesheet
    and no SVG script split by a comment, has none, or only views whose URLs are the ones already
    matched. */
export function assembledViews(path: string, text: string): AssembledView[] {
  if (/\.html?$/i.test(path)) return htmlViews(Mapped.of(text));
  if (XML_DOCUMENT.test(path)) return svgViews(text);
  if (/\.css$/i.test(path)) {
    const views = windowViews(Mapped.of(text));
    if (text.includes("\\")) views.push({ text: foldHosts(cssUnescape(Mapped.of(text))), inert: null, code: false });
    return views;
  }
  if (/\.importmap$/i.test(path)) {
    const views = windowViews(Mapped.of(text));
    if (text.includes("\\")) views.push({ text: foldHosts(jsonUnescape(Mapped.of(text))), inert: null, code: false });
    return views;
  }
  if (/\.(?:[cm]?js|jsx|tsx?)$/i.test(path)) return windowViews(Mapped.of(text));
  return [];
}

/**
 * Everything in a piece of JavaScript that cannot be a request.
 *
 * One function because there are two callers -- a `.js` file, and a `<script>` body
 * inside an HTML file -- and the first version of the sink pass was added to only
 * one of them. The tests are written against HTML, so they went on failing while
 * the change looked applied. Two call sites doing almost the same thing is the
 * seam this repository keeps getting caught by, so there is now one.
 */
function scanScript(text: string): [number, number][] {
  const budget = freshBudget(text);
  return [...scanCode(text, false, 0, budget), ...diagnosticRanges(text, budget)];
}

/**
 * The arguments of a call that reports something, which are never a request.
 *
 * MEASURED, NOT GUESSED. A creator-flow test packaged three real games and put
 * each through this check unchanged: **none passed**, against a product metric
 * that is literally the share of first uploads that pass without a resubmission.
 * One refusal was correct and valuable -- Skyhopper really did pull Google Fonts
 * and Three.js from jsDelivr, and both die under the runtime CSP. The rest were
 * these:
 *
 *     console.warn('THREE.Geometry has been removed. Please see https://discourse…')
 *     throw Error("Minified React error #418; visit https://react.dev/errors/418 …")
 *     console.error("Learn more: https://nextjs.org/docs/messages/react-hydration-error")
 *
 * Not one of them is a request. They are lines nobody wrote, inside libraries the
 * jam requires, naming a fix that does not exist -- and there is nothing a creator
 * can do about any of them except stop trusting this check, which is the only way
 * a check like this actually fails.
 *
 * The comment walk already handled `// see https://…`; this is the same argument
 * arriving through a door nobody had checked, which is now the third time that
 * sentence has been written in this file.
 *
 * WHY THIS DOES NOT WEAKEN THE CHECK. It marks the argument span of a reporting
 * call, not strings generally, so `fetch("https://…")` is untouched -- and the two
 * are independent, so a bundle that warns about an origin AND fetches it is still
 * refused for the fetch. It cannot be used to hide a request, because a request
 * is a different call.
 */
function diagnosticRanges(text: string, budget: Budget): [number, number][] {
  const out: [number, number][] = [];
  /* Reporting sinks only. Not `String`, not `URL`, not anything whose result can
     become a request -- the test is "could the argument reach the network from
     here", and for these it cannot. */
  /* `globalThis.console.log(` and its two spellings as well as the bare one, because
     PixiJS 8 writes its banner that way and two blockers on www.pixijs.com were the
     result. The call form only, reached from one of the three global names: not
     `game.console.log(`, which is somebody's object, and not `console` near a string. */
  const SINK = /(?:^|[^\w.$])(?:(?:(?:globalThis|window|self)\s*\.\s*)?console\s*\.\s*(?:log|warn|error|info|debug|trace|assert)|(?:new\s+)?(?:Error|TypeError|RangeError|SyntaxError)|assert)\s*\(/g;

  for (const m of text.matchAll(SINK)) {
    /* THE SAME BUDGET AS THE CODE WALK. Each sink's argument list is read to its closing
       bracket, so `console.log(` repeated read the rest of the file once per call:
       quadratic, 54 s for 400 KB in inert.py on 27 Oct 2026 (review R33c). Past the
       budget nothing more is marked, so the rest of the file's diagnostics are live. */
    if (budget.left < 0) break;
    const open = m.index + m[0].length - 1;
    let i = open + 1;
    let depth = 1;
    while (i < text.length && depth > 0) {
      const c = text[i];
      if (c === "`") {
        i = templateText(text, i, budget)[0];
        continue;
      }
      if (c === '"' || c === "'") {
        /* Through the string rather than into it, so a bracket inside one cannot
           end the argument list early and leave the rest of the file inert. */
        i = skipQuoted(text, i, c);
        continue;
      }
      if (c === "(") depth += 1;
      else if (c === ")") depth -= 1;
      i += 1;
    }
    budget.left -= i - open;
    /* THE STRINGS INSIDE THE ARGUMENTS, NOT THE ARGUMENTS. Marking the whole span
       hid `console.warn(fetch("https://evil…"))` -- a real request, nested inside a
       reporting call, which the first version of this silenced completely. Found by
       attacking my own change before shipping it rather than by a review afterwards,
       which is the only reason it is not defect fifteen.
       
       A URL in a string handed to a sink is inert. Code handed to a sink is still
       code, and a call inside one is still a call. */
    if (depth !== 0 || budget.left < 0) continue;

    /* Strings at the sink's OWN argument depth, and no deeper. `console.warn("…")`
       is a report; `console.warn(fetch("…"))` contains a request, and the string in
       it belongs to `fetch`, not to the sink. Walking into nested calls hid exactly
       that -- caught by attacking this change before shipping it, which is the only
       reason it is not the fifteenth defect of the day. */
    let j = open + 1;
    let nested = 0;
    while (j < i - 1) {
      const q = text[j];
      if (q === "`") {
        const [end, parts] = templateText(text, j, budget);
        if (nested === 0) out.push(...parts);
        j = end;
        continue;
      }
      if (q === '"' || q === "'") {
        const end = skipQuoted(text, j, q);
        if (nested === 0) out.push([j, end]);
        j = end;
        continue;
      }
      if (q === "(") nested += 1;
      else if (q === ")") nested -= 1;
      j += 1;
    }
  }

  return out;
}

/**
 * Where the template opening at `start` ends, and its text between the holes.
 *
 * For the sink pass, which used to step over a backtick as if it were a quote. A
 * quote ends at a newline and has no holes; a template has both, so
 * `` throw Error(`\n  Can't get debug token…`) `` -- firebase's app-check, in every
 * compat bundle -- ended at the newline, the apostrophe in "Can't" opened a string
 * that was not there, and the sink's argument list ran on for 248 KB. The strings
 * the pass then marked inert were the gaps BETWEEN real strings, which is to say
 * the code. And a whole template marked inert hid what was in its holes:
 * `` console.warn(`${fetch("https://…")}`) `` is a request. Mirrors
 * `_template_text` in `inert.py`.
 */
function templateText(text: string, start: number, budget: Budget): [number, [number, number][]] {
  let i = start + 1;
  let seg = start;
  const spans: [number, number][] = [];
  while (i < text.length) {
    const c = text[i];
    if (c === "\\") i += 2;
    else if (c === "`") {
      spans.push([seg, i + 1]);
      return [i + 1, spans];
    } else if (c === "$" && text[i + 1] === "{") {
      spans.push([seg, i]);
      i = endOfHole(text, i + 2, budget);
      seg = i;
    } else i += 1;
  }
  spans.push([seg, text.length]);
  return [text.length, spans];
}

/**
 * The scanner proper. `cssOnly` because CSS has no `//` comment — a `//` there
 * is the start of a protocol-relative URL, every time, and treating it as a
 * comment would swallow the rest of the line including the origin we are
 * looking for.
 *
 * `budget` is shared by every walk of one file, holes included; see `bothReadings`.
 */
function scanCode(text: string, cssOnly: boolean, depth = 0, budget?: Budget): [number, number][] {
  const spent = budget ?? freshBudget(text);
  const ranges: [number, number][] = [];
  let i = 0;
  for (;;) {
    i = nextStop(text, i);
    if (i >= text.length) return ranges;
    const regex = opensPattern(text, i, cssOnly);
    i = regex === null
      ? bothReadings(text, i, cssOnly, depth, ranges, spent)
      : codeStep(text, i, cssOnly, depth, ranges, spent, regex);
  }
}

type Budget = { left: number };
const freshBudget = (text: string): Budget => ({ left: READING_BUDGET_PER_CHAR * text.length + READING_BUDGET_FLOOR });

/* The characters `scanCode` acts on; it steps over everything else. One pattern for
   both the walk and `bothReadings`, so the two agree on where a reading stops. */
const NEXT_CODE = /[/`"']/g;
const nextStop = (text: string, from: number) => {
  NEXT_CODE.lastIndex = from;
  return NEXT_CODE.exec(text)?.index ?? text.length;
};

/** Where the `//` comment at `i` ends: the next line terminator, or the end. */
function lineEnd(text: string, i: number): number {
  LINE_ENDS.lastIndex = i;
  return LINE_ENDS.exec(text)?.index ?? text.length;
}
/* Every character JavaScript ends a line at. A `//` comment stops at any of them and
   so does a regex literal, which cannot hold one. Review R33b (27 Oct 2026) found
   `// note` + U+2028 + `fetch(...)` read as one long comment: JavaScript runs the
   fetch, and the walk, stopping only at `\n`, called it inert. */
const LINE_ENDS = /[\n\r\u2028\u2029]/g;
const isLineEnd = (c: string) => c === "\n" || c === "\r" || c === "\u2028" || c === "\u2029";

/**
 * Would the `/` at `i` open a regex literal: yes, no, or either (null). False for
 * anything that is not a lone `/` in script, since `/*` and `//` are comments
 * whatever precedes them.
 */
function opensPattern(text: string, i: number, cssOnly: boolean): boolean | null {
  if (cssOnly || text[i] !== "/" || text[i + 1] === "/" || text[i + 1] === "*") return false;
  return regexMayStart(text, i, 0);
}

/**
 * Walk the one token at `i`, a `/`, quote or backtick, and return where to resume.
 * `regex` is whether a lone `/` here opens a pattern, decided by the caller, because
 * under `bothReadings` the same `/` is walked once each way.
 */
function codeStep(
  text: string,
  i: number,
  cssOnly: boolean,
  depth: number,
  ranges: [number, number][],
  budget: Budget,
  regex: boolean,
): number {
  const c = text[i];
  if (c === "/" && text[i + 1] === "*") {
    const end = text.indexOf("*/", i + 2);
    const to = end === -1 ? text.length : end + 2;
    ranges.push([i, to]);
    return to;
  }
  if (!cssOnly && c === "/" && text[i + 1] === "/") {
    const end = lineEnd(text, i);
    ranges.push([i, end]);
    return end;
  }
  if (c === "`") return scanTemplate(text, i, ranges, depth, budget);
  if (c === '"' || c === "'") return skipQuoted(text, i, c);
  if (regex) {
    /* A regex literal. Skipping it matters because `/[^"]*\/\//`
       and friends contain both quotes and slashes that would otherwise put
       the scanner into a string it never leaves — and recording it matters
       because a pattern that matches a URL contains one, and a pattern is not
       a request. */
    const to = skipRegex(text, i);
    ranges.push([i, to]);
    return to;
  }
  return i + 1;
}

/* How many readings of one stretch of code `bothReadings` follows at once. Two is the
   common case and real code rarely needs a third; past this the walk stops recording,
   which is the safe direction. */
const MAX_READINGS = 8;
/* The extra walking `bothReadings` may do in one file, in characters walked and spans
   compared, as a multiple of the file's length plus a floor. It is what keeps a file
   written to be ambiguous everywhere linear. Past it the walk stops recording and the
   rest of the file is live. */
const READING_BUDGET_PER_CHAR = 4;
const READING_BUDGET_FLOOR = 1 << 16;

/**
 * Walk an ambiguous `/` both ways, keep what both call inert, return where they meet.
 *
 * See `AMBIGUOUS_REGEX_KEYWORDS` for why the walk does not pick. The walk's whole
 * state between tokens is its position, so two readings that stop at the same
 * character are the same reading from there on: each reading is stepped one token at
 * a time, always the one furthest behind, and two that land on one stop are merged by
 * keeping only the spans both recorded. When one is left, its spans go into `ranges`
 * and the walk carries on from there. A reading may meet another ambiguous `/` and
 * split again, so this is a set rather than a pair, and it usually collapses within a
 * few tokens -- `of/2/3` read as a pattern and as two divisions meet at the `3`.
 *
 * WHERE THE WALK IS UNSURE, THE BYTE IS LIVE. If the readings outnumber
 * `MAX_READINGS`, or the file's budget runs out, nothing from `at` to the end of this
 * text is recorded. That costs false alarms, never a hidden request. Over 36 real
 * library files on 27 Oct 2026 it never happened. Since review R33c made a line break
 * in front of a `/` mean either reading, nine of them need a second reading somewhere,
 * none more than seven times. Same rule, same words, as `_both_readings` in `inert.py`.
 */
function bothReadings(
  text: string,
  at: number,
  cssOnly: boolean,
  depth: number,
  ranges: [number, number][],
  budget: Budget,
): number {
  const n = text.length;
  if (budget.left < 0) return n;
  /* Stop -> the spans recorded on the way to it, since `at`. */
  const readings = new Map<number, [number, number][]>();
  let pending: [number, boolean, [number, number][]][] = readingsOf(text, at, budget).map((regex) => [at, regex, []]);
  for (;;) {
    for (const [start, regex, spans] of pending) {
      const stop = nextStop(text, codeStep(text, start, cssOnly, depth, spans, budget, regex));
      budget.left -= stop - start + 1;
      const other = readings.get(stop);
      if (other) {
        budget.left -= other.length + spans.length;
        readings.set(stop, intersect(other, spans));
      } else readings.set(stop, spans);
    }
    if (readings.size === 1) {
      const [[stop, spans]] = readings;
      ranges.push(...spans);
      return stop;
    }
    if (readings.size > MAX_READINGS || budget.left < 0) {
      budget.left = -1;
      return n;
    }
    const stop = Math.min(...readings.keys());
    const spans = readings.get(stop)!;
    readings.delete(stop);
    const regex = opensPattern(text, stop, cssOnly);
    if (regex === null) {
      const ways = readingsOf(text, stop, budget);
      budget.left -= spans.length * (ways.length - 1);
      pending = ways.map((way) => [stop, way, way ? spans : spans.slice()]);
    } else pending = [[stop, regex, spans]];
  }
}

/**
 * The readings an ambiguous `/` really has: both, or division alone. The pattern
 * reading only exists if the literal it makes closes on this line; one that does not
 * is a syntax error. Charged to the budget because finding out can mean reading to
 * the end of a minified line.
 */
function readingsOf(text: string, at: number, budget: Budget): boolean[] {
  const end = skipRegex(text, at);
  budget.left -= end - at;
  return closes(text, at, end) ? [true, false] : [false];
}

/** Did `skipRegex` from `at` stop at a closing `/`, not a line end or a limit? */
const closes = (text: string, at: number, end: number) => end - 1 > at && text[end - 1] === "/";

/** The bytes both span lists cover. */
function intersect(a: [number, number][], b: [number, number][]): [number, number][] {
  const x = mergeSpans(a);
  const y = mergeSpans(b);
  const out: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    const lo = Math.max(x[i][0], y[j][0]);
    const hi = Math.min(x[i][1], y[j][1]);
    if (lo < hi) out.push([lo, hi]);
    if (x[i][1] < y[j][1]) i += 1;
    else j += 1;
  }
  return out;
}

/** Sorted, with overlapping and touching spans joined and empty ones dropped. */
function mergeSpans(spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const [a, b] of spans.slice().sort((p, q) => p[0] - q[0])) {
    if (b <= a) continue;
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/**
 * How far into nested `${`…`}` this bothers to look. Real code nests two or three
 * deep. The cap is here because past it nothing is recorded, which leaves those
 * contents live — the safe direction, and the same one the whole scanner takes:
 * a range wrongly marked inert hides a real request, a range wrongly left live
 * only costs somebody a second look.
 */
const MAX_TEMPLATE_DEPTH = 32;

/**
 * The index just past the `}` closing a `${…}` that opens at `start`.
 *
 * A stack rather than a brace counter, and iterative rather than recursive,
 * because a hole may hold a string holding a brace, and a template holding a
 * hole holding a template.
 *
 * THIS IS WHERE AN EXPONENTIAL WAS. The brace counter it replaces walked each
 * nesting level's contents twice — once recursively to find the closing brace,
 * recording as it went, then again handing the same span to `scanCode` — so the
 * cost doubled per level and the ranges came out duplicated. Four hundred nested
 * holes did not finish in two minutes. This records nothing, which leaves
 * `scanCode` the only thing that does and each byte walked once.
 *
 * Ported from `_end_of_hole` in `apps/pipeline/opengame_pipeline/inert.py`, which
 * had the fix first. The two files are one model and are meant to stay one: the
 * pipeline reads uploaded archives, this reads the creator's own bundle in their
 * own tab, and a rule that holds in one holds in the other.
 *
 * EXPORTED FOR ITS TEST, WHICH IS not the usual reason and is worth the sentence.
 * Fourteen shapes of input were tried through `preflight` looking for one where
 * the old brace counter and this disagree in a FINDING, and none does: the early
 * close changes which spans get recorded inside a hole, and `scanTemplate` records
 * comments over the remainder anyway, so the two arrive at the same answer by
 * different routes. The string-brace rule is real and has no other seam, so it is
 * asserted here rather than left to a test that would have passed either way.
 *
 * `budget` is the file's, shared with the code walk; see `regexInHole`.
 */
export function endOfHole(text: string, start: number, budget: Budget = freshBudget(text)): number {
  const n = text.length;
  let i = start;
  /* `null` is template context; a number is the brace depth inside a `${…}`. */
  const stack: (number | null)[] = [0];

  while (i < n && stack.length > 0) {
    const top = stack[stack.length - 1];
    const c = text[i];

    if (top === null) {
      if (c === "\\") i += 2;
      else if (c === "`") {
        stack.pop();
        i += 1;
      } else if (c === "$" && text[i + 1] === "{") {
        stack.push(0);
        i += 2;
      } else i += 1;
      continue;
    }

    if (c === "`") {
      stack.push(null);
      i += 1;
      continue;
    }
    /* A brace inside a string is not a brace. `${ f("}") }` closed the hole early
       under the counter this replaces, which ended the template in the middle of
       itself and put everything after it into the wrong context. */
    if (c === '"' || c === "'") {
      i = skipQuoted(text, i, c);
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      i = lineEnd(text, i);
      continue;
    }
    /* A REGEX LITERAL, whose braces are not braces. `${ /[}]/.test(x) }` closed the hole
       at the `}` inside the character class, ending the template in the middle of itself
       and putting everything after it into the wrong context -- which marks live code as
       inert, so a credential in it goes unreported. Same shape as the comment seam
       AGENTS.md records being closed in JavaScript and left open in HTML.

       `regexMayStart` is the same heuristic `scanCode` uses: after a value -- an
       identifier, a number, a closing bracket -- a `/` is division. */
    if (c === "/") {
      const regex = regexInHole(text, i, start, budget);
      if (regex === null) return n;
      if (regex) {
        i = skipRegex(text, i);
        continue;
      }
    }
    if (c === "{") stack[stack.length - 1] = top + 1;
    else if (c === "}") {
      if (top === 0) stack.pop();
      else stack[stack.length - 1] = top - 1;
    }
    i += 1;
  }

  return i;
}

/**
 * A template literal, which is where shader source lives.
 *
 * Every WebGL library of any size keeps its GLSL in backticks, and GLSL is
 * commented in exactly the same `//` and `/* *\/` as the JavaScript around it —
 * three.js cites the GGX sampling paper that way, inside the shader chunk that
 * implements it. To the tokenizer that is the middle of a string, so it took
 * this second pass to stop the citation being reported as a request.
 *
 * The one thing a comment opener here has to be told apart from is a scheme, and
 * a scheme is the only thing that puts a `:` immediately before `//`. So that is
 * the test: `` `${base}/x` `` and `fetch(`https://…`)` both survive it, and the
 * shader comment does not.
 *
 * `${…}` is real code and is scanned as such, so an origin interpolated into a
 * URL is still found.
 *
 * A SHADER COMMENT ENDS WHERE THE TEMPLATE DOES, and for a while it did not. It
 * ran to the next newline in the FILE, so in minified code -- one line -- the
 * first non-scheme `//` in any template took the closing backtick with it and
 * everything after was read as comment. `` `${proto}//${location.host}/ws` ``,
 * `` `//${c.authority}` `` and an error message saying "must not contain //" are
 * all ordinary library code, and on firebase-firestore-compat the walk called four
 * fifths of the file inert, a `Stripe("pk_live_…")` after it included. JavaScript
 * ends the template at the first unescaped backtick whatever GLSL thinks, and a
 * `${` is a hole whatever GLSL thinks, so those two close the comment too; a
 * comment interrupted by a hole resumes after it, because to the shader compiler
 * the interpolated value is part of the comment line. Same rule, same words, as
 * `_scan_template` in `apps/pipeline/opengame_pipeline/inert.py`.
 */
function scanTemplate(
  text: string,
  start: number,
  ranges: [number, number][],
  depth: number,
  budget: Budget,
): number {
  let i = start + 1;
  /* `null`, or the opener of the shader comment that is open, and where. */
  let comment: "//" | "/*" | null = null;
  let opened = 0;
  while (i < text.length) {
    const c = text[i];

    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "`") {
      if (comment !== null) ranges.push([opened, i]);
      return i + 1;
    }

    if (comment === "//") {
      if (isLineEnd(c)) {
        ranges.push([opened, i]);
        comment = null;
        i += 1;
        continue;
      }
    } else if (comment === "/*") {
      if (c === "*" && text[i + 1] === "/") {
        ranges.push([opened, i + 2]);
        comment = null;
        i += 2;
        continue;
      }
    }

    if (c === "$" && text[i + 1] === "{") {
      if (comment !== null) ranges.push([opened, i]);
      /* Find the end of the hole, then walk what is inside it once, as code.
         `endOfHole` records nothing, so `scanCode` stays the only thing that does
         and no span is walked twice. See its own comment for what that replaced. */
      const end = endOfHole(text, i + 2, budget);
      if (depth < MAX_TEMPLATE_DEPTH && budget.left >= 0) {
        for (const [a, b] of scanCode(text.slice(i + 2, end - 1), false, depth + 1, budget)) {
          ranges.push([i + 2 + a, i + 2 + b]);
        }
      }
      i = end;
      opened = i;
      continue;
    }

    if (comment === null && c === "/" && text[i + 1] === "*") {
      comment = "/*";
      opened = i;
      i += 2;
      continue;
    }

    if (comment === null && c === "/" && text[i + 1] === "/" && text[i - 1] !== ":") {
      comment = "//";
      opened = i;
      i += 2;
      continue;
    }

    i += 1;
  }
  if (comment !== null) ranges.push([opened, text.length]);
  return i;
}

/**
 * Consume a regex literal and return the index after it.
 *
 * Not `skipQuoted` with a slash for the quote, which is what it was, because a `/`
 * inside a character class does not end the pattern: pixi.js writes
 * `return/^[^/:]+:/.test(…)`, and the quote rule stopped at `[^/`, read the next
 * `/` as opening a second pattern, and lost its place for 48 KB.
 */
function skipRegex(text: string, start: number, limit = text.length): number {
  const n = Math.min(limit, text.length);
  let i = start + 1;
  let inClass = false;
  while (i < n) {
    const c = text[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    /* Unterminated, so the guess was wrong; see `skipQuoted`. A pattern cannot hold
       any of JavaScript's four line terminators. */
    if (isLineEnd(c)) return i;
    if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) return i + 1;
    i += 1;
  }
  return Math.min(i, n);
}

/* THE KEYWORDS THAT TAKE AN EXPRESSION, which the punctuation set could not
   express because it looks at one character. `return/firefox\//i.test(e)` is how
   a minifier writes a browser sniff, and with only the punctuation rule its `/`
   read as division: the walk then met the `//` inside the pattern, took it for a
   line comment, and marked the rest of the line inert -- which in minified code is
   the rest of the library, a Stripe call and a wallet request included. */
const REGEX_KEYWORDS = new Set([
  "return", "typeof", "case", "in", "void", "delete", "throw", "new",
  "else", "do", "instanceof",
]);
/* A RESERVED WORD IS AMBIGUOUS ONLY AS A PROPERTY NAME, `a. return / 2`, so after
   one the walk takes both readings only when `maybeAProperty` sees a `.` that
   might come before it. Taking both after every keyword, which R33b offered as one
   rule for N1, N2 and N4, was measured on 27 Oct 2026 over 25 libraries: it changed
   no finding, but on minified code the division reading of `return/.../` often never
   rejoined the other (572 KB of hls.min.js, 321 KB of axe.min.js), and axe.min.js
   went from 4.4% inert to 1.8%. The one shape that rule was needed for, a `//` comment
   between the `.` and the word, has to end in a line break, and since review R33c a
   line break in front of a keyword counts as a `.` that may be there, which costs
   minified code nothing because it has almost no line breaks. */
/* NOT RESERVED, SO EITHER READING CAN BE RIGHT, and either can hide code when it is
   the wrong one. `var of=2;z=of/1;fetch("https://coinhive...")` is legal, and the
   regex reading hides everything up to the `/` of `https://` (review R33). Reading
   `await /;/;fetch(...)` as division takes `/;fetch("https:/` for a pattern, and
   `yield /(a)\//` read that way meets `//` and loses the rest of the line (R33b N1).
   The guard this replaced picked one reading from the shape of the would-be pattern,
   and R33b beat it in both directions (N1, N4), so after these words the walk no
   longer picks. `bothReadings` follows both readings until they stop at the same
   character and keeps only the bytes both call inert. JavaScript takes one of the
   two and the walk followed that one too, so how this `/` was read cannot make the
   walk call a byte inert that the right reading leaves live. That is a claim about
   this one ambiguity, not about the walk: `)` and `}` in front of a `/` are still
   read one way, and `endOfHole` still guesses where a hole ends.
   inert.py's `_AMBIGUOUS_REGEX_KEYWORDS` is the same rule. */
const AMBIGUOUS_REGEX_KEYWORDS = new Set(["of", "await", "yield"]);
/* Two more keywords that take an expression, missing until review R33c:
   `class A extends /x/.constructor {}` and `export default /x/`. Kept apart because
   `regexInHole` keeps the rule from before review R33b, which did not have them. */
const LATER_REGEX_KEYWORDS = new Set(["extends", "default"]);
const LONGEST_REGEX_KEYWORD = Math.max(...[...REGEX_KEYWORDS, ...AMBIGUOUS_REGEX_KEYWORDS, ...LATER_REGEX_KEYWORDS].map((k) => k.length));
/* What an identifier may be made of, which is where `[\p{L}\p{N}_$]` fell short.
   Review R33b N2: `var áreturn=2;z=áreturn/1` spells the `á` as `a` plus a combining
   accent, and `x`, a ZWJ and `return` make one name the same way. The walk saw
   `return` start after a character it did not count, took the keyword, and read the
   division as a pattern that hid the rest of the line. Combining marks, connector
   punctuation, ZWNJ and ZWJ are identifier parts, and so is a `\` (it opens a
   `\uXXXX` escape). The literal set is Unicode's Other_ID_Start and Other_ID_Continue
   that fall outside those categories. inert.py's `_is_word` is the same set, apart
   from the Unicode-version gap below.

   Review R33c's D1 added two more. This walk reads UTF-16 and sees one half of a
   pair at a time, and a lone half matched nothing, so U+1D49C, a mathematical script
   A, followed by `return/1` was the keyword here and a name in inert.py: every
   surrogate counts now, as every code point past U+FFFF does there. And `\p{Cn}`,
   because inert.py counts what its older Unicode does not know (U+A7CB is a letter
   in Unicode 16 and the pipeline's Python has 15). Outside a string or a comment
   either can only be part of a name, or a syntax error, which runs nothing.

   The two sets are still NOT identical. A character Unicode 16 made a symbol is Cn to
   the pipeline's Python and a symbol to node, so U+2427 and U+31E4 count as name
   characters in inert.py and not here (review R33d). Outside a string or a comment
   those are syntax errors as well, so the disagreement can change a span on a file
   that will not run, and never on one that does. */
const WORD_CHAR = /[\p{L}\p{N}\p{M}\p{Pc}\p{Cn}\uD800-\uDFFF$\\\u200c\u200d\u00b7\u0387\u19da\u2118\u212e\u309b\u309c\u30fb\uff65]/u;
const isWordChar = (c: string) => WORD_CHAR.test(c);
/* JavaScript's whitespace and line terminators. Spelled out rather than `\s`, so it
   is the set inert.py has. */
const JS_SPACE = /[ \t\v\f\u00a0\ufeff\n\r\u2028\u2029\p{Zs}]/u;
/* How far back the walk looks past whitespace for what comes before a `/` or a
   keyword. Past it the answer is "either", which `bothReadings` makes safe. */
const LOOKBACK = 1024;

/**
 * Could the keyword ending just after `j` be a property name, `a. return`?
 *
 * Looks back past whitespace for a `.`, which also covers `?.`. Review R33b N2: the old
 * test looked only at the character immediately before the word, so
 * `a. return/1;fetch(...)` and `a?. typeof` read as the keyword, and the division as a
 * pattern that hid the request after it.
 *
 * ONLY EVER AN ARGUMENT FOR WALKING BOTH READINGS, never for dropping the regex one, so
 * anything in front that this cannot read says "maybe": a `.`, which can be the last
 * character of a `//` comment on the line above (`// see a.` + newline +
 * `return /a\//;fetch(…)`, where reading division is the N1 misread); a line break,
 * because a `//` comment may end there and nothing reading backwards can tell where it
 * began (`a.// c` + newline + `return/1;fetch(…)` hid the request, and so did an
 * Annex B `<!--` comment in the same place); a `*\/`, because finding the comment's
 * opener with `lastIndexOf` was fooled by a second `/*` inside it
 * (`a./* x /* y *\/return/1;fetch(…)`, review R33c); and a look-back that runs out of
 * room. Mirrors `_maybe_a_property`.
 */
function maybeAProperty(text: string, j: number, floor: number): boolean {
  const stop = Math.max(floor, j - LOOKBACK);
  while (j >= floor) {
    const c = text[j];
    if (isLineEnd(c) || j < stop) return true;
    if (!JS_SPACE.test(c)) return c === "." || (c === "/" && j > floor && text[j - 1] === "*");
    j -= 1;
  }
  return false;
}

/**
 * Where the word ending at `j` starts, if it could be a keyword at all. Null when it
 * is part of a longer name or a property: a word character, a `.`, a `#` or a
 * `\u{…}` escape right in front of it makes it one, so `x.in / 2`, `this.#of / 2`
 * and `x\u{61}return / 2` are division. Bounded by the longest keyword, so a
 * megabyte identifier costs nothing. Mirrors `_keyword_start` in `inert.py`.
 */
function keywordStart(text: string, j: number, floor: number): number | null {
  let k = j;
  while (k >= floor && j - k <= LONGEST_REGEX_KEYWORD && isWordChar(text[k])) k -= 1;
  if (k >= floor && (isWordChar(text[k]) || text[k] === "." || text[k] === "#")) return null;
  if (k >= floor && afterBracedEscape(text, k, floor)) return null;
  return k + 1;
}

/**
 * Does a `\u{…}` escape end at `k`, making the word after it part of a longer name?
 * Any number of hex digits, because JavaScript allows leading zeros:
 * `x\u{000000000061}return` is one name, and a limit of eight digits read it as
 * `return` (review R33c). The walk back over the digits is linear over a file, since
 * each `}` has its own run of them. Mirrors `_after_braced_escape`.
 */
function afterBracedEscape(text: string, k: number, floor: number): boolean {
  if (text[k] !== "}") return false;
  let j = k - 1;
  while (j >= floor && /[0-9a-fA-F]/.test(text[j])) j -= 1;
  return j < k - 1 && j - 2 >= floor && text.slice(j - 2, j + 1) === "\\u{";
}

/**
 * Can the `/` at `at` open a regex literal, judging by what precedes it?
 *
 * True or false when the text in front settles it, and null when JavaScript could
 * read it either way, which `scanCode` answers by walking both. After a value -- an
 * identifier, a number, a closing bracket -- a `/` is division. That is the standard
 * heuristic and the only one available without a parser. `floor` is where the code
 * being walked begins, so a hole's walk never reads the template text in front of it.
 *
 * IT LOOKS BACK PAST EVERY JAVASCRIPT WHITESPACE CHARACTER, and for a while it stepped
 * over only spaces and tabs. Review R33c's B1: `await/**\//;/;fetch(…)`, or a no-break
 * space, a vertical tab, a CR or U+2028 between `await` and the `/`, landed on a
 * character that settled nothing and was read as division, which is R33b's own N1
 * input with one character added. The same held after every keyword and every
 * punctuation mark. So a `*\/` in front is "either", because it may close a comment
 * hiding whatever came before it and reading a comment backwards is fooled by a `/*`
 * inside it; a line break in front is "either", because a `/` at the start of a line is
 * division after a value, a pattern after `(`, and either after a line ending in a `//`
 * comment, whose last character can be anything (this used to be "pattern", which hid
 * `a` + newline + `/1;fetch(…)`); and more than `LOOKBACK` characters of whitespace is
 * "either". Each "either" is walked both ways by `bothReadings`. Mirrors
 * `_regex_may_start` in `inert.py`, which has the measurement.
 */
function regexMayStart(text: string, at: number, floor: number): boolean | null {
  let j = at - 1;
  const stop = Math.max(floor, j - LOOKBACK);
  let crossed = false;
  while (j >= floor && JS_SPACE.test(text[j])) {
    if (j < stop) return null;
    crossed ||= isLineEnd(text[j]);
    j -= 1;
  }
  if (j < floor) return true;
  if (crossed || (text[j] === "/" && j > floor && text[j - 1] === "*")) return null;
  /* `a++/2` is division and `a+++/x/.source` a pattern, and both end in `++`. */
  if ((text[j] === "+" || text[j] === "-") && j > floor && text[j - 1] === text[j]) return null;
  /* A spread, `f(.../x/)`, takes an expression; a lone `.` does not. */
  if (text[j] === "." && j - 2 >= floor && text.slice(j - 2, j) === "..") return true;
  if (BEFORE_REGEX.test(text[j])) return true;
  if (!isWordChar(text[j])) return false;
  const start = keywordStart(text, j, floor);
  if (start === null) return false;
  const word = text.slice(start, j + 1);
  if (AMBIGUOUS_REGEX_KEYWORDS.has(word)) return null;
  if (!REGEX_KEYWORDS.has(word) && !LATER_REGEX_KEYWORDS.has(word)) return false;
  return maybeAProperty(text, start - 1, floor) ? null : true;
}
/* What may precede a `/` that starts a regex literal; inert.py's `_BEFORE_REGEX`. */
const BEFORE_REGEX = /[(,=:[!&|?{};+\-*%~^<>\n]/;

/**
 * The same question for `endOfHole`, which can follow only one reading.
 *
 * It returns one position, the brace that closes a `${…}`, so where the two readings
 * would put that brace in different places there is no intersection to take and this
 * has to guess. THE GUESS CAN HIDE A REQUEST, and an earlier comment here said it
 * could not because the hole's contents are walked with both readings. That was
 * wrong: the brace this picks decides what is walked as template text after it, where
 * `[//]` opens a shader comment, and what the sink pass marks inert outright (review
 * R33c R1). When review R33b's fix capped the pattern tried here at 256 characters and
 * sent a keyword that might be a property to the guess, a long pattern after `await`,
 * or `typeof /(})…/` behind a comment, closed the hole at the `}` inside it, and the
 * fetch after it went inert in both checkers.
 *
 * So this keeps the rule from before review R33b, because moving a single guess moves
 * the inputs that beat it rather than removing them. Spaces and tabs are stepped over
 * and nothing else; a keyword opens a pattern even where a `.` may come before it;
 * after `of`, `await` or `yield` a `/` opens a pattern when one would close on its line
 * holding no quote, backtick, `;` or `(`. That last rule is a HEURISTIC, and stepping
 * over spaces and tabs only is a known gap too: a comment, a no-break space or a line
 * separator in front of the `/` settles nothing here and reads as division. Both are
 * pinned as KNOWN MISS probe rows, one per trigger (review R33d).
 *
 * It differs from that rule in four places, and each either does what JavaScript does
 * or gives the hole up. The identifier characters `keywordStart` counts, and `\u{…}`
 * escapes of any length before a keyword, make a longer name, so division. A pattern
 * tried here ends at CR, U+2028 and U+2029 as well as LF, because `skipRegex` does
 * (review R33b N3), and JavaScript ends one there. And the budget below.
 *
 * The pattern is tried to the end of its line, with no window, and the walking is
 * charged to the file's budget, which is what keeps `of/[(` repeated linear. Once the
 * budget is spent there is no guess left to make, and null tells `endOfHole` to give
 * up on the hole: it runs to the end of the text, so nothing after it is read as
 * template text and nothing more is recorded. Mirrors `_regex_in_hole`.
 */
function regexInHole(text: string, at: number, floor: number, budget: Budget): boolean | null {
  let j = at - 1;
  while (j >= floor && (text[j] === " " || text[j] === "\t")) j -= 1;
  if (j < floor || BEFORE_REGEX.test(text[j])) return true;
  if (!isWordChar(text[j])) return false;
  const start = keywordStart(text, j, floor);
  if (start === null) return false;
  const word = text.slice(start, j + 1);
  if (!AMBIGUOUS_REGEX_KEYWORDS.has(word)) return REGEX_KEYWORDS.has(word);
  if (budget.left < 0) return null;
  const end = skipRegex(text, at);
  budget.left -= end - at;
  return closes(text, at, end) && !GUESSED_BODY.test(text.slice(at + 1, end - 1));
}
const GUESSED_BODY = /["'`;(]/;

/** Consume a quoted string and return the index after it. */
function skipQuoted(text: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < text.length) {
    const c = text[i];
    if (c === "\\") {
      /* A backslash and a CRLF are one line continuation, not an escaped CR followed
         by the newline that ends the string. */
      i += text[i + 1] === "\r" && text[i + 2] === "\n" ? 3 : 2;
      continue;
    }
    if (c === quote) return i + 1;
    /* An unterminated string is a syntax error, not a string that runs to the
       end of the file. Stopping at the newline keeps one stray apostrophe from
       blinding the rest of the scan — and templates, the only quote that may
       legally span lines, are handled by scanTemplate rather than here. A bare CR
       ends a line as well. U+2028 and U+2029 do NOT end a string: a string may
       hold them, and stopping there would walk the rest of the string as code,
       where a `//` in it opens a comment over what follows. */
    if (c === "\n" || c === "\r") return i;
    i += 1;
  }
  return i;
}

/* -------------------------------------------------------------------------- */
/* Reference extraction                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Is the string literal starting at `at` the specifier of an `import`.
 *
 * `import x from "./a.js"`, `import "./a.js"`, `import("./a.js")` and
 * `export { x } from "./a.js"` all end in `from` or `import` and then the quote,
 * and a `<script src>` in HTML is the same fact in markup. A path in that position
 * is fetched the moment the module is evaluated, before any code the creator wrote
 * has run, so a missing one is a game that does not start; a path handed to
 * `fetch` or a loader later may be generated at runtime and is only a warning.
 * One test for both the origin check and the reference check, so they cannot
 * disagree about what an import is.
 */
function isImportSpecifier(text: string, at: number): boolean {
  return /\b(?:import|from)\s*\(?\s*["'`]$/.test(text.slice(Math.max(0, at - 24), at));
}

/**
 * The literal is what a string is compared against, `path.endsWith('.audio.worklet.js')`,
 * and so a suffix nobody requests. Godot's loader tests three of these and every Godot
 * export was told `.audio.worklet.js`, `.audio.position.worklet.js` and `.side.wasm` were
 * missing (24 Oct 2026).
 */
function isComparedName(text: string, at: number): boolean {
  return /\.(?:endsWith|startsWith|includes|indexOf|lastIndexOf)\s*\(\s*$/.test(text.slice(Math.max(0, at - 32), at));
}

/**
 * The literal is one side of `==`, `===` or `!=`: Defold's locateFile compares against three
 * engine names it renames, `path == "dmengine.wasm"`, and each was reported missing (25 Oct
 * 2026). Unlike the method calls above, which are skipped outright as they always were, an
 * equality is only flagged: it loses the missing-file warning, and `x === "assets/Hero.PNG"`
 * against assets/hero.png keeps the case-mismatch blocker it always had (reviews of #432).
 *
 * Either side. The .NET 8 loader writes the literal first, `"appsettings.json"!==n`, when it
 * picks which configured settings files to mount, and every C# build was told
 * _framework/appsettings.json was missing (1 Nov 2026). `end` is just past the closing quote.
 */
function isEqualityName(text: string, at: number, end: number): boolean {
  return /[!=]==?\s*$/.test(text.slice(Math.max(0, at - 32), at)) || /^\s*[!=]=/.test(text.slice(end, end + 32));
}

/**
 * The literal follows a `+`, as the end of a name built at runtime does: `exeName +
 * '_pthread.wasm'`. Defold's loader builds its three file names this way and each was
 * reported missing under the suffix alone (defold-pinball, 25 Oct 2026). Only the missing-file
 * warning is dropped for it; a case mismatch is still a blocker (see the reference loop).
 */
function isAppendedName(text: string, at: number): boolean {
  return /\+\s*$/.test(text.slice(Math.max(0, at - 16), at));
}

/**
 * The literal names a file made in memory, `new File([text], "ks_page.txt", ...)`, which
 * the page builds rather than fetches. Hearthguard's Kaigen shell hands one to a paste
 * handler and was told the file was missing (24 Oct 2026).
 */
function isMadeFileName(text: string, at: number): boolean {
  return /\bnew\s+File\s*\(\s*\[[^\]]{0,200}\]\s*,\s*$/.test(text.slice(Math.max(0, at - 240), at));
}

/**
 * The literal is a key in an object literal, `{ "./shiftlight_bg.js": import0 }`, which
 * names a property and requests nothing. wasm-bindgen keys the imports it hands
 * `WebAssembly.instantiate` by the module name its own glue was generated as, and every
 * Rust web build was told that `<crate>_bg.js` was missing (Shiftlight, 24 Oct 2026). A
 * ternary's `? "a.png" :` follows a `?`, not a brace or a comma, and stays a reference.
 *
 * WHAT IT COSTS, NAMED. A game that keys a table by file name and loads the keys,
 * `{"jump.mp3": 0.5}` then `new Audio(k)` in a loop, is no longer told a missing one is
 * missing. That is a warning lost, never a blocker, and the request fails visibly in play.
 */
function isObjectKey(text: string, start: number, end: number): boolean {
  return /[{,]\s*$/.test(text.slice(Math.max(0, start - 16), start)) && /^\s*:(?!:)/.test(text.slice(end, end + 16));
}

/** Where the entry document sits once the root is applied: the bundle root, always. */
const ENTRY_DOCUMENT_DIR = "";
/** The manifest the SDK reads beside the page when it runs outside OpenGame. */
const SDK_LOCAL_MANIFEST = "opengame.json";

/**
 * Is the string literal between `start` and `end` the first argument of
 * `new URL(<literal>, <page address>)`, where the page address is `location.href` or
 * `document.baseURI`, reached directly or through a chain such as `this.context().win.`.
 *
 * Such a URL is resolved against the page, not the module that builds it. The SDK's own
 * line is `new URL("./opengame.json", i.location.href)` once minified, inside
 * `assets/index-<hash>.js`, and reading it against the module's folder put the request at
 * `assets/opengame.json`, which nothing ever asks for. `import.meta.url` is the other
 * common second argument and is deliberately not here: that one IS the module.
 */
function isDocumentUrl(text: string, start: number, end: number): boolean {
  return /\bnew\s+URL\s*\(\s*$/.test(text.slice(Math.max(0, start - 16), start)) &&
    /^\s*,\s*(?:[\w$]+(?:\([^()]*\))?\.)*(?:location\.href|document\.baseURI)\b/.test(text.slice(end, end + 80));
}

interface Reference {
  value: string;
  line: number;
  /**
   * `static` for a path the browser fetches before the game can run at all: an
   * `import` specifier, a `<script src>`, a stylesheet `href`. `runtime` for
   * everything else, which the game asks for once it is going and may generate
   * on the way. The two are reported differently; see `missing-import`.
   */
  kind: "static" | "runtime";
  /**
   * `document` for `new URL("./x", location.href)` and its spellings: a path resolved
   * against the page's own address, which is the entry document, wherever the line that
   * builds it sits. Absent for everything else, which is resolved as described where
   * references are checked.
   */
  base?: "document";
  /** The literal is the argument of `locateFile(` or `locate_file(`, which a Godot loader rewrites. */
  locate?: boolean;
  /** The literal is the argument of `loadArchiveDescription(`, which Defold's archive filter prefixes. */
  archive?: boolean;
  /** A compared name or a suffix after `+`: not a request unless a file on disk matches it. */
  appended?: boolean;
  /** A `<link>` the page does not need to start (an icon, a manifest; `blocksStart`), so even a
   *  wrong-case match is a warning: what it costs is a tab icon. */
  optional?: boolean;
}

/** How far back from an attribute its tag's `<` is looked for; a tag longer than this is read from the sixty characters before the attribute. */
const TAG_READ_MAX = 2048;

/**
 * Whether a `<script>` or `<link>` the parser meets has to load for the game to start. Every
 * script does, and a link only when it is a stylesheet, a module preload, or a preload of a
 * script or a style. An icon, a web app
 * manifest or an apple-touch-icon is something the browser asks for beside the page, and a
 * missing one costs a tab icon and nothing else: Bubbo Bubbo (PixiJS, launch E2E, B-8, 13 Nov
 * 2026) was refused because its index.html linked images/favicon.png and the build had none.
 * Those are runtime references now, which are a warning. `rel` is read off the whole tag,
 * and only as an attribute of its own: `data-rel=` is not it (the inert-span reading below
 * was caught by exactly that once). A link with no readable rel stays static, the safe side.
 */
function blocksStart(tag: RegExpExecArray, text: string, at: number): boolean {
  if (tag[1].toLowerCase() === "script") return true;
  const start = at - (tag[0].length);
  const close = text.indexOf(">", at);
  const whole = text.slice(Math.max(0, start), close === -1 ? text.length : close).replace(/^<link\b/i, "");
  /* Attribute by attribute, so a `rel=` inside another attribute's quoted value
     (`title="x rel=icon"`) is that value, not the link's rel. */
  let rel: string | null = null;
  for (const attr of whole.matchAll(/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    if (attr[1].toLowerCase() === "rel") { rel = attr[2] ?? attr[3] ?? attr[4] ?? ""; break; }
  }
  if (rel === null) return true;
  const words = rel.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.includes("stylesheet") || words.includes("modulepreload")) return true;
  // A preload blocks as what it preloads: a script or a style does, an image or a font does not.
  if (!words.includes("preload")) return false;
  const as = /(?:^|\s)as\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(whole);
  const kind = (as?.[1] ?? as?.[2] ?? as?.[3] ?? "").toLowerCase();
  return kind === "" || kind === "script" || kind === "style";
}

/**
 * Every path a file asks for, as written. Conservative on purpose: a false
 * positive here becomes a blocker on a bundle that was fine, which is a worse
 * outcome than missing one mismatch. So anything with a template hole, a
 * concatenation, a protocol or a data URI is skipped rather than guessed at.
 */
function* extractReferences(path: string, text: string, inert: Span[]): Generator<Reference> {
  const lineAt = lineLocator(text);
  const reference = (value: string, index: number, kind: Reference["kind"] = "runtime"): Reference | undefined => {
    if (!value || value.length > 300) return;
    /* A path in a comment is documentation, not a request. Library source is
       made of it: three.js documents its own loaders with `load( 'sprite.png' )`
       in a JSDoc block above each one, and a bundle vendoring it was told that
       thirty-one files were missing, every one of them an example. */
    if (isInert(inert, index)) return;
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\?)/i.test(value)) return; // protocol, protocol-relative, fragment
    if (value.includes("${") || value.includes("<%")) return; // interpolated at runtime
    const clean = value.split(/[?#]/)[0];
    if (!clean || clean.endsWith("/")) return;
    if (!isAssetReference(clean)) return;
    return { value: clean, line: lineAt(index), kind };
  };

  if (/\.html?$/i.test(path)) {
    /* A `<script src>` or a `<link href>` is loaded by the parser before anything
       runs, so it is static. Every other attribute is content the page asks for
       afterwards. The tag is read from its own `<`, as far back as TAG_READ_MAX: it was the
       sixty characters before the attribute until 13 Nov 2026, and `<link rel="icon"
       type="image/png" sizes="32x32" href=...>` starts its href past that, so a wrong-case
       icon was not seen as an icon and refused a working export (Greptile on
       opengamehq/opengame#9). */
    for (const m of text.matchAll(/\b(?:src|href|data-src|poster)\s*=\s*["']([^"']+)["']/gi)) {
      const at = m.index ?? 0;
      const open = text.lastIndexOf("<", at);
      const before = open >= 0 && at - open <= TAG_READ_MAX && !text.slice(open, at).includes(">") ? text.slice(open, at) : text.slice(Math.max(0, at - 60), at);
      const tag = /<(script|link)\b[^<>]*$/i.exec(before);
      const blocks = tag ? blocksStart(tag, text, m.index ?? 0) : false;
      const ref = reference(m[1], m.index ?? 0, blocks ? "static" : "runtime");
      if (ref && tag && !blocks) ref.optional = true;
      if (ref) yield ref;
    }
    /* An import map is a list of paths and nothing else, so it is the highest
       signal-to-noise source of references in the whole bundle. */
    for (const m of text.matchAll(/"[^"]*"\s*:\s*"(\.{0,2}\/[^"]+)"/g)) { const ref = reference(m[1], m.index ?? 0); if (ref) yield ref; }
  }

  if (/\.css$/i.test(path)) {
    for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) { const ref = reference(m[1], m.index ?? 0); if (ref) yield ref; }
  }

  if (/\.[cm]?js$/i.test(path)) {
    /* Only plain string literals that already look like a path to an asset.
       Anything built by concatenation is invisible here and that is accepted:
       this check is a net for the common case, not a static analyser. The closing
       quote has to be the opening one: with either quote at either end, the .NET 8
       runtime's `"Can't load dotnet.native.wasm"` was read from its apostrophe as a
       request for `t load dotnet.native.wasm` (1 Nov 2026), and no string literal in a
       script opens with one quote and closes with the other. */
    for (const m of text.matchAll(/(["'])(\.{0,2}\/?[\w.@ -]+(?:\/[\w.@ -]+)*\.[a-z0-9]{2,5})\1/gi)) {
      /* `isImportSpecifier` stands just inside the opening quote, the same place
         the origin check stands when it asks; `m.index` is the quote itself, so
         one past it. */
      const start = m.index ?? 0, end = start + m[0].length;
      if (isComparedName(text, start) || isMadeFileName(text, start) || isObjectKey(text, start, end)) continue;
      const ref = reference(m[2], start, isImportSpecifier(text, start + 1) ? "static" : "runtime");
      /* Equalities and slash-less suffixes after a `+` are flagged, not dropped: they lose only
         the missing-file warning, and a case mismatch on disk is still a blocker. */
      if (ref && (isEqualityName(text, start, end) || (isAppendedName(text, start) && !ref.value.includes("/")))) ref.appended = true;
      if (ref && isDocumentUrl(text, start, end)) ref.base = "document";
      if (ref && /\b(?:locateFile|locate_file)\s*\(\s*$/.test(text.slice(Math.max(0, start - 24), start))) ref.locate = true;
      if (ref && /\bloadArchiveDescription\s*\(\s*$/.test(text.slice(Math.max(0, start - 32), start))) ref.archive = true;
      if (ref) yield ref;
    }
  }

}

/* -------------------------------------------------------------------------- */
/* Presentation helpers                                                        */
/* -------------------------------------------------------------------------- */

/** One finding per file-and-line. A loop that repeats an import is still one bug. */
function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    /* The severity is in the key because a link and a fetch to one host on one line share
       everything else, and minified code is all one line: `'<a href="https://x/">'` ahead
       of `fetch("https://x/y")` kept the link's warning, dropped the fetch's blocker and
       answered ok (found 24 Oct 2026). `order` runs after this, so the first one written
       won whatever it was. */
    const key = `${f.severity}:${f.code}:${f.path}:${f.line}:${f.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Blockers first, then warnings, then the things we fixed. Reading order. */
const RANK: Record<Severity, number> = { blocker: 0, warning: 1, note: 2 };

function order(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}

export { ARCHIVE_EXTENSIONS, BIDI_CONTROLS, nameCollisions, nameFindings, nestedArchiveExtension, precompressedAsset, compressedBrowserAsset, engineArchive } from "./names";

export { detectEngine, detectedIds, ENGINE_REGISTRY, ENGINE_NAMES, engineLabel } from "./engines";
export { inspectRawRuntime, inflateRawRuntime, RawRuntimeError, type RawRuntimeEvidence, type RawInflater } from "./raw-runtime";
export type { EngineId, EngineReport, EngineSource } from "./engines";
