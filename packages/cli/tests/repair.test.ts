import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, execFileSync, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { LIMITS } from "@opengame/shared";
import { receiptFindings, type GameManifest, type RepairFinding } from "@opengame/protocol";
import { Output } from "../src/output";
import { build } from "../src/deploy";
import { withProject } from "../src/project";
import { replyBootstrap, startupInformation } from "./bootstrap-fixture";

const run = promisify(execFile);
const binary = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
const manifest: GameManifest = { title: "Night shift", description: "Survive until dawn with a light and a dwindling battery.", genre: "shooter-survival", controls: ["keyboard"] };
const token = "ogt_" + "a".repeat(16) + "_" + "b".repeat(43);
const gameId = "44444444-4444-4444-8444-444444444444";
const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
type Handler = (req: IncomingMessage, res: ServerResponse, body: string) => boolean | void;

/** A local API that answers like the real routes: their codes, their messages,
 * Retry-After where the server sends it. Unhandled paths are a test failure. */
async function harness(handler: Handler) {
  const seen: { method: string; url: string; body: string; key?: string }[] = [];
  const server = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    seen.push({ method: req.method!, url: req.url!, body, key: req.headers["idempotency-key"] as string | undefined });
    res.setHeader("content-type", "application/json");
    if (handler(req, res, body) !== false && res.writableEnded) return;
    if (replyBootstrap(req, res, token)) return;
    if (req.url === "/api/v1/limits") { res.end(JSON.stringify(startupInformation())); return; }
    res.statusCode = 599; res.end(JSON.stringify({ error: "unhandled", message: `unhandled ${req.method} ${req.url}` }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const root = await mkdtemp(join(tmpdir(), "og-repair-"));
  const config = await mkdtemp(join(tmpdir(), "og-repair-config-"));
  await writeFile(join(root, "opengame.json"), JSON.stringify(manifest));
  await writeFile(join(root, "index.html"), "<!doctype html><title>Night shift</title>");
  const env: NodeJS.ProcessEnv = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1",
    XDG_CONFIG_HOME: config, OPENGAME_CREDENTIAL_STORE: "file" };
  // These pin what a deploy says about its outcome, which a plain deploy no longer stays
  // for since 28 Oct 2026, so a deploy here waits unless the test chose otherwise.
  const cli = async (...args: string[]) => {
    const wait = args[0] === "deploy" && !args.some(arg => ["--wait", "--no-wait", "--timeout", "--dry-run"].includes(arg)) ? ["--wait"] : [];
    try { const result = await run(process.execPath, [binary, ...args, ...wait, "--jsonl"], { env }); return { code: 0, events: lines(result.stdout) }; }
    catch (error) { const e = error as { code: number; stdout: string }; return { code: e.code, events: lines(e.stdout) }; }
  };
  const close = async () => {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true }); await rm(config, { recursive: true, force: true });
  };
  return { origin, root, env, seen, cli, close };
}
const lines = (text: string) => text.trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
const op = (n: number, state: string, extra: Record<string, unknown> = {}) => ({ id: id(n), state, gameId: state === "uploading" ? null : gameId,
  releaseId: state === "ready" ? id(90 + n) : null, error: null, ...extra });
const json = (res: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}) => {
  res.statusCode = status; for (const [k, v] of Object.entries(headers)) res.setHeader(k, v); res.end(JSON.stringify(value));
};
const finding = (over: Partial<RepairFinding> = {}): RepairFinding => ({ release: id(91), check: "secrets", checkVersion: "1", state: "failed",
  certainty: "certain", fault: "game", evidence: { observed: "src/keys.js line 3 contains what looks like an AWS key.", file: "src/keys.js:3" },
  fix: "Delete it, then rotate it.", verify: "opengame check, then opengame deploy", retry: "after-fix", ...over });

test("a refused deploy streams its findings and exits 1 with the first one attached", async () => {
  const h = await harness((req, res) => {
    if (req.url === "/api/v1/deploys") return json(res, 200, { operation: op(1, "failed", { error: "deploy_checks_failed", findings: [finding()],
      progress: { code: "failed", label: "Needs a fix", message: "A check refused this build.", waitingOn: "you", fault: "game" }, next: "opengame check" }), uploaded: true });
  });
  try {
    const { code, events } = await h.cli("deploy", h.root);
    assert.equal(code, 1);
    // Local preflight findings carry no release; the server's do.
    const streamed = events.filter(event => event.type === "finding" && event.finding.release !== null);
    assert.equal(streamed.length, 1);
    assert.equal(streamed[0].finding.evidence.file, "src/keys.js:3");
    const error = events.at(-1);
    assert.deepEqual([error.type, error.code, error.next, error.retry], ["error", "deploy_checks_failed", "opengame check", "after-fix"]);
    assert.equal(error.finding.check, "secrets");
    assert.match(error.message, /A check refused this upload/);
    assert.doesNotMatch(error.message, /upload page/);
  } finally { await h.close(); }
});

test("a refusal that is only our outage exits 5 and says the game is fine", async () => {
  // The findings come from the real mapper and the codes are the ones
  // pipeline-ready's finalize writes. An outage leaves its receipts "provider
  // unavailable" or "not run", never "failed", which the earlier fixture hid.
  const outage = receiptFindings([{ releaseId: id(91), check: "malware", checkVersion: "1", state: "provider unavailable", evidence: {} },
    { releaseId: id(91), check: "secrets", checkVersion: "1", state: "not run", evidence: {} }]);
  let reply: { error: string; findings: RepairFinding[] } = { error: "scan_exhausted", findings: outage };
  const h = await harness((req, res) => {
    if (req.url === "/api/v1/deploys") return json(res, 200, { operation: op(1, "failed", reply), uploaded: true });
  });
  try {
    for (const next of [{ error: "scan_exhausted", findings: outage }, { error: "scan_exhausted", findings: [] }, { error: "something_new", findings: outage }]) {
      reply = next;
      const { code, events } = await h.cli("deploy", h.root, "--idempotency-key", `outage-${next.error}-${next.findings.length}`);
      const error = events.at(-1);
      assert.equal(code, 5, JSON.stringify(error));
      assert.deepEqual([error.code, error.retry, error.next], [next.error, "later", "opengame deploy"]);
      assert.match(error.message, /does not need to change/);
      assert.doesNotMatch(error.message, /change what|Read the findings/);
      for (const event of events.filter(event => event.type === "finding" && event.finding.release)) assert.match(event.finding.fix, /^Nothing to change/);
    }
  } finally { await h.close(); }
});

// This said "a person has to look at it: exit 2, nothing to retry". The pipeline's
// receipt for the same code (20261005040180) says the opposite and is the authority:
// no clearance exists, so replacing the image is the only way forward.
test("an image the safety check held exits 1 and asks for a replacement", async () => {
  const h = await harness((req, res) => {
    if (req.url === "/api/v1/deploys") return json(res, 200, { operation: op(1, "failed", { error: "image_needs_review", findings: [] }), uploaded: true });
  });
  try {
    const { code, events } = await h.cli("deploy", h.root);
    assert.equal(code, 1);
    assert.deepEqual([events.at(-1).code, events.at(-1).retry, events.at(-1).next], ["image_needs_review", "after-fix", "opengame deploy"]);
    assert.match(events.at(-1).message, /Replace that image with a different one, then deploy again/);
    assert.doesNotMatch(events.at(-1).message, /for a person/);
  } finally { await h.close(); }
});

