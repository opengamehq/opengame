import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer, type IncomingMessage } from "node:http";
import { once } from "node:events";
import { createHash, randomBytes } from "node:crypto";
import type { GameManifest } from "@opengame/protocol";
import { replyBootstrap, startupInformation } from "./bootstrap-fixture";

/**
 * `opengame deploy` sending its archive in parts (src/archive-parts.ts), against a stand-in
 * server and storage. What is pinned: the CLI asks for parts only from a server that says
 * it takes them; every part is the archive's own slice at the length the server signed,
 * sent with no credential and no header but its length; a part that drops is signed again
 * and resent alone; and a second run of the same deploy sends only what the first did not.
 *
 * Parts here are 5 MiB, R2's smallest, of an archive a little over 12 MiB, so three parts
 * with a short last one. The real size is limits.json's, and the server decides it.
 */

const run = promisify(execFile);
const binary = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
const manifest: GameManifest = { title: "Night shift", description: "Survive until dawn with a light and a dwindling battery.", genre: "shooter-survival", controls: ["keyboard"] };
const token = "ogt_" + "a".repeat(16) + "_" + "b".repeat(43);
const PART = 5 * 1024 * 1024;
const id = "11111111-1111-4111-8111-111111111111";

type Put = { part: number; bytes: Buffer; headers: IncomingMessage["headers"] };

async function body(req: IncomingMessage) { const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk as Buffer); return Buffer.concat(chunks); }

