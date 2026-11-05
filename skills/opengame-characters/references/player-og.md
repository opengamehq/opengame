# The player's OG

How a game shows the player's OpenGame character. The docs page "Draw the player's
OG" (`/guides/characters`) is the long version, and `AVATAR-SPEC.md` in the
`@opengamehq/sdk` package is the style spec: every part's shape, size and color, well
enough to draw an OG in any engine and art style. This is what an agent needs while
writing the code. Numbers marked OG Clash worked in that game, a single-player Kaigen
first- and third-person shooter; measure your own.

## Read it

```js
import { og } from '@opengamehq/sdk'
import { watchAvatar } from '@opengamehq/sdk/avatar'

await og.init()
watchAvatar(og, avatar => {
  if (!avatar) return useDefaultCharacter()   // guest, sharing off, preview, signed out
  prepareYourOg(avatar)                       // avatar.head, avatar.outfit (null: default body)
})
```

- `og.player.avatar` is `{ seed, palette, look?, character? }`. `look` is the head
  (`shape.eyes.color[.accessory[.identity]]`). `character` is the body and clothes
  (`c3.body.legs.shirt.bottoms.accessory.shoes.shirtColor.bottomsColor.shoesColor.accessoryColor`;
  `c4` joins several accessories with `-`; `c1` and `c2` are older saves).
- `@opengamehq/sdk/avatar` names each part and gives a hex per color in the SDK's table. It
  takes the layout from `packages/shared`, so do not split the strings yourself: a
  positional split turns `cape-watch` into one accessory.
- `avatar` and `match` colors follow the head (`followsHead`); their `hex` is the
  head's unshaded swatch, and OpenGame renders `avatar` darker by garment. `head.finish`
  marks patterned, metallic, neon and glass colors whose `hex` is an approximation. `mono` is black on
  light pages and white on dark ones. `identity` picks a face set: do not use it for
  gender, pronouns or voice.
- Ids are not checked against a catalogue. Map each part through a table in your game and
  fall back to your default for any id the table lacks; an outfit in an unknown
  version comes back as `outfit: null`, so put their head on your default body.
- `portraitUrl(avatar, { size, theme })` gives the address of the player's head as a
  transparent PNG, drawn by OpenGame, or null when there is no OG. The address is keyed
  by the look alone and names nobody, and the image never changes, so cache it. `size`
  rounds up to one OpenGame draws (`64`, `128`, `256`, `512` pixels; the default
  is 256). `theme: 'dark'` draws the inks for a dark
  page. Any origin may load it, so set `crossOrigin = 'anonymous'` and use it as a WebGL
  texture too.
- No bundler: copy the SDK's `dist/avatar.js` (no imports) and load it from a module
  script with `OpenGame.og`. Native engines get raw recipes from the bridge's
  `player()`; call `readAvatar` in the page and pass the JSON in.
- Local: `?og-dev-player=signed-in` or `og.init({ dev: { player: 'signed-in' } })`
  gives look `circle.classic.white` and a `c4` hoodie, jeans, cape and watch.

## Do not

- Store the recipe or any part of it (local storage, saves, your server, analytics,
  error reports), or anything built from it: a cached model, a baked GLB (OG Clash
  writes both recipes into the GLB metadata), a replay. Log unknown ids to the console only.
  Remembering that the player chose "Your OG" is fine.
- Share an image of their OG except when the player chooses to share it.
- Ask the player to type or pick their OG.
- Send one player's recipe to another. A recipe relayed by a client is unverified and
  beyond what the player agreed to.
- Change the head, colors or accessories and still call it "Your OG". Scale, lighting,
  a team outline or badge, and a prop to hold are fine.
- Draw a stand-in OG when there is no recipe. Use your default character.

## Build it

| Game | Model |
| --- | --- |
| Three.js | `examples/avatar-threejs` in the SDK package. Copy `og-model.js` and `og-spec.js`, call `buildOg(avatar)` with `readAvatar`'s result, and call the old group's `userData.dispose()` before you replace it |
| Other JS engine | Your art drawn to `AVATAR-SPEC.md`, or the Three.js example on a separate canvas for menus and the title |
| Native (Unity, Godot, Kaigen, C/C++) | A GLB baked in the page with a painted face (OG Clash wrote one), or your art drawn to `AVATAR-SPEC.md` |
| 2D, lists, scoreboards | `portraitUrl(avatar)`: the head as OpenGame draws it |
| Custom art | `readAvatar` parts mapped to your meshes or sprites |

The Three.js example builds the figure from primitives only (spheres, capsules, lathes
and discs) at 1 unit per H, standing on y = 0 and facing +z. `og-spec.js` holds the
spec's lengths and catalogue colors as data and is generated from the same catalogue as
`AVATAR-SPEC.md`. Change the style freely: the spec's "What makes it an OG" list is what
has to survive. A part the example does not know is drawn with the spec's default.

