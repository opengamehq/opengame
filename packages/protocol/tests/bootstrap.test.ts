import test from "node:test";
import assert from "node:assert/strict";
import { bootstrapSchema, platformUsageSchema } from "../src/bootstrap";

const boot = { apiVersion: 1, minimumCliVersion: "0.1.0", packagingContract: 1,
  bundle: { archiveBytesMax: 1000, fileCountMax: 10 }, capabilities: { incrementalUpload: false } };
test("bootstrap keeps observed submission counts distinct from enforced rolling allowances", () => {
  const parsed = bootstrapSchema.parse({ ...boot, usage: {
    submissionsPerDay: { used: 3, max: null, remaining: null },
    playtestsPerDay: { used: 2, max: 10, remaining: 8, resetsAt: "2030-01-01T00:00:00Z" }, activeEntries: null,
  } });
  assert.equal(parsed.usage!.submissionsPerDay!.max, null);
  assert.equal(parsed.usage!.playtestsPerDay!.remaining, 8);
  assert.equal(parsed.capabilities!.incrementalUpload, false);
});
test("malformed usage cannot become an account quota or an upload capability", () => {
  assert.equal(platformUsageSchema.safeParse({ playtestsPerDay: { used: -1, max: 10 } }).success, false);
  assert.equal(platformUsageSchema.safeParse({ playtestsPerDay: { used: 1, max: "10" } }).success, false);
  assert.equal(bootstrapSchema.safeParse({ ...boot, capabilities: { incrementalUpload: "true" } }).success, false);
});
