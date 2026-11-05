import { beginSdkBuild, unhashedSdkInputs, writeSdkBuildReceipt, writeSdkBundleWithNotices } from '../../scripts/engine-integrations/sdk-receipt.mjs';
import { build as esbuild } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
const packageBuildInputs = await beginSdkBuild(process.cwd());
/* Every bundle reports what it read, and one that read a repository file outside SDK_SOURCE
   fails here. The receipt hashes that list and check:deploys compares og-games against it,
   so a file outside it is a change neither would ever notice. */
async function build(options) {
  const result = await esbuild({ ...options, metafile: true });
  const unhashed = unhashedSdkInputs(process.cwd(), result.metafile);
  if (unhashed.length) throw new Error(`SDK build read files outside SDK_SOURCE (scripts/engine-integrations/sdk-receipt.mjs): ${unhashed.join(', ')}`);
  return result;
}
const limits = JSON.parse(await readFile('../shared/limits.json', 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const releaseVersion = process.env.OPENGAME_RELEASE_VERSION;
if (releaseVersion !== undefined && !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(releaseVersion)) throw new Error('OPENGAME_RELEASE_VERSION must be an exact x.y.z version');
// Gamepad activity and the input-message cadence belong to the separately packaged
// host runtime, infra/worker/src/game-audio.ts, which reads both from the same file.
// The SDK collector consumes the remaining runtime policy fields; a field it never
// reads would only be bytes in every game's core budget.
// Shared policy prose is documentation, not an input to migration behavior. Every
// `_`-prefixed key is a note (packages/shared/scripts/limits-values.mjs), not only
// `_comment`: a note added beside a number (`_requestsPerAddressNote`, 5 Nov 2026) shipped
// in the bundle and broke the CLI's typecheck and the template check.
const withoutNotes = (record) => Object.fromEntries(Object.entries(record).filter(([key]) => !key.startsWith('_')));
const { gamepadDeadzone: _hostGamepadDeadzone, inputIntervalMs: _hostInputIntervalMs, ...runtime } = withoutNotes(limits.analytics.runtime);
const config = {
  version: releaseVersion ?? pkg.version,
  externalLinkUrlCharsMax: limits.platform.sdk.externalLinkUrlCharsMax,
  externalLinkConfirmationMs: limits.platform.sdk.externalLinkConfirmationMs,
  leaderboards: { apiOrigin: limits.allowedGameOrigins.api, timeoutMs: limits.platform.sdk.scoreRequestTimeoutMs,
    responseBytesMax: limits.platform.sdk.scoreResponseBytesMax, manifestBytesMax: limits.platform.manifest.bytesMax,
    keyCharsMax: limits.platform.manifest.boardKeyCharsMax, boardCountMax: limits.platform.manifest.boardCountMax,
    readMax: limits.platform.sdk.scoreReadMax, readDefault: limits.platform.sdk.scoreReadDefault,
    radius: limits.platform.sdk.scoreAroundRadius, clampTolerance: limits.play.scoreClampTolerance,
    // Only policy fields belong in the game bundle. Shared-file explanations
    // otherwise become runtime strings even though validation never reads them.
    metaPolicy: { keys: limits.play.scoreMeta.keys, maxStringLength: limits.play.scoreMeta.maxStringLength,
      maxBytes: limits.play.scoreMeta.maxBytes, digitRunMin: limits.play.frameEventDigitRunMin } },
  parentOrigins: limits.platform.sdk.parentOrigins,
  developmentParentOrigins: limits.platform.sdk.developmentParentOrigins,
  rateWindowMs: limits.platform.sdk.rateWindowMs,
  handshakeRetryMs: limits.platform.sdk.handshakeRetryMs,
  eventPolicy: { numericBounds: limits.play.frameEventNumericBounds, keys: limits.play.frameEventPropertyKeys, bytesMax: limits.play.frameEventBytesMax, stringCharsMax: limits.play.frameEventStringCharsMax, digitRunMin: limits.play.frameEventDigitRunMin },
  handshakeTimeoutMs: limits.platform.sdk.handshakeTimeoutMs,
  sessionPendingTimeoutMs: limits.play.sessionRefreshTimeoutMs + limits.platform.sdk.handshakeRetryMs,
  runtime,
  eventBatchMs: limits.analytics.flushIntervalMs,
  batchMax: limits.analytics.batchEventsMax,
  batchBytesMax: limits.analytics.batchBytesMax,
  eventsMax: limits.analytics.eventsPerSessionMax,
  eventTimeoutMs: limits.analytics.requestTimeoutMs,
  achievementIdCharsMax: limits.analytics.achievementIdCharsMax,
  eventsPerMinute: limits.platform.sdk.eventsPerSessionPerMinute,
  eventNameMax: limits.play.frameEventNameMax,
  eventBytesMax: limits.play.frameEventBytesMax,
  eventKeys: limits.play.frameEventPropertyKeys,
  eventsApiOrigin: limits.allowedGameOrigins.api,
};
// Define each internal field so scalar bounds can fold into their call sites.
// Object and array policies still use esbuild's shared injected definitions;
// no public API or runtime policy is renamed or removed. Nested objects are
// defined at every depth as well, because esbuild matches the longest path
// first: `__SDK_CONFIG__.leaderboards.timeoutMs` folds to a number, while a
// read of the whole `leaderboards` object still gets the object. A key that is
// not an identifier cannot be a define path and esbuild refuses the build, so
// such a field (none today) is reachable only through its parent object.
const sdkDefines = {};
(function defineAll(path, value) {
  if (path) sdkDefines[path] = JSON.stringify(value);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (/^[A-Za-z_$][\w$]*$/.test(key)) defineAll(`${path || '__SDK_CONFIG__'}.${key}`, child);
    }
  }
})('', config);
const options = { entryPoints: ['src/index.ts'], bundle: true, platform: 'browser', target: 'es2022', minify: true,
  define: { __SDK_MAJOR__: String(Number(config.version.split('.')[0])), ...sdkDefines }, legalComments: 'none' };
