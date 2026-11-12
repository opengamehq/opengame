import { BUNDLE, LIMITS } from "@opengame/shared";
import { ARCHIVE_EXTENSIONS, BIDI_CONTROLS, nameCollisions, compressedBrowserAsset, canonicalName } from "./names";
import { validateDeflateFrame } from "./deflate-frame";

/** A parser's receipt for the original bytes, never a claim supplied by a manifest.
 * Complete means the container was inspected, not that its game is safe or playable. */
export interface RawRuntimeEvidence {
  engine: "ruffle" | "jsdos";
  format: "swf" | "jsdos";
  path: string;
  sha256: string;
  bytes: number;
  expandedBytes: number;
  memberCount: number;
  complete: boolean;
  manualReviewRequired: boolean;
}

export type RawInflater = (bytes: Uint8Array, format: "deflate" | "deflate-raw", maximum: number) => Promise<Uint8Array>;
export class RawRuntimeError extends Error {}
const refuse = (code: string): never => { throw new RawRuntimeError(code); };
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const signature = (b: Uint8Array, text: string, at = 0) => [...text].every((c, i) => b[at + i] === c.charCodeAt(0));
const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

/** Browser fallback. Node callers can supply a native inflater with a hard output
 * cap. Read incrementally; never ask Response.arrayBuffer to allocate a bomb. */
export const inflateRawRuntime: RawInflater = async (bytes, format, maximum) => {
  const expected = validateDeflateFrame(bytes, format, maximum);
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream(format));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.length;
      if (length > maximum) refuse("engine_archive_byte_limit");
      chunks.push(next.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  if (length !== expected) refuse("engine_archive_size_mismatch");
  const result = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) { result.set(chunk, at); at += chunk.length; }
  return result;
};

function actionRecords(bytes: Uint8Array, start: number, end: number): boolean {
  const data = view(bytes), boundaries = new Set<number>(), jumps: number[] = [], skips: number[] = [];
  let at = start, count = 0, complete = true;
  const stringEnd = (offset: number, stop: number) => {
    while (offset < stop && bytes[offset]) offset++;
    if (offset === stop) refuse("engine_archive_truncated");
    return offset + 1;
  };
  while (at < end) {
    if (++count > BUNDLE.fileCountMax) refuse("engine_archive_file_limit");
    boundaries.add(at);
    const code = bytes[at++]!;
    if (!code) {
      if (at !== end || jumps.some(target=>!boundaries.has(target)) || skips.some(target=>target>=count)) refuse("engine_archive_invalid_range");
      return complete;
    }
    if (code < 0x80) {
      // AVM1's short records have no body; reserved opcodes stay manual.
      if(![4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,23,24,28,29,32,33,34,35,36,37,38,39,40,41,42,43,44,48,49,50,51,52,53,54,55,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,96,97,98,99,100,101,102,103,104,105].includes(code)) complete=false;
      continue;
    }
    if (at + 2 > end) refuse("engine_archive_truncated");
    const length = data.getUint16(at,true); at += 2;
    const stop = at + length;
    if (stop > end) refuse("engine_archive_truncated");
    if (code === 0x96) {
      while(at < stop) {
        const type=bytes[at++]!;
        if(type===0) at=stringEnd(at,stop);
        else {
          const sizes: Record<number,number>={1:4,2:0,3:0,4:1,5:1,6:8,7:4,8:1,9:2};
          if(!(type in sizes) || at+sizes[type]!>stop) refuse("engine_archive_invalid_header");
          at+=sizes[type]!;
        }
      }
    } else if (code === 0x88) {
      if(at+2>stop) refuse("engine_archive_truncated");
      const strings=data.getUint16(at,true); at+=2;
      if(strings>BUNDLE.fileCountMax) refuse("engine_archive_file_limit");
      for(let i=0;i<strings;i++) at=stringEnd(at,stop);
      if(at!==stop) refuse("engine_archive_invalid_header");
    } else if (code === 0x99 || code === 0x9d) {
      if(length!==2) refuse("engine_archive_invalid_header");
      jumps.push(stop+data.getInt16(at,true));
    } else if (code===0x81 || code===0x8a || code===0x8d || code===0x9a || code===0x87) {
      const required=code===0x81?2:code===0x8a?3:1;
      if(length!==required) refuse("engine_archive_invalid_header");
      if(code===0x8a || code===0x8d) skips.push(count+bytes[stop-1]!);
    } else if(code===0x8b || code===0x8c || code===0x83) {
      at=stringEnd(at,stop); if(code===0x83) at=stringEnd(at,stop);
      if(at!==stop) refuse("engine_archive_invalid_header");
    } else if(code===0x9f) {
      if(length!==1 && length!==3) refuse("engine_archive_invalid_header");
      if(length!==((bytes[at]!&2)?3:1)) refuse("engine_archive_invalid_header");
    } else complete=false; // Function/try/with bodies need their own decoder.
    at=stop;
  }
  return refuse("engine_archive_truncated");
}

