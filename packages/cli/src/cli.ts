import { resolve } from "node:path";
import { z } from "zod";
import { ANALYTICS_WINDOW_KINDS, DEFAULT_GAME_KIND, GAME_KIND_SLUGS, LIMITS, REMOVED_ANALYTICS_FILTERS } from "@opengame/shared";
import { ANALYTICS_FILTERS_REMOVED, CREATOR_TOKEN_PATTERN, EXIT, repairFindingSchema } from "@opengame/protocol";
import { tokensCommand } from "./tokens";
import { pullCommand } from "./pull";
import { gamesCommand } from "./games";
import { authCommand } from "./auth";
import { assetPlanFlag, deployCommand, prepareDeploy, build } from "./deploy";
import { assetPlanSummary, planDelivery } from "./unity-assets";
import { largeAssetLimits } from "@opengame/shared/large-assets";
import { largeAssetStatement } from "@opengame/shared/large-asset-statement";
import { upgradeCommand } from "./upgrade";
import { submitCommand } from "./submit";
import { jamsCommand } from "./jams";
import { AGENT_MARKERS, Output, CliError, agentMode, hang, preferHuman } from "./output";
import { applyNetworkDefaults } from "./network";
import { initProject, ensureDeployManifest } from "./init";
import { inspectArchive } from "./archive";
import { folderArgument, loadManifest, outputFolder, projectFor } from "./files";
import { CLI_VERSION } from "./version";
import { skillsCommand } from "./skills";
import { limitsCommand } from "./allowance";
import { statsCommand } from "./stats";
import { RANGE_NOT_SUPPORTED, RETIRED_RANGE_OPTIONS } from "./analytics-contract";
import { contractHelp, devCommand } from "./dev";
import { vendorCommand } from "./vendor";
import { ENGINE_IDS, sourceSettingsDiagnostics, THREADED_TARGET } from "./engines";
import { safeReadFile } from "./safe-fs";
import { refuseNewDeployAfterClose, requireLaunched } from "./launch";

/** `only` names the kind of project a flag is for. Help lists those flags under their own
 * heading, after the ones everybody uses, so a Phaser creator reading check --help is not
 * handed a Unity asset plan as the first option. */
type Flag = { name: string; type: "boolean" | "string"; description: string; values?: string[]; default?: string; env?: string; only?: string };
const json: Flag = { name: "json", type: "boolean", description: "Print one formatted JSON result or error, including notices and findings." };
const jsonl: Flag = { name: "jsonl", type: "boolean", description: "Stream one JSON event per line. The last line is a result or an error." };
const stdin: Flag = { name: "token-stdin", type: "boolean", description: "Read the token from stdin instead of OPENGAME_TOKEN or the saved login." };
const externalAssets: Flag = { name: "external-assets", type: "string", only: "Unity, Kaigen and large-game exports", description: 'Asset plan JSON naming its kind, or auto. For a large export, --external-assets auto is the same as a plan of {"delivery":"large-game-v1","assets":"auto"}: opengame chooses which files to send separately. For Kaigen: {"delivery":"kaigen-assets-v1","assets":["cooked/","oc_heads/"]}, where a path ending in / takes every eligible file under it. Kaigen and large-game-v1 need large-asset access on your account; the server checks every plan again.' };
const unityAssets: Flag = { name: "unity-assets", type: "string", only: "Unity, Kaigen and large-game exports", description: 'Unity asset plan JSON: {"assets":["Build/game.data"]}. The same as --external-assets for a Unity plan. Paths are relative to the export root; the server checks the plan again.' };
const acceptStatement: Flag = { name: "accept-statement", type: "string", only: "Unity, Kaigen and large-game exports", description: "Accept the publication statement for a Kaigen asset plan, using the version opengame check prints beside its words. Unity and large-game-v1 plans need none." };
const human: Flag = { name: "human", type: "boolean", description: "Print for a person even when a coding agent's variable such as CLAUDECODE is set. Prompts still need a terminal." };
const noBrowser: Flag = { name: "no-browser", type: "boolean", description: "Print the URL instead of opening a browser." };
/* The four kinds come from packages/shared/game-kinds.json, so help lists what init takes
   and a fifth kind reaches both without an edit here. `values` is help only; initProject
   is what refuses a wrong one, through kindFlags. */
const kindFlag = (description: string): Flag => ({ name: "kind", type: "string", values: [...GAME_KIND_SLUGS], default: DEFAULT_GAME_KIND, description });
const basedOnFlag = (when: string): Flag => ({ name: "based-on", type: "string",
  description: `The game a decomp or a mod is made from, as in --based-on "Doom"${when}. Required for a decomp or a mod, and not allowed for a game or a world.` });

/** One table drives parsing, `help` and `help --json`, so the schema an agent
 * reads is the parser it is talking to. */
