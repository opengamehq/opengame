// 1 Nov 2026: with Node's 250 ms per-address connect window, a machine 230 to 570 ms from
// Cloudflare failed opengame vendor 5 times in 6 with "unexpected error".
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getDefaultAutoSelectFamilyAttemptTimeout, setDefaultAutoSelectFamilyAttemptTimeout } from "node:net";
import { LIMITS } from "@opengame/shared";
import { applyNetworkDefaults } from "../src/network";

test("the CLI waits connectAttemptTimeoutMs for each address, and never shortens a longer wait", () => {
  const before = getDefaultAutoSelectFamilyAttemptTimeout();
  try {
    setDefaultAutoSelectFamilyAttemptTimeout(250);
    applyNetworkDefaults();
    assert.equal(getDefaultAutoSelectFamilyAttemptTimeout(), LIMITS.platform.http.connectAttemptTimeoutMs);
    assert.ok(LIMITS.platform.http.connectAttemptTimeoutMs >= 2000);
    setDefaultAutoSelectFamilyAttemptTimeout(9000);
    applyNetworkDefaults();
    assert.equal(getDefaultAutoSelectFamilyAttemptTimeout(), 9000);
  } finally { setDefaultAutoSelectFamilyAttemptTimeout(before); }
});

test("the entry point applies it before any command runs", async () => {
  const source = await readFile(new URL("../src/cli.ts", import.meta.url), "utf8");
  const applied = source.indexOf("\napplyNetworkDefaults();"), started = source.indexOf("\nmain()");
  assert.ok(applied > 0 && applied < started);
});