test("upgrade still runs when the server speaks a newer API, and every command checks the minimum CLI", async () => {
  let minimum: string | null = null;
  const h = await harness((req, res) => {
    if (minimum) res.setHeader("x-opengame-min-cli", minimum);
    if (req.url === "/api/v1/bootstrap") return json(res, 200, startupInformation({ apiVersion: "2", minimumCliVersion: "9.0.0", package: null }));
    if (req.url === "/api/v1/cli") return json(res, 200, { apiVersion: "2", minimumCliVersion: "9.0.0", package: null });
    if (req.url === `/api/v1/games/${gameId}`) return json(res, 200, { game: { id: gameId, publicId: "nightshift", title: "Night shift", visibility: "draft", latestOperation: null } });
  });
  try {
    const upgrade = await h.cli("upgrade");
    assert.equal(upgrade.code, 0, JSON.stringify(upgrade.events));
    assert.deepEqual([upgrade.events.at(-1).data.behind, upgrade.events.at(-1).data.minimum], [true, "9.0.0"]);
    assert.doesNotMatch(upgrade.events.at(-1).data.message, /Run opengame upgrade/);
    minimum = "9.0.0";
    assert.equal((await h.cli("upgrade")).code, 0);
    await withProject(h.root, h.origin, async (state, save) => { state.gameId = gameId; await save(); });
    const status = await h.cli("status", h.root);
    assert.deepEqual([status.code, status.events.at(-1).code, status.events.at(-1).next], [6, "upgrade_required", "opengame upgrade"]);
  } finally { await h.close(); }
});

test("deploy after --no-wait uploads the edits instead of re-reporting the previous build", async () => {
  const bodies: { key?: string; sha256: string; metadataRevision: number | null }[] = [];
  const h = await harness((req, res, body) => {
    if (req.url === "/api/v1/deploys") {
      bodies.push({ key: req.headers["idempotency-key"] as string, ...JSON.parse(body) });
      return json(res, 200, { operation: op(bodies.length, "queued"), uploaded: true });
    }
    // The first deploy's candidate has been prepared since: its revision is adopted.
    if (req.url === `/api/v1/operations/${id(1)}`) return json(res, 200, { operation: op(1, "checking", { metadata: { revision: 6, keptFields: [], source: "local" } }) });
    if (req.url === `/api/v1/operations/${id(2)}`) return json(res, 200, { operation: op(2, "checking") });
  });
  try {
    assert.equal((await h.cli("deploy", h.root, "--no-wait")).code, 0);
    await writeFile(join(h.root, "index.html"), "<!doctype html><title>Night shift</title><p>Now with a moon.");
    const second = await h.cli("deploy", h.root, "--no-wait");
    assert.equal(second.code, 0, JSON.stringify(second.events));
    assert.equal(bodies.length, 2);
    assert.notEqual(bodies[1]!.key, bodies[0]!.key);
    assert.notEqual(bodies[1]!.sha256, bodies[0]!.sha256);
    assert.equal(bodies[1]!.metadataRevision, 6);
    assert.ok(!second.events.some(event => event.code === "resuming_deploy"));
    // The same bytes again follow the deploy already checking them.
    const third = await h.cli("deploy", h.root, "--no-wait");
    assert.equal(bodies.at(-1)!.key, bodies[1]!.key);
    assert.ok(third.events.some(event => event.code === "resuming_deploy" && /already being checked/.test(event.message)));
  } finally { await h.close(); }
});

test("a watch rides out a few failed reads of a deploy that is still running", async () => {
  let reads = 0;
  const h = await harness((req, res) => {
    if (req.url === "/api/v1/deploys") return json(res, 200, { operation: op(1, "checking"), uploaded: true });
    if (req.url === `/api/v1/operations/${id(1)}`) {
      reads++;
      if (reads <= 2) return json(res, 503, { error: "temporarily_unavailable", message: "OpenGame could not finish this request. Try again shortly." });
      return json(res, 200, { operation: op(1, "ready", { publicId: "nightshift", previewUrl: "/g/nightshift" }) });
    }
  });
  try {
    const { code, events } = await h.cli("deploy", h.root);
    assert.equal(code, 0, JSON.stringify(events.at(-1)));
    assert.equal(events.at(-1).data.state, "ready");
    assert.equal(reads, 3);
  } finally { await h.close(); }
});

test("login in a folder that is already signed in succeeds without a new code", async () => {
  const deviceCode = "d".repeat(43);
  const h = await harness((req, res) => {
    if (req.url === "/api/v1/auth/device") return json(res, 200, { device_code: deviceCode, user_code: "BCDF-GHJK", verification_uri: `${h.origin}/cli`, expires_in: 600, interval: 5 });
    if (req.url === "/api/v1/auth/token") return json(res, 200, { access_token: token });
    if (req.url === "/api/v1/auth/me") return json(res, 200, { handle: "rishi", ogNumber: 7, avatar: { seed: 1, palette: "ember" }, credential: { origin: "device" } });
  });
  delete h.env.OPENGAME_TOKEN;
  try {
    // Pending is exit 3, not yet signed in; --continue finishes it.
    assert.equal((await h.cli("login", "--no-wait")).code, 3);
    assert.equal((await h.cli("login", "--continue")).code, 0);
    const again = await h.cli("login", "--no-wait");
    assert.equal(again.code, 0, JSON.stringify(again.events));
    assert.deepEqual([again.events.at(-1).data.signedIn, again.events.at(-1).data.handle, again.events.at(-1).data.next], [true, "rishi", null]);
    assert.equal(h.seen.filter(request => request.url === "/api/v1/auth/device").length, 1);
    assert.ok(!h.seen.some(request => request.url === "/api/v1/auth/logout"));
  } finally { await h.close(); }
});

// preview-serving made a removed tester a 403 not_member, and repair-loop's stale-login
// check only replaced a login on a 401, so the saved login blocked every new one.
test("a saved login for an account removed from the platform is replaced, not a dead end", async () => {
  const deviceCode = "d".repeat(43);
  let removed = false;
  const h = await harness((req, res) => {
    if (req.url === "/api/v1/auth/device") return json(res, 200, { device_code: deviceCode, user_code: "BCDF-GHJK", verification_uri: `${h.origin}/cli`, expires_in: 600, interval: 5 });
    if (req.url === "/api/v1/auth/token") return json(res, 200, { access_token: token });
    if (req.url === "/api/v1/auth/me") return removed
      ? json(res, 403, { error: "not_member", message: "This account does not have internal platform access." })
      : json(res, 200, { handle: "rishi", ogNumber: 7, avatar: { seed: 1, palette: "ember" }, credential: { origin: "device" } });
  });
  delete h.env.OPENGAME_TOKEN;
  try {
    assert.equal((await h.cli("login", "--no-wait")).code, 3);
    assert.equal((await h.cli("login", "--continue")).code, 0);
    removed = true;
    const again = await h.cli("login", "--no-wait");
    assert.equal(again.code, 3, JSON.stringify(again.events));
    assert.ok(again.events.some(event => event.type === "notice" && event.code === "stale_login"));
    assert.deepEqual([again.events.at(-1).code, again.events.at(-1).next], ["login_pending", "opengame login --continue"]);
    assert.equal(h.seen.filter(request => request.url === "/api/v1/auth/device").length, 2);
  } finally { await h.close(); }
});

