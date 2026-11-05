import test from "node:test";
import assert from "node:assert/strict";
import { constants, deflateRawSync, deflateSync, inflateRawSync, inflateSync } from "node:zlib";
import { validateDeflateFrame } from "../src/deflate-frame";

// Fixtures write fields in wire order. Fixed codes are spelled out from the
// format, independently of the parser's canonical-range decoder.
class Bits {
  private readonly data: number[] = [];
  private at = 0;

  field(value: number, width: number): this {
    for (let i = 0; i < width; i++) {
      const index = Math.floor(this.at / 8);
      this.data[index] = (this.data[index] ?? 0) | (((value >>> i) & 1) << (this.at % 8));
      this.at++;
    }
    return this;
  }

  code(value: number, width: number): this {
    for (let i = width - 1; i >= 0; i--) this.field((value >>> i) & 1, 1);
    return this;
  }

  align(): this {
    while (this.at % 8) this.field(0, 1);
    return this;
  }

  bytes(): Uint8Array { return Uint8Array.from(this.data); }
}

function fixedSymbol(bits: Bits, symbol: number): void {
  if (symbol <= 143) bits.code(0x30 + symbol, 8);
  else if (symbol <= 255) bits.code(0x190 + symbol - 144, 9);
  else if (symbol <= 279) bits.code(symbol - 256, 7);
  else bits.code(0xc0 + symbol - 280, 8);
}

function fixedBlock(symbols: number[], final = 1): Bits {
  const bits = new Bits().field(final, 1).field(1, 2);
  for (const symbol of symbols) fixedSymbol(bits, symbol);
  return bits;
}

function storedBlock(bits: Bits, data: Uint8Array, final: number): void {
  bits.field(final, 1).field(0, 2).align().field(data.length, 16).field(data.length ^ 0xffff, 16);
  for (const byte of data) bits.field(byte, 8);
}

const codeOrder = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
// A complete alphabet covering every code length and repeat instruction:
// thirteen four-bit symbols followed by six five-bit symbols.
const metaLengths = Array.from({ length: 19 }, (_, symbol) => symbol < 13 ? 4 : 5);

function canonicalSymbol(bits: Bits, lengths: number[], symbol: number): void {
  let code = 0;
  for (let width = 1; width <= 15; width++) {
    for (let candidate = 0; candidate < lengths.length; candidate++) {
      if (lengths[candidate] !== width) continue;
      if (candidate === symbol) { bits.code(code, width); return; }
      code++;
    }
    code *= 2;
  }
  throw new Error("Fixture symbol has no code");
}

function dynamicHeader(literalCount = 257, distanceCount = 1, alphabet = metaLengths): Bits {
  const bits = new Bits().field(1, 1).field(2, 2)
    .field(literalCount - 257, 5).field(distanceCount - 1, 5).field(15, 4);
  for (const symbol of codeOrder) bits.field(alphabet[symbol]!, 3);
  return bits;
}

function dynamicBlock(literals: number[], distances: number[], symbols: number[] = []): Uint8Array {
  const bits = dynamicHeader(literals.length, distances.length);
  for (const length of [...literals, ...distances]) canonicalSymbol(bits, metaLengths, length);
  for (const symbol of symbols) canonicalSymbol(bits, literals, symbol);
  return bits.bytes();
}

function wrapZlib(raw: Uint8Array, output: Uint8Array, cinfo = 7): Uint8Array {
  const cmf = (cinfo << 4) | 8;
  const flags = (31 - ((cmf << 8) % 31)) % 31;
  let a = 1, b = 0;
  for (const byte of output) { a = (a + byte) % 65521; b = (b + a) % 65521; }
  return Uint8Array.from([cmf, flags, ...raw, b >>> 8, b & 255, a >>> 8, a & 255]);
}

function rejects(bytes: Uint8Array, format: "deflate" | "deflate-raw" = "deflate-raw", maximum = 1_000_000): void {
  assert.throws(() => validateDeflateFrame(bytes, format, maximum), { message: "Invalid deflate frame" });
}

test("counts real stored, fixed and dynamic streams in either wrapper", () => {
  const output = Buffer.from("The quick brown fox jumps over the lazy dog. 0123456789\n".repeat(1500));
  for (const [options, blockType] of [
    [{ level: 0 }, 0],
    [{ strategy: constants.Z_FIXED }, 1],
    [{ level: 6 }, 2],
  ] as const) {
    const raw = deflateRawSync(output, options);
    assert.equal((raw[0]! >>> 1) & 3, blockType, "fixture must exercise the advertised block type");
    assert.equal(validateDeflateFrame(raw, "deflate-raw", output.length), output.length);
    assert.equal(validateDeflateFrame(deflateSync(output, options), "deflate", output.length), output.length);
  }
});