/** Walk every tag envelope, including sprite timelines. An unknown tag stays
 * visible as incomplete inspection instead of acquiring trust from FWS magic. */
export function validateSwf(bytes: Uint8Array, maximum = BUNDLE.uncompressedBytesMax): boolean {
  if (bytes.length < 8 || !signature(bytes, "FWS") || bytes[3]! < 1 || bytes[3]! > 50) refuse("engine_archive_invalid_header");
  const data = view(bytes);
  if (data.getUint32(4, true) !== bytes.length) refuse("engine_archive_size_mismatch");
  if (bytes.length > maximum) refuse("engine_archive_byte_limit");
  let bit = 64;
  function bits(n: number, signed = false): number {
    if (bit + n > bytes.length * 8) refuse("engine_archive_truncated");
    let value = 0;
    for (let i = 0; i < n; i++, bit++) value = value * 2 + ((bytes[bit >> 3]! >> (7 - (bit & 7))) & 1);
    return signed && value >= 2 ** (n - 1) ? value - 2 ** n : value;
  }
  const n = bits(5);
  if (!n) refuse("engine_archive_invalid_header");
  const xmin = bits(n, true), xmax = bits(n, true), ymin = bits(n, true), ymax = bits(n, true);
  if (xmax <= xmin || ymax <= ymin) refuse("engine_archive_invalid_header");
  while (bit % 8) if (bits(1)) refuse("engine_archive_invalid_header");
  let at = bit / 8;
  if (at + 4 > bytes.length) refuse("engine_archive_truncated");
  const rate = data.getUint16(at, true), frames = data.getUint16(at + 2, true);
  if (!rate || !frames) refuse("engine_archive_invalid_header");
  at += 4;
  const stack = [{ at, end: bytes.length, frames, shown: 0 }];
  let count = 0, complete = true;
  while (stack.length) {
    const timeline = stack[stack.length - 1]!;
    if (++count > BUNDLE.fileCountMax) refuse("engine_archive_file_limit");
    if (timeline.at + 2 > timeline.end) refuse("engine_archive_truncated");
    const record = data.getUint16(timeline.at, true), tag = record >> 6;
    timeline.at += 2;
    let size = record & 63;
    if (size === 63) {
      if (timeline.at + 4 > timeline.end) refuse("engine_archive_truncated");
      size = data.getUint32(timeline.at, true); timeline.at += 4;
    }
    const start = timeline.at, end = start + size;
    if (end > timeline.end) refuse("engine_archive_invalid_range");
    timeline.at = end;
    if (tag === 0) {
      if (size || end !== timeline.end || timeline.shown !== timeline.frames) refuse("engine_archive_invalid_header");
      stack.pop();
    } else if (tag === 1) {
      if (size || ++timeline.shown > timeline.frames) refuse("engine_archive_invalid_header");
    } else if (tag === 39) {
      if (size < 4) refuse("engine_archive_truncated");
      const nestedFrames = data.getUint16(start + 2, true);
      if (!nestedFrames) refuse("engine_archive_invalid_header");
      stack.push({ at: start + 4, end, frames: nestedFrames, shown: 0 });
    } else if (tag === 9) {
      if(size!==3) refuse("engine_archive_invalid_header");
    } else if(tag===69) {
      if(size!==4 || (data.getUint32(start,true)&0xffffff86)) refuse("engine_archive_invalid_header");
    } else if(tag===43) {
      let zero=start; while(zero<end && bytes[zero]) zero++;
      if(zero===end || (zero+1!==end && !(zero+2===end && bytes[zero+1]===1))) refuse("engine_archive_invalid_header");
    } else if(tag===12) {
      complete=actionRecords(bytes,start,end)&&complete;
    } else {
      // Recognising a tag number does not inspect its body. In particular,
      // bitmap compression and arbitrary DefineBinaryData remain manual.
      complete=false;
    }
  }
  return complete;
}

