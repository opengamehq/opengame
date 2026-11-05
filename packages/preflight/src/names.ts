import { BUNDLE, LIMITS } from "@opengame/shared";
import { canonicalName } from "@opengame/shared/unicode-casefold";
import type { Finding } from "./index";

export { canonicalName } from "@opengame/shared/unicode-casefold";

/**
 * What a file inside a bundle may be called: the rules the pipeline's archive stage
 * applies to every entry (apps/pipeline/opengame_pipeline/names.py), run before upload.
 *
 * WHY A SECOND COPY OF A SERVER RULE. The plan says the CLI enforces exactly what the
 * server enforces, and for names it did not. `opengame check` said a bundle was fine and
 * the archive stage refused it a minute after upload: two files that differ only in
 * case, which a Linux build can produce and a Mac cannot even hold; the same name
 * composed and decomposed; a `.gz` asset, which the stage reads as a nested archive. A
 * creator on the CLI then had a refused release to read instead of a finding in the
 * terminal. The lists below are names.py's, and tests/names-parity.test.ts runs both
 * implementations over the same names and fails when they disagree, which is what keeps
 * this from being the weaker of two copies.
 *
 * The magic-byte sniff (an archive renamed to `.ktx2`) stays server-only: this reads
 * names, and the server still refuses those archives with a finding of its own.
 *
 * Backslashes are deliberately NOT here. The browser hands the web uploader forward
 * slashes, and the preflight has always treated a backslash in a zip someone dropped as
 * a separator, which re-zipping then makes true. A backslash inside a filename on disk is
 * the CLI's problem alone, and the CLI refuses it where it reads the disk.
 */

/** names.py ARCHIVE_EXTENSIONS. `.tar.gz` is caught as `.gz`, which is the honest answer. */
export const ARCHIVE_EXTENSIONS = [
  ".zip", ".tar", ".gz", ".br", ".tgz", ".bz2", ".tbz", ".tbz2", ".xz", ".txz",
  ".7z", ".rar", ".lz", ".lzma", ".zst", ".zstd", ".cab", ".arj", ".lzh",
  ".iso", ".dmg", ".jar", ".war", ".ear", ".apk", ".xpi", ".crx", ".deb",
  ".rpm", ".pkg", ".msi", ".cpio", ".ar", ".z",
] as const;

/** names.py BIDI_CONTROLS: LRM, RLM, ALM, the embeddings and overrides, the isolates. */
export const BIDI_CONTROLS = "‎‏؜‪‫‬‭‮⁦⁧⁨⁩";

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

/** A configured reader is an admission prerequisite, never evidence of the engine.
 * Match the complete suffix. Ren'Py's loader fetches `game.zip` beside the page it
 * boots from, and paths here are relative to that page, so only a root-level
 * `game.zip` is its archive (names.py engine_archive with the entry root). */
export function engineArchive(path: string, engineIds: Iterable<string> = []): string | null {
  const ids = new Set(engineIds);
  const lower = path.toLowerCase();
  const rules: Record<string, readonly string[]> = LIMITS.platform.browserEnginePolicy.engineArchives;
  for (const [suffix, engines] of Object.entries(rules)) {
    if (!lower.endsWith(suffix) || !engines.some(id => ids.has(id))) continue;
    if (suffix === ".zip" && lower !== "game.zip") continue;
    return suffix;
  }
  return null;
}

/** names.py engine_archive_members: what a ZIP admitted under an engine suffix must
 * hold (limits.json engineArchiveMembers), or null for a suffix with no rule.
 * engineArchive decides from the name and the detected engine, and detection is text
 * any bundle can copy, so this is the half that has to read the archive. */
export function engineArchiveMembers(suffix: string): { patterns: RegExp[]; requirement: string } | null {
  const rules = LIMITS.platform.browserEnginePolicy.engineArchiveMembers as Record<string, { patterns: string[]; requirement: string }>;
  const rule = Object.entries(rules).find(([key]) => !key.startsWith("_") && key.toLowerCase() === suffix.toLowerCase())?.[1];
  return rule ? { patterns: rule.patterns.map(pattern => new RegExp(`^(?:${pattern})$`)), requirement: rule.requirement } : null;
}

/** names.py engine_archive_shape: whether a ZIP's file names are the shape its suffix needs. */
export function engineArchiveShape(suffix: string, members: Iterable<string>): boolean {
  const rule = engineArchiveMembers(suffix);
  return !rule || [...members].some(member => rule.patterns.some(pattern => pattern.test(member)));
}

/** names.py engine_container_extensions: every engine suffix except those that are
 * also browser payload extensions (`.data`), which ordinary games ship unowned. */
export function engineContainerExtensions(): string[] {
  const policy = LIMITS.platform.browserEnginePolicy;
  const payloads = new Set(policy.precompressedAssetExtensions.map(ext => `.${ext.toLowerCase()}`));
  return Object.keys(policy.engineArchives as Record<string, unknown>)
    .filter(suffix => !suffix.startsWith("_") && !payloads.has(suffix.toLowerCase())).map(suffix => suffix.toLowerCase());
}

export function nestedArchiveExtension(path: string, engineIds: Iterable<string> = []): string | null {
  if (engineArchive(path, engineIds) || precompressedAsset(path)) return null;
  const lower = path.toLowerCase();
  return [...ARCHIVE_EXTENSIONS, ...engineContainerExtensions()].find(ext => lower.endsWith(ext)) ?? null;
}

