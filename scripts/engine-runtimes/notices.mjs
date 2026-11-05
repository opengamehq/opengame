import { createHash } from 'node:crypto';
import { safePath } from './archives.mjs';

// Exact reviewed notice endpoints. Content hashes and selected notices remain
// in shared runtime pins; adding a URL here never selects it for an artifact.
const SOURCES = new Map([
  ["https://raw.githubusercontent.com/python/cpython/df793163d5821791d4e7caf88885a2c11a107986/Modules/expat/COPYING", { runtime: "pyodide", encoding: "raw" }],
  ["https://raw.githubusercontent.com/js-dos/emulators/6bbf0925d221a7304ea8e0dda1e89b8dc01569b2/LICENSE", {"runtime": "jsdos","encoding": "raw"}],
  ["https://raw.githubusercontent.com/js-dos/dosbox/528578d5a6f76afd4d5ef4e722b5670826f1183a/COPYING", {"runtime": "jsdos","encoding": "raw"}],
  ["https://raw.githubusercontent.com/js-dos/dosbox-x/788fde99d3d451eab3621009186e5abe516f2b9c/COPYING", {"runtime": "jsdos","encoding": "raw"}],
  ["https://raw.githubusercontent.com/ptitSeb/gl4es/a744af14d4afbda77bf472bc53f43b9ceba39cc0/LICENSE", {"runtime": "jsdos","encoding": "raw"}],
  ["https://raw.githubusercontent.com/floooh/sokol/fa3d7cbe9ca85b8b87824ac366c724cb0e33a6af/LICENSE", {"runtime": "jsdos","encoding": "raw"}],
  ["https://raw.githubusercontent.com/zloirock/core-js/v3.30.0/LICENSE", {"runtime": "jsdos","encoding": "raw"}],
  ["https://raw.githubusercontent.com/python/cpython/v3.14.2/LICENSE", {"runtime": "pyodide","encoding": "raw"}],
  ["https://raw.githubusercontent.com/python/cpython/v3.14.2/Doc/license.rst", {"runtime": "pyodide","encoding": "raw"}],
  ["https://raw.githubusercontent.com/pyodide/pyodide/b1e4fcc2488962f6360a97f19b9982d6fdb5d16f/src/js/vendor/stackframe/LICENSE", {"runtime": "pyodide","encoding": "raw"}],
  ["https://raw.githubusercontent.com/flutter/flutter/deb287481e3ce9468f3434937ced4240a70539ca/engine/src/flutter/sky/packages/sky_engine/LICENSE", {"runtime": "flutter-canvaskit","encoding": "raw"}],
  ["https://raw.githubusercontent.com/flutter/flutter/deb287481e3ce9468f3434937ced4240a70539ca/engine/src/flutter/LICENSE", {"runtime": "flutter-canvaskit","encoding": "raw"}],
  ["https://raw.githubusercontent.com/emscripten-ports/bzip2/1.0.6/LICENSE", {"runtime": "pyodide","encoding": "raw"}],
  ["https://raw.githubusercontent.com/emscripten-core/emscripten/5.0.3/LICENSE", {"runtime": "pyodide","encoding": "raw"}],
  ["https://raw.githubusercontent.com/pyodide/hiwire/6a1e67280a15d929ebeceee54a6358c9c8d5f697/LICENSE", {"runtime": "pyodide","encoding": "raw"}],
  ["https://raw.githubusercontent.com/libffi/libffi/f08493d249d2067c8b3207ba46693dd858f95db3/LICENSE", {"runtime": "pyodide","encoding": "raw"}],
  ["https://raw.githubusercontent.com/tukaani-project/xz/v5.2.2/COPYING", {"runtime": "pyodide","encoding": "raw"}],
  ["https://raw.githubusercontent.com/tukaani-project/xz/v5.2.2/COPYING.LGPLv2.1", {"runtime": "pyodide","encoding": "raw"}],
  ["https://raw.githubusercontent.com/madler/zlib/v1.3.1/LICENSE", {"runtime": "pyodide","encoding": "raw"}],
  ["https://raw.githubusercontent.com/python/cpython-source-deps/zstd-1.5.7/COPYING", {"runtime": "pyodide","encoding": "raw"}],
  ["https://raw.githubusercontent.com/python/cpython-source-deps/zstd-1.5.7/LICENSE", {"runtime": "pyodide","encoding": "raw"}],
  ["https://skia.googlesource.com/external/github.com/google/brotli/+/350100a5bb9d9671aca85213b2ec7a70a361b0cd/LICENSE?format=TEXT", {"runtime": "flutter-canvaskit","encoding": "base64"}],
  ["https://flutter.googlesource.com/third_party/freetype2/+/be4bcb57914154fc1b9e2900bf8e4b516057e2b8/LICENSE.TXT?format=TEXT", {"runtime": "flutter-canvaskit","encoding": "base64"}],
  ["https://flutter.googlesource.com/third_party/freetype2/+/be4bcb57914154fc1b9e2900bf8e4b516057e2b8/docs/FTL.TXT?format=TEXT", {"runtime": "flutter-canvaskit","encoding": "base64"}],
  ["https://flutter.googlesource.com/third_party/freetype2/+/be4bcb57914154fc1b9e2900bf8e4b516057e2b8/docs/GPLv2.TXT?format=TEXT", {"runtime": "flutter-canvaskit","encoding": "base64"}],
  ["https://flutter.googlesource.com/third_party/harfbuzz/+/49844c32a7a3f6be371355a1213c952a3f4a44e7/COPYING?format=TEXT", {"runtime": "flutter-canvaskit","encoding": "base64"}],
  ["https://chromium.googlesource.com/chromium/deps/icu/+/d578f2e8b7bd5938e21cfb6bf15c079e0aa5b738/LICENSE?format=TEXT", {"runtime": "flutter-canvaskit","encoding": "base64"}],
  ["https://flutter.googlesource.com/third_party/libjpeg-turbo/+/0fb821f3b2e570b2783a94ccd9a2fb1f4916ae9f/LICENSE.md?format=TEXT", {"runtime": "flutter-canvaskit","encoding": "base64"}],
  ["https://flutter.googlesource.com/third_party/libjpeg-turbo/+/0fb821f3b2e570b2783a94ccd9a2fb1f4916ae9f/README.ijg?format=TEXT", {"runtime": "flutter-canvaskit","encoding": "base64"}],
  ["https://flutter.googlesource.com/third_party/libpng/+/ced6b6c0c1e24716423a417b399d3c7d4623890d/LICENSE?format=TEXT", {"runtime": "flutter-canvaskit","encoding": "base64"}],
  ["https://chromium.googlesource.com/webm/libwebp/+/ca332209cb5567c9b249c86788cb2dbf8847e760/COPYING?format=TEXT", {"runtime": "flutter-canvaskit","encoding": "base64"}],
  ["https://chromium.googlesource.com/webm/libwebp/+/ca332209cb5567c9b249c86788cb2dbf8847e760/PATENTS?format=TEXT", {"runtime": "flutter-canvaskit","encoding": "base64"}],
  ["https://skia.googlesource.com/skia/+/8df24be66531469e576a806749a0202ae26b8d08/LICENSE?format=TEXT", {"runtime": "flutter-canvaskit","encoding": "base64"}],
  ["https://skia.googlesource.com/external/github.com/google/wuffs-mirror-release-c/+/600cd96cf47788ee3a74b40a6028b035c9fd6a61/LICENSE?format=TEXT", {"runtime": "flutter-canvaskit","encoding": "base64"}],
  ["https://chromium.googlesource.com/chromium/src/third_party/zlib/+/7eda07b1e067ef3fd7eea0419c88b5af45c9a776/LICENSE?format=TEXT", {"runtime": "flutter-canvaskit","encoding": "base64"}],
]);

