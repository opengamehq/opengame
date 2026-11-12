import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile, appendFile } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LIMITS } from "@opengame/shared";
import { archivePartBytes, archivePartCount, type IncrementalFile } from "@opengame/protocol";
import { canonicalArchive, uploadMissingFiles } from "../src/incremental";
import { Gate, HELD_BYTES_MAX, Meter, READ_AHEAD_BYTES_MAX, sendFiles, TRANSPORT_HEADERS } from "../src/transport";
import { Api, UploadInterrupted } from "../src/http";
import { CliError, Output } from "../src/output";
import { safeReadLargeFile } from "../src/safe-fs";

/* The transport a CLI uses against a server that says fileParts (src/transport.ts). Until 12 Nov 2026 every file
   cost a PUT and a verification of its own, eight at a time in 32-file pages, which the server answered by reading
   the file back, and a large file went up whole and started again after any drop. */

const UPLOAD = LIMITS.platform.incrementalUpload, MULTIPART = LIMITS.platform.deploy.multipart;
const quiet = () => new Output(true, () => {});
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** A stand-in for the upload routes: pages of up to the size asked for, a verification page, and parts. */
function fakeServer(files: IncrementalFile[], options: { held?: Record<string, number[]>; dropPart?: (hash: string, part: number, attempt: number) => boolean;
  missingOnce?: string } = {}) {
  const distinct = [...new Map(files.map(file => [file.sha256, file])).values()];
  const verified = new Set<string>(), parts = new Map<string, Set<number>>(Object.entries(options.held ?? {}).map(([hash, list]) => [hash, new Set(list)]));
  const log = { pageHeaders: [] as (Record<string, string> | undefined)[], verifies: [] as { hashes: string[]; timeoutMs?: number }[], signings: [] as number[][],
    puts: 0, partPuts: [] as string[], checksums: [] as (string | undefined)[], live: 0, peak: 0, streams: new Set<number>(),
    plans: 0, packs: [] as { files: number; bytes: number }[] };
  const attempts = new Map<string, number>();
  let missingOnce = options.missingOnce;
  // As the server pages: a cursor into every distinct file, listing the ones in that stretch still unverified.
  const pageAt = (cursor: number, asked: number) => {
    const slice = distinct.slice(cursor, cursor + asked).filter(file => !verified.has(file.sha256));
    return { missing: slice.map(file => ({ sha256: file.sha256, byteSize: file.byteSize, upload: { sha: file.sha256 } })), reusedFiles: 0, reusedBytes: 0,
      totalFiles: files.length, totalBytes: files.reduce((sum, file) => sum + file.byteSize, 0), nextCursor: cursor + asked < distinct.length ? cursor + asked : null };
  };
  const busy = async <T>(work: () => Promise<T>) => {
    log.live++; log.peak = Math.max(log.peak, log.live);
    try { await new Promise(resolve => setTimeout(resolve, 5)); return await work(); } finally { log.live--; }
  };
  const api = {
    json: async (path: string, init: { body?: { hashes?: string[]; parts?: number[] }; headers?: Record<string, string>; timeoutMs?: number; bytes?: Uint8Array; responseBytesMax?: number } = {}) => {
      if (path.endsWith("/files/plan")) {
        log.plans++;
        assert.equal(init.responseBytesMax, UPLOAD.planResponseBytesMax, "a plan's answer may be past the ordinary response cap");
        return { files: distinct.filter(file => !verified.has(file.sha256)).map(file => ({ sha256: file.sha256, byteSize: file.byteSize })), totalFiles: distinct.length };
      }
      if (path.endsWith("/files/pack")) {
        // The wire format file-packs.ts reads: a four-byte length, the JSON header, then the files end to end.
        const body = Buffer.from(init.bytes!), length = body.readUInt32LE(0);
        const head = JSON.parse(body.subarray(4, 4 + length).toString()) as { files: { sha256: string; byteSize: number }[] };
        assert.ok(body.byteLength <= UPLOAD.bodyBytesMax, `a pack of ${body.byteLength} bytes`);
        assert.ok(head.files.length <= UPLOAD.packFilesMax);
        let at = 4 + length;
        const fresh: string[] = [];
        for (const file of head.files) {
          assert.ok(file.byteSize <= UPLOAD.packFileBytesMax);
          assert.equal(sha(body.subarray(at, at + file.byteSize)), file.sha256);
          at += file.byteSize;
          if (!verified.has(file.sha256)) fresh.push(file.sha256);
          verified.add(file.sha256);
        }
        assert.equal(at, body.byteLength);
        log.packs.push({ files: head.files.length, bytes: body.byteLength });
        return { files: fresh.map(hash => ({ sha256: hash, byteSize: distinct.find(file => file.sha256 === hash)!.byteSize, verified: true })) };
      }
      if (path.includes("?cursor=")) {
        log.pageHeaders.push(init.headers);
        return { files: pageAt(Number(new URL(path, "https://x.invalid").searchParams.get("cursor")), Number(init.headers?.["x-opengame-upload-page-files"] ?? UPLOAD.batchFilesMax)) };
      }
      if (path.endsWith("/files/verify")) {
        const hashes = init.body!.hashes!;
        log.verifies.push({ hashes, ...(init.timeoutMs ? { timeoutMs: init.timeoutMs } : {}) });
        if (missingOnce && hashes.includes(missingOnce)) {
          missingOnce = undefined;
          parts.get(hashes[0]!)?.delete(1);
          throw new CliError("upload_missing", "1 of 5 parts of a file have not arrived. Send them and try again.", 5, { retry: "later" });
        }
        for (const hash of hashes) verified.add(hash);
        return { files: hashes.map(hash => ({ sha256: hash, byteSize: distinct.find(file => file.sha256 === hash)!.byteSize, verified: true })) };
      }
      const partMatch = /\/files\/([0-9a-f]{64})\/parts$/.exec(path);
      if (partMatch) {
        const hash = partMatch[1]!, file = distinct.find(item => item.sha256 === hash)!, asked = init.body!.parts!;
        if (asked.length) log.signings.push(asked);
        const have = parts.get(hash) ?? new Set<number>();
        return { file: { sha256: hash, byteSize: file.byteSize, partBytes: MULTIPART.partBytes, partCount: archivePartCount(file.byteSize, MULTIPART.partBytes),
          uploaded: false, uploadedParts: [...have].sort((a, b) => a - b) },
        parts: asked.map(part => ({ partNumber: part, url: `https://r2.invalid/${hash}?part=${part}`, expiresInSeconds: 3600,
          headers: { "content-length": String(archivePartBytes(file.byteSize, MULTIPART.partBytes, part)) } })) };
      }
      throw new Error(`unexpected ${path}`);
    },
    uploadFile: (value: { sha: string }, bytes: Uint8Array, progress: (sent: number) => void, checksum?: string, streams?: number) => busy(async () => {
      log.puts++; log.checksums.push(checksum); log.streams.add(streams ?? 1);
      assert.equal(sha(bytes), value.sha);
      progress(bytes.byteLength);
    }),
    uploadPart: (value: { url: string }, bytes: Uint8Array, progress: (sent: number) => void) => busy(async () => {
      const url = new URL(value.url), hash = url.pathname.slice(1), part = Number(url.searchParams.get("part"));
      const key = `${hash}:${part}`, attempt = (attempts.get(key) ?? 0) + 1;
      attempts.set(key, attempt);
      log.partPuts.push(key);
      if (options.dropPart?.(hash, part, attempt)) throw new UploadInterrupted("the connection dropped");
      progress(bytes.byteLength);
      if (!parts.has(hash)) parts.set(hash, new Set());
      parts.get(hash)!.add(part);
    }),
  } as unknown as Api;
  return { api, log, verified, parts };
}

