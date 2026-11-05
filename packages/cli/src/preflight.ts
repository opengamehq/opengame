import { createHash } from "node:crypto";
import { Worker } from "node:worker_threads";
import type { platformPreflight } from "@opengame/preflight/platform";
import type { PreflightFile } from "@opengame/preflight";
import { isBundlePath } from "@opengame/protocol";
import { LIMITS } from "@opengame/shared";
import { CliError } from "./output";

/** Keep hostile or unusually dense source off the CLI's event loop. File reads
 * still use the caller's snapshot, so timing out cannot change what was checked. */
export function runPreflight(files: PreflightFile[], timeoutMs = LIMITS.platform.deploy.preflightTimeoutMs, options: { externalPaths?: readonly string[]; externalDelivery?: string; manifestRequires?: unknown } = {}): Promise<Awaited<ReturnType<typeof platformPreflight>>> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../dist/preflight-worker.mjs", import.meta.url), {
      workerData: { files: files.map(({ path, size }) => ({ path, size })), externalPaths: options.externalPaths, externalDelivery: options.externalDelivery, manifestRequires: options.manifestRequires }, env: {}, execArgv: [],
      resourceLimits: { maxOldGenerationSizeMb: LIMITS.platform.deploy.preflightMemoryMb },
    });
    let finished = false;
    const finish = (error?: CliError, result?: Awaited<ReturnType<typeof platformPreflight>>) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      void worker.terminate();
      if (error) reject(error);
      else resolve(result!);
    };
    const unavailable = () => finish(new CliError("preflight_unavailable", "The local checker could not finish. Retry the check; if it continues, reinstall the current internal CLI.", 5));
    const timer = setTimeout(unavailable, timeoutMs);
    worker.on("error", unavailable);
    worker.on("exit", () => { if (!finished) unavailable(); });
    worker.on("message", async (message) => {
      if (finished) return;
      if (message.type === "result") { finish(undefined, message.result); return; }
      if (!["read", "read-bytes", "read-head"].includes(message.type) || !Number.isInteger(message.index) || !files[message.index]) { unavailable(); return; }
      // A header read (a Godot pack's version) is a few bytes; refuse anything larger.
      if (message.type === "read-head") {
        let bytes: Uint8Array | undefined;
        const length = Number.isInteger(message.length) && message.length > 0 && message.length <= 64 ? message.length as number : 0;
        try { bytes = length ? (await files[message.index]!.head?.(length))?.slice(0, length) : undefined; } catch { /* Structural failure only. */ }
        if (!finished) worker.postMessage({ id: message.id, bytes });
        return;
      }
      if (message.type === "read-bytes") {
        let bytes: Uint8Array | undefined;
        try { bytes = await files[message.index]!.bytes?.(); } catch { /* Structural failure only. */ }
        if (!finished) worker.postMessage({ id: message.id, bytes });
        return;
      }
      let text: string | undefined;
      try { text = await files[message.index]!.text(); } catch { /* Report an unreadable file without exposing the exception. */ }
      if (!finished) worker.postMessage({ id: message.id, text });
    });
  });
}


/** All parser input comes from the exact bytes that will be packaged. Binary
 * admission must never depend on decoding a payload through the text callback. */
export function snapshotPreflightFiles(snapshot: Map<string, Uint8Array>): PreflightFile[] {
  return [...snapshot].map(([path, bytes]) => ({ path, size: bytes.byteLength,
    bytes: async () => bytes, head: async (length: number) => bytes.subarray(0, length),
    text: async () => Buffer.from(bytes).toString("utf8") }));
}


export type RawRuntimeEvidence = NonNullable<Awaited<ReturnType<typeof platformPreflight>>["rawRuntimes"]>[number];

/** Parser evidence is necessary, but must also describe the bytes still in this
 * snapshot. This selects an uploadable raw entry; it does not derive a shell or
 * claim that the corresponding runtime has been shipped. */
export function matchedRawRuntime(result: Awaited<ReturnType<typeof platformPreflight>>, snapshot: Map<string, Uint8Array>): RawRuntimeEvidence | undefined {
  if (!result.ok || result.hasEntryPoint || snapshot.has(LIMITS.bundle.entryPoint) || result.rawRuntimes?.length !== 1) return undefined;
  const raw = result.rawRuntimes[0]!;
  if (raw.complete !== true || raw.manualReviewRequired !== false || !isBundlePath(raw.path)
    || !((raw.engine === "ruffle" && raw.format === "swf") || (raw.engine === "jsdos" && raw.format === "jsdos"))) return undefined;
  const bytes = snapshot.get(raw.path);
  if (!bytes || bytes.byteLength !== raw.bytes || createHash("sha256").update(bytes).digest("hex") !== raw.sha256) return undefined;
  if (!raw.path.startsWith(result.strippedRoot) || !result.include.includes(raw.path.slice(result.strippedRoot.length))) return undefined;
  return raw;
}
