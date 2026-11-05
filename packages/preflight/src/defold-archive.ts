import { LIMITS } from "@opengame/shared";
import type { Finding, PreflightFile } from "./index";

/* Defold's encrypted Lua, read before upload the way the archive stage reads it after
   (apps/pipeline/opengame_pipeline/engine_archives.py, DEFOLD_STOCK_KEY and _defold_plain).
   bob encrypts every compiled Lua resource with a key that ships in Defold's open-source
   engine, so the stage decrypts and scans those rows (D51). A row that key does not open
   was built with a project's own key, and the stage refuses it like an encrypted Godot pack
   (D51 amended), so this refuses it here first, in the same words. So too a row that key
   opens into something other than Lua script text (D53, D56), which the stage cannot read.
   And an upload with more encrypted Lua than the stage will decrypt, which is a warning only
   because it says nothing about the game's safety. A table this cannot believe is left for the stage, which refuses
   what it cannot read.

   Key and cipher read from Defold 1.14.0 (tag commit d295ed4edff2e49072719835713e625f409849f1):
   engine/resource/src/resource_util.cpp for the key, engine/dlib/src/dlib/crypt.cpp for
   XTEA in counter mode on big-endian words, engine/resource/src/resource_archive.cpp for
   decrypt-then-LZ4. defold-archive.test.ts runs the Python on the same rows. */

export const DEFOLD_STOCK_KEY = new TextEncoder().encode("aQj8CScgNP4VsfXK");

/** The sentence the archive stage writes for the same row, split where the CLI splits a
 * finding. engine_archives.py defold_custom_key_message joins the two with a space. */
export function defoldCustomKeyMessage(origin: string): { title: string; detail: string } {
  return { title: `\`${origin}\` uses a custom encryption key, so OpenGame can't scan it.`,
    detail: "Export the game with Defold's standard key." };
}

/** The stage's sentence for a row Defold's key opens into something other than Lua script text
 * (defold_unreadable_message), split the same way. */
export function defoldUnreadableMessage(origin: string): { title: string; detail: string } {
  return { title: `\`${origin}\` decrypts to something other than Lua script text, so OpenGame can't scan it.`,
    detail: "Bundle the game again for HTML5 with Defold's editor or bob." };
}

/** The stage's engine_archive_decrypt_limit sentence (defold_decrypt_limit_message), split the
 * same way. Both read the bound from limits.json. */
export function defoldDecryptLimitMessage(origin: string): { title: string; detail: string } {
  return { title: `\`${origin}\` has more than ${LIMITS.scanner.defoldDecryptBytesMax / 2 ** 20} MB of encrypted Lua, which is more than OpenGame decrypts in one upload.`,
    detail: "Move large data out of your scripts into resource files." };
}

export function xteaCtr(data: Uint8Array, key: Uint8Array): Uint8Array {
  const view = new DataView(key.buffer, key.byteOffset, 16);
  const k = [0, 4, 8, 12].map(at => view.getUint32(at, false));
  const schedule: [number, number][] = [];
  let total = 0;
  for (let round = 0; round < 32; round++) {
    const first = (total + k[total & 3]!) >>> 0;
    total = (total + 0x9e3779b9) >>> 0;
    schedule.push([first, (total + k[(total >>> 11) & 3]!) >>> 0]);
  }
  const out = new Uint8Array(data);
  for (let block = 0; block * 8 < out.length; block++) {
    // A counter past 2^32 blocks would be a 32 GiB row, far beyond any limit here.
    let v0 = 0, v1 = block >>> 0;
    for (const [first, second] of schedule) {
      v0 = (v0 + ((((v1 << 4) ^ (v1 >>> 5)) + v1) ^ first)) >>> 0;
      v1 = (v1 + ((((v0 << 4) ^ (v0 >>> 5)) + v0) ^ second)) >>> 0;
    }
    const stream = [v0 >>> 24, v0 >>> 16, v0 >>> 8, v0, v1 >>> 24, v1 >>> 16, v1 >>> 8, v1];
    for (let j = 0; j < 8 && block * 8 + j < out.length; j++) out[block * 8 + j]! ^= stream[j]! & 0xff;
  }
  return out;
}