/** A large file whose bytes are made on demand, so a test can send a gigabyte without holding one. */
const synthetic = (byteSize: number, label: string): IncrementalFile => ({ path: `assets/${label}.pak`, byteSize, sha256: sha(Buffer.from(label)) });
const fill = (offset: number, length: number) => new Uint8Array(length).fill(offset / MULTIPART.partBytes & 0xff);

test("small files go up with checksum PUTs in long pages, and are verified a page at a time", async () => {
  const entries: [string, Uint8Array][] = Array.from({ length: 300 }, (_, index) => [`f/${String(index).padStart(3, "0")}.js`, Buffer.from(`export default ${index};`)]);
  const archive = canonicalArchive(entries)!;
  const fake = fakeServer(archive.files);
  const first = fakeServer(archive.files);
  const tree = new Map(entries);
  await sendFiles(fake.api, "token", "operation", archive.files, (await first.api.json("/x?cursor=0", { headers: TRANSPORT_HEADERS })).files, quiet(), {
    route: "files", read: async (file, offset, length) => tree.get(file.path)!.subarray(offset, offset + length) });
  assert.equal(fake.log.puts, 300);
  assert.deepEqual(new Set(fake.log.checksums), new Set(archive.files.map(file => file.sha256)), "every PUT names its file's SHA-256");
  assert.equal(fake.verified.size, 300);
  assert.ok(fake.log.verifies.length <= 4, `${fake.log.verifies.length} verification requests for 300 files; one each was the old cost`);
  assert.ok(fake.log.pageHeaders.every(headers => headers?.["x-opengame-upload-checksum"] === "sha256" && headers["x-opengame-upload-page-files"] === String(UPLOAD.pageFilesMax)));
  assert.ok(fake.log.peak <= UPLOAD.concurrency, `peak ${fake.log.peak} PUTs at once`);
  assert.ok(fake.log.peak >= Math.min(UPLOAD.concurrency, 16), `the pool filled: peak ${fake.log.peak}`);
  assert.deepEqual([...fake.log.streams], [UPLOAD.concurrency], "each PUT's timeout knows how many share the link");
});

