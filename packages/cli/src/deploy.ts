import { spawn, type ChildProcess } from "node:child_process";
import { constants } from "node:fs";
import { open, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { LIMITS, compiledCredentialPatterns } from "@opengame/shared";
import { ERRORS, DEAD_UPLOAD_CODES, LISTING, OPERATION_STATUS, RELEASE_STATUS, SUBMISSION_OPEN, findingLabel, submissionStatus, operationNext, operationOutcome, creatorGamePath, deploymentPath, withoutCover,
  type CreatorGame, type GameManifest, type OperationSummary, type RepairFinding, type Submission } from "@opengame/protocol";
import { operation, terminal, remember, readSavedOperation } from "./operation";
import { readGame, refuseRemoved } from "./games";
import { emitReview, followReview, readSubmission, reviewLine } from "./submit";
import { authCommand } from "./auth";
import { readBootstrap } from "./bootstrap";
import { Api, ApiError, UploadInterrupted } from "./http";
import { activeToken } from "./credentials";
import { loadManifest, outputFolder, replaceFile } from "./files";
import { createArchive } from "./archive";
import { assertSdkInstalled } from "./build-output";
import { ensureProjectIgnored, ensureDeployManifest, kindPhrase } from "./init";
import { readProject, savedSubmit, updateProject, validKey, withProject, type Project } from "./project";
import { CliError, Output, terminalText } from "./output";
import { CLI_VERSION, olderThan } from "./version";
import type { PackagingReceipt } from "./packaging-receipt";
import { showAllowance } from "./allowance";
import { syncAchievements } from "./achievements";
import { filesFromArchive, uploadMissingFiles } from "./incremental";
import { uploadArchiveParts } from "./archive-parts";
import { safeReadFile } from "./safe-fs";
import { acceptedStatement, assertUnitySourceRoot, createUnityArchive, LARGE_ASSET_DELIVERY, planDelivery, readSmallUnityAssets, readUnityAsset, readUnityAssetPlan, unityFileUnion, unityInputDigest } from "./unity-assets";

/** The asset plan a command was given. --external-assets takes any plan kind named in
 * the plan file; --unity-assets is the original spelling and takes Unity's only. */
export function assetPlanFlag(flags: Flags): { plan: string; unityOnly: boolean } | undefined {
  const general = flags["external-assets"], unity = flags["unity-assets"];
  if (general !== undefined && unity !== undefined) throw new CliError("conflicting_flags", "Use --external-assets or --unity-assets, not both.", 2);
  if (typeof general === "string") return { plan: general, unityOnly: false };
  if (typeof unity === "string") return { plan: unity, unityOnly: true };
  return undefined;
}

type Flags = Record<string, string | boolean>;
type Operation = OperationSummary;

async function serverLimits(api: Api, token: string) {
  const data = await readBootstrap(api, token, "limits");
  const minimum = typeof data.minimumCliVersion === "string" && /^\d+\.\d+\.\d+$/.test(data.minimumCliVersion) ? data.minimumCliVersion : null;
  if (String(data.packagingContract) !== LIMITS.platform.packagingContract || !minimum || olderThan(CLI_VERSION, minimum)) {
    throw new CliError("upgrade_required", `This is CLI ${CLI_VERSION} and the server needs ${minimum ?? "a newer version"}. Run opengame upgrade, then opengame deploy.`, 6, { next: "opengame upgrade" });
  }
  const limits = data.bundle as { archiveBytesMax: number; fileCountMax: number };
  if (!limits || !Number.isSafeInteger(limits.archiveBytesMax) || limits.archiveBytesMax < 1 || !Number.isSafeInteger(limits.fileCountMax) || limits.fileCountMax < 1) {
    throw new CliError("invalid_response", "The server limits could not be read. Run opengame deploy again.", 5);
  }
  const capabilities = data.capabilities as { incrementalUpload?: unknown; archiveParts?: unknown } | undefined;
  return { ...limits, incrementalUpload: capabilities?.incrementalUpload === true, archiveParts: capabilities?.archiveParts === true };
}

const TAIL_BYTES = 4096;
/** How long a build that is being stopped gets to exit before it is killed outright. */
const BUILD_STOP_GRACE_MS = 5_000;

/**
 * Signals a build, and in --json mode on macOS and Linux everything it started.
 *
 * A build command runs under a shell, so the child is sh (or cmd.exe) and the tool doing
 * the work is its child: `npm install && vite` leaves vite as the shell's child. Killing
 * the shell alone, which is what spawn's own `timeout` does, left that tool running with
 * the output pipe open, and in --json mode the CLI waited on the pipe for ever after the
 * time limit, measured on 6 Oct 2026. With the output piped the build gets a process
 * group of its own, and the group is signalled whether or not the shell is still there:
 * the shell dies on the first SIGTERM, and what it started is what the SIGKILL is for.
 */
function stopBuild(child: ChildProcess, grouped: boolean, signal: NodeJS.Signals = "SIGTERM") {
  if (child.pid === undefined) return;
  if (grouped) { try { process.kill(-child.pid, signal); } catch { /* the group has already gone */ } return; }
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }).on("error", () => child.kill());
    return;
  }
  child.kill(signal);
}

/** True while any process in the build's own group is alive. */
function groupAlive(pid: number | undefined): boolean {
  if (pid === undefined) return false;
  try { process.kill(-pid, 0); return true; } catch { return false; }
}

/** In JSON mode the build's own output is the evidence. Without it an agent saw
 * "the build failed" and had to guess the command and rerun it to find out why. */
