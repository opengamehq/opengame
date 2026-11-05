import { parseScript } from './script-source';
import { parse as parseHtml, type DefaultTreeAdapterTypes } from 'parse5';
import { LIMITS, compiledCredentialPatterns } from '@opengame/shared';
import type { PreflightFile, PreflightResult } from './index';
import { compressedBrowserAsset } from './names';

export type TextRecord = { path: string; kind: 'script-string' | 'module' | 'html-text' | 'html-attribute' | 'data'; text: string; part: number };
type AstNode = { type: string; [key: string]: unknown };
const ast = (value: unknown): value is AstNode => !!value && typeof value === 'object' && 'type' in value;
const CAPS = LIMITS.platform.textReview;
// A filename is not evidence of binary content. Require the matching format
// signature; opaque .bin and ASCII-capable formats remain text candidates.
function binaryFormat(path: string, bytes: Uint8Array): boolean {
  const ext = path.split('.').pop()?.toLowerCase();
  const ascii = (offset: number, value: string) => [...value].every((char, index) => bytes[offset + index] === char.charCodeAt(0));
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  switch (ext) {
    case 'png': return starts(137, 80, 78, 71, 13, 10, 26, 10);
    case 'jpg': case 'jpeg': return starts(255, 216, 255);
    case 'gif': return ascii(0, 'GIF87a') || ascii(0, 'GIF89a');
    case 'webp': return ascii(0, 'RIFF') && ascii(8, 'WEBP');
    case 'wav': return ascii(0, 'RIFF') && ascii(8, 'WAVE');
    case 'ogg': case 'opus': return ascii(0, 'OggS');
    case 'mp3': return ascii(0, 'ID3') || (bytes[0] === 255 && (bytes[1] & 224) === 224);
    case 'mp4': case 'm4a': case 'avif': return ascii(4, 'ftyp');
    case 'webm': return starts(26, 69, 223, 163);
    case 'woff': return ascii(0, 'wOFF');
    case 'woff2': return ascii(0, 'wOF2');
    case 'ttf': return starts(0, 1, 0, 0);
    case 'otf': return ascii(0, 'OTTO');
    case 'wasm': return starts(0, 97, 115, 109, 1, 0, 0, 0);
    case 'glb': return ascii(0, 'glTF') && bytes[4] === 2;
    case 'fbx': return ascii(0, 'Kaydara FBX Binary  \x00\x1a\x00');
    case 'ktx': case 'ktx2': return starts(171, 75, 84, 88, 32);
    case 'dds': return ascii(0, 'DDS ');
    case 'exr': return starts(118, 47, 49, 1);
    case 'bmp': return ascii(0, 'BM');
    default: return false;
  }
}

/** Private classifier input. Call only after the authoritative credential check.
 * Coverage describes parsing, not model review. An incomplete document can never
 * stand in for the portion that could not be read or parsed. */
