import { LIMITS } from "@opengame/shared";
import { parseScript } from "./script-source";
import { parse as parseHtml, type DefaultTreeAdapterTypes } from "parse5";
import { credentialChecks, preflight, type Finding, type PreflightFile, type PreflightOptions } from "./index";
import { compressedBrowserAsset } from "./names";
import { collectTextEvidence } from "./text-evidence";
import { redactFinding } from "./diagnostic-text";
import { engineLabel } from "./engines";

export type StaticCheckState = "passed" | "failed" | "inconclusive";
type Node = { type: string; [key: string]: unknown };
type Evidence = { portrait: boolean; portraitCanvas: boolean; touch: boolean; desktop: boolean; unreadable: boolean; sdk: boolean };
const node = (value: unknown): Node | undefined => value && typeof value === "object" && "type" in value ? value as Node : undefined;
function name(value: unknown): string {
  const n = node(value);
  if (n?.type === "Identifier") return String(n.name);
  if (n?.type === "ChainExpression") return name(n.expression);
  if (n?.type !== "MemberExpression") return "";
  const property = n.computed ? node(n.property)?.value : node(n.property)?.name;
  return typeof property === "string" ? `${name(n.object)}.${property}` : "";
}

/** Strings only the SDK writes: the key its local leaderboard keeps scores under, the
 * package name in an unbundled import, and the script the platform injects. */
const SDK_MARKER = /og:dev:leaderboard:v1|@opengamehq\/sdk|\/_og\/sdk\.js/;

function inspectScript(text: string, evidence: Evidence) {
  const root = parseScript(text);
  if (!root) { evidence.unreadable = true; return; }
  const pending = [root];
  while (pending.length) {
    const n = pending.pop()!;
    if (n.type === "NewExpression" || n.type === "CallExpression") {
      const callee = name(n.callee);
      const args = Array.isArray(n.arguments) ? n.arguments : [];
      const first = node(args[0]);
      evidence.portrait ||= /^(?:window\.)?screen\.orientation\.lock$/.test(callee)
        && first?.type === "Literal" && /^portrait(?:-primary|-secondary)?$/.test(String(first.value));
      if (callee.endsWith(".addEventListener") || callee === "addEventListener") {
        const event = first?.type === "Literal" ? first.value : null;
        evidence.touch ||= typeof event === "string" && /^touch(?:start|move|end)$/.test(event);
        evidence.desktop ||= typeof event === "string" && /^(?:key(?:down|up)|mouse(?:down|move|up)|pointer(?:down|move|up)|click)$/.test(event);
      }
    }
    for (const value of Object.values(n)) {
      if (Array.isArray(value)) { for (const child of value) { const next = node(child); if (next) pending.push(next); } }
      else { const next = node(value); if (next) pending.push(next); }
    }
  }
}

function inspectHtml(text: string, evidence: Evidence) {
  const pending: DefaultTreeAdapterTypes.Node[] = [parseHtml(text)];
  while (pending.length) {
    const n = pending.pop()!;
    if ("childNodes" in n) pending.push(...n.childNodes);
    if (!("tagName" in n)) continue;
    const attributes = new Map(n.attrs.map((attribute) => [attribute.name, attribute.value]));
    if (n.tagName === "script" && !attributes.has("src")) {
      const type = (attributes.get("type") ?? "").trim().toLowerCase();
      if (["", "module", "text/javascript", "application/javascript", "text/ecmascript", "application/ecmascript"].includes(type)) {
        inspectScript(n.childNodes.filter((child) => "value" in child).map((child) => (child as DefaultTreeAdapterTypes.TextNode).value).join(""), evidence);
      }
    }
    if (n.tagName === "canvas" && !attributes.has("hidden")) {
      const width = attributes.get("width") ?? "";
      const height = attributes.get("height") ?? "";
      evidence.portraitCanvas ||= /^\d+$/.test(width) && /^\d+$/.test(height) && Number(width) > 0 && Number(height) > Number(width);
    }
    for (const [attribute, value] of attributes) if (/^on[a-z]+$/.test(attribute)) inspectScript(value, evidence);
  }
}

/** Whether image_inventory.py would decode this KTX1 header: a block-compressed format
 * with glType and glFormat zero, or a plain-pixel triple from the table. A header too
 * short or malformed to say is left to the server, which reads the whole file. */
