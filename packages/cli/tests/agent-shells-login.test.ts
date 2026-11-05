import test from "node:test";
import assert from "node:assert/strict";
import { LIMITS } from "@opengame/shared";
import { cleanEnv, events, fakeApi, reply, spawnCli, tempDir, token } from "./shell";
import { routes } from "./agent-shells-sweep";

/* Login in an agent's shell. The rest of the agent-shell suite is agent-shells.test.ts, which says why. */

test("login in an agent's shell hands back the code at once instead of waiting on the person", async () => {
  let origin = "";
  const api = await fakeApi(routes(() => origin));
  origin = api.origin;
  const config = await tempDir("og-shell-login-");
  try {
    for (const marker of [{ CLAUDECODE: "1" }, { CODEX_THREAD_ID: "t" }, { CURSOR_AGENT: "1" }, { OPENCODE: "1" }, { AI_AGENT: "x" }]) {
      const env = cleanEnv({ OPENGAME_API_URL: origin, NO_PROXY: "127.0.0.1", XDG_CONFIG_HOME: config.dir, OPENGAME_CREDENTIAL_STORE: "file", ...marker });
      const run = await spawnCli(["login"], { env, stdin: "open", deadlineMs: 15_000 });
      assert.equal(run.hung, false, `${JSON.stringify(marker)}: login waited for approval inside an agent shell`);
      // Not signed in yet is not a success, so `opengame login && opengame deploy` stops.
      assert.equal(run.code, 3, run.stdout + run.stderr);
      assert.match(run.stdout, /BCDF-GHJK/);
      assert.match(run.stdout + run.stderr, /opengame login --continue/);
      const json = events((await spawnCli(["login", "--jsonl"], { env, stdin: "open", deadlineMs: 15_000 })).stdout);
      assert.equal(json.find(event => event.code === "device_approval")?.userCode, "BCDF-GHJK");
      assert.deepEqual([json.at(-1)!.type, json.at(-1)!.code, json.at(-1)!.next, json.at(-1)!.exitCode], ["error", "login_pending", "opengame login --continue", 3]);
    }
  } finally { await api.close(); await config.remove(); }
});

test("login --continue in an agent's shell polls for a short while, then keeps the code and says to run it again", async () => {
  let origin = "", approved = false;
  const api = await fakeApi((req, res) => {
    if (req.url === "/api/v1/auth/token" && approved) return reply(res, 200, { access_token: token });
    return routes(() => origin)(req, res);
  });
  origin = api.origin;
  const config = await tempDir("og-shell-continue-");
  try {
    const env = cleanEnv({ OPENGAME_API_URL: origin, NO_PROXY: "127.0.0.1", XDG_CONFIG_HOME: config.dir, OPENGAME_CREDENTIAL_STORE: "file", CLAUDECODE: "1" });
    await spawnCli(["login", "--jsonl"], { env, stdin: "open", deadlineMs: 15_000 });
    const waiting = await spawnCli(["login", "--continue", "--jsonl"], { env, stdin: "open", deadlineMs: LIMITS.platform.device.continueWaitSeconds * 1000 + 10_000 });
    assert.equal(waiting.hung, false, "login --continue waited for the person inside an agent shell");
    assert.ok(waiting.ms < LIMITS.platform.device.continueWaitSeconds * 1000 + 5_000, `${waiting.ms} ms`);
    const last = events(waiting.stdout).at(-1)!;
    assert.deepEqual([last.code, last.next, waiting.code], ["login_pending", "opengame login --continue", 3]);
    assert.match(String(last.message), /BCDF-GHJK/);
    // The same code is still waiting: once the person allows it, the next --continue signs in.
    approved = true;
    const done = await spawnCli(["login", "--continue", "--jsonl"], { env, stdin: "open", deadlineMs: LIMITS.platform.device.continueWaitSeconds * 1000 + 10_000 });
    assert.equal(done.code, 0, done.stdout + done.stderr);
    assert.equal(events(done.stdout).at(-1)!.type, "result");
    assert.equal(api.seen.filter(request => request.url === "/api/v1/auth/device").length, 1, "one device code for the whole login");
  } finally { await api.close(); await config.remove(); }
});

test("login refuses --wait with --no-wait before asking the server for a code", async () => {
  const api = await fakeApi();
  try {
    const run = await spawnCli(["login", "--wait", "--no-wait", "--jsonl"], { env: cleanEnv({ OPENGAME_API_URL: api.origin, NO_PROXY: "127.0.0.1", OPENGAME_CREDENTIAL_STORE: "file" }), stdin: "open" });
    assert.equal(run.code, 2);
    assert.equal(events(run.stdout).at(-1)!.code, "conflicting_flags");
    assert.equal(api.seen.length, 0);
  } finally { await api.close(); }
});
