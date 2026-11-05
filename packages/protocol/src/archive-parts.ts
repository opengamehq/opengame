import { z } from "./zod";

/**
 * An archive deploy sent to storage in parts (platform.deploy.multipart in limits.json).
 *
 * The server decides the part size when it starts the upload and keeps it with the
 * operation; the CLI and Drop only cut the archive where it says. Every part is partBytes
 * long but the last, which is what R2 requires of a part list and what the server checks
 * before it completes one. These two functions are the one statement of where a part
 * starts and ends, so the signer, the completer and both clients cannot disagree about it.
 */
export function archivePartCount(byteSize: number, partBytes: number): number {
  return Math.ceil(byteSize / partBytes);
}

/** Part numbers start at 1, as R2's do. Zero for a number outside the list. */
export function archivePartBytes(byteSize: number, partBytes: number, partNumber: number): number {
  const count = archivePartCount(byteSize, partBytes);
  if (!Number.isSafeInteger(partNumber) || partNumber < 1 || partNumber > count) return 0;
  return partNumber < count ? partBytes : byteSize - partBytes * (count - 1);
}

/* R2's own bounds, not ours: ours are in limits.json and the server enforces them. A client
   holds an answer to these so a descriptor that cannot describe a real upload is refused
   before a byte is cut. */
const R2_PART_MIN = 5 * 1024 * 1024, R2_PART_MAX = 5 * 1024 ** 3, R2_PARTS_MAX = 10_000;

/** What POST /api/v1/deploys and POST /api/v1/operations/{id}/upload answer for an
 * operation that goes up in parts, in place of `upload`. `uploadedParts` are the part
 * numbers storage already holds at their right size, so a resumed upload sends the rest. */
export const archivePartsSchema = z.object({
  byteSize: z.number().int().positive(),
  partBytes: z.number().int().min(R2_PART_MIN).max(R2_PART_MAX),
  partCount: z.number().int().min(1).max(R2_PARTS_MAX),
  uploadedParts: z.array(z.number().int().min(1).max(R2_PARTS_MAX)).max(R2_PARTS_MAX),
}).refine(value => value.partCount === archivePartCount(value.byteSize, value.partBytes)
  && value.uploadedParts.every(part => part <= value.partCount), "The part list does not add up.");
export type ArchiveParts = z.infer<typeof archivePartsSchema>;

/** One signed part PUT. Send the part's bytes and nothing else: the URL names the upload
 * and the part number, and the length is signed. */
export const archivePartUploadSchema = z.object({
  partNumber: z.number().int().min(1).max(R2_PARTS_MAX),
  url: z.string(),
  headers: z.object({ "content-length": z.string().regex(/^[1-9][0-9]*$/) }),
  expiresInSeconds: z.number().int().positive(),
});
export type ArchivePartUpload = z.infer<typeof archivePartUploadSchema>;

/** The body of POST /api/v1/operations/{id}/upload/parts. */
export function archivePartsRequestSchema(partsPerRequestMax: number) {
  return z.strictObject({ parts: z.array(z.number().int().min(1).max(R2_PARTS_MAX)).min(1).max(partsPerRequestMax)
    .refine(parts => new Set(parts).size === parts.length, "Name each part once.") });
}
