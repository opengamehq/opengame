import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CreatorGame, Submission } from "@opengame/protocol";
import { cleanEnv, events, fakeApi, reply, spawnCli, tempDir, token } from "./shell";

/**
 * What `opengame publish` says about the game's newest release, not the one before it.
 *
 * Creator walkthrough, 18 Nov 2026: run while an update was still queued for its checks,
 * publish answered "SUB-1455: published", the first version's result, because the game read
 * names its newest standing review and the update had none yet. A creator reads that as the
 * update being live. It now says the update is still being checked, which version stays live
 * meanwhile, and that an update of a live game goes live by itself once review passes.
 */

const gameId = "11111111-1111-4111-8111-111111111111";
const firstRelease = "44444444-4444-4444-8444-444444444444";
const update = "77777777-7777-4777-8777-777777777777";
const updateOperation = "33333333-3333-4333-8333-333333333333";

const submission = (state: Submission["state"], releaseId = firstRelease, ref = "SUB-1455"): Submission => ({
  id: releaseId === firstRelease ? "55555555-5555-4555-8555-555555555555" : "66666666-6666-4666-8666-666666666666",
  ref, state, releaseId, gameId, gamePublicId: "paperboat1", submittedAt: "2026-11-18T00:00:00Z", certifiedAt: null, jam: null,
  certifyUrl: null, gameUrl: "http://127.0.0.1/g/paperboat1", queuePosition: state === "review" ? 0 : null, outcome: null,
  live: state === "published" ? { url: "http://127.0.0.1/g/paperboat1", listed: true } : null, replacedBy: null, replayed: false, existing: false, hold: null,
});
const live = { state: "published" as const, releaseId: firstRelease, url: "http://127.0.0.1/g/paperboat1", listed: true, version: 1 };
const game = (latestOperation: CreatorGame["latestOperation"], review: Submission | null, publication: CreatorGame["publication"] = live): CreatorGame => ({
  id: gameId, publicId: "paperboat1", title: "Paper Boat Rapids", visibility: "published", latestOperation, publication, submission: review,
});
const operation = (state: "queued" | "checking" | "ready" | "failed", releaseId: string | null) => ({ id: updateOperation, gameId, state, releaseId, error: null });

async function linked(origin: string) {
  const root = await tempDir("og-publish-state-");
  await mkdir(join(root.dir, ".opengame"));
  await writeFile(join(root.dir, ".opengame/project.json"), JSON.stringify({ version: 1, origin, gameId }));
  return root;
}