const commands: Record<string, { args?: string; description: string; flags: Flag[]; examples?: string[] }> = {
  init: { args: "[dir]", description: "Create opengame.json for an existing game.", flags: [
    { name: "title", type: "string", description: "Game title. Without it, read from index.html's title, then package.json, then the folder name." }, { name: "description", type: "string", description: "One or two sentences about the game." },
    { name: "output", type: "string", description: "Static build folder. Required when several outputs contain index.html." },
    { name: "engine", type: "string", values: [...ENGINE_IDS], description: "Engine export recipe. Otherwise detect source markers and built-export signatures; unknown projects use custom." },
    { name: "genre", type: "string", description: "A genre slug. Without it, guessed from the title and description; a wrong one lists the slugs." },
    kindFlag("What you are making. Without it, init asks a person in a terminal, with game selected, and makes a game for everyone else."), basedOnFlag(""), json],
    examples: ['opengame init . --title "My game"', 'opengame init . --kind mod --based-on "Doom"'] },
  dev: { args: "[dir]", description: "Serve a local export with game-runtime headers. Under a contract that adds the SDK, pages also get the host runtime and SDK, as they do when hosted. If the contract supports opting out, sdk.inject: false leaves out the SDK.", flags: [
    { name: "port", type: "string", description: "Loopback port. Zero (the default) chooses a free port." },
    { name: "contract", type: "string", description: contractHelp() },
    { name: "build", type: "boolean", description: "Run the manifest build before serving an immutable snapshot." },
    { name: "external-assets", type: "string", only: "Unity, Kaigen and large-game exports", description: "The asset plan or auto selection used by check and deploy. Planned files are served from disk on request; the remaining export must fit the ordinary limits. This command serves locally without hashing or uploading." }, json],
    examples: ["opengame dev . --build", `opengame dev . --contract ${THREADED_TARGET}`, "opengame dev . --external-assets kaigen-assets.json"] },
  vendor: { args: "[dir]", description: "Create a separate export with dependencies downloaded at their exact versions, rewritten and hashed.", flags: [
    { name: "output", type: "string", description: "New staging folder inside the project. Defaults to .opengame/vendor; existing folders are never overwritten." },
    { name: "build", type: "boolean", description: "Run the manifest build before vendoring." }, json], examples: ["opengame vendor . --output vendored"] },
  check: { args: "[dir]", description: "Find local build and asset problems before uploading.", flags: [externalAssets, unityAssets,
    { name: "vendor", type: "boolean", description: "Download dependencies from approved sources at the exact versions your code names into the packaging copy, with hashes and licenses." },
    { name: "build", type: "boolean", description: "Run the build command from opengame.json first, so the check reads fresh output." }, json],
    examples: ["opengame check .", "opengame check . --build --json"] },
  deploy: { args: "[dir]", description: "Build, check and upload a release, then return with the address of its deployment page, where the checks run and the private preview plays once they pass. Add --wait to stay until they finish. Once the preview is ready, the achievements opengame.json declares are saved by deploy --wait or by the next opengame status in this folder. Removing an achievement from opengame.json does not switch it off. To retire one, send PUT /api/v1/games/{id}/achievements with achievementId, title, description and active: false. Unlocks are never deleted.", flags: [externalAssets, unityAssets, acceptStatement,
    { name: "title", type: "string", description: "Title when deploy creates a missing manifest." },
    { name: "description", type: "string", description: "Description when deploy creates a missing manifest." },
    { name: "genre", type: "string", description: "Genre when deploy creates a missing manifest." },
    kindFlag("Kind when deploy creates a missing manifest. Without it, a game."), basedOnFlag(" when deploy creates a missing manifest"),
    { name: "output", type: "string", description: "Static build folder when deploy creates a missing manifest." },
    { name: "vendor", type: "boolean", description: "Download dependencies from approved sources at the exact versions your code names into the packaging copy, with hashes and licenses." },
    { name: "dry-run", type: "boolean", description: "Build, check and package without uploading. With --no-build, check and package only." },
    { name: "no-build", type: "boolean", description: "Skip the build command in opengame.json and package build.output as it is, when the export is already built and its command cannot run here, such as a Godot or Emscripten toolchain on another machine. A command that changes the export, such as one that adds the SDK, is skipped too." },
    { name: "idempotency-key", type: "string", description: "Retry key. Reuse it to resume one deploy; a new one starts another." },
    { name: "metadata", type: "string", values: ["preserve", "local"], default: "preserve", description: "preserve keeps newer website edits to the title, description and other product fields. local replaces them with opengame.json." },
    { name: "wait", type: "boolean", description: `Stay until the checks finish, up to ${LIMITS.platform.operations.watchTimeoutMs / 1000} seconds, and exit with their outcome. For CI that needs the result as an exit code.` },
    { name: "no-wait", type: "boolean", description: "Return once the upload is in. This is the default; the flag remains so older scripts keep working." },
    { name: "timeout", type: "string", description: `With --wait, stop watching after this many seconds (at most ${LIMITS.platform.operations.watchTimeoutMs / 1000}), exiting 5 with the checks still running. Setting it implies --wait.` },
    stdin, json],
    examples: ["opengame deploy .", "opengame deploy . --dry-run", "opengame deploy . --no-build", "opengame deploy . --wait --json"] },
  status: { args: "[dir]", description: "Show the most recent deploy for this folder, with its findings. Finishes saving its declared achievements if the deploy could not. Removing an achievement from opengame.json does not switch it off. To retire one, send PUT /api/v1/games/{id}/achievements with achievementId, title, description and active: false. Unlocks are never deleted.", flags: [
    { name: "watch", type: "boolean", description: "Follow the deploy until it is ready, refused, or the watch window closes." },
    { name: "timeout", type: "string", description: `Stop watching after this many seconds (at most ${LIMITS.platform.operations.watchTimeoutMs / 1000}), exiting 5 with the checks still running.` }, stdin, json],
    examples: ["opengame status . --watch"] },
  login: { description: "Sign in through your browser.", flags: [
    noBrowser, { name: "device-name", type: "string", description: "Name shown on the approval page and in settings. Defaults to this machine's hostname and today's date." },
    { name: "no-wait", type: "boolean", description: "Print the URL and code, then exit 3 with next: opengame login --continue. The default in agent mode." },
    { name: "wait", type: "boolean", description: "Wait for the browser approval even in agent mode, where login and --continue otherwise return without it." },
    { name: "continue", type: "boolean", description: `Finish a login started with --no-wait. In agent mode it waits up to ${LIMITS.platform.device.continueWaitSeconds} seconds, then exits 3 if access is not allowed yet; run it again.` },
    { name: "force", type: "boolean", description: "Replace a saved login that still works." }, json],
    examples: ["opengame login", "opengame login --no-wait --json", "opengame login --continue --json"] },
  logout: { description: "Revoke this device's token and remove it locally.", flags: [
    { name: "revoke", type: "boolean", description: "Also revoke a token supplied by OPENGAME_TOKEN, everywhere it is used." }, stdin, json] },
  limits: { description: "Show bundle limits and your remaining account allowance.", flags: [stdin, json] },
  whoami: { description: "Show the account and permissions for this token.", flags: [stdin, json] },
  games: { description: "List your games and their latest deploy.", flags: [{ name: "cursor", type: "string", description: "nextCursor from the previous page." }, stdin, json] },
  deployments: { args: "[dir]", description: "List the linked game's deploys, newest first: status, when, size, who started each one, why any stopped, and each one's page or preview.", flags: [
    { name: "game", type: "string", description: "A game ID or public ID from opengame games, instead of the linked folder's." }, stdin, json],
    examples: ["opengame deployments", "opengame deployments --game <id> --json"] },
  stats: { args: "[game|dir]", description: "Read analytics for a game you own, or this folder's linked game, for one complete ISO week, Monday to Sunday in UTC. Average playtime is total playtime divided by distinct players in the week.", flags: [
    { name: "game", type: "string", description: "Game ID or public ID from opengame games. Defaults to the linked game." },
    { name: "window", type: "string", values: [...ANALYTICS_WINDOW_KINDS], default: "week", description: `Always week. A week is readable ${LIMITS.analytics.windowSettleHours} hours after it ends on Sunday at midnight UTC. Any other window is refused.` },
    { name: "period", type: "string", description: "Which ISO week, such as 2026-W43. Defaults to the newest complete week." },
    { name: "funnel", type: "string", description: `Ordered custom event names separated by commas, from 2 to ${LIMITS.analytics.funnelStepsMax} steps.` },
    stdin, json], examples: ["opengame stats", "opengame stats <game-id> --json", "opengame stats --game <id> --window week --period 2026-W42 --json", "opengame stats --period 2026-W40 --json"] },
  link: { args: "[dir]", description: "Connect this folder to an existing game.", flags: [
    { name: "game", type: "string", description: "Game id or public id from opengame games." },
    { name: "replace", type: "boolean", description: "Replace an existing link." }, stdin, json] },
  open: { args: "[dir]", description: "Open the linked game's private page in your browser.", flags: [
    { name: "game", type: "string", description: "Game id or public id." }, noBrowser, stdin, json] },
  pull: { args: "[dir]", description: "Bring website metadata into this folder.", flags: [stdin, json] },
  token: { args: "create|list|revoke", description: "Create, list or revoke tokens in your browser.", flags: [
    { name: "name", type: "string", description: "Token name, for create." }, { name: "scopes", type: "string", values: ["read", "deploy", "submit"], default: "deploy", description: "Comma-separated scopes, for create. A token never has more than the session that makes it." },
    { name: "game", type: "string", description: "Pin the token to one game, for create." }, { name: "id", type: "string", description: "The 16-character public token id, for revoke. Never the token itself." },
    noBrowser, json], examples: ['opengame token create --name "Build runner" --scopes read,deploy', "opengame token list"] },
  upgrade: { description: "Install the current CLI, or print the line that does.", flags: [
    { name: "dry-run", type: "boolean", description: "Print the install command without running it." },
    { name: "allow-downgrade", type: "boolean", description: "Install the server's version even when it is older than this one." }, json] },
  version: { description: "Print the CLI version.", flags: [json] },
  submit: { args: "[dir]", description: "Send one release to review, and enter it in a jam.", flags: [
    { name: "release", type: "string", description: "The release id to submit: releaseId from opengame status --json once the deploy is ready, or from opengame deployments --json. Agents must name it." },
    /* The window in /rules' own words ("Between entries opening and entries closing, deploy
       your game"), which is the rule the server holds this flag to: when the deploy BEGAN,
       not when the submit is run (cli.test.ts keeps the two sentences together). */
    { name: "jam", type: "string", description: "The jam slug to enter, from opengame jams. A jam takes a release whose deploy began between entries opening and entries closing, submitted before they close. A build deployed before entries opened cannot enter, so deploy again once they do." },
    { name: "no-jam", type: "boolean", description: "Submit without a jam, when the server accepts marketplace submissions." },
    { name: "qa", type: "boolean", description: "Send to review for the QA destination: no jam, and published unlisted once a reviewer approves it. The account needs a QA grant from an OpenGame owner. Takes no jam flags." },
    { name: "track", type: "string", description: "The jam track. opengame jams <slug> lists them." },
    { name: "models", type: "string", description: "Comma-separated models the game was made with, from the jam's form." },
    { name: "sponsor", type: "string", description: "Comma-separated sponsor tracks to enter." },
    { name: "evidence-<sponsor>", type: "string", description: "What that sponsor's model did in the game, one flag per sponsor, for example --evidence-fal." },
    { name: "yes", type: "boolean", description: "Skip the confirmation a person is asked for." },
    { name: "idempotency-key", type: "string", description: "Retry key. Reuse it to check on one submission; a new one starts another." },
    { name: "no-wait", type: "boolean", description: "Return once submitted, without waiting for certification in the browser." },
    noBrowser, stdin, json],
    examples: ["opengame submit", "opengame submit --release <id> --no-jam --json", "opengame submit --release <id> --qa --json",
      "opengame submit --release <id> --jam <slug> --track rpg --models claude,fal --sponsor fal --evidence-fal \"All prop textures\""] },
  jams: { args: "[slug]", description: "List open jams, or show one jam's tracks and flags.", flags: [stdin, json],
    examples: ["opengame jams", "opengame jams <slug> --json"] },
  skills: { args: "add|list [dir]", description: "Install the OpenGame skills for your coding agent.", flags: [
    { name: "agent", type: "string", values: ["claude", "codex", "cursor", "opencode"], description: "Comma-separated agents to install for. Detected from the project when omitted." },
    { name: "dir", type: "string", description: "The project folder, when it is not given as an argument." },
    { name: "skill", type: "string", description: "Install named skills from the catalog, separated by commas." },
    { name: "all", type: "boolean", description: "Install the full catalog instead of the starting set." },
    { name: "replace", type: "boolean", description: "Overwrite skills you have edited. Your edits are lost." },
    { name: "keep-edited", type: "boolean", description: "Leave skills you have edited as they are and install the rest." }, json],
    examples: ["opengame skills add .", "opengame skills add . --agent codex,cursor", "opengame skills add . --keep-edited", "opengame skills list --json"] },
};
const GLOBAL = ["jsonl", "token-stdin", "json", "human", "no-browser", "help", "version"];
const EVIDENCE = /^evidence-[a-z0-9][a-z0-9_-]{0,38}$/;

