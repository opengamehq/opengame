import { LIMITS } from "./limits-browser";
import * as wire from "./lobby-configuration-wire.js";
export type { LobbyChoice, LobbySetting, LobbyConfiguration, LobbySelection, LobbyAllowlist } from "./lobby-configuration-wire.js";
export { readLobbySelection, defaultLobbySelection } from "./lobby-configuration-wire.js";
export const readLobbyAllowlist = (value: unknown) => wire.readLobbyAllowlist(value, LIMITS.platform.manifest);
export const lobbyAllowlist = (config: wire.LobbyConfiguration) => wire.lobbyAllowlist(config, LIMITS.platform.manifest);
