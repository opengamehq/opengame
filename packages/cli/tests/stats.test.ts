import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { analyticsSearch, analyticsText, redactAnalyticsText, reportWindowLabel } from "../src/stats";
import { analyticsReportSchema, windowRange } from "@opengame/protocol";
import { gameId, testToken, report, reportFor, reportForQuery } from "./analytics-fixture";
import { Api } from "../src/http";

const exec = promisify(execFile);
const binary = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));

test("stats reaches the owner API from a game ID or a read-only project link, preserving report semantics", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-stats-"));
  const requests: string[] = [];
  let status = 200;
  let response: unknown;
  const server = createServer((req, res) => {
    requests.push(req.url!);
    assert.equal(req.headers.authorization, `Bearer ${testToken}`);
    res.writeHead(status, { "content-type": "application/json", ...(status === 429 ? { "retry-after": "17" } : {}) });
    res.end(JSON.stringify(response ?? reportForQuery(new URL(req.url!, "http://localhost").searchParams)));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const env = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: testToken, NO_PROXY: "127.0.0.1", OPENGAME_DEBUG: "0" };
  const run = (...args: string[]) => exec(process.execPath, [binary, "stats", ...args, "--json"], { env, cwd: root });
  const failure = async (code: string, exit: number, ...args: string[]) => {
    await assert.rejects(run(...args), (error: any) => {
      assert.equal(error.code, exit);
      const result = JSON.parse(error.stdout);
      assert.equal(result.code, code);
      assert.ok(!error.stdout.includes(testToken));
      return true;
    });
  };
  try {
    const first = JSON.parse((await run(gameId, "--window", "week", "--period", "2026-W42", "--funnel", "start,end")).stdout);
    assert.equal(first.ok, true);
    assert.equal(first.command, "stats");
    assert.deepEqual(first.data.summary, report.summary);
    const url = new URL(requests[0]!, origin);
    assert.equal(url.pathname, `/api/v1/games/${gameId}/stats`);
    assert.equal(url.searchParams.get("window"), "week");
    assert.equal(url.searchParams.get("period"), "2026-W42");
    for (const retired of ["from", "to", "timezone"]) assert.equal(url.searchParams.has(retired), false);
    assert.equal(url.searchParams.get("funnel"), "start,end");
    assert.deepEqual(first.data.window, { kind: "week", period: "2026-W42", start: "2026-10-12T00:00:00.000Z", end: "2026-10-19T00:00:00.000Z" });
    assert.equal(first.data.from, "2026-10-12"); assert.equal(first.data.to, "2026-10-18");
    assert.equal(first.data.timezone, "UTC");
    assert.equal(first.data.message.split("\n")[1], "Week 42 · Oct 12 to 18, 2026 · UTC");
    assert.deepEqual(first.data.filters, {});
    assert.deepEqual(first.data.funnel, ["start", "end"]);
    // A week with no period, and no window at all, leave the choice to the server,
    // whose clock decides which week is the newest complete one.
    await run(gameId, "--window", "week");
    assert.equal(requests.at(-1), `/api/v1/games/${gameId}/stats?window=week`);
    const defaults = JSON.parse((await run(gameId)).stdout);
    assert.equal(requests.at(-1), `/api/v1/games/${gameId}/stats`);
    assert.deepEqual(defaults.data.window, report.window);
    // Filters were removed on 23 Oct 2026. Each flag is refused by name, before any
    // request, with the API's own code and sentence, rather than read as unknown.
    const beforeFilters = requests.length;
    for (const args of [["--country", "US"], [gameId, "--property", "mode", "--value", "../assets/map.json"], ["--build", "b1"], ["--build"], ["--source=direct"], ["--device", "mobile", "--period", "2026-W42"]]) {
      await failure("filters_removed", 2, ...args);
      await assert.rejects(run(...args), (error: any) => {
        assert.equal(JSON.parse(error.stdout).message, "Filters were removed to protect player privacy. Use the breakdown rows in the weekly report instead.");
        return true;
      });
    }
    assert.equal(requests.length, beforeFilters);
    const api = new Api(origin);
    try { await assert.rejects(api.json("/api/v1/games/../whoami", { token: testToken }), { code: "api_path" }); }
    finally { await api.close(); }
    await mkdir(join(root, ".opengame"));
    const state = JSON.stringify({ version: 1, origin, gameId });
    await writeFile(join(root, ".opengame/project.json"), state);
    assert.equal(JSON.parse((await run()).stdout).data.gameId, gameId);
    assert.equal(requests.at(-1), `/api/v1/games/${gameId}/stats`);
    assert.equal(await readFile(join(root, ".opengame/project.json"), "utf8"), state);
    assert.equal(JSON.parse((await run("--game", "littleorbit")).stdout).data.gameId, gameId);
    assert.equal(requests.at(-1), "/api/v1/games/littleorbit/stats");
    await failure("ambiguous_game", 2, gameId, "--game", "littleorbit");
    await failure("invalid_game", 2, "--game", "../escape");
    // The old range options are refused by name, before any request, whatever their
    // value, UTC included: a script that sent them meant a range windows cannot give.
    const beforeRetired = requests.length;
    for (const args of [["--from", "2026-10-01"], ["--to", "2026-10-19"], ["--timezone", "America/New_York"], ["--timezone=UTC"],
      ["--from", "2026-10-01", "--to", "2026-10-19", "--window", "week"], [gameId, "--funnel", "a,b", "--to=2026-10-19"]]) {
      await failure("range_not_supported", 2, ...args);
      await assert.rejects(run(...args), (error: any) => {
        const message = JSON.parse(error.stdout).message;
        assert.match(message, /--window/); assert.match(message, /--period/);
        return true;
      });
    }
    assert.equal(requests.length, beforeRetired);
    await failure("invalid_range", 2, "--window", "week", "--period", "2025-W53");
    await failure("invalid_range", 2, "--period", "2026-10");
    await failure("invalid_range", 2, "--period", "2026-10-20");
    // Days, months and all time were withdrawn on 22 Oct 2026. Each is refused by name,
    // before any request, with the week that replaced them.
    for (const args of [["--window", "day", "--period", "2026-10-20"], ["--window", "month"], ["--window", "all"], ["--window", "year"]]) {
      await failure("invalid_range", 2, ...args);
      await assert.rejects(run(...args), (error: any) => {
        const message = JSON.parse(error.stdout).message;
        assert.match(message, /--window week/); assert.match(message, /--period/);
        return true;
      });
    }
    assert.equal(requests.length, beforeRetired);
    response = report;
    await failure("invalid_response", 5, "--window", "week", "--period", "2026-W01");
    await failure("invalid_response", 5, "--funnel", "start,end");
    response = { ...report, window: undefined };
    await failure("invalid_response", 5);
    response = { ...report, timezone: "America/New_York" };
    await failure("invalid_response", 5);
    for (const funnel of [undefined, ["start", "other"], ["end", "start"], ["start", "end", "extra"]]) {
      response = { ...report, funnel };
      await failure("invalid_response", 5, "--funnel", "start,end");
    }
    response = { ...report, funnel: ["start", "end"] };
    await failure("invalid_response", 5);
    // An unavailable result still carries the requested funnel identity. Missing
    // measurements are allowed; a different query's measurements are not.
    response = { ...report, funnel: ["start", "end"], funnels: undefined,
      freshness: { ...report.freshness, unavailable: [...report.freshness.unavailable, "funnels"] } };
    assert.deepEqual(JSON.parse((await run("--funnel", "start,end")).stdout).data.funnel, ["start", "end"]);
    response = { ...report, summary: { ...report.summary, plays: "27" } };
    await failure("invalid_response", 5);
    response = { ...report, gameId: "22222222-2222-4222-8222-222222222222" };
    await failure("invalid_response", 5);
    response = { ...report, accessToken: testToken, preview: [{ ...report.preview![0], name: `data ${testToken}` }] };
    const safe = JSON.parse((await run()).stdout);
    assert.ok(!JSON.stringify(safe).includes(testToken));
    assert.equal(safe.data.accessToken, undefined);
    const lowerToken = "ogt_0123456789abcdef_" + "a".repeat(43);
    status = 400; response = { error: lowerToken, message: "Unavailable" };
    await failure("api_error", 2);
    status = 403; response = { error: "insufficient_scope" };
    await failure("insufficient_scope", 3);
    status = 429; response = { error: "rate_limited" };
    await failure("rate_limited", 4);
    try { await run(); } catch (error: any) { assert.equal(JSON.parse(error.stdout).retryAfterSeconds, 17); }
  } finally {
    server.closeAllConnections(); await new Promise<void>(done => server.close(() => done()));
    await rm(root, { recursive: true, force: true });
  }
});