// name, code and description, the shape scripts/docs-gen.mjs (pf/docs) reads.
const EXIT_CODES = [
  { name: "ok", code: EXIT.ok, description: "Done. With done:false in the result, the deploy is still running on our side: open data.url to watch it, or follow it with opengame status --watch." },
  { name: "check", code: EXIT.check, description: "The game needs a change. Read the finding events, or the error's finding and message when there are none, fix it, then run the finding's verify command." },
  { name: "input", code: EXIT.input, description: "The command needs input: a flag, a choice or a different command. The message names it. With retry never, running the same command again cannot help." },
  { name: "auth", code: EXIT.auth, description: "Sign in, or use a token with the right scope. Run the error's next command when it has one. With retry never, signing in again will not help: the account itself has no access." },
  { name: "rateLimited", code: EXIT.rateLimited, description: "An allowance is used. Wait retryAfterSeconds when the error has it, then run the same command." },
  { name: "server", code: EXIT.server, description: "Our side or the network, and the game is fine. Run the error's next command when it has one. With retry after-fix or never, waiting will not help; read the message. Otherwise wait (retryAfterSeconds when given) and run the same command." },
  { name: "upgrade", code: EXIT.upgrade, description: "This CLI is too old. Run opengame upgrade." },
  { name: "notLaunched", code: EXIT.notLaunched, description: "OpenGame is not open to creators yet, so nothing ran. The message names the day the CLI and uploads open. Nothing about the game, the command or the login is wrong. Retrying will not help before then." },
];
/* The commands that answer before launch (launch.ts says why each one). help and version
   are answered before this is reached. A docs commit on 3 Nov 2026 (a9fa6ab49) took this
   and the check below out with no word in its message, and every local command then ran
   for strangers with no "not launched" sentence; launch.test.ts is what caught it. */
