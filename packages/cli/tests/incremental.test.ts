import test from "node:test";
import assert from "node:assert/strict";
import { LIMITS } from "@opengame/shared";
import { unzipSync } from "fflate";
import { canonicalArchive, filesFromArchive, uploadMissingFiles } from "../src/incremental";
import { incrementalArchiveBytes, incrementalZipLocalHeader, incrementalZipDescriptor,
  incrementalZipCentralHeader, incrementalZipEnd, incrementalCrc32 } from "@opengame/protocol";
import { Api } from "../src/http";
import { CliError, Output } from "../src/output";

test("canonical ZIP preserves UTF-8 names, empty files and immutable per-file hashes", () => {
  const entries: [string, Uint8Array][] = [["index.html", Buffer.from("a")], ["café.js", Buffer.from("export default 1")], ["empty.txt", new Uint8Array()]];
  const first = canonicalArchive(entries)!;
  assert.equal(first.bytes.byteLength, incrementalArchiveBytes(first.files));
  assert.deepEqual(filesFromArchive(first.bytes), first.files);
  assert.deepEqual([...unzipSync(first.bytes)["café.js"]!], [...entries[1]![1]]);
  assert.equal(unzipSync(first.bytes)["empty.txt"]?.byteLength, 0);
  assert.deepEqual(canonicalArchive([...entries].reverse())?.bytes, first.bytes, "input traversal order cannot change the uploaded archive");
  entries[0]![1] = Buffer.from("b");
  assert.notEqual(canonicalArchive(entries)!.files.find(file => file.path === "index.html")?.sha256, first.files.find(file => file.path === "index.html")?.sha256);
});

test("canonical writer and real reader retain literal prototype-related filenames", () => {
  const names = ["index.html", "__proto__", "constructor", "prototype", "length", "buffer", "byteLength", "byteOffset",
    "nested/__proto__", "nested/constructor", "nested/prototype"];
  const entries: [string, Uint8Array][] = names.map(name => [name, Buffer.from(`exact bytes for ${name}`)]);
  const written = canonicalArchive(entries)!;
  assert.ok(written);
  const read = filesFromArchive(written.bytes);
  assert.deepEqual(read, written.files);
  assert.deepEqual(read.map(file => file.path), [...names].sort());
  assert.deepEqual(canonicalArchive([...entries].reverse())!.bytes, written.bytes);
});

test("canonical writer and real reader agree on Greek duplicate and ancestor collisions", () => {
  for (const [left, right] of [["\u0390", "\u03AA\u0301"], ["\u1F80\u0308", "\u1F00\u0308\u03B9"]]) {
    for (const paths of [[`${left}.data`, `${right}.data`], [left, `${right}/save.dat`], [`${left}/save.dat`, right]]) {
      for (const ordered of [paths, [...paths].reverse()]) {
        const entries: [string, Uint8Array][] = [["index.html", Buffer.from("game")], ...ordered.map((path): [string, Uint8Array] => [path, Buffer.from("source bytes")])];
        const written = canonicalArchive(entries);
        // This is the actual writer-to-reader seam, not a handmade ZIP. The old
        // writer returned bytes here which the corrected reader then rejected.
        if (written) assert.deepEqual(filesFromArchive(written.bytes), written.files);
        assert.equal(written, null, JSON.stringify(ordered));
      }
    }
    for (const name of [left, right]) {
      const entries: [string, Uint8Array][] = [["index.html", Buffer.from("game")], [`${name}.data`, Buffer.from("source bytes")]];
      const written = canonicalArchive(entries)!;
      assert.ok(written);
      assert.deepEqual(filesFromArchive(written.bytes), written.files);
      assert.ok(written.files.some(file => file.path === `${name}.data`));
      assert.deepEqual(canonicalArchive([...entries].reverse())!.bytes, written.bytes);
    }
  }
});

test("a STORE entry cannot understate the bytes copied from the saved archive", () => {
  const archive = canonicalArchive([["index.html", Buffer.from("game bytes")]])!;
  const altered = Buffer.from(archive.bytes);
  const directoryOffset = altered.readUInt32LE(altered.length - 6);
  altered.writeUInt32LE(0, directoryOffset + 24);
  // The previous filter counted zero, but fflate still copied the compressed
  // size. The later manifest check saw the copied size and accepted this ZIP.
  assert.throws(() => filesFromArchive(altered), { code: "archive_unavailable" });
});

