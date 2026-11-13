import test from "node:test";
import { folderArgument } from "../src/files";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { reviewFindings, type CreatorGame, type Submission } from "@opengame/protocol";
import { cleanEnv, events, fakeApi, reply, spawnCli, tempDir, token } from "./shell";

/**
 * Review as the CLI reports it, and the states that are not a ready preview.
 *
 * `opengame status` read only the deploy, so a release a reviewer had returned printed
 * "Private preview ready" and exit 0 while the skills told agents that status --watch
 * follows review. A removed game read as a ready preview too, and `opengame games` said
 * Ready beside both.
 */

const gameId = "11111111-1111-4111-8111-111111111111";
const operationId = "33333333-3333-4333-8333-333333333333";
const releaseId = "44444444-4444-4444-8444-444444444444";
const submissionId = "55555555-5555-4555-8555-555555555555";

const ready = { id: operationId, gameId, state: "ready", releaseId, error: null, publicId: "orbitrun01" };
const submission = (state: Submission["state"], outcome: Submission["outcome"] = null): Submission => ({
  id: submissionId, ref: "SUB-1113", state, releaseId, gameId, gamePublicId: "orbitrun01", submittedAt: "2026-10-05T00:00:00Z",
  certifiedAt: "2026-10-05T00:00:00Z", jam: null, certifyUrl: null, gameUrl: "http://127.0.0.1/g/orbitrun01", queuePosition: state === "review" ? 2 : null,
  outcome, live: null, replacedBy: null, replayed: false, existing: false, hold: null,
});
const returned = submission("returned", { decision: "return", reason: null, appealable: true,
  findings: reviewFindings(releaseId, [{ code: "eligibility_failed", check: "gpu-boot", message: "Start the game without a click." }],
    [{ releaseId, check: "gpu-boot", checkVersion: "1", state: "failed", evidence: { observed: "A black screen for 30 seconds.", fix: "Start the game without a click." } }]) });

async function linked(origin: string) {
  const root = await tempDir("og-review-");
  await mkdir(join(root.dir, ".opengame"));
  await writeFile(join(root.dir, ".opengame/project.json"), JSON.stringify({ version: 1, origin, gameId }));
  return root;
}