test("empty output, byte-offset input views and the inclusive maximum", () => {
  for (const format of ["deflate", "deflate-raw"] as const) {
    const compress = format === "deflate" ? deflateSync : deflateRawSync;
    assert.equal(validateDeflateFrame(compress(Buffer.alloc(0)), format, 0), 0);
    const output = Buffer.from("offset view");
    const compressed = compress(output);
    const padded = Buffer.concat([Buffer.from([99, 99]), compressed, Buffer.from([99])]);
    assert.equal(validateDeflateFrame(padded.subarray(2, -1), format, output.length), output.length);
    assert.throws(() => validateDeflateFrame(compressed, format, output.length - 1), { message: "Deflate output exceeds limit" });
  }
});

test("stored blocks validate complements, bounds and continuation", () => {
  const bits = new Bits();
  storedBlock(bits, Uint8Array.of(65, 66), 0);
  storedBlock(bits, Uint8Array.of(67), 1);
  const raw = bits.bytes();
  assert.equal(validateDeflateFrame(raw, "deflate-raw", 3), 3);
  assert.deepEqual(inflateRawSync(raw), Buffer.from("ABC"));
  const badComplement = raw.slice(); badComplement[3]! ^= 1;
  rejects(badComplement);
  rejects(raw.subarray(0, -1));
  assert.throws(() => validateDeflateFrame(raw, "deflate-raw", 2), { message: "Deflate output exceeds limit" });
});

test("Huffman blocks preserve history across block types and allow overlapping matches", () => {
  const bits = new Bits();
  storedBlock(bits, Uint8Array.of(65), 0);
  bits.field(1, 1).field(1, 2);
  fixedSymbol(bits, 285); // 258 bytes copied from the preceding stored block.
  bits.code(0, 5); // Distance one; overlapping copies are valid.
  fixedSymbol(bits, 256);
  const raw = bits.bytes();
  assert.equal(validateDeflateFrame(raw, "deflate-raw", 259), 259);
  assert.deepEqual(inflateRawSync(raw), Buffer.alloc(259, 65));
  assert.throws(() => validateDeflateFrame(raw, "deflate-raw", 258), { message: "Deflate output exceeds limit" });
});

test("accepts any unused final bits but rejects whole trailing bytes and concatenated streams", () => {
  assert.equal(validateDeflateFrame(Uint8Array.of(3, 0xfc), "deflate-raw", 0), 0);
  const output = Buffer.from("framed");
  for (const format of ["deflate-raw", "deflate"] as const) {
    const compress = format === "deflate" ? deflateSync : deflateRawSync;
    const raw = compress(output);
    for (const tail of [Buffer.from([0]), Buffer.from([255]), compress(output)]) {
      rejects(Buffer.concat([raw, tail]), format);
    }
    if (format === "deflate") rejects(Buffer.concat([raw.subarray(0, -4), Buffer.from([0]), raw.subarray(-4)]), format);
  }
});

test("rejects every truncated prefix of real compressed frames", () => {
  const output = Buffer.from("truncation fixture with repeated Huffman matches.\n".repeat(500));
  for (const format of ["deflate-raw", "deflate"] as const) {
    const raw = (format === "deflate" ? deflateSync : deflateRawSync)(output);
    for (let length = 0; length < raw.length; length++) rejects(raw.subarray(0, length), format);
  }
  rejects(fixedBlock([65]).bytes()); // No EOB; the residual padding cannot complete its code.
  rejects(fixedBlock([256], 0).bytes()); // A nonfinal block needs another block header.
});

test("rejects reserved block, literal and distance codes and impossible references", () => {
  rejects(Uint8Array.of(7));
  for (const symbol of [286, 287]) rejects(fixedBlock([symbol, 256]).bytes());
  for (const distance of [30, 31]) {
    const bits = fixedBlock([65, 257]); bits.code(distance, 5); fixedSymbol(bits, 256);
    rejects(bits.bytes());
  }
  const beforeOutput = fixedBlock([257]); beforeOutput.code(0, 5); fixedSymbol(beforeOutput, 256);
  rejects(beforeOutput.bytes());
  const tooFar = fixedBlock([65, 257]); tooFar.code(1, 5); fixedSymbol(tooFar, 256);
  rejects(tooFar.bytes());
});

