import { compiledCredentialPatterns } from "@opengame/shared";

/** Diagnostic strings may contain a submitted filename or import, including a
 * recoverable UTF-16 key. Match a NUL-free view and remove its original span so
 * neither the key nor an interleaved representation enters a finding. */
export function redactDiagnostic(value: string): string {
  const offsets: number[] = [];
  let normalized = "";
  for (let index = 0; index < value.length; index++) {
    if (value[index] === "\0") continue;
    offsets.push(index);
    normalized += value[index];
  }
  const spans: [number, number][] = [];
  const patterns = [...compiledCredentialPatterns("content"), ...compiledCredentialPatterns("suspicious")].map(({ re }) => new RegExp(re.source, re.flags + "g"));
  // The shared detector identifies this assignment, while its opaque value
  // also needs removal when it appears in a URL or a quoted diagnostic.
  patterns.push(/SUPABASE_SERVICE_ROLE(?:_KEY)?\s*[:=]\s*(?:"[^"\n]*"|'[^'\n]*'|[^\s&"'<>?#;]+)/gi);
  for (const pattern of patterns) for (const match of normalized.matchAll(pattern)) {
    if (match[0].length) spans.push([offsets[match.index!]!, offsets[match.index! + match[0].length - 1]! + 1]);
  }
  let result = "", through = 0;
  for (const [start, end] of spans.sort((a, b) => a[0] - b[0] || b[1] - a[1])) {
    if (end <= through) continue;
    if (start >= through) result += value.slice(through, start) + "[credential removed]";
    through = end;
  }
  return result + value.slice(through);
}

export function redactFinding<T extends { title: string; detail?: string; path?: string; more?: string[] }>(finding: T): T {
  return { ...finding, title: redactDiagnostic(finding.title),
    ...(finding.detail === undefined ? {} : { detail: redactDiagnostic(finding.detail) }),
    ...(finding.path === undefined ? {} : { path: redactDiagnostic(finding.path) }),
    ...(finding.more === undefined ? {} : { more: finding.more.map(redactDiagnostic) }) };
}