function ktx1Decodable(head: Uint8Array): boolean {
  const magic = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x31, 0x31, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
  if (head.length < 64 || magic.some((byte, i) => head[i] !== byte)) return true;
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  if (view.getUint32(12, true) !== 0x04030201) return true;
  const [type, , format, internal] = [16, 20, 24, 28].map((at) => view.getUint32(at, true));
  const table = LIMITS.platform.moderation.ktx1;
  if ((table.blockCompressedFormats as number[]).includes(internal!)) return type === 0 && format === 0;
  return (table.uncompressedFormats as number[][]).some(([i, f, t]) => i === internal && f === format && t === type);
}

/** Whether a KTX1 header names ETC1, ETC2 or EAC, which no decoder in the check reads. */
function ktx1Etc(head: Uint8Array): boolean {
  if (head.length < 64) return false;
  const internal = new DataView(head.buffer, head.byteOffset, head.byteLength).getUint32(28, true);
  return (LIMITS.platform.moderation.ktx1.etcFormats as number[]).includes(internal);
}

/** Parse source as data. Mixed or unavailable evidence stays inconclusive;
 * runtime behaviour is checked in the browser at submit. */
export async function platformPreflight(files: PreflightFile[], options: PreflightOptions & { inspectDecodedCredentials?: boolean } = {}) {
  const texts = new Map<string, Promise<string>>();
  const cached = files.map((file) => ({ ...file, text: () => {
    let value = texts.get(file.path);
    if (!value) { value = file.text(); texts.set(file.path, value); }
    return value;
  } }));
  const base = await preflight(cached, { ...options, authoritative: true });
  const included = new Set(base.include);
  const evidence: Evidence = { portrait: false, portraitCanvas: false, touch: false, desktop: false, unreadable: false, sdk: false };
  for (const file of cached) {
    const sourcePath = compressedBrowserAsset(file.path)?.path ?? file.path;
    if (!/\.(?:html?|js|mjs|cjs)$/i.test(sourcePath) || !included.has(file.path.slice(base.strippedRoot.length))) continue;
    let text: string;
    try { text = compressedBrowserAsset(file.path) ? await file.decodedText!() : await file.text(); } catch { evidence.unreadable = true; continue; }
    if (SDK_MARKER.test(text)) evidence.sdk = true;
    if (/\.html?$/i.test(file.path)) inspectHtml(text, evidence);
    else inspectScript(text, evidence);
  }
  // WHICH engine is now detected, and reported as `engine` beside this; WHETHER it
  // works is still not something source can answer. An engine-shaped identifier can be
  // copied, renamed or left in an unused library, so every built browser export goes to
  // the same runtime review. This stays a gate state rather than a name because the
  // pipeline and the receipt SQL read it as one, and "passed" here would tell the
  // review queue a compatibility question was settled that nobody has measured.
  const engine: StaticCheckState = "inconclusive";
  const detected = base.engine;
  const identified = !detected ? "" : detected.id === "custom" ? `Custom browser export: ${detected.evidence}. `
    : detected.id === "none" ? "No engine library was found in the scripts. "
    : detected.id === "unknown" ? `The engine could not be identified: ${detected.evidence}. `
    : `Built with ${[detected, ...detected.also].map(engineLabel).join(" and ")}, from ${detected.evidence}. `;
  const layout: StaticCheckState = evidence.portrait ? "failed" : evidence.unreadable || evidence.portraitCanvas || (evidence.touch && !evidence.desktop) ? "inconclusive" : "passed";
  const added: Finding[] = [];
  // Formats the server's image check cannot decode, from the list it reads too, so
  // the local check refuses them with the same code instead of after a scan.
  const unsupported = LIMITS.platform.moderation.unsupportedImageSuffixes;
  for (const path of base.include) {
    const lower = path.toLowerCase();
    if (!unsupported.some(suffix => lower.endsWith(suffix))) continue;
    added.push({ code: "image_format_unsupported", severity: "blocker", path,
      title: `The image check cannot read ${path}.`,
      detail: `Convert ${path} to PNG, JPEG or WebP, or ship one of those beside it.` });
  }
  /* A .ktx in a GPU format the server's image check cannot decode (ETC, PVRTC, a payload
     whose three format fields disagree), refused here with the server's code. Read from
     the header, against the same limits.json table image_inventory.py admits from. */
  for (const path of base.include) {
    if (!/\.ktx$/i.test(compressedBrowserAsset(path)?.path ?? path)) continue;
    const file = cached.find((row) => row.path.slice(base.strippedRoot.length) === path);
    let head: Uint8Array | null = null;
    try {
      /* A precompressed .ktx.gz or .ktx.br is decoded first, one byte per character, as
         the browser and the server both read it. */
      if (compressedBrowserAsset(path)) head = file?.decodedText ? Uint8Array.from((await file.decodedText()).slice(0, 64), (c) => c.charCodeAt(0) & 0xff) : null;
      else head = file?.head ? await file.head(64) : file?.bytes ? (await file.bytes()).subarray(0, 64) : null;
    } catch { head = null; }
    if (!head || ktx1Decodable(head)) continue;
    /* ETC is what Kaigen and other engines cook beside BC and ASTC for phones without
       ASTC. Its pixels cannot be reviewed, so it cannot ship, and the useful thing to
       say is that its siblings are enough, not to convert it (25 Oct 2026). */
    added.push({ code: "image_format_unsupported", severity: "blocker", path,
      title: `The image check cannot read ${path}.`,
      detail: ktx1Etc(head)
        ? `${path} is an ETC texture. The image check has no ETC decoder, so it cannot review these pixels. Remove the ETC variants and ship BC and ASTC, which the check can read: BC covers most desktop browsers and ASTC covers current phones and tablets. A device with neither gets the engine's fallback, which for Kaigen is untextured models. For Kaigen, cook BC and ASTC only.`
        : `${path} is a KTX1 texture in a GPU format the check has no decoder for. Ship it as BC1-5, BC7 or ASTC, or convert it to KTX2, PNG, JPEG or WebP.` });
  }
  const formats = added.length === 0;
  // Literal escapes are data until the JavaScript parser decodes them. Check
  // these before upload too, using the same private evidence reader as the
  // server, so a compressed or renamed source file cannot hide a known key.
  // Not on the minimal checks (credentialChecks): the same switch as the plain-text scan.
  const encodedCredentials = options.inspectDecodedCredentials && credentialChecks() ? (await collectTextEvidence(cached, base)).credentialPaths : [];
  for (const path of encodedCredentials) added.push({ code: "encoded-credential", severity: "blocker", path,
    title: `A key is hidden in an escaped string in ${path}.`,
    detail: "Remove it from the bundle and rotate the key. Escaping does not hide it from players." });
  // The export mode is a thread setting, which only a wasm build has. A Phaser game was
  // told to "use a single-thread export", a choice its engine does not offer. Nor is it
  // said to a threaded export: the engine-threads note beside it says, correctly, that the
  // build runs on the isolated contract with nothing to change, and Hearthguard's threaded
  // Kaigen build reached Ready under it with both notes contradicting each other (25 Oct
  // 2026). The note's own finding decides, so the two cannot disagree again.
  const threaded = base.findings.some(finding => finding.code === "engine-threads");
  const wasm = !threaded && base.include.some(path => /\.wasm(?:\.(?:gz|br|unityweb))?$/i.test(path));
  added.push({ code: "platform-engine", severity: "note",
    title: "Browser compatibility needs a playtest.",
    // It listed LIMITS.platform.browserEngines as the exports that "can proceed to review",
    // which read to a custom export as a refusal (30 Oct 2026). Every engine's export goes.
    detail: `${identified}Static browser exports from any engine, or none, go to review, where a playtest checks that this one runs.${wasm ? ` Use a ${LIMITS.platform.browserEnginePolicy.exportMode} export.` : ""} Every game must pass the same runtime and safety checks before publication.` });
  // Advice to integrate the SDK, given to a game that already ships it, is advice to do
  // what is done. The marker is a string the SDK's own build carries; a game that copied
  // it only loses an optional note.
  if (!evidence.sdk) added.push({ code: "platform-account", severity: "note",
    title: "OpenGame account integration is optional.",
    detail: "Players can keep local progress without an OpenGame account. Integrate the SDK for account-backed scores, sign-in and optional public profiles. Confirm these features in a hosted playtest before describing them to players." });
  if (layout !== "passed") added.push({ code: "platform-desktop", severity: layout === "failed" ? "blocker" : "warning",
    title: evidence.portrait ? "This build explicitly uses a portrait layout." : "Could not confirm desktop layout and controls.",
    detail: evidence.portrait ? "Remove the portrait lock or fixed portrait canvas and support a resizable desktop window." : "Make sure gameplay resizes for desktop and supports keyboard or mouse controls. The desktop sizes check measures it again when you submit." });
  const secrets = encodedCredentials.length === 0;
  return { ...base, ...(base.credentialScan && !secrets ? { credentialScan: { ...base.credentialScan, blocked: true } } : {}), ok: base.ok && formats && secrets && layout !== "failed", findings: [...base.findings, ...added].map(redactFinding),
    checks: { secrets: base.credentialScan?.blocked || !secrets ? "failed" as const : base.credentialScan?.complete ? "passed" as const : "inconclusive" as const, preflight: base.ok && formats && secrets ? "passed" as const : "failed" as const, engine, desktop: layout } };
}
