import './lifecycle.js';

// wasm i32 crosses into JS as signed. Normalize pointers and sizes only after
// rejecting values that could never have come from a wasm32 ABI parameter.
export function wasm32Range(pointer, length, byteLength) {
  const word = value => {
    if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff)
      throw new RangeError('Invalid wasm32 pointer or length');
    return value >>> 0;
  };
  const start = word(pointer), size = word(length);
  if (size > 0x100000000 - start || start > byteLength || size > byteLength - start)
    throw new RangeError('OpenGame wasm range is out of bounds');
  return [start, size];
}

/** Instantiate with host.imports, then expose that instance through getInstance. */
export function createOpenGameImports(getInstance) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let client = null, attaching = false, generation = 0;
  const api = () => {
    if (!client) throw new Error('OpenGame Zig host is detached');
    return client;
  };
  const exports = () => getInstance().exports;
  const view = (pointer, length, instanceExports = exports()) => {
    const buffer = instanceExports.memory.buffer;
    const [start, size] = wasm32Range(pointer, length, buffer.byteLength);
    return new Uint8Array(buffer, start, size);
  };
  const read = (pointer, length) => decoder.decode(view(pointer, length));
  const copyOut = (bytes, pointer, capacity) => {
    const target = view(pointer, capacity);
    if (target.length) {
      if (target.length < bytes.length) throw new RangeError('OpenGame output buffer too small');
      target.set(bytes);
    }
    return bytes.length;
  };
  const detach = () => { generation++; const old = client; client = null; old?.close(); };
  return {
    imports: { opengame: {
      og_available: () => +(typeof window !== 'undefined' && !!globalThis.OpenGame?.bridge),
      og_attach() {
        if (client || attaching) throw new Error('OpenGame Zig host already attached');
        const started = ++generation;
        attaching = true;
        let next;
        try {
          next = globalThis.OpenGameNativeConnect((kind, id, name, json) => {
            // A callback can replace the active wasm instance. All allocations
            // and their finalizers must stay with the instance that received it.
            const target = exports();
            // Copy first: wasm allocation can grow memory and invalidate old views.
            const chunks = [encoder.encode(name), encoder.encode(json)];
            const allocated = [];
            try {
              for (const chunk of chunks) {
                const raw = chunk.length ? target.og_alloc(chunk.length) : 0;
                // Validate and record the allocation before accessing its memory,
                // so failure after a later allocation also frees earlier buffers.
                const pointer = wasm32Range(raw, 0, 0x100000000)[0];
                if (chunk.length && !pointer) throw new Error('OpenGame wasm allocation failed');
                allocated.push([pointer, chunk.length]);
                if (chunk.length) view(pointer, chunk.length, target).set(chunk);
              }
              // The host owns callback buffers on success and on a trap. Zig only
              // borrows them, so a panic cannot skip their deallocation.
              target.og_dispatch(+(kind === 'result'), id, ...allocated.flat());
            } finally {
              for (const [pointer, length] of allocated) target.og_free(pointer, length);
            }
          }, connected => { client = connected; });
        } finally { attaching = false; }
        if (generation !== started) next.close();
        else client = next;
      },
      og_detach: detach,
      og_request: (op, opLength, json, jsonLength) => api().request(read(op, opLength), read(json, jsonLength)),
      og_read: (which, pointer, capacity) => copyOut(encoder.encode(which === 0 ? api().env() : api().player()), pointer, capacity),
      og_ready: () => api().ready(),
    } },
    dispose: detach,
  };
}