test("stats help is discoverable and documents windows, the funnel and owner access", async () => {
  const data = JSON.parse((await exec(process.execPath, [binary, "stats", "--help", "--json"])).stdout).data;
  assert.match(data.description, /own/);
  for (const flag of ["--window", "--period", "--game", "--funnel", "--jsonl", "--token-stdin"]) assert.ok(data.flags.some((f: any) => f.name === flag));
  for (const flag of ["--from", "--to", "--timezone", "--country", "--property", "--value", "--build", "--source", "--surface", "--device", "--event"]) assert.ok(!data.flags.some((f: any) => f.name === flag), flag);
  assert.deepEqual(data.flags.find((f: any) => f.name === "--window").values, ["week"]);
  assert.ok(!data.examples.some((line: string) => /--from|--to|--timezone|--country/.test(line)));
  const catalog = JSON.parse((await exec(process.execPath, [binary, "help", "--json"])).stdout).data;
  assert.ok(catalog.commands.stats);
});

test("readable stats name partial data and withheld values without inventing zeroes", () => {
  const text = analyticsText(report);
  assert.match(text, /Returning players: Unavailable/);
  assert.match(text, /provisional data/);
  assert.match(text, /game-reported/);
  assert.match(text, /quality: legacy/);
  assert.match(text, /Not available this week: performance\./);
  // Area F, 1 Nov 2026: "Playtime: Unavailable s", the raw id as the title, and a server
  // sentence joined to a field name as "Try again later., livePlayers".
  assert.doesNotMatch(text, /Unavailable s\b/);
  const named = analyticsText({ ...report, summary: { ...report.summary, playtimeSeconds: null, averagePlaytimeSeconds: 90 },
    freshness: { ...report.freshness, unavailable: ["Whether all of this week’s events have arrived could not be checked. Try again later.", "livePlayers"] } }, "Brickwork");
  assert.match(named, /^Stats for Brickwork \(/);
  assert.match(named, /Playtime: Unavailable  Average \/ player: 90 s/);
  assert.match(named, /^Whether all of this week’s events have arrived could not be checked\. Try again later\.$/m);
  assert.match(named, /^Not available this week: live players\.$/m);
  assert.doesNotMatch(named, /later\., /);
  assert.equal(redactAnalyticsText(`Bearer ${testToken}`), "Bearer [token]");
  assert.equal(analyticsSearch({ window: "week", period: "2026-W43" }), "?window=week&period=2026-W43");
  // Filters were removed on 23 Oct 2026: refused with the API's code and sentence, never dropped.
  for (const filtered of [{ country: "US" }, { property: "mode", value: "x" }, { event: "end" }, { build: "b1" }, { window: "week", period: "2026-W43", device: "mobile" }])
    assert.throws(() => analyticsSearch(filtered as never), (error: any) => error.code === "filters_removed" && error.exitCode === 2
      && error.message === "Filters were removed to protect player privacy. Use the breakdown rows in the weekly report instead.", JSON.stringify(filtered));
  assert.equal(analyticsSearch({}), "");
  assert.throws(() => analyticsSearch({ from: "2026-10-01" } as never), (error: any) => error.code === "range_not_supported" && error.exitCode === 2);
  for (const window of ["day", "month", "all"]) assert.throws(() => analyticsSearch({ window } as never), (error: any) => error.code === "invalid_range" && error.exitCode === 2);
  assert.equal(reportWindowLabel(reportFor(windowRange({ kind: "week", period: "2026-W01" }))), "Week 1 · Dec 29, 2025 to Jan 4, 2026 · UTC");
  // A report saved before fixed windows has no window to name, and keeps its days.
  assert.equal(reportWindowLabel({ ...report, window: undefined, from: "2026-10-01", to: "2026-10-19", timezone: "America/New_York" }), "2026-10-01 to 2026-10-19 (America/New_York, inclusive)");
  assert.equal(analyticsReportSchema.safeParse({ ...report, summary: { ...report.summary, plays: -1 } }).success, false);
});
test("source quality names players and playtime in the week, with no seven-day return", () => {
  const insights = { from: report.from, to: report.to, timezone: "UTC", updatedAt: "2026-10-20T06:00:00.000Z", minPlayers: 5, discovery: [],
    sources: [{ source: "reddit.com", players: 12, averagePlaytimeSeconds: 90 }], benchmarks: { own: { status: "unavailable", games: null, medianSeconds: null, lowerSeconds: null, upperSeconds: null },
      peers: { status: "unavailable", games: null, medianSeconds: null, lowerSeconds: null, upperSeconds: null } },
    drilldown: { builds: [], sessions: [], errors: [], selectedBuild: null, selectedSession: null }, unavailable: [] };
  const text = analyticsText({ ...report, insights } as never);
  assert.match(text, /reddit\.com: 12 players; average playtime 90 s/);
  assert.doesNotMatch(text, /D7/);
});
