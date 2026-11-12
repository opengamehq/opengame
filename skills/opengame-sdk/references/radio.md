# OG Radio

`radio` lets players browse OG Radio and listen while they play. The OpenGame page
plays the music at the player's own radio volume and keeps playing it in the site's player
after the game closes. The game never receives audio, so nothing changes in its audio
graph or its content security policy.

Reach it as `OpenGame.radio` in a game served by OpenGame, or bundle it:

```js
import { radio } from '@opengamehq/sdk/radio'
```

Check `radio.available`. It is false outside OpenGame and under `opengame dev`, where
every call returns `unavailable`: test the radio in a private preview.

## The picker

```js
const picker = radio.mountPicker(menuElement, { theme: { accent: '#ff3b30', radius: '4px' }, title: 'Music' })
picker.destroy()   // when the menu closes
```

All radios and each station with its song count down the left; a search field, the
station's genres and a numbered A to Z song list on the right; play, previous, next,
shuffle, repeat and volume along the bottom. Theme it with `theme` (`background`,
`surface`, `text`, `muted`, `accent`, `accentText`, `border`, `radius`, `font`), the same
values as `--og-radio-*` custom properties, or `::part()` (`panel`, `stations`, `station`,
`search`, `genres`, `genre`, `list`, `song`, `controls`, `control`, `volume`, `status`).
Keys inside it (`/`, arrows, Enter, Space, N, P, S, R, - and =) stop at the picker;
`{ shortcuts: false }` turns the letters off.

## Your own controls

```js
const stations = await radio.stations()            // A to Z, with counts and genres
const page = await radio.tracks({ station: 'pixel', genre: '8bit', q: 'dawn', offset: 0 })
row.onclick = () => radio.play({ track: song.id, genre: '8bit' })
radio.onChange(state => render(state.playing, state.track))
```

- `radio.tracks({ station, genre, q, offset, limit })`: `station` is a station id or `'all'`
  (the default). `genre` needs a station. `q` searches titles within that scope only,
  ignoring case and accents. At most 200 songs a page,
  always A to Z by title; `total` counts every match.
- `radio.play()` resumes; `radio.play({ track })` plays a song (Next stays on its station, or
  within `genre` when given); `radio.play({ station, genre })` tunes a station or genre.
- `radio.pause()`, `radio.next()`, `radio.previous()`, `radio.setShuffle(on)`,
  `radio.setRepeat(on)`, `radio.setVolume(level)` with a level from 0 to 1.
- A song has `id`, `title`, `station`, `stationName`, `genre`, `genreLabel`, `palette` and
  `attribution`. `art` is null (no cover art) and `duration` is null until it plays.
- `radio.state` is the last state reported. Its `station`, `track`, `genre`, `volume`,
  `shuffle` and `repeat` stay null until the game has played the radio itself, so it never
  learns what the player chose elsewhere or what another game left. `playing` is always there.

## Rules

- Sound needs a press: `play`, `next`, `previous`, shuffle, repeat and turning the volume
  up, from a click or key handler, or `gesture_required`. A press counts for a few
  seconds, as the browser's own rule does.
- `muted` while the player has the game's sound off on OpenGame, or another part of the page
  has the speakers; turning the game's sound off pauses radio the game started. Pausing and turning down always work.
- A pause the player makes in OpenGame's own player stands: the game cannot restart the
  radio for a few seconds, and then only from a new press.
- `setVolume` goes up only as far as the player set the radio, in steps of 0.05. A volume
  a game sets goes back to the player's when the game closes and is never remembered.
- 120 requests a minute (`busy` past that),
  searches up to 64 characters, `timeout` after
  5 seconds.
- `not_found` for an unknown station, genre or song id; `invalid_request` for a bad argument.
- A game does not have to credit the music. `attribution` is there for a now-playing line.
