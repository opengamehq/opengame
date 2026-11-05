import limits from "../limits.values.json";
import { canonicalName } from "./unicode-casefold";
import { BUFFER_BYTES_MAX, CHUNK_BYTES_MAX, inventoryPath, type InventoryFile } from "./serving-inventory";

export const LARGE_ASSET_DELIVERY = "unity-assets-v1" as const;

/** One path shape a plan lets leave the boot archive: lowered in ASCII only, the path
 * starts with `prefix`, ends with one of `suffixes`, and has at least one character
 * between them. ASCII lowering is deliberate. JavaScript, Python and PostgreSQL each
 * lower U+212A KELVIN SIGN to `k` under some rules and not others, and a suffix such
 * as `.ktx` must mean the same bytes in all three readers.
 *
 * A rule may carry `exceptSuffixes` instead, which is how the engine-agnostic lane says
 * "anything but code": the path starts with `prefix`, is longer than it, and ends with
 * none of them. A rule with both lists, or neither, matches nothing, in all three
 * readers, so a typo in limits.json narrows a lane rather than opening it. */
export interface LargeAssetPathRule { prefix: string; suffixes?: readonly string[]; exceptSuffixes?: readonly string[] }

/** One external-asset plan kind: the engines a scan must detect to use it, the
 * limits.json object under `platform` that bounds it, and the path shapes it admits.
 * Admission never reads a runtime contract, so a second engine's lane is an entry in
 * `largeAssetPlans`. */
export interface LargeAssetPlanPolicy {
  engines: readonly string[]; limits: string; assetPaths: readonly LargeAssetPathRule[];
  /** Admit whatever the scan detects, or nothing, except `refusedEngines` (large-game-v1).
   * `engines` stays empty on such a plan, so a reader that has never heard of this key
   * refuses rather than admits. */
  anyEngine?: boolean;
  /** Engines an anyEngine plan refuses: those whose own plan asks for a statement or a
   * licence stamp, so naming the general lane is not a way round either. */
  refusedEngines?: readonly string[];
  /** How the CLI chooses the external files for a plan whose `assets` is "auto". Read by
   * nothing on the server: the server checks the plan it is sent, however it was chosen. */
  autoSplit?: { fileBytesMin: number };
  /** The account-level lane a person must turn on in the admin console before any byte
   * of this kind is admitted. Engine detection is routing, not admission: nothing inside
   * a bundle proves which engine made it, so the kinds that widen limits are admitted by
   * this grant. `statement` and `licenceStamp` are checks beside it; the stamp is a
   * string a forger can copy and is not a control. */
  grant?: string;
  /** The statement key the creator accepts when the upload begins (large-asset-statement.ts). */
  statement?: string;
  /** The engine whose licence stamp a boot .wasm must carry before the scan is ready.
   * A consistency check on an honest export, never an admission control: forgeable. */
  licenceStamp?: string;
}
export interface LargeAssetLimits {
  storedBytesMax: number; fileBytesMax: number; decodedBytesMax: number; fileCountMax: number;
  /** Boot files, external files and decoded members together. */
  combinedFileCountMax: number;
}
const plans = limits.platform.largeAssetPlans as Record<string, LargeAssetPlanPolicy>;
/** Every plan kind limits.json names, in its order. */
export const LARGE_ASSET_DELIVERIES: readonly string[] = Object.keys(plans).filter(kind => !kind.startsWith("_"));

export function largeAssetPlan(kind: unknown): LargeAssetPlanPolicy | null {
  return typeof kind === "string" && !kind.startsWith("_") && Object.hasOwn(plans, kind) ? plans[kind]! : null;
}

/** The limits one plan kind is held to. The Unity lane predates combinedFileCountMax
 * and keeps the ordinary bundle count for it, which is what it always enforced. */
