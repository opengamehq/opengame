import limits from "../limits.values.json";

/**
 * What a runtime contract grants a game document, by version.
 *
 * The version string used to carry this meaning by itself: "2027-01" meant isolated, and
 * eval, and the derived serving tree, and (by policy) external assets, and every reader
 * that needed one of those compared against the literal. A second contract that grants
 * only one of them would have had to be added at each of those comparisons, and the one
 * somebody missed would have answered "not isolated" for a game that needs it -- a black
 * frame with no error, which is the failure this repository keeps finding by playing.
 *
 * So the readers ask a question instead. The headers that deliver each power are still
 * written in two places, og-games' `contracts.ts` and the runner's `csp.py`, and
 * `npm run check:contracts` holds both to this table as well as to each other.
 */
export interface ContractCapabilities {
  /** COEP require-corp, Document-Isolation-Policy and `cross-origin-isolated=(self)`. */
  crossOriginIsolated: boolean;
  /** `'unsafe-eval'` in script-src. No receipt selects a contract that grants it. */
  unsafeEval: boolean;
  /** The pipeline rewrites the serving tree (host runtime, SDK, pinned runtimes). */
  derivedServingTree: boolean;
  /** How window.OpenGame reaches the game's documents. "derived": the derived tree carries
   *  the SDK tag (2027-01). "edge": og-games and the runner add `<script src="/_og/sdk.js">`
   *  to each document and answer that path from the verified SDK build (2027-02). "none":
   *  only what the game bundles itself. No mode changes the CSP: the tag is same-origin
   *  and the SDK has no eval (checked in infra/worker/test/platform-sdk.test.ts). */
  sdkInjection: "none" | "derived" | "edge";
  /** Set only to revoke a contract after the fact: every release pinned to it is then
   *  served, measured and played with this other contract's browser powers. Written here
   *  in the same change as a migration that sets runtime_contracts.revoked_at, and
   *  check:contracts fails if the two disagree. */
  revokedServeAs?: string;
  /** Any https: or wss: host, and scripts and media from any https: host, besides
   *  OpenGame's own (2027-03, 2027-04). What such a game still may not reach is
   *  `gamePolicy.blockedServices`, which the checks refuse because a CSP cannot. */
  openNetwork: boolean;
  /** `camera=(self)` rather than `camera=()`, and the site delegates `camera` to the frame
   *  (2027-05, 2027-06). Only an owner's named decision pins a version to one. The browser's
   *  answer is per site rather than per game, which is why only an owner opts a game in. */
  camera: boolean;
}
export type CapabilityTable = Record<string, ContractCapabilities>;

const table = limits.platform.runtimeContracts.versions as CapabilityTable;

export const RUNTIME_CONTRACT_VERSIONS: readonly string[] = Object.freeze(Object.keys(table));

/** The one contract a scan receipt can select, for a build that uses threads. */
export const THREADED_CONTRACT: string = limits.platform.runtimeContracts.threadedContract;

/** Where a release frozen on each contract goes when its scan saw threads: 2026-11 to
 *  2027-02, 2027-03 to 2027-04. The database states the same pairs (20261027170300). */
export const THREADED_MOVES: Readonly<Record<string, string>> = limits.platform.runtimeContracts.threadedMoves;

/**
 * The contract whose browser powers a release pinned to `version` gets today: itself, or
 * the contract its row was revoked to. Deprecation stops new releases reaching a contract;
 * revocation is the switch for the ones already on it. One step only, to a contract that
 * is not itself revoked, so a mistake in the table cannot loop or chain.
 */
export function servedContractVersion(version: unknown, source: CapabilityTable = table): string | null {
  if (typeof version !== "string" || !Object.hasOwn(source, version)) return null;
  const target = source[version]!.revokedServeAs;
  return target !== undefined && Object.hasOwn(source, target) && source[target]!.revokedServeAs === undefined ? target : version;
}

/** Null for a version this table does not know, which every caller treats as "grants nothing".
 *  A revoked contract answers with its target's browser powers; whether its bytes were
 *  derived stays its own, because a revocation cannot un-derive a tree. */
export function contractCapabilities(version: unknown, source: CapabilityTable = table): ContractCapabilities | null {
  const served = servedContractVersion(version, source);
  if (served === null) return null;
  const own = source[version as string]!;
  return served === version ? own : { ...source[served]!, derivedServingTree: own.derivedServingTree, revokedServeAs: served };
}

/** Whether a game on this contract expects a cross-origin isolated document, and so the isolated player. */
export function isolatedContract(version: unknown): boolean {
  return contractCapabilities(version)?.crossOriginIsolated === true;
}

/** Whether og-games adds the platform SDK to this contract's documents itself. */
export function edgeSdkContract(version: unknown): boolean {
  return contractCapabilities(version)?.sdkInjection === "edge";
}

/** Whether a game on this contract may reach hosts beyond OpenGame's own. */
export function openNetworkContract(version: unknown): boolean {
  return contractCapabilities(version)?.openNetwork === true;
}

/** Whether a game on this contract may ask for the camera, so its frame is given `camera`.
 *  False for a version this table does not know, like every other power here. */
export function cameraContract(version: unknown): boolean {
  return contractCapabilities(version)?.camera === true;
}

/** Whether og-games may serve this contract only through its version's exact serving inventory. */
export function derivedContract(version: unknown): boolean {
  return contractCapabilities(version)?.derivedServingTree === true;
}