// A suspended or deleted account used to reach the CLI as whatever the server guessed;
// it now has its own code, and a saved login for one is as stale as a removed tester's.
// So is one the moderators banned (account_banned), which since 20261029180000 is a
// non-member and so is refused even a read.
for (const [error, message, said] of [
  ["account_inactive", "This account is suspended or deleted, so it cannot use the platform.", /suspended or deleted/],
  ["account_banned", "OpenGame's moderators have banned this account.", /moderators have banned/],
  // /api/v1/auth/me asks the launch switch before membership, so not_launched arrives
  // here instead of not_member. login is allowed before launch; the saved account is not.
  ["not_launched", "OpenGame opens for creators on 18 November.", /not let in yet/],
] as const) test(`a saved login for an account refused as ${error} is replaced, and says why`, async () => {
  const deviceCode = "d".repeat(43);
  let closed = false;
  const h = await harness((req, res) => {
    if (req.url === "/api/v1/auth/device") return json(res, 200, { device_code: deviceCode, user_code: "BCDF-GHJK", verification_uri: `${h.origin}/cli`, expires_in: 600, interval: 5 });
    if (req.url === "/api/v1/auth/token") return json(res, 200, { access_token: token });
    if (req.url === "/api/v1/auth/me") return closed
      ? json(res, 403, { error, message })
      : json(res, 200, { handle: "rishi", ogNumber: 7, avatar: { seed: 1, palette: "ember" }, credential: { origin: "device" } });
  });
  delete h.env.OPENGAME_TOKEN;
  try {
    assert.equal((await h.cli("login", "--no-wait")).code, 3);
    assert.equal((await h.cli("login", "--continue")).code, 0);
    closed = true;
    const again = await h.cli("login", "--no-wait");
    assert.equal(again.code, 3, JSON.stringify(again.events));
    assert.equal(again.events.at(-1).code, "login_pending");
    const notice = again.events.find(event => event.type === "notice" && event.code === "stale_login");
    assert.match(notice?.message ?? "", said);
    assert.equal(h.seen.filter(request => request.url === "/api/v1/auth/device").length, 2);
  } finally { await h.close(); }
});

// An approval collected after its account stopped being a member is refused with the
// reason; only a bare access_denied is somebody pressing Deny in the browser.
test("a login refused because the approving account closed says so, not that it was denied", async () => {
  const deviceCode = "d".repeat(43);
  for (const [reason, said] of [["account_inactive", /suspended or deleted/], ["account_banned", /moderators have banned the account that approved/], ["not_member", /no longer has platform access/], ["handle_required", /has no handle\. Claim one on OpenGame/], [null, /denied in the browser/]] as const) {
    const h = await harness((req, res) => {
      if (req.url === "/api/v1/auth/device") return json(res, 200, { device_code: deviceCode, user_code: "BCDF-GHJK", verification_uri: `${h.origin}/cli`, expires_in: 600, interval: 5 });
      if (req.url === "/api/v1/auth/token") return json(res, 400, { error: "access_denied", ...(reason ? { reason } : {}) });
    });
    delete h.env.OPENGAME_TOKEN;
    try {
      assert.equal((await h.cli("login", "--no-wait")).code, 3);
      const refused = await h.cli("login", "--continue");
      assert.equal(refused.code, 3, JSON.stringify(refused.events));
      const error = refused.events.find(event => event.type === "error");
      assert.equal(error?.code, "access_denied");
      assert.match(error?.message ?? "", said);
    } finally { await h.close(); }
  }
});

test("a ready deploy prints the playable private preview", async () => {
  const h = await harness((req, res) => {
    if (req.url === "/api/v1/deploys") return json(res, 200, { operation: op(1, "ready", { publicId: "nightshift", previewUrl: "/g/nightshift", findings: [] }), uploaded: true });
  });
  try {
    const { code, events } = await h.cli("deploy", h.root);
    assert.equal(code, 0);
    const result = events.at(-1).data;
    assert.equal(result.previewUrl, `${h.origin}/g/nightshift`);
    assert.equal(result.done, true);
    assert.match(result.message, /^Private preview ready\. Play it at http:\/\/127\.0\.0\.1:\d+\/g\/nightshift$/);
  } finally { await h.close(); }
});

/* World at War's own game servers allowed https://waw.fun and answered the game's
   opengame.gg origin with a 403 (6 Nov 2026), and no screen a creator saw showed that
   origin. When an older server sends no gameOrigin, the CLI drops the line and the deploy
   still succeeds. */
test("a deploy names the origin the published game runs at, for the creator's own servers", async () => {
  let state = "ready", origin: unknown = "https://k3v9q2m7x4ab.opengame.gg";
  const h = await harness((req, res) => {
    if (req.url === "/api/v1/deploys") return json(res, 200, { operation: op(1, state, { publicId: "nightshift", previewUrl: state === "ready" ? "/g/nightshift" : null, findings: [],
      ...(origin === undefined ? {} : { gameOrigin: origin }) }), uploaded: true });
  });
  try {
    const line = "Once published, the game runs at https://k3v9q2m7x4ab.opengame.gg. If your own servers check Origin or send CORS headers, allow that exact origin, not a pattern on opengame.gg.";
    const ready = await h.cli("deploy", h.root);
    assert.equal(ready.code, 0, JSON.stringify(ready.events));
    assert.equal(ready.events.at(-1).data.gameOrigin, "https://k3v9q2m7x4ab.opengame.gg");
    assert.match(ready.events.at(-1).data.message, /^Private preview ready\. Play it at \S+\n/);
    assert.equal(ready.events.at(-1).data.message.split("\n").at(-1), line);
    state = "queued";
    const queued = await h.cli("deploy", h.root, "--no-wait", "--idempotency-key", "origin-queued");
    assert.equal(queued.code, 0, JSON.stringify(queued.events));
    assert.match(queued.events.at(-1).data.message, /^Uploaded\./);
    assert.equal(queued.events.at(-1).data.message.split("\n").at(-1), line);
    // With an older server, or a value this copy cannot read, the deploy succeeds without the line.
    for (const sent of [undefined, "http://k3v9q2m7x4ab.opengame.gg", "https://k3v9q2m7x4ab.opengame.gg/x", "https://k3v9q2m7x4ab.opengame.gg:8443"]) {
      state = "ready"; origin = sent;
      const old = await h.cli("deploy", h.root, "--idempotency-key", `origin-${String(sent).length}`);
      assert.equal(old.code, 0, JSON.stringify(old.events));
      assert.equal(old.events.at(-1).data.gameOrigin, null);
      assert.doesNotMatch(old.events.at(-1).data.message, /Once published/);
    }
  } finally { await h.close(); }
});

/* Review of #613: the server leaves previewUrl out for a ready release that is held,
   taken down or cleaned, and the game page used to stand in for it under "Play it at". */
test("a ready deploy with no playable preview says so and links the deploy's page", async () => {
  const h = await harness((req, res) => {
    if (req.url === "/api/v1/deploys") return json(res, 200, { operation: op(1, "ready", { publicId: "nightshift", previewUrl: null, findings: [] }), uploaded: true });
  });
  try {
    const { code, events } = await h.cli("deploy", h.root);
    assert.equal(code, 0);
    const result = events.at(-1).data;
    assert.equal(result.previewUrl, null);
    assert.equal(result.url, result.deploymentUrl);
    assert.doesNotMatch(result.message, /Play it at|\/g\/nightshift/);
    assert.match(result.message, /^Release ready, but the server sent no preview link\. Open \S+ to see why\.$/);
  } finally { await h.close(); }
});

/* A world, a decomp or a mod says so under the ready line; a game, the default, says
   nothing, which keeps the line above exactly as it was. When the website's kind was kept
   over the manifest's, the manifest is not what was deployed, so nothing is said either. */