export function validateDosConfig(config: Uint8Array, metadata: Uint8Array | undefined, names: string[]): void {
  if(config.length>LIMITS.scanner.credentialChunkBytes || (metadata?.length??0)>LIMITS.scanner.credentialChunkBytes) refuse("engine_archive_byte_limit");
  const text = utf8.decode(config);
  if(text.includes("\ufeff")) refuse("engine_archive_invalid_jsdos");
  let section = "", settings = false, autoexec = false, command = false;
  for (const match of text.matchAll(/[^\r\n]+/g)) {
    const line = match[0].replace(/^[ \t\v\f]+|[ \t\v\f]+$/g, "");
    if (!line || /^[#;]/.test(line)) continue;
    const heading = /^\[([^\]]+)\]$/.exec(line);
    if (heading) {
      section = heading[1]!.toLowerCase();
      settings ||= section === "sdl" || section === "dosbox";
      autoexec ||= section === "autoexec";
    } else if (section === "autoexec") {
      const token = line.replace(/^@+/, "").replace(/^[ \t\v\f]+/, "").split(/[ \t\v\f]+/,1)[0]!.toLowerCase();
      if (token && !["echo","rem","mount","imgmount","cd","chdir","drive","exit"].includes(token) && !token.startsWith("::") && !/^[a-z]:$/.test(token)) command = true;
    }
  }
  if (!settings || !autoexec || !command || !names.some(name => !name.startsWith(".jsdos/"))) refuse("engine_archive_invalid_jsdos");
  if (metadata !== undefined) {
    const value: unknown = JSON.parse(utf8.decode(metadata));
    if (!value || typeof value !== "object" || Array.isArray(value)) refuse("engine_archive_invalid_jsdos");
  }
}

function memberName(raw: Uint8Array, unicode: boolean): string {
  // Config and path identity are UTF-8. Legacy ASCII remains byte-identical;
  // non-ASCII CP437 is deliberately outside this first raw-admission reader.
  if (!unicode && raw.some(byte => byte > 127)) refuse("engine_archive_member_path");
  const name = utf8.decode(raw);
  if (!name || raw.length > BUNDLE.pathBytesMax) refuse("engine_archive_path_limit");
  if (name.startsWith("res://")) refuse("engine_archive_member_path");
  let decoded = name;
  for (let i = 0; i <= 3; i++) {
    if (/^[a-z]:|^[/\\]|\\|[\x00-\x1f\x7f-\x9f]/i.test(decoded) || decoded.split("/").includes("..") || [...decoded].some(c => BIDI_CONTROLS.includes(c))) refuse("engine_archive_member_path");
    if (i < 3) try { decoded = decodeURIComponent(decoded.replace(/%(?![0-9a-f]{2})/gi,"%25")); } catch { refuse("engine_archive_member_path"); }
  }
  const lower = name.toLowerCase();
  if ([...ARCHIVE_EXTENSIONS, ".unityweb", ".love", ".jsdos"].some(ext => lower.endsWith(ext)) || compressedBrowserAsset(name) ||
      Object.keys(LIMITS.platform.browserEnginePolicy.engineArchives).some(ext => lower.endsWith(ext) && (ext !== ".zip" || lower.split("/").at(-1) === "game.zip"))) refuse("engine_archive_nested");
  const normalized=name.split("/").filter(part => part && part !== ".").join("/");
  if(!normalized) refuse("engine_archive_member_path");
  return normalized;
}

const CRC_TABLE = Uint32Array.from({length:256}, (_, value) => {
  for(let bit=0;bit<8;bit++) value=(value>>>1)^(value&1?0xedb88320:0);
  return value>>>0;
});
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc=(crc>>>8)^CRC_TABLE[(crc^byte)&255]!;
  return (crc ^ 0xffffffff) >>> 0;
}

