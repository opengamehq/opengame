import { deflateSync } from "node:zlib";
import { zipSync } from "fflate";

/** Complete one-frame movie envelope: a nonempty RECT, frame rate/count,
 * ShowFrame and End. This exercises admission, not a playable-game verdict. */
export function rawMovie(compressed = false): Buffer {
  const bytes = Buffer.concat([Buffer.from("FWS\x09"), Buffer.alloc(4),
    Buffer.from([0x30, 0x0a, 0, 0xa0, 0, 12, 1, 0, 0x40, 0, 0, 0])]);
  bytes.writeUInt32LE(bytes.length, 4);
  if (!compressed) return bytes;
  const result = Buffer.concat([bytes.subarray(0, 8), deflateSync(bytes.subarray(8))]);
  result.write("CWS");
  return result;
}

/** An actual ZIP/config envelope, rather than a .jsdos suffix on opaque bytes. */
export function rawDos(): Buffer {
  return Buffer.from(zipSync({
    ".jsdos/dosbox.conf": Buffer.from("[sdl]\nfullscreen=false\n[autoexec]\nmount c .\nc:\nGAME.EXE\n"),
    "GAME.EXE": Buffer.from("MZ-fixture"),
  }, { level: 6 }));
}
