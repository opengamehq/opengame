import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { once } from "node:events";

/**
 * `opengame stats --csv <file>`: the Stats tab's CSV, from the server's own export route, with
 * the same query as the JSON read, the same check that it is the week asked for, tokens
 * redacted, an existing file never written over and never asked for, and no file left by a
 * run that failed.
 */
const run = promisify(execFile);
const binary = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
const GAME = "11111111-1111-4111-8111-111111111111";
const token = "ogt_" + "a".repeat(16) + "_" + "b".repeat(43);
const leaked = "ogt_" + "c".repeat(16) + "_" + "d".repeat(43);
const HEADER = ["section", "label", "plays", "players", "playtimeSeconds", "value", "window", "period", "timezone", "from", "to"];
/** The shape `analyticsCsv` writes: every cell quoted, every row naming its window. */
const csvFor = (period: string, note = "") => [HEADER, ["summary", "total", "42", "17", "3600", "", "week", period, "UTC", "2026-10-19", "2026-10-25"],
  ["coverage", "note", "", "", "", note, "week", period, "UTC", "2026-10-19", "2026-10-25"]]
  .map(row => row.map(cell => `"${cell}"`).join(",")).join("\r\n") + "\r\n";

type Answer = { status: number; type: string; body: string; headers?: Record<string, string> };
async function fake(answer: Answer) {
  const seen: string[] = [];
  const server = createServer((req, res) => {
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    seen.push(req.url!);
    res.statusCode = answer.status; res.setHeader("content-type", answer.type);
    for (const [name, value] of Object.entries(answer.headers ?? {})) res.setHeader(name, value);
    res.end(answer.body);
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  return { seen, origin: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}
async function cli(origin: string, cwd: string, ...args: string[]) {
  const env = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1", OPENGAME_TEST_SKIP_LAUNCH_CHECK: "1" };
  try { return { code: 0, event: JSON.parse((await run(process.execPath, [binary, ...args, "--json"], { env, cwd, timeout: 20000 })).stdout) }; }
  catch (error) { const failed = error as { code: number; stdout: string }; return { code: failed.code, event: JSON.parse(failed.stdout) }; }
}
const absent = (path: string) => assert.rejects(readFile(path), undefined, `${path} was left behind`);

test("--csv writes the server's CSV for the week asked, redacted, and never asks for a file already there", async () => {
  const server = await fake({ status: 200, type: "text/csv; charset=utf-8", body: csvFor("2026-W43", leaked) });
  const dir = await mkdtemp(join(tmpdir(), "og-stats-csv-"));
  try {
    const out = await cli(server.origin, dir, "stats", "--game", GAME, "--period", "2026-W43", "--csv", "week.csv");
    assert.equal(out.code, 0, JSON.stringify(out.event));
    assert.deepEqual(server.seen, [`/api/v1/games/${GAME}/stats/export?period=2026-W43`]);
    const written = await readFile(join(dir, "week.csv"), "utf8");
    assert.equal(written, csvFor("2026-W43", "[token]"));
    assert.equal(out.event.data.file, join(dir, "week.csv"));
    // Taken already: refused before the server is asked, and the file is as it was.
    const again = await cli(server.origin, dir, "stats", "--game", GAME, "--csv", "week.csv");
    assert.deepEqual([again.code, again.event.code], [2, "csv_exists"]);
    assert.equal(server.seen.length, 1);
    assert.equal(await readFile(join(dir, "week.csv"), "utf8"), written);
    // A folder that is not there is named as the reason, also before any request.
    const nowhere = await cli(server.origin, dir, "stats", "--game", GAME, "--csv", "nodir/x.csv");
    assert.deepEqual([nowhere.code, nowhere.event.code], [2, "csv_unwritable"]);
    assert.match(nowhere.event.message, /its folder does not exist/);
    assert.equal(server.seen.length, 1);
  } finally { await server.close(); await rm(dir, { recursive: true, force: true }); }
});

test("a CSV for another week than the one asked is refused, and no file is left", async () => {
  const server = await fake({ status: 200, type: "text/csv", body: csvFor("2026-W44") });
  const dir = await mkdtemp(join(tmpdir(), "og-stats-csv-"));
  try {
    const wrong = await cli(server.origin, dir, "stats", "--game", GAME, "--period", "2026-W40", "--csv", "w40.csv");
    assert.deepEqual([wrong.code, wrong.event.code], [5, "invalid_response"]);
    await absent(join(dir, "w40.csv"));
  } finally { await server.close(); await rm(dir, { recursive: true, force: true }); }
});

test("a refusal, an answer that is not a CSV, an outdated CLI and an oversized body each leave no file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "og-stats-csv-"));
  try {
    for (const [answer, name, code, exit] of [
      [{ status: 403, type: "application/json", body: JSON.stringify({ error: "insufficient_scope", message: "This token cannot do this. Create a token with the needed permission in OpenGame settings.", retry: "after-fix" }) }, "a.csv", "insufficient_scope", 3],
      [{ status: 200, type: "text/html", body: "<html>proxy sign-in</html>" }, "b.csv", "network", 5],
      [{ status: 200, type: "text/csv", body: csvFor("2026-W43"), headers: { "x-opengame-min-cli": "99.0.0" } }, "c.csv", "upgrade_required", 6],
      [{ status: 200, type: "text/csv", body: csvFor("2026-W43") + "x".repeat(2 * 1024 * 1024) }, "d.csv", "network", 5],
    ] as const) {
      const server = await fake(answer);
      try {
        const out = await cli(server.origin, dir, "stats", "--game", GAME, "--csv", name);
        assert.deepEqual([out.code, out.event.code], [exit, code], name);
        await absent(join(dir, name));
      } finally { await server.close(); }
    }
    // The query is checked before anything is asked or made, as for the JSON read.
    await writeFile(join(dir, "placeholder"), "");
    const range = await cli("http://127.0.0.1:9", dir, "stats", "--game", GAME, "--window", "day", "--csv", "e.csv");
    assert.deepEqual([range.code, range.event.code], [2, "invalid_range"]);
    await absent(join(dir, "e.csv"));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