test("a large file goes up in parts read a part at a time, and memory never holds more than a part per stream", async () => {
  const big = synthetic(4 * MULTIPART.partBytes + 5 * 1024 * 1024, "big"), huge = synthetic(40 * MULTIPART.partBytes, "huge");
  const files = [big, huge];
  const fake = fakeServer(files);
  // Bytes are held from the read until their PUT has finished, which is when the transport lets them go.
  let held = 0, peakHeld = 0;
  const reads: [string, number, number][] = [];
  const read = async (file: IncrementalFile, offset: number, length: number) => {
    reads.push([file.path, offset, length]); held += length; peakHeld = Math.max(peakHeld, held);
    return fill(offset, length);
  };
  const put = fake.api.uploadPart.bind(fake.api);
  (fake.api as unknown as { uploadPart: typeof put }).uploadPart = (async (...args: Parameters<typeof put>) => {
    try { return await put(...args); } finally { held -= args[1].byteLength; }
  }) as typeof put;
  // The assets route checks the delivery the page names; this stand-in names none, and neither do the options.
  await sendFiles(fake.api, "token", "operation", files, (await fake.api.json("/x?cursor=0", { headers: TRANSPORT_HEADERS })).files, quiet(), { route: "assets", read });
  assert.equal(fake.log.puts, 0, "no large file went up whole");
  assert.equal(fake.log.partPuts.length, 5 + 40);
  assert.ok(reads.every(([, offset, length]) => offset % MULTIPART.partBytes === 0 && length <= MULTIPART.partBytes), "reads are part-sized and part-aligned");
  assert.ok(peakHeld <= HELD_BYTES_MAX, `peak ${peakHeld} bytes held`);
  assert.ok(fake.log.peak <= UPLOAD.concurrency);
  assert.ok(fake.log.signings.length <= 4, `${fake.log.signings.length} signing requests for 45 parts`);
  assert.deepEqual(fake.log.verifies.map(row => row.hashes.length), [1, 1], "each parted file is verified on its own");
  assert.ok(fake.log.verifies.every(row => row.timeoutMs === UPLOAD.verificationLeaseSeconds * 1000), "with the time the server's lease allows for hashing it");
});

