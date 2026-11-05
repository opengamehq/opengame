import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Context } from './context.js';

const unavailable = () => ({ ok: false, error: 'unavailable' });
const useCommitEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function useOpenGame() {
  const value = useContext(Context);
  if (!value) throw new Error('Wrap the game in OpenGameProvider.');
  return value;
}
export function usePlayer() { return useOpenGame().player; }

/** Reads are explicit, so a render or Strict Mode replay cannot submit a score. */
export function useLeaderboard(key) {
  const { client } = useOpenGame();
  return useMemo(() => ({
    submit: (score, meta) => client?.leaderboard(key).submit(score, meta) ?? Promise.resolve(unavailable()),
    top: options => client?.leaderboard(key).top(options) ?? Promise.resolve(unavailable()),
    me: () => client?.leaderboard(key).me() ?? Promise.resolve(unavailable()),
    around: () => client?.leaderboard(key).around() ?? Promise.resolve(unavailable()),
  }), [client, key]);
}

const roomSnapshot = room => ({ code: room.code, role: room.role, self: room.self,
  peers: room.peers, phase: room.phaseState, readiness: room.readyState, closed: room.isClosed });

/** One hook owns one room. Replacement, cancellation and unmount close that room. */
export function useRoom() {
  const { client } = useOpenGame();
  const owned = useRef(null);
  const pending = useRef(null);
  const stopClose = useRef(null);
  const alive = useRef(false);
  const [state, setState] = useState({ room: null, snapshot: null, connecting: false, error: null, closeReason: null });
  const closeOwned = useCallback(() => {
    pending.current?.abort(); pending.current = null;
    const previous = owned.current; owned.current = null;
    stopClose.current?.(); stopClose.current = null;
    previous?.close();
  }, []);
  useEffect(() => {
    alive.current = true;
    setState({ room: null, snapshot: null, connecting: false, error: null, closeReason: null });
    return () => { alive.current = false; closeOwned(); };
  }, [client, closeOwned]);
  useEffect(() => {
    const room = state.room;
    if (!room || owned.current !== room) return;
    const refresh = () => {
      if (!alive.current || owned.current !== room) return;
      if (room.isClosed) {
        owned.current = null;
        setState(previous => ({ ...previous, room: null, snapshot: roomSnapshot(room), closeReason: 'closed' }));
      } else setState(previous => ({ ...previous, snapshot: roomSnapshot(room) }));
    };
    const off = ['join', 'leave', 'phase', 'readiness', 'members', 'configuration', 'authority', 'migrating'].map(event => room.on(event, refresh));
    refresh();
    return () => off.forEach(unsubscribe => unsubscribe());
  }, [state.room]);

  const connect = useCallback(async (method, code, options = {}) => {
    closeOwned();
    const controller = new AbortController(); pending.current = controller;
    if (alive.current) setState({ room: null, snapshot: null, connecting: true, error: null, closeReason: null });
    try {
      if (!client?.multiplayer) throw Object.assign(new Error('OpenGame is unavailable.'), { code: 'unavailable' });
      // Never defer this call through an effect: the caller owns when joining happens.
      const room = await (method === 'join' ? client.multiplayer.join(code, { ...options, signal: controller.signal })
        : client.multiplayer[method]({ ...options, signal: controller.signal }));
      if (!alive.current || pending.current !== controller || controller.signal.aborted) {
        room?.close(); return null;
      }
      pending.current = null; owned.current = room;
      if (room) {
        // Attach before returning the room. A caller can close it on the same
        // stack, before React commits a render or runs a subscription effect.
        stopClose.current = room.on('close', closeReason => {
          if (!alive.current || owned.current !== room) return;
          owned.current = null;
          stopClose.current?.(); stopClose.current = null;
          setState(previous => ({ ...previous, room: null, snapshot: roomSnapshot(room), closeReason }));
        });
        if (room.isClosed) {
          closeOwned();
          setState({ room: null, snapshot: roomSnapshot(room), connecting: false, error: null, closeReason: 'closed' });
          return null;
        }
      }
      setState({ room, snapshot: room ? roomSnapshot(room) : null, connecting: false, error: null,
        closeReason: room?.isClosed ? 'closed' : null });
      return room;
    } catch (error) {
      if (alive.current && pending.current === controller) {
        pending.current = null;
        setState({ room: null, snapshot: null, connecting: false, error, closeReason: null });
      }
      throw error;
    }
  }, [client, closeOwned]);
  const leave = useCallback(() => {
    closeOwned();
    if (alive.current) setState({ room: null, snapshot: null, connecting: false, error: null, closeReason: 'left' });
  }, [closeOwned]);
  return useMemo(() => ({ ...state,
    host: options => connect('host', undefined, options),
    join: (code, options) => connect('join', code, options),
    joinInvite: options => connect('joinInvite', undefined, options),
    leave,
  }), [state, connect, leave]);
}

/** Use for high-rate packets without re-rendering the game for every packet. */
export function useRoomEvent(room, event, listener) {
  const current = useRef(listener);
  useCommitEffect(() => { current.current = listener; }, [listener]);
  useEffect(() => {
    if (!room) return;
    return room.on(event, (...args) => current.current(...args));
  }, [room, event]);
}