const BEFORE_LAUNCH = new Set(["login", "logout", "whoami"]);
const ENV = [
  { name: "OPENGAME_API_URL", description: "The OpenGame origin to talk to. Defaults to https://opengame.io. Set it when you were given a different origin." },
  { name: "OPENGAME_TOKEN", description: "A token from settings, for CI and agents. Never pass a token as a flag." },
  { name: "OPENGAME_CREDENTIAL_STORE", description: "Set to file to store the login in ~/.config/opengame/auth.json instead of the macOS Keychain." },
  { name: "XDG_CONFIG_HOME", description: "Where the login file and a pending login live, as $XDG_CONFIG_HOME/opengame. Defaults to ~/.config." },
  { name: "HTTPS_PROXY", description: "Proxy for API requests, HTTP_PROXY for an http:// API origin. Lower-case spellings and NO_PROXY work; dependency vendoring uses direct DNS-checked HTTPS." },
  { name: "NO_COLOR", description: "Plain output with no color or motion. TERM=dumb does the same." },
  { name: "OPENGAME_REDUCED_MOTION", description: "Set to 1 to keep color but stop motion: the character holds still and changes land at once. The spinner still turns." },
  { name: "COLORTERM", description: "truecolor or 24bit draws the character in full color; anything else uses the 256-color palette." },
  { name: "COLORFGBG", description: "Read to tell a light terminal from a dark one, so the character's outline suits it. Most terminals are taken as dark." },
  { name: "OPENGAME_DEBUG", description: "Set to 1 to print the stack of an unexpected error to stderr." },
];
/* OPENGAME_TEST_SKIP_LAUNCH_CHECK (launch.ts) is read and deliberately not listed here. It is
   for this package's own test suite, and this list is what `help`, `help --json` and the
   generated CLI reference in the docs print, so a row here told every stranger how to turn
   the launch sentence off. agent-shells.test.ts names it as the one unlisted variable. */

