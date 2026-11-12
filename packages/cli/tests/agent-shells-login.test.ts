import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { LIMITS } from "@opengame/shared";
import { cleanEnv, events, fakeApi, reply, spawnCli, tempDir, token, type Handler } from "./shell";
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

/* A server paced the way platform_redeem_device paces a request: a poll before the time it
   last named is answered slow_down and stretches the interval by five seconds. On 11 Nov 2026
   each --continue started from the original interval and polled early, an agent running it as
   told stretched the pace past the code's expiry, and a login the person had allowed was
   never collected. `early` counts the polls that arrived before their time. */
function pacedApi(origin: () => string, state: { approved: boolean; early: number; polls: number; interval: number; next: number }) {
  const rest = routes(origin);
  const handler: Handler = (req, res) => {
    if (req.url !== "/api/v1/auth/token") return rest(req, res);
    state.polls++;
    if (Date.now() < state.next) {
      state.early++;
      state.interval += 5; state.next = Date.now() + state.interval * 1000;
      return reply(res, 400, { error: "slow_down", interval: state.interval });
    }
    state.next = Date.now() + state.interval * 1000;
    if (state.approved) return reply(res, 200, { access_token: token });
    return reply(res, 400, { error: "authorization_pending", message: "Waiting." });
  };
  return handler;
}

test("repeated --continue never polls before the server's next allowed time, so an allowed login is collected", { timeout: 60_000 }, async () => {
  let origin = "";
  const state = { approved: false, early: 0, polls: 0, interval: 5, next: 0 };
  const api = await fakeApi(pacedApi(() => origin, state));
  origin = api.origin;
  const config = await tempDir("og-shell-paced-");
  try {
    const env = cleanEnv({ OPENGAME_API_URL: origin, NO_PROXY: "127.0.0.1", XDG_CONFIG_HOME: config.dir, OPENGAME_CREDENTIAL_STORE: "file", CLAUDECODE: "1" });
    await spawnCli(["login", "--jsonl"], { env, stdin: "open", deadlineMs: 15_000 });
    const deadlineMs = LIMITS.platform.device.continueWaitSeconds * 1000 + 10_000;
    // Back to back, the way an agent runs it after each login_pending.
    for (let run = 0; run < 2; run++) {
      const waiting = await spawnCli(["login", "--continue", "--jsonl"], { env, stdin: "open", deadlineMs });
      assert.deepEqual([events(waiting.stdout).at(-1)!.code, waiting.code], ["login_pending", 3], waiting.stdout + waiting.stderr);
    }
    assert.equal(state.early, 0, `${state.early} of ${state.polls} polls arrived before the server's next allowed time`);
    assert.equal(state.interval, 5, "the server's pace grew");
    state.approved = true;
    const done = await spawnCli(["login", "--continue", "--jsonl"], { env, stdin: "open", deadlineMs });
    assert.equal(done.code, 0, done.stdout + done.stderr);
    assert.equal(events(done.stdout).at(-1)!.type, "result");
    assert.equal(state.early, 0);
  } finally { await api.close(); await config.remove(); }
});

test("--continue remembers a slow_down, and stops without polling when the next allowed poll is past its wait", { timeout: 40_000 }, async () => {
  let origin = "";
  const api = await fakeApi((req, res) => {
    // Whatever the timing, this server asks for twenty seconds.
    if (req.url === "/api/v1/auth/token") return reply(res, 400, { error: "slow_down", interval: 20 });
    return routes(() => origin)(req, res);
  });
  origin = api.origin;
  const config = await tempDir("og-shell-slowdown-");
  try {
    const env = cleanEnv({ OPENGAME_API_URL: origin, NO_PROXY: "127.0.0.1", XDG_CONFIG_HOME: config.dir, OPENGAME_CREDENTIAL_STORE: "file", CLAUDECODE: "1" });
    await spawnCli(["login", "--jsonl"], { env, stdin: "open", deadlineMs: 15_000 });
    const deadlineMs = LIMITS.platform.device.continueWaitSeconds * 1000 + 10_000;
    const polls = () => api.seen.filter(request => request.url === "/api/v1/auth/token").length;
    const first = await spawnCli(["login", "--continue", "--jsonl"], { env, stdin: "open", deadlineMs });
    assert.deepEqual([events(first.stdout).at(-1)!.code, first.code], ["login_pending", 3], first.stdout + first.stderr);
    assert.equal(polls(), 1, "one poll, then the twenty-second pace outlasts the wait");
    const saved = Object.values(JSON.parse(await readFile(join(config.dir, "opengame", "login-pending.json"), "utf8")) as Record<string, { interval: number; nextPollAt: string }>)[0];
    assert.equal(saved.interval, 20);
    assert.ok(Date.parse(saved.nextPollAt) - Date.now() > 10_000, saved.nextPollAt);
    // The next command starts from that pace rather than the original five seconds.
    const second = await spawnCli(["login", "--continue", "--jsonl"], { env, stdin: "open", deadlineMs });
    const last = events(second.stdout).at(-1)!;
    assert.deepEqual([last.code, last.next, second.code], ["login_pending", "opengame login --continue", 3], second.stdout + second.stderr);
    assert.equal(polls(), 1, "a poll went out before the server's next allowed time");
    assert.ok(second.ms < 5_000, `${second.ms} ms`);
    assert.match(String(last.message), /Not checked yet/);
    assert.match(String(last.message), /BCDF-GHJK/);
  } finally { await api.close(); await config.remove(); }
});

test("a --continue whose code another --continue collected does not write the pending login back", { timeout: 40_000 }, async () => {
  let origin = "", file = "";
  const api = await fakeApi((req, res) => {
    if (req.url === "/api/v1/auth/token") {
      // While this process waits for its answer, another --continue collects the token and
      // clears the pending login, as finishLogin does on success.
      writeFileSync(file, "{}", { mode: 0o600 });
      return reply(res, 400, { error: "authorization_pending", message: "Waiting." });
    }
    return routes(() => origin)(req, res);
  });
  origin = api.origin;
  const config = await tempDir("og-shell-collected-");
  file = join(config.dir, "opengame", "login-pending.json");
  try {
    const env = cleanEnv({ OPENGAME_API_URL: origin, NO_PROXY: "127.0.0.1", XDG_CONFIG_HOME: config.dir, OPENGAME_CREDENTIAL_STORE: "file", CLAUDECODE: "1" });
    await spawnCli(["login", "--jsonl"], { env, stdin: "open", deadlineMs: 15_000 });
    const waiting = await spawnCli(["login", "--continue", "--jsonl"], { env, stdin: "open", deadlineMs: LIMITS.platform.device.continueWaitSeconds * 1000 + 10_000 });
    assert.equal(waiting.code, 3, waiting.stdout + waiting.stderr);
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), {}, "the collected login was written back");
    // So the next --continue finds nothing waiting, rather than polling a spent code into login_expired.
    const next = await spawnCli(["login", "--continue", "--jsonl"], { env, stdin: "open", deadlineMs: 15_000 });
    assert.equal(events(next.stdout).at(-1)!.code, "no_pending_login", next.stdout + next.stderr);
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