export function largeAssetLimits(kind: unknown): LargeAssetLimits | null {
  const plan = largeAssetPlan(kind);
  if (!plan) return null;
  const policy = (limits.platform as unknown as Record<string, Partial<LargeAssetLimits> | undefined>)[plan.limits];
  if (!policy) return null;
  return { storedBytesMax: policy.storedBytesMax!, fileBytesMax: policy.fileBytesMax!, decodedBytesMax: policy.decodedBytesMax!,
    fileCountMax: policy.fileCountMax!, combinedFileCountMax: policy.combinedFileCountMax ?? limits.bundle.fileCountMax };
}

/** Bytes of each granted lane's external files an account may keep on top of
 * `platform.deploy.heldBytesPerAccountMax`, by plan kind, so a creator who keeps a lane game
 * can still deploy ordinary ones (20261027170500). Each kind is capped by its own limits:
 * `heldBytesPerAccountMax` where the kind sets one (the large-game lane's 24 GiB, two 12 GiB
 * releases), otherwise one game's worth, `storedBytesMax` (Kaigen's 4 GiB). Per kind, not the
 * largest across kinds, because every platform member holds Kaigen without a grant
 * (20261027160000), and a shared cap would hand them the large-game lane's allowance for
 * Kaigen files. Kinds without a grant are absent and earn nothing, because nobody decided to
 * let that account store more. Every caller that begins a deploy or reads usage sends this as
 * `laneHeldBytesPerAccountMax`. A request without it gets no lane credit at all, the rule
 * before 20261027170500, so a caller that forgets it is held to the plain allowance; the
 * database refuses caps that are present and malformed, and caps that leave out a kind the
 * account holds files of. A kind whose limits lack both numbers
 * gets NaN, which reaches the database as null and is refused rather than read as no limit. */
export function laneHeldBytes(planTable: Record<string, Pick<LargeAssetPlanPolicy, "limits" | "grant">>,
  platform: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(Object.entries(planTable)
    .filter(([kind, plan]) => !kind.startsWith("_") && plan.grant)
    .map(([kind, plan]) => {
      const policy = platform[plan.limits] as { storedBytesMax?: unknown; heldBytesPerAccountMax?: unknown } | undefined;
      return [kind, Number(policy?.heldBytesPerAccountMax ?? policy?.storedBytesMax)];
    }));
}
export const LANE_HELD_BYTES: Readonly<Record<string, number>> = laneHeldBytes(plans, limits.platform as unknown as Record<string, unknown>);

/** The first line of a plan's input digest: "opengame unity assets v1" for the Unity
 * lane, as it has always been, and the same rule for every kind after it. */
export function largeAssetInputHeader(kind: string): string {
  return `opengame ${kind.replaceAll("-", " ")}`;
}

/** Whether the scan's detected engines may use this plan kind. A missing kind or an
 * engine set that names none of the plan's engines is a no. An anyEngine plan says yes
 * to any set, the empty one included, that names none of its refusedEngines: every
 * detected engine counts there, not only the first, because a build that carries
 * Kaigen's runtime beside something else is still a Kaigen build. */
export function largeAssetPlanAdmits(kind: unknown, engines: Iterable<string>): boolean {
  const plan = largeAssetPlan(kind);
  if (!plan) return false;
  if (plan.anyEngine === true) {
    for (const engine of engines) if ((plan.refusedEngines ?? []).includes(engine)) return false;
    return true;
  }
  for (const engine of engines) if (plan.engines.includes(engine)) return true;
  return false;
}
export interface LargeAssetFile { path: string; sha256: string; byteSize: number }
export interface LargeAssetReceipt {
  schema: 1;
  /** The plan kind. Absent means unity-assets-v1, the only kind that existed before
   * this field, and that kind never names itself, so every receipt has exactly one
   * encoding. Every other kind must name itself: a receipt without the field is held
   * to the Unity limits, so a Kaigen-sized tree that lost it fails closed. */
  delivery?: string;
  inputDigest: string;
  storedBytes: number;
  decodedBytes: number;
  assetFiles: number;
}
export interface LargeAssetInventory {
  schema: 2;
  largeAssets: LargeAssetReceipt;
  files: (InventoryFile & { partition: "boot" | "asset" })[];
}
const hash = /^[0-9a-f]{64}$/;
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown, max: number): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max;