/** A browser resource has one encoding suffix after an explicitly supported
 * payload extension. Its decoder still validates bytes; a filename is no proof. */
export function precompressedAsset(path: string): { path: string; encoding: "gz" | "br" } | null {
  const match = /\.([^.\/]+)\.([^.\/]+)$/i.exec(path);
  const policy = LIMITS.platform.browserEnginePolicy;
  if (!match || !path.slice(0, match.index).split("/").pop() || !policy.precompressedAssetExtensions.some(ext => ext === match[1]!.toLowerCase()) ||
    !policy.precompressedEncodings.some(encoding => encoding === match[2]!.toLowerCase())) return null;
  return { path: path.slice(0, -(match[2]!.length + 1)), encoding: match[2]!.toLowerCase() as "gz" | "br" };
}

/** Decompression selection is separate from admission. Reading a candidate loader
 * can identify Unity; only engineArchive may then admit its archive names. */
export function compressedBrowserAsset(path: string): { path: string; encoding: "gz" | "br" | "unityweb" } | null {
  const asset = precompressedAsset(path);
  if (asset) return asset;
  if (/\.(?:js|wasm|data)\.unityweb$/i.test(path)) return { path: path.slice(0, -".unityweb".length), encoding: "unityweb" };
  return null;
}

/** names.py `collisions`: groups that differ only by Unicode composition, then groups
 *  that differ only by case once composition is settled. */
export function nameCollisions(paths: string[]): { normalisation: string[][]; case: string[][] } {
  const byNfc = new Map<string, Set<string>>();
  for (const path of paths) {
    const key = path.normalize("NFC");
    const group = byNfc.get(key) ?? new Set<string>();
    group.add(path);
    byNfc.set(key, group);
  }
  const normalisation = [...byNfc.values()].filter(group => group.size > 1).map(group => [...group].sort());
  const byFold = new Map<string, Set<string>>();
  for (const nfc of byNfc.keys()) {
    const key = canonicalName(nfc);
    const group = byFold.get(key) ?? new Set<string>();
    group.add(nfc);
    byFold.set(key, group);
  }
  const caseGroups = [...byFold.values()].filter(group => group.size > 1).map(group => [...group].sort());
  return { normalisation, case: caseGroups };
}

const quoted = (paths: string[]) => paths.map(path => `"${path}"`).join(" and ");
const visible = (path: string) => path.replace(CONTROL, char => `U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`)
  .replace(new RegExp(`[${BIDI_CONTROLS}]`, "g"), char => `U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`);

/** Every name the archive stage would refuse, as blockers, plus the key-length cap. */
export function nameFindings(paths: string[], engineIds: Iterable<string> = []): Finding[] {
  const ids = [...engineIds];
  const findings: Finding[] = [];
  const controls: string[] = [], bidi: string[] = [], nested: string[] = [], long: string[] = [];
  const encoder = new TextEncoder();
  for (const path of paths) {
    if (CONTROL.test(path)) controls.push(path);
    if ([...path].some(char => BIDI_CONTROLS.includes(char))) bidi.push(path);
    if (nestedArchiveExtension(path, ids)) nested.push(path);
    if (encoder.encode(path).byteLength > BUNDLE.pathBytesMax) long.push(path);
  }
  if (controls.length) findings.push({ code: "name-control", severity: "blocker",
    title: `${visible(controls[0]!)} has a control character in its name.`,
    detail: "Tools disagree about where a name with a control character ends. Rename the file, and any reference to it, using ordinary characters.",
    path: visible(controls[0]!), more: controls.slice(1).map(visible) });
  if (bidi.length) findings.push({ code: "name-bidi", severity: "blocker",
    title: `${visible(bidi[0]!)} has a text-direction character in its name.`,
    detail: "A direction override makes a name display as something it is not. Rename the file without it.",
    path: visible(bidi[0]!), more: bidi.slice(1).map(visible) });
  if (nested.length) findings.push({ code: "nested-archive", severity: "blocker",
    title: `${nested[0]} is an archive (${nestedArchiveExtension(nested[0]!, ids)}), and no matching engine reader is enabled.`,
    detail: "Unpack it into the folder before deploying. Engine archives require a recognised engine and an enabled inspector; other archives are refused.",
    path: nested[0], more: nested.slice(1) });
  if (long.length) findings.push({ code: "path-too-long", severity: "blocker",
    title: `${long[0]!.slice(0, 80)}... is longer than ${BUNDLE.pathBytesMax} bytes.`,
    detail: `A file's path inside the game, folders included, can be at most ${BUNDLE.pathBytesMax} bytes. Shorten the folder or file names.`,
    path: long[0], more: long.slice(1) });
  const collisions = nameCollisions(paths);
  for (const group of collisions.normalisation.slice(0, 4)) findings.push({ code: "unicode-collision", severity: "blocker",
    title: `${quoted(group)} are the same name written two ways.`,
    detail: "They differ only in how an accented letter is encoded, which macOS treats as one file and the servers that host the game treat as two. Keep one of them.",
    path: group[0], more: group.slice(1) });
  for (const group of collisions.case.slice(0, 4)) findings.push({ code: "case-collision", severity: "blocker",
    title: `${quoted(group)} differ only in capital letters.`,
    detail: "macOS and Windows hold them as one file, so which one a player gets would depend on who unpacked the game last. Rename or remove one, and fix the references to it.",
    path: group[0], more: group.slice(1) });
  return findings;
}
