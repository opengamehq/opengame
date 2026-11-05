import test from "node:test";
import assert from "node:assert/strict";
import { sweep } from "./agent-shells-sweep";

/* The sweep inside two of the four agents' shells, a file of its own so node runs it beside the other two. The rest of the agent-shell suite is agent-shells.test.ts, which says why. */

test("the same holds inside Claude Code and Codex, by their own markers", async () => {
  for (const marker of [{ CLAUDECODE: "1" }, { CODEX_SANDBOX: "seatbelt" }]) {
    assert.deepEqual(await sweep("json", marker), [], JSON.stringify(marker));
  }
});
