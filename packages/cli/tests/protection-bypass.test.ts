import test from "node:test";
import assert from "node:assert/strict";
import { MockAgent } from "undici";
import { Api, PROTECTION_BYPASS_ENV, protectionBypassHeader } from "../src/http";
import { CliError } from "../src/output";
import { cleanEnv, events, fakeApi, reply, spawnCli, tempDir, token } from "./shell";

/**
 * OPENGAME_VERCEL_PROTECTION_BYPASS, the way past Vercel's Deployment Protection for the launch
 * rehearsal (src/http.ts says why it exists). Three promises: it reaches the API origin on every
 * API request, it reaches nothing else, and it reaches only the rehearsal host, so never
 * opengame.io however it is spelled. And it is never printed, which every case below checks
 * against the output it produced.
 */
const SECRET = "Rehearsal0bypass1secret2value3AB";
const header = "x-vercel-protection-bypass";

function refusal(run: () => unknown): CliError {
  try { run(); } catch (error) { assert.ok(error instanceof CliError, String(error)); return error; }
  assert.fail("expected a refusal");
}

test("unset or empty sends nothing, wherever the CLI points", () => {
  assert.deepEqual(protectionBypassHeader("https://opengame.io", {}), {});
  assert.deepEqual(protectionBypassHeader("https://opengame.io", { [PROTECTION_BYPASS_ENV]: "" }), {});
  assert.deepEqual(protectionBypassHeader("https://example.vercel.app", {}), {});
});

test("set, it is sent to the rehearsal host, however it is spelled", () => {
  for (const origin of ["https://opengame-launch-rehearsal.vercel.app", "https://OPENGAME-Launch-Rehearsal.Vercel.App", "https://opengame-launch-rehearsal.vercel.app."]) {
    assert.deepEqual(protectionBypassHeader(origin, { [PROTECTION_BYPASS_ENV]: SECRET }), { [header]: SECRET }, origin);
  }
});

/* Until 5 Nov 2026 only opengame.io and its subdomains were refused and every other host got
   the secret, so `https://opengame.io.`, production with DNS's trailing dot, got it too
   (review of this lane). Now anything but the rehearsal host stops, before a request. */
test("set, every other origin is refused, other vercel.app hosts included, naming the variable and not its value", () => {
  for (const origin of ["https://opengame.io", "https://opengame.io.", "https://OPENGAME.IO.", "https://www.opengame.io", "https://admin.opengame.io",
    "https://opengame.gg", "https://notopengame.io", "https://vercel.app", "https://foo.vercel.app", "https://attacker.vercel.app", "https://x.opengame-launch-rehearsal.vercel.app", "https://foo.vercel.app.evil.example", "https://foovercel.app", "http://127.0.0.1:4590"]) {
    const error = refusal(() => protectionBypassHeader(origin, { [PROTECTION_BYPASS_ENV]: SECRET }));
    assert.equal(error.code, "api_origin", origin);
    assert.equal(error.exitCode, 2, origin);
    assert.match(error.message, new RegExp(`Unset ${PROTECTION_BYPASS_ENV} to use OpenGame\\. Nothing was sent\\.$`), origin);
    assert.ok(!error.message.includes(SECRET), origin);
  }
});

test("a value that is not a secret's shape is refused without being echoed", () => {
  for (const value of ["short", `${SECRET}\r\nx-other: 1`, `${SECRET} trailing`, "x".repeat(300)]) {
    const error = refusal(() => protectionBypassHeader("https://opengame-launch-rehearsal.vercel.app", { [PROTECTION_BYPASS_ENV]: value }));
    assert.equal(error.code, "api_origin");
    assert.ok(!error.message.includes(value), JSON.stringify(value));
  }
});

/* A preview on vercel.app cannot be served from this machine, so the network is undici's
   MockAgent standing in for the client's dispatcher: each request is built by the real
   `send` and the real upload, and only the network under them is replaced. Object storage
   is an HTTPS host of its own, as R2 is. */
