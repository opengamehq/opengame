# opengame-multiplayer changelog

## 1.1.1

Kaigen has multiplayer built in, with Kaigen Online for sign-in, sessions, friends, signalling and TURN relays. A player's page can host over WebRTC, a dedicated server is reached over WebTransport with a `wss://` fallback, and an offline fallback keeps the review sandbox rendering. Kaigen doesn't read `og.invite.code` yet, so its players join through Kaigen Online. (18 Nov 2026)

## 1.1.0

Two rules. Invites are the game's page on opengame.io with `?join=CODE`, built with `og.invite.link`, and a player who opens one joins that lobby with no menu. PeerJS runs on the creator's own PeerServer over `wss:`, with TURN credentials issued by their server, prefixed peer ids, and a host hand-over that keeps the lobby's id.

## 1.0.0

First release. Multiplayer as Last Contact (LC) built it, four-player private lobbies on a
relay that never simulates, measured on headless pages and never deployed, and as OG
Snipers (OS) faked it, lobbies of up to 32 where bots stand in for players: one authority
deciding outcomes, capped messages, host migration and rejoin, smooth remote players, every
seat loaded before the countdown ends, a menu that never pauses the match, believable bot
lobbies, fair spawns and tiers, voice, tests with several real browsers through a bad
network, and a report that names what nobody has done.