test("saved file uploads reject compression before attempting decompression", () => {
  // One final fixed-Huffman block: literal A, length 3 at distance 1, then
  // end-of-block. Its 30 bits occupy four bytes and expand to four As.
  const payload = { original: Buffer.from("AAAA"), compressed: Buffer.from([0x73, 0x04, 0x02, 0x00]) };
  assert.equal(payload.compressed.length, payload.original.length);
  const head = incrementalZipLocalHeader("index.html");
  const crc = incrementalCrc32(payload.original);
  const central = incrementalZipCentralHeader("index.html", crc, payload.original.length, 0);
  new DataView(head.buffer).setUint16(8, 8, true);
  new DataView(central.buffer).setUint16(10, 8, true);
  const localSize = head.length + payload.compressed.length + 16;
  const archive = Buffer.concat([head, payload.compressed, incrementalZipDescriptor(crc, payload.original.length),
    central, incrementalZipEnd(1, central.length, localSize)]);
  // Equal lengths satisfy the former size-only checks. This is valid DEFLATE,
  // so rejecting a malformed stream cannot make this test pass accidentally.
  assert.deepEqual(Buffer.from(unzipSync(archive)["index.html"]!), payload.original);
  assert.throws(() => filesFromArchive(archive), { code: "archive_unavailable" });
});

function storedFixture(entries: [string, Uint8Array][]) {
  const local: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const [path, bytes] of entries) {
    const crc = incrementalCrc32(bytes), head = incrementalZipLocalHeader(path);
    const descriptor = incrementalZipDescriptor(crc, bytes.byteLength);
    local.push(head, bytes, descriptor);
    central.push(incrementalZipCentralHeader(path, crc, bytes.byteLength, offset));
    offset += head.byteLength + bytes.byteLength + descriptor.byteLength;
  }
  return Buffer.concat([...local, ...central, incrementalZipEnd(entries.length,
    central.reduce((sum, bytes) => sum + bytes.byteLength, 0), offset)]);
}

test("saved file uploads reject duplicate, colliding and malformed paths", () => {
  for (const paths of [["index.html", "index.html"], ["__proto__", "__proto__"], ["constructor", "constructor"], ["index.html", "INDEX.HTML"], ["../index.html"], ["index.html/../private"]]) {
    assert.throws(() => filesFromArchive(storedFixture(paths.map((path): [string, Uint8Array] => [path, Buffer.from("a")]))), { code: "archive_unavailable" });
  }
});

test("prototype-related saved members retain the same pre-allocation size checks", () => {
  const archive = canonicalArchive([["__proto__", Buffer.from("bounded")]])!;
  for (const size of [0, LIMITS.bundle.uncompressedBytesMax + 1]) {
    const altered = Buffer.from(archive.bytes);
    const directoryOffset = altered.readUInt32LE(altered.length - 6);
    altered.writeUInt32LE(size, directoryOffset + 24);
    if (size > 0) altered.writeUInt32LE(size, directoryOffset + 20);
    assert.throws(() => filesFromArchive(altered), { code: "archive_unavailable" });
  }
});

test("writer and saved reader reject slash-dense overlong paths", () => {
  // Stay within ZIP's uint16 filename encoding while exceeding the portable
  // path cap by orders of magnitude. No prefix strings should be materialized.
  const path = "a/".repeat(LIMITS.bundle.pathBytesMax * 40) + "child.dat";
  const entries: [string, Uint8Array][] = [["a", Buffer.from("parent")], [path, Buffer.from("child")]];
  assert.equal(canonicalArchive(entries), null);
  assert.throws(() => filesFromArchive(storedFixture(entries)), { code: "archive_unavailable" });
});

test("saved archives reject canonical caseless duplicates and file-directory conflicts before unpacking", async () => {
  const valid = canonicalArchive([["index.html", Buffer.from("game")]])!;
  for (const [left, right] of [["\u0390", "\u03AA\u0301"], ["\u1F80\u0308", "\u1F00\u0308\u03B9"], ["straße", "strasse"]]) {
    for (const paths of [
      [`${left}.data`, `${right}.data`],
      [left, `${right}/part.data`],
      [`${right}/part.data`, left],
    ]) {
      const archive = storedFixture(paths.map((path): [string, Uint8Array] => [path, Buffer.from("source bytes")]));
      assert.throws(() => filesFromArchive(archive), { code: "archive_unavailable" }, JSON.stringify(paths));
      // Exercise the saved upload reader directly too: a later file-manifest
      // validator must not hide a weaker unpackBounded comparison.
      let apiCalls = 0;
      const api = { json: async () => { apiCalls++; return {}; } } as unknown as Api;
      await assert.rejects(uploadMissingFiles(api, "unused", "operation", archive, valid.files,
        { missing: [], reusedFiles: 1, reusedBytes: 4, totalFiles: 1, totalBytes: 4, nextCursor: null }, new Output(true, () => {})),
      { code: "archive_unavailable" });
      assert.equal(apiCalls, 0, "unsafe archive is refused before even finalizing an upload");
    }
  }
  const archive = canonicalArchive([["index.html", Buffer.from("game")], ["\u0390.data", Buffer.from("one")], ["distinct.data", Buffer.from("two")]])!;
  assert.deepEqual(filesFromArchive(archive.bytes), archive.files, "comparison keys never rewrite accepted archive names or hashes");
});

