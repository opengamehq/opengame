/** Original text and canonical destinations are shared by send checks and display.
 * A destination is only syntactically parsed here; the server still owns reputation
 * checks and the renderer must require an exact server-validated URL allowlist. */
export interface SocialLinkPart { text: string; url: string | null; candidate: boolean }

function hasBareAuthority(raw: string): boolean {
  // Use complete dotted tokens, including symbols and percent escapes. Guessing
  // a Unicode alphabet can silently turn a blocked host into an allowed suffix.
  let authority = raw.split(/[/?#]/, 1)[0]!;
  // Browsers decode UTF-8 escapes before IDNA, including escaped Unicode dots.
  // Decode only for candidate recognition; validation still gets the raw text.
  try { authority = decodeURIComponent(authority); } catch { /* Keep malformed input for the URL validator. */ }
  authority = authority.replace(/:\d+$/, "").replace(/(?:[.\u3002\uff0e\uff61]|%2e)+$/i, "");
  const labels = authority.split(/\.|[\u3002\uff0e\uff61]|%2e/i);
  if (labels.length < 2 || !labels[0] || !labels.at(-1)) return false;
  const last = labels.at(-1)!;
  return !(/^[a-z]$/i.test(last) || (/^\d+$/.test(last) && !/^(?:\d+\.){3}\d+$/.test(authority)));
}

const closing: Record<string, string> = { "(": ")", "[": "]", "{": "}" };

function enclosingClose(prefix: string): string | undefined {
  const stack: string[] = [];
  for (const char of prefix) {
    const close = closing[char];
    if (close) stack.push(close);
    else if (char === stack.at(-1)) stack.pop();
  }
  return stack.at(-1);
}

function bracketRange(token: string, start: number, limit: number, outerClose: string | undefined) {
  const balance: Record<string, number> = { ")": 0, "]": 0, "}": 0 };
  for (let index = start; index < limit; index++) {
    const char = token[index]!;
    // A wrapper's closing bracket ends its destination, but balanced brackets
    // inside the URL stay in it. Continue after this wrapper to check siblings.
    if (char === outerClose && balance[char] === 0) return { end: index, balance };
    const close = closing[char];
    if (close) balance[close] = balance[close]! - 1;
    else if (char in balance) balance[char] = balance[char]! + 1;
  }
  return { end: limit, balance };
}

function candidateRange(token: string): { start: number; end: number; next: number; candidate: boolean } {
  const markdown = /^[([{‘“'*_~]*\[[^\]]*\]\(/.exec(token);
  const bareStart = markdown?.[0].length ?? (/^[()[\]{}‘’“”'*_~]+/.exec(token)?.[0].length ?? 0);
  // Locate the current wrapper before looking for a scheme. A later sibling's
  // explicit URL must not skip over this wrapper or an intervening bare URL.
  const current = bracketRange(token, bareStart, token.length, enclosingClose(token.slice(0, bareStart)));
  const content = token.slice(bareStart, current.end);
  // A named scheme starts a word and has something after its colon. Without the first,
  // "profile:", "hotel:" and "metadata:" held "file:", "tel:" and "data:", and a friend's
  // "My profile: https://opengame.io/@ana" was refused as an unsafe link (area-e, 1 Nov
  // 2026). Without the second, a label such as "Tel:" or "File:" ending a word was one. A
  // scheme written that way is not a destination any browser would follow, and the
  // renderer links only what the server validated, so neither change lets a link through.
  const explicit = /(?:[a-z][a-z\d+.-]*:\/\/|(?<![a-z\d+.-])(?:javascript|data|file|blob|vbscript|mailto|tel):(?=.)|\/\/)/i.exec(content);
  const explicitStart = explicit ? bareStart + explicit.index : null;
  // A scheme inside a bare URL's path, query or fragment belongs to that URL.
  // Ambiguous undotted authorities also go to validation, rather than allowing
  // path text to hide another destination. Prose such as see:https stays valid.
  const nested = explicit !== null && /[/?#\\]/.test(content.slice(0, explicit.index));
  const start = explicitStart !== null && !nested && !hasBareAuthority(content) ? explicitStart : bareStart;
  const prefix = token.slice(0, start);
  const quote = /['‘“](?=[*_~]*$)/.exec(prefix)?.[0];
  const endQuote = quote === "‘" ? "’" : quote === "“" ? "”" : quote;
  const format = /(?:\*{1,3}|_{1,3}|~~)(?=['‘“]*$)/.exec(prefix)?.[0];
  const { end: boundary, balance } = bracketRange(token, start, current.end, enclosingClose(prefix));
  let end = boundary;
  while (end > start) {
    const char = token[end - 1]!;
    if (/[.,;!?]/.test(char) || char === endQuote) end--;
    else if (balance[char]! > 0) { balance[char] = balance[char]! - 1; end--; }
    else if (format && token.slice(start, end).endsWith(format)) { end -= format.length; }
    else break;
  }
  const raw = token.slice(start, end);
  return { start, end, next: boundary < token.length ? boundary + 1 : token.length,
    candidate: !!raw && (start === explicitStart || nested || hasBareAuthority(raw)) };
}

export function canonicalSocialLink(raw: string): string | null {
  try {
    const url = new URL(raw.startsWith("//") ? `https:${raw}` : /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port) return null;
    url.hostname = url.hostname.toLowerCase().replace(/\.+$/, "");
    if (url.hostname === "opengame.io" || url.hostname === "www.opengame.io") {
      url.hostname = "opengame.io";
      url.protocol = "https:";
    }
    return url.href;
  } catch { return null; }
}

export function splitSocialLinkText(text: string): SocialLinkPart[] {
  const parts: SocialLinkPart[] = [];
  let offset = 0;
  // FEFF is JavaScript whitespace but an ignored IDNA code point. Splitting on
  // it would check a different hostname; preserve it for the URL parser instead.
  for (const match of text.matchAll(/(?:[^\s<>"`]|\uFEFF)+/gu)) {
    let cursor = 0;
    while (cursor < match[0].length) {
      const range = candidateRange(match[0].slice(cursor));
      if (range.candidate) {
        const start = match.index! + cursor + range.start, end = match.index! + cursor + range.end;
        if (start > offset) parts.push({ text: text.slice(offset, start), url: null, candidate: false });
        const raw = text.slice(start, end);
        parts.push({ text: raw, url: canonicalSocialLink(raw), candidate: true });
        offset = end;
      }
      // A prose-only wrapper does not make later wrapped links disappear.
      cursor += range.next;
    }
  }
  if (offset < text.length) parts.push({ text: text.slice(offset), url: null, candidate: false });
  return parts;
}
