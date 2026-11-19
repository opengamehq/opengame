> Carried from `opengame-multiplayer` 1.1.1. Read it when: Build multiplayer for a browser game, or a lobby where bots stand in for players. Covers one authority deciding what happened, a relay that only forwards and polices, capped messages, host migration and rejoin, smooth remote players, the lobby as the loading screen, a match that never pauses, bot lobbies, fair spawns, voice, testing several browsers and naming what was never proven. Use when the person asks for co-op, online play, private lobbies, voice chat or bots that feel like players.


# Multiplayer

This skill is for a browser game that more than one person plays at once, and for the
single-player game that has to feel like one: a lobby filled with bots presented as
players. It comes from two games and an honest gap. LC built four-player private lobbies,
with rooms on a Cloudflare Worker and Durable Objects, and measured them on headless pages;
they were never deployed, nobody played them by hand, and no voice was ever spoken or
heard through them. OS filled lobbies of up to 32 with bots and built no networking at
all; the owner judged it by whether it felt online. So the rules say what was measured,
and where nobody has been yet, and every report you write about multiplayer does the same.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes. LC's
protocol, its liveness and rejoin numbers, smoothing code and the test rig are in
[references/netcode.md](references/netcode.md). OS's simulated lobby (arrivals, churn,
names, caps) is in [references/bot-lobbies.md](references/bot-lobbies.md).

**OpenGame does not run your rooms.** The OpenGame SDK has no rooms, lobbies or relay; its
multiplayer module was removed, so do not build on room calls left in older integrations.
The game brings its own server. `opengame-deploy` covers how the game reaches it: the
game's exact origin on the server's allow-list, a token in a header or the first socket
message and never a cookie, and a first frame that still draws when the server is out of
reach. `opengame-sdk` gives each player a name and an OG for the lobby, and the invite link
(`og.invite`) that opens the game on OpenGame. The full guide, with server settings, is at
https://docs.opengame.io/guides/multiplayer. How bots move, aim
and get unstuck is in `opengame-enemies`; the lobby's shown gate and byte budgets are in
`opengame-loading`; the press that starts play and pointer lock are in `opengame-front-end`.

**Kaigen has multiplayer built in.** An authoritative server with client-side prediction,
plus Kaigen Online for player sign-in, sessions, friends, signalling and relays. Without a
game server of the creator's own, a player's browser page can host the match over WebRTC:
Kaigen Online introduces the players and relays traffic through TURN when a direct
connection fails, with short-lived TURN credentials it issues per session and never in the
bundle, and relay-only mode hides each player's IP address from the others. A dedicated
server is reached over WebTransport with a WebSocket (`wss://`) fallback, so it needs a TLS
certificate for a domain name. With no connection, a Kaigen game starts as a local offline
host, so it renders and offers solo play in the review sandbox. Kaigen doesn't read
`og.invite.code` yet: its players join through Kaigen Online's session list and friend
invites, so the invite rule below applies to other engines. The rules on authority, host
loss, smoothing, loading and testing still apply. Kaigen's page:
https://docs.opengame.io/engines/kaigen#multiplayer.

## Rules

### An invite opens the game on OpenGame and seats the friend
- **Invariant:** Every invite or lobby link the game shows is the game's page on opengame.io with `?join=CODE`, and a player who opens one lands in that lobby with no menu in between. When the lobby is gone or full, the game says so and offers a new lobby or solo play.
- **Technique:** Build the link with `og.invite.link(code)` and show the code beside it, since `link` returns null outside OpenGame and for a code the page would change. After `await og.init()`, a set `og.invite.code` means the player opened an invite: join that lobby at once. Use 4 to 12 capitals and digits without look-alikes for codes people read out, or 22 characters of `A-Z a-z 0-9 _ -` for an id they only copy. Never link to the game's `<label>.opengame.gg` address: opened in a tab it shows a page pointing to OpenGame and drops the code. A code is not a password, so a private lobby has the host accept players or locks once full.
- **Reference configuration:** The owner asked on 16 Nov 2026 that "the multiplayer lobby link is opengame so people who join get put right into lobby on opengame". OG HERO's six-letter rooms link to its game page with `?join=CODE`, and the page starts the game as it opens on a computer; on a touch screen the player presses Play first and the code still arrives.
- **Applies when:** Any game with lobbies, rooms or private matches, except a Kaigen game, whose players join through Kaigen Online until Kaigen reads `og.invite.code`.
- **Verify:** Two separate browsers through opengame.io: one hosts and copies the invite, the other opens it and is in the host's lobby within seconds, with no menu pressed.