test("a verification the server asks to retry shortly is retried after its lease, rather than ending the deploy", async t => {
  // The server may have claimed the file before it failed, and asked again inside the claim's lease the database
  // answers build_conflict, which abandons the deploy. The lease is two seconds here so the wait can be measured.
  const upload = LIMITS.platform.incrementalUpload as { verificationLeaseSeconds: number };
  const lease = upload.verificationLeaseSeconds;
  upload.verificationLeaseSeconds = 2;
  t.after(() => { upload.verificationLeaseSeconds = lease; });
  const archive = canonicalArchive([["index.html", Buffer.from("a")]])!;
  const only = archive.files[0]!;
  let verifies = 0, firstAt = 0, secondAt = 0;
  const api = {
    uploadFile: async () => {},
    json: async (path: string) => {
      if (path.endsWith("/complete")) return { operation: { state: "queued" } };
      if (verifies++ === 0) { firstAt = Date.now(); throw new CliError("temporarily_unavailable", "OpenGame could not finish this request. Try again shortly.", 5, { retry: "later", retryAfterSeconds: 0 }); }
      secondAt = Date.now();
      return {};
    },
  } as unknown as Api;
  const result = await uploadMissingFiles(api, "token", "operation", archive.bytes, archive.files,
    { missing: [{ ...only, upload: { sha: only.sha256 } }], reusedFiles: 0, reusedBytes: 0, totalFiles: 1, totalBytes: 1, nextCursor: null }, new Output(true, () => {}));
  assert.equal(verifies, 2);
  assert.ok(secondAt - firstAt >= 3000, `asked again after ${secondAt - firstAt} ms, inside the two-second lease`);
  assert.deepEqual(result, { operation: { state: "queued" } });
  // a paused budget's hours-long wait still ends the deploy
  verifies = 0;
  const paused = { ...api, json: async (path: string) => {
    if (path.endsWith("/complete")) return { operation: { state: "queued" } };
    verifies++; throw new CliError("temporarily_unavailable", "File processing is paused until the review budget resets.", 5, { retry: "later", retryAfterSeconds: 3600 });
  } } as unknown as Api;
  await assert.rejects(uploadMissingFiles(paused, "token", "operation", archive.bytes, archive.files,
    { missing: [{ ...only, upload: { sha: only.sha256 } }], reusedFiles: 0, reusedBytes: 0, totalFiles: 1, totalBytes: 1, nextCursor: null }, new Output(true, () => {})),
    { code: "temporarily_unavailable" });
  assert.equal(verifies, 1);
});

test("a page the server asks to retry shortly is asked for again rather than ending the deploy", async () => {
  const archive = canonicalArchive([["index.html", Buffer.from("a")], ["file.js", Buffer.from("xy")]])!;
  const first = archive.files[0]!, second = archive.files[1]!;
  let pages = 0;
  const api = {
    uploadFile: async () => {},
    json: async (path: string) => {
      if (path.endsWith("?cursor=1")) {
        if (pages++ === 0) throw new CliError("temporarily_unavailable", "OpenGame could not finish this request. Try again shortly.", 5, { retry: "later", retryAfterSeconds: 0 });
        return { files: { missing: [{ ...second, upload: { sha: second.sha256 } }], reusedFiles: 0, reusedBytes: 0, totalFiles: 2, totalBytes: 3, nextCursor: null } };
      }
      if (path.endsWith("/complete")) return { operation: { state: "queued" } };
      return {};
    },
  } as unknown as Api;
  const result = await uploadMissingFiles(api, "token", "operation", archive.bytes, archive.files,
    { missing: [{ ...first, upload: { sha: first.sha256 } }], reusedFiles: 0, reusedBytes: 0, totalFiles: 2, totalBytes: 3, nextCursor: 1 }, new Output(true, () => {}));
  assert.equal(pages, 2);
  assert.deepEqual(result, { operation: { state: "queued" } });
});