function nested(bytes: Uint8Array): boolean {
  return signature(bytes,"ustar",257) || ["PK\x03\x04", "PK\x05\x06", "PK\x07\x08", "\x1f\x8b", "BZh", "\xfd7zXZ\0", "7z\xbc\xaf\x27\x1c", "Rar!\x1a\x07", "\x28\xb5\x2f\xfd", "MSCF", "\x04\x22\x4d\x18", "GDPC", "UnityWebData1.0\0", "CWS", "ZWS"].some(magic => signature(bytes, magic));
}

/** A single-disk, non-ZIP64 end record whose directory ends exactly where the record
 * starts and whose comment ends the file. Shared by the .jsdos reader and the engine
 * ZIP shape check (engine-findings.ts), so neither can locate a different directory. */
export function zipEnd(bytes: Uint8Array): { eocd: number; count: number; length: number; offset: number } {
  const data = view(bytes);
  let eocd = bytes.length - 22;
  while (eocd >= Math.max(0, bytes.length - 22 - 0xffff) && !signature(bytes, "PK\x05\x06", eocd)) eocd--;
  if (eocd < 0 || eocd + 22 > bytes.length || !signature(bytes, "PK\x05\x06", eocd)) refuse("engine_archive_invalid_header");
  const count = data.getUint16(eocd + 10, true), length = data.getUint32(eocd + 12, true), offset = data.getUint32(eocd + 16, true);
  if (count === 0xffff || length === 0xffffffff || offset === 0xffffffff || signature(bytes, "PK\x06\x07", eocd - 20)) refuse("engine_archive_unsupported_zip_directory");
  if (data.getUint16(eocd + 4, true) || data.getUint16(eocd + 6, true) || data.getUint16(eocd + 8, true) !== count || offset + length !== eocd || eocd + 22 + data.getUint16(eocd + 20, true) !== bytes.length) refuse("engine_archive_invalid_header");
  return { eocd, count, length, offset };
}

/** Every file name in a ZIP's central directory, as names.py `normalise` writes it,
 * directories left out. Names only: the archive stage decodes and checks every member,
 * and this reads no further than it needs to say whether the archive has the members its
 * engine requires (names.ts engineArchiveShape). */
