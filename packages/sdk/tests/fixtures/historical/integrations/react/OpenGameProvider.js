import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { Context } from './context.js';

const unavailable = () => ({ ok: false, error: 'unavailable' });
const playerSnapshot = client => ({ id: client.player.id, handle: client.player.handle,
  ogNumber: client.player.ogNumber, signedIn: client.player.signedIn, avatar: client.player.avatar });

/** The page owns the SDK. React owns only its subscriptions, never its lifetime. */
export function OpenGameProvider({ children, options }) {
  const initialOptions = useRef(options);
  const [value, setValue] = useState({ client: null, environment: null, player: null,
    paused: false, muted: false, fullscreen: false, status: 'loading' });
  useEffect(() => {
    const client = globalThis.OpenGame;
    if (!client?.init || !client?.multiplayer) {
      setValue(previous => ({ ...previous, status: 'unavailable' }));
      return;
    }
    let active = true;
    let frame;
    let environment = client.env;
    const patch = fields => { if (active) setValue(previous => ({ ...previous, ...fields })); };
    patch({ client, player: playerSnapshot(client) });
    const off = [client.player.onChange(player => patch({ player })),
      client.onPause(paused => patch({ paused })),
      client.audio.onHostMute(muted => patch({ muted })),
      client.fullscreen.onChange(fullscreen => patch({ fullscreen }))];
    client.init(initialOptions.current).then(() => patch({ environment: client.env, status: 'ready' }),
      () => patch({ status: 'unavailable' }));
    // The SDK has no environment-change subscription. Observe its immutable
    // snapshot on render frames so a late handshake also updates capability UI.
    const refresh = () => {
      if (!active) return;
      if (client.env !== environment) { environment = client.env; patch({ environment }); }
      frame = requestAnimationFrame(refresh);
    };
    frame = requestAnimationFrame(refresh);
    return () => { active = false; cancelAnimationFrame(frame); off.forEach(unsubscribe => unsubscribe()); };
  }, []);
  const actions = useMemo(() => ({
    ready: () => value.client?.ready(),
    track: (name, props) => value.client?.track(name, props) ?? unavailable(),
    signIn: () => value.client?.player.requestSignIn() ?? unavailable(),
    requestFullscreen: () => value.client?.fullscreen.request() ?? unavailable(),
    openLink: url => value.client?.openLink(url) ?? Promise.resolve(unavailable()),
  }), [value.client]);
  const api = useMemo(() => ({ ...value, ...actions,
    capabilities: value.environment?.capabilities ?? [],
  }), [value, actions]);
  return createElement(Context.Provider, { value: api }, children);
}