// External legal comments may be absent even when dependencies need notices.
// Keep any esbuild extracts and append the installed dependency license texts;
// write:false prevents an old sidecar from masquerading as this build's output.
async function buildWithNotices(options) {
  const result = await build({ ...options, legalComments: 'external', metafile: true, write: false });
  await writeSdkBundleWithNotices(process.cwd(), result, options.outfile);
}
await mkdir('dist', { recursive: true });
await build({ ...options, format: 'esm', outfile: 'dist/index.js' });
await build({ ...options, entryPoints: ['src/global/core.ts'], format: 'iife', outfile: 'dist/opengame.js' });
/* Both single-file builds of the core are held to the budget: the ESM one is what a
   bundler-less module script imports, and it went unmeasured while the IIFE was checked. */
const bytes = gzipSync(await readFile('dist/opengame.js')).byteLength;
const esmBytes = gzipSync(await readFile('dist/index.js')).byteLength;
for (const [name, size] of [['opengame.js', bytes], ['index.js', esmBytes]]) {
  if (size > limits.platform.sdk.coreGzipBytesMax) throw new Error(`SDK core ${name} exceeds its gzip budget: ${size} > ${limits.platform.sdk.coreGzipBytesMax}`);
}
await writeFile('dist/size.json', JSON.stringify({ gzipBytes: bytes, esmGzipBytes: esmBytes, budget: limits.platform.sdk.coreGzipBytesMax })+'\n');
console.log(`SDK core: ${bytes} bytes gzip (IIFE), ${esmBytes} (ESM)`);

/* The og-platform.js adapter: one self-contained ES module, the core inside it, so a game
   swaps its old js/og-platform.js for this file and nothing else. See src/og-platform.ts. */
await build({ ...options, entryPoints: ['src/og-platform.ts'], format: 'esm', outfile: 'dist/og-platform.js' });
/* The adapter carries the whole core, so it has its own budget: the core's plus what the
   old protocol's extra parts (activity rest, the frame governor, lobby tickets) cost. It
   went unmeasured, and sat 300 bytes over the core budget, until 5 Oct 2026. */
const adapterBytes = gzipSync(await readFile('dist/og-platform.js')).byteLength;
if (adapterBytes > limits.platform.sdk.adapterGzipBytesMax) throw new Error(`og-platform.js exceeds its gzip budget: ${adapterBytes} > ${limits.platform.sdk.adapterGzipBytesMax}`);
console.log(`og-platform.js adapter: ${adapterBytes} bytes gzip`);

const sdk = limits.platform.sdk;

