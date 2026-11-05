import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { LIMITS } from "@opengame/shared";
import { LARGE_ASSET_DELIVERY, largeAssetLimits, validateLargeAssetFiles, type LargeAssetFile } from "@opengame/shared/large-assets";
import { compressedBrowserAsset } from "./names";

/** A reader is scoped to one immutable tree. Decoded bytes use a separate
 * aggregate budget so one compressed asset cannot spend another asset's limit. */
export function compressedTextReaders(
  ordinaryBytes: (partition: "boot" | "asset") => number = () => 0,
  options: { externalAssets?: readonly LargeAssetFile[]; externalDelivery?: string } = {},
) {
  const delivery = options.externalDelivery ?? LARGE_ASSET_DELIVERY;
  const plan = options.externalAssets === undefined ? [] : validateLargeAssetFiles(options.externalAssets, delivery);
  const lane = largeAssetLimits(delivery);
  if (plan === null || !lane) throw new Error("external_assets_invalid");
  const external = new Map(plan.map(row => [row.path, row]));
  const decodedBytes = { boot: 0, asset: 0 };
  let failed = false;
  return (path: string, size: number, read: () => Promise<Uint8Array>) => {
    const asset = compressedBrowserAsset(path);
    if (!asset) return undefined;
    const source = external.get(path);
    const partition = source ? "asset" : "boot";
    if (source && source.byteSize !== size) throw new Error("external_assets_invalid");
    let cached: Promise<string> | undefined;
    let byteLength: number | undefined;
    const decodedReader = () => cached ??= (async () => {
      try {
        if (failed) throw new Error("decoded_limit");
        const bytes = await read();
        if (failed) throw new Error("decoded_limit");
        if (bytes.byteLength !== size) throw new Error("compressed_changed");
        const maximum = source ? lane.decodedBytesMax : LIMITS.bundle.uncompressedBytesMax;
        const ordinary = ordinaryBytes(partition);
        if (!Number.isSafeInteger(ordinary) || ordinary < 0) throw new Error("decoded_limit");
        const remaining = maximum - ordinary - decodedBytes[partition];
        if (remaining < 1) throw new Error("decoded_limit");
        const options = { maxOutputLength: Math.min(remaining, source ? lane.fileBytesMax : maximum,
          Math.max(1, Math.floor(bytes.byteLength * LIMITS.bundle.compressionRatioMax))), info: true };
        // Node returns both output and the engine when info is true. Its type
        // declarations still describe only the default Buffer return value.
        const gzip = asset.encoding === "gz" || (asset.encoding === "unityweb" && bytes[0] === 0x1f && bytes[1] === 0x8b);
        const result = (gzip ? gunzipSync(bytes, options) : brotliDecompressSync(bytes, options)) as unknown as {
          buffer: Buffer; engine: { bytesWritten: number };
        };
        if (!Buffer.isBuffer(result.buffer) || result.engine.bytesWritten !== bytes.byteLength ||
          result.buffer.byteLength / Math.max(1, bytes.byteLength) > LIMITS.bundle.compressionRatioMax) throw new Error("compressed_invalid");
        decodedBytes[partition] += result.buffer.byteLength;
        byteLength = result.buffer.byteLength;
        return /\.js$/i.test(asset.path) ? new TextDecoder("utf-8", { fatal: true }).decode(result.buffer) : result.buffer.toString("latin1");
      } catch (error) {
        // A failed native decode can already have allocated its entire cap.
        // Its output length is unavailable; do not grant that budget again.
        failed = true;
        throw error;
      }
    })();
    // Raw-runtime admission happens after the ordinary text pass. Expose only
    // its measured byte count so that pass can reserve the remaining shared
    // allowance without decoding again or guessing from UTF-8 string length.
    return Object.assign(decodedReader, { decodedByteLength: () => byteLength });
  };
}
