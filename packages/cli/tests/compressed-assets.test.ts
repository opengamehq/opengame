import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync, brotliCompressSync } from "node:zlib";
import { request } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { createArchive } from "../src/archive";
import { Output } from "../src/output";
import { manifest } from "./shell";
import { vendorDependencies } from "../src/vendor";
import { startDevServer } from "../src/dev";
import { runtimeFixture } from "./runtime-fixtures";

async function bundle(files: Record<string, Uint8Array | string>) {
  const root = await mkdtemp(join(tmpdir(), "og-compressed-"));
  const lines: string[] = [];
  try {
    const script = Object.keys(files).find(path => /^game\.js\.(?:gz|br)$/.test(path));
    await writeFile(join(root, "index.html"), '<!doctype html>' + (script ? `<script src="${script}"></script>` : '<title>Game</title>'));
    for (const [path, bytes] of Object.entries(files)) await writeFile(join(root, path), bytes);
    const archive = await createArchive(root, manifest, new Output("jsonl", line => lines.push(line)));
    return { archive, lines };
  } catch (error) { throw Object.assign(error as Error, { events: lines.map(line => JSON.parse(line)) }); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test("recognized gzip and Brotli engine resources retain original bytes in the checked archive", async () => {
  const files = {
    "game.js.gz": gzipSync('document.body.addEventListener("keydown", () => {});'),
    "game.wasm.gz": gzipSync(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])),
    "game.data.br": brotliCompressSync(Buffer.from("ordinary game data")),
  };
  const { archive } = await bundle(files);
  const staged = unzipSync(archive.bytes);
  for (const [path, bytes] of Object.entries(files)) assert.deepEqual(staged[path], new Uint8Array(bytes), path);
});

test("compressed JavaScript still undergoes credential, outbound request and desktop checks", async () => {
  const secret = "AKIA" + "Z".repeat(16);
  for (const [source, evidence] of [
    [`/* ${secret} */`, /key|credential|secret/i],
    [`const key = "\\x41KIA${"Z".repeat(16)}";`, /key|escaped|secret/i],
    // Since 2027-03 an ordinary https host is allowed, so the request checks that still
    // refuse are a blocked service and plain http.
    ['fetch("https://js.stripe.com/track")', /js\.stripe\.com|Stripe/],
    ['fetch("http://unapproved.example/track")', /unapproved\.example.*plain http|plain http/i],
    ['screen.orientation.lock("portrait")', /portrait/],
  ] as const) {
    for (const [suffix, encode] of [["gz", gzipSync], ["br", brotliCompressSync]] as const) {
      await assert.rejects(bundle({ [`game.js.${suffix}`]: encode(Buffer.from(source)) }), (error: unknown) => {
        assert.match(String((error as Error).message), /blockers/);
        const events = (error as { events: { type: string; finding?: { evidence: { observed: string }; fix: string } }[] }).events;
        assert.ok(events.some(event => event.finding && evidence.test(event.finding.evidence.observed + event.finding.fix)), "the intended decoded source check did not fail");
        assert.ok(!JSON.stringify(events).includes(secret), "a synthetic secret was printed");
        return true;
      }, String(evidence));
    }
  }
});

test("renaming text to an unknown extension does not hide a key from the CLI", async () => {
  const secret = "AKIA" + "Z".repeat(16);
  await assert.rejects(bundle({ "settings.dat": secret }), (error: unknown) => {
    assert.equal((error as { code: string }).code, "check_failed");
    const events = (error as { events: { finding?: { check: string; evidence: { observed: string } } }[] }).events;
    assert.ok(events.some(event => event.finding && /credential|key|secret/i.test(event.finding.evidence.observed)), "the renamed file's credential must cause the refusal");
    assert.ok(!JSON.stringify(events).includes(secret));
    return true;
  });
});

test("malformed streams and arbitrary nested compression are refused before upload", async () => {
  for (const file of ["game.js.gz", "game.wasm.br", "pack.zip.gz", "game.data.zst", "unknown.gz"]) {
    await assert.rejects(bundle({ [file]: Buffer.from("not a valid compressed stream") }));
  }
});

test("compressed runtime references require an actionable rebuild before acquisition or staging", async () => {
  for (const [suffix, encode] of [["gz", gzipSync], ["br", brotliCompressSync], ["unityweb", gzipSync], ["unityweb", brotliCompressSync]] as const) {
    for (const reference of ['https://unpkg.com/wasmoon@1.16.0/dist/index.js', '/_og/runtime/ruffle@0.7.1/ruffle.js']) {
      const path = `game.js.${suffix}`, bytes = encode(Buffer.from(`import ${JSON.stringify(reference)};`));
      const artifacts = runtimeFixture();
      const pin = artifacts.catalog.inventory.runtimes.find(row => row.id === 'ruffle')!;
      const snapshot = new Map([["index.html", Buffer.from(`<script src="${pin.prefix}ruffle.js"></script><script src="${path}"></script>`)], [path, bytes]]);
      const original = [...snapshot];
      let downloads = 0, acquisitions = 0;
      const acquire = artifacts.acquire;
      artifacts.acquire = async runtime => { acquisitions++; return acquire(runtime); };
      await assert.rejects(vendorDependencies(snapshot, { artifacts, fetchBytes: async () => { downloads++; throw new Error("must not download"); } }), {
        code: "vendor_compressed_source", exitCode: 1, retry: "after-fix",
      });
      assert.equal(downloads, 0);
      assert.equal(acquisitions, 0, 'even the ordinary runtime reference cannot trigger acquisition before refusal');
      assert.deepEqual([...snapshot], original);
      await assert.rejects(startDevServer({ snapshot, artifacts }), { code: "vendor_compressed_source", exitCode: 1, retry: "after-fix" });
      assert.equal(acquisitions, 0, 'dev also refuses before acquiring its ordinary runtime reference');
    }
  }
});

test("self-contained compressed scripts remain byte-identical through vendor and dev setup", async () => {
  for (const [suffix, encode] of [["gz", gzipSync], ["br", brotliCompressSync], ["unityweb", gzipSync], ["unityweb", brotliCompressSync]] as const) {
    const path = `game.js.${suffix}`;
    const bytes = encode(Buffer.from('document.body.textContent="Ready"; // https://unpkg.com/wasmoon@1.16.0/dist/index.js'));
    const snapshot = new Map([["index.html", Buffer.from(`<script src="${path}"></script>`)], [path, bytes]]);
    assert.deepEqual(await vendorDependencies(snapshot, { fetchBytes: async () => { throw new Error("must not download"); } }), []);
    assert.deepEqual(snapshot.get(path), bytes);
    const running = await startDevServer({ snapshot });
    try {
      const served = await new Promise<Buffer>((resolve, reject) => {
        request(running.url + "/" + path, response => {
          assert.equal(response.statusCode, 200);
          const chunks: Buffer[] = [];
          response.on("data", chunk => chunks.push(chunk));
          response.on("end", () => resolve(Buffer.concat(chunks)));
          response.on("error", reject);
        }).on("error", reject).end();
      });
      assert.deepEqual(served, bytes);
    } finally { await running.close(); }
    assert.deepEqual(snapshot.get(path), bytes);
  }
});
