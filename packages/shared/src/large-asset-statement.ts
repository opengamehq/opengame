import { createHash } from "node:crypto";
import { largeAssetPlan } from "./large-assets";

/**
 * The statement a creator accepts in the request that begins a large-asset upload.
 *
 * Why it exists: engine detection is forgeable (a 105-byte wasm with the right import
 * names reads as Kaigen), so the lane cannot rest on what a bundle says it is. A person
 * stating that their agreement permits publication, recorded against their account with
 * the frozen plan before a byte is admitted, is one of the four things that bound it.
 * The per-release statement at submit (apps/web/src/lib/platform/certification.ts)
 * still applies to every release on top of this one.
 *
 * The words and the version rule are also in SQL
 * (private.platform_large_asset_statement, 20261023122000); the database answers
 * large_asset_statement_required to any other version, so the two cannot drift
 * silently. The version hashes the key, the exact sentences, our wording version and
 * the plan kind: rewording a sentence asks again, and one plan's acceptance is not
 * another's. This lives apart from large-assets.ts because og-games imports that file
 * and has no node:crypto.
 */
export interface LargeAssetStatement { key: string; version: string; statement: string; note: string; agreementVersion: string }

const STATEMENTS: Record<string, { statement: string; note: string; agreementVersion: string }> = {
  kaigen_publication: {
    statement: "My Kaigen agreement permits me to publish the Kaigen runtime in this build on OpenGame.",
    note: "Check your agreement before you accept. If it does not permit publication, do not upload this build.",
    agreementVersion: "kaigen-publication-1",
  },
};

/** The statement a plan kind asks for, or null for a kind that asks none (Unity). */
export function largeAssetStatement(kind: string): LargeAssetStatement | null {
  const key = (largeAssetPlan(kind) as { statement?: string } | null)?.statement;
  if (!key) return null;
  const words = STATEMENTS[key];
  if (!words) throw new Error(`No words for the large-asset statement ${key}.`);
  const version = createHash("sha256").update(JSON.stringify([key, words.statement, words.note, words.agreementVersion, kind]))
    .digest("hex").slice(0, 16);
  return { key, version, ...words };
}