/** The command nearest a mistyped one, when it is close enough to be the likely meaning:
 * `tokens` is `token`, `stauts` is `status`. Edit distance, at most two, and only one.
 * A swapped pair of letters counts as one edit, which is how people mistype. Plain
 * Levenshtein charges two for it, so `stauts` was one away from `stats` and two from
 * `status`, and the CLI suggested the wrong command beside a comment promising the right one. */
function nearestCommand(typed: string): string | null {
  const distance = (a: string, b: string) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
      }
    }
    return d[a.length]![b.length]!;
  };
  // That still leaves `stauts` one edit from both, a swap from `status` and a dropped letter
  // from `stats`. A swap keeps the length, so on a tie the nearer length wins; a tie on both
  // is no suggestion, as before.
  const ranked = Object.keys(commands).map(name => ({ name, cost: distance(typed.toLowerCase(), name), stretch: Math.abs(name.length - typed.length) }))
    .sort((a, b) => a.cost - b.cost || a.stretch - b.stretch);
  const [best, next] = ranked;
  return best && best.cost <= 2 && best.cost < typed.length && !(next && next.cost === best.cost && next.stretch === best.stretch) ? best.name : null;
}
function unknownCommand(typed: string): CliError {
  const near = nearestCommand(typed);
  return new CliError("unknown_command", `Unknown command ${typed}.${near ? ` Did you mean opengame ${near}?` : ""} Run opengame help to see every command.`,
    undefined, { next: near ? `opengame ${near} --help` : "opengame help" });
}

/** A command's own flags, plus the output flags every command takes. --token-stdin is
 * listed only where a command reads a token, which each such command names itself: it was
 * appended everywhere, so init, check and dev, which never talk to the server, offered a
 * way to pipe in a credential they would ignore. The parser still accepts it on any
 * command, so a script that passes it globally keeps working. */
function commandFlags(flags: Flag[]): Flag[] {
  return [...flags, ...[jsonl, human].filter(flag => !flags.some(existing => existing.name === flag.name))];
}

function commandUsage(name: string) {
  const spec = commands[name]!;
  return `opengame ${name}${spec.args ? ` ${spec.args}` : ""} [options]`;
}

/** The longest value list a flag column carries before it moves after the description. */
const VALUES_IN_PLACE = 32;

function help(target?: string) {
  if (target !== undefined) {
    if (!Object.hasOwn(commands, target)) throw unknownCommand(target);
    const spec = commands[target]!;
    const usage = commandUsage(target);
    // One column for every description, like the command and environment tables: each
    // line started wherever its flag happened to end.
    const allFlags = commandFlags(spec.flags);
    // A short list of values reads best in place (--kind <game|world|decomp|mod>). The
    // engine list is more than fifty ids, and in place it set this column at 388 characters, so in
    // any real terminal every description in init --help started off the screen. A long
    // list moves after its description and the flag keeps a placeholder of its own name.
    const row = (flag: Flag) => {
      const values = flag.values ? `<${flag.values.join("|")}>` : "<value>";
      const inPlace = values.length <= VALUES_IN_PLACE;
      return { text: `--${flag.name}${flag.type === "string" ? ` ${inPlace ? values : `<${flag.name}>`}` : ""}`,
        description: inPlace || !flag.values ? flag.description : `${flag.description} Choose from ${flag.values.join(", ")}.` };
    };
    const named = allFlags.filter(flag => !flag.only).map(row).concat({ text: "--help, -h", description: "Show this help." });
    const scoped = [...new Set(allFlags.flatMap(flag => flag.only ? [flag.only] : []))]
      .map(only => ({ only, rows: allFlags.filter(flag => flag.only === only).map(row) }));
    const width = Math.max(...named.map(flag => flag.text.length), ...scoped.flatMap(group => group.rows.map(flag => flag.text.length)));
    // Flags are named as typed (--json), so a reader can copy them.
    return { version: CLI_VERSION, command: target, usage, description: spec.description,
      flags: allFlags.map(flag => ({ ...flag, name: `--${flag.name}` })), examples: spec.examples ?? [],
      message: [usage, "", spec.description, "", "Options", ...named.map(flag => `  ${flag.text.padEnd(width)}  ${flag.description}`),
        ...scoped.flatMap(group => ["", `For ${group.only} only`, ...group.rows.map(flag => `  ${flag.text.padEnd(width)}  ${flag.description}`)]),
        ...(spec.examples?.length ? ["", "Examples", ...spec.examples.map(line => `  ${line}`)] : []),
        "", "Use --json for structured output."].join("\n") };
  }
  const primary = ["deploy", "submit", "status", "open", "login"];
  const listed = Object.fromEntries(Object.entries(commands).map(([name, spec]) => [name, { ...spec, usage: commandUsage(name), flags: commandFlags(spec.flags).map(flag => ({ ...flag, name: `--${flag.name}` })) }]));
  return { version: CLI_VERSION, commands: listed, globalFlags: GLOBAL.map(name => `--${name}`), exitCodes: EXIT_CODES, env: ENV,
    events: ["progress", "notice", "finding", "result", "error"], findingSchema: z.toJSONSchema(repairFindingSchema),
    agentMode: `When stdout is not a terminal, or CI or ${AGENT_MARKERS.slice(0, -1).join(", ")} or ${AGENT_MARKERS.at(-1)} is set to anything but 0, false or no, output defaults to one formatted JSON result or error. In a terminal, --human ignores those variables and prints text. Use --jsonl to stream events. With either JSON mode there are no command prompts or browser opens, and login prints the approval URL and code instead of waiting.`,
    limits: LIMITS.bundle,
    message: [`OpenGame CLI ${CLI_VERSION}`, "", "Usage: opengame <command> [options]", "", "Commands",
      ...primary.map(name => `  ${name.padEnd(10)} ${commands[name]!.description}`),
      "", "More commands: opengame help <command>", `  ${Object.keys(commands).filter(name => !primary.includes(name)).join(", ")}`,
      "", "Get started", "  opengame init .       Write opengame.json for your game", "  opengame check .      Find problems before you upload",
      "  opengame dev .        Play it locally with the platform's headers", "  opengame deploy .     Upload a private preview",
      "", "Exit codes", ...EXIT_CODES.map(row => `  ${row.code}  ${row.description}`),
      "", "Environment", ...ENV.map(row => `  ${row.name.padEnd(26)} ${row.description}`),
      "", "Run opengame <command> --help for options. Use --json for structured output."].join("\n") };
}

