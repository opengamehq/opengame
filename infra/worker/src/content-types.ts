/**
 * Content types, decided here and nowhere else.
 *
 * R2 will happily hand back whatever `Content-Type` was set when the object was written,
 * and that value came -- however many steps removed -- from a zip somebody uploaded. So we
 * never read it. The extension is the only input, this table is the only authority, and
 * anything unrecognised gets `application/octet-stream` rather than a guess.
 *
 * The one that will cost you an afternoon if it is wrong is `.wasm`. `instantiateStreaming`
 * refuses anything that is not exactly `application/wasm`, and the failure surfaces as a
 * generic compile error a long way from the header that caused it.
 */

const TYPES: Record<string, string> = {
  // documents and code
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  cjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  webmanifest: "application/manifest+json",

  // the one that breaks instantiation when it is wrong
  wasm: "application/wasm",

  // 3D and texture formats a Three.js entry actually ships
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  ktx2: "image/ktx2",
  ktx: "image/ktx",
  basis: "application/octet-stream",
  hdr: "image/vnd.radiance",
  exr: "image/aces",
  obj: "text/plain; charset=utf-8",
  mtl: "text/plain; charset=utf-8",
  fbx: "application/octet-stream",
  drc: "application/octet-stream",
  bin: "application/octet-stream",

  // shaders
  wgsl: "text/plain; charset=utf-8",
  glsl: "text/plain; charset=utf-8",
  vert: "text/plain; charset=utf-8",
  frag: "text/plain; charset=utf-8",

  // images
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  bmp: "image/bmp",

  // audio and video
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  flac: "audio/flac",
  opus: "audio/ogg",
  mp4: "video/mp4",
  webm: "video/webm",

  // fonts
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",

  // engine output that is not a recognised media type but must not be sniffed
  data: "application/octet-stream",
  mem: "application/octet-stream",
  symbols: "application/octet-stream",
  unityweb: "application/octet-stream",
  pck: "application/octet-stream",
  // Runtime packages stay opaque unless their format has a browser media type.
  love: "application/octet-stream",
  jsdos: "application/octet-stream",
  arcd: "application/octet-stream",
  arci: "application/octet-stream",
  dmanifest: "application/octet-stream",
  buffer: "application/octet-stream",
  pak: "application/octet-stream",
  rpyc: "application/octet-stream",
  rpa: "application/octet-stream",
  py: "text/plain; charset=utf-8",
  lua: "text/plain; charset=utf-8",
  swf: "application/x-shockwave-flash",
  atlas: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  pdf: "application/pdf",
};

/**
 * Precompressed payloads. Emscripten and Unity both ship `game.wasm.br` and expect the
 * server to say "this is a wasm module, and it arrived brotli-compressed" -- the browser
 * then decompresses it and hands the real bytes to the wasm compiler. Serve it as
 * `application/x-brotli` and nothing works; serve it as `application/wasm` without the
 * encoding header and the compiler chokes on compressed bytes.
 */
const ENCODINGS: Record<string, string> = {
  br: "br",
  gz: "gzip",
  zst: "zstd",
};

export interface ResolvedType {
  contentType: string;
  /** Set as `Content-Encoding` when the bytes on disk are already compressed. */
  contentEncoding?: string;
}

const DEFAULT_TYPE = "application/octet-stream";

function extensionOf(path: string): string {
  const slash = path.lastIndexOf("/");
  const name = slash === -1 ? path : path.slice(slash + 1);
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "";
  return name.slice(dot + 1).toLowerCase();
}

export function resolveContentType(path: string): ResolvedType {
  const ext = extensionOf(path);

  const encoding = ENCODINGS[ext];
  if (encoding !== undefined) {
    // Strip the compression suffix and ask again, so `.wasm.br` resolves through the
    // wasm row rather than falling off the end of the table.
    const inner = path.slice(0, path.length - ext.length - 1);
    const innerExt = extensionOf(inner);
    return {
      contentType: TYPES[innerExt] ?? DEFAULT_TYPE,
      contentEncoding: encoding,
    };
  }

  return { contentType: TYPES[ext] ?? DEFAULT_TYPE };
}

/**
 * Whether this path is a document the browser will navigate to, which is the only kind of
 * request the top-level-navigation gate applies to. Subresources are never gated.
 *
 * Decided by the type it is served as, not by the last extension. `page.html.br` is served
 * as text/html with a Content-Encoding, and reading only "br" let it past the embed gate on
 * every host without a serving inventory: a creator's page opened top-level under our
 * certificate, which is the phishing shape the gate exists to refuse.
 */
export function isDocumentPath(path: string): boolean {
  return resolveContentType(path).contentType.startsWith("text/html");
}
