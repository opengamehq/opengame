import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createServer, type IncomingMessage } from "node:http";
import { once } from "node:events";
import { reviewFindings } from "@opengame/protocol";

/**
 * `opengame submit` and `opengame jams`, through the bundled binary against a fake API.
 * Agent mode throughout (the runner is not a TTY), which is the mode that must never
 * prompt and must name the flag for every missing answer.
 */

const run = promisify(execFile);
const binary = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
const token = "ogt_" + "a".repeat(16) + "_" + "b".repeat(43);
const releaseId = "11111111-1111-4111-8111-111111111111";
const submissionId = "22222222-2222-4222-8222-222222222222";
const gameId = "33333333-3333-4333-8333-333333333333";

const jam = { slug: "fixture-jam", name: "Fixture jam", state: "open", acceptingEntries: true, startsAt: null, endsAt: null,
  rulesUrl: "https://opengame.io/rules", tracks: [{ key: "rpg", name: "RPG", kind: "theme" }] };
const form = { formVersion: 1, jam: { ...jam, entriesPerCreator: 3, termsVersion: "2026-09-27" },
  track: { flag: "--track", label: "Genre track", options: [{ value: "rpg", label: "RPG" }, { value: "platformer", label: "Platformer" }] },
  models: { flag: "--models", label: "Models used", min: 1, options: [{ value: "claude", label: "Claude", provider: "Anthropic" }, { value: "flux", label: "FLUX", provider: "fal.ai" }] },
  sponsors: { flag: "--sponsor", label: "Sponsor tracks", options: [{ value: "fal", label: "Best use of fal.ai", provider: "fal.ai", evidenceLabel: "What fal.ai did", evidenceCharsMax: 2000 }] },
  evidence: { flagPrefix: "--evidence-", label: "What the sponsor's model did" } };
const view = (state: string) => ({ id: submissionId, ref: "SUB-1042", state, releaseId, gameId, gamePublicId: "abc123",
  submittedAt: "2026-10-05T00:00:00Z", certifiedAt: null, jam: null,
  certifyUrl: state === "needs_certification" ? "https://opengame.io/certify/SUB-1042" : null, gameUrl: "https://opengame.io/g/abc123",
  queuePosition: null, outcome: null, replayed: false, existing: false });

async function body(req: IncomingMessage) { const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer); return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null; }