async function publish(view: () => CreatorGame, extra: (url: string, method: string) => unknown = () => undefined) {
  const api = await fakeApi((req, res) => {
    const answer = extra(req.url!, req.method!);
    if (answer !== undefined) return reply(res, 200, answer);
    if (req.url === `/api/v1/games/${gameId}`) return reply(res, 200, { game: view() });
  });
  const root = await linked(api.origin);
  try {
    const run = await spawnCli(["publish", root.dir, "--json"], { env: cleanEnv({ OPENGAME_API_URL: api.origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" }) });
    return { run, last: events(run.stdout).at(-1)! as Record<string, unknown>, posted: api.seen.filter(seen => seen.method === "POST").map(seen => seen.url) };
  } finally { await api.close(); await root.remove(); }
}

test("publish during a queued update says the update is still being checked, never the version before it as published", async () => {
  const { run, last, posted } = await publish(() => game(operation("queued", null), submission("published")));
  assert.equal(run.code, 5, run.stdout + run.stderr);
  assert.equal(last.code, "review_pending");
  const message = String(last.message);
  assert.doesNotMatch(message, /SUB-1455: published/, "the first version's result is not this update's");
  assert.match(message, /still being checked/);
  assert.match(message, /Version 1 stays live until then\./);
  // An update of a live game publishes by itself once it passes, so publish --wait is not the step.
  assert.match(message, /goes live by itself once it passes review/);
  assert.equal(last.next, "opengame status --watch");
  assert.deepEqual(posted, [], "nothing is published");
});

test("publish with an update in review names the update and the version still live", async () => {
  const { run, last } = await publish(() => game(operation("ready", update), submission("review", update, "SUB-1456")));
  assert.equal(run.code, 5, run.stdout + run.stderr);
  assert.equal(last.code, "review_pending");
  const message = String(last.message);
  assert.match(message, /^SUB-1456: In review\./);
  assert.match(message, /Version 1 stays live until then\./);
  assert.match(message, /goes live by itself/);
  assert.equal(last.next, "opengame status --watch");
});

test("publish on a game already live with nothing newer says it is already live, with its version", async () => {
  const { run, last, posted } = await publish(() => game(operation("ready", firstRelease), submission("published")));
  assert.equal(run.code, 0, run.stdout + run.stderr);
  const data = last.data as { message: string; version: number | null; already: boolean; done: boolean };
  assert.equal(data.version, 1);
  assert.equal(data.already, true);
  assert.match(data.message, /^SUB-1455: already live as version 1, release 44444444\. Nothing new to publish\./);
  assert.deepEqual(posted, []);
});

test("a first publish says which version went live", async () => {
  let published = false;
  const { run, last, posted } = await publish(
    () => published ? game(operation("ready", firstRelease), submission("published")) : game(operation("ready", firstRelease), submission("awaiting_details"), null),
    (url, method) => {
      if (method === "POST" && url === "/api/v1/submissions/55555555-5555-4555-8555-555555555555/publish") { published = true; return { submission: submission("published") }; }
      return undefined;
    });
  assert.equal(run.code, 0, run.stdout + run.stderr);
  const data = last.data as { message: string; version: number | null; already: boolean };
  assert.equal(posted.length, 1);
  assert.equal(data.already, false);
  assert.equal(data.version, 1);
  assert.match(data.message, /^SUB-1455: published\. Version 1, release 44444444 is live\./);
});

test("a server that does not number versions still says which release is live", async () => {
  const { run, last } = await publish(() => game(operation("ready", firstRelease), submission("published"), { ...live, version: undefined }));
  assert.equal(run.code, 0, run.stdout + run.stderr);
  const data = last.data as { message: string; version: number | null };
  assert.equal(data.version, null);
  assert.match(data.message, /^SUB-1455: already live as release 44444444\./);
});

/* Code review of this change: a ready deploy with no review yet goes to review within the
   minute, so it is said rather than hidden behind "already live", and it is not made the
   release publish waits on, or a ready build that never gets a review would hold up an older
   one waiting on its creator. A failed newest deploy is said beside the live version. */
test("a ready update not yet in review is said, with the version still live", async () => {
  const { run, last, posted } = await publish(() => game(operation("ready", update), submission("published")));
  assert.equal(run.code, 5, run.stdout + run.stderr);
  assert.equal(last.code, "review_pending");
  assert.match(String(last.message), /^Release 77777777 passed its checks and goes to review within a minute\. Version 1 stays live until then\./);
  assert.deepEqual(posted, []);
});

/* Greptile on opengamehq/opengame#21: with --wait, a ready update not yet in review was not
   followed, while the same command run a moment earlier, during its checks, was. */
test("with --wait, a ready update not yet in review is followed until it is live", async () => {
  let reads = 0;
  const api = await fakeApi((req, res) => {
    if (req.url === `/api/v1/games/${gameId}`) {
      reads += 1;
      // Its review arrives on a later read, already live, as an update that passes goes.
      return reply(res, 200, { game: reads < 4 ? game(operation("ready", update), submission("published"))
        : game(operation("ready", update), submission("published", update, "SUB-1456"), { ...live, releaseId: update, version: 2 }) });
    }
  });
  const root = await linked(api.origin);
  try {
    const run = await spawnCli(["publish", root.dir, "--wait", "--json"], { env: cleanEnv({ OPENGAME_API_URL: api.origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" }), deadlineMs: 60_000 });
    const last = events(run.stdout).at(-1)! as Record<string, unknown>;
    assert.equal(run.code, 0, run.stdout + run.stderr);
    const data = last.data as { message: string; version: number | null; already: boolean };
    assert.equal(data.already, false);
    assert.match(data.message, /^SUB-1456: published\. Version 2, release 77777777 is live\./);
  } finally { await api.close(); await root.remove(); }
});

/* Greptile on opengamehq/opengame#21, second export: an update followed through its checks
   that is live by the first review read was said as "already live, nothing new". */
test("with --wait, an update followed through its checks to live is said as published, not already live", async () => {
  let reads = 0;
  const api = await fakeApi((req, res) => {
    if (req.url === `/api/v1/games/${gameId}`) {
      reads += 1;
      return reply(res, 200, { game: reads < 2 ? game(operation("checking", update), submission("published"))
        : game(operation("ready", update), submission("published", update, "SUB-1456"), { ...live, releaseId: update, version: 2 }) });
    }
  });
  const root = await linked(api.origin);
  try {
    const run = await spawnCli(["publish", root.dir, "--wait", "--json"], { env: cleanEnv({ OPENGAME_API_URL: api.origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" }), deadlineMs: 60_000 });
    const last = events(run.stdout).at(-1)! as Record<string, unknown>;
    assert.equal(run.code, 0, run.stdout + run.stderr);
    const data = last.data as { message: string; already: boolean };
    assert.equal(data.already, false);
    assert.match(data.message, /^SUB-1456: published\. Version 2, release 77777777 is live\./);
  } finally { await api.close(); await root.remove(); }
});

test("an older release waiting on its creator is still the one published past a newer ready build", async () => {
  const { run, last, posted } = await publish(() => game(operation("ready", update), submission("awaiting_details"), null),
    (url, method) => method === "POST" && url === "/api/v1/submissions/55555555-5555-4555-8555-555555555555/publish" ? { submission: submission("published") } : undefined);
  assert.equal(run.code, 0, run.stdout + run.stderr);
  assert.deepEqual(posted, ["/api/v1/submissions/55555555-5555-4555-8555-555555555555/publish"]);
  assert.equal((last.data as { already: boolean }).already, false);
});

test("a newest deploy that failed is said beside the version that is live", async () => {
  const { run, last } = await publish(() => game(operation("failed", update), submission("published")));
  assert.equal(run.code, 0, run.stdout + run.stderr);
  assert.match((last.data as { message: string }).message, /already live as version 1.*Your newest deploy, release 77777777, did not pass its checks: run opengame status to read why\.$/);
});

/* Greptile on opengamehq/opengame#27: an update of a live game publishes by itself once it
   passes review, so it never reaches the details step that carries the answers, and
   `deploy --publish --banner-style classic` on one reported success and saved nothing. The
   style is saved through the details endpoint once the release is live. Named with
   --release, as deploy --publish names its own release. */
async function publishUpdate(details: (body: string) => { status: number; value: unknown }, flags: string[] = ["--banner-style", "classic"]) {
  const api = await fakeApi((req, res, body) => {
    if (req.url === `/api/v1/games/${gameId}`) return reply(res, 200, { game: game(operation("ready", update), submission("published", update, "SUB-1456"), { ...live, releaseId: update, version: 2 }) });
    if (req.method === "PATCH" && req.url === `/api/v1/games/${gameId}/details`) { const answer = details(body); return reply(res, answer.status, answer.value); }
  });
  const root = await linked(api.origin);
  try {
    const run = await spawnCli(["publish", root.dir, "--release", update, ...flags, "--json"], { env: cleanEnv({ OPENGAME_API_URL: api.origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" }), deadlineMs: 60_000 });
    return { run, last: events(run.stdout).at(-1)! as Record<string, unknown>, seen: api.seen.filter(seen => seen.method !== "GET") };
  } finally { await api.close(); await root.remove(); }
}
const savedDetails = { gameId, publicId: "paperboat1", live: true, revision: 3, title: "Paper Boat Rapids", tagline: null, description: "Race the rapids.",
  bannerStyle: "classic", bannerRedrawing: true, url: "http://127.0.0.1/g/paperboat1" };

test("a banner style for an update that went live by itself is saved through the details endpoint", async () => {
  const { run, last, seen } = await publishUpdate(() => ({ status: 200, value: savedDetails }));
  assert.equal(run.code, 0, run.stdout + run.stderr);
  assert.deepEqual(seen.map(({ method, url, body }) => [method, url, JSON.parse(body)]), [["PATCH", `/api/v1/games/${gameId}/details`, { bannerStyle: "classic" }]]);
  assert.match((last.data as { message: string }).message, /^SUB-1456: published\. Version 2, release 77777777 is live\..* Its banner is being redrawn in the classic style, in a few minutes/);
});

test("without --banner-style, an update that went live by itself saves no details", async () => {
  const { run, seen } = await publishUpdate(() => ({ status: 500, value: {} }), []);
  assert.equal(run.code, 0, run.stdout + run.stderr);
  assert.deepEqual(seen, []);
});

test("a server that cannot save a banner style says the update is live and the style was not saved", async () => {
  const { run, last } = await publishUpdate(() => ({ status: 400, value: { error: "invalid_request", message: "Send a title, a tagline, a description or the models, as text." } }));
  assert.equal(run.code, 5, run.stdout + run.stderr);
  assert.equal(last.code, "edit_unavailable");
  assert.match(String(last.message), /^SUB-1456: published\. Version 2, release 77777777 is live\..* the style was not saved\. Choose it on the Details tab: http:\/\/127\.0\.0\.1:\d+\/settings\/games\/paperboat1$/);
});

/* Greptile on opengamehq/opengame#27, second review: a publish can name another game than the
   folder's (--game), so the retry it offers names the game too. A bare `opengame details` there
   would change the folder's game instead. */
test("a banner style that failed to save after an update offers a retry naming the game", async () => {
  const { run, last } = await publishUpdate(() => ({ status: 500, value: { error: "internal_error", message: "The database did not answer." } }));
  assert.notEqual(run.code, 0, run.stdout + run.stderr);
  assert.equal(last.next, `opengame details --game ${gameId} --banner-style classic`);
  assert.ok(String(last.message).includes(`Run opengame details --game ${gameId} --banner-style classic to save it.`), String(last.message));
});

test("a banner style saved with an unreadable answer points at the game it saved", async () => {
  const { run, last } = await publishUpdate(() => ({ status: 200, value: { nonsense: true } }));
  assert.notEqual(run.code, 0, run.stdout + run.stderr);
  assert.equal(last.code, "invalid_response");
  assert.equal(last.next, `opengame details --game ${gameId}`);
});

test("a first publish carries the banner style in its answers and saves no details", async () => {
  let published = false;
  const api = await fakeApi((req, res) => {
    if (req.url === `/api/v1/games/${gameId}`) return reply(res, 200, { game: published ? game(operation("ready", firstRelease), submission("published")) : game(operation("ready", firstRelease), submission("awaiting_details"), null) });
    if (req.method === "POST" && req.url === "/api/v1/submissions/55555555-5555-4555-8555-555555555555/publish") { published = true; return reply(res, 200, { submission: submission("published") }); }
  });
  const root = await linked(api.origin);
  try {
    const run = await spawnCli(["publish", root.dir, "--banner-style", "classic", "--json"], { env: cleanEnv({ OPENGAME_API_URL: api.origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" }) });
    assert.equal(run.code, 0, run.stdout + run.stderr);
    const sent = api.seen.filter(seen => seen.method !== "GET");
    assert.deepEqual(sent.map(seen => seen.method), ["POST"]);
    assert.equal(JSON.parse(sent[0]!.body).bannerStyle, "classic");
  } finally { await api.close(); await root.remove(); }
});

test("jams and a jam's form point at publish, not at submit", async () => {
  const jam = { slug: "fixture-jam", name: "Fixture jam", state: "open", acceptingEntries: true, startsAt: null, endsAt: null,
    rulesUrl: "https://opengame.io/rules", tracks: [{ key: "rpg", name: "RPG", kind: "theme" }] };
  const form = { formVersion: 1, jam: { ...jam, entriesPerCreator: 3, termsVersion: "2026-09-27" },
    track: { flag: "--track", label: "Genre track", options: [{ value: "rpg", label: "RPG" }] },
    models: { flag: "--models", label: "Models used", min: 1, options: [{ value: "claude", label: "Claude", provider: "Anthropic" }] },
    sponsors: { flag: "--sponsor", label: "Sponsor tracks", options: [{ value: "fal", label: "Best use of fal.ai", provider: "fal.ai", evidenceLabel: "What fal.ai did" },
      { value: "meshy", label: "Best use of Meshy", provider: "meshy", xPostRequired: true }] },
    evidence: { flagPrefix: "--evidence-", label: "What it did" } };
  let jams: unknown[] = [];
  const api = await fakeApi((req, res) => {
    if (req.url === "/api/v1/jams") return reply(res, 200, { jams });
    if (req.url === "/api/v1/jams/fixture-jam/form") return reply(res, 200, { form });
  });
  try {
    const env = cleanEnv({ OPENGAME_API_URL: api.origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" });
    const none = await spawnCli(["jams", "--json"], { env });
    assert.equal(none.code, 0, none.stdout + none.stderr);
    const empty = String((events(none.stdout).at(-1)!.data as { message: string }).message);
    assert.doesNotMatch(empty, /opengame submit/);
    assert.match(empty, /opengame publish/);
    jams = [jam];
    const one = await spawnCli(["jams", "fixture-jam", "--json"], { env });
    assert.equal(one.code, 0, one.stdout + one.stderr);
    const text = String((events(one.stdout).at(-1)!.data as { message: string }).message);
    assert.doesNotMatch(text, /opengame submit|--evidence-/);
    assert.match(text, /opengame publish --track <key> --models <keys>$/);
    assert.match(text, /--sponsor-email fal=you@example\.com/, "publish takes a sponsor's account email, not evidence");
    // Meshy's track asks for a post on X (26 Nov 2026); fal's does not, so only Meshy's row says so.
    assert.match(text, /Needs a post on X about the game: --sponsor-post meshy=https:\/\/x\.com\/you\/status\/123/);
    assert.doesNotMatch(text, /--sponsor-post fal=/);
  } finally { await api.close(); }
});

test("help says nothing about certifying", async () => {
  const run = await spawnCli(["help", "--json"], { env: cleanEnv({ CI: "1" }) });
  assert.equal(run.code, 0, run.stdout + run.stderr);
  assert.doesNotMatch(run.stdout, /certif/i);
});
