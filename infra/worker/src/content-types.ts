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
 * Files og-games compresses itself on the way out, by extension, when the bytes at rest are
 * the plain file and the browser takes br or gzip. index.ts says when, and what it leaves
 * alone.
 *
 * WHY HERE AND NOT IN THE EDGE'S LIST. Cloudflare compresses a response on its own only when
 * its type is on a list, and `application/octet-stream` is not on it. So Dragon Aces'
 * 16.8 MB `terrain-global.bin` went out whole (measured 9 Nov 2026), about 2 s of a 50 Mbps
 * line, while it is 3.3 MB as Brotli. The zone's compression rule
 * (scripts/cloudflare-games-compression.mjs) added glb, gltf, hza and ktx by extension, and
 * nothing else. Each new extension there was a dashboard change somebody had to make with a
 * token this repository does not hold, so `.bin`, `.data` and `.wav` waited. The rule has been
 * disabled since 9 Nov 2026, because it replaced this table's br with larger zstd for those
 * four, and this table now covers them. Deciding it
 * here puts the list in reviewed source with tests, the same as the type table above.
 *
 * WHAT IS ON IT: formats that are stored plain and shrink. Engine data blobs, WebAssembly,
 * glTF and uncompressed KTX, uncompressed PCM audio, and the text a game loads as data. Not
 * on it: anything already compressed inside its own format, where a second pass costs CPU
 * and saves nothing. That means images, lossy audio and video, woff and woff2, KTX2 and
 * Basis supercompression, Draco, the zip-shaped runtime packages, and Unity's .unityweb,
 * which is usually Brotli already. An extension this table has not been told about stays as
 * it is, so a new format is never compressed by guess. OG Clash's .qoa measured 91 to 100%
 * of its size under Brotli and is left off for that reason.
 *
 * Only the two codings the Workers runtime will actually produce are ever named
 * (binary-delivery.ts, transitEncoding): told `zstd`, workerd sends the plain bytes under a
 * zstd label, which no browser can decode.
 */
const COMPRESSED_IN_TRANSIT = new Set([
  // engine output and raw data
  "bin", "data", "mem", "symbols", "pck", "buffer", "dmanifest", "wasm",
  // 3D. hza is Kaigen's asset container (OG Clash), plain at rest, 10 to 53% smaller
  "glb", "gltf", "ktx", "hza", "fbx", "obj", "mtl",
  // uncompressed audio
  "wav",
  // text a game reads as code or data, never a document
  "js", "mjs", "cjs", "css", "json", "map", "txt", "xml", "webmanifest", "csv",
  "wgsl", "glsl", "vert", "frag", "atlas", "py", "lua", "ttf", "otf",
]);

export function compressedInTransit(path: string): boolean {
  return COMPRESSED_IN_TRANSIT.has(extensionOf(path));
}

/**
 * Generated art on the media host: the one place a stored type is read, and only to choose
 * among three inert raster types this file already names.
 *
 * The platform names a generated cover and its share card by job id, with no extension
 * (`media/<owner>/generated-cover/<id>`, `.../generated-share/<id>`), so the table above
 * has nothing to go on and both went out as `application/octet-stream`. Measured on 7 Nov
 * 2026: the R2 objects in og-public carried `image/png` and `image/webp`, matching their
 * bytes, and media.opengame.gg answered octet-stream for both, which link unfurlers refuse.
 * A creator chose none of those bytes or types: the Studio Worker's cover pipeline (which
 * stores the image provider's type), `lib/platform/art.ts` and `scripts/keyart-backfill.mjs`
 * are the only writers.
 *
 * Why the stored value can be consulted here without reopening the hole the header above
 * describes: the key shape is exact, the answer is one of png, jpeg or webp and nothing
 * else, and every media response carries `nosniff`. The worst a wrong stored value can do
 * is label bytes as a picture they are not, which a browser then fails to decode. Anything
 * outside the three, or any other key, gets `null` and the caller keeps the table's answer.
 * Never svg, which is a document with script in it.
 */
const GENERATED_ART =
  /^media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/generated-(?:cover|share)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const GENERATED_ART_TYPES = new Set([TYPES.png, TYPES.jpg, TYPES.webp]);

export function generatedArtType(path: string, stored: string | undefined): string | null {
  if (!GENERATED_ART.test(path)) return null;
  const type = stored?.split(";")[0]?.trim().toLowerCase() ?? "";
  return GENERATED_ART_TYPES.has(type) ? type : null;
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