async function harness(options: { jams?: unknown[]; destination?: unknown; formStatus?: number; pollBody?: unknown; submitStatus?: number; submitBody?: unknown; submitBodies?: unknown[]; states?: string[]; lookup?: Map<string, unknown> } = {}) {
  const posts: { key: string | undefined; body: unknown }[] = [];
  const gets: string[] = [];
  const requests: string[] = [];
  const states = [...(options.states ?? ["needs_certification"])];
  const bodies = [...(options.submitBodies ?? [])];
  // Fixture certification links belong to this configured product origin, just as
  // production links do. Other origins stay unchanged for the rejection tests.
  const responseBody = (value: unknown) => JSON.stringify(value).replaceAll("https://opengame.io/certify/", origin + "/certify/");
  const server = createServer(async (req, res) => {
    requests.push(`${req.method} ${req.url}`);
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/v1/jams") { res.end(JSON.stringify({ jams: options.jams ?? [], submissionDestination: options.destination ?? (options.jams?.length ? { kind: "jam", slug: jam.slug, name: jam.name } : { kind: "marketplace" }) })); return; }
    if (req.url === `/api/v1/jams/${jam.slug}/form`) { res.statusCode = options.formStatus ?? 200; res.end(JSON.stringify(options.formStatus ? { error: "jam_closed", message: "The jam is closed." } : { form })); return; }
    if (req.url === "/api/v1/submissions" && req.method === "POST") {
      posts.push({ key: req.headers["idempotency-key"] as string | undefined, body: await body(req) });
      res.statusCode = options.submitStatus ?? 201;
      res.end(responseBody(bodies.shift() ?? options.submitBody ?? { submission: view(states[0]!) })); return;
    }
    const asked = req.url?.match(/^\/api\/v1\/submissions\/([0-9a-f-]{36})$/)?.[1];
    if (asked && options.lookup) {
      gets.push(req.url!);
      const found = options.lookup.get(asked);
      res.statusCode = found ? 200 : 404;
      res.end(responseBody(found ? { submission: found } : { error: "submission_not_found" })); return;
    }
    if (req.url === `/api/v1/submissions/${submissionId}`) { gets.push(req.url); res.end(responseBody(options.pollBody ?? { submission: view(states.length > 1 ? states.shift()! : states[0]!) })); return; }
    res.statusCode = 404; res.end(JSON.stringify({ error: "not_found" }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const env: NodeJS.ProcessEnv = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" };
  const execute = async (cwd: string, ...args: string[]) => {
    try {
      const { stdout } = await run(process.execPath, [binary, ...args, "--jsonl"], { env, cwd });
      return { code: 0, events: stdout.trim().split("\n").map(line => JSON.parse(line)) };
    } catch (error) {
      const e = error as { code: number; stdout: string };
      return { code: e.code, events: e.stdout.trim().split("\n").map(line => JSON.parse(line)) };
    }
  };
  return { origin, posts, gets, requests, execute, close: () => server.close() };
}

test("an agent must name the release, and the error says which flag", async () => {
  const api = await harness();
  const cwd = await mkdtemp(join(tmpdir(), "og-submit-"));
  try {
    const result = await api.execute(cwd, "submit");
    assert.equal(result.code, 2);
    assert.equal(result.events.at(-1).code, "release_required");
    assert.match(result.events.at(-1).message, /--release/);
    assert.equal(api.posts.length, 0);
  } finally { api.close(); await rm(cwd, { recursive: true, force: true }); }
});

test("a marketplace submit hands certification to the browser and keeps its retry key across runs", async () => {
  const api = await harness();
  const root = await mkdtemp(join(tmpdir(), "og-submit-"));
  try {
    await writeFile(join(root, "opengame.json"), JSON.stringify({ title: "Night shift", description: "Survive until dawn with a light and a dwindling battery.", genre: "rpg", controls: ["keyboard"] }));
    const first = await api.execute(root, "submit", root, "--release", releaseId, "--no-jam", "--no-wait");
    assert.equal(first.code, 0, JSON.stringify(first.events));
    assert.ok(first.events.some(e => e.type === "notice" && e.code === "certify_required" && e.url === `${api.origin}/certify/SUB-1042`));
    assert.equal(first.events.at(-1).data.state, "needs_certification");
    assert.deepEqual(api.posts[0]!.body, { releaseId, jam: null });
    const saved = JSON.parse(await readFile(join(root, ".opengame", "project.json"), "utf8"));
    assert.equal(saved.submit.key, api.posts[0]!.key);
    assert.equal(saved.submit.submissionId, submissionId);
    // Running it again is how a person or an agent checks on it: the project knows which
    // submission the request made, so the rerun reads it and sends nothing.
    const again = await api.execute(root, "submit", root, "--release", releaseId, "--no-jam", "--no-wait");
    assert.equal(again.code, 0, JSON.stringify(again.events));
    assert.equal(api.posts.length, 1);
    assert.equal(api.gets.length, 1);
    assert.equal(again.events.at(-1).data.id, submissionId);
    assert.match(again.events.at(-1).data.message, /run this command again to follow it/);
  } finally { api.close(); await rm(root, { recursive: true, force: true }); }
});

test("unsafe certification links are rejected before an agent is handed the URL", async () => {
  for (const certifyUrl of ["https://evil.example/certify", "javascript:alert(1)", "file:///etc/passwd", "http://localhost:1/certify"]) {
    const api = await harness({ submitBody: { submission: { ...view("needs_certification"), certifyUrl } } });
    const cwd = await mkdtemp(join(tmpdir(), "og-certify-trust-"));
    try {
      const result = await api.execute(cwd, "submit", "--release", releaseId, "--no-jam", "--no-wait", "--no-browser");
      assert.equal(result.code, 5, JSON.stringify(result.events));
      assert.equal(result.events.at(-1).code, "invalid_response");
      assert.ok(!result.events.some(event => event.code === "certify_required"));
      assert.ok(!JSON.stringify(result.events).includes(certifyUrl));
    } finally { api.close(); await rm(cwd, { recursive: true, force: true }); }
  }
});

test("a lost answer is recovered under the same key; a renewed submission is followed; a withdrawn one is sent again", async () => {
  const renewedId = "44444444-4444-4444-8444-444444444444";
  const lookup = new Map<string, unknown>();
  const api = await harness({ lookup, submitBodies: [{ submission: view("needs_certification") }, { submission: { ...view("needs_certification"), id: renewedId } }] });
  const root = await mkdtemp(join(tmpdir(), "og-submit-"));
  const project = () => readFile(join(root, ".opengame", "project.json"), "utf8").then(JSON.parse);
  try {
    await writeFile(join(root, "opengame.json"), JSON.stringify({ title: "Night shift", description: "Survive until dawn with a light and a dwindling battery.", genre: "rpg", controls: ["keyboard"] }));
    // The first answer never arrived: a key is saved, and no submission id.
    await mkdir(join(root, ".opengame"), { recursive: true });
    await writeFile(join(root, ".opengame", "project.json"), JSON.stringify({ version: 1, origin: api.origin, submit: { key: "saved-key", request: { releaseId, jam: null } } }));
    const args = ["submit", root, "--release", releaseId, "--no-jam", "--no-wait"];
    await api.execute(root, ...args);
    assert.equal(api.posts[0]!.key, "saved-key");
    assert.equal((await project()).submit.submissionId, submissionId);

    // Renewed from the certify page: the stored one says which submission replaced it.
    lookup.set(submissionId, { ...view("superseded"), replacedBy: { id: renewedId, ref: "SUB-1043", releaseId } });
    lookup.set(renewedId, { ...view("playtesting"), id: renewedId, ref: "SUB-1043" });
    const followed = await api.execute(root, ...args);
    assert.equal(followed.code, 0, JSON.stringify(followed.events));
    assert.equal(followed.events.at(-1).data.id, renewedId);
    assert.equal(api.posts.length, 1, "following a submission sends nothing");
    assert.equal((await project()).submit.submissionId, renewedId);

    // Withdrawn since: running submit again means submit it again, under a new key.
    lookup.set(renewedId, { ...view("withdrawn"), id: renewedId });
    const again = await api.execute(root, ...args);
    assert.equal(again.code, 0, JSON.stringify(again.events));
    assert.equal(api.posts.length, 2);
    assert.notEqual(api.posts[1]!.key, "saved-key");
    assert.equal((await project()).submit.key, api.posts[1]!.key);
  } finally { api.close(); await rm(root, { recursive: true, force: true }); }
});

test("outside a project, a replay is the answer; a newer release is never pushed aside by a rerun", async () => {
  const replayed = (state: string, extra: Record<string, unknown> = {}) => ({ submission: { ...view(state), replayed: true, ...extra } });
  const newer = { id: "55555555-5555-4555-8555-555555555555", ref: "SUB-1050", releaseId: "66666666-6666-4666-8666-666666666666" };
  const api = await harness({ submitStatus: 200, submitBodies: [
    replayed("playtesting"), replayed("superseded", { replacedBy: newer }), replayed("withdrawn"), { submission: view("playtesting") }] });
  const cwd = await mkdtemp(join(tmpdir(), "og-submit-"));
  try {
    const run = () => api.execute(cwd, "submit", "--release", releaseId, "--no-jam");
    const first = await run();
    assert.equal(first.code, 0, JSON.stringify(first.events));
    assert.equal(first.events.at(-1).data.state, "playtesting");
    const replaced = await run();
    assert.equal(replaced.code, 0);
    assert.equal(api.posts.length, 2, "a submission replaced by another release is reported, not sent again");
    assert.match(replaced.events.at(-1).data.message, /SUB-1050, release 66666666, is in review instead.*--idempotency-key/);
    const withdrawn = await run();
    assert.equal(withdrawn.code, 0, JSON.stringify(withdrawn.events));
    assert.equal(api.posts.length, 4);
    assert.equal(api.posts[2]!.key, api.posts[0]!.key, "the derived key is the same for the same request");
    assert.notEqual(api.posts[3]!.key, api.posts[2]!.key);
    assert.equal(withdrawn.events.at(-1).data.state, "playtesting");
  } finally { api.close(); await rm(cwd, { recursive: true, force: true }); }
});

test("a release returned for a failure of ours is sent again; one returned for the game's own findings is read back", async () => {
  const outcome = (findings: unknown[]) => ({ decision: "return", reason: null, findings, appealable: false });
  const ours = reviewFindings(releaseId, [{ code: "check_timeout", check: "gpu-runtime", message: "Our checks ran past 15 minutes." }], []);
  const game = reviewFindings(releaseId, [{ code: "runtime_failed", check: "gpu-runtime", message: "The game drew nothing." }], []);
  assert.equal(ours[0]!.fault, "platform");
  assert.equal(ours[0]!.verify, "opengame submit");
  assert.equal(game[0]!.fault, "game");
  const returned = (findings: unknown[]) => ({ submission: { ...view("returned"), replayed: true, outcome: outcome(findings) } });
  const api = await harness({ submitStatus: 200, submitBodies: [returned(ours), { submission: view("playtesting") }, returned(game)] });
  const cwd = await mkdtemp(join(tmpdir(), "og-submit-"));
  try {
    const run = () => api.execute(cwd, "submit", "--release", releaseId, "--no-jam");
    const again = await run();
    assert.equal(again.code, 0, JSON.stringify(again.events));
    assert.equal(api.posts.length, 2, "the deadline's return is submitted again under a new key");
    assert.notEqual(api.posts[1]!.key, api.posts[0]!.key);
    assert.equal(again.events.at(-1).data.state, "playtesting");
    const read = await run();
    assert.equal(api.posts.length, 3, "a return for the game's findings is reported, not sent again");
    assert.equal(read.events.at(-1).data.state, "returned");
    assert.match(read.events.at(-1).data.message, /deploy an updated release/);
  } finally { api.close(); await rm(cwd, { recursive: true, force: true }); }
});

test("submit waits for certification and returns the state the browser moved it to", async () => {
  const api = await harness({ states: ["needs_certification", "needs_certification", "playtesting"] });
  const cwd = await mkdtemp(join(tmpdir(), "og-submit-"));
  try {
    const result = await api.execute(cwd, "submit", "--release", releaseId, "--no-jam", "--no-browser");
    assert.equal(result.code, 0, JSON.stringify(result.events));
    assert.equal(result.events.at(-1).data.state, "playtesting");
    assert.match(result.events.at(-1).data.message, /Playtesting/);
    assert.doesNotMatch(result.events.at(-1).data.message, /The playtest runs next/);
    assert.match(result.events.at(-1).data.message, /It is decided when the playtest finishes/);
    // The handoff is an instruction, not a stage: as a stage, a person's terminal
    // ticked it off as done ("✓ One step only you can do ... 0.0s") before they did it.
    const handoff = result.events.find((event: { code?: string }) => event.code === "certify_required");
    assert.deepEqual([handoff?.type, handoff?.url], ["notice", `${api.origin}/certify/SUB-1042`]);
    assert.ok(!result.events.some((event: { type: string; message?: string }) => event.type === "progress" && /certify at/.test(event.message ?? "")));
  } finally { api.close(); await rm(cwd, { recursive: true, force: true }); }
});

test("a submission renewed from the certify page while the CLI waits is followed to the new one", async () => {
  const renewedId = "44444444-4444-4444-8444-444444444444";
  const lookup = new Map<string, unknown>([
    [submissionId, { ...view("superseded"), replacedBy: { id: renewedId, ref: "SUB-1043", releaseId } }],
    [renewedId, { ...view("playtesting"), id: renewedId, ref: "SUB-1043" }],
  ]);
  const api = await harness({ lookup });
  const cwd = await mkdtemp(join(tmpdir(), "og-submit-"));
  try {
    const result = await api.execute(cwd, "submit", "--release", releaseId, "--no-jam", "--no-browser");
    assert.equal(result.code, 0, JSON.stringify(result.events));
    assert.equal(result.events.at(-1).data.id, renewedId);
    assert.equal(result.events.at(-1).data.state, "playtesting");
  } finally { api.close(); await rm(cwd, { recursive: true, force: true }); }
});

test("the operator selects the jam without a destination prompt, and missing answers name their flags", async () => {
  const api = await harness({ jams: [jam], states: ["playtesting"] });
  const cwd = await mkdtemp(join(tmpdir(), "og-submit-"));
  try {
    const undecided = await api.execute(cwd, "submit", "--release", releaseId);
    assert.equal(undecided.code, 2);
    assert.equal(undecided.events.at(-1).code, "jam_answers_required");
    assert.match(undecided.events.at(-1).message, /--track:/);
    const missing = await api.execute(cwd, "submit", "--release", releaseId, "--jam", "fixture-jam", "--sponsor", "fal");
    assert.equal(missing.code, 2);
    assert.match(missing.events.at(-1).message, /--track:/);
    assert.match(missing.events.at(-1).message, /--sponsor:.*fal\.ai model/);
    assert.equal(api.posts.length, 0, "nothing is sent until the answers are whole");
    const entered = await api.execute(cwd, "submit", "--release", releaseId, "--track", "RPG",
      "--models", "flux,claude", "--sponsor", "fal", "--evidence-fal", "Every prop texture");
    assert.equal(entered.code, 0, JSON.stringify(entered.events));
    assert.deepEqual(api.posts[0]!.body, { releaseId, jam: { slug: "fixture-jam", track: "rpg", models: ["claude", "flux"], sponsors: ["fal"], evidence: { fal: "Every prop texture" } } });
    assert.ok(entered.events.some(e => e.type === "notice" && /Genre track\s+RPG/.test(e.message)));
  } finally { api.close(); await rm(cwd, { recursive: true, force: true }); }
});

test("the server's refusal reaches the agent with its own sentence and the plan's exit code", async () => {
  const api = await harness({ submitStatus: 429, submitBody: { error: "gpu_quota_exhausted", message: "You have used today's ten playtest runs. Nothing was queued; submit again tomorrow." } });
  const cwd = await mkdtemp(join(tmpdir(), "og-submit-"));
  try {
    const result = await api.execute(cwd, "submit", "--release", releaseId, "--no-jam");
    assert.equal(result.code, 4);
    assert.equal(result.events.at(-1).code, "gpu_quota_exhausted");
    assert.match(result.events.at(-1).message, /Nothing was queued/);
  } finally { api.close(); await rm(cwd, { recursive: true, force: true }); }
});

// submit used to rebuild every refusal from its status, so a missing handle exited 2
// here and 3 everywhere else, and a wait the server named was dropped.
test("a refusal keeps the shared exit, retry and wait", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "og-submit-"));
  for (const [status, body, exit, retry] of [
    [409, { error: "handle_required", message: "server words" }, 3, "after-fix"],
    [429, { error: "rate_limited", message: "Wait a minute.", retryAfterSeconds: 42 }, 4, "later"],
  ] as const) {
    const api = await harness({ submitStatus: status, submitBody: body });
    try {
      const result = await api.execute(cwd, "submit", "--release", releaseId, "--no-jam");
      const error = result.events.at(-1);
      assert.equal(result.code, exit, JSON.stringify(error));
      assert.equal(error.retry, retry);
      if (status === 429) assert.equal(error.retryAfterSeconds, 42);
      if (status === 409) assert.match(error.message, /Claim a handle/);
    } finally { api.close(); }
  }
  await rm(cwd, { recursive: true, force: true });
});

test("jams lists the open jams and prints one jam's flags", async () => {
  const sponsored = { ...jam, endsAt: "2026-11-30T23:59:00Z", tracks: [...jam.tracks, { key: "fal", name: "Best use of fal.ai", kind: "sponsor" }] };
  const api = await harness({ jams: [sponsored, { ...jam, slug: "judged-jam", name: "Judged jam", state: "judging", acceptingEntries: false, tracks: [] }, { ...jam, slug: "early-jam", name: "Early jam", state: "open", acceptingEntries: false, startsAt: "2099-11-18T12:00:00Z", endsAt: "2099-12-18T12:00:00Z", tracks: [] }, { ...jam, slug: "late-jam", name: "Late jam", state: "open", acceptingEntries: false, startsAt: "2020-11-18T12:00:00Z", endsAt: "2020-12-18T12:00:00Z", tracks: [] }] });
  const cwd = await mkdtemp(join(tmpdir(), "og-jams-"));
  try {
    const listed = await api.execute(cwd, "jams");
    assert.equal(listed.events.at(-1).data.jams[0].slug, "fixture-jam");
    // The deadline was only in the JSON, sponsor keys read as --track values, and a jam
    // past entries printed its raw state word.
    const text: string = listed.events.at(-1).data.message;
    // In Pacific time, the deadline's zone, like the jam's pages (packages/protocol jam-time.ts).
    assert.match(text, /Fixture jam \(fixture-jam\)  Open until 30 November, 3:59 pm PT/);
    assert.match(text, /Genre tracks    rpg\n  Sponsor tracks  fal/);
    assert.match(text, /Judged jam \(judged-jam\)  Being judged/);
    // Before kickoff the state is already `open`, and the list said "Past its deadline".
    assert.match(text, /Early jam \(early-jam\)  Opens 18 November 2099, 4:00 am PT/);
    assert.match(text, /Late jam \(late-jam\)  Past its deadline/);
    const one = await api.execute(cwd, "jams", "fixture-jam");
    assert.match(one.events.at(-1).data.message, /--evidence-fal/);
    assert.equal(one.events.at(-1).data.form.track.options.length, 2);
    const missing = await api.execute(cwd, "jams", "no-such-jam");
    assert.equal(missing.code, 2);
    assert.equal(missing.events.at(-1).code, "jam_not_found");
  } finally { api.close(); await rm(cwd, { recursive: true, force: true }); }
});

/* The owner's call, 11 Nov 2026: the CLI collects the minimum, and the jam's track, models and sponsors
   are chosen on the deploy's page. A person naming none of them is sent there; an agent still
   answers with flags, and a missing one still names its flag. */
test("a person who names no jam answer is sent to the deploy's page, and nothing is asked", async () => {
  const { chooseDestination, releasePage } = await import("../src/submit");
  const { Api } = await import("../src/http");
  const { Output } = await import("../src/output");
  const api = await harness({ jams: [jam] });
  const previous = process.env.OPENGAME_API_URL; process.env.OPENGAME_API_URL = api.origin;
  const client = new Api();
  const root = await mkdtemp(join(tmpdir(), "og-submit-page-"));
  try {
    const output = new Output(true, () => {});
    assert.equal(await chooseDestination(client, token, root, {}, false, true, output), "page");
    // An agent with no answers still exits 2 naming the flags, as before.
    await assert.rejects(chooseDestination(client, token, root, {}, false, false, output), { code: "jam_answers_required" });
    // A person who names an answer is held to the form, not sent away.
    const answered = await chooseDestination(client, token, root, { track: "rpg", models: "claude" }, false, true, output);
    assert.equal(typeof answered === "object" && answered?.track, "rpg");
    // Outside a linked folder the page is the account's games.
    assert.equal(await releasePage(client, token, root, false, releaseId), `${api.origin}/settings/games`);
    assert.equal(api.posts.length, 0, "nothing was submitted");
  } finally {
    await client.close(); api.close(); await rm(root, { recursive: true, force: true });
    if (previous === undefined) delete process.env.OPENGAME_API_URL; else process.env.OPENGAME_API_URL = previous;
  }
});

test("a person submitting while the newest deploy is not ready is told which deploy is in the way", async () => {
  const { chooseRelease } = await import("../src/submit");
  const { Api } = await import("../src/http");
  const { Output } = await import("../src/output");
  let latest: Record<string, unknown> = {};
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ game: { id: gameId, publicId: "abc123", title: "Orb Run", visibility: "draft", latestOperation: { id: submissionId, gameId, releaseId: null, error: null, ...latest } } }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const root = await mkdtemp(join(tmpdir(), "og-submit-choose-"));
  const previous = process.env.OPENGAME_API_URL; process.env.OPENGAME_API_URL = origin;
  const api = new Api();
  try {
    await mkdir(join(root, ".opengame"));
    await writeFile(join(root, ".opengame", "project.json"), JSON.stringify({ version: 1, origin, gameId }));
    const ask = (state: string) => { latest = { state }; return chooseRelease(api, token, root, {}, true, true, new Output(true, () => {})).then(() => null, (error: { code: string; message: string; next?: string }) => error); };
    // A redeploy whose upload was interrupted, beside a release that was playing:
    // "This game has no ready release yet" sent nobody anywhere useful.
    assert.deepEqual(await ask("uploading").then(e => [e?.message, e?.next]), ["Your newest deploy has not finished uploading. Run opengame deploy to resume it, then submit.", "opengame deploy"]);
    assert.equal((await ask("checking"))?.next, "opengame status --watch");
    assert.equal((await ask("failed"))?.next, "opengame status");
  } finally {
    await api.close(); server.close(); await rm(root, { recursive: true, force: true });
    if (previous === undefined) delete process.env.OPENGAME_API_URL; else process.env.OPENGAME_API_URL = previous;
  }
});

