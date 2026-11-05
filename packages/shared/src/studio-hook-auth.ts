const encoder = new TextEncoder();

/**
 * Constant-time equality over two strings, for the shared secrets that are compared
 * directly rather than through an HMAC. Encodes both and asks the runtime, which is the
 * same primitive `verifyTicket` relies on; a `===` on secrets leaks their prefix.
 */
export async function secretsEqual(a: string, b: string): Promise<boolean> {
  const key = (await crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ])) as CryptoKey;
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(a));
  return crypto.subtle.verify("HMAC", key, signature, encoder.encode(b));
}

/** `Authorization: Bearer <STUDIO_HOOK_SECRET>`, the contract every hook caller uses. */
export async function hookAuthorised(request: Request, secret: string | undefined): Promise<boolean> {
  if (secret === undefined || secret === "") return false;
  const header = request.headers.get("Authorization");
  if (header === null) return false;
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match?.[1]) return false;
  return secretsEqual(match[1], secret);
}
