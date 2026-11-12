import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { LIMITS } from "@opengame/shared";
import { canonicalName } from "@opengame/shared/unicode-casefold";
import { incrementalFilesSchema, incrementalArchiveBytes, incrementalZipLocalHeader, incrementalZipDescriptor,
  incrementalZipCentralHeader, incrementalZipEnd, incrementalCrc32, isBundlePath, type IncrementalFile } from "@opengame/protocol";
import { Api, UploadInterrupted } from "./http";
import { setTimeout as sleep } from "node:timers/promises";
import { CliError, type Output } from "./output";

/** The file transport's file list, in its canonical order, or null when the files cannot
 * go that way (a path the schema refuses, or past the transport's archive size). Decided
 * from sizes and hashes alone, before a byte of the archive is written. */
export function canonicalFiles(rows: IncrementalFile[]): IncrementalFile[] | null {
  const files = [...rows].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  if (!incrementalFilesSchema.safeParse(files).success || incrementalArchiveBytes(files) > Math.min(LIMITS.bundle.archiveBytesMax, LIMITS.platform.incrementalUpload.archiveBytesMax)) return null;
  return files;
}

/** The canonical archive in memory. archive.ts writes the same bytes to disk a file at a
 * time; this one is for Drop's equivalence test and the tests here. */
export function canonicalArchive(entries: [string, Uint8Array][]) {
  const files = canonicalFiles(entries.map(([path, bytes]) => ({ path, sha256: createHash("sha256").update(bytes).digest("hex"), byteSize: bytes.byteLength })));
  if (!files) return null;
  const byPath = new Map(entries);
  const local: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const bytes = byPath.get(file.path)!, crc = incrementalCrc32(bytes);
    const head = incrementalZipLocalHeader(file.path), descriptor = incrementalZipDescriptor(crc, bytes.byteLength);
    local.push(head, bytes, descriptor);
    central.push(incrementalZipCentralHeader(file.path, crc, bytes.byteLength, offset));
    offset += head.byteLength + bytes.byteLength + descriptor.byteLength;
  }
  const directoryBytes = central.reduce((sum, bytes) => sum + bytes.byteLength, 0);
  return { bytes: Buffer.concat([...local, ...central, incrementalZipEnd(files.length, directoryBytes, offset)]), files };
}

function unpackBounded(bytes: Uint8Array) {
  const invalid = () => new CliError("archive_unavailable", "The saved file upload archive is invalid or exceeds the packaging limits. Start a new deploy.", 1);
  if (bytes.byteLength > LIMITS.bundle.archiveBytesMax) throw invalid();
  let total = 0, count = 0;
  const paths = new Set<string>();
  const directories = new Set<string>();
  const members = new Map<string, number>();
  try {
    const unpacked = unzipSync(bytes, { filter: entry => {
      // File uploads use our STORE format. Bound the bytes fflate will actually
      // copy, before allocating them, rather than trusting an expanded-size claim.
      if (entry.compression !== 0 || !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size !== entry.originalSize
        || entry.name.length > LIMITS.bundle.pathBytesMax || !isBundlePath(entry.name)
        || new TextEncoder().encode(entry.name).byteLength > LIMITS.bundle.pathBytesMax) throw invalid();
      const path = canonicalName(entry.name);
      const parts = path.split("/");
      const parents = parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join("/"));
      if (paths.has(path) || directories.has(path) || parents.some(parent => paths.has(parent))) throw invalid();
      total += entry.size; count++;
      // One file's own allowance as well as the tree's: since 11 Nov 2026 the tree's (5 GiB)
      // is past what a 32-bit ZIP size can say, so it alone no longer bounds one member.
      if (count > LIMITS.bundle.fileCountMax || total > LIMITS.bundle.uncompressedBytesMax
        || entry.size > LIMITS.bundle.fileBytesMax) throw invalid();
      paths.add(path);
      for (const parent of parents) directories.add(parent);
      members.set(entry.name, entry.size);
      // Isolate the one setter-shaped name. Otherwise fflate changes its
      // result prototype and later valid names such as length hit inherited
      // accessors before this function can copy the result safely.
      return entry.name !== "__proto__";
    } });
    let prototypeMember: Uint8Array | undefined;
    if (members.has("__proto__")) {
      const isolated = unzipSync(bytes, { filter: entry => {
        if (entry.name !== "__proto__") return false;
        if (entry.compression !== 0 || entry.size !== entry.originalSize || entry.size !== members.get(entry.name)) throw invalid();
        return true;
      } });
      prototypeMember = Object.getOwnPropertyDescriptor(isolated, "__proto__")?.value ?? Object.getPrototypeOf(isolated);
    }
    const tree: Record<string, Uint8Array> = Object.create(null);
    for (const [name, size] of members) {
      // fflate 0.8.x accumulates into {}. Its __proto__ assignment stores that
      // isolated admitted file as the prototype instead of an own member.
      // Copy only verified byte buffers, without assigning any prototype here.
      const own = Object.getOwnPropertyDescriptor(unpacked, name);
      const value = name === "__proto__" ? prototypeMember : own?.value;
      if (!(value instanceof Uint8Array) || value.byteLength !== size) throw invalid();
      Object.defineProperty(tree, name, { value, enumerable: true });
    }
    return tree;
  } catch { throw invalid(); }
}

