import limits from "../limits.browser.json";

/** A receipt describes bytes, never a transform to run while serving them. */
export interface InventoryChunk { offset: number; bytes: number; sha256: string }
export interface InventoryFile { path: string; bytes: number; sha256: string; chunks?: InventoryChunk[] }
/**
 * `objects: "sha256"` is a content-addressed inventory: every file is stored once in the
 * public bucket at `blobs/<sha256>` (blobKey), whatever version or game names it, and the
 * version's prefix holds only this inventory. Since 11 Nov 2026 a platform release is
 * published this way (packages/hosting/src/promote.ts, promoteBuildByPointer), so an update
 * copies only the files it changed and publishing is an inventory write. Absent, a file is
 * at `<prefix>/<path>`, as every version published before that day is.
 *
 * Safe to share across games because a blob is named by its own hash and og-games hashes
 * every byte it serves against the inventory row before releasing it: a blob holding
 * anything else fails closed for every version that names it, and it is never served as
 * another game's file, because which bytes a path gets is the inventory's word, and the
 * inventory is bound to the version by the pointer the database recorded.
 */
export interface ServingInventory { schema: 1; files: InventoryFile[]; objects?: "sha256" }
export interface ServingInventoryPointer { key: string; bytes: number; sha256: string }

/* Its own number since 27 Oct 2026. This read receiptBytesMax until a large-game build's
   inventory (World at War's 26,200 rows alone are about 4.4 MB) outgrew the 4 MiB that
   still bounds the readiness receipt. Every reader of a serving inventory, the hosting
   package's writer and og-games' reader alike, takes the bound from here. */
export const INVENTORY_BYTES_MAX = limits.platform.preview.inventoryBytesMax;
export const BUFFER_BYTES_MAX = limits.platform.preview.documentBufferBytesMax;
export const CHUNK_BYTES_MAX = limits.platform.incrementalUpload.chunkBytesMax;
const HASH = /^[0-9a-f]{64}$/;
export const BLOB_PREFIX = "blobs";
/** Where a content-addressed file is stored in the public bucket. */
export function blobKey(sha256: string): string {
  if (!HASH.test(sha256)) throw new Error("A blob key needs a SHA-256.");
  return `${BLOB_PREFIX}/${sha256}`;
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export function inventoryPath(path: unknown): path is string {
  return typeof path === "string" && new TextEncoder().encode(path).length <= limits.bundle.pathBytesMax &&
    !/[\\\x00-\x1f\x7f]/.test(path) && path.split("/").every(part => part !== "" && part !== "." && part !== "..");
}
export function validInventoryPointer(value: unknown, prefix: string): value is ServingInventoryPointer {
  return object(value) && value.key === `${prefix}.inventory.json` && typeof value.sha256 === "string" && HASH.test(value.sha256) &&
    Number.isSafeInteger(value.bytes) && Number(value.bytes) > 0 && Number(value.bytes) <= INVENTORY_BYTES_MAX;
}
/** Bounded chunks are contiguous and cover the complete stored representation. */
export function validInventoryChunks(value: unknown, bytes: number): value is InventoryChunk[] {
  if (!Array.isArray(value) || !value.length || value.length > Math.ceil(limits.bundle.uncompressedBytesMax / CHUNK_BYTES_MAX) + 1) return false;
  let next = 0;
  for (const chunk of value) {
    if (!object(chunk) || chunk.offset !== next || !Number.isSafeInteger(chunk.bytes) || Number(chunk.bytes) < 1 || Number(chunk.bytes) > CHUNK_BYTES_MAX ||
        typeof chunk.sha256 !== "string" || !HASH.test(chunk.sha256)) return false;
    next += Number(chunk.bytes);
  }
  return next === bytes;
}
export function parseInventory(value: unknown): ServingInventory | null {
  if (!object(value) || value.schema !== 1 || !Array.isArray(value.files) || !value.files.length || value.files.length > limits.bundle.fileCountMax) return null;
  // One addressing mode the reader knows, or none. Anything else is a writer this reader
  // has not met, and guessing which key it meant would serve the wrong object.
  if (value.objects !== undefined && value.objects !== "sha256") return null;
  const names = new Set<string>();
  let total = 0;
  const files: InventoryFile[] = [];
  for (const row of value.files) {
    if (!object(row) || !inventoryPath(row.path) || names.has(row.path) || !Number.isSafeInteger(row.bytes) || Number(row.bytes) < 0 ||
        typeof row.sha256 !== "string" || !HASH.test(row.sha256)) return null;
    const file: InventoryFile = { path: row.path, bytes: Number(row.bytes), sha256: row.sha256 };
    if (row.chunks !== undefined) {
      if (!validInventoryChunks(row.chunks, file.bytes)) return null;
      file.chunks = row.chunks;
    }
    if (file.bytes > BUFFER_BYTES_MAX && !file.chunks) return null;
    total += file.bytes;
    if (total > limits.bundle.uncompressedBytesMax) return null;
    names.add(file.path);
    files.push(file);
  }
  return value.objects === "sha256" ? { schema: 1, files, objects: "sha256" } : { schema: 1, files };
}