test("validates CM, CINFO, FCHECK, FDICT and footer presence", () => {
  const raw = Uint8Array.of(3, 0);
  const valid = wrapZlib(raw, new Uint8Array());
  assert.equal(validateDeflateFrame(valid, "deflate", 0), 0);
  assert.equal(inflateSync(valid).length, 0);
  for (const cmf of [0x77, 0x88, 0xf8]) {
    const bad = valid.slice(); bad[0] = cmf; bad[1] = (31 - ((cmf << 8) % 31)) % 31;
    rejects(bad, "deflate");
  }
  const badCheck = valid.slice(); badCheck[1]! ^= 1; rejects(badCheck, "deflate");
  const dictionary = valid.slice();
  dictionary[1] = 32 + ((31 - (((dictionary[0]! << 8) | 32) % 31)) % 31);
  rejects(dictionary, "deflate");
  for (let missing = 1; missing <= 4; missing++) rejects(valid.subarray(0, -missing), "deflate");
  const checksum = valid.slice(); checksum[checksum.length - 1]! ^= 1;
  assert.equal(validateDeflateFrame(checksum, "deflate", 0), 0, "checksum validation belongs to the native inflater");
});

test("zlib's advertised window constrains distance independently of produced bytes", () => {
  for (const [distanceSymbol, history] of [[15, 256], [16, 257]] as const) {
    const bits = fixedBlock(Array.from({ length: history }, () => 65));
    fixedSymbol(bits, 257);
    bits.code(distanceSymbol, 5).field(distanceSymbol === 15 ? 63 : 0, distanceSymbol === 15 ? 6 : 7);
    fixedSymbol(bits, 256);
    const raw = bits.bytes();
    const output = Buffer.alloc(history + 3, 65);
    assert.equal(validateDeflateFrame(raw, "deflate-raw", output.length), output.length);
    assert.equal(validateDeflateFrame(wrapZlib(raw, output), "deflate", output.length), output.length);
    const smallWindow = wrapZlib(raw, output, 0);
    if (history === 256) assert.equal(validateDeflateFrame(smallWindow, "deflate", output.length), output.length);
    else rejects(smallWindow, "deflate");
  }
});

test("accepts literal-only dynamic trees with no distance alphabet", () => {
  const literals = new Array<number>(257).fill(0); literals[65] = 1; literals[256] = 1;
  const raw = dynamicBlock(literals, [0], [65, 65, 256]);
  assert.equal(validateDeflateFrame(raw, "deflate-raw", 2), 2);
  assert.deepEqual(inflateRawSync(raw), Buffer.from("AA"));
  const empty = new Array<number>(257).fill(0); empty[256] = 1;
  const emptyRaw = dynamicBlock(empty, [0], [256]);
  assert.equal(validateDeflateFrame(emptyRaw, "deflate-raw", 0), 0);
  assert.equal(inflateRawSync(emptyRaw).length, 0);
});

test("rejects a match using an empty dynamic distance tree", () => {
  const literals = new Array<number>(258).fill(0); literals[256] = 1; literals[257] = 1;
  rejects(dynamicBlock(literals, [0], [257]));
});

test("dynamic literal trees require EOB and valid complete or one-symbol codes", () => {
  const noEob = new Array<number>(257).fill(0); noEob[65] = 1; noEob[66] = 1;
  rejects(dynamicBlock(noEob, [0]));
  rejects(dynamicBlock(new Array<number>(257).fill(0), [0]));
  const oversubscribed = noEob.slice(); oversubscribed[256] = 1;
  rejects(dynamicBlock(oversubscribed, [0]));
  const incomplete = new Array<number>(257).fill(0); incomplete[65] = 2; incomplete[256] = 2;
  rejects(dynamicBlock(incomplete, [0]));
  const literals = new Array<number>(257).fill(0); literals[256] = 1;
  rejects(dynamicBlock(literals, [1, 1, 1]));
  rejects(dynamicBlock(literals, [2]));
  // The one-symbol exception still has only the code 0, not 1.
  const bits = dynamicHeader();
  for (const length of [...literals, 0]) canonicalSymbol(bits, metaLengths, length);
  bits.field(1, 1);
  rejects(bits.bytes());
});

test("bounds dynamic counts and rejects oversubscribed or incomplete meta alphabets", () => {
  rejects(dynamicHeader(287).bytes());
  rejects(dynamicHeader(288).bytes());
  const oversubscribed = new Array<number>(19).fill(0);
  oversubscribed[0] = 1; oversubscribed[1] = 1; oversubscribed[2] = 1;
  rejects(dynamicHeader(257, 1, oversubscribed).bytes());
  const incomplete = new Array<number>(19).fill(0); incomplete[0] = 1;
  rejects(dynamicHeader(257, 1, incomplete).bytes());
  rejects(dynamicHeader(257, 1, new Array<number>(19).fill(0)).bytes());
});