test("status reports the review: a returned release's findings in the repair shape, and the next command", async () => {
  const game: CreatorGame = { id: gameId, publicId: "orbitrun01", title: "Orb Run", visibility: "draft", latestOperation: ready as CreatorGame["latestOperation"],
    publication: null, status: { key: "returned", label: "Returned with fixes", message: "Read the findings, then deploy an updated release." }, submission: returned };
  const api = await fakeApi((req, res) => {
    if (req.url === `/api/v1/games/${gameId}`) return reply(res, 200, { game });
    if (req.url === `/api/v1/operations/${operationId}`) return reply(res, 200, { operation: ready });
  });
  const root = await linked(api.origin);
  try {
    const run = await spawnCli(["status", root.dir, "--jsonl"], { env: cleanEnv({ OPENGAME_API_URL: api.origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" }) });
    assert.equal(run.code, 0, run.stdout + run.stderr);
    const all = events(run.stdout);
    const finding = all.find(event => event.type === "finding")!.finding as Record<string, unknown>;
    assert.deepEqual([finding.check, finding.fault, finding.retry, finding.fix], ["gpu-boot", "game", "after-fix", "Start the game without a click."]);
    const data = all.at(-1)!.data as { submission: Submission; review: { state: string; done: boolean; next: string }; message: string; next: string };
    assert.equal(data.submission.state, "returned");
    assert.deepEqual([data.review.state, data.review.done], ["returned", true]);
    // A command an agent can run: the returned release is the newest, so a deploy comes first.
    assert.equal(data.next, "opengame deploy");
    assert.match(data.message, /SUB-1113: Returned with fixes\. Read the findings, then deploy an updated release\./);
    // The return is the headline, not "Private preview ready" above it (launch E2E, B-19).
    assert.match(data.message.split("\n")[0]!, /Returned with fixes/);
    assert.doesNotMatch(data.message, /Private preview ready/);
  } finally { await api.close(); await root.remove(); }
});

test("status tells the launch policy's hold from an outage, in words and in the JSON", async () => {
  const say = async (review: Submission) => {
    const game = { id: gameId, publicId: "orbitrun01", title: "Orb Run", visibility: "draft", latestOperation: ready, publication: null, submission: review };
    const api = await fakeApi((req, res) => {
      if (req.url === `/api/v1/games/${gameId}`) return reply(res, 200, { game });
      if (req.url === `/api/v1/operations/${operationId}`) return reply(res, 200, { operation: ready });
    });
    const root = await linked(api.origin);
    try {
      const run = await spawnCli(["status", root.dir, "--jsonl"], { env: cleanEnv({ OPENGAME_API_URL: api.origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" }) });
      assert.equal(run.code, 0, run.stdout + run.stderr);
      return events(run.stdout).at(-1)!.data as { review: { state: string; label: string; done: boolean; next: string | null; hold?: unknown }; message: string };
    } finally { await api.close(); await root.remove(); }
  };
  const held = await say({ ...submission("waiting"), hold: { reason: "verification", passed: true } });
  assert.deepEqual([held.review.state, held.review.label, held.review.hold], ["waiting", "On hold", { reason: "verification", passed: true }]);
  assert.match(held.message, /SUB-1113: On hold\. Your game passed the checks\. We are keeping it here while we finish verifying our test machine\./);
  assert.doesNotMatch(held.message, /unavailable|retry/);
  // Settled for an agent: no poll moves a hold, so --watch would be a loop.
  assert.deepEqual([held.review.done, held.review.next], [true, "opengame status"]);
  const outage = await say(submission("waiting"));
  assert.deepEqual([outage.review.label, outage.review.hold], ["Waiting on a check", undefined]);
  assert.match(outage.message, /A checking service is unavailable\. We will retry/);
  assert.deepEqual([outage.review.done, outage.review.next], [false, "opengame status --watch"]);
});

test("status --watch follows a review that is still moving until it settles", async () => {
  let reads = 0;
  const game = { id: gameId, publicId: "orbitrun01", title: "Orb Run", visibility: "draft", latestOperation: ready, publication: null, submission: submission("review") };
  const api = await fakeApi((req, res) => {
    if (req.url === `/api/v1/games/${gameId}`) return reply(res, 200, { game });
    if (req.url === `/api/v1/operations/${operationId}`) return reply(res, 200, { operation: ready });
    if (req.url === `/api/v1/submissions/${submissionId}`) { reads++; return reply(res, 200, { submission: returned }); }
  });
  const root = await linked(api.origin);
  try {
    const run = await spawnCli(["status", root.dir, "--watch", "--timeout", "3", "--jsonl"], { env: cleanEnv({ OPENGAME_API_URL: api.origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" }) });
    assert.equal(run.code, 0, run.stdout + run.stderr);
    const all = events(run.stdout);
    assert.ok(reads >= 1, "the submission was read again while it was with a person");
    const stages = all.filter(event => event.type === "progress").map(event => event.stage);
    assert.deepEqual(stages, ["review:review", "review:returned"]);
    assert.match(String(all.find(event => event.type === "progress")!.message), /In review\..*2 releases are ahead of yours/);
    assert.equal((all.at(-1)!.data as { review: { state: string } }).review.state, "returned");
  } finally { await api.close(); await root.remove(); }
});

test("status --watch says when an outage becomes the launch hold, and stops watching the hold", async () => {
  let reads = 0;
  const outage = submission("waiting");
  const held = { ...submission("waiting"), hold: { reason: "verification" as const, passed: false } };
  const game = { id: gameId, publicId: "orbitrun01", title: "Orb Run", visibility: "draft", latestOperation: ready, publication: null, submission: outage };
  const api = await fakeApi((req, res) => {
    if (req.url === `/api/v1/games/${gameId}`) return reply(res, 200, { game });
    if (req.url === `/api/v1/operations/${operationId}`) return reply(res, 200, { operation: ready });
    if (req.url === `/api/v1/submissions/${submissionId}`) { reads++; return reply(res, 200, { submission: held }); }
  });
  const root = await linked(api.origin);
  try {
    // One poll interval (statusPollMs, 15 s) to the read that finds the hold; a watch
    // that kept going would read again at the 30 s deadline.
    const run = await spawnCli(["status", root.dir, "--watch", "--timeout", "30", "--jsonl"], { deadlineMs: 50_000, env: cleanEnv({ OPENGAME_API_URL: api.origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" }) });
    assert.equal(run.code, 0, run.stdout + run.stderr);
    const progress = events(run.stdout).filter(event => event.type === "progress");
    assert.deepEqual(progress.map(event => event.stage), ["review:waiting", "review:waiting", "review:held"]);
    assert.match(String(progress[0]!.message), /Waiting on a check/);
    assert.match(String(progress[1]!.message), /On hold\. The checks have finished/);
    assert.equal(progress[2]!.message, "Stopped watching. A release on hold waits until our test machine is verified.");
    assert.equal(reads, 1, "a hold is not polled again");
    const review = (events(run.stdout).at(-1)!.data as { review: { done: boolean; next: string | null } }).review;
    assert.deepEqual([review.done, review.next], [true, "opengame status"]);
  } finally { await api.close(); await root.remove(); }
});

test("status --watch on a release already on hold says so once and does not poll it", async () => {
  let reads = 0;
  const held = { ...submission("waiting"), hold: { reason: "verification" as const, passed: true } };
  const game = { id: gameId, publicId: "orbitrun01", title: "Orb Run", visibility: "draft", latestOperation: ready, publication: null, submission: held };
  const api = await fakeApi((req, res) => {
    if (req.url === `/api/v1/games/${gameId}`) return reply(res, 200, { game });
    if (req.url === `/api/v1/operations/${operationId}`) return reply(res, 200, { operation: ready });
    if (req.url === `/api/v1/submissions/${submissionId}`) { reads++; return reply(res, 200, { submission: held }); }
  });
  const root = await linked(api.origin);
  try {
    // A 30 s window and the default 20 s kill: a watch that polled would sleep 15 s,
    // read, and run past the kill waiting for the window to close.
    const run = await spawnCli(["status", root.dir, "--watch", "--timeout", "30", "--jsonl"], { env: cleanEnv({ OPENGAME_API_URL: api.origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" }) });
    assert.equal(run.code, 0, run.stdout + run.stderr);
    const progress = events(run.stdout).filter(event => event.type === "progress");
    assert.deepEqual(progress.map(event => event.stage), ["review:waiting", "review:held"]);
    assert.match(String(progress[0]!.message), /On hold\. Your game passed the checks/);
    assert.equal(reads, 0, "a hold is not polled");
  } finally { await api.close(); await root.remove(); }
});

test("a removed game is refused by status, link, open and pull, and listed as unavailable", async () => {
  const game = { id: gameId, publicId: "takendown1", title: "Taken down", visibility: "removed", latestOperation: ready, publication: null,
    status: { key: "taken_down", label: "Unavailable", message: "Nobody can play this game now, including you." } };
  const api = await fakeApi((req, res) => {
    if (req.url === "/api/v1/games") return reply(res, 200, { games: [game, { ...game, id: "22222222-2222-4222-8222-222222222222", publicId: "orbitrun01", title: "Orb Run",
      visibility: "draft", status: { key: "returned", label: "Returned with fixes", message: "Read the findings." }, latestOperation: { ...ready, gameId: "22222222-2222-4222-8222-222222222222" } }], nextCursor: null });
    if (req.url?.startsWith("/api/v1/games/")) return reply(res, 200, { game });
    if (req.url === `/api/v1/operations/${operationId}`) return reply(res, 200, { operation: ready });
  });
  const root = await linked(api.origin);
  const env = cleanEnv({ OPENGAME_API_URL: api.origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" });
  try {
    for (const args of [["status", root.dir], ["open", root.dir], ["open", "--game", "takendown1"], ["pull", root.dir], ["link", root.dir, "--game", "takendown1", "--replace"]]) {
      const run = await spawnCli([...args, "--jsonl"], { env });
      assert.deepEqual([run.code, events(run.stdout).at(-1)!.code], [2, "game_removed"], `${args.join(" ")}: ${run.stdout}`);
    }
    const list = String((events((await spawnCli(["games", "--jsonl"], { env })).stdout).at(-1)!.data as { message: string }).message);
    assert.match(list, /takendown1  Taken down  \(Unavailable\)/);
    // The list uses the words Your games uses for a reviewed game, not the deploy's Ready.
    assert.match(list, /orbitrun01  Orb Run  \(Returned with fixes\)/);
  } finally { await api.close(); await root.remove(); }
});

test("a folder with no opengame.json is told to run init, as input rather than a broken game", async () => {
  const root = await tempDir("og-empty-");
  try {
    const run = await spawnCli(["check", root.dir, "--jsonl"], { env: cleanEnv() });
    const last = events(run.stdout).at(-1)!;
    // The folder this was given, not ".", which was a different folder (area F, 1 Nov 2026).
    assert.deepEqual([run.code, last.code, last.next], [2, "manifest_missing", `opengame init ${folderArgument(root.dir)}`]);
    assert.notEqual(last.next, "opengame init .");
  } finally { await root.remove(); }
});

test("a mistyped command suggests the nearest one, and an unknown flag points at its command's help", async () => {
  const typo = await spawnCli(["tokens", "--jsonl"], { env: cleanEnv() });
  const last = events(typo.stdout).at(-1)!;
  assert.equal(typo.code, 2);
  assert.match(String(last.message), /Did you mean opengame token\?/);
  assert.equal(last.next, "opengame token --help");
  const flag = events((await spawnCli(["deploy", "--bogus", "--jsonl"], { env: cleanEnv() })).stdout).at(-1)!;
  assert.deepEqual([flag.code, flag.next], ["unknown_flag", "opengame deploy --help"]);
  const far = events((await spawnCli(["zzzzzzzz", "--jsonl"], { env: cleanEnv() })).stdout).at(-1)!;
  assert.doesNotMatch(String(far.message), /Did you mean/);
  // A swapped pair is one slip, not two. Plain edit distance put stauts nearer stats.
  const swapped = events((await spawnCli(["stauts", "--jsonl"], { env: cleanEnv() })).stdout).at(-1)!;
  assert.match(String(swapped.message), /Did you mean opengame status\?/);
});

test("init --help keeps its descriptions on the screen", async () => {
  // The engine flag's fifty-odd ids once sat in the flag column and pushed every
  // description in init --help to column 388.
  const run = await spawnCli(["init", "--help"], { env: cleanEnv() });
  const help = JSON.parse(run.stdout).data;
  const options = (help.message as string).split("Options\n")[1]!.split("\n\n")[0]!.split("\n").filter(line => line.startsWith("  --"));
  for (const line of options) assert.ok(/^ {2}\S.{0,46}\S {2,}\S/.test(line), line.slice(0, 120));
  assert.match(help.message, /--engine <engine> {2,}.*Choose from threejs, phaser/);
  // The structured help still carries every value on its own.
  assert.ok(help.flags.find((flag: { name: string }) => flag.name === "--engine").values.includes("custom"));
});

test("a command's options line up in one column", async () => {
  const run = await spawnCli(["login", "--help"], { env: cleanEnv() });
  const message = JSON.parse(run.stdout).data.message as string;
  const options = message.split("Options\n")[1]!.split("\n\n")[0]!.split("\n").filter(line => line.startsWith("  --"));
  assert.ok(options.length >= 3, run.stdout);
  // Where each description starts: after the flag and the first run of two or more spaces.
  const columns = new Set(options.map(line => { const gap = /\S {2,}(?=\S)/.exec(line.slice(2))!; return 2 + gap.index + gap[0].length; }));
  assert.equal(columns.size, 1, options.join("\n"));
});

test("a person whose login code lapsed gets a fresh one and the terminal keeps waiting", { skip: process.platform === "win32" }, async () => {
  let codes = 0;
  const api = await fakeApi((req, res) => {
    if (req.url === "/api/v1/auth/device") { codes++; return reply(res, 200, { device_code: String(codes).repeat(43), user_code: codes === 1 ? "BCDF-GHJK" : "LMNP-QRST",
      verification_uri: `${api.origin}/cli`, expires_in: 1, interval: 5 }); }
    if (req.url === "/api/v1/auth/token") return reply(res, 400, { error: "expired_token" });
  });
  const config = await tempDir("og-login-renew-");
  try {
    const run = await spawnCli(["login", "--no-browser"], { tty: true, stdin: "open", deadlineMs: 20_000,
      env: cleanEnv({ OPENGAME_API_URL: api.origin, NO_PROXY: "127.0.0.1", XDG_CONFIG_HOME: config.dir, OPENGAME_CREDENTIAL_STORE: "file" }) });
    // It used to end on the first lapse with "Run opengame login for a new code".
    assert.equal(codes, 2, run.stdout);
    assert.match(run.stdout, /That code expired before access was allowed\. Here is a new one\./);
    assert.match(run.stdout, /L.?M.?N.?P/);
    assert.equal(run.code, 3, "a second lapse still ends the command");
  } finally { await api.close(); await config.remove(); }
});

test("a token that may not read the review is told so, rather than shown nothing", async () => {
  // A current server sends status; leaving submission out is it saying this credential cannot read it.
  const game = { id: gameId, publicId: "orbitrun01", title: "Orb Run", visibility: "draft", latestOperation: ready, publication: null,
    status: { key: "review", label: "In review", message: "This release is still in review. You do not need to do anything." } };
  const api = await fakeApi((req, res) => {
    if (req.url === `/api/v1/games/${gameId}`) return reply(res, 200, { game });
    if (req.url === `/api/v1/operations/${operationId}`) return reply(res, 200, { operation: ready });
  });
  const root = await linked(api.origin);
  try {
    const run = await spawnCli(["status", root.dir, "--jsonl"], { env: cleanEnv({ OPENGAME_API_URL: api.origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" }) });
    assert.equal(run.code, 0);
    assert.ok(events(run.stdout).some(event => event.code === "review_unreadable"), run.stdout);
  } finally { await api.close(); await root.remove(); }
});
