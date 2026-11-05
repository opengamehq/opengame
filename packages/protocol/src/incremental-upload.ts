import { z } from "./zod";
import { BUNDLE, LIMITS } from "@opengame/shared/browser";
import { canonicalName } from "@opengame/shared/unicode-casefold";
import { isBundlePath, manifestSchema } from "./manifest";
import { deployProvisionalSchema, deploySourceSchema } from "./deploy-source";

export const incrementalFileSchema = z.strictObject({
  path: z.string().refine(isBundlePath, "Use a relative file path inside the game folder.")
    .refine(value => value.length <= BUNDLE.pathBytesMax && new TextEncoder().encode(value).byteLength <= BUNDLE.pathBytesMax, "The file path is too long."),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  byteSize: z.number().int().nonnegative().max(BUNDLE.fileBytesMax),
});
export type IncrementalFile = z.infer<typeof incrementalFileSchema>;
export const incrementalFilesSchema = z.array(incrementalFileSchema).min(1).max(BUNDLE.fileCountMax)
  .superRefine((files, ctx) => {
    // Refinement issues can be continuable in Zod. Do not build prefix keys for
    // a path or list already refused by the structural bounds above.
    if (files.length > BUNDLE.fileCountMax || files.some(file =>
      file.path.length > BUNDLE.pathBytesMax || !isBundlePath(file.path) || new TextEncoder().encode(file.path).byteLength > BUNDLE.pathBytesMax)) return;
    let bytes = 0;
    const sizes = new Map<string, number>();
    files.forEach((file, index) => {
      bytes += file.byteSize;
      if (index && files[index - 1]!.path >= file.path) ctx.addIssue({ code: "custom", path: [index, "path"], message: "Sort paths and include each path once." });
      if (sizes.has(file.sha256) && sizes.get(file.sha256) !== file.byteSize) ctx.addIssue({ code: "custom", path: [index], message: "One hash cannot have two sizes." });
      sizes.set(file.sha256, file.byteSize);
    });
    const paths = new Set(files.map(file => canonicalName(file.path)));
    if (paths.size !== files.length) ctx.addIssue({ code: "custom", message: "File paths must be distinct even when capitalization differs." });
    for (const file of files) {
      const parts = canonicalName(file.path).split("/");
      for (let index = 1; index < parts.length; index++) if (paths.has(parts.slice(0, index).join("/"))) ctx.addIssue({ code: "custom", message: "A file cannot also be a folder." });
    }
    if (bytes > BUNDLE.uncompressedBytesMax) ctx.addIssue({ code: "custom", message: "The files exceed the expanded-byte limit." });
  });

/** This format is deliberately stored, with no compressor or timestamp-dependent
 * output. The creator and assembler independently derive the same immutable ZIP. */
export function incrementalArchiveBytes(files: readonly Pick<IncrementalFile, "path" | "byteSize">[]): number {
  return 22 + files.reduce((sum, file) => sum + file.byteSize + 92 + 2 * new TextEncoder().encode(file.path).length, 0);
}
export const incrementalDeploySchema = z.strictObject({
  gameId: z.uuid().optional(), byteSize: z.number().int().positive().max(LIMITS.platform.incrementalUpload.archiveBytesMax),
  fileCount: z.number().int().positive().max(BUNDLE.fileCountMax), sha256: z.string().regex(/^[0-9a-f]{64}$/),
  manifest: manifestSchema.refine(value => value.build?.command === undefined, "Build commands stay on your machine."),
  metadataRevision: z.number().int().positive().nullable().default(null), metadata: z.enum(["preserve", "local"]).default("preserve"),
  files: incrementalFilesSchema,
  source: deploySourceSchema.optional(),
  provisional: deployProvisionalSchema.optional(),
}).superRefine((value, ctx) => {
  if (value.fileCount !== value.files.length || value.byteSize !== incrementalArchiveBytes(value.files)) ctx.addIssue({ code: "custom", message: "The archive size and file count must match the canonical file manifest." });
});

function record(size: number, signature: number): { bytes: Uint8Array; view: DataView } {
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, signature, true);
  return { bytes, view };
}
export function incrementalZipLocalHeader(path: string): Uint8Array {
  const name = new TextEncoder().encode(path);
  const { bytes, view } = record(30 + name.length, 0x04034b50);
  view.setUint16(4, 20, true); view.setUint16(6, 0x808, true); view.setUint16(12, 33, true);
  view.setUint16(26, name.length, true); bytes.set(name, 30); return bytes;
}
export function incrementalZipDescriptor(crc32: number, size: number): Uint8Array {
  const { bytes, view } = record(16, 0x08074b50);
  view.setUint32(4, crc32, true); view.setUint32(8, size, true); view.setUint32(12, size, true); return bytes;
}
export function incrementalZipCentralHeader(path: string, crc32: number, size: number, offset: number): Uint8Array {
  const name = new TextEncoder().encode(path);
  const { bytes, view } = record(46 + name.length, 0x02014b50);
  view.setUint16(4, 20, true); view.setUint16(6, 20, true); view.setUint16(8, 0x808, true);
  view.setUint16(14, 33, true); view.setUint32(16, crc32, true); view.setUint32(20, size, true);
  view.setUint32(24, size, true); view.setUint16(28, name.length, true); view.setUint32(42, offset, true);
  bytes.set(name, 46); return bytes;
}
export function incrementalZipEnd(count: number, size: number, offset: number): Uint8Array {
  const { bytes, view } = record(22, 0x06054b50);
  view.setUint16(8, count, true); view.setUint16(10, count, true);
  view.setUint32(12, size, true); view.setUint32(16, offset, true); return bytes;
}
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); return crc;
});
export function incrementalCrc32(chunk: Uint8Array, previous = 0): number {
  let crc = previous ^ 0xffffffff;
  for (const byte of chunk) crc = CRC_TABLE[(crc ^ byte) & 255]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
