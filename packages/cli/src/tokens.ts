import { tokenHandoffSchema, tokenManagementPath } from "@opengame/protocol";
import { apiOrigin } from "./http";
import { openBrowser } from "./browser";
import { CliError, Output } from "./output";

const TOKEN_RULES: Record<string, string> = {
  name: "--name takes a short name on one line.",
  scopes: "--scopes takes read, deploy or submit, comma-separated, each once.",
  game: "--game takes a game ID or public ID.",
  id: "--id takes the 16-character public token ID shown in your token settings.",
};

/** Token administration needs a browser session, including after CLI login. */
export function tokensCommand(action: string | undefined, flags: Record<string, string | boolean>, output: Output) {
  if (!["create", "list", "revoke"].includes(action ?? "")) {
    throw new CliError("token_action", "Use opengame token create, list or revoke.", undefined, { next: "opengame help token" });
  }
  // --human is global and opengame help token lists it, so it belongs here with the other
  // output flags: leaving it out refused the person it exists for, in a shell that carries
  // an agent's variable.
  const allowed = new Set(["json", "jsonl", "human", "no-browser", ...(action === "create" ? ["name", "scopes", "game"] : action === "revoke" ? ["id"] : [])]);
  for (const key of Object.keys(flags)) {
    if (!allowed.has(key)) throw new CliError("unsupported_flag", `The token ${action} command does not use --${key}. Run opengame help token.`, undefined, { next: "opengame help token" });
  }
  const input = tokenHandoffSchema.safeParse({ action,
    ...(flags.name !== undefined ? { name: flags.name } : {}),
    ...(flags.scopes !== undefined ? { scopes: String(flags.scopes).split(",") } : {}),
    ...(flags.game !== undefined ? { game: flags.game } : {}),
    ...(flags.id !== undefined ? { id: flags.id } : {}) });
  // One sentence per flag, for the flag that failed: a single sentence covering every rule
  // left a person to work out which of their four inputs it meant. The value is never
  // echoed, because the input this most often refuses is a pasted secret.
  if (!input.success) {
    const field = String(input.error.issues[0]?.path[0] ?? "");
    throw new CliError("token_request", `${TOKEN_RULES[field] ?? "Check the flags against opengame help token."} Never include a secret.`);
  }
  const url = apiOrigin() + tokenManagementPath(input.data);
  openBrowser(url, !output.json && !flags["no-browser"]);
  output.emit({ type: "result", command: `token ${action}`, data: { url, requiresBrowser: true, completed: false,
    message: `Open ${url}\n${action === "create" ? "Review the permissions and create the token in your browser." : action === "revoke" ? "Choose the token and revoke it in your browser." : "View your tokens in your browser."} Token management requires a signed-in browser session.` } });
}