export function approvedNoticeURL(value, runtime, encoding = "raw") {
  const reviewed = SOURCES.get(value);
  if (reviewed) {
    if (reviewed.runtime !== runtime || reviewed.encoding !== encoding) throw new Error("Unapproved runtime notice source");
    return value;
  }
  const url = new URL(value);
  const legacy = url.origin === "https://raw.githubusercontent.com" &&
    /^\/(?:pyodide\/pyodide|flutter\/flutter|caiiiycuk\/js-dos)\/[a-f0-9]{40}\/(?:LICENSE|LICENSE\.txt|COPYING)$/.test(url.pathname) ||
    value === "https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt";
  if (!legacy || url.username || url.password || url.search || url.hash || encoding !== "raw") throw new Error("Unapproved runtime license URL");
  return value;
}

export function validateNotice(notice, runtime, bounds) {
  if (!notice || typeof notice !== 'object') throw new Error('Invalid runtime notice');
  safePath(notice.path, bounds.pathBytesMax);
  if (typeof notice.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(notice.sha256)) throw new Error('Missing license digest');
  const encoding = notice.encoding ?? 'raw';
  if (!['raw', 'base64'].includes(encoding) || Boolean(notice.url) === Boolean(notice.source)) throw new Error('Invalid notice source/encoding');
  if (notice.url) {
    if (typeof notice.url !== 'string') throw new Error('Invalid notice URL');
    approvedNoticeURL(notice.url, runtime, encoding);
  }
  else {
    safePath(notice.source, bounds.pathBytesMax);
    if (encoding !== 'raw') throw new Error('Archive notices must be raw bytes');
  }
  if (notice.bytes !== undefined && (!Number.isSafeInteger(notice.bytes) || notice.bytes < 1 ||
      notice.bytes > Math.min(bounds.fileBytesMax, bounds.expandedBytesMax))) throw new Error('Invalid notice byte count');
  if (encoding === 'base64') {
    if (notice.bytes === undefined || typeof notice.transportSha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(notice.transportSha256) || !Number.isSafeInteger(notice.transportBytes) ||
        notice.transportBytes < 1 || notice.transportBytes > bounds.downloadBytesMax) throw new Error('Invalid notice transport identity');
  } else if (notice.transportSha256 !== undefined || notice.transportBytes !== undefined) {
    throw new Error('Raw notices must not declare a second transport identity');
  }
}

