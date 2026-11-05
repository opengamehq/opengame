// Release builds bundle this exact producer. Runtime acquisition never runs a
// package install script or substitutes a CDN file for transformed artifacts.
export { buildRuntime } from '../../scripts/build-engine-runtimes.mjs';
export { renderRuntimeShell } from '../../scripts/engine-runtimes/shells.mjs';
export { canonicalSourceJSON, sourceEntryDigest, sourceDistributions, validateSourceDistributionReceipt } from '../../scripts/engine-runtimes/source-distribution.mjs';
