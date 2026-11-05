import { z } from "./zod";

// Identification describes the inspected export. A copied engine signature never
// grants compatibility, skips scanning or changes the release's runtime contract.
const detectedEngineSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().min(1),
  version: z.string().nullable(),
  evidence: z.string(),
});
export const engineMetadataSchema = detectedEngineSchema.extend({
  also: z.array(detectedEngineSchema),
  /** Null when the scanner did not measure threading; absence is not single-threaded. */
  threaded: z.boolean().nullable(),
});
export type EngineMetadata = z.infer<typeof engineMetadataSchema>;

export const buildMetadataSchema = z.object({
  compression: z.array(z.enum(["br", "gzip"])),
  /** Bytes stored for wasm files. Compressed bytes do not measure runtime memory. */
  wasmBytes: z.number().int().nonnegative(),
  largestFile: z.object({ path: z.string().min(1), bytes: z.number().int().nonnegative() }).nullable(),
  /** At least one asset basename contains an 8–64 character hexadecimal hash. */
  hashedFilenames: z.boolean(),
});
export type BuildMetadata = z.infer<typeof buildMetadataSchema>;

/** Shared by operation and game readers. Old releases have no observation, and
 * malformed observations must not make an otherwise readable game disappear. */
export function releaseEngineMetadata(row: { engine_evidence?: unknown; threaded?: unknown; build_info?: unknown } | null | undefined): {
  engine: EngineMetadata | null; build: BuildMetadata | null;
} {
  const evidence = row?.engine_evidence;
  const engine = engineMetadataSchema.safeParse(evidence && typeof evidence === "object" && !Array.isArray(evidence)
    ? { ...evidence, threaded: row?.threaded ?? null } : null);
  const build = buildMetadataSchema.safeParse(row?.build_info);
  return { engine: engine.success ? engine.data : null, build: build.success ? build.data : null };
}

/* The words for these facts, once. The game page, the creator's workspace and the
   review console each wrote their own until 22 Oct 2026, and three copies of
   "Brotli, Gzip" is how one of them ends up saying something the others do not. */

/** "Godot 4.4", or null when nothing was detected. */
export function engineLabel(engine: { name: string; version: string | null } | null | undefined): string | null {
  return engine ? [engine.name, engine.version].filter(Boolean).join(" ") : null;
}

/** Null is "not measured", which is different from "measured and absent". */
export function threadsLabel(threaded: boolean | null | undefined): string {
  return threaded == null ? "Unknown" : threaded ? "Detected" : "Not detected";
}

export function compressionLabel(compression: BuildMetadata["compression"]): string {
  return compression.length ? compression.map(value => value === "br" ? "Brotli" : "Gzip").join(", ") : "None detected";
}
