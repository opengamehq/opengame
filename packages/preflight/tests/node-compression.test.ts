import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync, brotliCompressSync } from "node:zlib";
import { constants as bufferConstants } from "node:buffer";
import { compressedTextReaders, decodeCeiling } from "../src/node-compression";
import { platformPreflight } from "../src/platform";
import { precompressedAsset } from "../src/names";
import { LIMITS } from "@opengame/shared";
import "./credential-checks-on";

test("only supported engine payloads have a compression reader", () => {
  // 3D assets joined on 22 Oct 2026: Kaigen ships glTF heads as .glb.gz.
  for (const path of ["build.js.gz", "build.wasm.br", "build.data.gz", "Build/EXPORT.JS.GZ", ".hidden.js.gz", "heads/a.glb.gz", "texture.ktx2.br"]) assert.ok(precompressedAsset(path), path);
  for (const path of ["pack.zip.gz", "game.tar.br", "texture.png.br", "game.data.zst", "game.js.gz.gz", "plain.gz",
    ".js.gz", ".js.br", ".wasm.gz", ".wasm.br", ".data.gz", ".data.br", "Build/.js.gz", "Build/.wasm.br"]) {
    assert.equal(precompressedAsset(path), null, path);
    assert.equal(compressedTextReaders()(path, 1, async () => new Uint8Array(1)), undefined, path);
  }
});

test("full valid streams decode, while truncated, trailing and excessive expansions fail", async () => {
  for (const [suffix, encode] of [["gz", gzipSync], ["br", brotliCompressSync]] as const) {
    const body = Buffer.from("globalThis.started = true;");
    const valid = encode(body);
    const read = (bytes: Uint8Array) => compressedTextReaders()(`game.js.${suffix}`, bytes.byteLength, async () => bytes)!();
    assert.equal(await read(valid), body.toString());
    await assert.rejects(read(valid.subarray(0, -2)));
    await assert.rejects(read(Buffer.concat([valid, Buffer.from("unvalidated trailing bytes")])));
    await assert.rejects(read(encode(Buffer.alloc(1 << 20))));
  }
  const joined = Buffer.concat([gzipSync("first;"), gzipSync("second;")]);
  assert.equal(await compressedTextReaders()("game.js.gz", joined.length, async () => joined)!(), "first;second;");
});

test("authoritative scanning never reports a compressed script as checked without a decoder", async () => {
  const script = gzipSync('screen.orientation.lock("portrait")');
  const html = { path: "index.html", size: 38, text: async () => '<script src="game.js.gz"></script>' };
  const file = { path: "game.js.gz", size: script.length, text: async () => script.toString("utf8") };
  const missing = await platformPreflight([html, file]);
  assert.equal(missing.ok, false);
  assert.equal(missing.credentialScan?.complete, false);
  assert.ok(missing.findings.some(finding => finding.code === "unreadable-file"));
  /* What to change, for the engine that writes these files: "make the file readable" meant
     nothing to somebody holding a default Unity export (launch E2E, J-opus-E2). */
  assert.match(missing.findings.find(finding => finding.code === "unreadable-file")!.detail ?? "", /Compression Format to Gzip or Disabled/);
  const decoded = await platformPreflight([html, { ...file, decodedText: compressedTextReaders()(file.path, file.size, async () => script) }]);
  assert.equal(decoded.checks.desktop, "failed");
  assert.ok(decoded.findings.some(finding => finding.code === "platform-desktop"));
});

test("ratio bounds stop the native decoder and a failed asset closes the shared budget", async () => {
  for (const [suffix, encode] of [["gz", gzipSync], ["br", brotliCompressSync]] as const) {
    const bomb = encode(Buffer.alloc(1 << 20, 65));
    assert.ok((1 << 20) > bomb.length * LIMITS.bundle.compressionRatioMax);
    const readers = compressedTextReaders();
    let reads = 0;
    const first = readers(`first.js.${suffix}`, bomb.length, async () => { reads++; return bomb; })!;
    // ERR_BUFFER_TOO_LARGE comes from maxOutputLength, before a full output
    // exists. A post-decode ratio check throws compressed_invalid instead.
    await assert.rejects(first(), { code: "ERR_BUFFER_TOO_LARGE" });
    await assert.rejects(first(), { code: "ERR_BUFFER_TOO_LARGE" });
    const valid = encode(Buffer.from("const ready = true;"));
    const second = readers(`second.js.${suffix}`, valid.length, async () => { reads++; return valid; })!;
    await assert.rejects(second(), /decoded_limit/);
    assert.equal(reads, 1);
  }
});

test("trailer failure and overlapping reads cannot spend the same decoder allowance again", async () => {
  const damaged = gzipSync("const first = true;").subarray(0, -1);
  const valid = gzipSync("const second = true;");
  const readers = compressedTextReaders();
  let release!: (bytes: Uint8Array) => void;
  const pending = new Promise<Uint8Array>(resolve => { release = resolve; });
  const second = readers("second.js.gz", valid.length, () => pending)!();
  await assert.rejects(readers("first.js.gz", damaged.length, async () => damaged)!());
  release(valid);
  await assert.rejects(second, /decoded_limit/);
});

