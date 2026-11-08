import test from "node:test";
import assert from "node:assert/strict";
import { KICKOFF_COPY } from "@opengame/shared/launch-clock";
import { cleanEnv, events, fakeApi, reply, spawnCli, tempDir, token } from "./shell";

/**
 * "OpenGame opens for creators on" the kickoff day before every command but version, help and signing in
 * (src/launch.ts). The suite skips the check everywhere else with
 * OPENGAME_TEST_SKIP_LAUNCH_CHECK, so every case here clears it and points the CLI at a
 * local API that answers GET /api/v1/status the way the site does.
 */
const env = (origin: string, extra: Record<string, string | undefined> = {}) =>
  cleanEnv({ OPENGAME_API_URL: origin, OPENGAME_TEST_SKIP_LAUNCH_CHECK: undefined, OPENGAME_CREDENTIAL_STORE: "file", ...extra });
const last = (stdout: string) => events(stdout).at(-1) as Record<string, unknown>;

test("shut, a local command says OpenGame is not launched and exits 7 without running", async () => {
  const api = await fakeApi((req, res) => { if (req.url === "/api/v1/status") reply(res, 200, { launched: false, access: null }); });
  const home = await tempDir("og-launch-");
  try {
    const run = await spawnCli(["init", home.dir, "--json"], { env: env(api.origin, { XDG_CONFIG_HOME: home.dir }) });
    assert.equal(run.code, 7, run.stdout + run.stderr);
    const error = last(run.stdout);
    assert.equal(error.code, "not_launched");
    /* The day the CLI opens, the jam's kickoff, a day after the site (the owner, 8 Nov 2026). */
    assert.equal(error.message, `OpenGame opens for creators on ${KICKOFF_COPY}.`);
    assert.equal(error.retry, "later");
    assert.deepEqual(api.seen.map(row => `${row.method} ${row.url}`), ["GET /api/v1/status"]);
    assert.equal(api.seen[0]!.headers.authorization, undefined, "a request with no login sent a credential");
  } finally { await api.close(); await home.remove(); }
});

test("our own people pass: the token is sent, and access true lets the command run", async () => {
  const api = await fakeApi((req, res) => {
    if (req.url === "/api/v1/status") reply(res, 200, { launched: false, access: req.headers.authorization === `Bearer ${token}` });
  });
  const home = await tempDir("og-launch-");
  try {
    const run = await spawnCli(["init", home.dir, "--json"], { env: env(api.origin, { XDG_CONFIG_HOME: home.dir, OPENGAME_TOKEN: token }) });
    assert.equal(run.code, 0, run.stdout + run.stderr);
    assert.equal(api.seen[0]!.headers.authorization, `Bearer ${token}`);
  } finally { await api.close(); await home.remove(); }
});

test("open, everybody passes", async () => {
  const api = await fakeApi((req, res) => { if (req.url === "/api/v1/status") reply(res, 200, { launched: true, access: null }); });
  const home = await tempDir("og-launch-");
  try {
    const run = await spawnCli(["init", home.dir, "--json"], { env: env(api.origin, { XDG_CONFIG_HOME: home.dir }) });
    assert.equal(run.code, 0, run.stdout + run.stderr);
  } finally { await api.close(); await home.remove(); }
});

test("a server that cannot be reached is the network error, never not launched", async () => {
  const api = await fakeApi();
  const origin = api.origin;
  await api.close();
  const home = await tempDir("og-launch-");
  try {
    const run = await spawnCli(["init", home.dir, "--json"], { env: env(origin, { XDG_CONFIG_HOME: home.dir }) });
    assert.equal(run.code, 5, run.stdout + run.stderr);
    assert.equal(last(run.stdout).code, "network");
  } finally { await home.remove(); }
});

test("a server too old to have the status route lets the command run", async () => {
  const api = await fakeApi();
  const home = await tempDir("og-launch-");
  try {
    const run = await spawnCli(["init", home.dir, "--json"], { env: env(api.origin, { XDG_CONFIG_HOME: home.dir }) });
    assert.equal(run.code, 0, run.stdout + run.stderr);
  } finally { await api.close(); await home.remove(); }
});

test("version, help and signing out never ask, and help --json lists exit 7", async () => {
  const api = await fakeApi((req, res) => { if (req.url === "/api/v1/status") reply(res, 200, { launched: false, access: null }); });
  const home = await tempDir("og-launch-");
  try {
    for (const args of [["version", "--json"], ["help", "--json"], ["logout", "--json"]]) {
      const run = await spawnCli(args, { env: env(api.origin, { XDG_CONFIG_HOME: home.dir }) });
      assert.notEqual(run.code, 7, `${args[0]} was refused before launch: ${run.stdout}`);
    }
    assert.ok(!api.seen.some(row => row.url === "/api/v1/status"), "a command that answers before launch asked the switch");
    const help = await spawnCli(["help", "--json"], { env: env(api.origin, { XDG_CONFIG_HOME: home.dir }) });
    const codes = (last(help.stdout).data as { exitCodes: { name: string; code: number }[] }).exitCodes;
    assert.deepEqual(codes.find(row => row.code === 7)?.name, "notLaunched");
  } finally { await api.close(); await home.remove(); }
});

