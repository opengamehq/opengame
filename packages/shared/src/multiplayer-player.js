/** A public player record is signed by the platform, never supplied by a peer.
 * The same parser is used before minting and after verification. Keep this shape
 * deliberately small: adding an account identifier here discloses it to games. */
export function readMultiplayerPlayer(value, handlePattern) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.keys(value).length !== 4 || !['id', 'handle', 'ogNumber', 'signedIn'].every(key => Object.hasOwn(value, key))) return null;
  const { id, handle, ogNumber, signedIn } = value;
  const uuid = typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(id)?.[0];
  if (typeof id !== 'string' || uuid !== id || typeof signedIn !== 'boolean') return null;
  if (handle !== null && (typeof handle !== 'string' || new RegExp(handlePattern).exec(handle)?.[0] !== handle)) return null;
  if (ogNumber !== null && (!Number.isSafeInteger(ogNumber) || ogNumber < 1)) return null;
  if (!signedIn && (handle !== null || ogNumber !== null)) return null;
  return Object.freeze({ id, handle, ogNumber, signedIn });
}