test("a ready deploy of a mod says what it was deployed as, and sends the kind it declares", async () => {
  let kept = false;
  const h = await harness((req, res) => {
    if (req.url === "/api/v1/deploys") return json(res, 200, { operation: op(1, "ready", { publicId: "nightshift", previewUrl: "/g/nightshift", findings: [],
      ...(kept ? { metadata: { revision: 3, keptFields: ["kind", "basedOn"], source: "server" } } : {}) }), uploaded: true });
  });
  try {
    await writeFile(join(h.root, "opengame.json"), JSON.stringify({ ...manifest, kind: "mod", basedOn: "Doom" }));
    const { code, events } = await h.cli("deploy", h.root);
    assert.equal(code, 0, JSON.stringify(events));
    assert.match(events.at(-1).data.message, /^Private preview ready\. Play it at \S+\nDeployed as a mod of Doom\.$/);
    const sent = JSON.parse(h.seen.find(request => request.url === "/api/v1/deploys")!.body).manifest;
    assert.deepEqual([sent.kind, sent.basedOn], ["mod", "Doom"]);
    kept = true;
    await writeFile(join(h.root, "opengame.json"), JSON.stringify({ ...manifest, kind: "mod", basedOn: "Doom", tagline: "Now in blue" }));
    const again = await h.cli("deploy", h.root, "--idempotency-key", "kind-kept");
    assert.doesNotMatch(again.events.at(-1).data.message, /Deployed as/);
  } finally { await h.close(); }
});

test("a watch that runs out is not success: exit 5, done stays false, and the next command is named", async () => {
  const h = await harness((req, res) => {
    const checking = op(1, "checking", { progress: { code: "waiting", label: "Waiting on a check", message: "A checking service is unavailable. We will retry; you do not need to change your game.", waitingOn: "opengame", fault: "platform" } });
    if (req.url === "/api/v1/deploys") return json(res, 200, { operation: checking, uploaded: true });
    if (req.url === `/api/v1/operations/${id(1)}`) return json(res, 200, { operation: checking });
  });
  try {
    const { code, events } = await h.cli("deploy", h.root, "--timeout", "1");
    assert.equal(code, 5);
    assert.deepEqual([events.at(-1).code, events.at(-1).next, events.at(-1).retry], ["checks_pending", "opengame status --watch", "later"]);
    assert.ok(events.some(event => event.type === "progress" && event.stage === "waiting"));
    // Without waiting, a pending deploy is an honest exit 0 with done:false.
    const queued = await h.cli("deploy", h.root, "--no-wait", "--idempotency-key", "second");
    assert.equal(queued.code, 0);
    assert.deepEqual([queued.events.at(-1).data.done, queued.events.at(-1).data.next], [false, "opengame status --watch"]);
  } finally { await h.close(); }
});

test("an upload the server will never accept is closed and replaced, not resumed for ever", async () => {
  let creates = 0;
  const h = await harness((req, res) => {
    if (req.url === "/api/v1/deploys") {
      creates++;
      if (creates === 1) return json(res, 409, { error: "upload_expired", message: "This upload expired. Start a new deploy." });
      return json(res, 200, { operation: op(2, "queued"), uploaded: true });
    }
    if (req.url === `/api/v1/operations/${id(2)}/upload`) return json(res, 200, { operation: op(2, "queued") });
  });
  try {
    // A deploy saved earlier, never finished, now past its deadline.
    await withProject(h.root, h.origin, async (state, save) => {
      state.deploy = { key: "stale-key", operationId: id(1), terminal: false, request: { byteSize: 64, fileCount: 1, sha256: "a".repeat(64), manifest, metadataRevision: null, metadata: "preserve" } };
      await save();
    });
    const { code, events } = await h.cli("deploy", h.root, "--no-wait");
    assert.equal(code, 0, JSON.stringify(events));
    const keys = h.seen.filter(request => request.url === "/api/v1/deploys").map(request => request.key);
    assert.equal(keys[0], "stale-key");
    assert.notEqual(keys[1], "stale-key");
    assert.ok(events.some(event => event.code === "upload_restarted" && /This upload expired/.test(event.message)));
    const saved = JSON.parse(await readFile(join(h.root, ".opengame/project.json"), "utf8"));
    assert.equal(saved.deploy.terminal, false);
    assert.equal(saved.deploy.operationId, id(2));
  } finally { await h.close(); }
});

/* Review of mirror #7, 12 Nov 2026: a restart re-read the saved plan's paths as a Unity plan,
   the default, so a large-game plan deploy had chosen by itself could never be restarted:
   every retry said "Use an asset plan such as ..." to a creator who never named one. */
test("an expired upload of a large-game plan deploy chose is restarted with that plan", async () => {
  let creates = 0;
  const h = await harness((req, res) => {
    // A plan's deploy is created at its own route.
    if (req.url === "/api/v1/deploys/external-assets") {
      creates++;
      if (creates === 1) return json(res, 409, { error: "upload_expired", message: "This upload expired. Start a new deploy." });
      return json(res, 200, { operation: op(2, "queued"), uploaded: true });
    }
    if (req.url === `/api/v1/operations/${id(2)}/upload`) return json(res, 200, { operation: op(2, "queued") });
  });
  try {
    const { realpath } = await import("node:fs/promises");
    await writeFile(join(h.root, "level0.bin"), Buffer.alloc(4096, 7));
    const sourceRoot = await realpath(h.root);
    const { createHash } = await import("node:crypto");
    const { largeAssetInputText } = await import("@opengame/shared/large-assets");
    // The saved boot archive, which a resume reads and checks before it asks the server.
    const { canonicalArchive } = await import("../src/incremental");
    const saved = canonicalArchive([["index.html", Buffer.from("<!doctype html><title>Night shift</title>")]]).bytes;
    const sha256 = createHash("sha256").update(saved).digest("hex");
    await mkdir(join(h.root, ".opengame"), { recursive: true });
    await writeFile(join(h.root, ".opengame", `${sha256}.zip`), saved);
    const request = { byteSize: saved.byteLength, fileCount: 1, sha256, manifest, metadataRevision: null, metadata: "preserve" as const };
    const assets = [{ path: "level0.bin", byteSize: 4096, sha256: "c".repeat(64) }];
    const inputDigest = createHash("sha256").update(largeAssetInputText(request, assets, "large-game-v1")).digest("hex");
    await withProject(h.root, h.origin, async (state, save) => {
      state.deploy = { key: "stale-key", operationId: id(1), terminal: false, transport: "large-game-v1",
        unityAssets: { assets, inputDigest, sourceRoot, delivery: "large-game-v1" }, request };
      await save();
    });
    const { events } = await h.cli("deploy", h.root, "--no-wait");
    assert.ok(events.some(event => event.code === "upload_restarted"), JSON.stringify(events));
    assert.ok(!events.some(event => event.code === "unity_assets_plan"), JSON.stringify(events.at(-1)));
    assert.equal(creates, 2, JSON.stringify(events.at(-1)));
    const second = JSON.parse(h.seen.filter(request => request.url === "/api/v1/deploys/external-assets")[1]!.body);
    assert.equal(JSON.stringify(second).includes("large-game-v1"), true, JSON.stringify(second).slice(0, 400));
  } finally { await h.close(); }
});

test("a deploy the server refuses outright leaves nothing pending for status to misreport", async () => {
  const h = await harness((req, res) => {
    if (req.url === "/api/v1/deploys") return json(res, 403, { error: "forbidden", message: "This token was made without the Deploy permission." });
  });
  try {
    const refused = await h.cli("deploy", h.root, "--no-wait");
    assert.equal(refused.code, 3, JSON.stringify(refused.events));
    const saved = JSON.parse(await readFile(join(h.root, ".opengame/project.json"), "utf8"));
    assert.equal(saved.deploy.terminal, true);
    assert.equal(saved.deploy.operationId, undefined);
    const status = await h.cli("status", h.root);
    assert.notEqual(status.events.at(-1).code, "upload_pending", JSON.stringify(status.events.at(-1)));
  } finally { await h.close(); }
});

test("a deploy that never got an answer stays resumable with its key", async () => {
  let creates = 0;
  const h = await harness((req, res) => {
    if (req.url === "/api/v1/deploys") { creates++; return json(res, 429, { error: "deploy_rate_limited", message: "Wait.", retryAfterSeconds: 1 }, { "retry-after": "1" }); }
  });
  try {
    await h.cli("deploy", h.root, "--no-wait");
    const saved = JSON.parse(await readFile(join(h.root, ".opengame/project.json"), "utf8"));
    assert.notEqual(saved.deploy.terminal, true);
    assert.ok(creates >= 1);
  } finally { await h.close(); }
});