OG Clash's bake paints the face into a texture: built in a Web Worker, merged to 1
skinned mesh, 1 PBR material, 1024 px atlas, 12-expression eye sheet; 2.01 m,
about 100,000 triangles, 4.4 MB; about 2 s in Node on a desktop Mac, 3.7 s first bake in
the browser; the worker bundle is 748 KB before compression. Built under the loading
screen as soon as OpenGame names the player (phones and tablets wait for the title, since
the engine's load is their memory peak), held until the menus, dropped on the canvas as
`og_custom_<hash>.glb`; it checks 21 joint names,
a metadata block with sizes in range, and the file name. Kaigen's side:
`/engines/kaigen#play-as-your-own-og`.

OG Clash's joint contract, 21 joints. `_r` is the OG's right (-X), on your left when
the OG faces you: `root`, `trunk`, `thigh_r`, `shin_r`, `foot_r` and the mirror, `arm_r`,
`forearm_r`, `wrist_r`, `finger_r0..2` and the mirror, `head`. Meters, +Y up, facing +Z,
feet at 0. Arms and the head hang off `trunk`, legs off the root. The bake carries no
joint scale; if your rig scales a parent, copy local quaternions, not world matrices or
Euler angles. One torso joint, so a twist happens at the hips; OG Clash capped chest
twist at about 45 degrees.

## Points of view (OG Clash's numbers)

- **First person, exploring (OpenGame's 3D world):** body shown, head and collar hidden;
  for hand actions the arms swap to a 0.78-size set through a 58 degree lens; world lens
  74 degrees, near 0.04 m, eye moved forward when looking down.
- **First person, shooting:** separate sleeves in the shirt color and hands on the
  gun's posed transform; third-person body hidden, not
  shrunk (a shrunk head and shrunk limbs spread white shards under the camera). Same hand
  color as third person: OpenGame's hands are the head color, and OG Clash's white
  first-person mittens on "Your OG" do not match the third-person hands. Viewmodel lens
  68 degrees over a 66 degree world; fill light, no viewmodel shadows. Fade OGs inside
  0.65 m, to 30% at 0.3 m. Capture looking down while downed too.
- **Third person, shoulder:** OG on one side (OG Clash: left, at the owner's request).
  2.6 m back, 1.15 m right, pivot 1.5 m, 58 degree lens; aiming 2.5 m and 1.0 m. Center
  at most 0.30 of frame width from the left; head 0.12 to 0.17 of frame width. Distances
  scale with OG height / 2, clamped 0.8 to 1.2. Aim along the camera ray, then check the
  gun-to-target line for walls. Carry long guns low and right, muzzle
  dropped; raise to the collar to aim, top tipped about 0.16 rad outward. Include hats in clearance. Hide the body when a
  wall pushes the camera inside it. Offer few views.
- **Fair play:** OGs differ in height and head size. In a competitive game give all
  players the same hitbox, capsule, eye height and speed. OG Clash, single-player, sets
  first-person eye height per OG.
- **Top-down:** the head is the identity; keep the head color and accessory readable, add a
  label or ring.
- **2D and side view:** `portraitUrl` gives the head in OpenGame's pixel style. Draw it
  at a whole multiple of its size with `image-rendering: pixelated`, or draw the head
  yourself from `AVATAR-SPEC.md`.
- **Menus:** turntable, menu-specific light (warm key, cyan rim), the old figure until
  the new one loads then a 0.24 s scale-in, still images in lists (live portraits stalled
  OG Clash at the 39th quick switch), eyes forced open in stills, the pose checked
  against the head.
- **Title and results:** the player's OG in the shot, about 0.27 to 0.30 of frame height
  on the title and 0.37 to 0.39 in victory; check each staged camera is not inside
  geometry and aims at the OG's real height.
- **HUD:** `@handle (You)` from `og.player.handle`; with no handle, the character's name
  and `(You)`, or `You` on "Your OG".

## "Your OG" in the roster

First in the list, with a label; equipped once loaded unless the player picked another
this session; outfit options that would replace it locked with a reason; changes wait
for menus (a sign-in during a run waits); sign-out removes it at the next menu; a guest
gets only the roster; one OG chosen once and used in all scenes.

## Fallbacks

No look: default character. Look, no outfit or unknown outfit version: their head on the
default body. Unknown part: default part. Failed or slow build: default character, log
the reason to the console, retry at the next menu (OG Clash: 90 s). Still building: the
previous figure, not an empty stage or gray stand-in.

## Memory

Boot does not wait for the OG beyond a short hold at the title for a build already under
way (OG Clash: 4 s at most), and the builder's download counts too. Few workers,
stopped when the character screen closes: OG Clash's desktop build runs a warm worker and a
spare and found 3 the limit (5 slowed imports), and phones get 1. Opening "Your OG" once added 861 MB to OG Clash's page (4 to 8 workers, builds
in advance, caches) and crashed an iPhone; the light mode for phones, tablets and
devices reporting 4 GB or less uses 1 worker, no builds in advance, a 24 MB model cache
instead of 96 MB, textures up to 1024 px. Import cost 144 to 188 ms over 5 frames, so
import only in menus. Change color and eyes as material parameters, not rebuilds. Test
in Safari on a real phone.
