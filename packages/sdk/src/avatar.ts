/**
 * The player's OG as named parts, for a game that draws it with its own art.
 *
 * Parses the head and outfit recipes from `og.player.avatar` using OpenGame's shared
 * parsers. Outfit accessories are a list, including in the `c4` format.
 *
 * Shape and garment IDs can be newer than this SDK. Draw a default for an unknown part.
 * Unknown colours return `hex: null`.
 *
 * `portraitUrl` gives the address of the player's head as a PNG, drawn by OpenGame.
 * AVATAR-SPEC.md, beside this package's README, describes every part well enough to draw an
 * OG in any engine and art style.
 *
 * Import this module separately from the core or injected global when drawing an OG.
 */
import { readAvatarLookParts } from '@opengame/shared/avatar-look';
import { readCharacterParts } from '@opengame/shared/character-look-wire';
import type { AvatarRecipe } from './index.js';

/* Read at build time from packages/ui's mascot colours and packages/shared's outfit
   colours, so neither table is copied here. */
declare const __AVATAR_CONFIG__: {
  heads: Record<string, string>; finishes: string[]; cloth: Record<string, string | null>; renames: Record<string, string>;
  portrait: { origin: string; sizes: number[]; size: number; version: number };
};

/**
 * A color in the outfit. `id` is the recipe's id, from the outfit palette or one of the two
 * that follow the head. `followsHead` is true for `avatar` and `match`, which take the head's
 * color, and `hex` is then the head's unshaded swatch: draw `match` exactly as the head and
 * `avatar` darker by garment, bottoms at roughly half the head's brightness and shoes close
 * to it (AVATAR-SPEC.md, "Clothing colors", has the factor for each garment). `hex` is null
 * for a color this SDK build does not know: use your own default for that garment.
 */
export type AvatarColor = Readonly<{ id: string; hex: string | null; followsHead: boolean }>;
/**
 * The head, from `look`. It is most of what makes an OG recognizable: draw the shape, the
 * color and the eyes even if you draw little else.
 */
export type AvatarHead = Readonly<{
  /** The look recipe as received, `shape.eyes.color` with up to six optional parts after it. */
  recipe: string;
  /** The head's outline, such as `circle`, `panda` or a haircut like `shortfringe`. */
  shape: string;
  /** The eye style, such as `classic`, `dots` or `visor`. The eyes are the face: an OG has no nose or mouth. */
  eyes: string;
  /** The current color id, so an old `ink` becomes `black` and `paper` becomes `white`. */
  color: string;
  /** The color's swatch, or null for a color this SDK build does not know. `mono` ("Auto") is black on a light page and white on a dark one; its swatch is the black. */
  hex: string | null;
  /** True for a patterned, metallic, glowing or translucent color such as plaid, gold, neon pink or glass, which `hex` only approximates. */
  finish: boolean;
  /** What the head wears, such as `crown` or `headphones`, or null. */
  accessory: string | null;
  /** Picks a face set (`female` adds lashes) and is `male` unless the player chose otherwise. Do not read it as gender, pronouns or a voice. */
  identity: 'male' | 'female';
  /** A beard or moustache id, or null. */
  facialHair: string | null;
  /** A hair palette id for a haircut shape or for `hair`, or null to keep the haircut's own color. */
  hairColor: string | null;
  /** A hair palette id for the facial hair, or null to match `hairColor`. */
  facialHairColor: string | null;
  /** A haircut such as `bob` worn over `shape`, or null: draw `shape`, then that haircut's hair over it. OpenGame saves it only beside a shape that is not a haircut, and the plain circle with a haircut is saved as that haircut's shape instead. */
  hair: string | null;
}>;
/** The body and clothes, from `character`. */
export type AvatarOutfit = Readonly<{
  /** The character recipe as received, starting with its version. */
  recipe: string;
  /** `c3` for one accessory or none, `c4` for several; `c1` and `c2` are older saves, read with the defaults their version implies. */
  version: 'c1' | 'c2' | 'c3' | 'c4';
  /** The torso's build: `sprout`, `classic`, `slim`, `round` or `tall`. */
  body: string;
  /** Leg length: `short`, `regular` or `long`. */
  legs: string;
  /** The top, or `"none"` when the torso is bare and drawn in the head's color. */
  shirt: string;
  /** Shorts, trousers or a skirt, such as `jeans` or `kilt`. */
  bottoms: string;
  /** What the body wears, in catalogue order, at most one per slot. Empty when none are worn. */
  accessories: readonly string[];
  /** The sneaker style, such as `classic` or `hightop`. */
  shoes: string;
  /** One color for each garment group. All the accessories share `colors.accessories`. */
  colors: Readonly<{ shirt: AvatarColor; bottoms: AvatarColor; shoes: AvatarColor; accessories: AvatarColor }>;
}>;
/** The player's OG. `outfit` is null when the player shared no outfit or it is in a version this SDK cannot read: draw your default body under their head. */
export type Avatar = Readonly<{ head: AvatarHead; outfit: AvatarOutfit | null }>;