test("an explicit retry key on a dead upload names the way out instead of retrying it", async () => {
  const h = await harness((req, res) => {
    if (req.url === "/api/v1/deploys") return json(res, 429, { error: "upload_attempts_exhausted", message: "This upload has used its retry allowance. Start a new deploy." });
  });
  try {
    const { code, events } = await h.cli("deploy", h.root, "--idempotency-key", "mine");
    assert.equal(code, 2);
    assert.equal(events.at(-1).code, "upload_attempts_exhausted");
    assert.match(events.at(-1).message, /retry allowance.*new --idempotency-key/);
  } finally { await h.close(); }
});

test("server codes, messages and Retry-After reach the agent", async () => {
  const h = await harness((req, res) => {
    if (req.url === "/api/v1/deploys") return json(res, 429, { error: "deploy_rate_limited", message: "The hourly deploy allowance is used. The next one frees up in about 7 minutes.", retryAfterSeconds: 400 }, { "retry-after": "400" });
  });
  try {
    const { code, events } = await h.cli("deploy", h.root);
    assert.equal(code, 4);
    assert.deepEqual([events.at(-1).code, events.at(-1).retryAfterSeconds, events.at(-1).retry], ["deploy_rate_limited", 400, "later"]);
    assert.match(events.at(-1).message, /about 7 minutes/);
  } finally { await h.close(); }
});

test("a revoked environment token is an auth problem that names OPENGAME_TOKEN, not a missing API", async () => {
  const h = await harness((req, res) => {
    if (req.url === "/api/v1/bootstrap" || req.url === "/api/v1/limits") return json(res, 401, { error: "unauthorized", message: "Sign in to continue." });
  });
  try {
    const { code, events } = await h.cli("deploy", h.root);
    assert.equal(code, 3);
    assert.match(events.at(-1).message, /^OPENGAME_TOKEN is not valid or was revoked/);
  } finally { await h.close(); }
});

test("a second deploy sends the revision its first deploy synced, so local edits are not reverted", async () => {
  const bodies: Record<string, unknown>[] = [];
  let n = 0;
  const h = await harness((req, res, body) => {
    if (req.url === "/api/v1/deploys") {
      bodies.push(JSON.parse(body)); n++;
      return json(res, 200, { operation: op(n, "ready", { metadata: { revision: 3 + n, keptFields: [], source: "local" } }), uploaded: true });
    }
  });
  try {
    assert.equal((await h.cli("deploy", h.root)).code, 0);
    await writeFile(join(h.root, "opengame.json"), JSON.stringify({ ...manifest, title: "Night shift deluxe" }));
    const second = await h.cli("deploy", h.root);
    assert.equal(second.code, 0);
    assert.equal(bodies[0]!.metadataRevision, null);
    assert.equal(bodies[1]!.metadataRevision, 4);
    assert.ok(!second.events.some(event => event.code === "website_metadata_kept"));
    assert.equal(JSON.parse(await readFile(join(h.root, ".opengame/project.json"), "utf8")).metadataRevision, 5);
  } finally { await h.close(); }
});

test("status reads beside a deploy that holds the folder", async () => {
  const h = await harness((req, res) => {
    if (req.url === `/api/v1/operations/${id(1)}`) return json(res, 200, { operation: op(1, "checking") });
  });
  try {
    await withProject(h.root, h.origin, async (state, save) => {
      state.gameId = gameId;
      state.deploy = { key: "k", operationId: id(1), terminal: false, request: { byteSize: 64, fileCount: 1, sha256: "a".repeat(64), manifest, metadataRevision: null, metadata: "preserve" } };
      await save();
      // Still holding the lock, as a running deploy does.
      const { code, events } = await h.cli("status", h.root);
      assert.equal(code, 0, JSON.stringify(events));
      assert.equal(events.at(-1).data.state, "checking");
    });
  } finally { await h.close(); }
});

test("logout never revokes a token the environment supplies unless asked", async () => {
  const h = await harness((req, res) => {
    if (req.url === "/api/v1/auth/logout") return json(res, 200, { revoked: true });
  });
  try {
    const refused = await h.cli("logout");
    assert.equal(refused.code, 2);
    assert.equal(refused.events.at(-1).code, "environment_token");
    assert.ok(!h.seen.some(request => request.url === "/api/v1/auth/logout"));
    const login = await h.cli("login");
    assert.match(login.events.at(-1).message, /Unset OPENGAME_TOKEN/);
    assert.doesNotMatch(login.events.at(-1).message, /logout/);
    const revoked = await h.cli("logout", "--revoke");
    assert.equal(revoked.code, 0);
    assert.ok(h.seen.some(request => request.url === "/api/v1/auth/logout"));
  } finally { await h.close(); }
});

test("an agent can start a login, show the code, and finish it with a second command", async () => {
  let approved = false;
  const deviceCode = "d".repeat(43);
  const h = await harness((req, res) => {
    if (req.url === "/api/v1/auth/device") return json(res, 200, { device_code: deviceCode, user_code: "BCDF-GHJK", verification_uri: `${h.origin}/cli`, expires_in: 600, interval: 5 });
    if (req.url === "/api/v1/auth/token") return approved ? json(res, 200, { access_token: token }) : json(res, 400, { error: "authorization_pending" });
    if (req.url === "/api/v1/auth/me") return json(res, 200, { handle: "rishi", ogNumber: 7, avatar: { seed: 1, palette: "ember" }, credential: { origin: "device" } });
  });
  delete h.env.OPENGAME_TOKEN;
  try {
    const started = await h.cli("login", "--no-wait");
    // Not signed in yet: exit 3, so a script's `login && deploy` stops here.
    assert.equal(started.code, 3);
    assert.deepEqual([started.events[0].type, started.events[0].userCode, started.events[0].url], ["notice", "BCDF-GHJK", `${h.origin}/cli?code=BCDF-GHJK`]);
    assert.deepEqual([started.events.at(-1).code, started.events.at(-1).next], ["login_pending", "opengame login --continue"]);
    // A second start reuses the waiting code rather than minting another.
    await h.cli("login", "--no-wait");
    assert.equal(h.seen.filter(request => request.url === "/api/v1/auth/device").length, 1);
    approved = true;
    const finished = await h.cli("login", "--continue");
    assert.equal(finished.code, 0, JSON.stringify(finished.events));
    assert.equal(finished.events.at(-1).data.handle, "rishi");
    const again = await h.cli("login", "--continue");
    assert.equal(again.events.at(-1).code, "no_pending_login");
  } finally { await h.close(); }
});

test("a failed build in JSON mode reports what the build printed", async () => {
  const h = await harness(() => {});
  try {
    await writeFile(join(h.root, "opengame.json"), JSON.stringify({ ...manifest, build: { command: "node -e \"console.error('vite: Could not resolve ./Scene.js'); process.exit(3)\"", output: "." } }));
    const { code, events } = await h.cli("deploy", h.root, "--dry-run");
    assert.equal(code, 1);
    const found = events.find(event => event.type === "finding");
    assert.equal(found.finding.check, "build");
    assert.match(found.finding.evidence.observed, /exited with code 3[\s\S]*Could not resolve \.\/Scene\.js/);
    assert.equal(events.at(-1).code, "build_failed");
  } finally { await h.close(); }
});

/* A Unity, Godot or Defold export is built in its own editor, and the manifest's command
   is often one that only works on the machine that owns the toolchain. `exit 7` stands in
   for that: if anything runs it, the deploy fails, so a green --no-build run is evidence
   that nothing did. */