test("whole files too small for parts still hold no more than a part per stream between them", async () => {
  // Sixteen 40 MiB files at once would be 640 MiB; the memory gate keeps what is read and not yet sent to HELD_BYTES_MAX.
  const size = 40 * 1024 * 1024;
  const contents = Array.from({ length: 20 }, (_, index) => new Uint8Array(size).fill(index + 1));
  const files = contents.map((bytes, index) => ({ path: `assets/${index}.bin`, byteSize: size, sha256: sha(bytes) }));
  const fake = fakeServer(files);
  let held = 0, peakHeld = 0;
  const put = fake.api.uploadFile.bind(fake.api);
  (fake.api as unknown as { uploadFile: typeof put }).uploadFile = (async (...args: Parameters<typeof put>) => {
    try { return await put(...args); } finally { held -= args[1].byteLength; }
  }) as typeof put;
  await sendFiles(fake.api, "token", "operation", files, (await fake.api.json("/x?cursor=0", { headers: TRANSPORT_HEADERS })).files, quiet(), { route: "files",
    read: async file => { held += file.byteSize; peakHeld = Math.max(peakHeld, held); return contents[Number(file.path.match(/(\d+)\.bin$/)![1])]!; } });
  assert.equal(fake.log.puts, 20);
  assert.ok(peakHeld <= HELD_BYTES_MAX, `peak ${peakHeld / 1048576} MiB held`);
});

test("a rerun sends only the parts storage does not hold, and a dropped part is resent alone", async () => {
  const big = synthetic(4 * MULTIPART.partBytes + 5 * 1024 * 1024, "resume");
  const fake = fakeServer([big], { held: { [big.sha256]: [1, 2, 3] }, dropPart: (_hash, part, attempt) => part === 4 && attempt === 1 });
  const events: { code?: string }[] = [];
  await sendFiles(fake.api, "token", "operation", [big], (await fake.api.json("/x?cursor=0", { headers: TRANSPORT_HEADERS })).files,
    new Output("jsonl", line => events.push(JSON.parse(line))), { route: "files", read: async (_file, offset, length) => fill(offset, length) });
  assert.deepEqual([...fake.log.partPuts].sort(), [`${big.sha256}:4`, `${big.sha256}:4`, `${big.sha256}:5`]);
  assert.equal(fake.log.partPuts.filter(key => key.endsWith(":4")).length, 2);
  assert.equal(fake.log.partPuts.some(key => /:[123]$/.test(key)), false, "parts storage already held are not sent again");
  assert.equal(events.filter(event => event.code === "upload_retrying").length, 1);
  assert.equal(fake.verified.has(big.sha256), true);
});

test("a verification that finds a part missing sends what storage lacks and verifies again, once", async () => {
  const big = synthetic(4 * MULTIPART.partBytes + 5 * 1024 * 1024, "missing");
  const fake = fakeServer([big], { missingOnce: big.sha256 });
  await sendFiles(fake.api, "token", "operation", [big], (await fake.api.json("/x?cursor=0", { headers: TRANSPORT_HEADERS })).files, quiet(),
    { route: "files", read: async (_file, offset, length) => fill(offset, length) });
  assert.equal(fake.log.partPuts.filter(key => key.endsWith(":1")).length, 2, "part 1, lost by storage, went up again");
  assert.equal(fake.log.verifies.length, 2);
  assert.equal(fake.verified.has(big.sha256), true);
});

test("uploadMissingFiles uses the transport only for a server that says fileParts", async () => {
  const archive = canonicalArchive([["index.html", Buffer.from("a")], ["file.js", Buffer.from("xy")]])!;
  for (const fileParts of [false, true]) {
    const fake = fakeServer(archive.files);
    const json = fake.api.json.bind(fake.api);
    let completed = false;
    (fake.api as unknown as { json: typeof json }).json = (async (path: string, init?: Parameters<typeof json>[1]) => {
      if (path.endsWith("/complete")) { completed = true; return { operation: { state: "queued" } }; }
      // the old route verifies each file on its own path
      if (/\/files\/[0-9a-f]{64}$/.test(path)) return {};
      return json(path, init);
    }) as typeof json;
    const first = (await json("/x?cursor=0", fileParts ? { headers: TRANSPORT_HEADERS } : {})).files;
    await uploadMissingFiles(fake.api, "token", "operation", archive.bytes, archive.files, first, quiet(), { fileParts });
    assert.equal(completed, true);
    assert.equal(fake.log.verifies.length, fileParts ? 1 : 0, fileParts ? "one verification page" : "an older server verifies each file on its own");
    assert.deepEqual(new Set(fake.log.checksums), new Set(fileParts ? archive.files.map(file => file.sha256) : [undefined]));
  }
});