test("the server's own not_launched on a creator route exits 7 too, not the auth exit", async () => {
  const api = await fakeApi((req, res) => {
    if (req.url === "/api/v1/status") return reply(res, 200, { launched: false, access: true });
    if (req.url?.startsWith("/api/v1/jams")) return reply(res, 403, { error: "not_launched", message: `OpenGame opens for creators on ${KICKOFF_COPY}.`, retry: "later" });
  });
  const home = await tempDir("og-launch-");
  try {
    const run = await spawnCli(["jams", "--json"], { env: env(api.origin, { XDG_CONFIG_HOME: home.dir, OPENGAME_TOKEN: token }) });
    assert.equal(run.code, 7, run.stdout + run.stderr);
    assert.equal(last(run.stdout).code, "not_launched");
  } finally { await api.close(); await home.remove(); }
});

test("a piped token is read once and serves both the check and the command", async () => {
  const api = await fakeApi((req, res) => {
    if (req.url === "/api/v1/status") return reply(res, 200, { launched: false, access: req.headers.authorization === `Bearer ${token}` });
    if (req.url?.startsWith("/api/v1/jams")) return reply(res, 200, { apiVersion: "1", jams: [], submissionDestination: { kind: "marketplace" } });
  });
  const home = await tempDir("og-launch-");
  try {
    const run = await spawnCli(["jams", "--json", "--token-stdin"], { env: env(api.origin, { XDG_CONFIG_HOME: home.dir }), stdin: token });
    assert.equal(run.code, 0, run.stdout + run.stderr);
    assert.ok(api.seen.filter(row => row.url?.startsWith("/api/v1/jams")).every(row => row.headers.authorization === `Bearer ${token}`), "the command lost the piped token to the check");
  } finally { await api.close(); await home.remove(); }
});

/* After entriesCloseAt the server says `deploysFrozen`, and `deploy` stops before it builds
   or uploads anything, with the shared sentence and exit 3. Other commands, and a dry run,
   carry on: the close refuses deploys, not reading your games. */
test("after the close, deploy stops on the server's word and nothing else does", async () => {
  const api = await fakeApi((req, res) => { if (req.url === "/api/v1/status") reply(res, 200, { launched: true, access: true, deploysFrozen: true }); });
  const home = await tempDir("og-launch-");
  try {
    const project = await tempDir("og-launch-project-");
    try {
      const init = await spawnCli(["init", project.dir, "--json"], { env: env(api.origin, { XDG_CONFIG_HOME: home.dir }) });
      assert.equal(init.code, 0, init.stdout + init.stderr);
      const run = await spawnCli(["deploy", project.dir, "--no-build", "--json"], { env: env(api.origin, { XDG_CONFIG_HOME: home.dir, OPENGAME_TOKEN: token }) });
      assert.equal(run.code, 3, run.stdout + run.stderr);
      const error = last(run.stdout);
      assert.equal(error.code, "entries_closed");
      assert.match(String(error.message), /^Entries closed on 18 December, 11:59 pm PT/);
      assert.equal(error.retry, "never");
      assert.deepEqual(api.seen.map(row => `${row.method} ${row.url}`).filter(line => !line.endsWith("/api/v1/status")), [],
        "a deploy after the close reached the API beyond the status route");
    } finally { await project.remove(); }
  } finally { await api.close(); await home.remove(); }
});

/* The day comes from the server's status when it reports one, so an owner hold past the
   kickoff is named rather than the day this release was built with. */
test("the not-launched sentence names the server's day, and the bundled one without it", async () => {
  const { notLaunchedMessage } = await import("../src/launch");
  const { COMMITTED_JAM_KICKOFF_AT } = await import("@opengame/shared/launch-clock");
  assert.equal(notLaunchedMessage(COMMITTED_JAM_KICKOFF_AT.toISOString()), `OpenGame opens for creators on ${KICKOFF_COPY}.`);
  assert.equal(notLaunchedMessage("2026-11-20T08:00:00Z"), "OpenGame opens for creators on 20 November.");
  for (const missing of [undefined, null, "soon", 7]) assert.equal(notLaunchedMessage(missing), `OpenGame opens for creators on ${KICKOFF_COPY}.`);
});