export function filesFromArchive(bytes: Uint8Array): IncrementalFile[] {
  const tree = unpackBounded(bytes);
  const files = Object.entries(tree).map(([path, value]) => ({ path, sha256: createHash("sha256").update(value).digest("hex"), byteSize: value.byteLength })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const parsed = incrementalFilesSchema.safeParse(files);
  if (!parsed.success || incrementalArchiveBytes(files) !== bytes.byteLength) throw new CliError("archive_unavailable", "The saved file upload archive is invalid. Start a new deploy with a new retry key.", 1);
  return parsed.data;
}

type Page = { missing: { sha256: string; byteSize: number; upload: unknown }[]; reusedFiles: number; reusedBytes: number; totalFiles: number; totalBytes: number; nextCursor: number | null };
function page(value: unknown, files: IncrementalFile[]): Page {
  const row = value as Page;
  const known = new Map(files.map(file => [file.sha256, file.byteSize]));
  if (!row || !Array.isArray(row.missing) || row.missing.length > LIMITS.platform.incrementalUpload.batchFilesMax
    || row.missing.some(item => !item || known.get(item.sha256) !== item.byteSize)
    || !Number.isSafeInteger(row.totalFiles) || row.totalFiles !== files.length || !Number.isSafeInteger(row.totalBytes)
    || row.totalBytes !== files.reduce((sum, file) => sum + file.byteSize, 0) || !Number.isSafeInteger(row.reusedBytes) || row.reusedBytes < 0 || row.reusedBytes > row.totalBytes || !Number.isSafeInteger(row.reusedFiles) || row.reusedFiles < 0 || row.reusedFiles > row.totalFiles
    || (row.nextCursor !== null && (!Number.isSafeInteger(row.nextCursor) || row.nextCursor < 1))) throw new CliError("invalid_response", "The server returned an invalid file upload plan. Retry the deploy.", 5);
  return row;
}

/** Progress counts a file only after the server verified its hash and size. Bytes
 * in flight are displayed separately from server-confirmed completed bytes. */
/** The retry described in uploadMissingFiles, for any upload request to the API: the
 * server's own outage and the network, a short wait only, one attempt kept back.
 * archive-parts.ts uses it for the requests around an archive sent in parts. */
export async function retryShortly<T>(output: Output, run: () => Promise<T>, leaseSeconds = 0): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try { return await run(); }
    catch (error) {
      const transient = error instanceof CliError && error.retry === "later" && (error.code === "temporarily_unavailable" || error.code === "network");
      const asked = transient ? Math.max(1, (error as CliError).retryAfterSeconds ?? 2 ** attempt) : undefined;
      if (asked === undefined || asked > 60 || attempt >= LIMITS.platform.deploy.uploadAttemptsMax - 1) throw error;
      // up to a quarter more, so workers refused together do not come back together
      const wait = Math.ceil(Math.max(asked, leaseSeconds + 1) * (1 + Math.random() / 4));
      output.emit({ type: "notice", code: "upload_request_retrying", message: `The server could not answer yet; trying again in ${wait} s.` });
      await sleep(wait * 1000);
    }
  }
}