test("a returned submission's findings arrive as finding events with their fix, not as loose lines", async () => {
  const { reviewFindings } = await import("@opengame/protocol");
  const findings = reviewFindings(releaseId, [{ code: "below_bar", check: "agent-playtest", message: "No way to fail." }], []);
  const api = await harness({ submitBody: { submission: { ...view("returned"), outcome: { decision: "return", reason: "Add a fail state.", findings, appealable: true } } } });
  const cwd = await mkdtemp(join(tmpdir(), "og-returned-"));
  try {
    const result = await api.execute(cwd, "submit", "--release", releaseId, "--no-jam");
    assert.equal(result.code, 0);
    const finding = result.events.find((event: { type: string }) => event.type === "finding").finding;
    assert.deepEqual([finding.check, finding.certainty, finding.fault], ["agent-playtest", "heuristic", "game"]);
    assert.match(result.events.at(-1).data.message, /SUB-1042: Returned with fixes\. Read the findings/);
    assert.match(result.events.at(-1).data.message, /Add a fail state\./, "the reviewer's note is still printed");
  } finally { api.close(); await rm(cwd, { recursive: true, force: true }); }
});

test("a closed configured jam never falls back to marketplace, and destination flags cannot override it", async () => {
  const api = await harness({ jams: [{ ...jam, acceptingEntries: false }], formStatus: 409 });
  const cwd = await mkdtemp(join(tmpdir(), "og-destination-"));
  try {
    const closed = await api.execute(cwd, "submit", "--release", releaseId);
    assert.equal(closed.code, 2, JSON.stringify(closed.events));
    assert.equal(closed.events.at(-1).code, "jam_closed");
    const bypass = await api.execute(cwd, "submit", "--release", releaseId, "--no-jam");
    assert.equal(bypass.code, 2);
    assert.equal(bypass.events.at(-1).code, "submission_destination");
    assert.equal(api.posts.length, 0);
  } finally { api.close(); await rm(cwd, { recursive: true, force: true }); }
});