/* The avatar helper names colours, and the tables it names them from belong to the mascot
   renderer in packages/ui and the outfit catalogue in packages/shared. They are read out of
   that source here, at build time, rather than copied into the SDK where they would drift
   the first time somebody adds a colour. The entry is separate from the core and the
   injected global, both of which are within a few dozen bytes of their budgets. */
const catalogues = await build({ entryPoints: ['avatar-catalogues.ts'], bundle: true, format: 'esm', platform: 'neutral', write: false, logLevel: 'silent' });
const { MASCOT_COLORS, RENAMED, CHARACTER_COLORS } = await import(`data:text/javascript;base64,${Buffer.from(catalogues.outputFiles[0].text).toString('base64')}`);
const avatarConfig = { heads: Object.fromEntries(MASCOT_COLORS.map(color => [color.id, color.swatch])),
  finishes: MASCOT_COLORS.filter(color => color.finish).map(color => color.id),
  cloth: Object.fromEntries(CHARACTER_COLORS.map(color => [color.id, color.hex])), renames: RENAMED,
  /* portraitUrl's address: the site that draws the portrait (the first parent origin is
     opengame.io itself), and the sizes and drawing version the route answers without a
     redirect, from the same limits.json keys the route reads. */
  portrait: { origin: limits.platform.sdk.parentOrigins[0], sizes: limits.portrait.sizes,
    size: limits.portrait.sizeDefault, version: limits.portrait.version } };
await build({ ...options, entryPoints: ['src/avatar.ts'], format: 'esm', outfile: 'dist/avatar.js',
  define: { ...options.define, __AVATAR_CONFIG__: JSON.stringify(avatarConfig) } });
const avatarBytes = gzipSync(await readFile('dist/avatar.js')).byteLength;
if (!Number.isSafeInteger(limits.platform.sdk.avatarGzipBytesMax)) throw new Error(`Set platform.sdk.avatarGzipBytesMax in limits.json from the measured avatar entry: ${avatarBytes} bytes gzip`);
if (avatarBytes > limits.platform.sdk.avatarGzipBytesMax) throw new Error(`avatar.js exceeds its gzip budget: ${avatarBytes} > ${limits.platform.sdk.avatarGzipBytesMax}`);
console.log(`avatar.js: ${avatarBytes} bytes gzip`);

/* Native exports and the platform's /_og/sdk.js use the complete global. */
await build({ ...options, entryPoints: ['src/bridge.ts'], format: 'esm', outfile: 'dist/bridge.js',
  external: ['./index.js'],
  define: { ...options.define, __BRIDGE_CONFIG__: JSON.stringify({ argsBytesMax: limits.platform.manifest.bytesMax }) } });
await buildWithNotices({ ...options, entryPoints: ['src/global/bridge.ts'], format: 'iife', outfile: 'dist/opengame-global.js',
  define: { ...options.define, __BRIDGE_CONFIG__: JSON.stringify({ argsBytesMax: limits.platform.manifest.bytesMax }) } });
const bridgeBytes = gzipSync(await readFile('dist/opengame-global.js')).byteLength;
await writeFile('dist/size.json', JSON.stringify({ gzipBytes: bytes, esmGzipBytes: esmBytes, budget: sdk.coreGzipBytesMax,
  bridgeGzipBytes: bridgeBytes, bridgeBudget: sdk.bridgeGzipBytesMax ?? null, avatarGzipBytes: avatarBytes, avatarBudget: sdk.avatarGzipBytesMax })+'\n');
console.log(`SDK full global: ${bridgeBytes} bytes gzip`);
// Leave the measured artifact and size available for the first integration, but
// never report a successful build without a shared, positive budget in place.
if (!Number.isSafeInteger(sdk.bridgeGzipBytesMax) || sdk.bridgeGzipBytesMax <= 0) {
  throw new Error(`Set platform.sdk.bridgeGzipBytesMax in limits.json from the measured full global: ${bridgeBytes} bytes gzip`);
}
if (bridgeBytes > sdk.bridgeGzipBytesMax) throw new Error(`SDK global exceeds its gzip budget: ${bridgeBytes} > ${sdk.bridgeGzipBytesMax}`);

// Private engine packages accept only artifacts bound to this completed build.
await writeSdkBuildReceipt(process.cwd(), { version: config.version, inputs: packageBuildInputs });
