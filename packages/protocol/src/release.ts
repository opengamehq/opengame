import type { EngineMetadata, BuildMetadata } from "./engine";
import type { GameManifest } from "./manifest";

export type ReceiptState = "passed" | "failed" | "inconclusive" | "not run" | "provider unavailable";
export type CheckGroup = "safety" | "eligibility" | "quality";

export interface CheckReceipt {
  id: string;
  attemptId: string | null;
  releaseId: string;
  bundleHash: string;
  check: string;
  checkVersion: string;
  providerVersion: string;
  policyVersion: string;
  state: ReceiptState;
  evidence: Record<string, unknown>;
  createdAt: string;
}

// Read the head together with its immutable attempt. A receipt without that
// selection is history, even when its timestamp is newer or its state is passed.
export interface CheckSelection {
  releaseId: string;
  bundleHash: string;
  policyVersion: string;
  check: string;
  checkVersion: string;
  providerVersion: string;
  attemptId: string;
}

export interface Release {
  engine?: EngineMetadata | null;
  build?: BuildMetadata | null;
  id: string;
  gameId: string;
  buildId: string;
  bundleHash: string;
  manifest: GameManifest;
  metadataRevision: number;
  packagingContract: string;
  runtimeContract: string;
  receiptContract: string;
  receiptPolicyVersion: string;
  createdAt: string;
  deletionClaimedAt: string | null;
  bytesDeletedAt: string | null;
}

export interface CheckRequirement { check: string; version: string; group: CheckGroup }

const LEGACY_DEPLOY_CHECKS: readonly CheckRequirement[] = [
  { check: "archive", version: "1", group: "safety" },
  { check: "malware", version: "1", group: "safety" },
  { check: "secrets", version: "1", group: "safety" },
  { check: "images", version: "1", group: "safety" },
  { check: "preflight", version: "1", group: "eligibility" },
  { check: "engine", version: "1", group: "eligibility" },
  { check: "desktop", version: "1", group: "eligibility" },
];

export const DEPLOY_CHECKS: readonly CheckRequirement[] = [
  ...LEGACY_DEPLOY_CHECKS,
  { check: "text-policy", version: "1", group: "safety" },
];

export const SUBMIT_CHECKS: readonly CheckRequirement[] = [
  ...DEPLOY_CHECKS,
  { check: "boot", version: "1", group: "eligibility" },
  { check: "network", version: "1", group: "eligibility" },
  { check: "jev", version: "1", group: "quality" },
  { check: "playtest", version: "1", group: "quality" },
];

// Add a new entry for a new contract. Changing an existing entry would change
// which receipts a previously checked release needs.
//
// These lists describe; they do not decide. The database decides: finalize grants a
// preview, and submit-review's decision engine decides publication. A function here
// once evaluated them too, with no caller, and it was the one that disagreed: under
// contract 3 it demanded a passed text-policy receipt that shadow mode never writes,
// so every contract-3 release would have been refused publication for good. It was
// deleted rather than fixed, because two gates for one rule is how the weaker one
// ends up on a path nobody re-reads.
export const RECEIPT_CONTRACTS: Readonly<Record<string, { preview: readonly CheckRequirement[]; publish: readonly CheckRequirement[] }>> = {
  "1": { preview: LEGACY_DEPLOY_CHECKS, publish: SUBMIT_CHECKS.filter(check => check.check !== "text-policy") },
  "2": { preview: DEPLOY_CHECKS, publish: SUBMIT_CHECKS },
  // Text questions run in shadow mode. A text-policy receipt is recorded with every
  // release in whatever state it reached, and neither a preview nor a publication
  // waits for it to pass: until its calibration does, every decision is a person's.
  "3": { preview: LEGACY_DEPLOY_CHECKS, publish: SUBMIT_CHECKS.filter(check => check.check !== "text-policy") },
};

/** The checks a release's receipt contract asks of a private preview. A deploy's
 * findings come from these and nothing else: submit-review and playtest write
 * their receipts on the same release, and those are not a deploy's to report.
 * A contract this code does not know has none (its deploy fails as ours). */
export function previewChecks(receiptContract: string | null | undefined): readonly CheckRequirement[] {
  return receiptContract && Object.hasOwn(RECEIPT_CONTRACTS, receiptContract) ? RECEIPT_CONTRACTS[receiptContract]!.preview : [];
}