### PeerJS runs on servers the creator chose
- **Invariant:** A published PeerJS game signals through a PeerServer the creator runs over `wss:`, reaches players behind strict routers through TURN, keeps TURN credentials out of the bundle, and uses peer ids no other app can take.
- **Technique:** Run `PeerServer` from the `peer` package behind TLS with `allow_discovery: false`, `corsOptions` naming the game's exact origin, and an `Origin` check in front of its socket (`opengame-deploy`). Pass `host`, `port: 443`, `secure: true`, `key` and `config.iceServers` to `new Peer`. Use STUN plus a TURN provider whose short-lived credentials the creator's server issues. Prefix peer ids with the game's name; PeerJS ids are letters and digits with single `-`, `_` or spaces between, so use short codes. On host loss, the next host retries for the lobby's id until the signalling server frees it.
- **Reference configuration:** The public `0.peerjs.com` is shared by every PeerJS app with no uptime promise. OG HERO's host migration lost players until the new host retried its claim once the old host was gone and re-sent state every two seconds (four browsers, the host killed mid-song). `opengame check` warns on each STUN or TURN server a game names and notes the PeerJS defaults.
- **Applies when:** Games that connect players with PeerJS or raw WebRTC, except Kaigen, whose signalling and TURN come from Kaigen Online.
- **Verify:** Kill the host's browser mid-match: another player hosts and an invite shared before still joins. Join from a phone network: the connection goes through TURN.

### Players send what they did; one authority decides what happened
- **Invariant:** Each player's own movement and shots answer on their own page at once and never wait on the network. Every outcome that matters (damage, kills, pickups, points, enemy state, doors) is decided by one authority, the host page or a server, and a client's report of a hit is a claim that authority checks, never a result it accepts.
- **Technique:** Generate the map from a shared seed. Each page simulates its own body and sends its pose and inputs; a shot goes out with its origin, direction and time, and the authority tests it against its own copy of the world (line, range, rate of fire, what stands in the way) before applying damage. The authority owns every shared object and the rules. Scores the game reports to OpenGame stay the game's claim (`opengame-sdk`).
- **Reference configuration:** LC: the map comes from the seed; each player's body and shots belong to their own page; the host page owns the zombies, the tide, the stations, doors, points and weather; a hit claimed 40 m off the round's line was refused on four pages. OS ran its whole lobby on one page and gave every bot the human input path, recoil, scope and bolt, so a bot's shot went through the same rules as the player's.
- **Applies when:** Co-op and competitive games with shared state.
- **Verify:** A test client sends a hit 40 m off its line, a kill it did not make and a pickup out of its reach; the authority refuses each and logs why.

