/**
 * `OpenGame.multiplayer` and the bridge's room calls, kept as answers that say no.
 *
 * Multiplayer left the SDK on 3 Nov 2026, and every game published before then still
 * carries an engine integration written against it. That matters because og-games does not
 * serve those games the SDK they were built with: under runtime contracts 2027-02 and
 * 2027-04 it injects whatever SDK it was last deployed with.
 * The GDevelop, Cocos, LittleJS, React and RPG Maker integrations each refused to start when
 * the global had no `multiplayer`, and the GameMaker extension refused a bridge without
 * `send`, so removing the module took identity, scores and achievements down with it in
 * every one of those games, not only their rooms (5 Nov 2026).
 *
 * So the names stay and nothing behind them works. Opening a room rejects with the shape a
 * room error always had, `{ code: 'unavailable' }`, which is what every one of those
 * integrations already turns into its own `{ ok: false, error: 'unavailable' }`, because it
 * is what a page that withheld the multiplayer capability always produced. Resolving a
 * result object instead would have been read as a room: each integration calls `room.on`
 * on whatever `host` resolves to, and the TypeError that follows reaches the game as
 * `invalid_request`, or as itself. `joinInvite` resolves to null, which has always meant
 * "this player arrived without an invite" and is now true of every player.
 *
 * This is not a feature and is documented nowhere a creator reads. It is assigned to the
 * global apart from the SDK's surface (see global/bridge.ts), and `OpenGameBridge` does
 * not declare the room calls. Delete this file, its two uses and
 * tests/legacy-integrations.test.mjs once no published version declares 2027-02 or 2027-04.
 */
import { describeError } from './errors.js';

const message = 'Multiplayer is not part of the OpenGame SDK any more.';

/** A fresh error each time, so one game's handler cannot change what the next call sees. */
function refusal(): Error {
  const { retryable, hint } = describeError('unavailable');
  return Object.assign(new Error(message), { name: 'RoomError', code: 'unavailable', retryable, hint });
}

/** @deprecated Multiplayer was removed from the SDK. Kept only for games published before that.
 * @internal */
export const legacyMultiplayer = Object.freeze({
  invite: null,
  host: (): Promise<never> => Promise.reject(refusal()),
  join: (): Promise<never> => Promise.reject(refusal()),
  joinInvite: (): Promise<null> => Promise.resolve(null),
  lobby: (): Promise<never> => Promise.reject(refusal()),
});

/* The bridge's half. `send` answers as the bridge always did for a room that does not exist,
   which every room now is; a maxPacketBytes of 0 passes GameMaker's check (an integer, not
   negative) and fails Unity's and Godot's (above 0), so those two report no transport. */
const noRoom = JSON.stringify({ sent: 0, dropped: 0, closed: true });
const unavailable = () => ({ ok: false as const, error: 'unavailable', reason: describeError('unavailable').hint });

/** @deprecated See legacyMultiplayer. @internal */
export const legacyRoomBridge = Object.freeze({
  send: (): string => noRoom,
  sendTo: (): string => noRoom,
  disconnectPeer: (): string => JSON.stringify(unavailable()),
  maxPacketBytes: 0,
});

/** The answer to a `room.*` bridge request: no invite to join, and nothing else to do. @internal */
export const roomRequest = (op: string) => op === 'room.joinInvite' ? { ok: true as const, value: null } : unavailable();