test("the API gets it on every request, and the upload to object storage does not", async () => {
  const PREVIEW = "https://opengame-launch-rehearsal.vercel.app";
  const STORAGE = "https://bucket.storage.example";
  const agent = new MockAgent();
  agent.disableNetConnect();
  const api: Record<string, unknown>[] = [];
  const storage: Record<string, unknown>[] = [];
  agent.get(PREVIEW).intercept({ path: "/api/v1/status", method: "GET" })
    .reply(200, (request) => { api.push(request.headers as Record<string, unknown>); return { ok: true }; }).times(2);
  agent.get(STORAGE).intercept({ path: "/upload", method: "PUT" })
    .reply(200, (request) => { storage.push(request.headers as Record<string, unknown>); return ""; });
  const before = process.env[PROTECTION_BYPASS_ENV];
  process.env[PROTECTION_BYPASS_ENV] = SECRET;
  const client = new Api(PREVIEW);
  const real = (client as unknown as { dispatcher: { close(): Promise<void> } }).dispatcher;
  (client as unknown as { dispatcher: MockAgent }).dispatcher = agent;
  try {
    await client.json("/api/v1/status");
    await client.json("/api/v1/status");
    assert.equal(api.length, 2);
    for (const headers of api) assert.equal(headers[header], SECRET);
    const bytes = new Uint8Array([1, 2, 3]);
    await client.upload({ url: `${STORAGE}/upload`, headers: { "content-type": "application/zip", "if-none-match": "*", "content-length": "3" } }, bytes);
    assert.equal(storage.length, 1);
    assert.equal(storage[0]![header], undefined, "the bypass secret went to object storage");
  } finally {
    if (before === undefined) delete process.env[PROTECTION_BYPASS_ENV]; else process.env[PROTECTION_BYPASS_ENV] = before;
    await agent.close(); await real.close();
  }
});

/* The whole CLI, pointed at a host that is not on vercel.app with the variable set: it stops
   with exit 2 before a single request, says so, and prints nothing of the secret. A loopback
   server stands in for that host, so "nothing was sent" is counted, not assumed. */
test("opengame whoami pointed anywhere but vercel.app sends nothing and prints nothing of it", async () => {
  const api = await fakeApi((req, res) => {
    if (req.url === "/api/v1/auth/me") reply(res, 200, { handle: "rehearsal", ogNumber: 7, avatar: { seed: 1, palette: "ink" }, credential: { origin: "device" } });
  });
  const home = await tempDir("og-bypass-");
  try {
    const run = await spawnCli(["whoami", "--json"], { env: cleanEnv({ OPENGAME_API_URL: api.origin, OPENGAME_TOKEN: token, XDG_CONFIG_HOME: home.dir,
      OPENGAME_CREDENTIAL_STORE: "file", NO_PROXY: "127.0.0.1", no_proxy: "127.0.0.1", [PROTECTION_BYPASS_ENV]: SECRET }) });
    assert.equal(run.code, 2, run.stdout + run.stderr);
    const error = events(run.stdout).at(-1) as Record<string, unknown>;
    assert.equal(error.code, "api_origin");
    assert.match(String(error.message), /Nothing was sent\.$/);
    assert.equal(api.seen.length, 0, "a request reached a host that is not a Vercel preview");
    assert.ok(!run.stdout.includes(SECRET) && !run.stderr.includes(SECRET), "the secret was printed");
  } finally { await api.close(); await home.remove(); }
});

test("with the variable left set and no OPENGAME_API_URL, the CLI stops before it talks to opengame.io", async () => {
  const home = await tempDir("og-bypass-");
  try {
    const run = await spawnCli(["whoami", "--json"], { env: cleanEnv({ OPENGAME_TOKEN: token, XDG_CONFIG_HOME: home.dir,
      OPENGAME_CREDENTIAL_STORE: "file", [PROTECTION_BYPASS_ENV]: SECRET }) });
    assert.equal(run.code, 2, run.stdout + run.stderr);
    const error = events(run.stdout).at(-1) as Record<string, unknown>;
    assert.equal(error.code, "api_origin");
    assert.match(String(error.message), /Unset OPENGAME_VERCEL_PROTECTION_BYPASS/);
    assert.ok(!run.stdout.includes(SECRET) && !run.stderr.includes(SECRET), "the secret was printed");
  } finally { await home.remove(); }
});

