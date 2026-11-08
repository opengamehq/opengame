# Changelog

## 0.3.0

- OG Radio: `@opengamehq/sdk/radio`, also `OpenGame.radio` in the injected global. A game
  lists stations and songs (A to Z, searched within all radios, a station or a station's
  genre), sends play, pause, skip, shuffle, repeat and volume, and hears back what is
  playing; the page plays the music at the player's radio volume, so the game never holds
  an audio URL. `radio.mountPicker` draws a complete, themeable picker. Sound starts only
  from a press in the game and stays off while the game is muted.
- Leaderboards take stat columns, variant tags and a keep rule, declared in
  `opengame.json`. `og.leaderboard(key).submitRun({ value, stats?, tags?, meta? })` submits
  a run; `top`, `me` and `around` take `sort` and `filter`, and `top` takes `offset`.
  Entries gain `stats` and `tags`; pages gain `total`, `offset`, `sort`, `filter` and
  `shape`; receipts gain `ignored`. `submit(value, meta)` and `top({ limit })` send exactly
  what they sent before.
- New error codes: `invalid_run` (a stat or tag the run cannot carry) and `invalid_query`
  (a sort, filter or offset a read cannot take).
- The local mock reads `opengame.json` through the same board parser as og-api and the
  manifest check, so a declaration it accepts is one a deploy accepts. It refuses keys
  with hyphens, which the manifest never allowed, and boards stored by an earlier version
  start fresh once.
- The native bridge's `board.submit` takes `stats` and `tags`, and `board.top`, `board.me`
  and `board.around` take `sort`, `filter` and (for `top`) `offset`.
- The core is about 2.8 KB gzip larger, most of it the shared board parser.
- Career boards (`keep: "career"`): a board fed from another board's accepted runs, whose
  score and columns aggregate them. Pages describe one with `from`, `scoreAgg` and each
  column's aggregate. `submit` and `submitRun` to one fail locally with `invalid_run`, and
  og-api refuses them hosted. The local mock cross-checks a career board against its source
  as the manifest check does. The core is about 400 bytes gzip larger again, most of it the
  shared parser's career rules.

## 0.2.0

- First release on npm. This version is published by hand and has no npm provenance
  statement; versions published from the public repository's workflow will.
- `AVATAR-SPEC.md` is in the package: the style spec for drawing a player's OG in any
  engine from the recipe that `@opengamehq/sdk/avatar` parses. `AGENTS.md` is in it too:
  the short rules for a coding agent and the error catalogue.
- Multiplayer is removed from the SDK. Games keep identity, leaderboards, achievements,
  events, pause, mute, fullscreen and external links. Removed:
  - The `@opengamehq/sdk/multiplayer` and `@opengamehq/sdk/netcode` entry points, and the
    script-tag builds `opengame-multiplayer.js` and `opengame-netcode.js`.
  - From `@opengamehq/sdk/multiplayer`: `multiplayer`, `Multiplayer`, `Room`, `RoomError`,
    `Lobby`, `mountLobby`, `binaryHeaderBytes`, `errorCatalogue` (now on the global only,
    as `OpenGame.errorCatalogue`), and the types `LobbySelection`, `LobbyOptions`,
    `LobbyViewOptions`, `LobbyState`, `LobbyTheme`, `MigrationAdapter`, `AuthorityChange`,
    `RoomMember`, `RoomConfiguration`, `Channel`, `Json`, `BinaryPayload`, `RoomData`,
    `RoomPeer`, `Signalling`, `RoomPhase`, `RoomReadiness`, `PhaseOptions`, `RoomClock`,
    `RoomEvents`, `PeerStats`, `RoomStats`, `HostOptions`, `JoinOptions`, `SendResult` and
    `ErrorEntry`.
  - From `@opengamehq/sdk/netcode`: `objectSchema`, `numberField`, `booleanField`,
    `stringField`, `oneOf`, `arrayField`, `tupleField`, `nullable`, `defineMessages`,
    `InputHistory`, `InputQueue`, `symmetricQuantizer`, `lagCompensationMs`, `cyclicLerp`,
    `extrapolateScalar`, `smoothCamera`, `EventLedger`, and the types `Validator`,
    `Fields`, `GameMessage`, `InputCommand` and `LedgerEntry`.
  - From the global: `OpenGame.Multiplayer`, `OpenGame.Room`, `OpenGame.RoomError`,
    `OpenGame.Lobby`, `OpenGame.mountLobby` and `OpenGame.netcode`.
  - The capabilities `multiplayer` and `lobby-controls`.
  - From the native bridge: the operations `room.host`, `room.join`, `room.joinInvite`,
    `room.close`, `room.ready`, `room.phase`, `room.state`, `room.stats` and `room.now`;
    the events `room.join`, `room.leave`, `room.message`, `room.phase`, `room.close`,
    `room.readiness`, `room.clock`, `room.signalling`, `room.members` and
    `room.configuration`; and `send`, `sendTo`, `disconnectPeer` and `maxPacketBytes`.
  - From `@opengamehq/sdk/og-platform`: `OG_RTC`, `OG_DIRECT_ONLY_NOTICE`, `ogJoinCode`,
    `ogInviteBase`, `ogLobbyTicket`, `ogIceServers`, `ogPeerOptions`, `ogHostPeerId` and
    `ogLobbySession`.
  - The room error codes `broker_unavailable`, `capacity_mismatch`, `checkpoint_too_large`,
    `closed`, `configuration_changed`, `connection_failed`, `connection_lost`,
    `host_lease_active`, `host_left`, `host_only`, `host_taken`, `ice_failed`,
    `identity_in_use`, `identity_unavailable`, `invalid_capacity`, `invalid_channel`,
    `invalid_checkpoint`, `invalid_configuration`, `invalid_message`, `invalid_name`,
    `invalid_peer`, `invalid_phase`, `invalid_readiness`, `invalid_room`, `left`,
    `local_unavailable`, `match_started`, `membership_changed`, `message_too_large`,
    `migration_unavailable`, `not_configured`, `not_connected`, `not_found`, `not_ready`,
    `refused`, `relay_unavailable`, `restore_failed`, `restore_not_ready`, `room_full`,
    `room_membership_required`, `room_not_found`, `session_expired`, `session_pending`,
    `signalling_lost`, `stale_epoch`, `stale_name_revision`, `ticket_rejected`,
    `token_rejected` and `version_changed`.
  - The `peerjs` dependency.
- `og.multiplayer` remains as an inert object whose calls answer `unavailable`, so games
  built against older integrations keep working.
