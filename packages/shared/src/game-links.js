/** A destination is displayed by the parent before a person chooses to leave the
 * game. Keep its authority literal: encoded host characters, credentials and
 * backslashes can make the text someone reads differ from the host they visit. */
export function externalGameLink(value, charsMax, excludedOrigins = []) {
  if (typeof value !== 'string' || !value || value.length > charsMax || /[\s\\\u0000-\u001f\u007f]/u.test(value)) return null;
  if (!/^https:\/\//i.test(value)) return null;
  const authority = value.slice('https://'.length).split(/[/?#]/u)[0];
  if (!authority || /[%@]/u.test(authority) || !/^[\x21-\x7e]+$/u.test(authority)) return null;
  try {
    const url = new URL(value);
    if (authority.toLowerCase() !== url.host.toLowerCase()) return null;
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname || excludedOrigins.includes(url.origin)) return null;
    return url.href.length <= charsMax ? url.href : null;
  } catch { return null; }
}
