import { z } from "./zod";

/** A null ceiling means this is an observed count, not an enforced allowance.
 * Reset times are the earliest rolling-window release, never a calendar reset. */
export const allowanceMeterSchema = z.object({
  used: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  max: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  remaining: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
  resetsAt: z.string().datetime({ offset: true }).nullable().optional(),
  jamSlug: z.string().nullable().optional(),
  jamName: z.string().nullable().optional(),
});
export type AllowanceMeter = z.infer<typeof allowanceMeterSchema>;
export const platformUsageSchema = z.record(z.string().min(1), allowanceMeterSchema.nullable());
export type PlatformUsage = z.infer<typeof platformUsageSchema>;

export const bootstrapSchema = z.object({
  apiVersion: z.union([z.number().int().positive(), z.string().min(1)]),
  minimumCliVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  packagingContract: z.union([z.number().int().positive(), z.string().min(1)]),
  bundle: z.object({ archiveBytesMax: z.number().int().positive(), fileCountMax: z.number().int().positive() }).passthrough(),
  platform: z.record(z.string(), z.unknown()).optional(),
  usage: platformUsageSchema.optional(),
  package: z.string().nullable().optional(),
  /* archiveParts: the server takes an archive in parts (POST /api/v1/deploys with
     multipart: true). Absent from every server before 4 Nov 2026, so a CLI sends one PUT to
     those, as it always did. */
  capabilities: z.object({ incrementalUpload: z.boolean(), archiveParts: z.boolean().optional() }).optional(),
});
export type Bootstrap = z.infer<typeof bootstrapSchema>;

/**
 * The one comparison of CLI versions: true when `current` is older than `minimum`. Both are
 * read as x.y.z from the front, so a pre-release suffix compares as its release and a missing
 * part counts as 0. The CLI asks it of the server's minimum; the server asks it of the
 * version a CLI names in `x-opengame-cli-version`, to decide what an older one is shown.
 * There were three copies, in the CLI, in the submission compatibility shim and in the
 * analytics gate, one of which read a pre-release header as no CLI at all.
 */
export function cliVersionOlder(current: string, minimum: string): boolean {
  const parse = (value: string) => value.split(".").map(part => Number.parseInt(part, 10));
  const a = parse(current), b = parse(minimum);
  for (let index = 0; index < 3; index++) {
    const left = Number.isFinite(a[index]) ? a[index]! : 0, right = Number.isFinite(b[index]) ? b[index]! : 0;
    if (left !== right) return left < right;
  }
  return false;
}

/** The version a request's CLI names, when it names one in the x.y.z shape; null for a browser,
 * Studio, a script or anything else that is not the CLI. */
export function sentCliVersion(headers: { get(name: string): string | null }): string | null {
  const sent = headers.get("x-opengame-cli-version")?.trim();
  return sent && /^\d+\.\d+\.\d+/.test(sent) ? sent : null;
}
