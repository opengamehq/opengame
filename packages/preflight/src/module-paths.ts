import { parse as parseHtml } from "parse5";
import { parseScript, type ScriptNode } from "./script-source";
import type { Finding } from "./index";
import { precompressedAsset } from "./names";

type TextFile = { path: string; text: string };
type Import = { value: string; line: number; dynamic: boolean };
type HtmlNode = { tagName?: string; nodeName?: string; namespaceURI?: string; value?: string; attrs?: { name: string; value: string }[]; childNodes?: HtmlNode[] };
type ImportMap = { imports?: Record<string, unknown>; scopes?: Record<string, Record<string, unknown>> };
const LOCAL = /^(?:\.{1,2}\/|\/)/;
const REMOTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const host = "https://packaging.invalid/";
const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const SRCDOC_DEPTH = 4;

function localPath(value: string, from: string): string | null {
  try {
    const url = new URL(value, host + from);
    if (url.origin !== new URL(host).origin) return null;
    const decoded = decodeURIComponent(url.pathname).normalize("NFC");
    if (decoded.split("/").includes("..") || /[\\\u0000-\u001f\u007f]/.test(decoded)) return null;
    return decoded.slice(1);
  } catch { return null; }
}

function moduleUrl(value: string, from: string): string | null {
  try {
    const url = new URL(value, host + from);
    return url.origin === new URL(host).origin ? url.href : null;
  } catch { return null; }
}

function imports(text: string): Import[] {
  const tree = parseScript(text);
  if (!tree) return [];
  const found: Import[] = [];
  const pending: ScriptNode[] = [tree];
  while (pending.length) {
    const node = pending.pop()!;
    if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration", "ImportExpression"].includes(node.type)) {
      const source = node.source as ScriptNode | undefined;
      if (typeof source?.value === "string") found.push({ value: source.value, dynamic: node.type === "ImportExpression", line: text.slice(0, Number(source.start ?? 0)).split("\n").length });
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) { for (const child of value) if (child && typeof child === "object" && "type" in child) pending.push(child as ScriptNode); }
      else if (value && typeof value === "object" && "type" in value) pending.push(value as ScriptNode);
    }
  }
  return found;
}

function match(table: Record<string, unknown> | undefined, specifier: string, documentBase: string): { found: boolean; value?: string } {
  if (!table || typeof table !== "object" || Array.isArray(table)) return { found: false };
  const names = Object.keys(table).map(key => {
    return { key, normalized: LOCAL.test(key) ? moduleUrl(key, documentBase) : key };
  });
  const selected = names.filter(row => row.normalized !== null && (row.normalized === specifier || row.normalized.endsWith("/") && specifier.startsWith(row.normalized)))
    .sort((a, b) => b.normalized!.length - a.normalized!.length)[0];
  if (!selected) return { found: false };
  const target = table[selected.key];
  if (typeof target !== "string" || selected.normalized!.endsWith("/") && !target.endsWith("/")) return { found: true };
  return { found: true, value: target + (selected.normalized!.endsWith("/") ? specifier.slice(selected.normalized!.length) : "") };
}

/* Whether a <script type> makes an import map, the way the HTML standard and Chrome decide
   it: an ASCII case-insensitive match for "importmap", with NO whitespace trimmed. That is
   stricter than the JavaScript types below, which are trimmed. Measured in Chrome for
   Testing 151 on 23 Oct 2026: "IMPORTMAP" and "ImportMap" mapped a bare import, while
   " importmap ", "importmap ", a tab before it and a newline after it all left the import
   unresolved. Until then this compared the type exactly, so an upper-case map went unread
   and remapped imports past the check (independent review of #390, the same day). */
const isImportMapType = (type: string | undefined) =>
  type !== undefined && type.replace(/[A-Z]/g, letter => letter.toLowerCase()) === "importmap";

