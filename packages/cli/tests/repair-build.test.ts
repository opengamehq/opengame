// The build command's processes, from repair.test.ts (repair-harness.ts says why).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { RepairFinding } from "@opengame/protocol";
import { Output } from "../src/output";
import { build } from "../src/deploy";

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