### The relay forwards and polices; it never simulates
- **Invariant:** The relay passes messages between pages, keeps the host's latest checkpoint and enforces limits, and runs no game logic. Every message kind has a declared size and rate shared by page and relay, a client that breaks them is closed, and nothing over a limit is dropped without a count and a log line.
- **Technique:** One protocol module imported by both page and relay, naming each message kind with its byte size, rate and direction. The relay counts fouls and closes a line after a few, refuses oversized frames and floods, and logs every drop. A capability number in the welcome message lets two builds share a room or turns the older one away with a reason. Private rooms take short join codes from an alphabet without look-alike characters, with a lockout after repeated wrong codes. Keep each room's state in one object of its own, so a room outlives a page reload.
- **Reference configuration:** LC's relay is a Cloudflare Worker with two SQLite Durable Objects that "never simulates anything". A body update is exactly 28 B at 30 a second; events are 6-32 B; the host's checkpoint is up to 4096 B about once a second, kept by the room; the host's world update is up to 1200 B at 80 a second (at an earlier cap of 32 a second, the room "dropped what was over without a word"); a client's request to the host is up to 29 B; chat is up to 200 characters. Eight fouls close the line, as does a frame over 4200 B or more than 300 frames a second. Join codes are 6 characters, and 10 wrong codes lock an address for a minute. With three players a guest received about 5,100 B/s and the host sent about 4,925; the relay billed about 13,000-19,000 requests a room-hour.
- **Applies when:** Any game with a relay or room server.
- **Verify:** Fuzz the relay from a test client with oversized, malformed and over-rate frames: each is refused or closes the line, and each drop appears in the log with its kind.

### The host can leave at any moment
- **Invariant:** When the host's tab closes or goes silent, a standing player becomes host almost at once and the world keeps moving; a stall on one page's main thread drops nobody; and a player who reloads rejoins their own seat with what they had.
- **Technique:** Run the socket in a Web Worker, so a long frame on the main thread cannot silence it. Detect silence on both the room and the page within seconds, retry with a short backoff, and hold a seat for minutes, longer than a page's own boot on a busy machine. Migrate on the close code for a page going away or on an away message sent from `pagehide`, to the lowest seat still standing, from the checkpoint the room keeps. Keep a rejoin token in the tab and in the browser with a Web Lock per seat. A reloading player is not drawn and cannot be hit until their page says it is playing, and respawns clear of enemies with a moment of grace.
- **Reference configuration:** The owner asked that "host migrations should come out of box too if host leaves" and that "no one disconnects randomly as a client". LC: the room declares silence at 2 s and the page at 3 s; retries at 0, 0.2, 0.4, 0.8 and then every 1 s; a seat is held 2 minutes, because 30 s was shorter than one page's boot on a busy machine; migration fires on close code 1001. The host was named 49-91 ms after a close, and zombies stood still at most 26 ms where they had stood 1.8-2.0 s; the first version handed the world to a downed player ("the night passed to a man who was out"), hence the standing rule. The rejoin token lasts 2.5 minutes, and a reload rejoins before the title with position, weapons and rounds kept. Respawn is at the player's own spot when no zombie is within 5 m, otherwise the nearest spot clear for 8 m, facing the nearest zombie, with 1 s of grace.
- **Applies when:** Games where one player's page hosts, and any room that must survive a player leaving.
- **Verify:** Close the host's tab mid-fight: a new host within 0.15 s and enemies still for less than that. Freeze a guest's main thread for 5 s: still seated. Reload a guest: back in the same seat with the same kit.

### Every player sees the same world, and other players move smoothly
- **Invariant:** What one player sees of shared things (which enemy model and variant, where another player stands and what they hold) matches what every other player sees, and other players move without jumps, pops or late arrivals.
- **Technique:** The authority picks cosmetic variants only from assets every seat has loaded, and sends its choice. Load every other player's model and gear in the lobby. Draw remote players a fixed interval behind, estimate each sender's clock offset from the smallest arrival delay over a short window, and extrapolate only a little past the last update. Measure drawn error on real pages, because a simulation of the smoothing can show gains that real pages do not. Spectating runs the same camera code as playing, from the watched player's position.
- **Reference configuration:** The owner asked for "perfectly synced and how players look on each others screens and how they move hold guns get hit go down (and can be revived)". LC drew remote players 100 ms behind, took the clock offset as the minimum of arrival minus send time over 2 s, and extrapolated at most 150 ms; drawn error had a median of 0.5 cm and a p95 of 18-22 cm, and 87 of 102 tail samples came from the sender's own long frames, "not the line". A simulation said one smoothing change took the p95 from 84 to 27 cm; real pages showed 71.7 against 71.8. Before cosmetics came from shared assets, 7 of 18 zombies were a different person on a guest's page; after, 18 of 18 matched. Remote players were first seen 5.15-6.05 s into a run until their models loaded in the lobby (then 0.16-0.19 s). Spectating sat 0-2 mm from the watched player's own lens.
- **Applies when:** Any game where players see each other or shared enemies.
- **Verify:** Screenshot one moment on every seat and compare variants and positions; log drawn error per remote player on real pages through a fight.