const own = (table: Record<string, string | null>, id: string) => Object.hasOwn(table, id) ? table[id]! : null;

/**
 * Names the parts of `og.player.avatar`. Returns null when there is no look to draw: a
 * guest, a signed-in player with no look made yet, a private preview, or a
 * malformed recipe. Use your game's default character then.
 */
export function readAvatar(recipe: Pick<AvatarRecipe, 'look' | 'character'> | null | undefined): Avatar | null {
  const look = readAvatarLookParts(recipe?.look);
  if (!look) return null;
  const { heads, finishes, cloth, renames } = __AVATAR_CONFIG__;
  const color = own(renames, look.color) ?? look.color;
  const hex = own(heads, color);
  const head: AvatarHead = Object.freeze({ recipe: recipe!.look!, shape: look.shape, eyes: look.eyes, color, hex, finish: finishes.includes(color), accessory: look.accessory, identity: look.identity, facialHair: look.facialHair, hairColor: look.hairColor, facialHairColor: look.facialHairColor, hair: look.hair });
  const parts = readCharacterParts(recipe!.character);
  const paint = (id: string): AvatarColor => {
    const followsHead = id === 'avatar' || id === 'match';
    return Object.freeze({ id, hex: followsHead ? hex : own(cloth, id), followsHead });
  };
  const outfit: AvatarOutfit | null = parts && Object.freeze({
    recipe: recipe!.character!, version: parts.version, body: parts.body, legs: parts.legs, shirt: parts.shirt,
    bottoms: parts.bottoms, accessories: Object.freeze(parts.extras), shoes: parts.shoes,
    colors: Object.freeze({ shirt: paint(parts.shirtColor), bottoms: paint(parts.bottomsColor), shoes: paint(parts.shoesColor),
      accessories: paint(parts.extraColor) }),
  });
  return Object.freeze({ head, outfit });
}

/**
 * Calls `listener` with the player's OG now, and again only when the look or the outfit
 * changes: a guest signing in, a player switching accounts, or signing out (null). A
 * session refresh with the same recipe does not call it, so a game can rebuild the model
 * here and not on every `onChange`. A listener that throws is reported with `console.error`.
 * Returns the unsubscribe function.
 */
export function watchAvatar(
  client: { readonly player: { onChange(listener: (player: { readonly avatar?: AvatarRecipe | null }) => void): () => void } },
  listener: (avatar: Avatar | null) => void,
): () => void {
  let seen: string | undefined;
  return client.player.onChange((player) => {
    const avatar = readAvatar(player.avatar);
    const key = avatar ? `${avatar.head.recipe} ${avatar.outfit?.recipe ?? ''}` : '';
    if (key === seen) return;
    seen = key;
    // The SDK runs onChange listeners inside a silent catch, so a game whose model build
    // throws would get no OG and no trace of why. Say it here, where only this entry pays.
    try { listener(avatar); } catch (error) { console.error('[og] watchAvatar listener threw', error); }
  });
}

/**
 * The address of the player's head as a transparent PNG, the face OpenGame draws beside
 * their name, or null when there is no OG. Use it in a menu, a scoreboard or as a texture:
 * the image allows any origin, so `img.crossOrigin = 'anonymous'` and a WebGL upload work.
 *
 * The address is made from the look alone and names nobody, and the image behind it never
 * changes, so cache it as long as you like. `size` is in pixels and goes up to the next
 * size OpenGame draws (the largest for anything bigger); `theme: 'dark'` draws the inks the
 * site uses on a dark page, which turns the Auto color white.
 */
export function portraitUrl(avatar: Avatar | null | undefined, options: { size?: number; theme?: 'light' | 'dark' } = {}): string | null {
  if (!avatar) return null;
  const { origin, sizes, size, version } = __AVATAR_CONFIG__.portrait;
  const asked = options.size;
  const fit = typeof asked === 'number' && asked > 0 ? sizes.find(listed => listed >= asked) ?? sizes[sizes.length - 1] : size;
  return `${origin}/api/avatars/${avatar.head.recipe}/portrait?size=${fit}&theme=${options.theme === 'dark' ? 'dark' : 'light'}&v=${version}`;
}
