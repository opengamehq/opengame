# Loading in three.js

How the rules in `SKILL.md` map onto three.js and a Vite build. Class names are from
three.js addons (`three/addons/...`). Check them against the three.js version in your
`package.json`, since loader options move between releases.

## Compressed textures: KTX2 and Basis

Encode textures as KTX2 with Basis Universal supercompression, and load them with
`KTX2Loader`. The loader transcodes to whatever the GPU supports (BC on desktop, ASTC or
ETC on phones), so one file serves every device class.

```js
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

const ktx2 = new KTX2Loader()
  .setTranscoderPath('/basis/')   // copy node_modules/three/examples/jsm/libs/basis/ here
  .detectSupport(renderer);       // for WebGPURenderer, after `await renderer.init()`
```

- ETC1S is small and soft; UASTC is larger and sharp. AW measured ETC1S good enough for
  its normals at a sixth of UASTC's bytes (see `opengame-performance`). Measure per class.
- Phones need lower top mips as well as a different transcode target. Ship a mip-trimmed
  file per device class and pick it from the manifest, so a phone does not download mips
  it will throw away (see `opengame-mobile`).
- Encode with `gltf-transform` (`--texture-compress ktx2`) or KTX-Software's `toktx`.

## Geometry: meshopt or Draco

Both shrink glTF geometry. Meshopt decodes faster and also compresses animation and
morph targets; Draco often makes smaller static meshes. Pick by measuring your models.

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const draco = new DRACOLoader().setDecoderPath('/draco/');
const gltf = new GLTFLoader()
  .setKTX2Loader(ktx2)
  .setDRACOLoader(draco)
  .setMeshoptDecoder(MeshoptDecoder);
```

`gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress ktx2` does
both passes in one command. Compare the result side by side with the source under the
same light before shipping it; quantisation can move vertices on thin parts.

## LoadingManager, staged

`LoadingManager.onProgress(url, itemsLoaded, itemsTotal)` counts files, not bytes. One
large model and fifty icons then weigh the same, which is how a bar stops at 60% and jumps
to 100%. Use one manager per tier (boot, first use, rest) so each tier has its own
`onLoad`, and drive the bar from bytes:

- Take each file's size from your manifest. The per-file `onProgress` event from
  `GLTFLoader.load` reports `loaded` and `total`, but with Brotli or gzip on the wire
  `total` is the compressed `Content-Length` while `loaded` counts decoded bytes, and
  `total` is 0 when the header is missing. Recent `FileLoader` versions read an
  `X-File-Size` header first when the server sends one. Manifest sizes avoid all of it.
- Add fixed weights for work that is not a download: `renderer.compileAsync(scene,
  camera)` for shaders, PMREM environment maps, building instanced scenes.
- `manager.setURLModifier` maps logical names to hashed URLs from the manifest.
- `manager.onError` fires per failed URL. Retry from there (or from your own fetch
  wrapper) instead of letting the tier wait forever.

Three.js loaders do not retry. For retries, timeouts and a priority order, fetch the
bytes yourself and hand them to `GLTFLoader.parse(arrayBuffer, path, onLoad, onError)`.

## Vite: hashed assets

Vite puts a content hash in the name of every asset it processes: files imported from
JavaScript, referenced from CSS or HTML, or imported with `?url`.

```js
import gunUrl from './assets/guns/rifle.glb?url';   // -> /assets/rifle-3f9a1c2b.glb
gltf.load(gunUrl, onLoad);
```

- Files in `public/` are copied as they are, with no hash. Move cacheable assets out of
  `public/`, or hash them in your own build step, or the long cache rule cannot apply.
- `build.manifest: true` writes `.vite/manifest.json`, which maps source paths to hashed
  output. Join it with your request log to build the runtime manifest.
- Vite inlines small assets as data URLs below `build.assetsInlineLimit`. Set it to 0 for
  game assets so each one is cached on its own.
- Vite does not write Brotli or gzip siblings. A post-build script with Node's
  `zlib.brotliCompressSync` and `zlib.gzipSync` over `dist/` does; skip files that are
  already compressed (KTX2, images, audio) unless measuring shows a gain.
- Vite adds `<link rel="modulepreload">` for the entry's imports. Add `<link
  rel="preload">` by hand for the boot-tier key art and title music.

## Service worker

The HTTP cache can be evicted. A service worker that keeps hashed files in Cache Storage
makes a return visit nearly free:

- Cache first for hashed URLs, since a hashed file never changes.
- Network first for the entry document, so a deploy is picked up on the next visit.
- On `activate`, delete caches from older builds.
- `vite-plugin-pwa` (Workbox) generates the precache list from the build; a short
  worker of your own works as well.

Watch memory when writing to the cache from the page, which matters on a phone. One
common way to double it: `response.clone()` splits the body into two streams, and if the game reads its
copy into an `ArrayBuffer` while the cache copy is still being written, both copies sit
in memory. Let the service worker do the caching from its own fetch handler, and measure
tab memory with the cache on and off.

## Upload and memory

- `ImageBitmapLoader` decodes images off the main thread. After the GPU upload, close
  the bitmap so its CPU copy is freed (see `opengame-mobile` for when that is safe).
- Call `dispose()` on geometries, materials and textures you unload, and watch
  `renderer.info.memory` fall.
- `renderer.compileAsync` before the menu lifts keeps shader links out of play (see
  `opengame-performance`).