export function zipMemberNames(bytes: Uint8Array): string[] {
  const data = view(bytes), { eocd, count, offset } = zipEnd(bytes);
  if (count > BUNDLE.fileCountMax) refuse("engine_archive_file_limit");
  const names: string[] = [];
  const seen = new Set<string>();
  const latin1 = new TextDecoder("latin1");
  let at = offset, records = 0;
  while (at < eocd) {
    if (++records > count || at + 46 > eocd || !signature(bytes, "PK\x01\x02", at)) refuse("engine_archive_invalid_header");
    const flags = data.getUint16(at + 8, true), nameSize = data.getUint16(at + 28, true);
    const end = at + 46 + nameSize + data.getUint16(at + 30, true) + data.getUint16(at + 32, true);
    if (end > eocd || nameSize > BUNDLE.pathBytesMax) refuse("engine_archive_invalid_header");
    const raw = bytes.subarray(at + 46, at + 46 + nameSize);
    // The member's local header must name it exactly as the directory does. A reader that
    // walks local headers (as engines' loaders can) and this one that walks the directory
    // would otherwise see different files, which is how a decoy main.lua gets admitted.
    // names.py refuses the same thing as engine_archive_member_path.
    const local = data.getUint32(at + 42, true);
    if (local + 30 > offset || !signature(bytes, "PK\x03\x04", local)) refuse("engine_archive_member_path");
    const localSize = data.getUint16(local + 26, true);
    // The UTF-8 flag decides how the name is read, so both headers must agree on it, as
    // the archive stage requires (flags == flag_bits).
    if ((data.getUint16(local + 6, true) & 0x800) !== (flags & 0x800) || localSize !== nameSize || local + 30 + localSize > offset ||
      bytes.subarray(local + 30, local + 30 + localSize).some((byte, index) => byte !== raw[index])) refuse("engine_archive_member_path");
    // zipfile reads a name without the UTF-8 flag as CP437. Only ASCII decides a
    // pattern in engineArchiveMembers, and ASCII is the same in both.
    const name = (flags & 0x800 ? utf8 : latin1).decode(raw);
    if (!name.endsWith("/")) {
      const path = name.split("/").filter(part => part && part !== ".").join("/");
      // Two members with one name: which one an engine loads is the engine's choice, not
      // ours, so neither is trusted. names.py: engine_archive_duplicate_path.
      // Folded as names.py `collisions` folds: case and Unicode form. Main.lua and main.lua,
      // or é written two ways, are one file on some systems and two on others.
      const key = path.normalize("NFC").toLowerCase();
      if (seen.has(key)) refuse("engine_archive_duplicate_path");
      seen.add(key);
      names.push(path);
    }
    at = end;
  }
  if (at !== eocd || records !== count) refuse("engine_archive_invalid_header");
  return names;
}