export async function collectTextEvidence(files: PreflightFile[], preflight: PreflightResult) {
  const credentials = compiledCredentialPatterns("content");
  const records: TextRecord[] = [];
  const coverage: { path: string; required: boolean; inspected: boolean }[] = [];
  let chars = 0;
  let complete = true;
  const reasons = new Set<string>();
  // Which files hid a key behind escaping, so the secrets check can name them.
  // Paths only: the matched text never leaves this function.
  const credentialPaths = new Set<string>();
  const fail = (reason: string) => { complete = false; reasons.add(reason); };
  const add = (path: string, kind: TextRecord['kind'], text: string) => {
    if (!text.trim()) return;
    if (credentials.some(({ re }) => re.test(text))) { credentialPaths.add(path); fail('decoded_credential'); return; }
    chars += text.length;
    if (chars > CAPS.sourceCharsMax) { fail('source_limit'); return; }
    let start = 0;
    let part = 0;
    while (start < text.length) {
      if (records.length >= CAPS.recordsMax) { fail('record_limit'); return; }
      let end = Math.min(start + CAPS.recordCharsMax, text.length);
      if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]) && /[\uDC00-\uDFFF]/.test(text[end])) end--;
      records.push({ path, kind, text: text.slice(start, end), part: part++ });
      start = end;
    }
  };
  const script = (path: string, source: string) => {
    const root = parseScript(source);
    if (!root) { fail('script_parse'); return false; }
    const pending: AstNode[] = [root];
    while (pending.length) {
      const n = pending.pop()!;
      if (n.type === 'Literal' && typeof n.value === 'string') add(path, 'script-string', n.value);
      if (n.type === 'TemplateElement' && n.value && typeof n.value === 'object') {
        const value = n.value as { cooked?: unknown; raw?: unknown };
        add(path, 'script-string', String(value.cooked ?? value.raw ?? ''));
      }
      if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression'].includes(n.type)
        && ast(n.source) && typeof n.source.value === 'string') add(path, 'module', n.source.value);
      for (const value of Object.values(n)) {
        if (Array.isArray(value)) { for (const child of [...value].reverse()) if (ast(child)) pending.push(child); }
        else if (ast(value)) pending.push(value);
      }
    }
    return true;
  };
  const html = (path: string, source: string) => {
    let inspected = true;
    const pending: DefaultTreeAdapterTypes.Node[] = [parseHtml(source)];
    while (pending.length) {
      const n = pending.pop()!;
      if ('tagName' in n) {
        for (const attribute of n.attrs) {
          add(path, 'html-attribute', `${attribute.name}=${attribute.value}`);
          if (/^on[a-z]+$/.test(attribute.name)) inspected = script(path, attribute.value) && inspected;
        }
        if (n.tagName === 'script') {
          const source = n.childNodes.filter(child => 'value' in child).map(child => (child as DefaultTreeAdapterTypes.TextNode).value).join('');
          const type = n.attrs.find(attr => attr.name === 'type')?.value.trim().toLowerCase() ?? '';
          if (['', 'module', 'text/javascript', 'application/javascript', 'text/ecmascript', 'application/ecmascript'].includes(type)) inspected = script(path, source) && inspected;
          else add(path, 'data', source);
          continue;
        }
        // Template contents have their own fragment and are absent from childNodes.
        if ('content' in n) pending.push((n as DefaultTreeAdapterTypes.Template).content);
      }
      if ('value' in n) add(path, 'html-text', n.value);
      if ('childNodes' in n) pending.push(...[...n.childNodes].reverse());
    }
    return inspected;
  };
  const included = new Set(preflight.include);
  const selected = files.filter(file => included.has(file.path.slice(preflight.strippedRoot.length)));
  const scan = preflight.credentialScan;
  const rawFiles = selected.filter(file => /\.(?:swf|jsdos)$/i.test(file.path));
  const rawReceipts = new Map((preflight.rawRuntimes ?? []).map(row => [row.path, row]));
  const deferredAssets = preflight.externalAssets ?? [];
  const external = new Map(deferredAssets.map(row => [row.path, row]));
  // Raw parser receipts establish which bytes the pipeline must inspect next.
  // They may let us collect the accompanying text, never pass the secrets gate.
  const deferredOnlyIncomplete = scan?.complete === false && scan.blocked === false && scan.policyVersion === '1' &&
    (rawFiles.length > 0 || external.size > 0) && external.size === deferredAssets.length &&
    deferredAssets.every(row => /^[a-f0-9]{64}$/.test(row.sha256) && Number.isSafeInteger(row.byteSize) && row.byteSize >= 0 &&
      selected.filter(file => file.path.slice(preflight.strippedRoot.length) === row.path && file.size === row.byteSize).length === 1) &&
    rawReceipts.size === rawFiles.length && (preflight.rawRuntimes?.length ?? 0) === rawFiles.length &&
    rawFiles.every(file => {
      const row = rawReceipts.get(file.path.slice(preflight.strippedRoot.length));
      return row?.complete === true && row.manualReviewRequired === false && row.bytes === file.size &&
        (row.format === 'swf' ? /\.swf$/i.test(file.path) && row.engine === 'ruffle'
          : row.format === 'jsdos' && /\.jsdos$/i.test(file.path) && row.engine === 'jsdos') &&
        /^[a-f0-9]{64}$/.test(row.sha256);
    }) && scan.files.length === selected.length && new Set(scan.files.map(row => row.path)).size === selected.length &&
    Number.isSafeInteger(scan.expectedFiles) && scan.inspectedFiles === scan.expectedFiles - external.size &&
    scan.expectedFiles === scan.files.filter(row => row.required).length &&
    scan.files.every(row => external.has(row.path) ? row.required && !row.inspected : !row.required || row.inspected) &&
    scan.files.filter(row => external.has(row.path)).length === external.size;
  if (!scan || (scan.complete !== true && !deferredOnlyIncomplete) || (external.size > 0 && !deferredOnlyIncomplete) || scan.blocked || !preflight.ok ||
      preflight.findings.some(row => row.severity === 'blocker')) {
    return { version: 1, complete: false, reasons: ['preflight_not_clear'], files: coverage, records, credentialPaths: [] as string[] };
  }
  const policy = new Map(scan.files.map(row => [row.path, row]));
  if (selected.length !== policy.size) fail('file_inventory');
  for (const file of selected.sort((a, b) => a.path.localeCompare(b.path, 'en'))) {
    const path = file.path.slice(preflight.strippedRoot.length);
    const rule = policy.get(path);
    const row = { path, required: true, inspected: false };
    coverage.push(row);
    if (!rule) { fail('file_inventory'); continue; }
    if (deferredOnlyIncomplete && (rawReceipts.has(path) || external.has(path))) {
      row.required = false;
      continue;
    }
    try {
      let source: string;
      const compressed = compressedBrowserAsset(path);
      if (compressed) {
        if (!file.decodedText) throw new Error('compressed_reader');
        source = await file.decodedText();
        if (/\.wasm$/i.test(compressed.path) && source.startsWith('\x00asm\x01\x00\x00\x00')) {
          row.required = false;
          continue;
        }
      } else if (file.bytes) {
        const bytes = await file.bytes();
        try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
        catch (error) {
          if (!binaryFormat(path, bytes)) throw error;
          row.required = false;
          continue;
        }
      } else source = await file.text();
      const sourcePath = compressed?.path ?? path;
      if (/\.html?$/i.test(sourcePath)) row.inspected = html(path, source);
      else if (/\.(?:js|mjs|cjs)$/i.test(sourcePath)) row.inspected = script(path, source);
      else { add(path, 'data', source); row.inspected = true; }
    } catch (error) {
      fail(error && typeof error === 'object' && 'code' in error && error.code === 'ERR_ENCODING_INVALID_ENCODED_DATA'
        ? 'source_encoding' : 'source_read');
    }
    if (!row.inspected) complete = false;
  }
  // Never expose a tempting partial document after a budget or parser failure.
  return { version: 1, complete, reasons: [...reasons].sort(), files: coverage, records: complete ? records : [],
    ...(deferredOnlyIncomplete && external.size ? { externalAssetsDeferred: deferredAssets } : {}),
    credentialPaths: [...credentialPaths].sort() };
}
