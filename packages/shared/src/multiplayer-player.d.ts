export type MultiplayerPlayer = Readonly<{ id: string; handle: string | null; ogNumber: number | null; signedIn: boolean }>;
export function readMultiplayerPlayer(value: unknown, handlePattern: string): MultiplayerPlayer | null;