test("deploy --no-build uploads the export as it is, says so, and never runs the build command", async () => {
  const h = await harness((req, res) => {
    if (req.url === "/api/v1/deploys") return json(res, 200, { operation: op(1, "ready", { publicId: "nightshift", previewUrl: "/g/nightshift", findings: [] }), uploaded: true });
  });
  try {
    await writeFile(join(h.root, "opengame.json"), JSON.stringify({ ...manifest, build: { command: "exit 7", output: "." } }));
    const skipped = await h.cli("deploy", h.root, "--no-build");
    assert.equal(skipped.code, 0, JSON.stringify(skipped.events));
    assert.ok(!skipped.events.some(event => event.stage === "build" || event.type === "finding"), JSON.stringify(skipped.events));
    const notices = skipped.events.filter(event => event.code === "build_skipped");
    assert.equal(notices.length, 1);
    assert.equal(notices[0].message, "--no-build skipped build.command in opengame.json, so anything it adds or changes in the export is not in this upload. Packaging the project folder as it is on disk.");
    const sent = h.seen.filter(request => request.url === "/api/v1/deploys");
    assert.equal(sent.length, 1);
    // The saved request never carries the command, whichever way the build went.
    assert.deepEqual(JSON.parse(sent[0]!.body).manifest.build, { output: "." });
    assert.equal(skipped.events.at(-1).data.state, "ready");

    // The same manifest without the flag still builds, and still stops on the failure.
    const built = await h.cli("deploy", h.root);
    assert.equal(built.code, 1);
    assert.equal(built.events.at(-1).code, "build_failed");
    assert.match(built.events.find(event => event.type === "finding").finding.evidence.observed, /exited with code 7/);
    assert.ok(!built.events.some(event => event.code === "build_skipped"));
    assert.equal(h.seen.filter(request => request.url === "/api/v1/deploys").length, 1, "a failed build uploads nothing");
  } finally { await h.close(); }
});

test("deploy --dry-run --no-build packages without building, in --json as well as --jsonl", async () => {
  const h = await harness(() => {});
  try {
    await writeFile(join(h.root, "opengame.json"), JSON.stringify({ ...manifest, build: { command: "exit 7", output: "." } }));
    const dry = await h.cli("deploy", h.root, "--dry-run", "--no-build");
    assert.equal(dry.code, 0, JSON.stringify(dry.events));
    assert.equal(dry.events.filter(event => event.code === "build_skipped").length, 1);
    assert.match(dry.events.at(-1).data.message, /Nothing was uploaded/);
    // Position does not matter, and --json carries the notice in its one object.
    const object = JSON.parse((await run(process.execPath, [binary, "deploy", "--no-build", h.root, "--dry-run", "--json"], { env: h.env })).stdout);
    assert.ok(object.notices.some((notice: { code: string }) => notice.code === "build_skipped"), JSON.stringify(object));
    assert.ok(h.seen.every(request => !request.url.startsWith("/api/v1/deploys")));

    const built = await h.cli("deploy", h.root, "--dry-run");
    assert.equal(built.code, 1);
    assert.equal(built.events.at(-1).code, "build_failed");
  } finally { await h.close(); }
});

/* The notice lands in --json's final object, which an agent keeps, and the build
   transcript's redaction misses opaque values like these two. So the notice never quotes
   the command: neither value may appear anywhere a --no-build deploy prints. */
test("the build_skipped notice never quotes the command, and names the folder it packaged", async () => {
  const h = await harness(() => {});
  const first = "q".repeat(8) + "-opaque-one", second = "z".repeat(8) + "-opaque-two";
  try {
    await mkdir(join(h.root, "dist"));
    await writeFile(join(h.root, "dist", "index.html"), "<!doctype html><title>Night shift</title>");
    await writeFile(join(h.root, "opengame.json"), JSON.stringify({ ...manifest, build: { command: `MY_KEY=${first} curl -u admin:${second} -o dist/sdk.js https://example.test/sdk.js`, output: "dist" } }));
    const { code, events } = await h.cli("deploy", h.root, "--dry-run", "--no-build");
    assert.equal(code, 0, JSON.stringify(events));
    const notice = events.find(event => event.code === "build_skipped");
    assert.match(notice.message, /^--no-build skipped build\.command in opengame\.json, /);
    assert.match(notice.message, /Packaging dist as it is on disk\.$/);
    const json = (await run(process.execPath, [binary, "deploy", h.root, "--dry-run", "--no-build", "--json"], { env: h.env })).stdout;
    for (const printed of [JSON.stringify(events), json]) for (const value of [first, second]) assert.ok(!printed.includes(value), printed);

    await writeFile(join(h.root, "opengame.json"), JSON.stringify({ ...manifest, build: { output: "dist" } }));
    const bare = await h.cli("deploy", h.root, "--dry-run", "--no-build");
    assert.equal(bare.events.find(event => event.code === "build_skipped").message, "opengame.json has no build command, so --no-build changed nothing. Packaging dist as it is on disk.");
  } finally { await h.close(); }
});

test("deploy --no-build with no export folder says nothing built it, and how to get one", async () => {
  const h = await harness(() => {});
  try {
    await writeFile(join(h.root, "opengame.json"), JSON.stringify({ ...manifest, build: { command: "exit 7", output: "Build/WebGL" } }));
    const { code, events } = await h.cli("deploy", h.root, "--dry-run", "--no-build");
    assert.equal(code, 1);
    const error = events.at(-1);
    assert.equal(error.code, "folder_missing");
    assert.equal(error.message, "The build folder Build/WebGL does not exist, and --no-build means deploy did not build it. Build the export there first, or drop --no-build so deploy runs the build command.");
    assert.ok(!events.some(event => event.code === "build_skipped"), "the notice names a folder, so it waits until there is one");

    // With nothing to run, there is no command to go back to.
    await writeFile(join(h.root, "opengame.json"), JSON.stringify({ ...manifest, build: { output: "Build/WebGL" } }));
    const bare = await h.cli("deploy", h.root, "--dry-run", "--no-build");
    assert.equal(bare.events.at(-1).message, "The build folder Build/WebGL does not exist, and --no-build means deploy did not build it. Build the export there first.");
  } finally { await h.close(); }
});

test("--no-build is a plain switch on deploy and nowhere else", async () => {
  const h = await harness(() => {});
  try {
    const valued = await h.cli("deploy", h.root, "--no-build=false", "--dry-run");
    assert.deepEqual([valued.code, valued.events.at(-1).code], [2, "invalid_flag"]);
    // deploy has no --build to contradict it: the build is already the default there.
    const both = await h.cli("deploy", h.root, "--no-build", "--build", "--dry-run");
    assert.deepEqual([both.code, both.events.at(-1).code], [2, "unsupported_flag"]);
    const twice = await h.cli("deploy", h.root, "--no-build", "--no-build", "--dry-run");
    assert.equal(twice.events.at(-1).code, "duplicate_flag");
    for (const command of ["check", "status", "dev"]) {
      const other = await h.cli(command, h.root, "--no-build");
      assert.equal(other.events.at(-1).code, "unsupported_flag", command);
    }
  } finally { await h.close(); }
});