// undici marks its proxy agent experimental on every run. A person cannot act on
// that, and an agent reading stderr should not have to filter it out.
const emitWarning = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  if (rest.some(value => value === "UNDICI-EHPA" || (typeof value === "object" && value !== null && (value as { code?: string }).code === "UNDICI-EHPA"))) return;
  (emitWarning as (...args: unknown[]) => void)(warning, ...rest);
}) as typeof process.emitWarning;

/* --human is for the person whose own shell carries an agent's variable, typically a
   terminal opened from inside Claude Code, Codex or Cursor, where CLAUDECODE and the rest
   are inherited. Their stdout is a real terminal, but so is Cursor's agent's, so a TTY on
   its own cannot tell the two apart and the markers stay authoritative by default: an
   agent handed a prompt waits for ever, and a person handed JSON can still read it. The
   flag is the person's way out. It only clears the markers; a pipe or CI still gets no
   prompts, because nobody is there to answer one. */
applyNetworkDefaults();
if (process.argv.includes("--human")) preferHuman();
const output = new Output(process.argv.includes("--jsonl") ? "jsonl" : process.argv.includes("--json") || (agentMode() && !process.argv.includes("--human")) ? "json" : false);

function parse(argv: string[]) {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  let command: string | undefined;
  let unknown: string | null = null;
  let retired = false, filtered = false;
  const booleans = new Set(Object.values(commands).flatMap(spec => spec.flags.filter(flag => flag.type === "boolean").map(flag => flag.name)).concat(GLOBAL));
  const strings = new Set(Object.values(commands).flatMap(spec => spec.flags.filter(flag => flag.type === "string").map(flag => flag.name)));
  for (let index = 0; index < argv.length; index++) {
    let arg = argv[index]!;
    if (arg === "-h") arg = "--help";
    if (arg === "-v") arg = "--version";
    if (/^-[^-]/.test(arg)) { unknown ??= arg; continue; }
    if (!arg.startsWith("--")) { if (command === undefined) command = arg; else positional.push(arg); continue; }
    const split = arg.indexOf("=");
    const key = arg.slice(2, split < 0 ? undefined : split);
    if (key === "token") throw new CliError("token_flag", "Use OPENGAME_TOKEN or stdin for credentials. Tokens are not accepted as command flags.");
    if (Object.hasOwn(flags, key)) throw new CliError("duplicate_flag", `Provide --${key} only once.`);
    // --build is a boolean on dev and check, so it is noted before either branch reads it.
    if ((REMOVED_ANALYTICS_FILTERS as readonly string[]).includes(key)) filtered = true;
    if (booleans.has(key)) {
      if (split >= 0) throw new CliError("invalid_flag", `Use --${key} without a value, or omit it.`);
      flags[key] = true; continue;
    }
    // A sponsor's evidence flag is named after the sponsor (--evidence-fal), so it is a
    // pattern rather than a row. Only submit accepts it; the check below says so.
    if (!strings.has(key) && !EVIDENCE.test(key)) {
      if ((RETIRED_RANGE_OPTIONS as readonly string[]).includes(key)) retired = true;
      unknown ??= `--${key}`; continue;
    }
    const value = split < 0 ? argv[++index] : arg.slice(split + 1);
    if (!value || value.startsWith("--") || (split < 0 && value === "-h")) throw new CliError("missing_flag_value", `Provide a value for --${key}.`);
    flags[key] = value;
  }
  // stats took from, to and timezone flags until fixed windows replaced them. Scripts
  // written then are told what to type now, with the usage exit, rather than sent to
  // the help to find out. Their values were read as arguments, so this goes first.
  if (retired && command === "stats") throw new CliError("range_not_supported", RANGE_NOT_SUPPORTED, 2, { next: "opengame stats --help" });
  // The same for the filters stats took until 23 Oct 2026, with the API's own sentence.
  if (filtered && command === "stats") throw new CliError("filters_removed", ANALYTICS_FILTERS_REMOVED, 2, { next: "opengame stats --help" });
  /* Reported once the whole line is read, so it can point at the command's own help: the
     flags a command takes are what someone who typed a wrong one needs, not the command list. */
  if (unknown !== null) {
    const known = command !== undefined && Object.hasOwn(commands, command);
    throw new CliError("unknown_flag", `Unknown flag ${unknown}. Run ${known ? `opengame ${command} --help` : "opengame help"} to see the flags it takes.`,
      undefined, { next: known ? `opengame ${command} --help` : "opengame help" });
  }
  return { command: command ?? (flags.version ? "version" : "help"), flags, positional };
}

