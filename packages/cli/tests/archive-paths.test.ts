import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { LIMITS } from "@opengame/shared";
import { createArchive } from "../src/archive";
import { canonicalArchive } from "../src/incremental";
import { Output } from "../src/output";
import { manifest, tempDir } from "./shell";

test("real archive creation refuses portable file-directory conflicts before either compression path", async t => {
  for (const pair of [["\u0390", "\u03AA\u0301"], ["\u1F80\u0308", "\u1F00\u0308\u03B9"], ["Folder", "folder"]]) {
    for (const [parent, directory] of [pair, [...pair].reverse()]) {
      await t.test(`${parent} versus ${directory}/save.dat`, async subtest => {
        const root = await tempDir("og-archive-prefix-");
        try {
          await writeFile(join(root.dir, "index.html"), "<!doctype html><title>Game</title>");
          await writeFile(join(root.dir, parent!), "parent bytes", { flag: "wx" });
          try { await mkdir(join(root.dir, directory!)); }
          catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
            // Case-insensitive filesystems cannot represent this hostile tree.
            // The in-memory preflight and writer/reader tests still run there.
            subtest.skip("This filesystem aliases the conflicting directory to the file; run this integration case on a case-sensitive filesystem.");
            return;
          }
          await writeFile(join(root.dir, directory!, "save.dat"), "descendant bytes");
          for (const incremental of [false, true]) {
            const events: { type: string; finding?: { check?: string } }[] = [];
            await assert.rejects(createArchive(root.dir, manifest, new Output("jsonl", line => events.push(JSON.parse(line))), { incremental }), { code: "check_failed" });
            assert.ok(events.some(event => event.finding?.check === "case-collision"), "real preflight must refuse the prefix, rather than a later ZIP failure");
          }
        } finally { await root.remove(); }
      });
    }
  }
});

test("a valid compressible game retains deflated fallback when the STORE archive exceeds the cap", async () => {
  const root = await tempDir("og-archive-deflate-");
  const originalLimit = LIMITS.platform.incrementalUpload.archiveBytesMax;
  // Scale the file-transport cap so this exercises ZIP fallback without a
  // large allocation. The bundle cap and real preflight remain in force.
  const archiveLimit = 4096;
  const html = Buffer.from("<!doctype html><title>Game</title>");
  const payload = Buffer.alloc(archiveLimit * 4);
  for (let index = 0; index < payload.length; index++) payload[index] = index % 251;
  try {
    await writeFile(join(root.dir, "index.html"), html);
    await writeFile(join(root.dir, "payload.bin"), payload);
    LIMITS.platform.incrementalUpload.archiveBytesMax = archiveLimit;
    assert.equal(canonicalArchive([["index.html", html], ["payload.bin", payload]]), null);
    const archive = await createArchive(root.dir, manifest, new Output(true, () => {}), { incremental: true });
    assert.equal(archive.incremental, null);
    const packed = readFileSync(archive.file);
    assert.ok(packed.byteLength <= archiveLimit);
    assert.equal(new DataView(packed.buffer, packed.byteOffset).getUint16(8, true), 8);
    const extracted = unzipSync(packed);
    assert.deepEqual(Buffer.from(extracted["index.html"]!), html);
    assert.deepEqual(Buffer.from(extracted["payload.bin"]!), payload);
  } finally { LIMITS.platform.incrementalUpload.archiveBytesMax = originalLimit; await root.remove(); }
});

test("ordinary and incremental archive paths preserve literal prototype-related filenames", async () => {
  const root = await tempDir("og-archive-literal-names-");
  const names = ["__proto__", "constructor", "prototype", "length", "buffer", "byteLength", "byteOffset", "nested/__proto__"];
  try {
    await writeFile(join(root.dir, "index.html"), "<!doctype html><title>Literal names</title>");
    await mkdir(join(root.dir, "nested"));
    for (const name of names) await writeFile(join(root.dir, name), `exact bytes for ${name}`);
    for (const incremental of [false, true]) {
      const archive = await createArchive(root.dir, manifest, new Output(true, () => {}), { incremental });
      const decodedNames: string[] = [];
      const unpacked = unzipSync(readFileSync(archive.file), { filter: member => { decodedNames.push(member.name); return member.name !== '__proto__'; } });
      const isolated = unzipSync(readFileSync(archive.file), { filter: member => member.name === '__proto__' });
      assert.deepEqual(decodedNames.sort(), ["index.html", ...names].sort());
      for (const name of names) {
        const bytes = name === '__proto__' ? Object.getOwnPropertyDescriptor(isolated, name)?.value ?? Object.getPrototypeOf(isolated)
          : Object.getOwnPropertyDescriptor(unpacked, name)?.value;
        assert.deepEqual(Buffer.from(bytes), Buffer.from(`exact bytes for ${name}`));
      }
      assert.deepEqual(archive.packaging.files.map(file => file.path), ["index.html", ...names].sort());
    }
  } finally { await root.remove(); }
});

test("a boot file no bundle may hold is named, not reported as a size (World at War, 27 Oct 2026)", async () => {
  const root = await tempDir("og-archive-hash-");
  try {
    await writeFile(join(root.dir, "index.html"), "<!doctype html><title>Game</title>");
    await mkdir(join(root.dir, "images"));
    await writeFile(join(root.dir, "images", "barbedwire_1_c#0.iwi"), "texture bytes");
    await assert.rejects(createArchive(root.dir, manifest, new Output("jsonl", () => {}),
      { incremental: true, externalAssets: new Set(), externalDelivery: "large-game-v1" }),
      (error: { code?: string; message?: string }) => error.code === "unportable_name" && /barbedwire_1_c#0\.iwi/.test(error.message ?? ""));
  } finally { await root.remove(); }
});