test("a missing destination fails before sending instead of inferring marketplace from no open jams", async () => {
  const api = await harness({ destination: {} });
  const cwd = await mkdtemp(join(tmpdir(), "og-destination-"));
  try {
    const result = await api.execute(cwd, "submit", "--release", releaseId);
    assert.equal(result.code, 5);
    assert.equal(result.events.at(-1).code, "invalid_response");
    assert.equal(api.posts.length, 0);
  } finally { api.close(); await rm(cwd, { recursive: true, force: true }); }
});

test("a renewed certification URL from polling is validated before final output", async () => {
  const unsafe = "https://evil.example/refreshed-certification";
  const api = await harness({ pollBody: { submission: { ...view("needs_certification"), certifyUrl: unsafe } } });
  const cwd = await mkdtemp(join(tmpdir(), "og-certify-poll-"));
  try {
    const result = await api.execute(cwd, "submit", "--release", releaseId, "--no-browser");
    assert.equal(result.code, 5, JSON.stringify(result.events));
    assert.equal(result.events.at(-1).code, "invalid_response");
    assert.ok(api.gets.length > 0);
    assert.ok(!JSON.stringify(result.events).includes(unsafe));
  } finally { api.close(); await rm(cwd, { recursive: true, force: true }); }
});


test("a spend admission pause reaches the CLI as a platform wait with the server's reset hint", async () => {
  const api = await harness({ submitStatus: 503, submitBody: { error: "spend_budget_paused", message: "Checks are paused until spending admission resumes.", retryAfterSeconds: 60 } });
  const cwd = await mkdtemp(join(tmpdir(), "og-spend-pause-"));
  try {
    const result = await api.execute(cwd, "submit", "--release", releaseId);
    assert.equal(result.code, 5, JSON.stringify(result.events));
    assert.equal(result.events.at(-1).code, "spend_budget_paused");
    assert.equal(result.events.at(-1).retry, "later");
    assert.equal(result.events.at(-1).retryAfterSeconds, 60);
    assert.doesNotMatch(result.events.at(-1).message, /change.*game|fix.*game/i);
  } finally { api.close(); await rm(cwd, { recursive: true, force: true }); }
});