test("the gate holds its weight, and runs an item larger than itself alone rather than never", async () => {
  const gate = new Gate(10);
  let live = 0, peak = 0;
  const task = (weight: number) => gate.run(weight, async () => { live += weight; peak = Math.max(peak, live); await new Promise(resolve => setTimeout(resolve, 5)); live -= weight; });
  await Promise.all([task(4), task(4), task(4), task(25), task(1)]);
  assert.ok(peak <= 25 && peak >= 8);
  const order: number[] = [];
  await Promise.all([gate.run(10, async () => { await new Promise(resolve => setTimeout(resolve, 5)); order.push(1); }), gate.run(1, async () => { order.push(2); })]);
  assert.deepEqual(order, [1, 2], "first come, first served");
});

test("the progress line names the rate and the time left from the last few seconds", () => {
  let now = 0;
  const meter = new Meter(() => now);
  assert.equal(meter.words(0, 100 * 1024 * 1024, 0), "Sending 0 bytes of 100 MiB");
  now = 2000;
  assert.match(meter.words(20 * 1024 * 1024, 100 * 1024 * 1024, 20 * 1024 * 1024), /^Sending 20(\.\d)? MiB of 100 MiB at 10(\.\d)? MiB\/s, about 8 s left$/);
  now = 2000 + 600_000;
  assert.match(meter.words(30 * 1024 * 1024, 4096 * 1024 * 1024, 30 * 1024 * 1024), /about \d+ min left$/);
});