test("the CLI's own refusal of an answer is not retried as an outage", async () => {
  const archive = canonicalArchive([["index.html", Buffer.from("a")], ["file.js", Buffer.from("xy")]])!;
  const first = archive.files[0]!;
  let pages = 0;
  const api = {
    uploadFile: async () => {},
    json: async (path: string) => {
      if (path.endsWith("?cursor=1")) { pages++; throw new CliError("invalid_response", "The server returned a different asset identity. Retry the saved deploy.", 5, { retry: "later", retryAfterSeconds: 0 }); }
      return {};
    },
  } as unknown as Api;
  await assert.rejects(uploadMissingFiles(api, "token", "operation", archive.bytes, archive.files,
    { missing: [{ ...first, upload: { sha: first.sha256 } }], reusedFiles: 0, reusedBytes: 0, totalFiles: 2, totalBytes: 3, nextCursor: 1 }, new Output(true, () => {})),
    { code: "invalid_response" });
  assert.equal(pages, 1);
});

test("the next page is asked for while the current page uploads", async () => {
  // The first page's only file holds its PUT until the second page has been requested. Fetched only after the page
  // finished, as it used to be, the second request never comes and the timeout below fails the test.
  const archive = canonicalArchive([["index.html", Buffer.from("a")], ["file.js", Buffer.from("xy")]])!;
  const first = archive.files[0]!, second = archive.files[1]!;
  let asked!: () => void;
  const nextAsked = new Promise<void>(resolve => { asked = resolve; });
  const api = {
    uploadFile: async (value: { sha: string }) => {
      if (value.sha !== first.sha256) return;
      await Promise.race([nextAsked, new Promise((_, reject) => setTimeout(() => reject(new Error("the next page was not prefetched")), 2000))]);
    },
    json: async (path: string) => {
      if (path.endsWith("?cursor=1")) { asked(); return { files: { missing: [{ ...second, upload: { sha: second.sha256 } }], reusedFiles: 0, reusedBytes: 0, totalFiles: 2, totalBytes: 3, nextCursor: null } }; }
      if (path.endsWith("/complete")) return { operation: { state: "queued" } };
      return {};
    },
  } as unknown as Api;
  const result = await uploadMissingFiles(api, "token", "operation", archive.bytes, archive.files,
    { missing: [{ ...first, upload: { sha: first.sha256 } }], reusedFiles: 0, reusedBytes: 0, totalFiles: 2, totalBytes: 3, nextCursor: 1 }, new Output(true, () => {}));
  assert.deepEqual(result, { operation: { state: "queued" } });
});

test("file progress advances only after verification and follows missing-hash pages", async () => {
  const archive = canonicalArchive([["index.html", Buffer.from("a")], ["file.js", Buffer.from("xy")]])!;
  const first = archive.files[0]!, second = archive.files[1]!;
  const uploaded: string[] = [], verified: string[] = [], events: { type: string; files?: number }[] = [];
  let nextPlanRead = false;
  const api = {
    uploadFile: async (value: { sha: string }, bytes: Uint8Array, progress: (sent: number, total: number) => void) => {
      uploaded.push(value.sha); progress(bytes.byteLength, bytes.byteLength);
      assert.equal(events.at(-1)?.files, verified.length, "an R2 send is not a verified completed file");
    },
    json: async (path: string) => {
      if (path.endsWith("?cursor=1")) { nextPlanRead = true; return { files: { missing: [{ ...second, upload: { sha: second.sha256 } }], reusedFiles: 0, reusedBytes: 0, totalFiles: 2, totalBytes: 3, nextCursor: null } }; }
      if (path.endsWith("/complete")) return { operation: { state: "queued" } };
      verified.push(path.split("/").at(-1)!); return {};
    },
  } as unknown as Api;
  const output = new Output("jsonl", line => events.push(JSON.parse(line)));
  const result = await uploadMissingFiles(api, "token", "operation", archive.bytes, archive.files,
    { missing: [{ ...first, upload: { sha: first.sha256 } }], reusedFiles: 0, reusedBytes: 0, totalFiles: 2, totalBytes: 3, nextCursor: 1 }, output);
  assert.ok(nextPlanRead);
  assert.deepEqual(uploaded, [first.sha256, second.sha256]);
  assert.deepEqual(verified, uploaded);
  assert.equal(events.at(-1)?.files, 2);
  assert.deepEqual(result, { operation: { state: "queued" } });
});