test("bounds repeat instructions before writing any code-length array", () => {
  const noPrevious = dynamicHeader(); canonicalSymbol(noPrevious, metaLengths, 16); noPrevious.field(0, 2);
  rejects(noPrevious.bytes());
  const overflow = dynamicHeader();
  for (let i = 0; i < 2; i++) { canonicalSymbol(overflow, metaLengths, 18); overflow.field(127, 7); }
  rejects(overflow.bytes()); // 276 zero lengths do not fit in 258 slots.
  for (const [symbol, extraWidth, extra] of [[16, 2, 0], [17, 3, 0], [18, 7, 0]] as const) {
    const bits = dynamicHeader();
    for (let i = 0; i < 257; i++) canonicalSymbol(bits, metaLengths, 0);
    canonicalSymbol(bits, metaLengths, symbol); bits.field(extra, extraWidth);
    rejects(bits.bytes());
  }
});

test("repeat codes can cross the literal/distance boundary", () => {
  // EOB has length one; length symbols 284/285 have length two. A repeat
  // starting at 285 then fills all four two-bit distance codes.
  const bits = dynamicHeader(286, 4);
  for (const count of [138, 118]) { canonicalSymbol(bits, metaLengths, 18); bits.field(count - 11, 7); }
  canonicalSymbol(bits, metaLengths, 1); // Literal symbol 256.
  canonicalSymbol(bits, metaLengths, 18); bits.field(27 - 11, 7);
  canonicalSymbol(bits, metaLengths, 2); // Literal symbol 284.
  canonicalSymbol(bits, metaLengths, 16); bits.field(5 - 3, 2);
  bits.code(0, 1); // EOB.
  const raw = bits.bytes();
  assert.equal(validateDeflateFrame(raw, "deflate-raw", 0), 0);
  assert.equal(inflateRawSync(raw).length, 0);
});

test("zero repeats and a one-symbol distance tree support real matches", () => {
  const literals = new Array<number>(258).fill(0);
  literals[65] = 1; literals[256] = 2; literals[257] = 2;
  const bits = dynamicHeader(258, 1);
  canonicalSymbol(bits, metaLengths, 17); bits.field(0, 3); // Three zeros.
  canonicalSymbol(bits, metaLengths, 18); bits.field(62 - 11, 7);
  canonicalSymbol(bits, metaLengths, 1); // Literal A.
  for (const count of [138, 52]) { canonicalSymbol(bits, metaLengths, 18); bits.field(count - 11, 7); }
  canonicalSymbol(bits, metaLengths, 2); // EOB.
  canonicalSymbol(bits, metaLengths, 2); // Length three.
  canonicalSymbol(bits, metaLengths, 1); // Distance one.
  canonicalSymbol(bits, literals, 65);
  canonicalSymbol(bits, literals, 257); bits.code(0, 1);
  canonicalSymbol(bits, literals, 256);
  const raw = bits.bytes();
  assert.equal(validateDeflateFrame(raw, "deflate-raw", 4), 4);
  assert.deepEqual(inflateRawSync(raw), Buffer.from("AAAA"));
});

test("accepts the largest raw back-reference distance and length", () => {
  const bits = new Bits();
  storedBlock(bits, new Uint8Array(32768).fill(65), 0);
  bits.field(1, 1).field(1, 2);
  fixedSymbol(bits, 285); // 258 bytes.
  bits.code(29, 5).field(8191, 13); // Distance 32768.
  fixedSymbol(bits, 256);
  const raw = bits.bytes();
  assert.equal(validateDeflateFrame(raw, "deflate-raw", 32768 + 258), 32768 + 258);
  assert.deepEqual(inflateRawSync(raw), Buffer.alloc(32768 + 258, 65));
});

test("counts high-ratio matches before any native decompression", () => {
  const raw = deflateRawSync(Buffer.alloc(1024 * 1024, 65));
  assert.ok(raw.length < 2048);
  assert.equal(validateDeflateFrame(raw, "deflate-raw", 1024 * 1024), 1024 * 1024);
  assert.throws(() => validateDeflateFrame(raw, "deflate-raw", 4096), { message: "Deflate output exceeds limit" });
});

test("rejects unusable output limits with a fixed error", () => {
  for (const maximum of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) rejects(Uint8Array.of(3, 0), "deflate-raw", maximum);
});
