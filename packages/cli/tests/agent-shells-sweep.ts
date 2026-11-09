import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LIMITS } from "@opengame/shared";
import { cleanEnv, events, fakeApi, manifest, reply, spawnCli, tempDir, token } from "./shell";

/* The agent-shell sweep and what it runs against, shared by agent-shells*.test.ts. Those
   were one file until 2 Nov 2026, 249 s of the CLI suite's 250 on a busy machine, almost all of it
   spawning the CLI; node runs one file's tests in order and separate files at once, so the
   tests are spread over four files, and each kept its assertions as they were. */

export const ANSI = /\x1b\[/;
export const help = async () => (events((await spawnCli(["help", "--jsonl"], { stdin: "closed" })).stdout).at(-1)!.data as {
  commands: Record<string, { args?: string; flags: { name: string; type: string; description: string; values?: string[] }[]; description: string; examples?: string[] }>;
  env: { name: string }[]; exitCodes: { code: number }[]; agentMode: string });

export const gameId = "44444444-4444-4444-8444-444444444444";
export const releaseId = "11111111-1111-4111-8111-111111111111";

/** The arguments each command is run with. Adding a command to the CLI without adding it
 * here fails the coverage test below, so a new command cannot skip this suite. */
export const RUNS: Record<string, string[][]> = {
  init: [["init", "{fresh}", "--title", "Night shift"]],
  check: [["check", "{root}"]],
  // dev is intentionally long-lived; its lifecycle and signal shutdown are
  // covered in dev.test.ts. The ordinary shell sweep exercises early refusal.
  dev: [["dev", "{root}", "--contract", "not-a-contract"]],
  vendor: [["vendor", "{fresh}", "--output", "vendored"]],
  deploy: [["deploy", "{root}", "--dry-run"], ["deploy", "{root}", "--no-wait"], ["deploy", "{root}", "--wait"]],
  status: [["status", "{root}"], ["status", "{root}", "--watch", "--timeout", "2"]],
  // --continue last: the two before it leave a pending login for it to poll.
  login: [["login"], ["login", "--no-wait"], ["login", "--continue"]],
  logout: [["logout"]],
  whoami: [["whoami"]],
  limits: [["limits"]],
  games: [["games"]],
  deployments: [["deployments", "{root}"], ["deployments", "{root}", "--game", "abc123"]],
  releases: [["releases", "{root}"], ["releases", "{root}", "--game", "abc123"]],
  // Without --yes an agent is refused before anything is sent; with it, the stand-in's 404 ends it.
  rollback: [["rollback", releaseId], ["rollback", releaseId, "--game", "abc123", "--yes"]],
  // The same two shapes: refused without --yes before anything is sent, then the stand-in's 404.
  unpublish: [["unpublish", "{root}"], ["unpublish", "{root}", "--game", "abc123", "--yes"]],
  restore: [["restore", "{root}"], ["restore", "{root}", "--game", "abc123", "--yes"]],
  details: [["details", "{root}"], ["details", "{root}", "--game", "abc123", "--title", "Night shift"]],
  // A rename asks first, so an agent without --yes is refused before anything is sent.
  handle: [["handle", "stormcaller"], ["handle", "stormcaller", "--yes"]],
  jam: [["jam", "withdraw"], ["jam", "reenter", "--game", "abc123"]],
  // Listed, then refused without --yes before anything is sent.
  achievements: [["achievements"], ["achievements", "retire", "first-lap", "--game", "abc123"]],
  // Refused before anything is sent without both --title and --yes.
  delete: [["delete", "{root}"], ["delete", "{root}", "--game", "abc123", "--title", "Night shift", "--yes"]],
  link: [["link", "{root}"], ["link", "{root}", "--game", "abc123"]],
  open: [["open", "{root}", "--game", "abc123"]],
  pull: [["pull", "{root}"]],
  token: [["token", "create"], ["token", "list"], ["token", "revoke", "--id", "a".repeat(16)]],
  upgrade: [["upgrade", "--dry-run"]],
  version: [["version"]],
  submit: [["submit", "{root}"], ["submit", "{root}", "--release", releaseId, "--no-jam", "--no-wait"]],
  jams: [["jams"], ["jams", "fixture-jam"]],
  skills: [["skills", "list", "{root}"], ["skills", "add", "{fresh}"]],
  // Both games at once is refused before any request, so it ends on its own too.
  stats: [["stats", "{root}"], ["stats", gameId, "--game", gameId]],
};

export async function project() {
  const root = await tempDir("og-shell-root-");
  await writeFile(join(root.dir, "opengame.json"), JSON.stringify(manifest));
  await writeFile(join(root.dir, "index.html"), "<!doctype html><title>Night shift</title>");
  return root;
}

/** Enough of the API for every command to reach its own end rather than a 404. Anything
 * not answered here is a 404, which is also an end: the point is that each one ends. */
export function routes(origin: () => string) {
  return (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => {
    const url = req.url ?? "";
    if (url === "/api/v1/limits") return reply(res, 200, { apiVersion: "1", minimumCliVersion: "0.1.0", packagingContract: "1", bundle: LIMITS.bundle,
      usage: { heldBytes: { used: 5, max: 10 } } });
    if (url === "/api/v1/auth/me") return reply(res, 200, { handle: "nightshift", ogNumber: 7, avatar: { seed: 1, palette: "ink" }, credential: { kind: "device" } });
    if (url === "/api/v1/auth/device") return reply(res, 200, { device_code: "d".repeat(43), user_code: "BCDF-GHJK", verification_uri: `${origin()}/cli`, expires_in: 600, interval: 5 });
    if (url === "/api/v1/auth/token") return reply(res, 400, { error: "authorization_pending", message: "Waiting." });
    if (url === "/api/v1/auth/logout") return reply(res, 200, { revoked: true });
    if (url.startsWith("/api/v1/games")) return reply(res, 200, { games: [], nextCursor: null });
    if (url === "/api/v1/jams") return reply(res, 200, { jams: [], submissionDestination: { kind: "marketplace" } });
    if (url === "/api/v1/cli") return reply(res, 200, { minimumCliVersion: "0.1.0", package: "@opengamehq/cli@0.1.0" });
    if (url === "/api/v1/deploys") return reply(res, 503, { error: "deploys_unavailable", message: "Deploys are paused. Nothing was uploaded.", retry: "later", retryAfterSeconds: 60 });
  };
}

export async function sweep(mode: "json" | "plain", extraEnv: Record<string, string> = {}, tty = false) {
  let origin = "";
  const api = await fakeApi(routes(() => origin));
  origin = api.origin;
  const root = await project();
  const config = await tempDir("og-shell-config-");
  const failures: string[] = [];
  try {
    for (const [command, runs] of Object.entries(RUNS)) {
      for (const template of runs) {
        const fresh = await tempDir("og-shell-fresh-");
        await writeFile(join(fresh.dir, "index.html"), "<!doctype html><title>Night shift</title>");
        const args = template.map(arg => arg === "{root}" ? root.dir : arg === "{fresh}" ? fresh.dir : arg);
        const signedOut = command === "login";
        const env = cleanEnv({ OPENGAME_API_URL: origin, NO_PROXY: "127.0.0.1", XDG_CONFIG_HOME: config.dir, OPENGAME_CREDENTIAL_STORE: "file",
          ...(signedOut ? {} : { OPENGAME_TOKEN: token }), ...extraEnv });
        const run = await spawnCli(mode === "json" ? [...args, "--jsonl"] : args, { env, stdin: "open", deadlineMs: 15_000, tty });
        await fresh.remove();
        const label = `${mode} ${template.join(" ")}`;
        if (run.hung) { failures.push(`${label}: still running after ${run.ms} ms with stdin open. Output so far: ${(run.stdout + run.stderr).slice(-300)}`); continue; }
        if (mode === "json") {
          const lines = run.stdout.trim().split("\n").filter(Boolean);
          let parsed: Record<string, unknown>[] = [];
          try { parsed = lines.map(line => JSON.parse(line)); } catch { failures.push(`${label}: stdout is not one JSON object per line: ${run.stdout.slice(0, 300)}`); continue; }
          const last = parsed.at(-1);
          if (!last || (last.type !== "result" && last.type !== "error")) failures.push(`${label}: the last line is not a result or an error`);
          if (last?.type === "error" && last.exitCode !== run.code) failures.push(`${label}: exited ${run.code}, the error says ${last.exitCode}`);
          if (last?.type === "result" && run.code !== 0) failures.push(`${label}: a result with exit ${run.code}`);
          if (command === "limits") {
            const data = last?.data as { bundle?: { archiveBytesMax?: number }; allowance?: { heldBytes?: { used?: number; max?: number; remaining?: number } } } | undefined;
            if (run.code !== 0 || last?.command !== "limits" || data?.bundle?.archiveBytesMax !== LIMITS.bundle.archiveBytesMax ||
              data.allowance?.heldBytes?.used !== 5 || data.allowance.heldBytes.max !== 10 || data.allowance.heldBytes.remaining !== 5)
              failures.push(`${label}: current bundle limits and verified remaining account allowance were not returned`);
          }
        } else if (ANSI.test(run.stdout + run.stderr)) failures.push(`${label}: terminal escapes in plain output`);
      }
    }
  } finally { await api.close(); await root.remove(); await config.remove(); }
  return failures;
}