test("people read findings grouped by file with the fix written out, and errors on stderr", () => {
  const out: string[] = []; const err: string[] = [];
  const output = new Output(false, line => out.push(line), line => err.push(line), "plain", () => {});
  output.emit({ type: "finding", finding: finding() });
  output.emit({ type: "finding", finding: finding({ evidence: { observed: "src/keys.js line 9 has a token.", file: "src/keys.js:9" } }) });
  output.emit({ type: "finding", finding: finding({ check: "engine", state: "inconclusive", certainty: "heuristic", fault: "unknown", retry: "never", evidence: { observed: "Could not confirm Three.js." }, fix: "A person will confirm this." }) });
  output.emit({ type: "error", code: "deploy_checks_failed", message: "A server check refused this build.", exitCode: 1, next: "opengame check" });
  assert.equal(out[0], "src/keys.js");
  assert.equal(out.filter(line => line === "src/keys.js").length, 1);
  assert.match(out[1]!, /^ {2}Blocker: src\/keys\.js line 3/);
  assert.match(out[2]!, /^ {2}Fix: Delete it/);
  assert.ok(out.includes("  Worth a look: Could not confirm Three.js."));
  assert.equal(out.at(-1), "Then run opengame check, then opengame deploy.");
  // The "Then run" line just asked for opengame check, so the error does not ask again.
  assert.deepEqual(err, ["A server check refused this build."]);
  assert.ok(!out.join("\n").includes("\x1b"));
});

test("NO_COLOR and a pipe get plain output with no spinner or colour", async () => {
  const child = spawn(process.execPath, [binary, "check", fileURLToPath(new URL(".", import.meta.url))], { env: { ...process.env, NO_COLOR: "1" } });
  let text = ""; child.stdout.on("data", chunk => { text += chunk; }); child.stderr.on("data", chunk => { text += chunk; });
  await once(child, "close");
  assert.ok(!text.includes("\x1b"), text);
});

test("the arrival sweep is the brand blue on the title, once", async () => {
  let raw = "";
  const output = new Output(false, () => {}, () => {}, "rich", text => { raw += text; });
  await output.arrive("Night shift");
  const colours = new Set([...raw.matchAll(/38;2;(\d+);(\d+);(\d+)m/g)].map(match => match.slice(1).map(Number)).map(([r, g, b]) => `${r},${g},${b}`));
  assert.ok(colours.has("0,84,255"), [...colours].join(" "));
  // Every frame is the blue easing toward neutral: blue never drops below red or green.
  for (const colour of colours) { const [r, g, b] = colour.split(",").map(Number); assert.ok(b! >= g! && g! >= r!, colour); }
  assert.ok(raw.endsWith("\x1b[1mNight shift\x1b[0m\n"));
});

test("a person's build prints under a still heading, and the finding does not claim it printed nothing", async () => {
  const raw: string[] = []; const out: string[] = [];
  const output = new Output(false, line => out.push(line), () => {}, "rich", text => raw.push(text));
  // Silent on purpose so the test log stays clean; what matters is the terminal
  // being handed over for the whole run, which is long enough for several frames.
  const failed = await build("node -e \"setTimeout(() => process.exit(3), 450)\"", tmpdir(), output).catch((error: unknown) => error as { message: string; finding: RepairFinding });
  const heading = raw.findIndex(text => text.includes("›") && text.includes("Running build command"));
  assert.ok(heading >= 0, "the stage settles as a heading before the build writes");
  assert.equal(raw.slice(heading + 1).filter(text => text.includes("Running build command")).length, 0, "no spinner frame paints over the build's output");
  assert.match(failed.finding.evidence.observed, /exited with code 3\. Its output is above\./);
  assert.doesNotMatch(failed.finding.evidence.observed, /without printing anything/);
  assert.equal(failed.message, "The build command failed. Its output is above.");
});