// The QA destination (20261024110100). The CLI asks for it and the server decides; the
// jam is never read, never answered and never the fallback.
test("--qa asks for the QA destination with no jam answers, even while a jam is the operator's destination", async () => {
  const api = await harness({ jams: [jam], states: ["playtesting"] });
  const root = await mkdtemp(join(tmpdir(), "og-submit-qa-"));
  try {
    await writeFile(join(root, "opengame.json"), JSON.stringify({ title: "Proof game", description: "A proof game the team takes through review and publish.", genre: "rpg", controls: ["keyboard"] }));
    const result = await api.execute(root, "submit", root, "--release", releaseId, "--qa");
    assert.equal(result.code, 0, JSON.stringify(result.events));
    assert.deepEqual(api.posts.map(post => post.body), [{ releaseId, jam: null, destination: "qa" }]);
    assert.ok(!api.requests.some(line => line.includes("/api/v1/jams")), "the jam and its form are not read");
    assert.ok(result.events.some(e => e.type === "notice" && e.code === "qa_destination"));
    assert.ok(!result.events.some(e => e.type === "notice" && e.code === "jam"));
    const saved = JSON.parse(await readFile(join(root, ".opengame", "project.json"), "utf8"));
    assert.deepEqual(saved.submit.request, { releaseId, jam: null, destination: "qa" });
  } finally { api.close(); await rm(root, { recursive: true, force: true }); }
});