/** One raw LZ4 block that must decode to exactly `expected` bytes, or null. */
function lz4(data: Uint8Array, expected: number): Uint8Array | null {
  const out = new Uint8Array(expected);
  let cursor = 0, written = 0;
  const length = (value: number): number | null => {
    if (value !== 15) return value;
    for (;;) {
      if (cursor >= data.length) return null;
      const extra = data[cursor++]!;
      value += extra;
      if (extra !== 255) return value;
    }
  };
  while (cursor < data.length) {
    const token = data[cursor++]!;
    const literals = length(token >> 4);
    if (literals === null || cursor + literals > data.length || written + literals > expected) return null;
    out.set(data.subarray(cursor, cursor + literals), written);
    cursor += literals; written += literals;
    if (cursor === data.length) break;
    if (cursor + 2 > data.length) return null;
    const offset = data[cursor]! | (data[cursor + 1]! << 8);
    cursor += 2;
    const extra = length(token & 15);
    if (offset === 0 || offset > written || extra === null || written + extra + 4 > expected) return null;
    for (let i = 0; i < extra + 4; i++, written++) out[written] = out[written - offset]!;
  }
  return written === expected ? out : null;
}

/** engine_archives.py _proto_varint: at most ten bytes, the tenth no more than 1, so the value
 * fits in 64 bits. Above 2^53 the number is not exact, and every caller that needs it exact
 * (a key, a length, a uint32) refuses anything from 2^32 up first, which is exact. Until the
 * review of 31 Oct 2026 a key past 2^53 rounded to another field here and not in Python. */
function protoVarint(data: Uint8Array, at: { cursor: number }): number | null {
  let value = 0;
  for (let shift = 0; shift < 70; shift += 7) {
    if (at.cursor >= data.length) return null;
    const byte = data[at.cursor++]!;
    if (shift === 63 && byte > 1) return null;
    value += (byte & 0x7f) * 2 ** shift;
    if (!(byte & 0x80)) return value;
  }
  return null;
}

/** engine_archives.py _defold_opens: a whole protobuf message whose first field is field 1,
 * length-delimited, which is how every LuaModule bob encrypts begins. The test for "the stock
 * key opened it" on a row LZ4 cannot vouch for. Whether it is Lua is defoldLuaModule's. */
function defoldOpens(data: Uint8Array): boolean {
  const at = { cursor: 0 };
  let first = true;
  while (at.cursor < data.length) {
    const key = protoVarint(data, at);
    if (key === null || key >= 2 ** 32 || key < 8 || (first && key !== 0x0a)) return false;
    first = false;
    const wire = key % 8;
    if (wire === 0) { if (protoVarint(data, at) === null) return false; }
    else if (wire === 1 || wire === 5) at.cursor += wire === 1 ? 8 : 4;
    else if (wire === 2) { const size = protoVarint(data, at); if (size === null || size >= 2 ** 32) return false; at.cursor += size; }
    else return false;
    if (at.cursor > data.length) return false;
  }
  return !first;
}

/* engine_archives.py _DEFOLD_LUA, the LuaModule schema read from Defold 1.14.0's bob.jar, and
   the rules that go with it. That file says why LuaSource holds only script text and its
   filename, so a bytecode row is refused (D56). */
type LuaKind = "module" | "source" | "properties" | "entry" | "text" | "uint64" | "uint32" | "float";
const ENTRY: [LuaKind, boolean] = ["entry", true];
const DEFOLD_LUA: Record<string, Record<number, [LuaKind, boolean]>> = {
  module: { 1: ["source", false], 2: ["text", true], 3: ["text", true], 4: ["properties", false], 5: ["text", true] },
  source: { 1: ["text", false], 2: ["text", false] },
  properties: { 1: ENTRY, 2: ENTRY, 3: ENTRY, 4: ENTRY, 5: ENTRY, 6: ENTRY, 7: ENTRY, 11: ENTRY, 8: ["float", true], 9: ["uint64", true], 10: ["text", true] },
  entry: { 1: ["text", false], 2: ["uint64", false], 3: ["uint32", false], 4: ["uint64", true], 5: ["uint32", false] },
};
// A source with no script text is no script the stage can read.
const DEFOLD_LUA_REQUIRED: Record<string, number[]> = { module: [1], source: [1, 2], properties: [], entry: [1, 2, 3] };
const wireOf = (kind: LuaKind) => kind === "uint64" || kind === "uint32" ? 0 : kind === "float" ? 5 : 2;
const LUA_TEXT_CONTROL = /[\x00-\x08\x0e-\x1f]/;
const strictUtf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function luaValue(value: Uint8Array, kind: LuaKind): boolean {
  if (kind in DEFOLD_LUA) return luaMessage(value, kind);
  try { return !LUA_TEXT_CONTROL.test(strictUtf8.decode(value)); } catch { return false; }
}