test("a part is read from disk without the rest of its file, and a file that changed size is refused", async t => {
  const root = await mkdtemp(join(process.env.TMPDIR ?? tmpdir(), "og-range-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bytes = Buffer.alloc(3 * 1024 * 1024);
  for (let index = 0; index < bytes.length; index++) bytes[index] = index * 7 & 0xff;
  await writeFile(join(root, "data.bin"), bytes);
  const part = await safeReadLargeFile(root, "data.bin", bytes.length, undefined, { offset: 1024 * 1024, length: 1024 * 1024, size: bytes.length });
  assert.deepEqual(part, bytes.subarray(1024 * 1024, 2 * 1024 * 1024));
  await assert.rejects(safeReadLargeFile(root, "data.bin", bytes.length, undefined, { offset: 2 * 1024 * 1024, length: 2 * 1024 * 1024, size: bytes.length }),
    { code: "build_changed" }, "a range past the end");
  await appendFile(join(root, "data.bin"), "x");
  await assert.rejects(safeReadLargeFile(root, "data.bin", bytes.length + 1, undefined, { offset: 0, length: 1024, size: bytes.length }),
    { code: "build_changed" }, "the file is no longer the size the plan recorded");
});

test("a checksum PUT sends the header the server signed, and refuses one that names other bytes", async t => {
  const seen: Record<string, string | undefined>[] = [];
  const server = createServer((req, res) => { seen.push({ checksum: req.headers["x-amz-checksum-sha256"] as string | undefined }); req.resume(); req.on("end", () => res.end()); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const api = new Api(origin);
  t.after(() => api.close());
  const bytes = Buffer.from("file bytes"), hash = sha(bytes), base64 = Buffer.from(hash, "hex").toString("base64");
  const upload = (checksum?: string) => ({ url: `${origin}/put`, headers: { "content-type": "application/octet-stream", "if-none-match": "*",
    "content-length": String(bytes.length), ...(checksum ? { "x-amz-checksum-sha256": checksum } : {}) } });
  await api.uploadFile(upload(base64), bytes, undefined, hash);
  await api.uploadFile(upload(), bytes, undefined, hash);
  assert.deepEqual(seen, [{ checksum: base64 }, { checksum: undefined }]);
  await assert.rejects(api.uploadFile(upload(Buffer.from("f".repeat(64), "hex").toString("base64")), bytes, undefined, hash), { code: "invalid_upload" });
  assert.equal(seen.length, 2, "nothing was sent for a checksum naming other bytes");
});

test("with packs, 25,000 small files are a few dozen requests and no PUT, and files the server holds are not sent", async () => {
  // 25,000 PUTs, sixteen at a time, took 68 s on an emulated 100 Mbps link with 40 ms of latency (12 Nov 2026).
  const entries: [string, Uint8Array][] = Array.from({ length: 25_000 }, (_, index) => [`f/${String(index).padStart(5, "0")}.bin`, new Uint8Array(randomBytes(4096))]);
  const archive = canonicalArchive(entries)!;
  const tree = new Map(entries);
  const fake = fakeServer(archive.files);
  // Two files an earlier deploy left: neither is sent again.
  for (const file of archive.files.slice(0, 2)) fake.verified.add(file.sha256);
  const events: { type: string; files?: number; totalFiles?: number }[] = [];
  await sendFiles(fake.api, "token", "operation", archive.files, (await fake.api.json("/x?cursor=0", { headers: TRANSPORT_HEADERS })).files,
    new Output("jsonl", line => events.push(JSON.parse(line))), {
    route: "files", packs: true, read: async (file, offset, length) => tree.get(file.path)!.subarray(offset, offset + length) });
  assert.equal(events.filter(event => event.type === "progress").at(-1)?.files, 25_000, "the two the server held count as done, once");
  assert.equal(fake.log.puts, 0, "no file went up on its own");
  assert.equal(fake.log.plans, 1);
  assert.ok(fake.log.packs.length <= 30, `${fake.log.packs.length} packs`);
  assert.equal(fake.log.packs.reduce((sum, pack) => sum + pack.files, 0), 25_000 - 2);
  assert.equal(fake.verified.size, 25_000);
});

test("with packs, a file past what a pack takes goes in parts, however much smaller than 64 MiB it is", async () => {
  const middling = { path: "assets/texture.ktx2", byteSize: 2 * 1024 * 1024, sha256: sha(fill(0, 2 * 1024 * 1024)) };
  const small = { bytes: new Uint8Array(randomBytes(100)) };
  const files = [middling, { path: "index.html", byteSize: 100, sha256: sha(small.bytes) }];
  const fake = fakeServer(files);
  await sendFiles(fake.api, "token", "operation", files, (await fake.api.json("/x?cursor=0", { headers: TRANSPORT_HEADERS })).files, quiet(), {
    route: "files", packs: true, read: async (file, offset, length) => file.path === "index.html" ? small.bytes : fill(offset, length) });
  assert.deepEqual(fake.log.partPuts, [`${middling.sha256}:1`]);
  assert.equal(fake.log.packs.length, 1);
  assert.equal(fake.log.puts, 0);
});

test("with packs, tiny files are held to packFilesMax a pack, not only to its bytes", async () => {
  const entries: [string, Uint8Array][] = Array.from({ length: 3_000 }, (_, index) => [`t/${String(index).padStart(4, "0")}.txt`, new TextEncoder().encode(`tiny ${index}`)]);
  const archive = canonicalArchive(entries)!;
  const tree = new Map(entries);
  const fake = fakeServer(archive.files);
  await sendFiles(fake.api, "token", "operation", archive.files, (await fake.api.json("/x?cursor=0", { headers: TRANSPORT_HEADERS })).files, quiet(), {
    route: "files", packs: true, read: async (file, offset, length) => tree.get(file.path)!.subarray(offset, offset + length) });
  assert.equal(fake.log.packs.length, Math.ceil(3_000 / UPLOAD.packFilesMax));
  assert.ok(fake.log.packs.every(pack => pack.files <= UPLOAD.packFilesMax));
});

/* Four findings from Greptile's review of the 0.9.2 mirror (opengamehq/opengame#8): a failed verification was
   dropped, a failure on a page before the last was an unhandled rejection, cleanup stopped waiting at the first
   failure, and read-ahead held whole pages outside the memory gate. */

const smallFiles = (count: number, size = 16) => {
  const contents = Array.from({ length: count }, (_, index) => new Uint8Array(size).fill(index % 251).map((value, at) => at === 0 ? index & 0xff : at === 1 ? index >> 8 : value));
  const files = contents.map((bytes, index) => ({ path: `f/${String(index).padStart(4, "0")}.bin`, byteSize: size, sha256: sha(bytes) }));
  const byPath = new Map(files.map((file, index) => [file.path, contents[index]!]));
  return { files, read: async (file: IncrementalFile, offset: number, length: number) => byPath.get(file.path)!.subarray(offset, offset + length), byPath };
};
const firstPage = async (api: Api) => (await api.json("/x?cursor=0", { headers: TRANSPORT_HEADERS })).files;

test("a verification that fails on an early page fails the upload instead of being dropped", async () => {
  const { files, read } = smallFiles(UPLOAD.pageFilesMax + 40);
  const fake = fakeServer(files);
  const json = fake.api.json.bind(fake.api);
  let refused = 0;
  (fake.api as unknown as { json: typeof json }).json = (async (path: string, init?: Parameters<typeof json>[1]) => {
    if (path.endsWith("/files/verify") && !refused++) throw new CliError("upload_missing", "A file has not arrived.", 5);
    return json(path, init);
  }) as typeof json;
  await assert.rejects(sendFiles(fake.api, "token", "operation", files, await firstPage(fake.api), quiet(), { route: "files", read }), { code: "upload_missing" });
  assert.equal(refused >= 1, true);
});

test("a file that fails on a page before the last is the command's error, not an unhandled rejection", async t => {
  const { files, read } = smallFiles(UPLOAD.pageFilesMax + 40);
  const fake = fakeServer(files);
  const json = fake.api.json.bind(fake.api), put = fake.api.uploadFile.bind(fake.api);
  // The next page is slow to arrive, so the first page's failure settles while the loop waits for it.
  (fake.api as unknown as { json: typeof json }).json = (async (path: string, init?: Parameters<typeof json>[1]) => {
    if (path.includes("?cursor=") && !path.endsWith("cursor=0")) await new Promise(resolve => setTimeout(resolve, 100));
    return json(path, init);
  }) as typeof json;
  (fake.api as unknown as { uploadFile: typeof put }).uploadFile = (async (...args: Parameters<typeof put>) => {
    if (args[0] && (args[0] as unknown as { sha: string }).sha === files[3]!.sha256) throw new CliError("upload_refused", "Storage refused a file.", 5);
    return put(...args);
  }) as typeof put;
  const unhandled: unknown[] = [];
  const listener = (reason: unknown) => { unhandled.push(reason); };
  process.on("unhandledRejection", listener);
  t.after(() => { process.off("unhandledRejection", listener); });
  await assert.rejects(sendFiles(fake.api, "token", "operation", files, await firstPage(fake.api), quiet(), { route: "files", read }), { code: "upload_refused" });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(unhandled, []);
});

test("after a failure nothing is still sending once the command has stopped, whole files or parts", async () => {
  for (const shape of ["whole", "parts"] as const) {
    const { files, read } = shape === "whole" ? smallFiles(40) : { files: [synthetic(6 * MULTIPART.partBytes, "stop")], read: async (_file: IncrementalFile, offset: number, length: number) => fill(offset, length) };
    const fake = fakeServer(files);
    let live = 0, calls = 0;
    const slow = <T extends (...args: never[]) => Promise<unknown>>(original: T) => (async (...args: Parameters<T>) => {
      const call = ++calls;
      live++;
      try {
        if (call === 2) throw new CliError("upload_refused", "Storage refused a file.", 5);
        await new Promise(resolve => setTimeout(resolve, 40));
        return await original(...args);
      } finally { live--; }
    });
    (fake.api as unknown as { uploadFile: unknown }).uploadFile = slow(fake.api.uploadFile.bind(fake.api));
    (fake.api as unknown as { uploadPart: unknown }).uploadPart = slow(fake.api.uploadPart.bind(fake.api));
    await assert.rejects(sendFiles(fake.api, "token", "operation", files, await firstPage(fake.api), quiet(), { route: "files", read }), { code: "upload_refused" });
    assert.equal(live, 0, `${shape}: ${live} PUTs were still running when the command reported its failure`);
  }
});

test("read-ahead takes no more than READ_AHEAD_BYTES_MAX of a page, and the rest are read one at a time", async () => {
  const size = 1024 * 1024;
  const { files, read, byPath } = smallFiles(UPLOAD.pageFilesMax + 20, size);
  const fake = fakeServer(files);
  const asked: number[] = [];
  let readSingly = 0;
  await sendFiles(fake.api, "token", "operation", files, await firstPage(fake.api), quiet(), { route: "files",
    read: async (file, offset, length) => { readSingly++; return read(file, offset, length); },
    readAhead: async rows => { asked.push(rows.reduce((sum, row) => sum + row.byteSize, 0)); return new Map(rows.map(row => [row.path, byPath.get(row.path)!])); } });
  assert.equal(fake.verified.size, files.length);
  assert.ok(asked.length >= 1 && asked.every(bytes => bytes <= READ_AHEAD_BYTES_MAX), `read ahead ${asked.map(bytes => bytes / size).join(", ")} MiB a page`);
  assert.equal(readSingly, files.length - asked.reduce((sum, bytes) => sum + bytes / size, 0));
});

test("the failure reported is the first one, not a later part that gave up because of it", async () => {
  const big = synthetic(6 * MULTIPART.partBytes, "first");
  const fake = fakeServer([big]);
  const put = fake.api.uploadPart.bind(fake.api);
  // Part 1 is mid-PUT when part 3 finds the file changed; part 1's drop then comes from the stop, not the cause.
  (fake.api as unknown as { uploadPart: typeof put }).uploadPart = (async (...args: Parameters<typeof put>) => {
    if (new URL((args[0] as unknown as { url: string }).url).searchParams.get("part") === "1") {
      await new Promise(resolve => setTimeout(resolve, 40));
      throw new UploadInterrupted("the connection dropped");
    }
    return put(...args);
  }) as typeof put;
  await assert.rejects(sendFiles(fake.api, "token", "operation", [big], await firstPage(fake.api), quiet(), { route: "files",
    read: async (_file, offset, length) => {
      if (offset === 2 * MULTIPART.partBytes) throw new CliError("archive_unavailable", "A saved file changed.", 1);
      return fill(offset, length);
    } }), { code: "archive_unavailable" });
});

test("a PUT waiting to retry sends nothing new once something else has failed", async () => {
  const { files, read } = smallFiles(2);
  const fake = fakeServer(files);
  const put = fake.api.uploadFile.bind(fake.api);
  let retried = 0;
  (fake.api as unknown as { uploadFile: typeof put }).uploadFile = (async (...args: Parameters<typeof put>) => {
    if ((args[0] as unknown as { sha: string }).sha === files[0]!.sha256 && retried++ === 0) throw new UploadInterrupted("the connection dropped");
    return put(...args);
  }) as typeof put;
  await assert.rejects(sendFiles(fake.api, "token", "operation", files, await firstPage(fake.api), quiet(), { route: "files",
    read: async (file, offset, length) => {
      if (file === files[1]) { await new Promise(resolve => setTimeout(resolve, 100)); throw new CliError("build_changed", "A file changed.", 1); }
      return read(file, offset, length);
    } }), { code: "build_changed" });
  assert.equal(retried, 1, "the dropped PUT was not tried again after the deploy had failed");
});

test("with packs, a pack the server refuses is the command's error, and nothing is sent after it", async () => {
  const { files, read } = smallFiles(3_000);
  const fake = fakeServer(files);
  const json = fake.api.json.bind(fake.api);
  let packs = 0, after = 0, refusedAt = 0;
  (fake.api as unknown as { json: typeof json }).json = (async (path: string, init?: Parameters<typeof json>[1]) => {
    if (path.endsWith("/files/pack")) {
      if (++packs === 2) { refusedAt = Date.now(); throw new CliError("upload_size_mismatch", "A file in the pack does not match its SHA-256 hash.", 1); }
      if (refusedAt) after++;
    }
    return json(path, init);
  }) as typeof json;
  await assert.rejects(sendFiles(fake.api, "token", "operation", files, await firstPage(fake.api), quiet(), { route: "files", packs: true, read }),
    { code: "upload_size_mismatch" });
  assert.ok(after <= UPLOAD.concurrency, `${after} packs went up after the refusal; only those already started may finish`);
});
