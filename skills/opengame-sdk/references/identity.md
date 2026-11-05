# Who the player is

| Situation | `id` | `handle`, `ogNumber` | `avatar` | `signedIn` |
| --- | --- | --- | --- | --- |
| Signed in, sharing their OG in games (the default for new accounts), with a handle | Stable for this player in this game, on every device | Their public handle and number | Their head, and their outfit if they have one | `true` |
| Signed in, sharing off (turned off, or an older account that never turned it on) | Stable as above | `null` | `null` | `true` |
| Signed in, no handle claimed yet | Stable as above | `null` | As sharing allows | `true` |
| Guest | `null` while accounts are in private testing; otherwise stable in this browser for this game | `null` | `null` | `false` |
| Private preview | `null`. Identity is not offered; scores stay separate from public ones | `null` | `null` | `false` |
| Outside OpenGame, by default | `dev-guest` | `null` | `null` | `false` |
| Outside OpenGame, as a signed-in player | `dev-account` | handle `dev`, number `1` | a sample head and outfit | `true` |

Read the fields where you use them, `og.player.id`, `og.player.handle`,
`og.player.ogNumber`, `og.player.signedIn` and `og.player.avatar`, rather than keeping a
copy: each one is the current player.

Pick the local player with `og.init({ dev: { player: "signed-in" } })` or
`?og-dev-player=signed-in` on the page address; `guest` and `no-handle` work too.

**The private rollout.** While OpenGame accounts are in private testing, a game gets a
signed-in player only for a member who has confirmed they are 18 or older. Everybody
else, signed in or not, plays as a guest with `id: null` and can still save scores
through the page's guest credential. So a game cannot assume a string `id`: key
per-player storage on `id` only when it is one, and keep a guest's progress in the
game's own storage. The local mock's guest has `dev-guest`, so this path runs only on
OpenGame: test the published game signed out.

## When the player arrives

The page answers the SDK's first message with the player, while the game is still
loading. Under the injected global that first message goes out as the script loads,
before the game's own code runs, and a shipped `dist/opengame-global.js` does the same
on OpenGame. With the npm import or `dist/opengame.js` it goes out at `og.init()`.
Either way:

- Call `og.init()` before anything heavy, and subscribe at once: `og.player.onChange`
  and `watchAvatar` call the listener with the current player straight away and again
  on every change.
- Start the work the player needs, such as building "Your OG", as soon as it is known.
  Show it at the first menu. Only the swap into a running scene needs to wait for a
  menu.
- While the page is still confirming the account it sends a pending notice, and `og.init()` waits about
  10 seconds more for it. A guest stays a guest until then;
  `onChange` fires if the account arrives.

OG Clash, 28 Oct 2026: it asked for nothing until its engine reached the title, then
built the OG on a cold worker, so the first menu showed the default character and the
player's own appeared most of a minute later. Starting the build when the player is
known, under the loading screen, fixed it.

## What it is and is not

- The per-game `id` cannot be joined across games: the same person has a different id
  in every game. That is the point of it; do not try to work around it.
- `handle` and `ogNumber` are public profile values, the same across games, and only
  for a player who shares them, which new accounts do by default. A game may show
  them, link them and recognise a returning handle; say so in the game's own copy if
  it matters to players. A player can turn sharing off at any time, so fall back to a
  guest name when they are `null`. They are never a storage key, because they can be
  null for a signed-in player and can change.
- The SDK never gives the game an email, the account's real id, a friends list or a
  browser fingerprint, and a game should never ask for them.
- A guest's id lives in one browser. Clearing site data makes a new guest; only scores
  carry over when a guest signs in.

## Names

Every name the game asks this player for, or shows as theirs, starts as their handle.
That covers a call sign, a trainer name, a player name, a nickname, and their own HUD
label or nameplate. Fill each one from `og.player.handle` inside `og.player.onChange`,
and let the game's own default stand when it is null. The listener runs at once and
again when the page confirms the account late or the player signs in or out. Stop
filling a field once the player edits it, so a name they typed stays. When the game
restores a name the player saved in an earlier session, show that one and do not fill. A
handle is 3 to 20 characters of letters,
digits, `_` and `-`; allow the longest in the field, in the game's own name check and
wherever the name is drawn. Never write the handle into the game's own save as if it
were the player's identity.
Leaderboard entries carry their own `name`; show it as given, and expect `null` on a
few old rows.

## Changes while playing

`og.player.onChange(listener)` fires with the current player at once and again when a
guest signs in, an account changes, or a refreshed session changes what the player
shares. During an account change the
old credentials are removed before the new ones are verified, so read `og.player` in
the callback instead of caching it.

## Asking to sign in

`og.player.requestSignIn()` asks the page to open its own sign-in dialog. Offer it only
when `og.capabilities` includes `identity`, and only from a player's action ("Sign in to
save your score"). The game keeps running; `onChange` fires when they return signed in.

## The player's OG

`og.player.avatar` is `{ seed, palette, look?, character? }`. `look` (the head) arrives
only when the player is signed in, has turned on "Show my OG in games" and has made one;
`character` (the body and outfit) arrives only beside a `look`. A guest, and every
player in a private preview, gets null, and then `og.capabilities` has no `avatar`.
With no `look`, draw the game's default.

```js
import { watchAvatar } from '@opengamehq/sdk/avatar'
const stop = watchAvatar(og, avatar => avatar ? useYourOg(avatar) : useDefaultCharacter())
```

`watchAvatar` calls at once and then only when the recipe changes, so a model is not
rebuilt on every session refresh. `readAvatar` names the parts of one recipe. Do not
store the recipe or send it anywhere; a player who turns sharing off expects their OG
to leave the game. Building and showing it is in `opengame-characters`.
