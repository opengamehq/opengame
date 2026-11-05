import { createHash } from "node:crypto";
import type { RawRuntimeEvidence } from "./preflight";
import { LIMITS } from "@opengame/shared";

export type PackagedFile = { path: string; originalPath: string; sha256: string; bytes: number };
export type PackagingReceipt = {
  version: 1;
  packagingContract: string;
  treeSha256: string;
  files: PackagedFile[];
  dependencies: Record<string, unknown>[];
  /** Original parser paths and byte identity, never a generated shell claim. */
  rawRuntimes?: RawRuntimeEvidence[];
  changes: { kind: "root-stripped" | "excluded" | "dependency-localized"; path: string; destination?: string; originalSha256?: string; sha256?: string }[];
};

/** The staged artifact is a snapshot of the source bytes. Record paths and hashes
 * before ZIP compression so root removal is reversible and byte identity can be
 * checked without relying on ZIP timestamps or compressor output. */
export function packagingReceipt(snapshot: Map<string, Uint8Array>, include: string[], strippedRoot: string, excluded: string[], originalHashes = new Map<string, string>(), dependencies: Record<string, unknown>[] = [], rawRuntimes: RawRuntimeEvidence[] = []): PackagingReceipt {
  const files = [...include].sort().map(path => {
    const originalPath = strippedRoot + path, bytes = snapshot.get(originalPath);
    if (!bytes) throw new Error("A staged file is missing.");
    return { path, originalPath, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength };
  });
  const kept = new Set(files.map(file => file.originalPath));
  const removed = [...new Set([...excluded, ...snapshot.keys()].filter(path => !kept.has(path)))].sort();
  return {
    version: 1, packagingContract: LIMITS.platform.packagingContract,
    treeSha256: createHash("sha256").update(JSON.stringify(files.map(({ path, sha256, bytes }) => ({ path, sha256, bytes })))).digest("hex"),
    files, dependencies, ...(rawRuntimes.length ? { rawRuntimes: rawRuntimes.map(raw => ({ ...raw })) } : {}),
    changes: [...(strippedRoot ? [{ kind: "root-stripped" as const, path: strippedRoot, destination: "" }] : []),
      ...removed.map(path => ({ kind: "excluded" as const, path })),
      ...files.filter(file => originalHashes.has(file.originalPath) && originalHashes.get(file.originalPath) !== file.sha256)
        .map(file => ({ kind: "dependency-localized" as const, path: file.originalPath, originalSha256: originalHashes.get(file.originalPath)!, sha256: file.sha256 }))],
  };
}
