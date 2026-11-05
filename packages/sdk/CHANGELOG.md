# Changelog

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
