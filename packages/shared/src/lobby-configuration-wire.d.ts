export type LobbyChoice = Readonly<{ id: string; label: string; description?: string }>;
export type LobbySetting = Readonly<{ key: string; label: string; kind?: 'map' | 'choice'; default: string; choices: readonly LobbyChoice[] }>;
export type LobbyConfiguration = Readonly<{ settings: readonly LobbySetting[] }>;
export type LobbySelection = Readonly<Record<string, string>>;
/** Compact IDs only. Labels stay in the immutable manifest on the parent page. */
export type LobbyAllowlist = readonly (readonly [key: string, choices: readonly string[], initial: string])[];


export type LobbyConfigurationPolicy = Readonly<{lobbySettingsMax:number; lobbyChoicesMax:number; lobbyIdCharsMax:number}>;
export declare function readLobbyAllowlist(value:unknown, policy:LobbyConfigurationPolicy):LobbyAllowlist | null;
export declare function lobbyAllowlist(config:LobbyConfiguration, policy:LobbyConfigurationPolicy):LobbyAllowlist;
export declare function readLobbySelection(value:unknown, allowlist:LobbyAllowlist):LobbySelection | null;
export declare function defaultLobbySelection(allowlist:LobbyAllowlist):LobbySelection;
