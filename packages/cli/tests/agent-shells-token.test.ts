import test from "node:test";
import assert from "node:assert/strict";
import { LIMITS } from "@opengame/shared";
import { cleanEnv, events, fakeApi, reply, spawnCli, token } from "./shell";
import { stdinWaitMs } from "../src/credentials";

/* The quiet period a real CLI waits out here. OPENGAME_TEST_STDIN_WAIT_MS shortens the 30 s
   limit for tests and can do nothing else (credentials.ts says why); the first test holds
   that, so a typo in the variable cannot quietly put the limit back or make it longer. */
const QUIET_MS = 3000;

test("the stdin wait is the limit unless a test shortens it, and nothing can lengthen it", () => {
  const before = process.env.OPENGAME_TEST_STDIN_WAIT_MS;
  try {
    const limit = LIMITS.platform.credentials.stdinWaitMs;
    for (const [value, expected] of [[undefined, limit], ["3000", 3000], [String(limit * 10), limit], ["0", limit], ["-5", limit], ["soon", limit], ["2.5", limit]] as const) {
      if (value === undefined) delete process.env.OPENGAME_TEST_STDIN_WAIT_MS; else process.env.OPENGAME_TEST_STDIN_WAIT_MS = value;
      assert.equal(stdinWaitMs(), expected, `OPENGAME_TEST_STDIN_WAIT_MS=${value}`);
    }
    assert.ok(limit > QUIET_MS, "the limit itself is limits.json's, and this file assumes it is longer than QUIET_MS");
  } finally { if (before === undefined) delete process.env.OPENGAME_TEST_STDIN_WAIT_MS; else process.env.OPENGAME_TEST_STDIN_WAIT_MS = before; }
});

/* --token-stdin in an agent's shell. The rest of the agent-shell suite is agent-shells.test.ts, which says why. */

test("--token-stdin gives up on a pipe that never sends a token, and says how to send one", async () => {
  const run = await spawnCli(["whoami", "--token-stdin", "--jsonl"], { stdin: "open", deadlineMs: QUIET_MS + 15_000,
    env: cleanEnv({ OPENGAME_API_URL: "http://127.0.0.1:9", NO_PROXY: "127.0.0.1", OPENGAME_TEST_STDIN_WAIT_MS: String(QUIET_MS) }) });
  assert.equal(run.hung, false, "whoami --token-stdin waited for ever on an open, silent stdin");
  const last = events(run.stdout).at(-1)!;
  assert.equal(last.code, "token_stdin");
  assert.equal(run.code, 2);
  assert.match(String(last.message), /OPENGAME_TOKEN|printf/);
  assert.match(String(last.message), /within 3 seconds/, "the message names the wait the CLI used");
  assert.ok(run.ms >= QUIET_MS, `gave up after ${run.ms} ms, before the quiet period`);
});

test("--token-stdin still reads a token that is piped in and then closed", async () => {
  const api = await fakeApi((req, res) => { if (req.url === "/api/v1/auth/me") reply(res, 200, { handle: "nightshift", ogNumber: 7, avatar: { seed: 1, palette: "ink" } }); });
  try {
    const run = await spawnCli(["whoami", "--token-stdin", "--jsonl"], { stdin: token + "\n", env: cleanEnv({ OPENGAME_API_URL: api.origin, NO_PROXY: "127.0.0.1" }) });
    assert.equal(run.code, 0, run.stdout + run.stderr);
    assert.equal(api.seen.at(-1)!.headers.authorization, `Bearer ${token}`);
  } finally { await api.close(); }
});