/** A deploy server whose storage keeps parts by number, across runs of the CLI. */
async function partsServer(options: { archiveParts?: boolean; drop?: (part: number, attempt: number) => boolean;
  /** Answers this many signing requests with the server's own 503 first. */
  signOutages?: number;
  /** Storage forgets the upload after this many parts: later part PUTs answer 404, and the object is there. */
  completedElsewhereAfter?: number }) {
  let origin = "", state = "uploading", size = 0;
  const requests: Record<string, unknown>[] = [], puts: Put[] = [], held = new Map<number, Buffer>(), signed = new Map<number, number>();
  const keys = new Set<string>();
  let outages = options.signOutages ?? 0, objectThere = false, forgotten = 0;
  const count = () => Math.ceil(size / PART);
  const length = (part: number) => part < count() ? PART : size - PART * (count() - 1);
  const op = () => ({ id, state, gameId: null, releaseId: null, error: null });
  const descriptor = () => ({ byteSize: size, partBytes: PART, partCount: count(), uploadedParts: [...held.keys()].sort((a, b) => a - b), partsUrl: `/api/v1/operations/${id}/upload/parts` });
  const server = createServer(async (req, res) => {
    if (replyBootstrap(req, res, token, options.archiveParts ? { capabilities: { incrementalUpload: false, archiveParts: true } } : {})) return;
    const url = new URL(req.url!, origin);
    if (url.pathname === "/storage") {
      const part = Number(url.searchParams.get("partNumber")), attempt = Number(url.searchParams.get("try"));
      const bytes = await body(req);
      puts.push({ part, bytes, headers: req.headers });
      if (options.completedElsewhereAfter !== undefined && puts.length > options.completedElsewhereAfter) {
        objectThere = true; state = "queued"; forgotten++; res.statusCode = 404; res.end("<Error><Code>NoSuchUpload</Code></Error>"); return;
      }
      if (options.drop?.(part, attempt)) { res.destroy(); return; }
      if (bytes.byteLength !== Number(url.searchParams.get("length"))) { res.statusCode = 403; res.end(); return; }
      held.set(part, bytes); res.statusCode = 200; res.end(); return;
    }
    res.setHeader("content-type", "application/json");
    if (url.pathname === "/api/v1/limits") { res.end(JSON.stringify(startupInformation())); return; }
    if (url.pathname === "/api/v1/deploys") {
      const request = JSON.parse((await body(req)).toString());
      requests.push(request); keys.add(String(req.headers["idempotency-key"]));
      size = request.byteSize;
      res.end(JSON.stringify(request.multipart ? { operation: op(), multipart: descriptor() }
        : { operation: op(), upload: { url: `${origin}/single`, headers: { "content-type": "application/zip", "content-length": String(size), "if-none-match": "*" } } }));
      return;
    }
    if (url.pathname === "/single") { await body(req); state = "queued"; res.end(); return; }
    if (url.pathname === `/api/v1/operations/${id}/upload/parts`) {
      const [part] = JSON.parse((await body(req)).toString()).parts as number[];
      if (outages > 0) {
        outages--; res.statusCode = 503;
        res.end(JSON.stringify({ error: "temporarily_unavailable", message: "Try again shortly.", retry: "later", retryAfterSeconds: 1 })); return;
      }
      signed.set(part!, (signed.get(part!) ?? 0) + 1);
      res.end(JSON.stringify({ parts: [{ partNumber: part, expiresInSeconds: 3600, headers: { "content-length": String(length(part!)) },
        url: `${origin}/storage?partNumber=${part}&try=${signed.get(part!)}&length=${length(part!)}` }] }));
      return;
    }
    if (url.pathname === `/api/v1/operations/${id}/upload` && req.method === "POST") {
      res.end(JSON.stringify(objectThere ? { operation: op(), uploaded: true } : { operation: op(), multipart: descriptor() })); return;
    }
    if (url.pathname === `/api/v1/operations/${id}/upload` && req.method === "PUT") {
      if (requests.at(-1)?.multipart && held.size !== count() && !objectThere) { res.statusCode = 409; res.end(JSON.stringify({ error: "upload_missing", message: "Parts are missing." })); return; }
      state = "queued";
    }
    res.end(JSON.stringify({ operation: op() }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const root = await mkdtemp(join(tmpdir(), "og-deploy-parts-"));
  await writeFile(join(root, "opengame.json"), JSON.stringify(manifest));
  await writeFile(join(root, "index.html"), "<!doctype html><title>Parts</title>");
  // Random, so it does not compress: the archive is about as big as this file.
  await writeFile(join(root, "pak.bin"), randomBytes(12 * 1024 * 1024));
  const env = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" };
  const deploy = () => run(process.execPath, [binary, "deploy", root, "--jsonl", "--no-wait"], { env, maxBuffer: 16 * 1024 * 1024 })
    .then(r => ({ code: 0, stdout: r.stdout }), (e: { code: number; stdout: string }) => e)
    .then(result => ({ ...result, events: result.stdout.trim().split("\n").map(line => JSON.parse(line)) }));
  const close = async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); };
  return { deploy, close, requests, puts, held, signed, keys, state: () => state, forgotten: () => forgotten };
}

test("an archive goes up in parts: its own slices, signed lengths, no credential, a dropped part resent alone", async () => {
  const fake = await partsServer({ archiveParts: true, drop: (part, attempt) => part === 2 && attempt === 1 });
  try {
    const result = await fake.deploy();
    assert.equal(result.code, 0, result.stdout);
    assert.equal(fake.state(), "queued");
    const request = fake.requests[0]!;
    assert.equal(request.multipart, true);
    // The joined parts are the archive the request described.
    const joined = Buffer.concat([1, 2, 3].map(part => fake.held.get(part)!));
    assert.equal(joined.byteLength, request.byteSize);
    assert.equal(createHash("sha256").update(joined).digest("hex"), request.sha256);
    assert.deepEqual([...fake.signed.entries()].sort(), [[1, 1], [2, 2], [3, 1]]);
    assert.equal(result.events.filter(event => event.code === "upload_retrying").length, 1);
    for (const put of fake.puts) {
      assert.equal(put.headers.authorization, undefined, "storage never sees the account token");
      assert.equal(put.headers["if-none-match"], undefined);
      assert.equal(put.headers["content-type"], undefined);
    }
    const progress = result.events.filter(event => event.type === "progress" && event.stage === "upload");
    assert.equal(progress.at(-1).bytes, request.byteSize);
  } finally { await fake.close(); }
});

test("a part out of tries stops the run, and the next run resumes the same deploy with only the missing part", async () => {
  let failing = true;
  const fake = await partsServer({ archiveParts: true, drop: part => failing && part === 2 });
  try {
    const first = await fake.deploy();
    assert.equal(first.code, 5, first.stdout);
    assert.equal(first.events.at(-1).code, "upload_interrupted");
    assert.match(first.events.at(-1).message, /parts already sent are kept/);
    assert.deepEqual([...fake.held.keys()].sort(), [1, 3]);
    failing = false;
    const before = fake.puts.length;
    const second = await fake.deploy();
    assert.equal(second.code, 0, second.stdout);
    assert.deepEqual(fake.puts.slice(before).map(put => put.part), [2]);
    assert.equal(fake.keys.size, 1, "the rerun asked for the same operation");
    assert.equal(fake.state(), "queued");
  } finally { await fake.close(); }
});

test("a server that does not say it takes parts gets one PUT, as before", async () => {
  const fake = await partsServer({});
  try {
    const result = await fake.deploy();
    assert.equal(result.code, 0, result.stdout);
    assert.equal(fake.requests[0]!.multipart, undefined);
    assert.equal(fake.puts.length, 0);
  } finally { await fake.close(); }
});

test("a signing request the server could not answer this time is asked again, not the end of the upload", async () => {
  const fake = await partsServer({ archiveParts: true, signOutages: 1 });
  try {
    const result = await fake.deploy();
    assert.equal(result.code, 0, result.stdout);
    assert.equal(result.events.filter(event => event.code === "upload_request_retrying").length, 1);
    assert.equal(fake.state(), "queued");
  } finally { await fake.close(); }
});

test("storage answering 404 for a part is asked about rather than re-signed: an upload completed elsewhere is done", async () => {
  const fake = await partsServer({ archiveParts: true, completedElsewhereAfter: 1 });
  try {
    const result = await fake.deploy();
    assert.equal(result.code, 0, result.stdout);
    assert.ok(fake.forgotten() > 0, "storage answered 404 at least once");
    assert.equal(result.events.filter(event => event.code === "upload_retrying").length, 0, "a forgotten upload is not retried as an interruption");
    assert.equal(fake.state(), "queued");
  } finally { await fake.close(); }
});