function luaMessage(data: Uint8Array, kind: LuaKind): boolean {
  const fields = DEFOLD_LUA[kind]!, seen = new Set<number>(), at = { cursor: 0 };
  while (at.cursor < data.length) {
    const key = protoVarint(data, at);
    if (key === null || key >= 2 ** 32) return false;
    const number = Math.floor(key / 8), field = Object.hasOwn(fields, number) ? fields[number] : undefined;
    if (!field) return false;
    const [valueKind, repeated] = field;
    if (seen.has(number) && !repeated) return false;
    seen.add(number);
    const wire = key % 8;
    if (wire !== wireOf(valueKind)) return false;
    if (wire === 0) {
      const value = protoVarint(data, at);
      if (value === null || (valueKind === "uint32" && value >= 2 ** 32)) return false;
    } else if (wire === 5) {
      at.cursor += 4;
      if (at.cursor > data.length) return false;
    } else {
      const length = protoVarint(data, at);
      if (length === null || length > data.length - at.cursor) return false;
      const value = data.subarray(at.cursor, at.cursor + length);
      at.cursor += length;
      if (!luaValue(value, valueKind)) return false;
    }
  }
  return DEFOLD_LUA_REQUIRED[kind]!.every(number => seen.has(number));
}

/** engine_archives.py _defold_lua_module: whether decrypted bytes are a LuaModule of script
 * text the stage can scan for what it is. Anything else, bytecode included, is refused before
 * upload as the stage refuses it (D53, D56). Until the review of 31 Oct 2026 any protobuf
 * passed, a ZIP in field 1 included, and until review-rr four bytes of LuaJIT header made a
 * ZIP behind them bytecode (RR-1). */
export function defoldLuaModule(data: Uint8Array): boolean {
  return luaMessage(data, "module");
}

/** An encrypted row as the engine reads it, or null when Defold's key does not open it. */
export function defoldPlain(stored: Uint8Array, expanded: number, compressed: boolean): Uint8Array | null {
  let plain: Uint8Array | null = xteaCtr(stored, DEFOLD_STOCK_KEY);
  if (compressed) plain = lz4(plain, expanded);
  return plain && defoldOpens(plain) ? plain : null;
}

function joined(parts: Uint8Array[]): Uint8Array {
  if (parts.length === 1) return parts[0]!;
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}

// The version 6 row's split, built with the constructor rather than as `1n` literals:
// apps/web compiles this file at its own ES2017 target, which refuses BigInt literal
// syntax (TS2737) even though the runtime and the lib both have BigInt.
const V6_FLAG_SHIFT = BigInt(60);
const V6_OFFSET_MASK = (BigInt(1) << V6_FLAG_SHIFT) - BigInt(1);
const pieceNames = (entry: unknown): string[] | null => {
  const pieces = (entry as { pieces?: unknown } | null)?.pieces;
  if (!Array.isArray(pieces) || !pieces.length) return null;
  const names = pieces.map(piece => (piece as { name?: unknown } | null)?.name);
  return names.every((name): name is string => typeof name === "string" && name !== "" && !/[\\/]/.test(name)) ? names : null;
};

/** The archive `leaf` belongs to in its folder: the data file (joined from the pieces that
 * folder's archive_files.json lists, as dmloader.js joins them) and its index, named by the
 * first piece, which is the name the stage reports rows under. Null when `leaf` is a later
 * piece, when nothing indexes it, or when the table or a piece cannot be read: each of
 * those is the stage's to refuse, and an adapter whose bytes are deferred (an external
 * asset on the large-game lane) answers by throwing, which crashed the whole platform
 * preflight until the review of 31 Oct 2026. */
async function defoldArchive(byPath: Map<string, PreflightFile>, path: string): Promise<{ index: Uint8Array; data: Uint8Array } | null> {
  const read = async (name: string) => { const file = byPath.get(name); return file?.bytes ? await file.bytes() : null; };
  const slash = path.lastIndexOf("/"), folder = path.slice(0, slash + 1), leaf = path.slice(slash + 1);
  let dataPieces: string[] | null = [leaf], indexPieces: string[] | null = [leaf.replace(/\.arcd$/, ".arci")];
  const table = byPath.has(`${folder}archive_files.json`) ? await read(`${folder}archive_files.json`) : null;
  if (table) {
    const content: unknown = JSON.parse(new TextDecoder().decode(table))?.content;
    if (!Array.isArray(content)) return null;
    const named = (name: string) => content.find(entry => (entry as { name?: unknown } | null)?.name === name);
    const group = content.find(entry => pieceNames(entry)?.[0] === leaf && String((entry as { name?: unknown }).name).endsWith(".arcd"));
    if (!group) return null;
    dataPieces = pieceNames(group);
    indexPieces = pieceNames(named(String(group.name).replace(/\.arcd$/, ".arci")));
  }
  if (!dataPieces || !indexPieces) return null;
  const data = await Promise.all(dataPieces.map(piece => read(folder + piece)));
  const index = await Promise.all(indexPieces.map(piece => read(folder + piece)));
  if (data.some(part => !part) || index.some(part => !part)) return null;
  return { index: joined(index as Uint8Array[]), data: joined(data as Uint8Array[]) };
}

