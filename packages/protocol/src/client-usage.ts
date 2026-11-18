import { PACKAGE_VERSION_PATTERN } from "@opengame/shared/browser";

/**
 * Which developer tool made an API request, and which of its commands, for the server's
 * daily count of requests per token, tool, version and command.
 *
 * The question it answers, asked on 17 Nov 2026: do we know how people use the CLI and
 * which of its features? Until then the server saw `x-opengame-cli-version` on every CLI
 * request, read it for compatibility, and kept nothing. So the CLI and the analytics MCP
 * now name themselves and the command, and the server counts requests per token, client,
 * version and command per day.
 *
 * Only names from these lists are kept. The command header carries a command's name and,
 * for the three commands that take one, its subcommand: never an argument, a path, a game
 * id or a flag's value. Anything the server does not recognise is stored as `other`, so a
 * header cannot write free text into the table, and a newer CLI's new command is counted
 * rather than refused until this list learns its name.
 *
 * A command that runs on the machine alone (init, check, dev, vendor, setup, skills,
 * token, and deploy --dry-run) sends no command name. The CLI added no request for any of
 * them: init and check have asked the server since launch whether OpenGame is open, and
 * that request counts as `other`.
 *
 * This file is read by the CLI, the MCP server and opengame.io, so the vocabulary cannot
 * drift between the side that sends a name and the side that keeps it.
 */

/** The request headers. `x-opengame-cli-version` predates these and is still the CLI's. */
export const CLIENT_USAGE_HEADERS = {
  client: "x-opengame-client",
  command: "x-opengame-cli-command",
  /** Sent by the MCP server, whose own version is not the CLI code it bundles. */
  version: "x-opengame-client-version",
} as const;

/** `cli` and `mcp` name themselves. `cli-legacy` is a CLI from before 0.13.0, which sends
 * its version and nothing else; `api` is a token used with neither header, a script on the
 * raw API. The last two are the server's words, and a header that says either is `api`. */
export const CLIENT_USAGE_CLIENTS = ["cli", "mcp", "cli-legacy", "api"] as const;
export type ClientUsageClient = typeof CLIENT_USAGE_CLIENTS[number];

/** Every CLI command that talks to the API on a person's behalf, with `name:sub` for the
 * subcommands that change what it does. `other` is what anything else is kept as. */
export const CLI_USAGE_COMMANDS = [
  "deploy", "status", "publish", "submit", "login", "logout", "whoami", "limits", "games",
  "deployments", "releases", "rollback", "unpublish", "restore", "delete", "details", "handle",
  "jam:withdraw", "jam:reenter", "achievements", "achievements:retire", "stats", "link", "open",
  "pull", "upgrade", "jams",
] as const;

/** The commands that run on the machine alone. They send no command name (see above). */
export const CLI_LOCAL_COMMANDS = ["init", "check", "dev", "vendor", "setup", "skills", "token", "version", "help"] as const;

/** The MCP server's tools, sent as `mcp:<tool>`. */
export const MCP_USAGE_TOOLS = ["opengame_stats"] as const;

const KNOWN_COMMANDS = new Set<string>([...CLI_USAGE_COMMANDS, ...MCP_USAGE_TOOLS.map(tool => `mcp:${tool}`)]);
const SUBCOMMANDS: Record<string, readonly string[]> = { jam: ["withdraw", "reenter"], achievements: ["retire"] };

/** The name the CLI sends for a command line, or null for a command that sends none. Only a
 * subcommand from SUBCOMMANDS is appended; `achievements retire first-lap` is
 * `achievements:retire`, and the achievement's id goes nowhere. */
export function cliUsageCommand(command: string, sub: string | undefined, dryRun = false): string | null {
  if (dryRun || (CLI_LOCAL_COMMANDS as readonly string[]).includes(command)) return null;
  const named = sub !== undefined && SUBCOMMANDS[command]?.includes(sub) ? `${command}:${sub}` : command;
  return KNOWN_COMMANDS.has(named) ? named : null;
}

/** Bounded so a header cannot put an arbitrary string into a primary key. */
const VERSION = PACKAGE_VERSION_PATTERN;

export type ClientUsage = { client: ClientUsageClient; version: string; command: string };

/**
 * What a token-authenticated request says about the tool that made it, cleaned to the
 * vocabulary above. Never throws and never refuses: this is a count, and a request is
 * served whatever its headers say.
 */
export function readClientUsage(headers: { get(name: string): string | null }): ClientUsage {
  const named = headers.get(CLIENT_USAGE_HEADERS.client)?.trim().toLowerCase();
  const cliVersion = headers.get("x-opengame-cli-version")?.trim() ?? "";
  const ownVersion = headers.get(CLIENT_USAGE_HEADERS.version)?.trim() ?? "";
  const sentCommand = headers.get(CLIENT_USAGE_HEADERS.command)?.trim().toLowerCase() ?? "";
  const client: ClientUsageClient = named === "cli" || named === "mcp" ? named : !named && VERSION.test(cliVersion) ? "cli-legacy" : "api";
  const raw = client === "mcp" ? ownVersion || cliVersion : cliVersion;
  const version = VERSION.test(raw) ? raw : "unknown";
  // An MCP request names a tool and a CLI request a command; neither may borrow the other's.
  const command = KNOWN_COMMANDS.has(sentCommand) && (client === "mcp") === sentCommand.startsWith("mcp:") ? sentCommand : "other";
  return { client, version, command };
}
