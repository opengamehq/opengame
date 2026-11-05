import { z } from "./zod";
import { TEXT, compiledCredentialPatterns } from "@opengame/shared/browser";
import { TOKEN_SCOPES } from "./authority";
import { gameIdentifierSchema } from "./catalog";

/** Browser handoff data only. A URL can describe a request, never authorize it. */
export const tokenNameSchema = z.string().trim().refine(value => {
  const length = [...value].length;
  return length >= 1 && length <= TEXT.agentTokenName.max &&
    !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value) &&
    !compiledCredentialPatterns("content").some(({ re }) => re.test(value));
}, "Use a short name without credentials or control characters.");

export const tokenScopesSchema = z.array(z.enum(TOKEN_SCOPES)).min(1).max(TOKEN_SCOPES.length)
  .refine(scopes => new Set(scopes).size === scopes.length, "Choose each permission once.");

export const tokenHandoffSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("create"), name: tokenNameSchema.optional(),
    scopes: tokenScopesSchema.default(["deploy"]), game: gameIdentifierSchema.refine(value => !/\s/.test(value)).optional() }),
  z.strictObject({ action: z.literal("list") }),
  z.strictObject({ action: z.literal("revoke"), id: z.string().length(16).regex(/^[0-9a-f]{16}$/).optional() }),
]);
export type TokenHandoff = z.infer<typeof tokenHandoffSchema>;

export function tokenManagementPath(request: TokenHandoff): string {
  const input = tokenHandoffSchema.parse(request);
  const query = new URLSearchParams({ action: input.action });
  if (input.action === "create") {
    if (input.name) query.set("name", input.name);
    query.set("scopes", input.scopes.join(","));
    if (input.game) query.set("game", input.game);
  } else if (input.action === "revoke" && input.id) query.set("id", input.id);
  const target = input.action === "create" ? "" : input.action === "revoke" && input.id ? `#token-${input.id}` : "#tokens";
  return `/settings/tokens?${query}${target}`;
}

export function parseTokenHandoff(params: Record<string, string | string[] | undefined>): TokenHandoff | null {
  const value = params.action === "create"
    ? { action: "create", ...(params.name !== undefined ? { name: params.name } : {}),
      ...(params.scopes !== undefined ? { scopes: typeof params.scopes === "string" ? params.scopes.split(",") : params.scopes } : {}),
      ...(params.game !== undefined ? { game: params.game } : {}) }
    : params.action === "revoke" ? { action: "revoke", ...(params.id !== undefined ? { id: params.id } : {}) }
    : { action: params.action ?? "list" };
  const result = tokenHandoffSchema.safeParse(value);
  return result.success ? result.data : null;
}
