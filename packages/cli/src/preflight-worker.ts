import { webcrypto } from "node:crypto";
import { inflateSync, inflateRawSync } from "node:zlib";
import { parentPort, workerData } from "node:worker_threads";
import { platformPreflight } from "@opengame/preflight/platform";
import { compressedTextReaders } from "@opengame/preflight/node-compression";
import { compressedBrowserAsset, type RawInflater } from "@opengame/preflight";

// Node 18 workers may not expose browser Web Crypto without a runtime flag.
if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", { value: webcrypto });

// Node 18 does not support DecompressionStream("deflate-raw"). Keep native
// decoding bounded and reject trailing input, just like compressedTextReaders.
const rawInflater: RawInflater = async (bytes, format, maximum) => {
  if (!Number.isSafeInteger(maximum) || maximum < 0) throw new Error("decoded_limit");
  const decoded = (format === "deflate" ? inflateSync : inflateRawSync)(bytes,
    { maxOutputLength: Math.max(1, maximum), info: true }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } };
  if (!Buffer.isBuffer(decoded.buffer) || decoded.engine.bytesWritten !== bytes.byteLength || decoded.buffer.byteLength > maximum) throw new Error("compressed_invalid");
  return decoded.buffer;
};

const port = parentPort!;
let sequence = 0;
const readers = new Map<number, { resolve: (value: string | Uint8Array) => void; reject: () => void }>();
port.on("message", (message: { id: number; text?: string; bytes?: Uint8Array }) => {
  const reader = readers.get(message.id);
  if (!reader) return;
  readers.delete(message.id);
  if (typeof message.text === "string") reader.resolve(message.text);
  else if (message.bytes instanceof Uint8Array) reader.resolve(message.bytes);
  else reader.reject();
});
try {
  const job = workerData as { files: { path: string; size: number }[]; externalPaths?: readonly string[]; externalDelivery?: string; manifestRequires?: unknown };
  const metadata = job.files;
  const ordinaryBytes = metadata.filter(file => !compressedBrowserAsset(file.path)).reduce((sum, file) => sum + file.size, 0);
  const decodedText = compressedTextReaders(() => ordinaryBytes);
  function read(index: number, bytes = false, length?: number) {
    return new Promise<string | Uint8Array>((resolve, reject) => {
      const id = ++sequence;
      readers.set(id, { resolve, reject: () => reject(new Error("unreadable")) });
      port.postMessage({ type: length ? "read-head" : bytes ? "read-bytes" : "read", index, id, ...(length ? { length } : {}) });
    });
  }
  const files = metadata.map((file, index) => {
    const bytes = async () => {
      const value = await read(index, true);
      if (!(value instanceof Uint8Array)) throw new Error("unreadable");
      return value;
    };
    const head = async (length: number) => {
      const value = await read(index, true, length);
      if (!(value instanceof Uint8Array)) throw new Error("unreadable");
      return value;
    };
    return { ...file, text: async () => String(await read(index)), bytes, head,
      decodedText: decodedText(file.path, file.size, bytes) };
  });
  port.postMessage({ type: "result", result: await platformPreflight(files, { inspectDecodedCredentials: true, rawInflater, externalPaths: job.externalPaths, externalDelivery: job.externalDelivery, manifestRequires: job.manifestRequires }) });
} catch {
  port.postMessage({ type: "error" });
}
port.close();