async function main() {
  const { command, flags, positional } = parse(process.argv.slice(2));
  if (flags.json && flags.jsonl) throw new CliError("conflicting_flags", "Use --json for a final object or --jsonl for an event stream, not both.");
  if (flags.human && (flags.json || flags.jsonl)) throw new CliError("conflicting_flags", "Use --human for text or --json and --jsonl for structured output, not both.");
  if (command === "help" || flags.help) {
    // `help token create` asks about `token`; the rest is its arguments.
    const target = command === "help" ? positional[0] : command;
    const data = help(target);
    if (target === undefined && output.style === "rich") {
      // A person gets the character and the name beside it instead of the title line, and
      // the section names stand out from the rows under them. The JSON and plain text are
      // the same as ever.
      output.greet(["\x1b[1mOpenGame\x1b[0m", `\x1b[2mCLI ${CLI_VERSION}\x1b[0m`]);
      const columns = process.stdout.columns ?? 80;
      const message = data.message.split("\n").slice(2)
        .map(line => /^[A-Z][a-z]+( [a-z]+)*$/.test(line) ? `\x1b[1m${line}\x1b[0m` : hang(line, columns)).join("\n");
      output.emit({ type: "result", command: "help", data: { ...data, message } });
      return;
    }
    output.emit({ type: "result", command: "help", data });
    return;
  }
  /* Every command a person runs has a character in the corner while it works. Login opens
     its own, once the code is on screen. */
  if (output.style === "rich") output.begin(command !== "login");
  if (command === "version" || flags.version) {
    output.emit({ type: "result", command: "version", data: { version: CLI_VERSION, message: `opengame ${CLI_VERSION}` } }); return;
  }
  if (!Object.hasOwn(commands, command)) throw unknownCommand(command);
  const supported = commands[command]!.flags.map(flag => flag.name);
  for (const key of Object.keys(flags)) {
    if (!GLOBAL.includes(key) && !supported.includes(key) && !(command === "submit" && EVIDENCE.test(key))) throw new CliError("unsupported_flag", `The ${command} command does not use --${key}. Run opengame ${command} --help.`);
  }
  const launch = BEFORE_LAUNCH.has(command) ? { deploysFrozen: false } : await requireLaunched(Boolean(flags["token-stdin"]));
  const takesFolder = Boolean(commands[command]!.args?.includes("dir"));
  // token takes create|list|revoke and jams a slug: one argument each, like a folder.
  // skills takes its action first, then the folder.
  if (positional.length > (command === "skills" ? 2 : commands[command]!.args ? 1 : 0)) {
    throw new CliError("arguments", takesFolder ? "Supply one project folder." : `The ${command} command does not accept ${positional.length > 1 ? "these arguments" : "a project folder"}.`);
  }
  // Pointed at the build folder, these use the project that names it (projectFor). The
  // state commands are here too, so `status` from dist finds the deploy `deploy dist` made.
  // link is not: it would rewrite the parent's link while naming dist.
  const buildNote = command === "deploy" ? (flags["no-build"] ? undefined : "deploy runs its build command there first; pass --no-build to upload the folder as it is.")
    : ["check", "dev", "vendor"].includes(command) && flags.build ? "--build runs its build command there first." : undefined;
  const root = ["check", "dev", "deploy", "vendor", "status", "open", "pull", "submit", "deployments"].includes(command)
    ? await projectFor(resolve(positional[0] ?? "."), output, buildNote) : resolve(positional[0] ?? ".");
  if (command === "token") { tokensCommand(positional[0], flags, output); return; }
  if (command === "skills") { await skillsCommand(positional[0], positional[1], flags, output); return; }
  if (command === "upgrade") { await upgradeCommand(flags, output); return; }
  if (command === "login" || command === "logout" || command === "whoami") { await authCommand(command, flags, output); return; }
  if (command === "limits") { await limitsCommand(flags, output); return; }
  if (command === "stats") { await statsCommand(positional[0], flags, output); return; }
  if (command === "games" || command === "link" || command === "open" || command === "deployments") { await gamesCommand(command, root, flags, output); return; }
  if (command === "pull") { await pullCommand(root, flags, output); return; }
  if (command === "submit") { await submitCommand(root, flags, output); return; }
  if (command === "jams") { await jamsCommand(positional[0], flags, output); return; }
  if (command === "dev") { await devCommand(root, flags, output); return; }
  if (command === "vendor") { await vendorCommand(root, flags, output); return; }
  if (command === "init") { output.emit({ type: "result", command, data: await initProject(root, flags, { interactive: !output.json && !agentMode() && Boolean(process.stdin.isTTY) }) }); return; }
  if (command === "deploy" && flags["dry-run"]) {
    const initialized = await ensureDeployManifest(root, flags);
    if (initialized) output.emit({ type: "notice", code: "initialized", message: initialized.message });
    const assetPlan = assetPlanFlag(flags);
    const { archive } = await prepareDeploy(root, output, !flags["no-build"], { vendor: Boolean(flags.vendor), unityAssets: assetPlan?.plan, unityOnly: assetPlan?.unityOnly, noBuild: Boolean(flags["no-build"]) });
    output.emit({ type: "result", command, data: { ok: true, ...(archive.unityAssets ? { delivery: planDelivery(archive.unityAssets), assets: archive.unityAssets.assets, inputDigest: archive.unityAssets.inputDigest } : {}), files: archive.fileCount, bytes: archive.bytes.byteLength, sha256: archive.sha256, packaging: archive.packaging,
      message: `Checked and packaged ${archive.fileCount} files. Nothing was uploaded. Server safety checks still run before a preview.` } });
    return;
  }
  if (command === "check") {
    const assetPlan = assetPlanFlag(flags);
    const manifest = await loadManifest(root, output, assetPlan ? safeReadFile : undefined);
    const sourceSettings = await sourceSettingsDiagnostics(root, manifest);
    for (const diagnostic of sourceSettings.diagnostics) output.emit({ type: "notice", code: diagnostic.code,
      message: `${diagnostic.severity === "warning" ? "Warning: " : ""}${diagnostic.message} ${diagnostic.fix}`, paths: [diagnostic.path] });
    if (assetPlan) {
      const { archive } = await prepareDeploy(root, output, Boolean(flags.build), { vendor: Boolean(flags.vendor), unityAssets: assetPlan.plan, unityOnly: assetPlan.unityOnly });
      const delivery = planDelivery(archive.unityAssets);
      const statement = largeAssetStatement(delivery);
      output.emit({ type: "result", command, data: { ok: true, delivery, files: archive.fileCount, bytes: archive.bytes.byteLength,
        assets: archive.unityAssets!.assets, inputDigest: archive.unityAssets!.inputDigest, packaging: archive.packaging, sourceSettings,
        limits: { boot: LIMITS.bundle, assets: largeAssetLimits(delivery) }, ...(statement ? { statement } : {}),
        message: assetPlanSummary(archive.fileCount, archive.unityAssets!.assets.length, statement ?? undefined) } });
      return;
    }
    if (flags.build && manifest.build?.command) await build(manifest.build.command, root, output);
    const inspection = await inspectArchive(await outputFolder(root, manifest), manifest, output, { vendor: Boolean(flags.vendor) });
    output.emit({ type: "result", command, data: { ok: true, files: inspection.result.fileCount, bytes: inspection.result.totalBytes,
      excluded: inspection.excluded, findings: inspection.findings, packaging: inspection.packaging, limits: LIMITS.bundle, sourceSettings,
      // check is the step before dev, and it said nothing about one: next was null and
      // the local preview was a command a newcomer found only by reading every --help.
      next: `opengame dev ${folderArgument(root)}`,
      message: `No blockers in ${inspection.result.fileCount} files${manifest.build?.command && !flags.build ? " from your last build" : ""}. Server safety checks still run before a preview.\nNext: opengame dev ${folderArgument(root)} to play it locally, then opengame deploy ${folderArgument(root)} for a private preview.` } });
    return;
  }
  if (command === "deploy" && launch.deploysFrozen && !flags["dry-run"]) {
    await refuseNewDeployAfterClose(root, typeof flags["idempotency-key"] === "string" ? flags["idempotency-key"] : undefined);
  }
  if (command === "deploy" || command === "status") { await deployCommand(command, root, flags, output); return; }
  throw unknownCommand(command);
}

