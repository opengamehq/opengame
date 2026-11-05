import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/** The build packages these source bytes unchanged. Python only inserts escaped
 * JSON into the HTML data block; all browser behavior lives in runtime-shell.js. */
export function runtimeShellArtifacts() {
  const files = new Map();
  const rows = [];
  for (const [name, target] of [['runtime-shell.html', 'index.html'], ['runtime-shell.js', '_og/runtime-shell.js']]) {
    const data = readFileSync(new URL(name, import.meta.url));
    const sha256 = createHash('sha256').update(data).digest('hex');
    const path = `shells/${name}`;
    files.set(path, data);
    rows.push({ path, target, bytes: data.length, sha256,
      sourcePath: `scripts/engine-runtimes/${name}`, sourceSha256: sha256 });
  }
  return { files, receipt: { schemaVersion: 1, files: rows } };
}

/** Render the same inert settings token used by Python derivation. No runtime
 * behavior is generated here: the reviewed JavaScript is copied byte for byte.
 * Callers select and validate version/options against the frozen manifest first.
 */
export function renderRuntimeShell({ runtimeId, version, asset, options = {} }, artifacts = runtimeShellArtifacts()) {
  if (!['ruffle', 'jsdos'].includes(runtimeId) || typeof version !== 'string' || !/^[a-zA-Z0-9._-]+$/.test(version)
      || typeof asset !== 'string' || !asset || asset.startsWith('/')
      || /[\\\u0000-\u001f\u007f:#?%]/.test(asset) || asset.split('/').some(part => !part || part === '.' || part === '..')
      || !asset.toLowerCase().endsWith(runtimeId === 'ruffle' ? '.swf' : '.jsdos')
      || !options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Invalid runtime shell settings');
  const allowed = runtimeId === 'ruffle'
    ? { letterbox: ['off', 'fullscreen', 'on'], autoplay: ['off', 'on'] }
    : { autoStart: [false, true], renderBackend: ['webgl', 'canvas'],
        renderAspect: ['AsIs', '1/1', '5/4', '4/3', '16/10', '16/9', 'Fit'], imageRendering: ['pixelated', 'smooth'] };
  if (Object.entries(options).some(([key, value]) => !Object.hasOwn(allowed, key) || !allowed[key].includes(value)))
    throw new Error('Invalid runtime shell options');
  const data = JSON.stringify({ runtimeId, prefix: `/_og/runtime/${runtimeId}@${version}/`,
    source: '/' + asset.split('/').map(encodeURIComponent).join('/'), options })
    .replace(/[<>&]/g, character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));
  const output = new Map();
  const expected = new Map([['shells/runtime-shell.html', 'index.html'], ['shells/runtime-shell.js', '_og/runtime-shell.js']]);
  if (artifacts.receipt?.schemaVersion !== 1 || artifacts.receipt.files?.length !== expected.size)
    throw new Error('Invalid runtime shell receipt');
  for (const row of artifacts.receipt.files) {
    const target = expected.get(row.path), bytes = artifacts.files.get(row.path);
    if (!target || row.target !== target || !Buffer.isBuffer(bytes) || bytes.length !== row.bytes
        || createHash('sha256').update(bytes).digest('hex') !== row.sha256 || row.sourceSha256 !== row.sha256
        || row.sourcePath !== `scripts/engine-runtimes/${row.path.split('/').at(-1)}`)
      throw new Error('Runtime shell identity mismatch');
    expected.delete(row.path);
    if (target === 'index.html') {
      const template = bytes.toString('utf8');
      if (template.split('__OG_RUNTIME_SETTINGS__').length !== 2) throw new Error('Invalid runtime shell template');
      output.set(target, Buffer.from(template.replace('__OG_RUNTIME_SETTINGS__', () => data)));
    } else output.set(target, Buffer.from(bytes));
  }
  return output;
}
