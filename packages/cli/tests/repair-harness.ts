/* The local API, the CLI runner and the fixtures repair.test.ts and its siblings share. Those
   were one file of 104 s on 17 Nov 2026, nearly all of it real-time waits: the login tests
   each wait out the device flow's five-second poll, and the build tests a process's grace.
   Node runs a package's test files side by side and the tests inside one file one after
   another, so the waits are split across files by what they exercise (logins, saved logins
   that went stale, build processes), and each file is still one process of its own. */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import type { GameManifest, RepairFinding } from "@opengame/protocol";
import { replyBootstrap, startupInformation } from "./bootstrap-fixture";

export const run = promisify(execFile);
export const binary = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
export const manifest: GameManifest = { title: "Night shift", description: "Survive until dawn with a light and a dwindling battery.", genre: "shooter-survival", controls: ["keyboard"] };
export const token = "ogt_" + "a".repeat(16) + "_" + "b".repeat(43);
export const gameId = "44444444-4444-4444-8444-444444444444";
export const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
export type Handler = (req: IncomingMessage, res: ServerResponse, body: string) => boolean | void;

/** A local API that answers like the real routes: their codes, their messages,
 * Retry-After where the server sends it. Unhandled paths are a test failure. */
export async function harness(handler: Handler) {
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
export const lines = (text: string) => text.trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
export const op = (n: number, state: string, extra: Record<string, unknown> = {}) => ({ id: id(n), state, gameId: state === "uploading" ? null : gameId,
  releaseId: state === "ready" ? id(90 + n) : null, error: null, ...extra });
export const json = (res: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}) => {
  res.statusCode = status; for (const [k, v] of Object.entries(headers)) res.setHeader(k, v); res.end(JSON.stringify(value));
};
export const finding = (over: Partial<RepairFinding> = {}): RepairFinding => ({ release: id(91), check: "secrets", checkVersion: "1", state: "failed",
  certainty: "certain", fault: "game", evidence: { observed: "src/keys.js line 3 contains what looks like an AWS key.", file: "src/keys.js:3" },
  fix: "Delete it, then rotate it.", verify: "opengame check, then opengame deploy", retry: "after-fix", ...over });
