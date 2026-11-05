import test from "node:test";
import assert from "node:assert/strict";
import { BUNDLE, LIMITS } from "@opengame/shared";
import { incrementalArchiveBytes, incrementalCrc32, incrementalFilesSchema, incrementalDeploySchema, incrementalZipLocalHeader,
  incrementalZipDescriptor, incrementalZipCentralHeader, incrementalZipEnd } from "../src/incremental-upload";

test("canonical ZIP has a fixed byte receipt across chunk boundaries and UTF-8 paths", () => {
  const bytes = new TextEncoder().encode("123456789");
  const path = "assets/café.txt";
  const crc32 = incrementalCrc32(bytes);
  assert.equal(crc32, 0xcbf43926);
  assert.equal(incrementalCrc32(bytes.subarray(4), incrementalCrc32(bytes.subarray(0, 4))), crc32);
  const header = incrementalZipLocalHeader(path);
  const descriptor = incrementalZipDescriptor(crc32, bytes.length);
  const central = incrementalZipCentralHeader(path, crc32, bytes.length, 0);
  const result = Buffer.concat([header, bytes, descriptor, central,
    incrementalZipEnd(1, central.length, header.length + bytes.length + descriptor.length)]);
  assert.equal(result.length, incrementalArchiveBytes([{ path, byteSize: bytes.length }]));
  assert.equal(new DataView(header.buffer).getUint16(6, true), 0x808);
  assert.equal(new DataView(header.buffer).getUint16(12, true), 33);
  assert.equal(new DataView(central.buffer).getUint32(16, true), 0xcbf43926);
  assert.equal(new DataView(central.buffer).getUint32(24, true), 9);
});
test("file identity cannot hide path collisions, conflicting hash sizes or traversal", () => {
  const file = { path: "index.html", sha256: "a".repeat(64), byteSize: 4 };
  assert.equal(incrementalFilesSchema.safeParse([{ ...file, byteSize: 0 }]).success, true);
  for (const files of [[file, file], [{ ...file, path: "Index.html" }, file],
    [{ ...file, path: "assets" }, { ...file, path: "assets/image.png" }],
    [{ ...file, path: "../index.html" }], [file, { ...file, path: "other.html", byteSize: 5 }]]) {
    assert.equal(incrementalFilesSchema.safeParse(files).success, false);
  }
});

test("incremental schema rejects canonical caseless duplicates and both ancestor spellings", () => {
  for (const [left, right] of [["\u0390", "\u03AA\u0301"], ["\u1F80\u0308", "\u1F00\u0308\u03B9"]]) {
    for (const paths of [[`${left}.data`, `${right}.data`], [left, `${right}/save.dat`], [`${left}/save.dat`, right]]) {
      const files = paths.map(path => ({ path, sha256: "a".repeat(64), byteSize: 4 })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
      const parsed = incrementalFilesSchema.safeParse(files);
      assert.equal(parsed.success, false, JSON.stringify(paths));
      if (!parsed.success) assert.ok(parsed.error.issues.some(issue => /distinct|folder/.test(issue.message)), "the intended canonical collision must be the refusal");
    }
    for (const name of [left, right]) {
      const files = [{ path: `${name}.data`, sha256: "a".repeat(64), byteSize: 4 }];
      assert.deepEqual(incrementalFilesSchema.parse(files), files, "comparison keys preserve original names and identity");
    }
  }
});

test("overlong slash-dense paths stop before array prefix refinement", () => {
  // The path includes a colliding ancestor so the old superRefine both did
  // unbounded prefix work and added a secondary folder issue after length failed.
  const path = "a/".repeat(BUNDLE.pathBytesMax * 40) + "child.dat";
  const parsed = incrementalFilesSchema.safeParse([
    { path: "a", sha256: "a".repeat(64), byteSize: 0 },
    { path, sha256: "a".repeat(64), byteSize: 0 },
  ]);
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.ok(parsed.error.issues.some(issue => issue.message === "The file path is too long."));
    assert.equal(parsed.error.issues.some(issue => issue.message === "A file cannot also be a folder."), false);
  }
});

test("ordinary incremental files use the per-file cap", () => {
  const file = { path: "game.data", sha256: "a".repeat(64), byteSize: BUNDLE.fileBytesMax };
  assert.equal(incrementalFilesSchema.safeParse([file]).success, true);
  assert.equal(incrementalFilesSchema.safeParse([{ ...file, byteSize: file.byteSize + 1 }]).success, false);
});


test("file transport accepts its exact assembly bound and rejects the next byte", () => {
  const file = { path: "index.html", sha256: "a".repeat(64), byteSize: 0 };
  const overhead = incrementalArchiveBytes([file]);
  const request = (size: number) => ({ files: [{ ...file, byteSize: size - overhead }], byteSize: size,
    fileCount: 1, sha256: file.sha256, manifest: { title: "Night shift",
      description: "Survive until dawn with a light and a dwindling battery.", genre: "shooter-survival", controls: ["keyboard"] } });
  const cap = LIMITS.platform.incrementalUpload.archiveBytesMax;
  assert.equal(incrementalDeploySchema.safeParse(request(cap)).success, true);
  const rejected = incrementalDeploySchema.safeParse(request(cap + 1));
  assert.equal(rejected.success, false);
  if (!rejected.success) assert.ok(rejected.error.issues.some(issue => issue.path.join(".") === "byteSize"));
});