export async function uploadMissingFiles(api: Api, token: string, operation: string, bytes: Uint8Array, files: IncrementalFile[], first: unknown, output: Output, options: {
  route?: "assets";
  delivery?: string;
  inputDigest?: string;
  readFile?: (file: IncrementalFile) => Promise<Uint8Array>;
  /** Reads some of a page's files ahead, together, and may leave any out for readFile. */
  readFiles?: (files: IncrementalFile[]) => Promise<Map<string, Uint8Array>>;
} = {}) {
  const tree = unpackBounded(bytes);
  const byHash = new Map(files.map(file => [file.sha256, file]));
  const route = options.route ?? "files";
  let cursor = 0;
  const loadPage = async (next: number) => {
    const response = await api.json(`/api/v1/operations/${operation}/${route}?cursor=${next}`, { token });
    if (route === "assets" && (response.delivery !== (options.delivery ?? "unity-assets-v1") || response.inputDigest !== options.inputDigest)) {
      throw new CliError("invalid_response", "The server returned a different asset identity. Retry the saved deploy.", 5);
    }
    return page(response.files, files);
  };
  const verify = async (item: { sha256: string; byteSize: number }) => {
    const response = await api.json(`/api/v1/operations/${operation}/${route}/${item.sha256}`, { token, method: "POST" });
    if (route === "assets") {
      const file = response.file as { sha256?: unknown; byteSize?: unknown; verified?: unknown } | undefined;
      if (!file || file.sha256 !== item.sha256 || file.byteSize !== item.byteSize || file.verified !== true) {
        throw new CliError("invalid_response", "The server did not confirm the uploaded file. Retry the saved deploy.", 5);
      }
    }
  };
  // A request the server could not finish this time, a database read that timed out under load or a lease that ran
  // out, used to end the whole deploy, and resuming a 13,225-file plan walked every page again first (OG Clash, 27 Oct
  // 2026). A short "retry later" on a page or a verification is retried here. A long one, such as a paused review
  // budget, still ends the deploy, and since a verification may spend one of the file's server attempts each time, one
  // is left for a resume.
  //
  // A verification is different from a page. The server may already have claimed the file when it failed (a slow R2
  // read, a lost answer), and a claim holds a lease; asked again inside it, the database answers build_conflict, which
  // abandons the deploy. So a verification waits out the lease before it asks again. Only the server's own outage and
  // the network are retried: the CLI's refusals of an answer share "retry later" without being transient.
  const shortRetry = <T>(run: () => Promise<T>, leaseSeconds = 0) => retryShortly(output, run, leaseSeconds);
  const settledVerify = (item: { sha256: string; byteSize: number }) =>
    shortRetry(() => verify(item), LIMITS.platform.incrementalUpload.verificationLeaseSeconds);
  const settledPage = (next: number) => shortRetry(() => loadPage(next));
  let current = page(first, files), completedFiles = current.reusedFiles;
  let completedBytes = current.reusedBytes, uploadedFiles = 0, uploadedBytes = 0;
  const confirmed = new Set<string>(), cursors = new Set<number>();
  const started = Date.now();
  /* Each upload URL in a page is signed for expiresInSeconds from when the page was read,
     and a page holds batchFilesMax files. On the asset route those can be up to a gigabyte
     each, so on a slow link the later files in a page were reached with a URL that had
     already expired: storage said 403, the file spent one of its attempts and a backoff
     on a PUT that could never land, and with a whole page of large files that happened to
     every one of them. So every descriptor is kept with the time it arrived, and a file
     whose URL is near its end asks for the page again first, which signs a new one.
     Rereading a page is what the retry below already does; this only does it before the
     PUT fails rather than after. The tenth kept back is for the request in flight. */
  const issued = new Map<string, { upload: unknown; at: number }>();
  // `at` is when the page arrived, which for a page asked for ahead is earlier than when its files are reached.
  const adopt = (row: Page, at = Date.now()) => { for (const file of row.missing) issued.set(file.sha256, { upload: file.upload, at }); };
  const expiring = (hash: string) => {
    const held = issued.get(hash);
    const seconds = (held?.upload as { expiresInSeconds?: unknown } | undefined)?.expiresInSeconds;
    return route === "assets" && !!held && typeof seconds === "number" && seconds > 0 && Date.now() - held.at >= seconds * 900;
  };
  adopt(current);
  for (;;) {
    // An asset plan can be thousands of small files, and reading each on its own started a
    // helper process per file. The page is bounded, so reading its files ahead is too.
    const ahead = await options.readFiles?.(current.missing.filter(item => !confirmed.has(item.sha256))
      .map(item => byHash.get(item.sha256)!).filter(file => !tree[file.path])) ?? new Map<string, Uint8Array>();
    // Files go up several at a time: each one is a PUT and a verification the server answers on its own, and one at a
    // time OG Clash's 13,225 cooked files took about three seconds each, eleven hours in all (27 Oct 2026).
    const queue = current.missing.filter(item => !confirmed.has(item.sha256));
    // The next page is asked for while this one uploads. A page of a large plan took the server about five seconds to
    // answer, with every worker idle until it did, which halved OG Clash's upload rate (27 Oct 2026). Its counts may be
    // older than this page's uploads; the assets route takes the larger of the two below, so a stale total is harmless.
    if (current.nextCursor !== null && cursors.has(current.nextCursor)) throw new CliError("invalid_response", "The file upload plan repeated a page. Retry the deploy.", 5);
    const following = current.nextCursor === null ? null : settledPage(current.nextCursor).then(row => ({ row, at: Date.now() }));
    following?.catch(() => {}); // a failure here is reported by the await below, not as an unhandled rejection
    // Every file this invocation sees verified is counted here once, by whichever worker or refresh confirms it first.
    // A refresh used to adopt the server's verified total instead, which was exact one file at a time and is not with
    // several in flight: a file whose verification the server has answered and whose worker has not yet resumed is in
    // that total, and its worker then counts it again.
    const count = (sha256: string) => {
      if (confirmed.has(sha256)) return;
      confirmed.add(sha256);
      const references = files.filter(file => file.sha256 === sha256), size = byHash.get(sha256)!.byteSize * references.length;
      uploadedFiles += references.length; uploadedBytes += size;
      completedFiles = route === "assets" ? completedFiles + references.length : current.reusedFiles + uploadedFiles;
      completedBytes = route === "assets" ? completedBytes + size : current.reusedBytes + uploadedBytes;
    };
    /** Read the current page again. A file that left its missing list was verified, by this invocation or another
     * worker, and is counted once through `count`; the answer for `item` is its fresh descriptor or none. */
    const refresh = async (item: { sha256: string }) => {
      const refreshed = await settledPage(cursor);
      const pendingHashes = new Set(refreshed.missing.map(file => file.sha256));
      for (const prior of current.missing) if (prior.sha256 !== item.sha256 && !pendingHashes.has(prior.sha256)) count(prior.sha256);
      adopt(refreshed);
      return refreshed.missing.find(file => file.sha256 === item.sha256);
    };
    const send = async (item: typeof queue[number]) => {
      // a refresh in another worker may have found this one verified already
      if (confirmed.has(item.sha256)) return;
      const source = byHash.get(item.sha256)!;
      const early = ahead.get(source.path);
      ahead.delete(source.path);
      // The hash below is checked whichever way the bytes arrived.
      const blob = tree[source.path] ?? early ?? await options.readFile?.(source);
      if (!blob) throw new CliError("archive_unavailable", "A saved upload file is unavailable. Restore the source export and retry.", 1);
      if (blob.byteLength !== item.byteSize || createHash("sha256").update(blob).digest("hex") !== item.sha256) throw new CliError("archive_unavailable", "A saved dependency changed. Start a new deploy.", 1);
      let upload = issued.get(item.sha256)?.upload ?? item.upload, settled = false;
      if (expiring(item.sha256)) {
        const missing = await refresh(item);
        if (!missing) { await settledVerify(item); settled = true; } else upload = missing.upload;
      }
      for (let attempt = 1; !settled; attempt++) {
        try {
          await api.uploadFile(upload, blob, (sent, total) => output.emit({ type: "progress", stage: "upload", operation,
            message: `Sending file: ${sent} of ${total} bytes; ${completedFiles} of ${files.length} files verified`,
            bytes: completedBytes + sent, total: current.totalBytes, files: completedFiles, totalFiles: files.length, elapsedMs: Date.now() - started }));
          await settledVerify(item);
          break;
        } catch (error) {
          if (route !== "assets" || !(error instanceof UploadInterrupted)) throw error;
          if (attempt >= LIMITS.platform.deploy.uploadAttemptsMax) throw new CliError("upload_interrupted", "The whole-file upload did not finish. Run opengame deploy again to resume verified files.", 5, { next: "opengame deploy", retry: "later" });
          output.emit({ type: "notice", code: "upload_retrying", message: "Retrying the interrupted file from the beginning; verified files remain saved." });
          await sleep(Math.min(8000, 1000 * 2 ** (attempt - 1)));
          // A fresh descriptor can report that the PUT landed despite a lost
          // answer. Verification is still required before counting it complete.
          const missing = await refresh(item);
          if (!missing) { await settledVerify(item); break; }
          upload = missing.upload;
        }
      }
      count(item.sha256);
    };
    let next = 0, failed = false;
    // One failure ends the deploy, so the other workers stop taking files, and the files already in flight finish
    // before the error is reported, so nothing is still sending after the CLI has said the deploy stopped.
    const worker = async () => { while (!failed && next < queue.length) { try { await send(queue[next++]!); } catch (error) { failed = true; throw error; } } };
    const settled = await Promise.allSettled(Array.from({ length: Math.min(LIMITS.platform.incrementalUpload.concurrency, queue.length) }, worker));
    const rejected = settled.find(result => result.status === "rejected");
    if (rejected) throw (rejected as PromiseRejectedResult).reason;
    if (current.nextCursor === null || !following) break;
    cursors.add(current.nextCursor);
    cursor = current.nextCursor;
    const arrived = await following;
    current = arrived.row;
    adopt(current, arrived.at);
    completedFiles = route === "assets" ? Math.max(completedFiles, current.reusedFiles) : current.reusedFiles + uploadedFiles;
    completedBytes = route === "assets" ? Math.max(completedBytes, current.reusedBytes) : current.reusedBytes + uploadedBytes;
  }
  const response = await api.json(`/api/v1/operations/${operation}/${route}/complete`, { token, method: "POST" });
  output.emit({ type: "progress", stage: "upload", operation, message: `Verified ${files.length} files (${current.totalBytes} bytes)`,
    files: files.length, totalFiles: files.length, bytes: current.totalBytes, total: current.totalBytes, elapsedMs: Date.now() - started });
  return response;
}