### Every seat is loaded before the countdown ends
- **Invariant:** The countdown ends only when every seated player's page has the map shown and every other player's model, gear and finishes loaded, so nobody appears late, empty-handed or as a stand-in, and the first minute of play downloads nothing new on any seat.
- **Technique:** Each page reports to the room when its map passes the "shown" gate and when every other seat's model and kit have loaded; the countdown waits for the slowest seat, with a visible wait and a cap after which a late seat joins as a loading player who is not drawn and cannot be hit. A player who joins mid-match loads everyone in the lobby screen before dropping in. The shown gate itself, the order of the download line and its budgets are in `opengame-loading`.
- **Reference configuration:** LC's remote players were first seen 5.15-6.05 s into a run until their models loaded in the lobby, then 0.16-0.19 s; "the megabytes move and do not grow". OS's deploy waits for every seated rifle and optic, and moved 19.6 MB of killstreak art, its largest first-match download, into the countdown; its owner had reported "it says 10 seconds, then 5, 4 and then nothing happens and the game just keeps loading?...".
- **Applies when:** Match-based games with lobbies, real or simulated.
- **Verify:** On every seat, a request log bucketed by phase shows nothing fetched in the first minute of play; a throttled seat holds the countdown, and no other player is ever drawn without their model.

### Opening a menu never pauses the match
- **Invariant:** The game's own menu, settings and idling never stop the shared match: other players, bots, timers, kill cams and spawns go on, the world's sound carries on ducked behind the menu, and a player in the menu stays in the world and can be hit. When the OpenGame page pauses the game, a networked page stops its own input, sound and drawing while the shared match runs on at the authority; a single-player game, bots included, pauses as the SDK says.
- **Technique:** Keep the simulation clock independent of the interface; the game's menu only captures input. In `og.onPause(true)` after play has started, a networked client stops sending input and mutes, and a host page hands the world to another standing seat rather than stopping it for everyone (the pause a page holds under its poster before Play is not a hand-off: that page has never held a world); a game with no network stops its simulation, timers and audio (`opengame-sdk`). Revive and bleed-out timers run on wall time. The press that starts play, pointer lock and spawning without a "click to take control" step are in `opengame-front-end`; inside OpenGame, fullscreen goes through `og.fullscreen.request()`.
- **Reference configuration:** OS's owner asked six times, among them "everyone needs to keep playing -> pause is just u opening menu not pausing the game!" and "u should hear the gameplay in background (muted a bit) but not just the voices"; in OS a visible paused player can be killed. LC's revive rings and bleed-outs run on the wall clock in co-op. Neither game measured a host page being hidden or paused by the page, so treat that path as untested.
- **Applies when:** Online games, co-op and bot-filled games presented as online.
- **Verify:** Film 10 s of the game's own menu open mid-fight: others move, timers run, the world is audible. Hide the host's tab: another seat takes the world, and the enemies keep moving.