const SECRET_FIELD = /((?:--?(?:password|passwd|secret|token|api[-_]?key|access[-_]?key)|[A-Z_]*(?:PASSWORD|SECRET|TOKEN|API_KEY|ACCESS_KEY)[A-Z_]*)["']?\s*(?:=|:|\s)\s*)(?:"([^"\n]*)"|'([^'\n]*)'|([^\s]+))/gi;
function buildCommandLabel(command: string, secrets: string[] = []) {
  let label = terminalText(command).replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[hidden]@");
  label = label.replace(SECRET_FIELD, "$1[hidden]").replace(/(Authorization\s*:\s*(?:Bearer|Basic)\s+)[^\s"']+/gi, "$1[hidden]");
  // Scan every occurrence. The shared scanner intentionally uses non-global
  // patterns for repeated boolean checks, while a transcript needs replacement.
  for (const { re } of compiledCredentialPatterns("content")) label = label.replace(new RegExp(re.source, re.flags + "g"), "[hidden]");
  for (const value of secrets) if (value) label = label.split(value).join("[hidden]");
  return label;
}

export async function build(command: string, root: string, output: Output, timeoutMs = LIMITS.platform.deploy.buildTimeoutMs) {
  await assertSdkInstalled(root);
  // A build can print an opaque environment value without its field name. Keep
  // known secret values out of diagnostic transcripts as well as command labels.
  const secrets = [...Object.entries(process.env).filter(([name]) => /PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|ACCESS_KEY/i.test(name)).map(([, value]) => value ?? ""),
    ...[...command.matchAll(SECRET_FIELD)].map(match => match[2] ?? match[3] ?? match[4] ?? ""),
    ...[...command.matchAll(/Authorization\s*:\s*(?:Bearer|Basic)\s+([^\s"']+)/gi)].map(match => match[1]!)];
  const diagnostic = (value: string) => buildCommandLabel(value, secrets);
  output.emit({ type: "progress", stage: "build", message: `Running build command: ${diagnostic(command)}` });
  // A project's build is its own code. It has no reason to inherit the API token.
  const env = { ...process.env }; delete env.OPENGAME_TOKEN;
  const capture = output.json;
  let tail = "";
  let leftRunning = false;
  if (!capture) output.yieldTerminal();
  const outcome = await new Promise<{ code: number | null; error?: boolean; timedOut?: boolean }>((resolve) => {
    /* A group of its own only when the output is piped, which is the only case that could
       hang, and only on macOS and Linux. A grouped build is out of the terminal's
       foreground group, so anything in it that reads the terminal (an ssh passphrase, a
       git credential prompt during npm install) would be stopped by SIGTTIN; a person's
       terminal keeps the build in the foreground, where Ctrl-C reaches it directly. On
       Windows detached opens a new console window, and taskkill /T needs no group. */
    const grouped = capture && process.platform !== "win32";
    const child = spawn(command, { cwd: root, shell: true, env, detached: grouped, windowsHide: true,
      stdio: ["ignore", capture ? "pipe" : "inherit", capture ? "pipe" : "inherit"] });
    const keep = (chunk: Buffer) => { tail = (tail + chunk.toString("utf8")).slice(-TAIL_BYTES * 2); };
    child.stdout?.on("data", keep); child.stderr?.on("data", keep);
    let timedOut = false, settled = false;
    const timers: NodeJS.Timeout[] = [];
    /* SIGTERM now and SIGKILL after the grace, to the group. The SIGKILL timer is not
       cleared when the build settles, because the processes it is for are the ones that
       outlived the shell, and it is unref'd so it never keeps the CLI open by itself. */
    const stop = () => {
      stopBuild(child, grouped);
      setTimeout(() => stopBuild(child, grouped, "SIGKILL"), BUILD_STOP_GRACE_MS).unref();
    };
    // The terminal's Ctrl-C does not reach a group of its own, so it is passed on, and
    // then the signal's own default runs with the listener gone. Only when grouped, which
    // is never on Windows, where SIGHUP cannot be raised.
    const handlers = grouped ? (["SIGINT", "SIGTERM", "SIGHUP"] as const).map(signal => [signal, () => {
      stopBuild(child, grouped, signal); cleanup(); process.kill(process.pid, signal);
    }] as const) : [];
    for (const [signal, handler] of handlers) process.once(signal, handler);
    const cleanup = () => { for (const [signal, handler] of handlers) process.off(signal, handler); for (const timer of timers) clearTimeout(timer); };
    const finish = (value: { code: number | null; error?: boolean }) => {
      if (settled) return; settled = true; cleanup();
      resolve({ ...value, timedOut });
    };
    timers.push(setTimeout(() => {
      // Over time only while the shell itself is still running; a shell that exited is
      // judged by its exit code, whatever it left behind.
      if (child.exitCode === null && child.signalCode === null) timedOut = true;
      stop();
    }, timeoutMs));
    child.on("error", () => finish({ code: null, error: true }));
    /* 'close' waits for the pipes as well as the process, so the build's last lines are
       in the tail. A pipe still open a moment after the shell exited is held by something
       the build started in the background, which would go on writing into the folder
       being packaged, so its group is stopped and the notice says so. (Asked of the pipe
       rather than of the group alone: an orphan that has exited but not been reaped still
       answers a signal, and holds nothing.) The pipes then get the grace and a little more
       to drain, and are let go, so nothing that ignores SIGTERM can hold the CLI open. */
    child.on("exit", () => {
      if (settled) return;
      timers.push(setTimeout(() => { if (!settled && grouped && groupAlive(child.pid)) { leftRunning = !timedOut; stop(); } }, 100));
      timers.push(setTimeout(() => { child.stdout?.destroy(); child.stderr?.destroy(); finish({ code: child.exitCode }); }, BUILD_STOP_GRACE_MS + 600));
    });
    child.on("close", code => finish({ code }));
  });
  if (leftRunning) output.emit({ type: "notice", code: "build_left_running",
    message: "The build command finished but left a process running, so it was stopped before packaging. Start background tools outside the build command." });
  if (outcome.code === 0) return;
  const timedOut = Boolean(outcome.timedOut);
  const minutes = Math.max(1, Math.round(timeoutMs / 60_000));
  const label = diagnostic(command);
  const text = diagnostic(tail).replace(/\r/g, "").split("\n").map(line => line.trimEnd()).filter(Boolean).slice(-30).join("\n").slice(-TAIL_BYTES);
  const finding: RepairFinding = { release: null, check: "build", checkVersion: CLI_VERSION, state: "failed", certainty: "certain", fault: "game",
    evidence: { observed: timedOut ? `The build command ran for ${minutes} minutes without finishing.`
      : text ? `The build command exited${outcome.code === null ? "" : ` with code ${outcome.code}`}. Its last output:\n${text}`
      : outcome.error ? "The build command could not be started."
      // Printed straight to the terminal, so it is above this finding, not in it.
      // This said "without printing anything" under forty lines of vite's error.
      : !capture ? `The build command exited${outcome.code === null ? "" : ` with code ${outcome.code}`}. Its output is above.`
      : `The build command exited${outcome.code === null ? "" : ` with code ${outcome.code}`} without printing anything.`,
      file: "opengame.json" },
    fix: timedOut ? `Make ${label} finish within ${minutes} minutes, or build first and set build.output to the result.` : `Fix the error the build printed, then run ${label} until it succeeds.`,
    verify: `${label}, then opengame deploy`, retry: "after-fix" };
  output.emit({ type: "finding", finding });
  throw new CliError(timedOut ? "build_timeout" : "build_failed", timedOut ? `The build did not finish within ${minutes} minutes.` : `The build command failed. Its output is ${capture ? "in the finding above" : "above"}.`, 1, { finding });
}

/**
 * `noBuild` is deploy's --no-build, which is a different thing from `runBuild` being false.
 * check passes false because a build there is opt-in and says nothing about it; deploy runs
 * the build by default, so skipping it is the creator's decision and is said out loud.
 */
export async function prepareDeploy(root: string, output: Output, runBuild = true, options: { vendor?: boolean; incremental?: boolean;
  unityAssets?: string | readonly string[]; unityOnly?: boolean; delivery?: string; noBuild?: boolean } = {}) {
  if (options.unityAssets && options.vendor) throw new CliError("conflicting_flags", "Use an asset plan without --vendor; the explicit asset plan preserves exported file paths and bytes.", 2);
  const manifest = await loadManifest(root, output, options.unityAssets ? safeReadFile : undefined);
  if (runBuild && manifest.build?.command) await build(manifest.build.command, root, output);
  // After the build, whose own output owns the terminal while it runs.
  await output.face();
  output.emit({ type: "progress", stage: "check", message: "Checking and packaging your game" });
  // The manifest schema holds build.output to "." or a clean relative path, so it can be
  // printed as written.
  const where = manifest.build?.output && manifest.build.output !== "." ? manifest.build.output : "the project folder";
  /* The ordinary missing-folder sentence says to run the build command first, which is
     advice deploy normally follows itself. Under --no-build nothing ran, so the creator is
     told that, and that leaving the flag off is the other way out when there is a command. */
  const folder = await outputFolder(root, manifest).catch((error: unknown) => {
    if (!options.noBuild || !(error instanceof CliError) || error.code !== "folder_missing") throw error;
    throw new CliError("folder_missing", `The build folder ${where} does not exist, and --no-build means deploy did not build it. Build the export there first${manifest.build?.command ? ", or drop --no-build so deploy runs the build command" : ""}.`);
  });
  /* One notice, after the folder is known to exist, so it names what is actually being
     packaged. The flag is for a build that cannot run on this machine, but in the
     Construct, GDevelop, GameMaker and Solar2D guides the command is not a build at all:
     it adds the SDK to an export made by hand, and skipping it uploads a game with no SDK.
     A notice that only said "the build did not run" gave that creator nothing to
     recognise, so it says what a skipped command leaves out. It does not quote the
     command. The redaction the build transcript uses misses opaque values (a `curl -u`
     pair, a bare KEY=value), and the transcript is progress, which --json drops, while
     this notice lands in the final object an agent keeps. */
  if (options.noBuild) output.emit({ type: "notice", code: "build_skipped", message: manifest.build?.command
    ? `--no-build skipped build.command in opengame.json, so anything it adds or changes in the export is not in this upload. Packaging ${where} as it is on disk.`
    : `opengame.json has no build command, so --no-build changed nothing. Packaging ${where} as it is on disk.` });
  const archive = options.unityAssets
    ? await createUnityArchive(folder, manifest, output, root, options.unityAssets, { unityOnly: options.unityOnly, delivery: options.delivery })
    : { ...await createArchive(folder, manifest, output, options), unityAssets: undefined };
  return { manifest, archive };
}

async function cacheArchive(root: string, hash: string, bytes: Uint8Array, packaging: PackagingReceipt) {
  const path = join(root, ".opengame", `${hash}.zip`);
  const temporary = path + "." + randomUUID();
  try {
    const handle = await open(temporary, "wx", 0o600);
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    await replaceFile(temporary, path);
    const receiptPath = join(root, ".opengame", `${hash}.packaging.json`);
    const receiptTemporary = receiptPath + "." + randomUUID();
    try {
      const receipt = await open(receiptTemporary, "wx", 0o600);
      try { await receipt.writeFile(JSON.stringify(packaging, null, 2) + "\n"); await receipt.sync(); } finally { await receipt.close(); }
      await replaceFile(receiptTemporary, receiptPath);
    } finally { await unlink(receiptTemporary).catch(() => {}); }
  } finally { await unlink(temporary).catch(() => {}); }
}

async function cachedArchive(root: string, pending: NonNullable<Project["deploy"]>) {
  let handle;
  try {
    handle = await open(join(root, ".opengame", `${pending.request.sha256}.zip`), constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size !== pending.request.byteSize || stat.size > LIMITS.bundle.archiveBytesMax) throw new Error();
    const bytes = Buffer.alloc(stat.size);
    let read = 0;
    while (read < bytes.length) {
      const result = await handle.read(bytes, read, bytes.length - read, read);
      if (!result.bytesRead) break;
      read += result.bytesRead;
    }
    if (read !== bytes.length || createHash("sha256").update(bytes).digest("hex") !== pending.request.sha256) throw new Error();
    return bytes;
  } catch { throw new CliError("archive_unavailable", "The saved upload archive is missing or changed. Run opengame status first. To start a new deploy, use opengame deploy --idempotency-key with a new key."); }
  finally { await handle?.close(); }
}

/** The deploy's own page, which exists as soon as the operation does. */
function deploymentUrl(api: Api, id: string): string {
  return api.origin + deploymentPath(id);
}

function absolute(api: Api, value: string): string {
  return value.startsWith("/") ? api.origin + value : value;
}

/** Findings first, as their own events, then the outcome. The last line is
 * always one `result` or one `error`, and the exit code says whose move it is. */
async function report(op: Operation, command: string, api: Api, output: Output,
  options: { resumable?: boolean; timingsMs?: Record<string, number>; timedOut?: boolean; title?: string; arrive?: boolean;
    /** What the deploy's manifest said it is, for the line under a ready preview. */
    kind?: Pick<GameManifest, "kind" | "basedOn">;
    /** `status` only: the game's standing submission, once the deploy is not the news. */
    review?: Submission | null }) {
  const findings = op.findings ?? [];
  // A finished deploy is retried by nobody, so its chips say stopped rather than waiting.
  if (op.state === "failed" || op.state === "expired") output.markEnded();
  for (const finding of findings) output.emit({ type: "finding", finding });
  const uploadUrl = `${api.origin}/upload?operation=${op.id}`;
  const deploymentLink = deploymentUrl(api, op.id);
  // The exit code, retry and next command come from the protocol's one outcome
  // rule, the same one behind the website's stage and copy for this operation.
  const outcome = operationOutcome(op, findings);
  if (outcome) {
    const lead = findings.find(finding => findingLabel(finding) === "Blocker") ?? findings[0];
    throw new CliError(outcome.code, outcome.message, outcome.exit,
      { ...(lead ? { finding: lead } : {}), ...(outcome.next ? { next: outcome.next } : {}), retry: outcome.retry });
  }
  if (op.metadata?.keptFields.length) output.emit({ type: "notice", code: "website_metadata_kept",
    message: `Kept website changes to ${op.metadata.keptFields.join(", ")}. Run opengame pull to sync your local manifest.` });
  if (op.state === "ready") {
    // No previewUrl on a ready release means the server found it held, taken down or
    // cleaned, or could not check this time. The game page used to stand in here, under
    // "Play it at", for a release that cannot be played (review of #613). The sentence says
    // only what the CLI knows, that no link came back, because "cannot be played" was false
    // after a failed check (review of #662); the deploy's page says which it is.
    const preview = op.previewUrl ? absolute(api, op.previewUrl) : null;
    const url = preview ?? deploymentLink;
    if (options.title && options.arrive) await output.arrive(options.title);
    const review = options.review ? reviewSummary(options.review, op.releaseId) : null;
    // Said only for a world, a decomp or a mod, and not when the website's kind was kept
    // over the manifest's, since then the manifest is not what was deployed.
    const deployedAs = op.metadata?.keptFields.includes("kind") ? null : kindPhrase(options.kind?.kind, options.kind?.basedOn);
    const lines = options.review ? emitReview(options.review, output) : [];
    output.emit({ type: "result", command, data: { operationId: op.id, state: op.state, done: true, gameId: op.gameId, publicId: op.publicId ?? null,
      releaseId: op.releaseId, previewUrl: preview, url, deploymentUrl: deploymentLink, uploadUrl, next: review?.next ?? null, ...(op.progress ? { progress: op.progress } : {}), findings,
      ...(options.timingsMs ? { timingsMs: options.timingsMs } : {}), ...(op.metadata ? { metadata: op.metadata } : {}),
      ...(options.review !== undefined ? { submission: options.review, review } : {}),
      message: [preview ? `Private preview ready. Play it at ${url}` : `Release ready, but the server sent no preview link. Open ${url} to see why.`, ...(deployedAs ? [`Deployed as ${deployedAs}.`] : []),
        ...(review ? [review.message, ...lines] : [])].join("\n") } });
    return;
  }
  const stage = op.progress?.message ?? OPERATION_STATUS[op.state].message;
  if (options.timedOut) {
    throw new CliError("checks_pending", `The checks are still running. ${stage} Follow them at ${deploymentLink}, or run opengame status --watch.`, 5,
      { retry: "later", retryAfterSeconds: Math.ceil(LIMITS.platform.operations.pollIntervalMs / 1000) * 15, next: "opengame status --watch" });
  }
  const next = op.state === "uploading" && options.resumable === false ? null : operationNext(op, findings);
  output.emit({ type: "result", command, data: { operationId: op.id, state: op.state, done: false, gameId: op.gameId, publicId: op.publicId ?? null,
    releaseId: op.releaseId, previewUrl: null, url: deploymentLink, deploymentUrl: deploymentLink, uploadUrl, next, ...(op.progress ? { progress: op.progress } : {}), findings,
    ...(options.timingsMs ? { timingsMs: options.timingsMs } : {}), ...(op.metadata ? { metadata: op.metadata } : {}),
    message: op.state === "uploading" ? `${options.resumable === false ? "An upload is pending in another checkout. Resume it there, or run opengame deploy here to upload this folder." : "Upload pending. Run opengame deploy to resume."}\n${deploymentLink}`
      : command === "deploy" ? `Uploaded. The checks run on our side, so you can close this terminal.\n${stage}\nWatch them, and play the preview once it is ready, at ${deploymentLink}\nOr follow them here with opengame status --watch.`
      : `${stage}\nFollow it at ${deploymentLink}, or with opengame status --watch.` } });
}

/** What happens before the next operation read.
 * A pace that reaches the deadline is the end of the watch, not another read.
 * Sleeping that remainder and then reading is how a timer that wakes early
 * turns one unchanged answer into a second request, and a few milliseconds
 * left into a spin. `delay` is the poll interval, or the time still owed to
 * an unchanged cursor; zero means the pace has elapsed. */
export function nextWatchWait(now: number, deadline: number, delay: number): { read: boolean; waitMs: number } {
  const left = Math.max(0, deadline - now);
  if (left === 0 || delay >= left) return { read: false, waitMs: delay > 0 ? left : 0 };
  return { read: true, waitMs: delay };
}

/** Follow an operation until it ends or the watch window closes. Progress is
 * the stage in words, emitted when it changes; saves take the lock briefly. */
async function watch(api: Api, token: string, initial: Operation, output: Output, persist?: (op: Operation) => Promise<void>, timeoutMs = LIMITS.platform.operations.watchTimeoutMs) {
  let op = initial;
  const deadline = Date.now() + timeoutMs;
  const describe = (value: Operation) => value.progress ? `${value.progress.code}:${value.progress.message}` : value.state;
  const say = (value: Operation) => output.emit({ type: "progress", stage: value.progress?.code ?? value.state, operation: value.id,
    message: value.progress?.message ?? OPERATION_STATUS[value.state].message });
  if (!terminal(op) && op.state !== "uploading") say(op);
  let misses = 0;
  let readNotBefore = 0;
  while (!terminal(op) && op.state !== "uploading" && Date.now() < deadline) {
    // Older servers omit the cursor and retain the original polling contract.
    // A cursor is only a change marker: reconnects carry the bearer token again.
    const delay = !op.waitCursor || misses ? LIMITS.platform.operations.pollIntervalMs : Math.max(0, readNotBefore - Date.now());
    const step = nextWatchWait(Date.now(), deadline, delay);
    if (step.waitMs) await sleep(step.waitMs);
    if (!step.read) break;
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const path = `/api/v1/operations/${op.id}` + (op.waitCursor
      ? `?after=${op.waitCursor}&waitMs=${Math.min(LIMITS.platform.operations.waitTimeoutMs, remaining)}` : "");
    let next: Operation;
    const readStarted = Date.now();
    try {
      next = operation((await api.json(path, { token, signal: AbortSignal.timeout(remaining) })).operation, op.id);
      misses = 0;
      // A stale proxy or prematurely answered wait must not turn reconnect into a busy loop.
      readNotBefore = next.waitCursor === op.waitCursor ? readStarted + LIMITS.platform.operations.pollIntervalMs : 0;
    } catch (error) {
      // One failed read of a deploy that is still running is not the deploy
      // failing. Keep following it through a few, and stop on the fourth in a row.
      if (Date.now() >= deadline) break;
      if (error instanceof CliError && error.exitCode === 5 && error.retry !== "never" && error.retry !== "after-fix" && ++misses <= WATCH_MISSES) {
        if (error.retryAfterSeconds) await sleep(Math.min(error.retryAfterSeconds * 1000, Math.max(0, deadline - Date.now())));
        continue;
      }
      throw error;
    }
    if (describe(next) !== describe(op) && !terminal(next)) say(next);
    // Only what remember() records can change the project file. Skipping the
    // lock on an unchanged poll keeps status --watch quick beside a running deploy.
    const changed = next.state !== op.state || next.gameId !== op.gameId || JSON.stringify(next.metadata) !== JSON.stringify(op.metadata);
    op = next;
    if (changed) await persist?.(op);
  }
  return { op, timedOut: !terminal(op) && op.state !== "uploading" };
}

/** Consecutive failed reads a watch rides out before it reports exit 5. */
export const WATCH_MISSES = 3;

class DeadUpload extends Error { constructor(readonly cause: ApiError) { super(cause.message); } }

/**
 * Whether `opengame deploy` resumes the deploy saved in this folder rather than starting a
 * new one: the same `--idempotency-key`, or no key and a deploy whose bytes have not
 * reached the server. One answer for the deploy below and for the launch clock's check
 * after the close (launch.ts), which lets exactly these through.
 */
export function resumesSavedDeploy(saved: Project["deploy"] | undefined, key: string | undefined): boolean {
  return Boolean(saved && (key === saved.key || (!key && !saved.terminal && !saved.uploaded)));
}

export async function deployCommand(command: "deploy" | "status", root: string, flags: Flags, output: Output) {
  const started = performance.now();
  const timings: Record<string, number> = {};
  const timed = async <T>(stage: string, action: () => Promise<T>): Promise<T> => {
    const start = performance.now();
    try { return await action(); }
    finally { timings[stage] = Math.round(performance.now() - start); }
  };
  const assetPlan = assetPlanFlag(flags);
  if (assetPlan && flags.vendor) throw new CliError("conflicting_flags", "Use an asset plan without --vendor; the explicit asset plan preserves exported file paths and bytes.", 2);
  const key = typeof flags["idempotency-key"] === "string" ? flags["idempotency-key"] : undefined;
  if (key !== undefined && !validKey(key)) throw new CliError("invalid_idempotency_key", "Use letters, numbers, dots, colons, hyphens or underscores in --idempotency-key.");
  const metadata = flags.metadata ?? "preserve";
  const requestedTimeout = flags.timeout === undefined ? LIMITS.platform.operations.watchTimeoutMs : Number(flags.timeout) * 1000;
  if (!Number.isFinite(requestedTimeout) || requestedTimeout < 1000 || requestedTimeout > LIMITS.platform.operations.watchTimeoutMs) {
    throw new CliError("invalid_flag", `Use --timeout with a number of seconds from 1 to ${LIMITS.platform.operations.watchTimeoutMs / 1000}.`);
  }
  const timeout = Math.ceil(requestedTimeout);
  if (flags.wait && flags["no-wait"]) throw new CliError("conflicting_flags", "Use --wait or --no-wait, not both. A deploy returns once the upload is in unless you pass --wait.", 2);
  // --timeout only ever meant how long to watch, so a job that sets it is asking to wait.
  const wait = Boolean(flags.wait) || (!flags["no-wait"] && flags.timeout !== undefined);
  if (metadata !== "preserve" && metadata !== "local") throw new CliError("invalid_metadata", "Use --metadata=preserve or --metadata=local.");
  const api = new Api();
  try {
    if (command === "deploy") {
      const initialized = await ensureDeployManifest(root, flags);
      if (initialized) output.emit({ type: "notice", code: "initialized", message: initialized.message });
    }
    let active = await timed("credentials", () => activeToken(api.origin, Boolean(flags["token-stdin"])));
    if (!active && command === "deploy") {
      await output.intermediate(() => authCommand("login", { "no-browser": flags["no-browser"] ?? false }, output));
      active = await activeToken(api.origin, false);
    }
    if (!active) throw new CliError("not_signed_in", "Run opengame login, or supply OPENGAME_TOKEN.", 3, { next: "opengame login" });
    const token = active.token;
    api.tokenSource = active.source;
    const persist = async (op: Operation) => { await updateProject(root, api.origin, state => remember(op, state)); };
    if (command === "status") {
      await showAllowance(api, token, output);
      // Read without the deploy's lock, so status works beside a running deploy.
      const state = await readProject(root, api.origin);
      if (!state.deploy?.operationId || (state.deploy.terminal && state.gameId)) {
        if (state.deploy && !state.deploy.terminal) throw new CliError("upload_pending", "Your deploy was saved before the server answered. Run opengame deploy to resume it.", undefined, { next: "opengame deploy" });
        if (!state.gameId) throw new CliError("not_linked", "Run opengame deploy to create a game, or opengame link --game <id> to use an existing game.");
        const game = await readGame(api, token, state.gameId);
        // Nothing plays and nothing is taken: not a "ready preview", which is what this said.
        refuseRemoved(game);
        const deadline = Date.now() + timeout;
        // Where the game itself stands, before its newest deploy: published and where, or
        // on its way there. The deploy below can be a draft of the next release.
        if (game.publication) output.emit({ type: "notice", code: "publication", message: publicationLine(game.publication, game.title) });
        // A server new enough to report review that left it out is saying this credential
        // may not read it (a deploy-only token). Said, so silence is not read as "no review".
        if (game.status && game.submission === undefined) output.emit({ type: "notice", code: "review_unreadable",
          message: "This token cannot read the game's review. Use a token with read or submit access to see it here." });
        /* And its review. status read only the deploy, so a release a reviewer had returned
           reported "Private preview ready" and exit 0, while the skills told agents that
           status --watch follows review. Once the deploy is ready (or there is none), the
           standing submission is followed under --watch until it settles or the watch
           window closes; a person can take days, so the window closing is not an error. */
        const follow = async (ready: boolean) => {
          let review = game.submission;
          if (review && ready && flags.watch) review = await followReview(api, token, review, output, deadline);
          return review;
        };
        if (game.latestOperation) {
          const latest = operation((await api.json(`/api/v1/operations/${game.latestOperation.id}`, { token })).operation, game.latestOperation.id);
          const ours = state.deploy?.operationId === latest.id ? persist : undefined;
          if (ours) await ours(latest);
          if (flags.watch) await output.face();
          const watched = flags.watch ? await watch(api, token, latest, output, ours, timeout) : { op: latest, timedOut: false };
          // This checkout's own deploy: save its achievements if the deploy that made it could not.
          if (ours) await syncAchievements(api, token, root, watched.op, state.deploy!.request.manifest.achievements, output);
          const review = watched.op.state === "ready" ? await follow(true) : game.submission;
          await report(watched.op, command, api, output, { resumable: false, timedOut: watched.timedOut, title: game.title, arrive: latest.state !== "ready",
            ...(game.submission !== undefined ? { review } : {}) });
        } else {
          const review = await follow(true);
          const summary = review ? reviewSummary(review, null) : null;
          const lines = review ? emitReview(review, output) : [];
          const where = game.status ? `${game.status.label}. ${game.status.message}` : `${game.visibility}.`;
          output.emit({ type: "result", command, data: { gameId: game.id, publicId: game.publicId, visibility: game.visibility, operationId: null, done: true,
            publication: game.publication, url: game.publication?.url ?? api.origin + creatorGamePath(game), next: summary?.next ?? "opengame deploy",
            ...(game.status ? { status: game.status } : {}), ...(review !== undefined ? { submission: review, review: summary } : {}),
            message: [summary ? summary.message : game.publication ? "Run opengame deploy to upload a new build." : `${game.title}: ${where} Run opengame deploy to upload a new build.`, ...lines].join("\n") } });
        }
        return;
      }
      const op = (await readSavedOperation(api, token, root, state))!;
      if (flags.watch) await output.face();
      const watched = flags.watch ? await watch(api, token, op, output, persist, timeout) : { op, timedOut: false };
      await syncAchievements(api, token, root, watched.op, state.deploy.request.manifest.achievements, output);
      // The arrival plays once, when this command saw the preview become ready.
      await report(watched.op, command, api, output, { timedOut: watched.timedOut, title: state.deploy.request.manifest.title, kind: state.deploy.request.manifest, arrive: op.state !== "ready" });
      return;
    }
    const limits = await timed("limits", () => serverLimits(api, token));
    await ensureProjectIgnored(root);
    // Create and upload under the lock, which keeps a second process from
    // replacing the saved retry key. Watching happens after it is released.
    // The operation whose page was given, so a restarted upload's new deploy is given too.
    let announced: string | null = null;
    /* Why this deploy will not enter the jam, when the server knows already: a mod, the entry
       limit, the jam's window. Review runs anyway and the game can go to the marketplace, so it
       is a notice and not a stop, said once, before review rather than at the details step
       after it. Older servers send nothing. */
    let jamSaid = false;
    const sayJam = (op: Operation) => {
      if (jamSaid || !op.jamNotice) return;
      jamSaid = true;
      output.emit({ type: "notice", code: "jam_not_entered", message: op.jamNotice.message });
    };
    const upload = (restarted: boolean) => withProject(root, api.origin, async (state, save) => {
      // Keep the exact checked bytes for this attempt. The disk copy remains
      // necessary for another process to resume, but re-reading and hashing it
      // immediately wastes a full archive read before every first upload.
      let freshArchive: Uint8Array | undefined;
      const saved = state.deploy;
      // Resume only a deploy whose bytes have not reached the server. One that is
      // queued or checking (after --no-wait, or a watch the shell killed) used to
      // be resumed too, and the next plain deploy re-reported that build instead
      // of uploading the edits made since.
      let resume = resumesSavedDeploy(saved, key);
      const incompatibleFileUpload = Boolean(resume && saved?.transport && saved.request.byteSize > LIMITS.platform.incrementalUpload.archiveBytesMax);
      if (incompatibleFileUpload && saved) {
        if (saved.operationId) {
          const latest = operation((await api.json(`/api/v1/operations/${saved.operationId}`, { token })).operation, saved.operationId);
          if (remember(latest, state)) await save();
          if (latest.state !== "uploading") return { op: latest, title: saved.request.manifest.title,
            achievements: saved.request.manifest.achievements, kind: saved.request.manifest };
        }
        if (saved.unityAssets) throw new CliError("bundle_limit", "The saved asset plan has too many boot bytes for server file assembly. Move more boot files into the external asset plan, then deploy that plan with a new --idempotency-key.", 1);
        if (key) throw new CliError("bundle_limit", "The saved file upload exceeds the server assembly limit. Run opengame deploy without --idempotency-key to start a new direct ZIP upload.", 2);
        // A key identifies both bytes and transport. Reusing it for ZIP would
        // conflict with the operation that still has the old file manifest.
        saved.terminal = true;
        await save();
        resume = false;
        restarted = true;
        output.emit({ type: "notice", code: "upload_restarted", message: "The saved file upload exceeds the server assembly limit. Starting a new direct ZIP upload from your current files." });
      }
      if (resume && assetPlan && !saved?.unityAssets) {
        throw new CliError("conflicting_flags", "The saved upload uses a different delivery route. Use a new --idempotency-key for the asset plan.", 2);
      }
      if (resume && saved?.unityAssets) await assertUnitySourceRoot(root, saved.unityAssets.sourceRoot);
      if (resume && assetPlan && saved?.unityAssets) {
        const selected = await readUnityAssetPlan(saved.unityAssets.sourceRoot, root, assetPlan.plan, { unityOnly: assetPlan.unityOnly, output });
        if (selected.delivery !== planDelivery(saved.unityAssets) ||
            unityInputDigest(saved.request, selected.assets, selected.delivery) !== saved.unityAssets.inputDigest) {
          throw new CliError("build_changed", "The selected asset plan differs from this saved deploy. Use a new --idempotency-key to upload the changed assets.", 1);
        }
      }
      let prepared: Awaited<ReturnType<typeof prepareDeploy>> | undefined;
      if (!resume) {
        // Expiry creates a new operation, not a different partition. The saved
        // paths are already validated, but their current bytes are re-read and
        // rehashed just like an explicit plan before rebuilding this attempt.
        const retainedAssets = restarted && saved?.unityAssets && !assetPlan
          ? saved.unityAssets.assets.map(file => file.path) : undefined;
        if (retainedAssets) await assertUnitySourceRoot(root, saved!.unityAssets!.sourceRoot);
        // Read the saved operation once before replacing it, so a candidate it
        // produced since the last command lends its metadata revision (REL-5).
        if (saved?.operationId && !saved.terminal) {
          try {
            const latest = operation((await api.json(`/api/v1/operations/${saved.operationId}`, { token })).operation, saved.operationId);
            if (remember(latest, state)) await save();
          } catch (error) { if (!(error instanceof CliError) || error.exitCode !== 5) throw error; }
        }
        prepared = await timed("prepare", () => prepareDeploy(root, output, !flags["no-build"], { vendor: Boolean(flags.vendor), incremental: limits.incrementalUpload && !incompatibleFileUpload, noBuild: Boolean(flags["no-build"]),
          unityAssets: assetPlan?.plan ?? retainedAssets, unityOnly: assetPlan?.unityOnly, delivery: retainedAssets ? planDelivery(saved!.unityAssets) : undefined }));
        // The same bytes are already being checked: follow that deploy rather than
        // spend a second scan on an identical build.
        if (!key && !restarted && saved && !saved.terminal && saved.uploaded && (saved.unityAssets?.inputDigest ?? saved.request.sha256) === (prepared.archive.unityAssets?.inputDigest ?? prepared.archive.sha256)) resume = true;
      }
      if (!resume) {
        const { manifest, archive } = prepared!;
        await timed("cache", () => cacheArchive(root, archive.sha256, archive.bytes, archive.packaging));
        freshArchive = archive.bytes;
        const previousHash = state.deploy?.request.sha256;
        state.deploy = { key: restarted || !key ? randomUUID() : key, ...(archive.unityAssets ? { transport: planDelivery(archive.unityAssets), unityAssets: archive.unityAssets } : archive.incremental ? { transport: "files" as const } : {}), request: { ...(state.gameId ? { gameId: state.gameId } : {}), byteSize: archive.bytes.byteLength,
          fileCount: archive.fileCount, sha256: archive.sha256,
          // Build commands are local instructions, not game metadata. The cover is not
          // anything any more: OpenGame makes it after approval (archive.ts says so once).
          manifest: withoutCover({ ...manifest, ...(manifest.build ? { build: { output: manifest.build.output } } : {}) }),
          metadataRevision: state.metadataRevision ?? null, metadata,
          /* One archive to storage: ask for parts where the server takes them. The server
             still sends anything at or under multipart.aboveBytes as one PUT. */
          ...(limits.archiveParts && !archive.unityAssets && !archive.incremental ? { multipart: true as const } : {}) } };
        await save();
        if (previousHash && previousHash !== archive.sha256) await unlink(join(root, ".opengame", `${previousHash}.zip`)).catch(() => {});
      } else output.emit({ type: "notice", code: "resuming_deploy", message: saved?.uploaded
        ? "This build is already being checked. Following that deploy."
        : "Resuming the saved deploy with its original archive. Use a new --idempotency-key to deploy newer edits." });
      const pending = state.deploy!;
      if (pending.request.metadata === "local") output.emit({ type: "notice", code: "local_metadata_selected",
        message: "This deploy uses your local metadata, replacing the website values when its candidate is prepared." });
      if (pending.request.byteSize > limits.archiveBytesMax || pending.request.fileCount > limits.fileCountMax) throw new CliError("bundle_limit", "This build exceeds the server's current size or file limit. Reduce the build, then deploy with a new --idempotency-key.", 1);
      try {
        const assetUpload = pending.transport !== undefined && pending.transport !== "files";
        const delivery = planDelivery(pending.unityAssets);
        if (assetUpload) await assertUnitySourceRoot(root, pending.unityAssets!.sourceRoot);
        // Before any byte leaves: a kind that asks for a statement is refused here with
        // the words, and the server refuses it again without them.
        const statement = assetUpload ? acceptedStatement(delivery, flags["accept-statement"]) : undefined;
        const fileUpload = pending.transport === "files" || assetUpload;
        const archiveBytes = fileUpload ? freshArchive ?? await timed("restore", () => cachedArchive(root, pending)) : undefined;
        const fileManifest = archiveBytes ? filesFromArchive(archiveBytes) : undefined;
        const uploadFiles = assetUpload ? unityFileUnion(fileManifest!, pending.unityAssets!.assets, delivery) : fileManifest;
        // Unity keeps the route it always had; every later kind uses the general one.
        const assetRoute = delivery === LARGE_ASSET_DELIVERY ? "/api/v1/deploys/unity-assets" : "/api/v1/deploys/external-assets";
        let response = await timed("create", () => api.json(assetUpload ? assetRoute : fileUpload ? "/api/v1/deploys/files" : "/api/v1/deploys", {
          token, body: { ...pending.request, ...(fileManifest ? { files: fileManifest } : {}),
            ...(assetUpload ? { delivery, assets: pending.unityAssets!.assets, ...(statement ? { statement } : {}) } : {}) }, idempotencyKey: pending.key,
          /* A large-game plan lists every file's path, digest and size, about 150 bytes a
             row, so World at War's 26,200 files are a 3.9 MB request: past bodyBytesMax and
             past the 4.5 MB Vercel takes. Only this route reads gzip, and a body that fits
             is still sent plain (encodeJsonBody). */
          ...(assetUpload ? { gzip: { sentMax: LIMITS.platform.incrementalUpload.bodyBytesMax, decodedMax: LIMITS.platform.incrementalUpload.assetPlanBodyBytesMax } } : {}) }));
        if (assetUpload && (response.delivery !== delivery || response.inputDigest !== pending.unityAssets!.inputDigest)) {
          throw new CliError("invalid_response", "The server returned a different asset identity. Keep the saved deploy and retry.", 5);
        }
        let op = operation(response.operation, pending.operationId);
        if (remember(op, state)) await save();
        /* The deploy's page exists from here, before a byte is sent, so the address is given
           now: a 1 GiB upload takes minutes, and somebody watching it should not need the
           terminal to find out how it went. Said once per deploy. */
        if (announced !== op.id) { announced = op.id; const url = deploymentUrl(api, op.id);
          output.emit({ type: "notice", code: "deployment_page", url, message: `Follow this deploy at ${url}` }); }
        sayJam(op);
        if (op.state === "uploading" && fileUpload) {
          response = await timed("upload", () => uploadMissingFiles(api, token, op.id, archiveBytes!, uploadFiles!, response.files, output,
            assetUpload ? { route: "assets", delivery, inputDigest: pending.unityAssets!.inputDigest, readFile: file => readUnityAsset(pending.unityAssets!.sourceRoot, file),
              readFiles: files => readSmallUnityAssets(pending.unityAssets!.sourceRoot, files) } : {}));
          op = operation(response.operation, op.id);
          if (remember(op, state)) await save();
        } else if (op.state === "uploading") {
          if (response.uploaded !== true && response.multipart !== undefined) {
            // Past multipart.aboveBytes the archive goes up in parts (archive-parts.ts),
            // and a rerun of the same deploy sends only the parts the server does not hold.
            const bytes = freshArchive ?? await timed("restore", () => cachedArchive(root, pending));
            await timed("upload", () => uploadArchiveParts(api, token, op.id, bytes, response.multipart, output));
          } else if (response.uploaded !== true) {
            const bytes = freshArchive ?? await timed("restore", () => cachedArchive(root, pending));
            const tries = LIMITS.platform.deploy.uploadAttemptsMax;
            // An interrupted PUT is retried here, each time with a fresh URL from the
            // server's own retry endpoint, which also answers `uploaded` when the bytes
            // landed and only the answer was lost. A storage blip used to stop the deploy
            // and leave a person to work out that running it again was the fix.
            for (let attempt = 1, upload = response.upload; ; attempt++) {
              let shown = -1;
              try {
                const uploadStartedAt = Date.now();
                await timed("upload", () => api.upload(upload, bytes, (sent, total) => {
                  const percent = Math.floor(sent / total * 100);
                  if (percent === shown || (percent % 10 !== 0 && output.json)) return;
                  shown = percent;
                  output.emit({ type: "progress", stage: "upload", operation: op.id, message: `Sending archive: ${sent} of ${total} bytes`, bytes: sent, total, elapsedMs: Date.now() - uploadStartedAt });
                }));
                break;
              } catch (error) {
                if (!(error instanceof UploadInterrupted) || attempt >= tries) {
                  if (error instanceof UploadInterrupted) throw new CliError("upload_interrupted", `The upload did not finish after ${tries} tries; the last time ${error.cause}. Your game is fine and nothing was lost. Check your connection, then run opengame deploy to resume the same operation.`, 5, { next: "opengame deploy", retry: "later" });
                  throw error;
                }
                output.emit({ type: "notice", code: "upload_retrying", message: `The upload was interrupted (${error.cause}). Trying again, ${attempt + 1} of ${tries}.` });
                await sleep(Math.min(8000, 1000 * 2 ** (attempt - 1)));
                const fresh = await api.json(`/api/v1/operations/${op.id}/upload`, { token, method: "POST" }).catch((reason: unknown) => {
                  // The server is the one who cannot answer now: keep the honest cause.
                  // Unless it said retrying cannot help: that answer, with its request id, is the news.
                  if (reason instanceof CliError && reason.exitCode === 5 && reason.retry !== "never") throw error;
                  throw reason;
                });
                op = operation(fresh.operation, op.id);
                if (fresh.uploaded === true || op.state !== "uploading") break;
                upload = fresh.upload;
              }
            }
          }
          /* Revocation applies to the next request, and confirming the upload is one. A token
             revoked while the bytes were in flight therefore cannot confirm them: the upload
             is discarded and nothing it would have led to can be submitted. Say that, rather
             than only that the token is not valid, so nobody goes looking for a lost upload. */
          response = await timed("confirm", () => api.json(`/api/v1/operations/${op.id}/upload`, { token, method: "PUT" })).catch(error => {
            if (error instanceof ApiError && error.code === "token_revoked") {
              throw new CliError("token_revoked", `${error.message} It was revoked while this upload was in flight, so the upload was discarded and cannot be submitted.`, 3);
            }
            throw error;
          });
          op = operation(response.operation, op.id);
          if (remember(op, state)) await save();
        }
        sayJam(op);
        return { op, title: pending.request.manifest.title, achievements: pending.request.manifest.achievements, kind: pending.request.manifest };
      } catch (error) {
        // A saved upload the server will never accept again. Resuming it only
        // repeats the refusal, so close it here and let the deploy start fresh.
        if (error instanceof ApiError && (DEAD_UPLOAD_CODES as readonly string[]).includes(error.code)) {
          pending.terminal = true; await save();
          throw new DeadUpload(error);
        }
        // The server answered the create itself with a refusal (a token without Deploy, a
        // removed game, an invalid request, a key reused for other bytes), so no operation
        // exists and the key saved for it has nothing to resume. Left open, `status` said
        // "Your deploy was saved before the server answered" and told the agent to deploy
        // again to resume it, after the server had answered. Found by the SDK e2e
        // acceptance run (16 Oct 2026) with a read-only token. A timeout or a 429 keeps it
        // open: the same key is the right retry for those.
        if (error instanceof ApiError && !pending.operationId && error.status >= 400 && error.status < 500 &&
          error.status !== 408 && error.status !== 429) { pending.terminal = true; await save(); }
        if (error instanceof ApiError && !pending.operationId && error.status === 400 && error.reason === "invalid_request" && pending.request.manifest.achievements !== undefined &&
            /manifest/i.test(error.message) && /valid|unknown|unrecogni[sz]ed|achievements/i.test(error.message)) {
          throw new CliError("achievements_unsupported", ERRORS.achievements_unsupported!.message!);
        }
        throw error;
      }
    });
    let result: { op: Operation; title: string; achievements?: GameManifest["achievements"]; kind?: Pick<GameManifest, "kind" | "basedOn"> };
    try { result = await upload(false); }
    catch (error) {
      if (!(error instanceof DeadUpload)) throw error;
      // The server's sentence ends by saying to deploy again; with a pinned key that is
      // exactly what repeats the refusal, so its last instruction is replaced, not added to.
      if (key) throw new CliError(error.cause.code, `${error.cause.message.replace(/\s*(Run opengame deploy[^.]*|Start a new deploy)\.$/, "")} Run opengame deploy with a new --idempotency-key, or without one.`, 2, { next: "opengame deploy" });
      output.emit({ type: "notice", code: "upload_restarted", message: `The saved upload could not finish (${error.cause.message.replace(/\.$/, "")}). Starting a new deploy from your current files.` });
      try { result = await upload(true); }
      catch (again) {
        if (again instanceof DeadUpload) throw new CliError(again.cause.code, again.cause.message, 5, { retry: "later", next: "opengame deploy" });
        throw again;
      }
    }
    let op = result.op;
    let timedOut = false;
    /* Returning here is the default, since 28 Oct 2026. The checks run on our side whether or
       not a terminal waits, and with uploads up to 500 MB the scan alone ran past the five
       minute watch, so a plain deploy held the session for that long and then exited 5 with
       checks_pending: the terminal blocked and still had no answer. The deploy's page shows
       the checks as they run and offers Play when they pass. --wait keeps the old contract
       for a CI job that wants the outcome as an exit code. */
    if (wait) ({ op, timedOut } = await timed("watch", () => watch(api, token, op, output, persist, timeout)));
    if (op.state !== "failed" && op.state !== "expired") await reviewContinues(api, token, root, op, output);
    await syncAchievements(api, token, root, op, result.achievements, output);
    /* Achievements are saved once the preview is ready, and a plain deploy has gone by then.
       `status` finishes the job from this folder (it did for --no-wait all along); said here,
       because "you can close this terminal" read as though nothing was left to do. */
    if (op.state !== "ready" && !terminal(op) && result.achievements?.length) {
      output.emit({ type: "notice", code: "achievements_pending", message: "The achievements in opengame.json are saved once the preview is ready. Run opengame status in this folder after that, or deploy with --wait." });
    }
    await report(op, command, api, output, { resumable: true, timedOut, title: result.title, kind: result.kind, arrive: true, timingsMs: { ...timings, total: Math.round(performance.now() - started) } });
  } finally { await api.close(); }
}

/** A new release does not replace one already submitted. Say so when this folder has a
 * submission still open for an older release, and how to send the new one instead:
 * after a redeploy the terminal said only "Private preview ready", and nothing told the
 * person the review they were waiting on was still about the previous build. A failed
 * read says nothing rather than holding up a deploy that worked. */
async function reviewContinues(api: Api, token: string, root: string, op: Operation, output: Output) {
  try {
    const submitted = savedSubmit(await readProject(root, api.origin), false)?.submissionId;
    if (!submitted) return;
    const current = await readSubmission(api, token, submitted);
    if (!current || current.releaseId === op.releaseId || !(["needs_certification", ...SUBMISSION_OPEN] as string[]).includes(current.state)) return;
    /* Since the one flow (5 Nov 2026) a ready deploy goes to review by
       itself and replaces an older release still in review, so this says that rather than
       asking for a submit. One being published is the exception, and it is said too. */
    const publishing = current.state === "publishing";
    output.emit({ type: "notice", code: "review_continues", message: publishing
      ? `${current.ref} is publishing release ${current.releaseId.slice(0, 8)}. This ${op.releaseId ? "release" : "deploy"} goes to review by itself once that has finished.`
      : `${current.ref} has release ${current.releaseId.slice(0, 8)} in review (${RELEASE_STATUS[submissionStatus(current)].label}). This ${op.releaseId ? "release goes" : "deploy goes, once it is ready,"} to review by itself and replaces it.` });
  } catch { /* the deploy's own result is what matters here */ }
}

/** One line for `status`: the release that is live, whether it is listed and the link to share. */
function publicationLine(live: NonNullable<CreatorGame["publication"]>, title: string): string {
  if (live.state === "publishing") return `${title}: publishing release ${live.releaseId.slice(0, 8)}. ${RELEASE_STATUS.publishing.message}`;
  return `${title}: release ${live.releaseId.slice(0, 8)} is live${live.listed ? "" : `, unlisted. ${LISTING.unlisted.message}`}${live.listed ? "." : ""} Share ${live.url}`;
}

/** The review half of a `status` result: where the submission stands, whether it has
 * settled, and the one command that moves it on. `newest` is the release this deploy
 * made, so a return about an older release says the newer one is the one to submit. */
function reviewSummary(review: Submission, newest: string | null) {
  /* A hold is settled as far as a caller can tell: nothing it or a poll does moves it, so
     "opengame status --watch" with done false sent an agent round a loop that the watch
     itself now refuses to run. It moves when our test machine is verified, which a later
     plain status will show. */
  const held = submissionStatus(review) === "held";
  const open = (SUBMISSION_OPEN as readonly string[]).includes(review.state) && !held;
  const message = reviewLine(review, newest);
  // `next` is always a command an agent can run; the certify page and the deploy page where
  // a passed review's details are confirmed are a person's, so they are `url`. A return of the
  // newest release needs a fixed deploy, which goes to review by itself (the one flow); a
  // newer release than the returned one is already in review.
  const next = review.state === "needs_certification" || review.state === "awaiting_details" ? "opengame status --watch"
    : held ? "opengame status"
    : open ? "opengame status --watch"
    : review.state === "returned" ? (newest && newest !== review.releaseId ? "opengame status --watch" : "opengame deploy")
    : null;
  // `hold` is how an agent tells the launch policy's hold from an outage: both are
  // `waiting`, and only the outage is worth retrying anything over.
  return { state: review.state, label: RELEASE_STATUS[submissionStatus(review)].label, done: !open, next,
    ...(review.certifyUrl && (review.state === "needs_certification" || review.state === "awaiting_details" || open) ? { url: review.certifyUrl } : {}),
    ...(review.hold ? { hold: review.hold } : {}), message };
}