/* The usage headers (src/http.ts setClientUsage, packages/protocol/src/client-usage.ts): the
   CLI names itself and the command on every API request, and never an argument. Run through
   the built CLI against a local API, so what is checked is what goes on the wire. */
test("every API request names the client and the command, and never an argument", async () => {
  const api = await fakeApi((req, res) => {
    if (req.url === "/api/v1/status") reply(res, 200, { launched: true });
    else if (req.url === "/api/v1/auth/me") reply(res, 200, { handle: "tester", ogNumber: 7, avatar: { seed: 0, palette: "paper" } });
  });
  const home = await tempDir("og-usage-");
  try {
    const env = cleanEnv({ OPENGAME_API_URL: api.origin, OPENGAME_TOKEN: token, XDG_CONFIG_HOME: home.dir, NO_PROXY: "127.0.0.1", no_proxy: "127.0.0.1" });
    const runs: [string[], string][] = [
      [["whoami", "--json"], "whoami"],
      [["jams", "secret-jam-slug", "--json"], "jams"],
      [["achievements", "retire", "first-lap-secret", "--game", "11111111-1111-4111-8111-111111111111", "--yes", "--json"], "achievements:retire"],
    ];
    for (const [args, command] of runs) {
      const before = api.seen.length;
      const run = await spawnCli(args, { env, cwd: home.dir });
      const sent = api.seen.slice(before).filter(request => request.url.startsWith("/api/v1/") && request.url !== "/api/v1/status");
      assert.ok(sent.length > 0, `${args[0]} made no API request: ${run.stdout}${run.stderr}`);
      // The launch check every command makes first is not one of the command's own requests.
      for (const check of api.seen.slice(before).filter(request => request.url === "/api/v1/status")) assert.equal(check.headers["x-opengame-cli-command"], undefined);
      for (const request of sent) {
        assert.equal(request.headers["x-opengame-client"], "cli", request.url);
        assert.equal(request.headers["x-opengame-cli-command"], command, request.url);
        assert.equal(request.headers["x-opengame-client-version"], undefined, "the CLI's version is x-opengame-cli-version");
        const headers = JSON.stringify(request.headers);
        for (const argument of args.slice(1)) if (!argument.startsWith("--") && argument !== "retire") assert.ok(!headers.includes(argument), `${argument} reached a header`);
      }
    }
  } finally { await api.close(); await home.remove(); }
});

test("a command that runs on this machine sends no command name, and asks nothing new", async () => {
  const api = await fakeApi((req, res) => { if (req.url === "/api/v1/status") reply(res, 200, { launched: true }); });
  const home = await tempDir("og-usage-local-");
  try {
    // The launch notice is the one request init and check make, and they made it before 0.13.0.
    const env = cleanEnv({ OPENGAME_API_URL: api.origin, OPENGAME_TOKEN: token, XDG_CONFIG_HOME: home.dir, OPENGAME_TEST_SKIP_LAUNCH_CHECK: undefined, NO_PROXY: "127.0.0.1", no_proxy: "127.0.0.1" });
    for (const args of [["check", home.dir, "--json"], ["init", home.dir, "--json"]]) {
      const before = api.seen.length;
      await spawnCli(args, { env, cwd: home.dir });
      const sent = api.seen.slice(before);
      assert.deepEqual(sent.map(request => request.url), ["/api/v1/status"], args[0]);
      assert.equal(sent[0]!.headers["x-opengame-client"], "cli");
      assert.equal(sent[0]!.headers["x-opengame-cli-command"], undefined, `${args[0]} named itself`);
    }
  } finally { await api.close(); await home.remove(); }
});

test("every command the CLI has is either named on the wire or listed as local", async () => {
  const { CLI_USAGE_COMMANDS, CLI_LOCAL_COMMANDS } = await import("@opengame/protocol");
  const help = (JSON.parse((await spawnCli(["help", "--json"])).stdout) as { data: { commands: Record<string, unknown> } }).data;
  const named = new Set(CLI_USAGE_COMMANDS.map(command => command.split(":")[0]));
  for (const command of Object.keys(help.commands)) {
    assert.ok(named.has(command) || (CLI_LOCAL_COMMANDS as readonly string[]).includes(command),
      `${command} is in neither list in packages/protocol/src/client-usage.ts, so the server would count it as other`);
  }
});