test("--qa beside a jam flag or a jam answer is refused before any request", async () => {
  const api = await harness({ jams: [jam] });
  const cwd = await mkdtemp(join(tmpdir(), "og-submit-qa-"));
  try {
    for (const extra of [["--jam", "fixture-jam"], ["--no-jam"], ["--track", "rpg"], ["--models", "claude"], ["--sponsor", "fal"], ["--evidence-fal", "Every texture"]]) {
      const result = await api.execute(cwd, "submit", "--release", releaseId, "--qa", ...extra);
      const error = result.events.at(-1);
      assert.equal(result.code, 2, JSON.stringify(error));
      assert.equal(error.code, "conflicting_flags");
      assert.ok(error.message.includes(extra[0]!), error.message);
    }
    assert.deepEqual(api.requests, []);
  } finally { api.close(); await rm(cwd, { recursive: true, force: true }); }
});

test("an account without a QA grant is told it needs one, exits 3 with retry never, and is not sent to the jam", async () => {
  // The server's sentence is the row in protocol's errors.ts. The body carries no retry,
  // so `retry: never` below can only have come from the CLI reading that row's exit 3.
  const { ERRORS } = await import("@opengame/protocol");
  const api = await harness({ jams: [jam], submitStatus: 403,
    submitBody: { error: "qa_destination_not_permitted", message: ERRORS.qa_destination_not_permitted!.message } });
  const cwd = await mkdtemp(join(tmpdir(), "og-submit-qa-"));
  try {
    const result = await api.execute(cwd, "submit", "--release", releaseId, "--qa");
    const error = result.events.at(-1);
    assert.equal(result.code, 3, JSON.stringify(error));
    assert.equal(error.type, "error");
    assert.equal(error.code, "qa_destination_not_permitted");
    assert.equal(error.retry, "never");
    assert.match(error.message, /needs a QA grant from an OpenGame owner in the console/);
    assert.match(error.message, /Nothing was submitted/);
    assert.equal(api.posts.length, 1, "no retry");
    assert.deepEqual(api.posts[0]!.body, { releaseId, jam: null, destination: "qa" });
    assert.ok(!api.requests.some(line => line.includes("/api/v1/jams")), "no jam fallback");
  } finally { api.close(); await rm(cwd, { recursive: true, force: true }); }
});

test("without --qa a submit sends no destination and still enters the operator's jam", async () => {
  const api = await harness({ jams: [jam], states: ["playtesting"] });
  const cwd = await mkdtemp(join(tmpdir(), "og-submit-qa-"));
  try {
    const result = await api.execute(cwd, "submit", "--release", releaseId, "--track", "rpg", "--models", "claude");
    assert.equal(result.code, 0, JSON.stringify(result.events));
    assert.deepEqual(api.posts[0]!.body, { releaseId, jam: { slug: "fixture-jam", track: "rpg", models: ["claude"], sponsors: [], evidence: {} } });
    assert.ok(api.requests.includes(`GET /api/v1/jams/${jam.slug}/form`));
    assert.ok(!result.events.some(e => e.code === "qa_destination"));
  } finally { api.close(); await rm(cwd, { recursive: true, force: true }); }
});

/* The one flow: the release's deploy already sent it to review, and the server answers a
   submit with that submission (`existing`) rather than a second paid review. The jam answers
   were not used, and "in review" alone read as "entered" (code review, 5 Nov 2026).
   Mutation-checked: removing the notice from submit.ts turns this red. */
test("jam answers answered with the release's automatic submission are said to be unused, with the page that enters the jam", async () => {
  const deployPage = "https://opengame.io/certify/SUB-1042";
  const api = await harness({ jams: [jam], submitStatus: 200, submitBody: { submission: { ...view("playtesting"), existing: true, certifyUrl: deployPage } } });
  const cwd = await mkdtemp(join(tmpdir(), "og-submit-existing-"));
  try {
    const result = await api.execute(cwd, "submit", "--release", releaseId, "--track", "rpg", "--models", "claude", "--no-wait", "--no-browser");
    assert.equal(result.code, 0, JSON.stringify(result.events));
    const notice = result.events.find(e => e.code === "jam_answers_unused");
    assert.ok(notice, JSON.stringify(result.events));
    assert.match(notice.message, /already in review, sent there by its deploy, so these jam answers were not used\. Enter the jam on its deploy page once review finishes: http:\/\/127\.0\.0\.1:\d+\/certify\/SUB-1042$/);
  } finally { api.close(); await rm(cwd, { recursive: true, force: true }); }
});

