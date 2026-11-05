export const CREATOR_TOKEN_PATTERN = /^(oga|ogt)_([0-9a-f]{16})_([A-Za-z0-9_-]{43})(?![\s\S])/;

export const TOKEN_SCOPES = ["read", "deploy", "submit"] as const;
export type TokenScope = typeof TOKEN_SCOPES[number];
export type PlatformAction = TokenScope | "certify" | "tokens" | "account" | "preview";
export type Principal =
  | { kind: "session"; userId: string }
  // No `revoked` field: a revoked token never becomes a Principal, because the lookup in
  // apps/web/src/lib/agent-tokens.ts refuses it. A flag nobody could set to true was a
  // second, unused place where revocation appeared to be enforced.
  | { kind: "token"; userId: string; tokenId: string; origin: "device" | "automation"; scopes: readonly TokenScope[]; gameId: string | null };

export function hasAuthority(principal: Principal, action: PlatformAction, gameId?: string): boolean {
  if (principal.kind === "session") return true;
  if (action === "certify" || action === "tokens" || action === "account") return false;
  if (principal.gameId !== null && principal.gameId !== gameId) return false;
  if (action === "preview") return principal.origin === "device" && principal.scopes.includes("read");
  return principal.scopes.includes(action);
}