/** UTF-8 byte order matches the frozen SQL plan and the Python scanner. */
export function compareAssetPaths(left: string, right: string): number {
  const a = new TextEncoder().encode(left), b = new TextEncoder().encode(right);
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return a.length - b.length;
}

const asciiLower = (value: string) => value.replace(/[A-Z]/g, letter => letter.toLowerCase());

/** This is an admission filter, not evidence that the payload was inspected.
 * Executable boot files cannot escape their budget by changing partitions: no plan's
 * suffix list names a type a browser would run. */
export function isLargeAssetPath(value: unknown, kind: string = LARGE_ASSET_DELIVERY): value is string {
  const plan = largeAssetPlan(kind);
  if (!plan || !inventoryPath(value) || value.normalize("NFC") !== value || /[?#%:]/.test(value) || /^_og(?:\/|$)/i.test(value)) return false;
  const name = asciiLower(value);
  return plan.assetPaths.some(rule => largeAssetRuleMatches(rule, name));
}

/** One rule against a path already lowered in ASCII. large_assets.is_asset_path and
 * private.platform_large_asset_path_ok are the same function in Python and SQL. */
function largeAssetRuleMatches(rule: LargeAssetPathRule, name: string): boolean {
  if (typeof rule.prefix !== "string" || !name.startsWith(rule.prefix)) return false;
  const only = Array.isArray(rule.suffixes), except = Array.isArray(rule.exceptSuffixes);
  if (only === except) return false;
  if (only) return rule.suffixes!.some(suffix => name.endsWith(suffix) && name.length > rule.prefix.length + suffix.length);
  return name.length > rule.prefix.length && !rule.exceptSuffixes!.some(suffix => name.endsWith(suffix));
}

export function validateLargeAssetFiles(value: unknown, kind: string = LARGE_ASSET_DELIVERY): LargeAssetFile[] | null {
  const policy = largeAssetLimits(kind);
  if (!policy || !Array.isArray(value) || !value.length || value.length > policy.fileCountMax) return null;
  let total = 0;
  const seen = new Set<string>();
  const files: LargeAssetFile[] = [];
  const sizes = new Map<string, number>();
  for (const row of value) {
    if (!object(row) || Object.keys(row).some(key => !["path", "sha256", "byteSize"].includes(key)) ||
        !isLargeAssetPath(row.path, kind) || !integer(row.byteSize, policy.fileBytesMax) ||
        typeof row.sha256 !== "string" || !hash.test(row.sha256)) return null;
    const name = canonicalName(row.path);
    if (seen.has(name) || (files.length && compareAssetPaths(files[files.length - 1]!.path, row.path) >= 0) ||
        (sizes.has(row.sha256) && sizes.get(row.sha256) !== row.byteSize)) return null;
    seen.add(name); sizes.set(row.sha256, row.byteSize);
    total += row.byteSize;
    files.push({ path: row.path, sha256: row.sha256, byteSize: row.byteSize });
  }
  for (const name of seen) {
    const parts = name.split("/");
    for (let index = 1; index < parts.length; index++) if (seen.has(parts.slice(0, index).join("/"))) return null;
  }
  return total <= policy.storedBytesMax ? files : null;
}

/** The boot digest already commits to every canonical boot ZIP byte. Paths here
 * exclude line breaks, so this encoding is identical in SQL, Python and JS. The
 * header names the plan kind, so one boot archive and one asset list cannot stand
 * for two plans with different limits. */
export function largeAssetInputText(boot: { sha256: string; byteSize: number }, assets: readonly LargeAssetFile[],
  kind: string = LARGE_ASSET_DELIVERY): string {
  return `${largeAssetInputHeader(kind)}\n${boot.sha256} ${boot.byteSize}\n` +
    assets.map(file => `${file.sha256} ${file.byteSize} ${file.path}\n`).join("");
}

/** A shape check only. Serving authority comes from the signed preview receipt
 * or immutable version pointer; the scanner must bind this to the frozen plan. */
export function parseLargeAssetInventory(value: unknown): LargeAssetInventory | null {
  if (!object(value) || !object(value.largeAssets)) return null;
  const receipt = value.largeAssets;
  if (receipt.delivery !== undefined && (typeof receipt.delivery !== "string" || receipt.delivery === LARGE_ASSET_DELIVERY)) return null;
  const kind = receipt.delivery === undefined ? LARGE_ASSET_DELIVERY : receipt.delivery as string;
  const policy = largeAssetLimits(kind);
  if (!policy || value.schema !== 2 || !Array.isArray(value.files) ||
      !value.files.length || value.files.length > policy.combinedFileCountMax) return null;
  if (receipt.schema !== 1 || typeof receipt.inputDigest !== "string" || !hash.test(receipt.inputDigest) ||
      !integer(receipt.storedBytes, policy.storedBytesMax) || !integer(receipt.decodedBytes, policy.decodedBytesMax) ||
      Number(receipt.decodedBytes) < Number(receipt.storedBytes) ||
      !integer(receipt.assetFiles, policy.fileCountMax) || receipt.assetFiles === 0) return null;
  const files: LargeAssetInventory["files"] = [];
  const names = new Set<string>();
  let bootBytes = 0, assetBytes = 0, assetFiles = 0;
  for (const row of value.files) {
    if (!object(row) || !inventoryPath(row.path) || row.path.normalize("NFC") !== row.path || /[?#%:]/.test(row.path) ||
        !integer(row.bytes, row.partition === "asset" ? policy.fileBytesMax : limits.bundle.uncompressedBytesMax) ||
        typeof row.sha256 !== "string" || !hash.test(row.sha256) || !["boot", "asset"].includes(String(row.partition))) return null;
    const name = canonicalName(row.path);
    if (names.has(name)) return null;
    names.add(name);
    const file: LargeAssetInventory["files"][number] = {
      path: row.path, sha256: row.sha256, bytes: row.bytes, partition: row.partition as "boot" | "asset",
    };
    if (row.chunks !== undefined) {
      if (!Array.isArray(row.chunks) || !row.chunks.length || row.chunks.length > Math.ceil(file.bytes / CHUNK_BYTES_MAX) + 1) return null;
      let next = 0;
      for (const chunk of row.chunks) {
        if (!object(chunk) || chunk.offset !== next || !integer(chunk.bytes, CHUNK_BYTES_MAX) || chunk.bytes === 0 ||
            typeof chunk.sha256 !== "string" || !hash.test(chunk.sha256)) return null;
        next += chunk.bytes;
      }
      if (next !== file.bytes) return null;
      file.chunks = row.chunks as NonNullable<InventoryFile["chunks"]>;
    }
    if (file.bytes > BUFFER_BYTES_MAX && !file.chunks) return null;
    if (file.partition === "asset") {
      if (!isLargeAssetPath(file.path, kind)) return null;
      assetBytes += file.bytes; assetFiles++;
    } else bootBytes += file.bytes;
    files.push(file);
  }
  for (const name of names) {
    const parts = name.split("/");
    for (let index = 1; index < parts.length; index++) if (names.has(parts.slice(0, index).join("/"))) return null;
  }
  if (!files.some(file => file.path === "index.html" && file.partition === "boot") ||
      bootBytes > limits.bundle.uncompressedBytesMax || assetBytes !== receipt.storedBytes || assetFiles !== receipt.assetFiles) return null;
  return { schema: 2, largeAssets: receipt as unknown as LargeAssetReceipt, files };
}
