const invalid = (): never => { throw new Error("Invalid deflate frame"); };

/** Reads only the requested bits, so a Huffman lookup cannot consume the footer
 * or hide an extra byte after the final block. */
class BitReader {
  private bit = 0;

  constructor(
    private readonly bytes: Uint8Array,
    private at: number,
    private readonly end: number,
  ) {}

  read(width: number): number {
    let value = 0;
    let shift = 0;
    while (width > 0) {
      if (this.at >= this.end) invalid();
      const take = Math.min(width, 8 - this.bit);
      value |= ((this.bytes[this.at]! >>> this.bit) & ((1 << take) - 1)) << shift;
      this.bit += take;
      if (this.bit === 8) { this.at++; this.bit = 0; }
      width -= take;
      shift += take;
    }
    return value;
  }

  align(): void {
    if (this.bit) { this.at++; this.bit = 0; }
  }

  skipBytes(length: number): void {
    if (this.bit || length > this.end - this.at) invalid();
    this.at += length;
  }

  finished(): boolean {
    return this.at + (this.bit ? 1 : 0) === this.end;
  }
}

interface Huffman {
  counts: Uint16Array;
  symbols: Uint16Array;
  width: number;
}

function huffman(lengths: Uint8Array, kind: "codes" | "literals" | "distances"): Huffman {
  if (lengths.length > 288) invalid();
  const counts = new Uint16Array(16);
  let width = 0;
  for (const length of lengths) {
    if (length > 15) invalid();
    if (length) { counts[length]++; width = Math.max(width, length); }
  }
  if (kind === "literals" && !lengths[256]) invalid();

  // Incomplete trees are invalid except the one-bit, one-symbol literal or
  // distance alphabet. An empty distance alphabet is legal until a match uses it.
  let left = 1;
  for (let bits = 1; bits <= 15; bits++) {
    left = left * 2 - counts[bits]!;
    if (left < 0) invalid();
  }
  if (width === 0 ? kind !== "distances" : left > 0 && (kind === "codes" || width !== 1)) invalid();

  const offsets = new Uint16Array(16);
  for (let bits = 1; bits < 15; bits++) offsets[bits + 1] = offsets[bits]! + counts[bits]!;
  const symbols = new Uint16Array(lengths.length);
  for (let symbol = 0; symbol < lengths.length; symbol++) {
    const length = lengths[symbol]!;
    if (length) symbols[offsets[length]++] = symbol;
  }
  return { counts, symbols, width };
}

function decode(reader: BitReader, tree: Huffman): number {
  let code = 0;
  let first = 0;
  let index = 0;
  // Huffman codes appear most-significant-bit first even though other fields
  // use least-significant-bit order. Walk canonical ranges without a 2^15 table.
  for (let width = 1; width <= tree.width; width++) {
    code = code * 2 + reader.read(1);
    const count = tree.counts[width]!;
    if (code >= first && code < first + count) return tree.symbols[index + code - first]!;
    index += count;
    first = (first + count) * 2;
  }
  return invalid();
}

const fixedLiteralLengths = new Uint8Array(288);
fixedLiteralLengths.fill(8, 0, 144);
fixedLiteralLengths.fill(9, 144, 256);
fixedLiteralLengths.fill(7, 256, 280);
fixedLiteralLengths.fill(8, 280);
const fixedLiterals = huffman(fixedLiteralLengths, "literals");
const fixedDistances = huffman(new Uint8Array(32).fill(5), "distances");
const codeOrder = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
const lengthBase = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const lengthExtra = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const distanceBase = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const distanceExtra = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

function dynamicTrees(reader: BitReader): [Huffman, Huffman] {
  const literalCount = reader.read(5) + 257;
  const distanceCount = reader.read(5) + 1;
  const codeCount = reader.read(4) + 4;
  if (literalCount > 286) invalid();
  const codeLengths = new Uint8Array(19);
  for (let i = 0; i < codeCount; i++) codeLengths[codeOrder[i]!] = reader.read(3);
  const codes = huffman(codeLengths, "codes");
  const literalLengths = new Uint8Array(literalCount);
  const distanceLengths = new Uint8Array(distanceCount);
  const total = literalCount + distanceCount;
  let at = 0;
  let previous = 0;
  while (at < total) {
    const symbol = decode(reader, codes);
    let length = symbol;
    let repeat = 1;
    if (symbol === 16) {
      if (!at) invalid();
      length = previous;
      repeat = reader.read(2) + 3;
    } else if (symbol === 17) {
      length = 0;
      repeat = reader.read(3) + 3;
    } else if (symbol === 18) {
      length = 0;
      repeat = reader.read(7) + 11;
    }
    if (repeat > total - at) invalid();
    previous = length;
    while (repeat-- > 0) {
      if (at < literalCount) literalLengths[at] = length;
      else distanceLengths[at - literalCount] = length;
      at++;
    }
  }
  return [huffman(literalLengths, "literals"), huffman(distanceLengths, "distances")];
}

/** Checks RFC 1951 framing and counts expanded bytes without materializing them.
 * The caller must still inflate and check integrity (including zlib's Adler-32).
 * Input size is bounded upstream; all parser tables have fixed format bounds. */
export function validateDeflateFrame(bytes: Uint8Array, format: "deflate" | "deflate-raw", maximum: number): number {
  if (!Number.isSafeInteger(maximum) || maximum < 0) invalid();
  let start = 0;
  let end = bytes.length;
  let window = 32768;
  if (format === "deflate") {
    if (bytes.length < 6) invalid();
    const cmf = bytes[0]!;
    const flags = bytes[1]!;
    if ((cmf & 15) !== 8 || (cmf >>> 4) > 7 || ((cmf << 8) | flags) % 31 || (flags & 32)) invalid();
    window = 1 << ((cmf >>> 4) + 8);
    start = 2;
    end -= 4;
  } else if (format !== "deflate-raw") invalid();

  const reader = new BitReader(bytes, start, end);
  let output = 0;
  const addOutput = (length: number): void => {
    if (length > maximum - output) throw new Error("Deflate output exceeds limit");
    output += length;
  };
  let final = 0;
  do {
    final = reader.read(1);
    const type = reader.read(2);
    if (type === 0) {
      reader.align();
      const length = reader.read(16);
      if ((length ^ reader.read(16)) !== 0xffff) invalid();
      reader.skipBytes(length);
      addOutput(length);
      continue;
    }
    if (type === 3) invalid();
    const [literals, distances] = type === 1 ? [fixedLiterals, fixedDistances] : dynamicTrees(reader);
    for (;;) {
      const symbol = decode(reader, literals);
      if (symbol < 256) { addOutput(1); continue; }
      if (symbol === 256) break;
      if (symbol > 285) invalid();
      const lengthIndex = symbol - 257;
      const length = lengthBase[lengthIndex]! + reader.read(lengthExtra[lengthIndex]!);
      const distanceSymbol = decode(reader, distances);
      if (distanceSymbol > 29) invalid();
      const distance = distanceBase[distanceSymbol]! + reader.read(distanceExtra[distanceSymbol]!);
      if (distance > output || distance > window) invalid();
      addOutput(length);
    }
  } while (!final);

  // Unused bits in the final byte are padding; an entire unused byte is data
  // after the stream, which native raw inflaters can otherwise silently ignore.
  if (!reader.finished()) invalid();
  return output;
}