/* A file a build tool compiles and a browser does not: TypeScript in all its spellings,
   JSX, and single-file Vue and Svelte components. A page that hands one of these to the
   browser as a script is a project uploaded before its build step, and it opens blank,
   because the bytes arrive as something no JavaScript engine parses. A `.d.ts` matches
   too, which is right: it is no more runnable than any other `.ts`. */
const SOURCE_ONLY = /\.(?:[cm]?ts|tsx|jsx|vue|svelte)$/i;

/** Where a page's script or module preload lands, when what it lands on is source. The
 * query is judged by its path, which this said it must not be until a review on 31 Oct 2026:
 * on a dev server a query asks for a transform (Vite's `?import`), but on opengame.gg
 * nothing transforms, the Worker types a file by its pathname alone, and
 * `/src/main.ts?import` arrives as the same untyped bytes as `/src/main.ts`. A remote URL
 * is not a file here. */
function unbuiltSource(value: string, base: string): string | null {
  const target = localPath(value, base);
  return target !== null && SOURCE_ONLY.test(target) ? target : null;
}

/** Validate only executable module paths. An import in a comment or
 * unused file is not a browser dependency. Each HTML entry keeps its own import map,
 * so an unrelated editor's map cannot make a broken game appear complete. */
export function modulePathAnalysis(files: TextFile[], exact: Set<string>) {
  const documentBases = new Map<string, string>();
  const checkedSpecifiers = new Set<string>();
  /* Source files a page loads directly, by page. Reported by the caller rather than here,
     because only the entry document's answer decides anything, and because the sentence
     names the build tool, which needs the whole upload (index.ts, `buildAdvice`). */
  const sourceLoads: { document: string; target: string }[] = [];
  const source = new Map(files.map(file => [file.path, file.text]));
  const parsed = new Map<string, Import[]>();
  const findings: Finding[] = [];
  const seenFindings = new Set<string>();
  function finding(code: string, file: string, item: Import, message: string, detail: string) {
    const key = `${code}:${file}:${item.line}:${item.value}`;
    if (findings.length >= 8 || seenFindings.has(key)) return;
    seenFindings.add(key);
    findings.push({ code, severity: "blocker", title: message, detail, path: file, line: item.line });
  }
  /** A document-level blocker, once per key, inside the same cap of eight. */
  function push(code: string, path: string, key: string, title: string, detail: string) {
    const seen = `${code}:${key}`;
    if (findings.length >= 8 || seenFindings.has(seen)) return;
    seenFindings.add(seen);
    findings.push({ code, severity: "blocker", path, title, detail });
  }
  /* EVERY TARGET IN EVERY STATIC MAP MUST BE A FILE IN THIS GAME, whether or not any
     import reaches it. Reading which entry an import resolves through needs the referrer's
     exact URL, and the second and third reviews of #390 each found ways that reading goes
     wrong (a scope key percent-encoded, a module loaded with a query or a fragment, a
     <base>, duplicate keys that name one URL). A target judged on its own needs none of
     that. Targets are resolved the way the import maps standard parses them: one starting
     `/`, `./` or `../` against the page's base URL, anything else as an absolute URL, so
     `//host/x`, `/\host/x` and a remote <base href> all land on another origin. A bare
     name, a `data:` or `blob:` URL, or a target that does not parse is a module this
     check cannot read, so it blocks too. JSON.parse has already decoded `\/`, so an
     escaped URL that the text scan for origins cannot see is judged here. Every map on
     the page is judged, not only the first one resolution reads.

     AN HTTPS TARGET IS ALLOWED SINCE 26 OCT 2026. New uploads are published under
     2027-03, whose script-src takes any https host, so mapping `three` to a CDN is how a
     game is allowed to load it. What still blocks is everything else that is not a file
     here: plain http (the browser refuses it from an https page), `data:`, `blob:`, a bare
     name and a target that does not parse. Whether the https host is a blocked service is
     the origin check's question, which reads the same map as text. */
  function remoteTargets(page: string, label: string, base: URL, map: ImportMap) {
    const tables: Record<string, unknown>[] = [];
    if (map.imports && typeof map.imports === "object" && !Array.isArray(map.imports)) tables.push(map.imports);
    if (map.scopes && typeof map.scopes === "object" && !Array.isArray(map.scopes))
      for (const table of Object.values(map.scopes)) if (table && typeof table === "object" && !Array.isArray(table)) tables.push(table);
    for (const table of tables) for (const [key, target] of Object.entries(table)) {
      // A target that is not a string maps the key to nothing, so nothing loads.
      if (typeof target !== "string") continue;
      let resolved: URL | null = null;
      try { resolved = /^(?:\/|\.\.?\/)/.test(target) ? new URL(target, base) : new URL(target); } catch { resolved = null; }
      if (resolved && resolved.origin === new URL(host).origin) continue;
      if (resolved && resolved.protocol === "https:") continue;
      const seen = `import-map-remote-target:${label}:${key}:${target}`;
      if (findings.length >= 8 || seenFindings.has(seen)) continue;
      seenFindings.add(seen);
      findings.push({ code: "import-map-remote-target", severity: "blocker", path: page,
        title: `${label} has an import map that sends ${key} to ${target}, which is not a file in this game or an https address.`,
        detail: "The browser loads a mapped module from wherever the map says, and it refuses plain http from a game page. Map it to a file inside the game or to an https:// address, or bundle it with your build tool." });
    }
  }
  for (const document of files.filter(file => /\.html?$/i.test(file.path))) {
    let fallback: URL;
    try { fallback = new URL(host + document.path); } catch { fallback = new URL(host); }
    documentBases.set(document.path, analyseDocument(document.path, document.path, document.text, fallback, document.path, 0));
  }
  return { findings, documentBases, checkedSpecifiers, sourceLoads };

  /* One HTML document: a file, or the srcdoc of an iframe inside one, which is reported
     against the file that carries it. `fallback` is the URL a relative <base> resolves
     against, and what the base is when there is none. For a file that is its own URL; for
     a srcdoc it is the parent document's base URL, which is what the HTML standard gives
     an iframe srcdoc document and what Chrome 151 did when measured (23 Oct 2026).
     Returns the document's base as a path, which the reference check reads. */
  function analyseDocument(path: string, label: string, text: string, fallback: URL, fallbackLocal: string, depth: number): string {
    const scripts: HtmlNode[] = [];
    const preloads: string[] = [];
    const frames: string[] = [];
    let documentBase = fallbackLocal, baseFound = false, baseUrl = fallback, bases = 0;
    /* Only HTML elements. An <svg><base> or <math><base> is in another namespace and the
       browser ignores it, but it has the same tag name, so reading tag names alone took
       one as the page's base and resolved the map against it while the real <base> after
       it sent every relative target to another host (round 4 review of #390, B1 and B2).
       A <script> inside <svg> is an SVG script and never an import map or a module. */
    function walkHtml(node: HtmlNode) {
      const html = node.namespaceURI === HTML_NAMESPACE;
      if (html && node.tagName === "script") scripts.push(node);
      /* A module preload is the parser fetching a module before any script asks for it,
         which is how a build tool that has run writes its entry. One that names a source
         file is the same mistake as a script that does. */
      if (html && node.tagName === "link") {
        const rel = node.attrs?.find(row => row.name === "rel")?.value ?? "";
        const href = node.attrs?.find(row => row.name === "href")?.value;
        if (href !== undefined && rel.toLowerCase().split(/[\t\n\f\r ]+/).includes("modulepreload")) preloads.push(href);
      }
      if (html && node.tagName === "base") {
        const href = node.attrs?.find(row => row.name === "href")?.value;
        if (href !== undefined) bases++;
        if (href !== undefined && !baseFound) {
          baseFound = true;
          try { baseUrl = new URL(href, fallback); } catch { /* An unparseable href leaves the fallback, as in a browser. */ }
          documentBase = baseUrl.origin === new URL(host).origin ? localPath(baseUrl.href, "") ?? fallbackLocal : fallbackLocal;
        }
      }
      if (html && node.tagName === "iframe") {
        const srcdoc = node.attrs?.find(row => row.name === "srcdoc")?.value;
        if (srcdoc !== undefined) frames.push(srcdoc);
      }
      for (const child of node.childNodes ?? []) walkHtml(child);
    }
    walkHtml(parseHtml(text) as HtmlNode);
    /* MORE THAN ONE <base href> AND THE PAGE IS NOT READ. Chrome takes the base that is
       current when each URL is parsed, and parse5 builds a different tree from Chrome's in
       places: a second <base> foster-parented out of a table came first in parse5's tree
       while Chrome had already resolved the map against the one inside the cell (round 5
       review of #390, S4 and S5). Which base a target meets cannot be known from a tree
       that is not the browser's, so a page with two blocks. No starter, fixture, published
       game or Original had two on 23 Oct 2026. */
    if (bases > 1) push("base-ambiguous", path, `${label}:base`,
      `${label} has ${bases} <base href> elements, so the check cannot tell which one its URLs resolve against.`,
      "Keep one <base> in the page, in its <head>, or remove it and use relative paths.");
    let map: ImportMap = {};
    const modules: { from: string; base?: string; imports: Import[] }[] = [];
    for (const script of scripts) {
      const attrs = Object.fromEntries((script.attrs ?? []).map(attr => [attr.name, attr.value]));
      const scriptText = (script.childNodes ?? []).map(child => child.value ?? "").join("");
      if (isImportMapType(attrs.type)) {
        let parsedMap: ImportMap | null = null;
        try { const value: unknown = JSON.parse(scriptText); if (value && typeof value === "object" && !Array.isArray(value)) parsedMap = value as ImportMap; } catch { /* The browser reports malformed maps during runtime review. */ }
        if (parsedMap) {
          remoteTargets(path, label, baseUrl, parsedMap);
          /* RESOLUTION BELOW IS ADVICE, NOT A BOUNDARY. Only the first static map takes
             part in it, and a page can add another at runtime: Chrome 151 applies a map
             appended by any script to every specifier not yet resolved, including a later
             dynamic import, and a page with no static map can do it too. Which scope
             applies also turns on the referrer's exact URL (query, fragment, percent
             encoding, <base>), and three rounds of review on #390 kept finding cases the
             walk below gets wrong. It exists to tell a creator their build is broken.
             The sound part for a static map is remoteTargets, which judges every target
             whatever key or referrer would reach it. A map added at runtime is the game
             origin's CSP's job: under 2027-03 `script-src` admits 'self', inline, eval,
             wasm, blob: and any https host (infra/worker/src/contracts.ts, and csp.py for
             the sandbox), so what it can still reach is a blocked service, and that is
             the sandbox run's `net` verdict and the reviewer's to catch. */
          if (!Object.keys(map).length) map = parsedMap;
        }
      }
      const type = (attrs.type ?? "").trim().toLowerCase();
      if (!["", "module", "text/javascript", "application/javascript", "text/ecmascript", "application/ecmascript"].includes(type)) continue;
      const classic = type !== "module";
      if (attrs.src) {
        const unbuilt = unbuiltSource(attrs.src, documentBase);
        if (unbuilt) sourceLoads.push({ document: path, target: unbuilt });
        const target = localPath(attrs.src, documentBase);
        if (target && source.has(target)) modules.push({ from: target, imports: moduleImports(target).filter(item => !classic || item.dynamic) });
      } else modules.push({ from: path, base: documentBase, imports: imports(scriptText).filter(item => !classic || item.dynamic) });
    }
    for (const href of preloads) {
      const unbuilt = unbuiltSource(href, documentBase);
      if (unbuilt) sourceLoads.push({ document: path, target: unbuilt });
    }
    const visited = new Set<string>();
    function moduleImports(file: string) {
      if (!parsed.has(file)) parsed.set(file, imports(source.get(file) ?? ""));
      return parsed.get(file)!;
    }
    const pending = [...modules];
    for (let cursor = 0; cursor < pending.length; cursor++) {
      const { from, base: moduleBase = from, imports: items } = pending[cursor]!;
      for (const item of items) {
        if (REMOTE.test(item.value)) continue;
        checkedSpecifiers.add(`${from}:${item.value.split(/[?#]/)[0]}`);
        let value = item.value, base = moduleBase;
        const bare = !LOCAL.test(value);
        const normalized = bare ? value : moduleUrl(value, moduleBase);
        const scopes = map.scopes && typeof map.scopes === "object" ? Object.entries(map.scopes)
          .map(([key, table]) => [localPath(key, documentBase), table] as const)
          .filter(([key]) => key !== null && from.startsWith(key!)).sort((a, b) => b[0]!.length - a[0]!.length) : [];
        let mapped: ReturnType<typeof match> = { found: false };
        if (normalized !== null) {
          for (const [, table] of scopes) { mapped = match(table, normalized, documentBase); if (mapped.found) break; }
          if (!mapped.found) mapped = match(map.imports, normalized, documentBase);
        }
        if (mapped.found) {
          /* A CDN module, which the map's own check above has already judged. */
          if (mapped.value && /^(?:https:)?\/\//i.test(mapped.value)) continue;
          if (!mapped.value || !LOCAL.test(mapped.value)) {
            finding("bare-import", from, item, `${from} imports ${item.value} without a local module path.`, "Map this import to a local file in the entry page, or include it through your build tool.");
            continue;
          }
          value = mapped.value; base = documentBase;
        } else if (bare) {
          finding("bare-import", from, item, `${from} imports ${item.value} without a local module path.`, "Bundle this dependency, or map its name to a local file in the entry page's import map. For Vite, build the project and upload dist; for other tools, use their static build output.");
          continue;
        }
        const target = localPath(value, base);
        if (!target || !exact.has(target)) {
          finding("missing-module-path", from, item, `${from} imports ${item.value}, but ${target ?? "its resolved path"} is missing.`, "Use a path relative to the importing module, or rebuild so the dependency is included. Check the bundler's base or public path setting.");
          continue;
        }
        /* A built entry that imports source is the same blank page one step later: the
           browser fetches `./src/main.ts` from `boot.js` exactly as it would from the
           page, and gets bytes it cannot run. */
        if (SOURCE_ONLY.test(target)) sourceLoads.push({ document: path, target });
        if (visited.has(target) || !source.has(target) || !/\.[cm]?js$/i.test(precompressedAsset(target)?.path ?? target)) continue;
        visited.add(target); pending.push({ from: target, imports: moduleImports(target) });
      }
    }
    /* A srcdoc is a whole document with its own maps and modules, so it gets the same
       reading. It was never parsed, so a map inside one went unjudged (round 1's A7 and
       round 4's B4 on #390). Nesting is bounded, and a srcdoc past the bound blocks
       rather than going unread. */
    for (const frame of frames) {
      if (depth + 1 > SRCDOC_DEPTH) {
        /* Once per file: a page with many deep frames would otherwise fill the cap of
           eight and hide every other blocker behind copies of this one. */
        push("srcdoc-too-deep", path, path,
          `${path} nests iframe srcdoc documents more than ${SRCDOC_DEPTH} deep, so the check cannot read them.`,
          "Move the inner page into its own HTML file in the game and load it with src.");
        continue;
      }
      analyseDocument(path, `${path} (iframe srcdoc)`, frame, baseUrl, documentBase, depth + 1);
    }
    return documentBase;
  }
}
