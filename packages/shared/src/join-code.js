/**
 * Invite links for games that run lobbies of their own: the game page on opengame.io with
 * `?join=CODE`. One file because two readers have to agree on it. The site reads the code
 * out of the page's address and hands it to the frame; the SDK builds the address the
 * code goes out in. If they disagreed, a game could share a link whose code the page
 * changes or drops, and the friend who opens it lands in an empty menu with nothing to
 * say why.
 *
 * Two shapes. People type short codes, so 4 to 12 letters and digits pass with case and
 * punctuation dropped. Smash Royale's links carry a case-sensitive 22-character base64url
 * id, which passes exactly as written. Nothing about a code is secret: it is the same
 * thing a player reads out loud.
 */
export function normaliseJoinCode(raw) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  if (/^[\w-]{22}$/.test(value)) return value;
  const code = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z0-9]{4,12}$/.test(code) ? code : null;
}

/**
 * `page` with `?join=code`, or null. A code the page would change is refused rather than
 * changed here: a game whose lobby ids are lower case would otherwise send `abcd12` out
 * and get `ABCD12` back, and miss its own lobby. Refusing it shows up the first time the
 * game is tried, not when a stranger opens the link.
 */
export function joinLink(page, code) {
  if (typeof page !== 'string' || normaliseJoinCode(code) !== code) return null;
  try {
    const url = new URL(page);
    url.searchParams.set('join', code);
    url.hash = '';
    return url.href;
  } catch { return null; }
}