test("a fresh submission with jam answers says nothing about unused answers", async () => {
  const api = await harness({ jams: [jam], states: ["playtesting"] });
  const cwd = await mkdtemp(join(tmpdir(), "og-submit-existing-"));
  try {
    const result = await api.execute(cwd, "submit", "--release", releaseId, "--track", "rpg", "--models", "claude");
    assert.equal(result.code, 0, JSON.stringify(result.events));
    assert.ok(!result.events.some(e => e.code === "jam_answers_unused"));
  } finally { api.close(); await rm(cwd, { recursive: true, force: true }); }
});

test("a saved jam submit followed by --qa goes under a fresh key and never reads the jam submission", async () => {
  const api = await harness({ states: ["playtesting"] });
  const root = await mkdtemp(join(tmpdir(), "og-submit-qa-"));
  try {
    await writeFile(join(root, "opengame.json"), JSON.stringify({ title: "Proof game", description: "A proof game the team takes through review and publish.", genre: "rpg", controls: ["keyboard"] }));
    await mkdir(join(root, ".opengame"), { recursive: true });
    const jamRequest = { releaseId, jam: { slug: "fixture-jam", track: "rpg", models: ["claude"], sponsors: [], evidence: {} } };
    await writeFile(join(root, ".opengame", "project.json"), JSON.stringify({ version: 1, origin: api.origin, submit: { key: "jam-key", request: jamRequest, submissionId } }));
    const result = await api.execute(root, "submit", root, "--release", releaseId, "--qa");
    assert.equal(result.code, 0, JSON.stringify(result.events));
    assert.equal(api.posts.length, 1);
    assert.notEqual(api.posts[0]!.key, "jam-key", "a QA request is a different request, so it cannot replay the jam one");
    assert.deepEqual(api.gets, [], "the jam submission is not read as if it were this one");
    const saved = JSON.parse(await readFile(join(root, ".opengame", "project.json"), "utf8"));
    assert.equal(saved.submit.key, api.posts[0]!.key);
    assert.deepEqual(saved.submit.request, { releaseId, jam: null, destination: "qa" });
  } finally { api.close(); await rm(root, { recursive: true, force: true }); }
});

test("a damaged saved submit request stops submit with a message that names it, and leaves deploy's reading alone", async () => {
  const { readProject, savedSubmit } = await import("../src/project");
  const api = await harness();
  const root = await mkdtemp(join(tmpdir(), "og-submit-qa-"));
  try {
    await writeFile(join(root, "opengame.json"), JSON.stringify({ title: "Proof game", description: "A proof game the team takes through review and publish.", genre: "rpg", controls: ["keyboard"] }));
    await mkdir(join(root, ".opengame"), { recursive: true });
    for (const request of [{ releaseId, jam: null, destination: "staging" }, { releaseId, jam: { slug: "fixture-jam" }, destination: "qa" }]) {
      const file = JSON.stringify({ version: 1, origin: api.origin, gameId, submit: { key: "saved-key", request } });
      await writeFile(join(root, ".opengame", "project.json"), file);
      for (const args of [["--qa"], ["--no-jam"]]) {
        const result = await api.execute(root, "submit", root, "--release", releaseId, ...args);
        const error = result.events.at(-1);
        assert.equal(result.code, 2, JSON.stringify(error));
        assert.equal(error.code, "project_state");
        assert.match(error.message, /saved submit request/);
        assert.doesNotMatch(error.message, /deploy needed to resume/);
      }
      assert.equal(api.posts.length, 0);
      assert.equal(await readFile(join(root, ".opengame", "project.json"), "utf8"), file, "the entry is left for the person to decide on");
      // What deploy reads: the file opens, its game link stands, and the damaged entry reads as absent.
      const state = await readProject(root, api.origin);
      assert.equal(state.gameId, gameId);
      assert.equal(savedSubmit(state, false), undefined);
      assert.throws(() => savedSubmit(state, true), { code: "project_state" });
    }
  } finally { api.close(); await rm(root, { recursive: true, force: true }); }
});

test("a game that is already ordinary is refused the QA destination with the server's sentence and the input exit", async () => {
  const { ERRORS } = await import("@opengame/protocol");
  const row = ERRORS.qa_destination_game_mismatch!;
  const api = await harness({ submitStatus: 409, submitBody: { error: "qa_destination_game_mismatch", message: row.message } });
  const cwd = await mkdtemp(join(tmpdir(), "og-submit-qa-"));
  try {
    const result = await api.execute(cwd, "submit", "--release", releaseId, "--qa");
    const error = result.events.at(-1);
    assert.equal(result.code, 2, JSON.stringify(error));
    assert.equal(error.code, "qa_destination_game_mismatch");
    assert.equal(error.retry, row.retry);
    assert.equal(error.message, row.message);
    assert.equal(api.posts.length, 1, "no retry");
    assert.ok(!api.requests.some(line => line.includes("/api/v1/jams")), "no jam fallback");
  } finally { api.close(); await rm(cwd, { recursive: true, force: true }); }
});

