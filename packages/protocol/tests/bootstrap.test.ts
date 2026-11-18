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

/* client-usage.ts: what platform_client_usage_daily keeps about the tool behind a token
   request. Each assertion is a way a header could put something into the table that the
   decision entry (2026-11-17-cli-sdk-usage.md) says it never holds. */
test("a request names its client, version and command only from the shared vocabulary", async () => {
  const { readClientUsage } = await import("../src/client-usage");
  const headers = (values: Record<string, string>) => new Headers(values);
  assert.deepEqual(readClientUsage(headers({ "x-opengame-client": "cli", "x-opengame-cli-version": "0.13.0", "x-opengame-cli-command": "deploy" })),
    { client: "cli", version: "0.13.0", command: "deploy" });
  assert.deepEqual(readClientUsage(headers({ "x-opengame-client": "cli", "x-opengame-cli-version": "0.13.0", "x-opengame-cli-command": "achievements:retire" })).command, "achievements:retire");
  // An unknown command, an argument smuggled into the name and a path are all `other`.
  for (const command of ["frobnicate", "deploy ./my-game", "achievements:retire:first-lap", "/home/me/game", "x".repeat(300)]) {
    assert.equal(readClientUsage(headers({ "x-opengame-client": "cli", "x-opengame-cli-version": "0.13.0", "x-opengame-cli-command": command })).command, "other", command);
  }
  // A CLI cannot claim an MCP tool, nor the MCP server a CLI command.
  assert.equal(readClientUsage(headers({ "x-opengame-client": "cli", "x-opengame-cli-command": "mcp:opengame_stats" })).command, "other");
  assert.equal(readClientUsage(headers({ "x-opengame-client": "mcp", "x-opengame-cli-command": "deploy" })).command, "other");
  assert.deepEqual(readClientUsage(headers({ "x-opengame-client": "mcp", "x-opengame-client-version": "0.3.0", "x-opengame-cli-version": "0.13.0", "x-opengame-cli-command": "mcp:opengame_stats" })),
    { client: "mcp", version: "0.3.0", command: "mcp:opengame_stats" });
});

test("an older CLI is cli-legacy, a bare token is api, and no header writes free text", async () => {
  const { readClientUsage } = await import("../src/client-usage");
  assert.deepEqual(readClientUsage(new Headers({ "x-opengame-cli-version": "0.12.0" })), { client: "cli-legacy", version: "0.12.0", command: "other" });
  assert.deepEqual(readClientUsage(new Headers()), { client: "api", version: "unknown", command: "other" });
  // A client name the server did not mint, including its own two words, is `api`.
  for (const client of ["cli-legacy", "api", "curl", "CLI; drop table"]) {
    assert.equal(readClientUsage(new Headers({ "x-opengame-client": client, "x-opengame-cli-version": "0.12.0" })).client, "api", client);
  }
  for (const version of ["latest", "1.2", "1.2.3; rm -rf", "1.2.3-" + "a".repeat(40), "99999.0.0"]) {
    assert.equal(readClientUsage(new Headers({ "x-opengame-client": "cli", "x-opengame-cli-version": version })).version, "unknown", version);
  }
  assert.equal(readClientUsage(new Headers({ "x-opengame-client": "cli", "x-opengame-cli-version": "0.13.0-rc.1" })).version, "0.13.0-rc.1");
});

test("the CLI names a command and its known subcommand, and nothing for a local one", async () => {
  const { cliUsageCommand, CLI_LOCAL_COMMANDS } = await import("../src/client-usage");
  assert.equal(cliUsageCommand("deploy", "./my-game"), "deploy");
  assert.equal(cliUsageCommand("deploy", undefined, true), null);
  assert.equal(cliUsageCommand("achievements", "retire"), "achievements:retire");
  assert.equal(cliUsageCommand("achievements", "first-lap"), "achievements");
  assert.equal(cliUsageCommand("jam", "withdraw"), "jam:withdraw");
  assert.equal(cliUsageCommand("stats", "5f2c9a1e"), "stats");
  assert.equal(cliUsageCommand("not-a-command", undefined), null);
  for (const local of CLI_LOCAL_COMMANDS) assert.equal(cliUsageCommand(local, "."), null, local);
});