### Bots standing in for players fill a lobby that reads as online
- **Invariant:** A lobby of bots presented as players arrives, leaves and behaves like one: it fills gradually and not always to the cap, some leave during and after the match, names look like real players' handles, nobody fakes speech, bots get no powers a person would not have, and the game says somewhere players can find it (the store page, a settings line) that bots fill empty seats.
- **Technique:** Draw arrival times from a long-tailed distribution and fill to the cap only some of the time; let a share leave during the match with a killfeed line, and most stay for the next. Generate handles in the style of real platforms, mostly lowercase, a minority with digits or underscores. Leave a bot's mic slot empty. Cap bot killstreaks and powers on the match clock. Once kill cams or replays exist the player watches bots closely, so give them the human input path and timing (`opengame-enemies`).
- **Reference configuration:** OS's owner: "it should feel like ur playing online multipalyer wiht real people". Arrivals are lognormal, filling to exactly 32 only 70% of the time ("always exactly 32 looks scripted"); 5-20% churn shows in the killfeed after "we should have bots leave the game throughout (not many of them maybe 10% of them)"; about 80% stay after the match; an empty mic slot ("never fake talking"). Handles: "realistic handles from playstation/steam/xbox ... mix of all lowercase" with numbers "maybe 10-15%" (owner); the generator lands 12.7% with digits or underscores, held after the third retune. Bots get only a counter-UAV, "at most once every 5 minutes for at most 30 seconds" (owner), and one shield per 5 minutes; a jam spaced on match time but timed on frame time lasted 90 s, not 30. Kill cams made bots visible, so no out-of-sight teleport and no one-frame head lock ("tells the player it was a bot").
- **Applies when:** Games that fill seats with bots presented as players.
- **Verify:** Log arrivals, departures, names and mic states over ten simulated lobbies: fill and churn land in their ranges, and a frame-by-frame look at bot kill cams shows no snap.

### Seats, spawns and quality tiers are fair at every size
- **Invariant:** The seat count follows the map's area and the frame budget, no player spawns in a rival's sight, and no quality tier lets one player see through cover that hides them from another.
- **Technique:** Cap a lobby by area per player. Gate spawns on line of sight and never relax the gate: glass, foliage, rails and lattice count as see-through, and fog does not hide. Scale spawn distances to the map rather than using one ideal distance. Measure frame cost per live body, so a drop in the first minute is read as the lobby filling. Compare quality tiers in a gameplay-only A/B of cover, sightlines and doors.
- **Reference configuration:** OS capped lobbies at 32 on big maps and 14 on the smallest; "Glass, foliage, rails and lattice count as see-through, because snipers shoot through what they can see through"; a fixed 40.6 m ideal spawn distance saturated on small maps. Frame time scaled with live bodies: 3.0 ms with one, 14.4 ms at 24, up to 39 ms at 32. A low tier that thinned tree crowns let "a weak-machine player see through cover that hides players on normal machines".
- **Applies when:** Competitive games, real or with bots, and any game with quality tiers.
- **Verify:** A spawn audit per map with every spawn's sight lines to every other; a frame-time table by live bodies; a tier A/B of the same sightlines.

### Voice opens on the player's press and lives in the world
- **Invariant:** The microphone opens only on the player's own press and shows when it is live; proximity voice falls off over a long range and through walls; the game makes room under a voice; players know a peer-to-peer call shares their IP address with the others; and nothing about voice is called working until people have talked through it.
- **Technique:** A WebRTC mesh carries a few players. Past that, or when players must not see each other's addresses, relay voice through a server (TURN or a forwarding server). Ask for the mic from a click, never at load. Route each remote voice through the game's spatial audio: gain by distance with a smooth roll-off to silence, a muffle through walls, and a light duck on the game's mix while anyone speaks. Let the host choose proximity or everyone, and keep a mute per player. Prove the graph with a tone fed in at known distances, and write in the report that no voice was heard.
- **Reference configuration:** LC (designed, never heard): a WebRTC mesh with Opus and STUN only and no TURN server, so a player behind a strict NAT would have had no path, and nobody tested one. The mic opened only on the player's press; proximity gain was 0.7 at 40 m, then a raised cosine to 0 at 90 m; through a wall x0.6 and a 900 Hz low-pass; the game ducked 4 dB under a voice; text chat took up to 200 characters. The owner had asked that players "can choose proximity or omni chat (host) for voice chat" and that the "master volme of game may need to come down a bit and make sure proximity chat has a large range and is well implemented". OS left every bot's mic slot empty.
- **Applies when:** Any game with voice or text chat.
- **Verify:** A tone injected as a remote voice and measured at the output at 10, 40 and 90 m and behind a wall; the mic stays closed until a real press; the report names what nobody has heard.