/** A blocker per encrypted row that Defold's own key does not open, or opens into something
 * other than Lua, and a warning when the upload's encrypted rows add up to more than the
 * stage decrypts. */
export async function defoldCustomKeyFindings(files: PreflightFile[]): Promise<Finding[]> {
  const findings: Finding[] = [];
  const byPath = new Map(files.map(file => [file.path, file]));
  // Across the whole upload, as engine_archives.py counts them: the stored bytes decrypted,
  // and the members and expanded bytes every table claims. The stage counts the upload's
  // other files against the same member bound, and a large-asset lane has bounds of its own,
  // so these are the least the stage refuses: past them nothing is read.
  let decrypting = 0, members = 0, expanding = 0;
  for (const file of files) {
    if (!/\.arcd$/.test(file.path)) continue;
    let archive: { index: Uint8Array; data: Uint8Array } | null;
    try { archive = await defoldArchive(byPath, file.path); } catch { continue; }
    if (!archive || archive.index.length < 32) continue;
    const { index, data } = archive;
    const view = new DataView(index.buffer, index.byteOffset, index.byteLength);
    const version = view.getUint32(0), count = view.getUint32(16), entries = view.getUint32(20);
    if ((version !== 5 && version !== 6) || entries + count * 16 > index.length) continue;
    // The stage reads the whole table, and spends the upload's member and byte budgets on it,
    // before it decrypts a row (_defold). Until the review of 31 Oct 2026 this decrypted row
    // by row with only the decrypt allowance in front of it, so one row claiming 1.6 GB had
    // LZ4 ask for 1.6 GB, and a table of any length was walked and reported row by row
    // (QQ-3). A table the stage would refuse is left for it now, unread: the stage says why.
    members += count;
    if (members > LIMITS.bundle.fileCountMax) return findings;
    const rows: { i: number; offset: number; stored: number; expanded: number; flags: number }[] = [];
    for (let i = 0; i < count; i++) {
      const at = entries + i * 16;
      // Version 5 rows are four words (offset, size, compressed size, flags); version 6
      // packs the flags into the top four bits of a 64-bit offset and drops the fourth.
      let offset: number, flags: number, expanded: number, compressed: number;
      if (version === 5) [offset, expanded, compressed, flags] = [0, 4, 8, 12].map(word => view.getUint32(at + word)) as [number, number, number, number];
      else {
        const packed = view.getBigUint64(at);
        [offset, flags, expanded, compressed] = [Number(packed & V6_OFFSET_MASK), Number(packed >> V6_FLAG_SHIFT), view.getUint32(at + 8), view.getUint32(at + 12)];
      }
      const stored = flags & 2 ? compressed : expanded;
      if (flags & ~7 || (flags & 2 && compressed === 0xffffffff)) return findings;
      if (expanded > Math.max(stored, 1) * LIMITS.bundle.compressionRatioMax) return findings;
      expanding += expanded;
      if (expanding > LIMITS.bundle.uncompressedBytesMax) return findings;
      if (offset + stored > data.length) return findings;
      rows.push({ i, offset, stored, expanded, flags });
    }
    for (const { i, offset, stored, expanded, flags } of rows) {
      if (!(flags & 1)) continue;
      decrypting += stored;
      // Past the decrypt allowance the stage refuses the archive this row is in and reads
      // no further, so neither does this. The stage names that archive in its refusal.
      if (decrypting > LIMITS.scanner.defoldDecryptBytesMax) {
        findings.push({ code: "defold-decrypt-limit", severity: "warning", path: file.path, ...defoldDecryptLimitMessage(file.path) });
        return findings;
      }
      const plain = defoldPlain(data.subarray(offset, offset + stored), expanded, !!(flags & 2));
      if (plain && defoldLuaModule(plain)) continue;
      const origin = `${file.path}!/resource-${i}.bin`;
      findings.push(plain
        ? { code: "defold-unreadable", severity: "blocker", path: file.path, ...defoldUnreadableMessage(origin) }
        : { code: "defold-custom-key", severity: "blocker", path: file.path, ...defoldCustomKeyMessage(origin) });
    }
  }
  return findings;
}
