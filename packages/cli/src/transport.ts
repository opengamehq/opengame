import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { archivePartBytes, archivePartCount, archivePartUploadSchema, type IncrementalFile } from "@opengame/protocol";
import { LIMITS } from "@opengame/shared";
import { Api, UploadInterrupted, type UploadHeaders } from "./http";
import { page as readPage, retryShortly, type Page } from "./incremental";
import { readableBytes } from "./bytes";
import { CliError, type Output } from "./output";

/**
 * A file or large-asset upload to a server whose bootstrap says `fileParts` (12 Nov 2026).
 *
 * Up to then the CLI sent each file in one PUT and asked the server to verify it on its own,
 * eight at a time: a PUT and a verification round trip per file, which the server answered by
 * reading the file back out of storage, 32 files a page. That left a big build bound by round
 * trips rather than by the link: 25,000 small files were 782 pages and 50,000 requests, and a
 * gigabyte file started again from its first byte after any drop while the CLI held all of it.
 *
 * Here:
 *   - every PUT is signed with the file's SHA-256, so storage refuses any other bytes and the
 *     server verifies with a HEAD (x-opengame-upload-checksum);
 *   - pages name up to pageFilesMax files (x-opengame-upload-page-files), and the next page is
 *     read while this one goes up, never more than two pages of work ahead;
 *   - files are verified a page at a time, one request and one database write (files/verify);
 *   - a file past multipart.aboveBytes goes up in parts of multipart.partBytes through
 *     files/{hash}/parts, read from disk a part at a time, so a drop costs one part and a rerun
 *     sends only the parts storage does not hold;
 *   - whole files and parts share one pool of incrementalUpload.concurrency PUTs, and the bytes
 *     held in memory for them are bounded by that many parts, plus READ_AHEAD_BYTES_MAX for each of
 *     the two pages whose small files may have been read ahead.
 */

const UPLOAD = LIMITS.platform.incrementalUpload, MULTIPART = LIMITS.platform.deploy.multipart;

/** What a fileParts server reads beside a create or page request. */
export const TRANSPORT_HEADERS: UploadHeaders = { "x-opengame-upload-checksum": "sha256", "x-opengame-upload-page-files": String(UPLOAD.pageFilesMax) };

/** At most this many bytes of files and parts are held in memory for PUTs at once: a part per stream. */
export const HELD_BYTES_MAX = UPLOAD.concurrency * MULTIPART.partBytes;

/** A page's small files are read ahead together up to this many bytes, and the rest are read one at a time
 * under the memory gate. Without the cap a page of 256 files of up to 1 MiB was read whole, outside the gate,
 * and the next page beside it: about 512 MiB on top of HELD_BYTES_MAX (Greptile on the 0.9.2 mirror). */
export const READ_AHEAD_BYTES_MAX = 2 * MULTIPART.partBytes;

/** Waits for every task to settle, then rejects with the first failure if there was one. Promise.all rejects at
 * the first failure while the rest are still reading and sending, and they then outlive the command. */
async function settled(tasks: Promise<unknown>[]): Promise<void> {
  const failure = (await Promise.allSettled(tasks)).find(result => result.status === "rejected");
  if (failure) throw failure.reason;
}

/** Bytes `length` long from `offset` in a file of the plan. A whole file is offset 0 and its size. */
export type ReadRange = (file: IncrementalFile, offset: number, length: number) => Promise<Uint8Array>;

/** A counting gate: `run(weight, work)` waits until `weight` fits under the capacity. A weight past the
 * capacity is taken as the whole of it, so one oversized item runs alone rather than never. First come,
 * first served, so a large item is not starved by a stream of small ones. */
export class Gate {
  private used = 0;
  private readonly queue: { need: number; go: () => void }[] = [];
  constructor(readonly capacity: number) {}
  async run<T>(weight: number, work: () => Promise<T>): Promise<T> {
    const need = Math.min(Math.max(weight, 1), this.capacity);
    if (this.queue.length || this.used + need > this.capacity) await new Promise<void>(go => this.queue.push({ need, go }));
    else this.used += need;
    try { return await work(); }
    finally {
      this.used -= need;
      while (this.queue.length && this.used + this.queue[0]!.need <= this.capacity) {
        const next = this.queue.shift()!;
        this.used += next.need;
        next.go();
      }
    }
  }
}