### Test several real browsers in one job, through a bad network
- **Invariant:** Multiplayer claims come from real game pages, several in one test, through a network that delays, jitters and loses packets, with each measuring tool proven and at least one player driven by real input events.
- **Technique:** Run all the pages of one test as a single job in your machine's job queue, so the browsers share one slot rather than each holding one and waiting for another. Put a relay that delays, jitters and holds packets between the pages and the room server, because the browser's own network throttling does not hold WebSocket frames. Count frames at the draw call, not at animation callbacks. Give test players a cheat that only scripts can turn on, leaving one vulnerable so damage is still tested. Never read the canvas back inside a timed window. Press every lobby control with a real input event at least once. Test the room server alone, without a browser, at the protocol's edges.
- **Reference configuration:** LC: four pages reported "56.9-57.3 fps" from animation callbacks while 17.4-18.5 frames a second were drawn; "no button of the lobby's panel ever answered a real press" until the director pressed one; a canvas read-back froze a timed revive for 3 s; 114 room tests ran with no browser; a load test put two rooms of two on one machine with one player reloading over a 20 Mbit line. Its test pipe ran at 200 ms and 2% loss.
- **Applies when:** Any multiplayer game tested by agents.
- **Verify:** A recorded four-page run through the pipe at 200 ms and 2% loss, one player on real input, frame counts from the draw call and every lobby control pressed.

### Say what nobody has done
- **Invariant:** Every multiplayer report names, at the top, each human part nobody has done yet: a deployed relay, people playing by hand on separate machines and networks, a voice spoken and heard, a connection through a strict NAT, a real controller. Headless pages on one machine prove the protocol, not the experience.
- **Technique:** Open each handover with the list of what was never done, and remove an item only when somebody has done it, saying who, when and how. Ask the owner for a session with real people on separate networks before calling it ready. Keep numbers from simulations apart from numbers from pages.
- **Reference configuration:** Every LC net handover opened "NOTHING IS DEPLOYED. NOBODY HAS SPOKEN OR LISTENED. NOBODY PLAYED BY HAND." Its lobbies were built and measured on headless pages, never deployed and never played by people. OS built no networking, and its owner judged the bot lobby only by whether it felt online.
- **Applies when:** Every multiplayer report.
- **Verify:** The report's first lines list what is untested, and each item taken off the list names who did it and when.

### The game connects from its own origin and plays without its server
- **Invariant:** The game reaches its server only from its exact OpenGame origin with a token of its own, draws its first frame and plays alone when the server is out of reach, and tells the player in plain words what failed. A name a client sends is a claim that labels a player and never decides a ban, a reward or a seat.
- **Technique:** Put the game's origin on the server's allow-list, never a pattern on the games domain, and send a token in a header or the first socket message, not a cookie (`opengame-deploy`). Name players from `og.player.handle`, falling back to a guest name when it is null; key a save on `og.player.id` only when it is a string, and key a seat on the room's own rejoin token (`opengame-sdk`). Start solo play without waiting for the lobby; a lobby that cannot connect says so and offers solo.
- **Reference configuration:** OpenGame's review sandbox does not reach the internet, and automatic review plays every game (`opengame-deploy`). OpenGame serves each game from its own origin and an experiment's versions from `v-` origins, each of which the server must allow; guests and players who do not share their OG have no handle, and guests have no id. LC's room server and pages only ever ran on one machine, so neither path was tried against a real origin.
- **Applies when:** Every multiplayer game published on OpenGame.
- **Verify:** Block the server's host and boot the game: the first frame draws, solo starts and the lobby shows a plain error. Connect from the published origin without a token: refused. Join as a guest: a guest name shows and the seat holds through a reload.

## Before you call multiplayer done

Run each and say which you could not run; an unrun check is unverified.

- A fuzzed relay, a lying client refused, and the host's tab closed mid-fight.
- Four real pages through a bad network, one on real input, frames counted at the draw.
- A request log from boot through the lobby with nothing fetched in the first minute.
- The game's own menu filmed mid-fight, and the host's tab hidden mid-fight.
- The list of what nobody has done, at the top of the report.
