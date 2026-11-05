/**
 * Running the bundled CLI the way other programs run it.
 *
 * The other suites call the binary with `execFile`, which closes stdin and waits as long
 * as the command takes. Neither is how an agent's shell behaves. Claude Code, Codex and
 * Cursor start a command with stdin as a pipe they may never close, read nothing until it
 * exits, and some of them run it under a pseudo-terminal. A command that reads stdin, or
 * waits on a person, looks identical to a hung one from there. So `spawnCli` keeps stdin
 * open unless told otherwise, enforces a deadline, and reports a hang as a result rather
 * than as a test timeout, so the assertion can name the command that hung.
 *
 * `OPENGAME_TEST_NODE` picks the Node that runs the CLI, which is how the environment
 * matrix (scripts/node-matrix.mjs) runs these same files under 18, 20, 22 and 24 without
 * the test runner itself having to run there.
 */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_MARKERS } from "../src/output";

export const binary = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
export const node = process.env.OPENGAME_TEST_NODE || process.execPath;
export const token = "ogt_" + "a".repeat(16) + "_" + "b".repeat(43);
export const manifest = { title: "Night shift", description: "Survive until dawn with a light and a dwindling battery.", genre: "shooter-survival", controls: ["keyboard"] };

/** Every variable that makes the CLI think an agent or CI is driving it, so a test can
 * start from a clean slate whatever shell it was launched from (this suite is usually run
 * by an agent, whose own markers would otherwise leak into every case). */
export const AMBIENT = ["CI", ...AGENT_MARKERS, "CODEX_CI", "GEMINI_CLI", "NO_COLOR", "FORCE_COLOR", "TERM", "OPENGAME_TOKEN", "OPENGAME_API_URL", "OPENGAME_VERCEL_PROTECTION_BYPASS",
  "HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "NO_PROXY", "no_proxy", "ALL_PROXY", "all_proxy"];

export function cleanEnv(extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of AMBIENT) delete env[key];
  for (const [key, value] of Object.entries(extra)) { if (value === undefined) delete env[key]; else env[key] = value; }
  return env;
}

export interface Run { code: number | null; stdout: string; stderr: string; ms: number; hung: boolean }

/**
 * `stdin`: "open" is a pipe nobody writes to or closes (the agent-shell case), "closed" is
 * /dev/null-like EOF, a string is written and then closed, `{ write }` is written and the
 * pipe left open. `tty` runs the CLI under a
 * real pseudo-terminal on stdin and stdout.
 */
export async function spawnCli(args: string[], options: { env?: NodeJS.ProcessEnv; stdin?: "open" | "closed" | string | { write: string }; deadlineMs?: number; tty?: boolean; cwd?: string } = {}): Promise<Run> {
  const env = options.env ?? cleanEnv();
  const deadline = options.deadlineMs ?? 20_000;
  const [command, argv] = options.tty ? ttyWrap([node, binary, ...args]) : [node, [binary, ...args]];
  const child = spawn(command, argv, { env, cwd: options.cwd, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  child.stdin?.on("error", () => {});
  if (options.stdin === "closed") child.stdin?.end();
  else if (typeof options.stdin === "object") child.stdin?.write(options.stdin.write);
  else if (options.stdin !== undefined && options.stdin !== "open") child.stdin?.end(options.stdin);
  const started = Date.now();
  let hung = false;
  const timer = setTimeout(() => { hung = true; child.kill("SIGKILL"); }, deadline);
  const [code] = await once(child, "close") as [number | null];
  clearTimeout(timer);
  if (options.stdin === "open" || options.stdin === undefined || typeof options.stdin === "object") child.stdin?.destroy();
  return { code, stdout: options.tty ? stdout.replace(/\r\n/g, "\n") : stdout, stderr, ms: Date.now() - started, hung };
}

/** A pseudo-terminal from Python's `pty`, which keeps forwarding the wrapper's stdin, so
 * the CLI sees a terminal on stdout AND an open stdin nobody types into. BSD `script`
 * refuses a piped stdin outright and sends ^D on EOF, which is neither. */
export function ttyWrap(argv: string[]): [string, string[]] {
  return ["python3", ["-c", PTY, ...argv]];
}

/* pty.spawn keeps selecting on stdin after the child has gone on macOS, where the master
   reads as EOF rather than EIO, so this is the same loop with that exit added. */
const PTY = `
import os, pty, select, sys
pid, fd = pty.fork()
if pid == 0:
    os.execvp(sys.argv[1], sys.argv[1:])
watch = [fd, 0]
while True:
    ready = select.select(watch, [], [])[0]
    if fd in ready:
        try:
            data = os.read(fd, 65536)
        except OSError:
            data = b""
        if not data:
            break
        os.write(1, data)
    if 0 in ready:
        data = os.read(0, 65536)
        if data:
            os.write(fd, data)
        else:
            watch.remove(0)
sys.exit(os.waitstatus_to_exitcode(os.waitpid(pid, 0)[1]) if hasattr(os, "waitstatus_to_exitcode") else os.waitpid(pid, 0)[1] >> 8)
`;

export function events(stdout: string): Record<string, unknown>[] {
  try {
    const final = JSON.parse(stdout) as Record<string, unknown>;
    return [...((final.notices ?? []) as Record<string, unknown>[]),
      ...((final.findings ?? []) as unknown[]).map(finding => ({ type: "finding", finding })), final];
  } catch { return stdout.trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>); }
}

export type Handler = (req: IncomingMessage, res: ServerResponse, body: string) => boolean | void;

/** A local API. A handler that does not answer leaves the default: a 404 the way the real
 * origin answers an unknown route, which the CLI reports as the API being unavailable. */
export async function fakeApi(handler: Handler = () => {}) {
  const seen: { method: string; url: string; headers: IncomingMessage["headers"]; body: string }[] = [];
  const server = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    seen.push({ method: req.method!, url: req.url!, headers: req.headers, body });
    res.setHeader("content-type", "application/json");
    handler(req, res, body);
    if (res.writableEnded) return;
    res.statusCode = 404; res.end(JSON.stringify({ error: "not_found", message: "Not found." }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { origin, seen, server, close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}

export async function tempDir(prefix: string) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  return { dir, remove: () => rm(dir, { recursive: true, force: true }) };
}

export function reply(res: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}) {
  res.statusCode = status;
  for (const [key, header] of Object.entries(headers)) res.setHeader(key, header);
  res.end(JSON.stringify(value));
}