/** Gitiles sends base64 transport bytes. Check both identities and lengths,
 * and reject oversized output before decoding or accepting a cache entry. */
export function decodeNotice(transport, notice, bounds) {
  const digest = data => createHash("sha256").update(data).digest("hex");
  const maximum = Math.min(bounds.fileBytesMax, bounds.expandedBytesMax);
  if (transport.length > bounds.downloadBytesMax) throw new Error('Notice transport size limit');
  let data = transport;
  if (notice.encoding === "base64") {
    if (transport.length !== notice.transportBytes || digest(transport) !== notice.transportSha256) throw new Error("Notice transport identity mismatch");
    const text = transport.toString("utf8").replace(/[\t\r\n ]/g, "");
    if (!text || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) throw new Error("Invalid notice base64");
    const length = text.length / 4 * 3 - (text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0);
    if (length > maximum || length !== notice.bytes) throw new Error("Notice decoded size limit or mismatch");
    data = Buffer.from(text, "base64");
    if (data.toString("base64") !== text) throw new Error("Noncanonical notice base64");
  }
  if (!data.length || data.length > maximum || notice.bytes !== undefined && data.length !== notice.bytes) throw new Error("Notice size limit or mismatch");
  if (digest(data) !== notice.sha256) throw new Error("Notice SHA256 mismatch");
  if (data.includes(0)) throw new Error("Invalid license text");
  return data;
}
