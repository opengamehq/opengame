/**
 * What a WebAssembly module declares about itself: the names it imports and the custom
 * sections it carries. engines.py `wasm_facts` is the same reader, and the registry
 * parity test feeds both the same bytes.
 *
 * WHY STRUCTURE AND NOT TEXT. The first Kaigen signature from a real export (22 Oct 2026)
 * matched three names in the JavaScript glue, and an adversarial review put those three
 * names in a comment beside an unrelated `.wasm` and got Kaigen ahead of Three.js. Engine
 * identity is about to decide a 4 GiB lane, so a name has to be something the module
 * actually imports, read out of its import section, and a custom section has to be a
 * section. Text can still point at which module to read; it can no longer decide.
 *
 * A module this cannot walk to its end answers null, never a partial list: half an import
 * section is not evidence of anything.
 *
 * WHY IT ALSO READS THE MEMORY FLAGS. Whether a build uses threads decides whether its
 * release is moved onto a cross-origin isolated contract (limits.json threadedMoves), and
 * until 27 Oct 2026 that was read from the JavaScript alone. The glue can hide it: Closure
 * renames `PThread` and `ENVIRONMENT_IS_PTHREAD`, emscripten quotes the `"shared"` key, a
 * Unity framework is minified. The module cannot hide it. Threads share one linear memory
 * between instances, so a threaded module imports a memory whose limits carry the shared
 * bit (0x02), and the browser will not hand it one outside an isolated document. A module
 * that defines a shared memory of its own cannot be instantiated there either, so both
 * count. Atomic opcodes (the 0xFE prefix) do not: they are legal on ordinary memory, they
 * need no isolation, and finding them means decoding every function body rather than
 * looking for a byte that also turns up inside immediates.
 */
export interface WasmFacts {
  path: string;
  /** Import field names, in order, whatever module they come from. */
  imports: string[];
  /** The module names those imports come from, each once, in first-seen order. Emscripten
   * imports only from `env` and `wasi_snapshot_preview1`, or from one module minified to
   * `a` at -O3, and no other toolchain here writes either shape beside its glue. */
  importModules: string[];
  /** Custom section names, in order. */
  customSections: string[];
  /** Whether a memory it imports or defines is shared, which only a threaded build needs. */
  sharedMemory: boolean;
}

export function wasmFacts(path: string, bytes: Uint8Array): WasmFacts | null {
  const n = bytes.length;
  if (n < 8 || bytes[0] !== 0 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d
    || bytes[4] !== 1 || bytes[5] !== 0 || bytes[6] !== 0 || bytes[7] !== 0) return null;
  let i = 8;
  const fail = () => { throw new RangeError("wasm"); };
  const byte = () => (i < n ? bytes[i++]! : fail());
  const leb = () => {
    let result = 0, shift = 0;
    for (;;) {
      const b = byte();
      result += (b & 0x7f) * 2 ** shift;
      if (!(b & 0x80)) return result;
      shift += 7;
      if (shift > 35) fail();
    }
  };
  const decoder = new TextDecoder("utf-8");
  const name = (end: number) => {
    const length = leb();
    if (i + length > end) fail();
    const text = decoder.decode(bytes.subarray(i, i + length));
    i += length;
    return text;
  };
  const limits = () => { const flags = byte(); leb(); if (flags & 1) leb(); return flags; };
  const valtype = () => { const t = byte(); if (t === 0x63 || t === 0x64) leb(); };
  const imports: string[] = [], importModules: string[] = [], customSections: string[] = [];
  let sharedMemory = false;
  try {
    while (i < n) {
      const id = byte();
      const size = leb();
      const end = i + size;
      if (end > n) return null;
      if (id === 0) customSections.push(name(end));
      else if (id === 2) {
        for (let count = leb(); count > 0; count--) {
          const from = name(end);
          if (!importModules.includes(from)) importModules.push(from);
          imports.push(name(end));
          const kind = byte();
          if (kind === 0) leb();
          else if (kind === 1) { valtype(); limits(); }
          else if (kind === 2) { if (limits() & 2) sharedMemory = true; }
          else if (kind === 3) { valtype(); byte(); }
          else if (kind === 4) { byte(); leb(); }
          else return null;
        }
        if (i !== end) return null;
      } else if (id === 5) {
        // The memory section: one limits per memory the module defines for itself. Read
        // for one flag only, so a section this cannot walk (a later proposal's extra field)
        // says nothing rather than discarding the imports engine detection already rests on.
        let shared = false;
        try { for (let count = leb(); count > 0; count--) if (limits() & 2) shared = true; } catch { shared = false; }
        if (i === end && shared) sharedMemory = true;
      }
      i = end;
    }
  } catch { return null; }
  return { path, imports, importModules, customSections, sharedMemory };
}

/** Whether a module carries a byte sequence, without decoding it to text. */
export function bytesInclude(bytes: Uint8Array, needle: string): boolean {
  const first = needle.charCodeAt(0);
  outer: for (let at = bytes.indexOf(first); at >= 0 && at + needle.length <= bytes.length; at = bytes.indexOf(first, at + 1)) {
    for (let k = 1; k < needle.length; k++) if (bytes[at + k] !== needle.charCodeAt(k)) continue outer;
    return true;
  }
  return false;
}