test("a person confirming a --qa submit is asked about the QA destination, not review in general", async () => {
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ game: { id: gameId, publicId: "abc123", title: "Proof game", visibility: "draft", latestOperation: { id: submissionId, gameId, releaseId, error: null, state: "ready" } } }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const root = await mkdtemp(join(tmpdir(), "og-submit-confirm-"));
  const cli = fileURLToPath(new URL("..", import.meta.url));
  try {
    await mkdir(join(root, ".opengame"));
    await writeFile(join(root, ".opengame", "project.json"), JSON.stringify({ version: 1, origin, gameId }));
    // A real entrypoint rather than --eval, which tsx does not load on node 22 (AGENTS.md).
    const script = join(root, "confirm.mts");
    const module = (name: string) => JSON.stringify(new URL(`../src/${name}.ts`, import.meta.url).href);
    await writeFile(script, `import { chooseRelease } from ${module("submit")};
import { Api } from ${module("http")};
import { Output } from ${module("output")};
const api = new Api();
try { await chooseRelease(api, ${JSON.stringify(token)}, ${JSON.stringify(root)}, JSON.parse(process.argv[2]), true, true, new Output(true, () => {})); console.log("RESULT accepted"); }
catch (error) { console.log("RESULT " + error.code); }
finally { await api.close(); }
`);
    for (const [flags, question] of [[{ qa: true }, "Submit this release to the QA destination, not the jam? (y/N)"], [{}, "Submit this release for review? (y/N)"]] as const) {
      const child = spawn(process.execPath, ["--import", "tsx", script, JSON.stringify(flags)], { cwd: cli, env: { ...process.env, OPENGAME_API_URL: origin, NO_PROXY: "127.0.0.1" } });
      let stdout = "";
      child.stdout.on("data", chunk => { stdout += chunk; });
      child.stdin.end("n\n");
      await once(child, "close");
      assert.ok(stdout.includes(question), stdout);
      assert.match(stdout, /RESULT cancelled/);
    }
  } finally { server.close(); await rm(root, { recursive: true, force: true }); }
});


test("a QA refusal with no sentence in its body still names the grant, from the shared table", async () => {
  const api = await harness({ jams: [jam], submitStatus: 403, submitBody: { error: "qa_destination_not_permitted" } });
  const cwd = await mkdtemp(join(tmpdir(), "og-submit-qa-"));
  try {
    const result = await api.execute(cwd, "submit", "--release", releaseId, "--qa");
    const error = result.events.at(-1);
    assert.equal(result.code, 3, JSON.stringify(error));
    assert.equal(error.code, "qa_destination_not_permitted");
    assert.match(error.message, /needs a QA grant from an OpenGame owner/);
    assert.doesNotMatch(error.message, /token does not have access/);
  } finally { api.close(); await rm(cwd, { recursive: true, force: true }); }
});

test("a saved submit entry of null reads as no entry, as it did before the QA round", async () => {
  const { readProject, savedSubmit } = await import("../src/project");
  const api = await harness();
  const root = await mkdtemp(join(tmpdir(), "og-submit-qa-"));
  try {
    await mkdir(join(root, ".opengame"), { recursive: true });
    await writeFile(join(root, ".opengame", "project.json"), JSON.stringify({ version: 1, origin: api.origin, gameId, submit: null }));
    const state = await readProject(root, api.origin);
    assert.equal(savedSubmit(state, true), undefined);
  } finally { api.close(); await rm(root, { recursive: true, force: true }); }
});

/* The jam takes games and worlds only: its rules require that you own every asset and
   built it after kickoff, and a decomp or a mod is somebody else's game. The CLI refuses
   from the checkout's opengame.json before the jam's form is fetched, and the server
   refuses from the release, which is the answer that counts when the two disagree. */
test("a decomp or a mod is refused the jam from its own opengame.json, and the server's refusal has its row", async () => {
  const api = await harness({ jams: [jam], states: ["playtesting"] });
  const cwd = await mkdtemp(join(tmpdir(), "og-submit-"));
  const manifest = { title: "Doom but blue", description: "A blue palette and three new levels for an old shooter.", genre: "shooter-survival", controls: ["keyboard"] };
  const answers = ["--track", "rpg", "--models", "claude"];
  try {
    await writeFile(join(cwd, "opengame.json"), JSON.stringify({ ...manifest, kind: "mod", basedOn: "Doom" }));
    // Asked for by name: refused before anything is sent at all.
    const named = await api.execute(cwd, "submit", "--release", releaseId, "--jam", "fixture-jam", ...answers);
    assert.equal(named.code, 2, JSON.stringify(named.events));
    assert.equal(named.events.at(-1).code, "kind_not_in_jam");
    assert.match(named.events.at(-1).message, /^opengame\.json says this is a mod of Doom\. The jam takes games and worlds\. Decomps and mods can go on OpenGame but cannot enter it\./);
    assert.deepEqual(api.requests, []);
    // Entered by the operator's destination: refused once the destination says jam, before its form.
    const chosen = await api.execute(cwd, "submit", "--release", releaseId, ...answers);
    assert.equal(chosen.events.at(-1).code, "kind_not_in_jam");
    assert.deepEqual(api.requests, ["GET /api/v1/jams"]);
    assert.equal(api.posts.length, 0);
    // A world enters as it always did.
    await writeFile(join(cwd, "opengame.json"), JSON.stringify({ ...manifest, kind: "world" }));
    assert.equal((await api.execute(cwd, "submit", "--release", releaseId, ...answers)).code, 0);
  } finally { api.close(); await rm(cwd, { recursive: true, force: true }); }

  // The server's answer for a release that is a mod when the checkout says otherwise.
  const refusing = await harness({ jams: [jam], submitStatus: 409, submitBody: { error: "kind_not_in_jam", message: "The jam takes games and worlds. Decomps and mods can go on OpenGame but cannot enter it." } });
  const elsewhere = await mkdtemp(join(tmpdir(), "og-submit-"));
  try {
    const refused = await refusing.execute(elsewhere, "submit", "--release", releaseId, ...answers);
    assert.equal(refused.code, 2, JSON.stringify(refused.events));
    assert.equal(refused.events.at(-1).code, "kind_not_in_jam");
    assert.match(refused.events.at(-1).message, /takes games and worlds/);
  } finally { refusing.close(); await rm(elsewhere, { recursive: true, force: true }); }
});