test("Unity decoding respects a nonzero ordinary-file budget at the exact remaining bound", async () => {
  const body = Buffer.from("const ready = true;");
  for (const encode of [gzipSync, brotliCompressSync]) {
    const encoded = encode(body);
    const ordinary = LIMITS.bundle.uncompressedBytesMax - body.length;
    const valid = compressedTextReaders(() => ordinary);
    assert.equal(await valid("game.js.unityweb", encoded.length, async () => encoded)!(), body.toString());
    const tooLarge = compressedTextReaders(() => ordinary + 1);
    await assert.rejects(tooLarge("game.js.unityweb", encoded.length, async () => encoded)!(), { code: "ERR_BUFFER_TOO_LARGE" });
  }
});

test("trusted external decoding has its own aggregate and per-member cap", async () => {
  const policy = LIMITS.platform.largeAssets;
  const original = { ...policy };
  const body = Buffer.from("an ordinary external data payload");
  const encoded = gzipSync(body);
  const row = { path: "Build/web.data.gz", sha256: "a".repeat(64), byteSize: encoded.length };
  try {
    Object.assign(policy, { decodedBytesMax: body.length * 2, fileBytesMax: encoded.length + body.length });
    const readers = compressedTextReaders(partition => partition === "boot" ? LIMITS.bundle.uncompressedBytesMax : body.length,
      { externalAssets: [row] });
    assert.equal(await readers(row.path, encoded.length, async () => encoded)!(), body.toString());
    const tooMuch = compressedTextReaders(() => body.length + 1, { externalAssets: [row] });
    await assert.rejects(tooMuch(row.path, encoded.length, async () => encoded)!(), { code: "ERR_BUFFER_TOO_LARGE" });
    // Stored bytes are within the cap, while a modest expansion crosses only
    // the decoded member limit. No giant fixture allocation is necessary.
    const largerBody = Buffer.from(Array.from({ length: encoded.length + body.length + 1 }, (_, i) => String.fromCharCode(65 + i % 23)).join(''));
    const larger = gzipSync(largerBody);
    const largerRow = { ...row, byteSize: larger.length };
    Object.assign(policy, { decodedBytesMax: largerBody.length * 2 });
    const perMember = compressedTextReaders(() => 0, { externalAssets: [largerRow] });
    await assert.rejects(perMember(row.path, larger.length, async () => larger)!(), { code: "ERR_BUFFER_TOO_LARGE" });
    assert.throws(() => readers(row.path, encoded.length + 1, async () => encoded), /external_assets_invalid/);
  } finally { Object.assign(policy, original); }
});

test("a compressed copy must decode to the same bytes as the file beside it", async () => {
  // og-games serves main.js.br for main.js to browsers that accept brotli, while
  // every check reads main.js. engine_archives.py refuses the same pairs.
  const { preflight } = await import("../src/index");
  const html = { path: "index.html", size: 36, text: async () => '<script src="main.js"></script>' };
  const run = async (plain: Buffer, served: Buffer, suffix: "gz" | "br", path = "main.js") => {
    const encoded = suffix === "gz" ? gzipSync(served) : brotliCompressSync(served);
    const readers = compressedTextReaders();
    return preflight([html,
      { path, size: plain.length, text: async () => plain.toString("utf8"), bytes: async () => new Uint8Array(plain) },
      { path: `${path}.${suffix}`, size: encoded.length, text: async () => encoded.toString("latin1"),
        decodedText: readers(`${path}.${suffix}`, encoded.length, async () => new Uint8Array(encoded)) }], { authoritative: true });
  };
  const script = Buffer.from("console.log('checked');");
  for (const suffix of ["gz", "br"] as const) {
    assert.ok(!(await run(script, script, suffix)).findings.some(row => row.code === "compressed-asset-mismatch"), suffix);
    const swapped = await run(script, Buffer.from("console.log('never checked');"), suffix);
    assert.ok(swapped.findings.some(row => row.code === "compressed-asset-mismatch" && row.severity === "blocker"), suffix);
    const wasm = Buffer.from([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, 0x90]);
    assert.ok(!(await run(wasm, wasm, suffix, "game.wasm")).findings.some(row => row.code === "compressed-asset-mismatch"), suffix);
    const other = Buffer.from([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, 0x91]);
    assert.ok((await run(wasm, other, suffix, "game.wasm")).findings.some(row => row.code === "compressed-asset-mismatch"), suffix);
  }
});

test("a compressed HTML document is refused rather than served unwrapped", async () => {
  const { nestedArchiveExtension } = await import("../src/names");
  for (const path of ["index.html.br", "index.html.gz", "page.htm.br", "page.htm.gz"]) assert.ok(nestedArchiveExtension(path), path);
});

/* Launch E2E B-7, 13 Nov 2026: the scan container runs Node 18, whose Buffer holds at most
   4 GiB, and Node refuses a maxOutputLength past that before decoding a byte. With the 5 GiB
   bundle cap a 38.6 MB Unity .data.br asked for about 5 GiB and came back unreadable. Red
   without decodeCeiling's clamp. This runner is Node 22, so the Node 18 ceiling is passed in. */
test("the decoder never asks for more than the runtime's Buffer can hold", () => {
  const node18 = 2 ** 32;
  const asked = Math.min(LIMITS.bundle.uncompressedBytesMax, Math.floor(38_606_587 * LIMITS.bundle.compressionRatioMax));
  assert.ok(asked > node18, "the budget alone is past Node 18's ceiling, which is the case this guards");
  assert.equal(decodeCeiling(asked, node18), node18);
  assert.equal(decodeCeiling(1000, node18), 1000, "a budget under the ceiling is untouched");
  assert.equal(decodeCeiling(0, node18), 1);
  assert.ok(decodeCeiling(asked) <= bufferConstants.MAX_LENGTH);
});
