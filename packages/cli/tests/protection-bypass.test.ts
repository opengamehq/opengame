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
