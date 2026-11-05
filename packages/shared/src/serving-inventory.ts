import limits from "../limits.browser.json";

/** A receipt describes bytes, never a transform to run while serving them. */
export interface InventoryChunk { offset: number; bytes: number; sha256: string }
export interface InventoryFile { path: string; bytes: number; sha256: string; chunks?: InventoryChunk[] }
export interface ServingInventory { schema: 1; files: InventoryFile[] }
export interface ServingInventoryPointer { key: string; bytes: number; sha256: string }

/* Its own number since 27 Oct 2026. This read receiptBytesMax until a large-game build's
   inventory (World at War's 26,200 rows alone are about 4.4 MB) outgrew the 4 MiB that
   still bounds the readiness receipt. Every reader of a serving inventory, the hosting
   package's writer and og-games' reader alike, takes the bound from here. */
export const INVENTORY_BYTES_MAX = limits.platform.preview.inventoryBytesMax;
export const BUFFER_BYTES_MAX = limits.platform.preview.documentBufferBytesMax;
export const CHUNK_BYTES_MAX = limits.platform.incrementalUpload.chunkBytesMax;
const HASH = /^[0-9a-f]{64}$/;
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
  return { schema: 1, files };
}