main().catch((error: unknown) => {
  const known = error instanceof CliError;
  if (!known && process.env.OPENGAME_DEBUG === "1") {
    output.stop(false);
    // A stack can carry a token in a URL or a message; never print one.
    const pattern = new RegExp(CREATOR_TOKEN_PATTERN.source.replace("(?![\\s\\S])", ""), "g");
    process.stderr.write(String((error as Error)?.stack ?? error).replace(pattern, "[token]") + "\n");
  }
  const errno = !known && typeof (error as NodeJS.ErrnoException)?.code === "string" && /^E[A-Z]+$/.test((error as NodeJS.ErrnoException).code!) ? (error as NodeJS.ErrnoException).code : null;
  const safe = known ? error : errno
    ? new CliError("local_error", `The command could not read or write its local files (${errno}). Check the folder, its permissions and free disk space, then retry.`, 5)
    : new CliError("internal_error", "The CLI hit an unexpected error. Nothing was published. Run the command again with OPENGAME_DEBUG=1 to see the cause.", 5);
  output.emit({ type: "error", code: safe.code, message: safe.message, exitCode: safe.exitCode,
    ...(safe.retry ? { retry: safe.retry } : {}), ...(safe.retryAfterSeconds !== undefined ? { retryAfterSeconds: safe.retryAfterSeconds } : {}),
    ...(safe.next ? { next: safe.next } : {}), ...(safe.finding ? { finding: safe.finding } : {}) });
  process.exitCode = safe.exitCode;
}).finally(async () => { await output.settled(); output.finish(); });
