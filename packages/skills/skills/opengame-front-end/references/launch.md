# First run, share card and analytics

## The first run, screen by screen

OC's first run after the launch fixes, as a checklist to walk in a fresh profile:

- Title over key art, with a press-to-start that also unlocks audio (see `opengame-audio`).
- Character, with one forward button. The default name is "Player", so no name screen stands
  between a new player and the match.
- Loadout, where picking a gun equips it and Deploy starts the match.
- The arena, with a first-spawn hint naming the goal and the controls for the device in
  use (keyboard or touch), shown once per profile and closing after 12 s.
- Quit, Restart and Reset ask for a second press.
- Saves survive a reload, and a notice appears when site storage is blocked.
- Developer URL switches are off in production. OC kept a dev key only as a SHA-256 hash.
- The build label says "Early Access", not "Early build 0.1".

Check it with real key presses from the title, then reload and check the profile, because
OC's test shortcuts hid real save and dev-gate bugs.

## The share card

- Wide 1200x630 and square 1200x1200, both from a real in-game frame captured at final
  quality, with the logo, a call to action and the URL. OC kept the wide card under 1 MB,
  and a later note asked for a JPEG under 300 KB.
- Paint out the FPS counter and any dev overlay.
- Favicon hand-pixelled at 16 px, an apple-touch icon and a theme colour.
- Full Open Graph and Twitter card tags, checked on the live URL after deploy.

## Analytics

On OpenGame, send gameplay events with `og.track` from `opengame-sdk`. The page already
batches them, caps their size and rate, limits property keys, and measures plays and
sessions itself.

A game served from its own domain that runs its own analytics follows OC's pattern:

- Events go to a same-origin proxy (OC's was `/api/analytics`) that holds the analytics
  token on the server. The browser never sees it.
- An allowlist of event names and fields, an origin check, a size cap and a rate limit on
  the proxy. OC sent 19 events: the funnel, a run summary, settings changes and client
  errors.
- Do Not Track and Global Privacy Control are honoured before anything is sent.
- No IP addresses and no person profiles are stored.
- The run-end event answers design questions: outcome (a crash is reported with `navigator.sendBeacon`
  on `pagehide`), active time excluding pause, kills, headshots, score, phase at the end, device
  class, quality tier, FPS and build. Test it against mocks: one of OC's cleared-round
  counts fell from 2 to 0 with no error.
- A public leaderboard validates scores on the server, with run ids the server issues and
  plausibility checks, and never ranks dev runs.