async function validateJsdos(bytes: Uint8Array, maximum: number, members: number, inflate: RawInflater): Promise<{ complete: boolean; expandedBytes: number; memberCount: number }> {
  const data = view(bytes), { eocd, count, length, offset } = zipEnd(bytes);
  if (count > members) refuse("engine_archive_file_limit");
  if (length > BUNDLE.uncompressedBytesMax) refuse("engine_archive_byte_limit");
  const rows: { name: string; start: number; compressed: number; size: number; method: number; crc: number; flags: number; raw: Uint8Array; directory: boolean }[] = [];
  let at = offset, total = 0;
  // Validate every central record before allocating any decompressed output.
  while (at < eocd) {
    if (rows.length >= count || at + 46 > eocd || !signature(bytes, "PK\x01\x02", at)) refuse("engine_archive_invalid_header");
    const flags = data.getUint16(at + 8, true), method = data.getUint16(at + 10, true);
    if (method !== 0 && method !== 8) refuse("engine_archive_unsupported_compression");
    if (flags & 1) refuse("engine_archive_encrypted_zip");
    const nameSize = data.getUint16(at + 28, true), extra = data.getUint16(at + 30, true), comment = data.getUint16(at + 32, true);
    const end = at + 46 + nameSize + extra + comment;
    if (end > eocd || nameSize > BUNDLE.pathBytesMax) refuse("engine_archive_invalid_header");
    const raw = bytes.subarray(at + 46, at + 46 + nameSize), name = memberName(raw, !!(flags & 0x800));
    const size = data.getUint32(at + 24, true), compressed = data.getUint32(at + 20, true), start = data.getUint32(at + 42, true);
    const mode = bytes[at + 5] === 3 ? data.getUint32(at + 38, true) >>> 16 : 0, type = mode & 0xf000;
    if (![0,0x8000,0x4000].includes(type) || mode & 0xc00) refuse("engine_archive_special_file");
    const directory = raw[raw.length - 1] === 47;
    if(directory && (size!==0 || data.getUint32(at+16,true)!==0)) refuse("engine_archive_invalid_header");
    if((name===".jsdos/dosbox.conf" || name===".jsdos/jsdos.json") && size>LIMITS.scanner.credentialChunkBytes) refuse("engine_archive_byte_limit");
    if (!directory) {
      total += size;
      if (size > Math.max(1, compressed) * BUNDLE.compressionRatioMax || total > maximum) refuse("engine_archive_byte_limit");
    }
    rows.push({name, start, size, compressed, method, crc: data.getUint32(at + 16, true), flags, raw, directory});
    at = end;
  }
  if (at !== eocd || rows.length !== count) refuse("engine_archive_invalid_header");
  const names = rows.filter(row => !row.directory).map(row => row.name), collisions = nameCollisions(names);
  if (new Set(names).size !== names.length || collisions.case.length || collisions.normalisation.length) refuse("engine_archive_duplicate_path");
  const allCollisions=nameCollisions(rows.map(row=>row.name));
  if(allCollisions.case.length || allCollisions.normalisation.length) refuse("engine_archive_duplicate_path");
  const fileKeys=new Set(names.map(canonicalName));
  for(const row of rows) {
    if(row.directory && fileKeys.has(canonicalName(row.name))) refuse("engine_archive_duplicate_path");
    for(let slash=row.name.indexOf("/");slash>=0;slash=row.name.indexOf("/",slash+1)) {
      if(fileKeys.has(canonicalName(row.name.slice(0,slash)))) refuse("engine_archive_duplicate_path");
    }
  }
  let config: Uint8Array | undefined, metadata: Uint8Array | undefined, complete = true;
  const localRows: { row: typeof rows[number]; body: number; end: number }[]=[];
  for (const row of rows) {
    const start = row.start;
    if (start + 30 > offset || !signature(bytes, "PK\x03\x04", start)) refuse("engine_archive_invalid_header");
    const nameSize = data.getUint16(start + 26, true), extra = data.getUint16(start + 28, true), body = start + 30 + nameSize + extra;
    if (data.getUint16(start + 6, true) !== row.flags || data.getUint16(start + 8, true) !== row.method || body + row.compressed > offset || nameSize !== row.raw.length || row.raw.some((byte,i) => bytes[start + 30 + i] !== byte)) refuse("engine_archive_invalid_header");
    const localCrc=data.getUint32(start+14,true), localCompressed=data.getUint32(start+18,true), localSize=data.getUint32(start+22,true);
    let end=body+row.compressed;
    if(row.flags&8) {
      if((localCrc!==0 && localCrc!==row.crc) || (localCompressed!==0 && localCompressed!==row.compressed) || (localSize!==0 && localSize!==row.size)) refuse("engine_archive_invalid_header");
      if(signature(bytes,"PK\x07\x08",end)) end+=4;
      if(end+12>offset || data.getUint32(end,true)!==row.crc || data.getUint32(end+4,true)!==row.compressed || data.getUint32(end+8,true)!==row.size) refuse("engine_archive_invalid_header");
      end+=12;
    } else if(localCrc!==row.crc || localCompressed!==row.compressed || localSize!==row.size) refuse("engine_archive_invalid_header");
    localRows.push({row,body,end});
  }
  let covered=0;
  for(const {row,end} of [...localRows].sort((a,b)=>a.row.start-b.row.start)) {
    if(row.start!==covered) refuse("engine_archive_invalid_range");
    covered=end;
  }
  if(covered!==offset) refuse("engine_archive_invalid_range");
  for(const {row,body} of localRows) {
    const compressed = bytes.subarray(body, body + row.compressed);
    const decoded = row.method === 0 ? compressed : await inflate(compressed, "deflate-raw", row.size);
    if (decoded.length !== row.size || crc32(decoded) !== row.crc) refuse("engine_archive_size_mismatch");
    if(row.directory) continue;
    if (nested(decoded)) refuse("engine_archive_nested");
    if (["UnityFS\0", "UnityWeb\0", "UnityRaw\0", "RSCC", "GDEC"].some(magic => signature(decoded, magic))) complete = false;
    if (row.name === ".jsdos/dosbox.conf") config = decoded;
    if (row.name === ".jsdos/jsdos.json") metadata = decoded;
  }
  if (!config) refuse("engine_archive_invalid_jsdos");
  validateDosConfig(config!, metadata, names);
  return { complete, expandedBytes: total, memberCount: count };
}