/** Throughput over the last few seconds, and what is left at that rate, in words a person reads. */
export class Meter {
  private readonly samples: [number, number][] = [];
  constructor(private readonly now: () => number = Date.now) {}
  /** `sent` is every byte this run has moved, landed or in flight. */
  rate(sent: number): number {
    const at = this.now();
    this.samples.push([at, sent]);
    while (this.samples.length > 2 && at - this.samples[0]![0] > 10_000) this.samples.shift();
    const [firstAt, firstSent] = this.samples[0]!;
    return at - firstAt >= 1000 ? Math.max(0, sent - firstSent) / ((at - firstAt) / 1000) : 0;
  }
  words(done: number, total: number, sent: number): string {
    const rate = this.rate(sent);
    const left = rate > 0 ? Math.ceil((total - done) / rate) : null;
    const eta = left === null ? "" : left < 60 ? `, about ${Math.max(1, left)} s left` : `, about ${Math.ceil(left / 60)} min left`;
    return `Sending ${readableBytes(done)} of ${readableBytes(total)}${rate > 0 ? ` at ${readableBytes(rate)}/s` : ""}${eta}`;
  }
}

type Signed = { url: string; headers: Record<string, string>; expiresInSeconds: number; at: number };

export async function sendFiles(api: Api, token: string, operation: string, files: IncrementalFile[], first: unknown, output: Output, options: {
  route: "files" | "assets";
  delivery?: string;
  inputDigest?: string;
  read: ReadRange;
  /** Reads some of a page's files ahead, together, and may leave any out for `read`. */
  readAhead?: (files: IncrementalFile[]) => Promise<Map<string, Uint8Array>>;
  /** Tests only: the clock the progress line's rate is measured against. */
  now?: () => number;
  /** The server's bootstrap said filePacks: small files go in packs and the rest in parts (sendPacked below). */
  packs?: boolean;
}): Promise<Record<string, unknown>> {
  const byHash = new Map(files.map(file => [file.sha256, file]));
  const references = new Map<string, number>();
  for (const file of files) references.set(file.sha256, (references.get(file.sha256) ?? 0) + 1);
  const streams = new Gate(UPLOAD.concurrency), memory = new Gate(HELD_BYTES_MAX);
  const meter = new Meter(options.now);
  const started = Date.now();
  const pagePath = (cursor: number) => `/api/v1/operations/${operation}/${options.route}?cursor=${cursor}`;
  const loadPage = async (cursor: number) => {
    const response = await api.json(pagePath(cursor), { token, headers: TRANSPORT_HEADERS });
    if (options.route === "assets" && (response.delivery !== options.delivery || response.inputDigest !== options.inputDigest)) {
      throw new CliError("invalid_response", "The server returned a different asset identity. Retry the saved deploy.", 5);
    }
    return readPage(response.files, files, UPLOAD.pageFilesMax);
  };
  let current: Page = readPage(first, files, UPLOAD.pageFilesMax);
  const total = current.totalBytes;
  let doneBytes = current.reusedBytes, doneFiles = current.reusedFiles, failed = false;
  /* The first failure, which is the one reported. Once `failed` is set, PUTs still in flight give up with
     errors of their own (an interrupted PUT is not retried), and whichever of those settles first would
     otherwise name the wrong cause. A failed verification is kept here too: its promise leaves the set when it
     settles, so awaiting the set at the end would find nothing and complete an upload nobody confirmed. */
  let firstFailure: { error: unknown } | null = null;
  const fail = (error: unknown) => { failed = true; firstFailure ??= { error }; };
  const stopIfFailed = () => { if (firstFailure) throw firstFailure.error; };
  const counted = new Set<string>(), inFlight = new Map<string, number>();
  let shown = -1, shownAt = 0;
  const report = (force = false) => {
    const sent = doneBytes + [...inFlight.values()].reduce((sum, value) => sum + value, 0);
    const percent = total ? Math.floor(Math.min(sent, total) / total * 100) : 100;
    const now = Date.now();
    if (!force && (output.json ? percent === shown || percent % 10 !== 0 : percent === shown && now - shownAt < 1000)) return;
    shown = percent; shownAt = now;
    output.emit({ type: "progress", stage: "upload", operation, message: `${meter.words(Math.min(sent, total), total, sent)}; ${doneFiles} of ${files.length} files verified`,
      bytes: Math.min(sent, total), total, files: doneFiles, totalFiles: files.length, elapsedMs: now - started });
  };
  /** A hash verified, by this run or found so already; counted once whichever confirms it first. */
  const count = (hash: string) => {
    if (counted.has(hash)) return;
    counted.add(hash);
    const many = references.get(hash) ?? 1;
    doneFiles += many; doneBytes += byHash.get(hash)!.byteSize * many;
    report();
  };
  const verifyPath = `/api/v1/operations/${operation}/files/verify`;
  const verify = async (hashes: string[], timeoutMs?: number) => {
    const answer = await retryShortly(output, () => api.json(verifyPath, { token, method: "POST", body: { hashes }, timeoutMs }));
    const listed = Array.isArray(answer.files) ? answer.files as { sha256?: unknown; verified?: unknown }[] : null;
    // Hashes verified before this request are left out of the answer; anything listed must be one asked about.
    if (!listed || listed.some(row => typeof row?.sha256 !== "string" || !hashes.includes(row.sha256) || row.verified !== true)) {
      throw new CliError("invalid_response", "The server did not confirm the uploaded files. Retry the saved deploy.", 5);
    }
    for (const hash of hashes) count(hash);
  };

  /* Whole files are verified a page at a time: queued as each lands, sent once a page's worth is waiting or
     the page has gone up, several verifications in flight at once. */
  let waiting: string[] = [];
  const verifications = new Set<Promise<void>>();
  const flush = () => {
    if (!waiting.length) return;
    const batch = waiting; waiting = [];
    const run: Promise<void> = verify(batch)
      .catch(fail)
      .finally(() => verifications.delete(run));
    verifications.add(run);
  };
  const landed = (hash: string) => { waiting.push(hash); if (waiting.length >= UPLOAD.pageFilesMax) flush(); };

  /** One PUT attempt after another, with a fresh descriptor between them from `renew`, until it lands or
   * uploadAttemptsMax have not. `renew` answering null means the server holds the bytes already. */
  const attempt = async (key: string, put: (progress: (sent: number) => void) => Promise<void>, renew: () => Promise<boolean>) => {
    for (let tries = 1; ; tries++) {
      try {
        await put(sent => { inFlight.set(key, sent); report(); });
        return;
      } catch (error) {
        if (!(error instanceof UploadInterrupted) || failed) throw error;
        if (tries >= LIMITS.platform.deploy.uploadAttemptsMax) {
          throw new CliError("upload_interrupted", `An upload did not finish after ${tries} tries; the last time ${error.cause}. Everything already sent is kept. Check your connection, then run opengame deploy to resume.`, 5, { next: "opengame deploy", retry: "later" });
        }
        output.emit({ type: "notice", code: "upload_retrying", message: `An upload was interrupted (${error.cause}). Trying it again, ${tries + 1} of ${LIMITS.platform.deploy.uploadAttemptsMax}; everything already sent is kept.` });
        await sleep(Math.min(8000, 1000 * 2 ** (tries - 1)));
        // Something else failed during the wait: send nothing new, so the command can stop and say so.
        if (failed) throw error;
        if (!await renew()) return;
      } finally { inFlight.delete(key); }
    }
  };

  const wholeFile = (item: Page["missing"][number], cursor: number, ahead: Map<string, Uint8Array>) => streams.run(1, () => memory.run(item.byteSize, async () => {
    if (failed || counted.has(item.sha256)) return;
    const file = byHash.get(item.sha256)!;
    const early = ahead.get(file.path); ahead.delete(file.path);
    const bytes = early ?? await options.read(file, 0, file.byteSize);
    if (bytes.byteLength !== item.byteSize || createHash("sha256").update(bytes).digest("hex") !== item.sha256) {
      throw new CliError("archive_unavailable", "A saved file changed. Restore it, or start a new deploy.", 1);
    }
    let upload = item.upload;
    await attempt(item.sha256, progress => api.uploadFile(upload, bytes, sent => progress(sent), item.sha256, UPLOAD.concurrency), async () => {
      // A page read again signs the files still missing in it; one no longer missing has been verified.
      const fresh = await retryShortly(output, () => loadPage(cursor));
      const still = fresh.missing.find(row => row.sha256 === item.sha256);
      if (!still) { count(item.sha256); return false; }
      upload = still.upload; return true;
    });
    if (!counted.has(item.sha256)) landed(item.sha256);
  }));

  const partsPath = (hash: string) => `/api/v1/operations/${operation}/files/${hash}/parts`;
  const partFile = async (item: Page["missing"][number]) => {
    const file = byHash.get(item.sha256)!;
    const plan = async () => {
      const answer = await retryShortly(output, () => api.json(partsPath(item.sha256), { token, method: "POST", body: { parts: [] } }));
      const row = answer.file as { byteSize?: unknown; partBytes?: unknown; partCount?: unknown; uploadedParts?: unknown; uploaded?: unknown; verified?: unknown } | undefined;
      if (row?.verified === true) return null;
      if (!row || row.byteSize !== item.byteSize || typeof row.partBytes !== "number" || row.partBytes < 1
        || row.partCount !== archivePartCount(item.byteSize, row.partBytes) || !Array.isArray(row.uploadedParts)) {
        throw new CliError("invalid_upload", "The server returned an invalid upload. Run opengame deploy again.", 5);
      }
      return { partBytes: row.partBytes, partCount: row.partCount as number, uploaded: row.uploaded === true, have: new Set(row.uploadedParts as number[]) };
    };
    // Signed URLs for this file's parts, asked for a request's worth at a time and renewed near the end of their life.
    const signed = new Map<number, Signed>();
    const sign = async (numbers: number[], partBytes: number) => {
      const answer = await retryShortly(output, () => api.json(partsPath(item.sha256), { token, method: "POST", body: { parts: numbers } }));
      const list = Array.isArray(answer.parts) ? answer.parts : [];
      for (const value of list) {
        const part = archivePartUploadSchema.safeParse(value);
        if (!part.success || !numbers.includes(part.data.partNumber)
          || part.data.headers["content-length"] !== String(archivePartBytes(item.byteSize, partBytes, part.data.partNumber))) {
          throw new CliError("invalid_upload", "The server returned an invalid upload. Run opengame deploy again.", 5);
        }
        signed.set(part.data.partNumber, { ...part.data, at: Date.now() });
      }
    };
    const fresh = (part: number) => { const held = signed.get(part); return !!held && Date.now() - held.at < held.expiresInSeconds * 900; };
    for (let pass = 1; ; pass++) {
      const state = await plan();
      if (!state) { count(item.sha256); return; }
      if (!state.uploaded) {
        const todo = Array.from({ length: state.partCount }, (_, index) => index + 1).filter(part => !state.have.has(part));
        const ensure = async (part: number) => {
          if (fresh(part)) return;
          const batch = todo.filter(number => number >= part && !fresh(number)).slice(0, MULTIPART.partsPerRequestMax);
          await sign(batch, state.partBytes);
          if (!fresh(part)) throw new CliError("invalid_upload", "The server did not sign a part it was asked for. Run opengame deploy again.", 5);
        };
        // One signing request for the first parts now, so the pool's workers do not each ask for their own.
        if (todo.length) await sign(todo.filter(part => !fresh(part)).slice(0, MULTIPART.partsPerRequestMax), state.partBytes);
        await settled(todo.map(part => streams.run(1, () => memory.run(archivePartBytes(item.byteSize, state.partBytes, part), async () => {
          if (failed) return;
          const size = archivePartBytes(item.byteSize, state.partBytes, part), offset = (part - 1) * state.partBytes;
          const bytes = await options.read(file, offset, size);
          if (bytes.byteLength !== size) throw new CliError("archive_unavailable", "A saved file changed. Restore it, or start a new deploy.", 1);
          await ensure(part);
          await attempt(`${item.sha256}:${part}`, progress => api.uploadPart(signed.get(part), bytes, sent => progress(sent), UPLOAD.concurrency), async () => {
            signed.delete(part); await ensure(part); return true;
          });
          doneBytes += size; report();
        })).catch(error => { fail(error); throw error; })));
        // The bytes above counted as sent; verification counts the file, so take them back first.
        doneBytes -= todo.reduce((sum, part) => sum + archivePartBytes(item.byteSize, state.partBytes, part), 0);
      }
      if (failed) return;
      try {
        // Joining and hashing a large file takes the server longer than an ordinary request: its own lease.
        await verify([item.sha256], UPLOAD.verificationLeaseSeconds * 1000);
        return;
      } catch (error) {
        // A part storage did not keep: the next pass reads what it holds and sends the rest, once.
        if (pass >= 2 || !(error instanceof CliError) || error.code !== "upload_missing") throw error;
      }
    }
  };

  /* Pages: this one's work is queued while the next is read, and a page's work is queued only once the page
     before the last has gone up, so no URL waits behind more than two pages of other files. The first failure
     stops new work, and everything already in flight finishes before it is reported, so nothing is still
     sending after the command says it stopped. */
  const queued: Promise<unknown>[] = [];
  const settle = (work: Promise<unknown>[]) => {
    const marked = work.map(task => task.catch(error => { fail(error); throw error; }));
    // Cleanup waits for every task, not for the first failure; the page's own promise still fails fast.
    queued.push(Promise.allSettled(marked));
    const all = Promise.all(marked);
    all.catch(() => {});
    return all;
  };
  /* Packs (12 Nov 2026): one read of everything the upload still lacks, every file of at most packFileBytesMax sent
     many to a request, and every other file in parts. No page is read past the first, so no URL is signed and left
     unused, and 25,000 files of 4 KiB are 25 requests rather than 25,000 PUTs. */
  const packPath = `/api/v1/operations/${operation}/files/pack`;
  const sendPack = (items: Page["missing"]) => {
    const weight = items.reduce((sum, item) => sum + item.byteSize, 0);
    return streams.run(1, () => memory.run(weight, async () => {
      if (failed) return;
      const ahead = await options.readAhead?.(items.map(item => byHash.get(item.sha256)!)) ?? new Map<string, Uint8Array>();
      const bodies: Uint8Array[] = [];
      for (const item of items) {
        const file = byHash.get(item.sha256)!;
        // react-doctor-disable-next-line react-doctor/async-await-in-loop
        const bytes = ahead.get(file.path) ?? await options.read(file, 0, file.byteSize);
        if (bytes.byteLength !== item.byteSize || createHash("sha256").update(bytes).digest("hex") !== item.sha256) {
          throw new CliError("archive_unavailable", "A saved file changed. Restore it, or start a new deploy.", 1);
        }
        bodies.push(bytes);
      }
      const head = Buffer.from(JSON.stringify({ files: items.map(item => ({ sha256: item.sha256, byteSize: item.byteSize })) }));
      const length = Buffer.alloc(4); length.writeUInt32LE(head.byteLength);
      const body = Buffer.concat([length, head, ...bodies]);
      const key = `pack:${items[0]!.sha256}`;
      inFlight.set(key, 0); report();
      const answer = await retryShortly(output, () => api.json(packPath, { token, method: "POST", bytes: body,
        // its share of the slowest supported rate, as a PUT's deadline is (http.ts put)
        timeoutMs: Math.ceil(body.byteLength * UPLOAD.concurrency / LIMITS.platform.deploy.minimumUploadBytesPerSecond) * 1000 }))
        .finally(() => inFlight.delete(key));
      const listed = Array.isArray(answer.files) ? answer.files as { sha256?: unknown; verified?: unknown }[] : null;
      if (!listed || listed.some(row => typeof row?.sha256 !== "string" || !items.some(item => item.sha256 === row.sha256) || row.verified !== true)) {
        throw new CliError("invalid_response", "The server did not confirm the uploaded files. Retry the saved deploy.", 5);
      }
      // Those left out of the answer were verified before this pack; every one of them is verified now.
      for (const item of items) count(item.sha256);
    }));
  };
  /** Small files in plan order, in packs of at most bodyBytesMax as sent and packFilesMax files. */
  const packed = (small: Page["missing"]) => {
    const packs: Page["missing"][] = [];
    let current: Page["missing"] = [], bytes = 16;
    for (const item of small) {
      // Each header row is about a hundred bytes; counted generously so the body never passes the cap.
      const cost = item.byteSize + 120;
      if (current.length && (bytes + cost > UPLOAD.bodyBytesMax || current.length >= UPLOAD.packFilesMax)) { packs.push(current); current = []; bytes = 16; }
      current.push(item); bytes += cost;
    }
    if (current.length) packs.push(current);
    return packs;
  };
  const sendPacked = async () => {
    const answer = await retryShortly(output, () => api.json(`/api/v1/operations/${operation}/files/plan`, { token, method: "POST", responseBytesMax: UPLOAD.planResponseBytesMax }));
    const rows = Array.isArray(answer.files) ? answer.files as { sha256?: unknown; byteSize?: unknown }[] : null;
    if (!rows || rows.some(row => typeof row?.sha256 !== "string" || byHash.get(row.sha256)?.byteSize !== row.byteSize)) {
      throw new CliError("invalid_response", "The server returned an invalid file upload plan. Retry the deploy.", 5);
    }
    const missing = new Set(rows.map(row => row.sha256 as string));
    // Everything the plan does not name is already verified, by an earlier deploy or an earlier run of this one.
    for (const hash of new Set(files.map(file => file.sha256))) if (!missing.has(hash)) count(hash);
    const items = [...missing].map(hash => ({ sha256: hash, byteSize: byHash.get(hash)!.byteSize, upload: null }));
    const small = items.filter(item => item.byteSize <= UPLOAD.packFileBytesMax);
    await settle([...packed(small).map(sendPack), ...items.filter(item => item.byteSize > UPLOAD.packFileBytesMax).map(partFile)]);
  };
  let cursor = 0, older: Promise<unknown> = Promise.resolve();
  const seen = new Set<number>();
  if (options.packs) {
    // Counted from the plan instead of the first page.
    doneBytes = 0; doneFiles = 0;
  }
  report(true);
  try {
    // Packs end the way pages do, below: every verification waited for, and the first failure thrown.
    if (options.packs) await sendPacked();
    else for (;;) {
      const pending = current.missing.filter(item => !counted.has(item.sha256));
      const early: IncrementalFile[] = [];
      let aheadBytes = 0;
      for (const item of pending) {
        if (item.byteSize > MULTIPART.aboveBytes || aheadBytes + item.byteSize > READ_AHEAD_BYTES_MAX) continue;
        aheadBytes += item.byteSize; early.push(byHash.get(item.sha256)!);
      }
      const ahead = early.length && options.readAhead ? await options.readAhead(early) : new Map<string, Uint8Array>();
      const pageCursor = cursor;
      const work = settle(pending.map(item => item.byteSize > MULTIPART.aboveBytes ? partFile(item) : wholeFile(item, pageCursor, ahead)));
      const next = current.nextCursor;
      if (next !== null && seen.has(next)) throw new CliError("invalid_response", "The file upload plan repeated a page. Retry the deploy.", 5);
      const following = next === null ? null : retryShortly(output, () => loadPage(next));
      following?.catch(() => {});
      await older;
      stopIfFailed();
      older = work.then(() => flush());
      // Awaited only after the next page arrives; until then a failure here must not be an unhandled rejection,
      // which ends the process before the error and its next step are printed.
      older.catch(() => {});
      if (next === null || !following) { await older; break; }
      seen.add(next);
      cursor = next;
      current = await following;
    }
    flush();
    await Promise.all(verifications);
    stopIfFailed();
  } catch (error) {
    fail(error);
    await Promise.allSettled([...queued, ...verifications]);
    throw firstFailure!.error;
  }
  report(true);
  return { verifiedFiles: doneFiles, verifiedBytes: doneBytes };
}
