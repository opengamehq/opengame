/** The platform serves this complete build at /_og/sdk.js before the game starts. */
import { og, OpenGameClient, trustedParent } from '../index.js';
import { bridge, type OpenGameBridge } from '../bridge.js';
import { errorCatalogue } from '../errors.js';
import { legacyMultiplayer } from '../legacy-multiplayer.js';
import { radio, type Radio } from '../radio.js';

export type OpenGameGlobal = OpenGameClient & {
  readonly og: OpenGameClient;
  readonly bridge: OpenGameBridge;
  readonly OpenGameClient: typeof OpenGameClient;
  readonly trustedParent: typeof trustedParent;
  /** Every error code the SDK names, with its hint. The GDevelop and RPG Maker plugins read
   * it for the hint and to tell a known failure from an unknown one. It went out with the
   * multiplayer module it used to be exported from, and their tests kept passing on a fake
   * (code review, 5 Nov 2026). */
  readonly errorCatalogue: typeof errorCatalogue;
  /** OG Radio: browse the stations and songs and play them for the player. See `@opengamehq/sdk/radio`. */
  readonly radio: Radio;
};
declare global {
  var OpenGame: OpenGameGlobal;
  interface Window { OpenGame: OpenGameGlobal }
}
const scope = globalThis as typeof globalThis & { OpenGame?: OpenGameGlobal };
/* `radio` rides on the client as well, so a game holding `OpenGame.og` reaches
   `OpenGame.og.radio` the same as `OpenGame.radio`. */
const value = Object.assign(og, { og, bridge, OpenGameClient, trustedParent, errorCatalogue, radio });
/* Not part of the SDK, so not in the object above or in OpenGameGlobal: an inert stand-in
   that keeps games published before multiplayer was removed starting at all. Not
   enumerable, so nothing that lists the global presents it as surface. Writable, and left
   alone when a game's own older build put one there first, because that build assigns its
   exports onto this same core and a read-only property would make its assignment throw.
   See legacy-multiplayer.ts, and remove it with that file. */
if (!('multiplayer' in value)) Object.defineProperty(value, 'multiplayer', { value: legacyMultiplayer, configurable: true, enumerable: false, writable: true });

// Historical esbuild IIFEs assign `var OpenGame = ...` after evaluating their
// exports. Keep those classic script loads on this installation without freezing
// the creator's object or preventing an intentional replacement of the global.
let current = value;
// A classic script loaded first may already have declared a non-configurable
// global var. It is still writable, but cannot be converted into an accessor.
if (Object.getOwnPropertyDescriptor(scope, 'OpenGame')?.configurable === false) scope.OpenGame = value;
else Object.defineProperty(scope, 'OpenGame', { configurable: true, enumerable: true,
  get: () => current,
  set: next => {
    if (next && Object.hasOwn(next, 'og') && typeof next.OpenGameClient === 'function' && typeof next.trustedParent === 'function') return;
    current = next;
  },
});

/* The page is asked for the player now, while the game's own scripts are still loading,
   rather than when the game first calls init. A WebAssembly engine can take a minute to
   reach that call, and the player's OG should be on its first menu, not arrive after it.
   Hosted frames only, and only the handshake: see `connect` in index.ts. */
og.connect();