test("failed build instructions and captured diagnostics redact every known or assigned secret", async () => {
  const dir = await mkdtemp(join(tmpdir(), "og-build-private-"));
  const opaque = "synthetic-build-password";
  const key = "AKIA" + "Z".repeat(16);
  const lines: string[] = [];
  try {
    await writeFile(join(dir, "build.cjs"), `console.error(process.argv.slice(2).join("\\n")); console.error("${key} ${key}"); console.error("useful build failure"); process.exit(3);`);
    const command = `node build.cjs --password "${opaque}" --header 'Authorization: Bearer synthetic-bearer-value' '{"token":"synthetic-json-value"}'`;
    const output = new Output("jsonl", line => lines.push(line));
    const failed = await build(command, dir, output).catch((error: unknown) => error as { finding: RepairFinding });
    const transcript = lines.join("\n") + JSON.stringify(failed.finding);
    for (const value of [opaque, key, "synthetic-bearer-value", "synthetic-json-value"]) assert.ok(!transcript.includes(value), "a synthetic credential entered the diagnostic");
    assert.match(failed.finding.evidence.observed, /useful build failure/);
    assert.match(failed.finding.verify, /then opengame deploy/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

/* `npm install && npm run dev` as a build command is the shape: the shell stays the parent
   and what it started runs for ever with the output pipe open. Before this, a timeout killed
   the shell alone and --json waited on the pipe after the limit for as long as the
   grandchild lived. POSIX only: Windows stops the tree with taskkill, which is not run here. */
test("a build past its time limit is stopped with everything it started, and --json does not wait on the pipe", { timeout: 30_000, skip: process.platform === "win32" }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "og-build-timeout-"));
  try {
    const marker = join(dir, "grandchild.pid");
    const started = Date.now();
    const failed = await build(`node -e 'require("fs").writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)' ${marker}; true`,
      dir, new Output(true, () => {}, () => {}), 1500).catch((error: unknown) => error as { code: string; finding: RepairFinding });
    assert.equal(failed.code, "build_timeout");
    assert.match(failed.finding.evidence.observed, /ran for 1 minutes? without finishing/);
    assert.ok(Date.now() - started < 12_000, `took ${Date.now() - started} ms`);
    const pid = Number(await readFile(marker, "utf8"));
    const alive = () => { try { process.kill(pid, 0); return true; } catch { return false; } };
    for (let i = 0; i < 50 && alive(); i++) await new Promise(resolve => setTimeout(resolve, 100));
    if (alive()) { process.kill(pid, "SIGKILL"); assert.fail("the build's own child outlived the time limit"); }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

const quiet = () => new Output(true, () => {}, () => {});
const pidFrom = async (file: string) => Number(await readFile(file, "utf8"));
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function gone(pid: number, ms: number) {
  for (let waited = 0; waited < ms && alive(pid); waited += 100) await new Promise(resolve => setTimeout(resolve, 100));
  if (alive(pid)) { process.kill(pid, "SIGKILL"); return false; }
  return true;
}
const holder = (marker: string, ignoreTerm = false) =>
  `node -e '${ignoreTerm ? 'process.on("SIGTERM", () => {}); ' : ""}require("fs").writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)' ${marker}`;

test("a build child that ignores SIGTERM is killed after the grace, although the shell went at once", { timeout: 30_000, skip: process.platform === "win32" }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "og-build-kill-"));
  try {
    const marker = join(dir, "pid");
    const failed = await build(`${holder(marker, true)}; true`, dir, quiet(), 1500).catch((error: unknown) => error as { code: string });
    assert.equal(failed.code, "build_timeout");
    assert.ok(await gone(await pidFrom(marker), 3000), "SIGKILL never reached the process that ignored SIGTERM");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("a build that succeeds but leaves something running in the background has it stopped, and says so", { timeout: 30_000, skip: process.platform === "win32" }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "og-build-left-"));
  try {
    const marker = join(dir, "pid");
    const notices: string[] = [];
    const output = new Output(true, line => notices.push(line), () => {});
    const started = Date.now();
    await build(`${holder(marker)} & sleep 0.5; exit 0`, dir, output, 60_000);
    assert.ok(Date.now() - started < 4000, `took ${Date.now() - started} ms`);
    assert.ok(await gone(await pidFrom(marker), 3000), "the background process is still running");
    assert.ok(notices.some(line => line.includes("build_left_running")), notices.join("\n"));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("a build that failed before its limit is a failure, not a timeout, whatever it left holding the output", { timeout: 30_000, skip: process.platform === "win32" }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "og-build-exit-"));
  try {
    const marker = join(dir, "pid");
    /* The holder ignores SIGTERM, so it keeps the output open for the whole grace after the
       shell exits, and the limit falls inside that window: the case this test is for is the
       timer firing after the shell has gone. It used to be 1300 ms against a one-second
       shell, which left 300 ms for a shell to start, sleep and exit; beside other suites
       that ran out, the shell was still running at the limit, and a correct build read as
       a timeout (the contention note in AGENTS.md). */
    const failed = await build(`${holder(marker, true)} & sleep 1; exit 3`, dir, quiet(), 3000).catch((error: unknown) => error as { code: string; finding: RepairFinding });
    assert.equal(failed.code, "build_failed", failed.finding?.evidence.observed);
    assert.ok(await gone(await pidFrom(marker), 3000));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("a person's build stays in the terminal's process group, where Ctrl-C and prompts reach it", { skip: process.platform === "win32" }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "og-build-group-"));
  try {
    const file = join(dir, "pgid");
    await build(`ps -o pgid= -p $$ > ${file}`, dir, new Output(false, () => {}, () => {}, "plain", () => {}));
    const own = execFileSync("ps", ["-o", "pgid=", "-p", String(process.pid)], { encoding: "utf8" }).trim();
    assert.equal((await readFile(file, "utf8")).trim(), own);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("check names the missing files and does not call a warning a blocker", async () => {
  const h = await harness(() => {});
  try {
    await writeFile(join(h.root, "index.html"), '<!doctype html><script type="module" src="./game.js"></script>');
    await writeFile(join(h.root, "game.js"), 'fetch("./level.json"); fetch("./level.json");\n');
    await writeFile(join(h.root, "opengame.json"), JSON.stringify({ ...manifest, build: { output: "." } }));
    const { code, events } = await h.cli("check", h.root);
    assert.equal(code, 0);
    const found = events.find(event => event.type === "finding").finding;
    // The names lead the fix, so observed stays the one sentence an AGENTS.md can quote.
    assert.equal(found.evidence.observed, "1 referenced file is not in the folder.");
    assert.match(found.fix, /^Not found: game\.js:1 → level\.json\. /);
    const plain: string[] = [];
    const output = new Output(false, line => plain.push(line), () => {}, "plain", () => {});
    output.emit({ type: "finding", finding: found }); output.finish();
    assert.ok(plain.some(line => line.startsWith("  Worth a look: ")), plain.join("\n"));
    assert.ok(!plain.some(line => line.startsWith("Then run")), "a warning asks for no next command");
  } finally { await h.close(); }
});

test("a finding the local check and the server both report is printed once, in the server's words", () => {
  const out: string[] = [];
  const output = new Output(false, line => out.push(line), () => {}, "plain", () => {});
  const local = finding({ check: "platform-engine", state: "inconclusive", certainty: "heuristic", fault: "unknown", retry: "never",
    evidence: { observed: "Could not confirm Three.js in this build." }, fix: "Nothing has to change now; you can deploy as it is." });
  output.emit({ type: "finding", finding: local });
  output.emit({ type: "finding", finding: { ...local, check: "engine", fix: "A reviewer will confirm the engine before publication." } });
  output.finish();
  assert.equal(out.filter(line => line.includes("Could not confirm Three.js")).length, 1, out.join("\n"));
  assert.ok(out.some(line => line.includes("A reviewer will confirm the engine")));
  // A blocker and a note with the same words are two different asks, and both print.
  const both: string[] = [];
  const second = new Output(false, line => both.push(line), () => {}, "plain", () => {});
  second.emit({ type: "finding", finding: finding({ evidence: { observed: "Same words." } }) });
  second.emit({ type: "finding", finding: finding({ state: "inconclusive", fault: "unknown", retry: "never", evidence: { observed: "Same words." } }) });
  second.finish();
  assert.equal(both.filter(line => line.includes("Same words.")).length, 2);
});

test("a person's terminal types the login code in, one character at a time; plain and JSON print it whole", async () => {
  const raw: string[] = [];
  const rich = new Output(false, () => {}, () => {}, "rich", text => raw.push(text));
  const event = { type: "notice" as const, code: "device_approval", url: "http://x/cli?code=BCDF-GHJK", userCode: "BCDF-GHJK",
    message: "Open http://x/cli?code=BCDF-GHJK\nCompare code BCDF-GHJK, then allow access." };
  await rich.revealCode(event, "BCDF-GHJK");
  assert.equal(raw.filter(chunk => chunk.includes("\x1b[1m")).length, 9, "each character of the code lands on its own");
  assert.match(raw[0]!, /^Open http:\/\/x\/cli\?code=BCDF-GHJK\nCompare code $/);
  const lines: string[] = [];
  const plain = new Output(false, line => lines.push(line), () => {}, "plain", () => {});
  await plain.revealCode(event, "BCDF-GHJK");
  assert.deepEqual(lines, [event.message]);
});

/* After the close the server says `deploysFrozen`. A new deploy stops before it builds, with
   the shared sentence; a deploy saved here before the close is resumed, because the server
   answers its saved key as the same deploy (packages/cli launch.ts, the launch clock). */
test("after the close a new deploy stops at once and a saved one resumes", async () => {
  const h = await harness((req, res) => {
    if (req.url === "/api/v1/status") return json(res, 200, { launched: true, access: true, deploysFrozen: true });
    if (req.url === "/api/v1/deploys") return json(res, 200, { operation: op(1, "queued"), uploaded: true });
    if (req.url === `/api/v1/operations/${id(1)}/upload`) return json(res, 200, { operation: op(1, "queued") });
  });
  h.env.OPENGAME_TEST_SKIP_LAUNCH_CHECK = undefined;
  try {
    const fresh = await h.cli("deploy", h.root, "--no-wait");
    assert.equal(fresh.code, 3, JSON.stringify(fresh.events));
    assert.ok(fresh.events.some(event => event.code === "entries_closed"), JSON.stringify(fresh.events));
    assert.equal(h.seen.filter(request => request.url === "/api/v1/deploys").length, 0, "a new deploy reached the server after the close");

    await withProject(h.root, h.origin, async (state, save) => {
      state.deploy = { key: "before-the-close", operationId: id(1), terminal: false, request: { byteSize: 64, fileCount: 1, sha256: "a".repeat(64), manifest, metadataRevision: null, metadata: "preserve" } };
      await save();
    });
    const resumed = await h.cli("deploy", h.root, "--no-wait");
    assert.ok(!resumed.events.some(event => event.code === "entries_closed"), JSON.stringify(resumed.events));
    assert.equal(h.seen.find(request => request.url === "/api/v1/deploys")?.key, "before-the-close");

    /* The most common folder after a deploy before the close: its bytes reached the server and
       it is queued. Another `opengame deploy` there is a NEW deploy, not a resume, so it stops
       before it builds, as the deploy's own rule says (deploy.ts, `resumesSavedDeploy`). */
    await withProject(h.root, h.origin, async (state, save) => {
      state.deploy = { key: "queued-before-the-close", operationId: id(1), terminal: false, uploaded: true, request: { byteSize: 64, fileCount: 1, sha256: "a".repeat(64), manifest, metadataRevision: null, metadata: "preserve" } };
      await save();
    });
    const creates = h.seen.filter(request => request.url === "/api/v1/deploys").length;
    const again = await h.cli("deploy", h.root, "--no-wait");
    assert.equal(again.code, 3, JSON.stringify(again.events));
    assert.ok(again.events.some(event => event.code === "entries_closed"), JSON.stringify(again.events));
    assert.equal(h.seen.filter(request => request.url === "/api/v1/deploys").length, creates, "a new deploy reached the server after the close");
  } finally { await h.close(); }
});