export async function inspectRawRuntime(file: { path: string; sourcePath?: string; size: number; bytes?: () => Promise<Uint8Array> }, options: { maximum?: number; members?: number; inflate?: RawInflater } = {}): Promise<RawRuntimeEvidence | null> {
  const format = /\.swf$/i.test(file.path) ? "swf" : /\.jsdos$/i.test(file.path) ? "jsdos" : null;
  if (!format) return null;
  let name = file.sourcePath ?? file.path;
  if (new TextEncoder().encode(name).length > BUNDLE.pathBytesMax) refuse("engine_archive_path_limit");
  for (let i=0; i<=3; i++) {
    if (!name || /^[/\\]|^[a-z]:/i.test(name) || /\\|[\x00-\x1f\x7f-\x9f]/.test(name) || name.split("/").some(part=>!part || part==="." || part==="..") || [...name].some(c=>BIDI_CONTROLS.includes(c))) refuse("engine_archive_member_path");
    if(i<3) try { name=decodeURIComponent(name.replace(/%(?![0-9a-f]{2})/gi,"%25")); } catch { refuse("engine_archive_member_path"); }
  }
  if (!file.bytes) refuse("engine_archive_not_inspected");
  // One decoded movie or disk image is one file, and since 11 Nov 2026 a file's allowance
  // (1 GiB) is far below the bundle's (5 GiB), so it bounds the buffer inflate asks for.
  const maximum = Math.min(options.maximum ?? BUNDLE.uncompressedBytesMax, BUNDLE.uncompressedBytesMax, BUNDLE.fileBytesMax,
    file.size * BUNDLE.compressionRatioMax);
  if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > BUNDLE.uncompressedBytesMax || maximum < 0) refuse("engine_archive_byte_limit");
  const source = await file.bytes!();
  if (source.length !== file.size) refuse("engine_archive_size_mismatch");
  const inflate = options.inflate ?? inflateRawRuntime;
  let complete: boolean;
  let expandedBytes = source.length, memberCount = 0;
  if (format === "swf") {
    if (source.length < 8) refuse("engine_archive_truncated");
    if (signature(source, "ZWS")) refuse("engine_archive_not_inspected");
    let decoded = source;
    if (signature(source, "CWS")) {
      const expected = view(source).getUint32(4, true);
      if (source[3]! < 6 || expected < 8 || expected > maximum) refuse("engine_archive_byte_limit");
      const body = await inflate(source.subarray(8), "deflate", expected - 8);
      if (body.length !== expected - 8) refuse("engine_archive_size_mismatch");
      decoded = new Uint8Array(expected); decoded.set(source.subarray(0,8)); decoded.set([70,87,83]); decoded.set(body,8);
    }
    complete = validateSwf(decoded, maximum);
    expandedBytes = decoded.length;
  } else ({complete, expandedBytes, memberCount} = await validateJsdos(source, maximum, options.members ?? BUNDLE.fileCountMax - 1, inflate));
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(source));
  return { engine: format === "swf" ? "ruffle" : "jsdos", format, path: file.path, bytes: source.length, expandedBytes, memberCount,
    sha256: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2,"0")).join(""), complete, manualReviewRequired: !complete };
}
