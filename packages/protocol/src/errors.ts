/**
 * Every error code the platform speaks, in one table: the exit code an agent decides
 * by, whether waiting helps, and, where the code has one, the HTTP status the server
 * answers with and the sentence a person reads.
 *
 * This used to be three tables written by two people on the same day. The CLI had one
 * from code to exit, the server had one from credential refusal to status and message,
 * and status.ts had one from operation error to sentence. Each was right on its own;
 * the codes in one were missing from the others, so a refusal the server worded
 * carefully reached the CLI as "api_error, exit 5" and an agent waited out a token that
 * would never work again. A code gets a row here once, and the server, the CLI's exit
 * code and every page read that row.
 *
 * Exits: 0 ok, 1 the game needs a change, 2 the command needs input (a flag or a
 * choice), 3 auth (who is asking, or what they may do), 4 rate limited (wait
 * `retryAfterSeconds`), 5 our side or the network, 6 this CLI is too old, 7 OpenGame is not
 * launched yet. A code that
 * lands in the wrong row sends an agent the wrong way: a game problem read as "supply
 * a flag", or our outage read as "change your code".
 *
 * `retry` uses the repair-finding vocabulary (`RepairFinding.retry`), because a refusal
 * is a finding about the caller rather than about a game.
 */
import { LIMITS, TEXT } from "@opengame/shared/browser";
import { ENTRIES_CLOSED_MESSAGE, KICKOFF_COPY } from "@opengame/shared/launch-clock";
import { studioExperimentRefusals } from "./experiments";
import { ANALYTICS_CLI_OUTDATED, ANALYTICS_FILTERS_REMOVED } from "./analytics";

type Retry = "now" | "after-fix" | "later" | "never";
export interface ErrorRow {
  exit: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  retry: Retry;
  /** The HTTP status the v1 API answers this code with, when it is a refusal the server writes. */
  status?: number;
  /** The sentence a person or agent reads. Operation codes must have one: a test reads the migrations. */
  message?: string;
  /** The same refusal for a reader who is not at a terminal, where `message` would send
   * them to a command: the creator on the website (`page`) or staff in the console
   * (`console`). Absent, `message` fits them too. Read through `errorSentence`. */
  page?: string;
  console?: string;
}
type Row = ErrorRow;
const game: Row = { exit: 1, retry: "after-fix" };
const input: Row = { exit: 2, retry: "after-fix" };
const auth: Row = { exit: 3, retry: "after-fix" };
const limited: Row = { exit: 4, retry: "later" };
const ours: Row = { exit: 5, retry: "later" };
const say = (row: Row, message: string, status?: number): Row => ({ ...row, message, ...(status ? { status } : {}) });
const refuse = (status: number, retry: Retry, message: string) => ({ exit: 3 as const, retry, status, message });

/**
 * Credential refusals. Before these, every identity failure was `{ error:
 * "unauthorized", message: "Sign in to continue." }`: one code for an unknown token, a
 * revoked token, a removed tester, a token without the needed scope and an account with
 * no handle. Those need five different fixes, six with a suspended or deleted account. The server picks a code here and the CLI
 * words the same code, so neither side spells out the other's sentences.
 */
const AUTH = {
  sign_in_required: refuse(401, "after-fix", "Sign in to continue."),
  token_invalid: refuse(401, "after-fix", "This token is not valid. Run opengame login, or replace OPENGAME_TOKEN."),
  token_revoked: refuse(401, "after-fix", "This token was revoked. Run opengame login, or create a new token in OpenGame settings."),
  /* Since 20261029180000 any active account with a handle is a member, and an account with
     no handle hears handle_required first, so this is what is left: an account the
     platform cannot place at all. */
  not_member: refuse(403, "never", "This account does not have platform access. Sign in with the account you use on OpenGame."),
  // Suspended or deleted. Nobody can add it back to the platform from here, so the only
  // way on is another account. Kept apart from not_member, whose fix is an owner.
  account_inactive: refuse(403, "never", "This account is suspended or deleted, so it cannot use the platform. Sign in with a different account."),
  /* Banned by the social review, which leaves the profile active and, for an owner or a
     tester, membership too (public.account_may_ship, 20261029179160). Refused on what
     ships or spends and on nothing that reads, so the account can still see its games and
     why, and still roll one back to a version that was live. A messaging restriction and a
     report-only review hold are not this. Not something a retry fixes, and not "for good"
     either, since a ban can be lifted, so the sentence says neither. */
  account_banned: refuse(403, "never", "OpenGame's moderators have banned this account, so it cannot ship anything new or enter the jam. Nothing changed. Write to team@opengame.io if you think that is wrong."),
  insufficient_scope: refuse(403, "after-fix", "This token cannot do this. Create a token with the needed permission in OpenGame settings."),
  handle_required: refuse(409, "after-fix", "Claim a handle on OpenGame, then try again."),
} as const;
export type PlatformAuthErrorCode = keyof typeof AUTH;
export const PLATFORM_AUTH_CODES = Object.keys(AUTH) as PlatformAuthErrorCode[];
export function isPlatformAuthErrorCode(value: unknown): value is PlatformAuthErrorCode {
  return typeof value === "string" && Object.hasOwn(AUTH, value);
}
/** The status, retry and sentence for a credential refusal. */
export function platformAuthError(code: PlatformAuthErrorCode): (typeof AUTH)[PlatformAuthErrorCode] {
  return AUTH[code];
}

const BUDGET_PAUSED: Row = {
  ...say({ exit: 5, retry: "later" }, "OpenGame's spending allowance is unavailable, so checks are paused. Your queued check will be retried after the pause ends. Run opengame status to follow it; keep the current game files.", 503),
  page: "OpenGame's spending allowance is unavailable, so checks are paused. Your queued check will be retried after the pause ends. Follow its progress on this page; keep the current game files.",
  console: "Checks are paused because spend admission is unavailable. Inspect the provider budget and admission configuration before resuming work.",
};

export const ERRORS: Readonly<Record<string, Row>> = {
  ...AUTH,
  // The game or its files.
  check_failed: game, build_failed: game, build_timeout: game, deploy_failed: game, bundle_limit: game,
  /* The CLI installing a project's packages before its build (packages/cli deploy.ts):
     none installed and no lockfile to install from, or the lockfile's install failed. */
  dependencies_missing: game, install_failed: game,
  archive_limit: game, symlink: game, special_file: game, unportable_name: game, unicode_collision: game, build_changed: game,
  manifest_invalid: game, manifest_unreadable: game, folder_missing: game,
  reserved_runtime_path: game, entry_missing: game, vendor_hash: game,
  // No opengame.json at all: the folder needs `opengame init`, which is a step, not a change to the game.
  manifest_missing: say(input, "There is no opengame.json in this folder. Run opengame init."),
  output_outside_project: game, archive_changed: game, genre_invalid: input, manifest_exists: input,
  // init's --kind and --based-on, refused before a file is written. The sentence names the flag.
  kind_invalid: input, based_on_invalid: input,
  /* The database's own reading of kind and basedOn (private.game_kind_claim, which is
     parseGameKind in SQL), raised by the freeze, the jam route and a reviewer's
     correction. based_on_required is init's code too, where the CLI writes its own sentence
     naming the flag; these are the sentences for everybody else. */
  invalid_kind: { ...say(input, "The kind must be game, world, decomp or mod. Correct kind in opengame.json, then deploy again.", 400),
    console: "The kind must be game, world, decomp or mod. Nothing changed." },
  invalid_based_on: { ...say(input, `basedOn names the game a decomp or a mod is made from, in up to ${LIMITS.text.gameBasedOn.max} characters, and a game or a world has none. Correct it in opengame.json, then deploy again.`, 400),
    console: `Name the source game in up to ${LIMITS.text.gameBasedOn.max} characters, and only for a decomp or a mod. Nothing changed.` },
  based_on_required: { ...say(input, "A decomp or a mod must name the game it is made from. Set basedOn in opengame.json, then deploy again.", 400),
    console: "A decomp or a mod must name the game it is made from. Nothing changed." },
  invalid_manifest: say(game, "This upload has an invalid opengame.json. Correct the manifest and start a new deploy."),
  // Something the person or agent has to choose.
  unknown_command: input, unknown_flag: input, unsupported_flag: input, invalid_flag: input, duplicate_flag: input,
  missing_flag_value: input, arguments: input, token_flag: input, api_path: input, ambiguous_token: input, token_stdin: input,
  invalid_idempotency_key: input, invalid_metadata: input, not_linked: input,
  build_output_ambiguous: input, build_output_invalid: input, build_output_required: input, package_unreadable: input,
  engine_invalid: input, runtime_contract_unknown: input, port_invalid: input,
  vendor_output: input, vendor_output_exists: input, vendor_document_relative: game,
  filesystem_unsupported: input, runtime_artifact_missing: input, dev_runtime_missing: input,
  runtime_reference: game,
  unity_assets_plan: input, unity_assets_limit: game,
  // A retry cannot supply missing redistribution evidence for a platform runtime.
  runtime_source_unresolved: { ...input, retry: "never" },
  submission_destination: input,
  /* Uploads are closed for everybody but owners and testers until an owner opens them
     (docs/deploying.md, "Opening opengame.io"). Exit 3 because it is about what this
     account may do, and `later` because waiting is the whole fix: nothing about the game,
     the token or the login is wrong. The server names the day where it knows it. */
  /* The creator platform is not open yet: the CLI, tokens, uploads and the creator API open
     at the jam's kickoff, a day after the site (the owner, 8 Nov 2026), so the sentence names
     that day, KICKOFF_COPY, and never the site's. The server
     answers it on every creator API route but status and sign-in, for any account it does
     not let through, and the CLI says it before a command starts. An exit of its own,
     because nothing an agent can change fixes it: not the game (1), not a flag (2), not the
     login (3), and not a wait it could time (4). Signing in as somebody OpenGame lets
     through early does, which is why the sentence is the whole message and names no fix. */
  not_launched: say({ exit: 7, retry: "later" }, `OpenGame opens for creators on ${KICKOFF_COPY}.`, 403),
  uploads_closed: say({ exit: 3, retry: "later" }, "Uploads are not open yet, so this upload did not start. Your login and your games still work. Try again once uploads open.", 403),
  /* The jam's close, which is also the platform's: after entriesCloseAt every deploy path
     refuses every deploy, fixes included (plan, `freeze`). `never`, because no wait and no
     retry reopens it; only a reviewed change to the launch clock does. Exit 3 for the
     reason uploads_closed gives: nothing about the game or the login is wrong. The sentence
     is the shared clock's, so the CLI, Drop, remix and the pipeline say the same words. */
  entries_closed: say({ exit: 3, retry: "never" }, ENTRIES_CLOSED_MESSAGE, 403),
  /* opengame.json's `owner` names a different account than the one deploying. */
  owner_mismatch: say(game, "This project’s opengame.json names a different OpenGame account as its owner. Change owner to your own @handle, or deploy from your own copy.", 409),
  /* A GitHub deploy's check (lib/platform/github/ownership.ts): the commit is the named
     branch's or release's own, and an opengame.json at the top, when there is one naming an
     owner, names this account. A repository without one deploys; since 10 Nov 2026 nothing
     requires the file. */
  github_owner_unproved: say(game, "This repository could not be deployed as yours: its opengame.json names a different OpenGame account as its owner, or the branch or release has moved. Read the repository again, and if it is yours, change owner to your own @handle.", 409),
  github_unreachable: say(ours, "OpenGame could not read the repository from GitHub to check it. Try again in a minute.", 502),
  idempotency_conflict: say(input, "This retry key was already used for a different request. Use a new --idempotency-key, or run the command without one.", 409),
  /* A later ready deploy owns the achievement definitions. Retrying the older one
     would put its titles back and turn a retired achievement on again. */
  achievement_deploy_superseded: say({ exit: 1, retry: "never" }, "A newer deploy already saved this game’s achievements, so this older one left them unchanged.", 409),
  stale_name_revision: say(input, "Your room name changed in another request. Check the room and try again.", 409),
  version_changed: say(input, "This game has a new version. Reopen it to join a room.", 409),
  already_linked: input, game_required: input, invalid_game: input, invalid_cursor: input, cancelled: input,
  no_games: input, deploy_in_progress: input, upload_pending: input, archive_unavailable: input,
  project_state: input, project_ignore: input, ignore_symlink: input,
  manifest_changed: input, token_action: input, token_request: input, api_origin: input, invalid_choice: input,
  // There is no draft removal command, so the sentence must not ask for one. Space frees
  // itself: failed deploys are cleared after a grace period and each game keeps only its
  // newest releases. GET /api/v1/limits reports usage and reset times. A wait, so exit 4:
  // it was exit 2, "supply a flag", beside a sentence saying space frees up on its own,
  // and an agent went looking for the flag. The server adds retryAfterSeconds when a
  // failed deploy is due to be cleared.
  storage_budget_exhausted: say(limited, `The retained upload allowance is used. Failed deploys are cleared ${Math.round(LIMITS.platform.deploy.failedRetentionSeconds / 3600)} hours after they end and each game keeps its newest ${LIMITS.platform.deploy.releasesKept} releases, so space frees up on its own. GET /api/v1/limits shows your current usage.`, 429),
  no_pending_login: input,
  environment_token: input, token_supplied: input,
  // opengame skills (pf/skills). A skill somebody edited stops the run until they choose
  // --keep-edited or --replace, so it is a choice, not a fault.
  invalid_agent: input, invalid_dir: input, invalid_skill: input, skills_action: input, skills_conflict: input,
  // Vendoring checks a chosen dependency, so invalid source bytes need a new
  // dependency or a local build. Download and deadline failures may be retried.
  vendor_source: game, vendor_module: game, vendor_integrity: game, vendor_limit: game,
  vendor_missing: game, vendor_collision: game, vendor_license: game, vendor_bare_import: game,
  vendor_compressed_source: say(game, "Rebuild with local dependencies or export the script uncompressed."),
  vendor_download: ours, vendor_timeout: ours,
  upgrade_untrusted: { exit: 5, retry: "after-fix" },
  // Ours to report, but waiting does not fix either: a server and CLI set up with
  // different origins, and a damaged CLI install.
  origin_mismatch: { exit: 5, retry: "after-fix" }, skills_unavailable: { exit: 5, retry: "after-fix" },
  dev_sdk_missing: { exit: 5, retry: "after-fix" },
  achievements_unsupported: say(input, "This server refused the manifest and may not accept achievements in opengame.json yet. Deploy without the achievements field, or wait for the server update."),
  // opengame submit and opengame jams (pf/submit-review), and the server's refusals of a
  // submission. These were a table of their own in apps/web's submit.ts.
  conflicting_flags: input, invalid_release: input, release_required: input, no_ready_release: input,
  // opengame releases and opengame rollback. A rollback changes what every player gets, so
  // without a person to ask, --yes is the answer; a prefix two releases share is not guessed.
  // A server from before the releases routes is ours to update, and the page has both.
  confirmation_required: input, release_ambiguous: input, releases_unavailable: { exit: 5, retry: "after-fix" },
  // opengame unpublish and opengame restore, against a server from before their routes.
  take_down_unavailable: { exit: 5, retry: "after-fix" },
  // opengame details and opengame handle: an older server, and a rename with no name.
  edit_unavailable: { exit: 5, retry: "after-fix" }, handle_required_argument: input,
  // opengame jam withdraw and reenter: a subcommand that is not one.
  jam_action_required: input,
  // opengame achievements retire: no id, or one the game does not have.
  achievement_required: input, achievement_not_found: input,
  // opengame stats --csv: the file is somebody's, or cannot be written.
  csv_exists: input, csv_unwritable: input,
  invalid_jam: input, jam_answers_required: input, jam_choice_required: input,
  submission_destination_mismatch: say(input, "The server selects the submission destination. Run opengame jams to read the current destination, then submit with its answers.", 409),
  submission_destination_unavailable: say({ exit: 5, retry: "later" }, "OpenGame cannot take submissions right now. Your private preview is unchanged; try submitting again later.", 503),
  release_not_found: { ...say(input, "This release was not found in your account. Check the release id that opengame deploy or opengame status printed.", 404),
    page: "That release is not one of this game’s.", console: "That release is not one of this game’s." },
  release_not_ready: say(input, "This release is still being checked, or its files were cleaned up. Wait until opengame status says it is ready, or deploy again.", 409),
  release_token_revoked: say(input, "This release was uploaded with a token that has since been revoked, so it cannot be submitted. Deploy it again while signed in.", 409),
  release_superseded: say(input, "A newer release of this game is already in review or live, so this older release cannot be submitted again. Check that release instead.", 409),
  review_open_elsewhere: say(input, "This game already has an entry in review from the website. Withdraw it on your entries page, or wait for its decision.", 409),
  // The approved release is being copied to where players get it. A minute or two, and
  // nothing for the caller to change, so it is a wait rather than a refusal of input.
  release_publishing: say({ exit: 5, retry: "later" }, "This game's approved release is being published now. Submit again once it is live, in a minute or two; nothing about this release needs to change.", 409),
  // The QA destination (20261024110000): staff proof games on the same pipeline, never in
  // a jam or a listing. An account without the grant asks an owner; there is no flag that
  // changes the answer, so a retry does not either.
  qa_destination_not_permitted: say({ ...auth, retry: "never" }, "This account cannot submit to the QA destination. It needs a QA grant from an OpenGame owner in the console. Nothing was submitted, and nothing was entered in a jam.", 403),
  qa_destination_game_mismatch: say(input, "A game is a QA game or an ordinary one from its first submission. Submit this release to the destination this game already uses, or deploy a new game. Nothing was submitted.", 409),
  jam_entry_in_review: say(input, "This game's jam entry is in review. Submit this release with the current jam answers to replace it, or wait for its decision.", 409),
  jam_not_found: say(input, "There is no jam with that name. Run opengame jams to see the open ones.", 404),
  jam_closed: say(input, "That jam is not taking entries now. Your private preview remains available. Marketplace submissions open separately.", 409),
  // After the close a game's entry that judges play fixes its live version, in the jam and on
  // the marketplace alike (platform_jam_entry_judged), so no retry and no flag changes it.
  jam_entry_judged: say({ ...input, retry: "never" }, "The jam has closed and the version of this game that was live then is the one that is judged, so this release cannot replace it, in the jam or on the marketplace. It stays a private preview.", 409),
  // Its rules require that you own every asset and built it after kickoff, which a decomp or
  // a mod of somebody else's game cannot (game-kinds.json). Refused by the CLI from the local
  // manifest, by the submit route from the release, and by a trigger on jam_entries.
  kind_not_in_jam: say(input, "The jam takes games and worlds. Decomps and mods can go on OpenGame but cannot enter it.", 409),
  invalid_jam_answers: say(input, "The jam answers do not match the jam's current form. Run opengame jams <slug> to see it, then submit again.", 409),
  metadata_conversion_required: say(input, "This game's current settings cannot be represented in opengame.json. Review your local settings, then deploy with --metadata=local to use them."),
  invalid_metadata_revision: say(input, "Your local metadata revision is newer than this game's. Check which game your project is linked to, then pull its current metadata before deploying again."),
  // The rest of what the v1 API answers with. Each was sent with no row, so an agent got
  // the exit errorExit guesses from the HTTP status: a 404 for a submission id read as
  // our outage, and a daily playtest allowance (a 429) carried no wait at all. A test in
  // packages/protocol reads the v1 sources and fails on a code with no row here.
  attempts_exhausted: say({ exit: 5, retry: "never" }, "OpenGame could not finish this check after the allowed attempts. Run opengame status and contact the OpenGame team; keep the current game files.", 503),
  spend_model_price_unverified: say({ exit: 5, retry: "after-fix" }, "Checks are paused because OpenGame could not verify the model price. Contact the OpenGame team; keep the current game files.", 503),
  spend_model_price_changed: say({ exit: 5, retry: "after-fix" }, "Checks are paused because a provider price changed. The OpenGame team must update the spending configuration before work resumes; keep the current game files.", 503),
  spend_compute_envelope_changed: say({ exit: 5, retry: "after-fix" }, "Checks are paused because the compute configuration changed. Contact the OpenGame team to update its spending allowance; keep the current game files.", 503),
  spend_price_contract_invalid: say({ exit: 5, retry: "after-fix" }, "Checks are paused because OpenGame's pricing configuration could not be verified. Contact the OpenGame team; keep the current game files.", 503),
  spend_ceiling_below_price: say({ exit: 5, retry: "after-fix" }, "Checks are paused because the current provider price exceeds OpenGame's spending allowance. Contact the OpenGame team; keep the current game files.", 503),
  spend_request_contract_changed: say({ exit: 5, retry: "after-fix" }, "Checks are paused because the paid request differs from OpenGame's approved spending configuration. Contact the OpenGame team; keep the current game files.", 503),
  spend_provider_catalogue_unavailable: say({ exit: 5, retry: "later" }, "OpenGame could not read current provider prices, so checks are paused. Follow the queued check with opengame status; keep the current game files.", 503),
  // A ledger that did not answer is retried in minutes; one that answered no needs us
  // (platform_budget.py, _did_not_answer, 5 Nov 2026). `never`, not `after-fix`: nothing in
  // the game is the fix, and an agent reads `after-fix` as "change the game".
  spend_reservation_unavailable: say({ exit: 5, retry: "later" }, "OpenGame could not reach its spending allowance, so it runs this check again in a few minutes. Follow it with opengame status; keep the current game files.", 503),
  spend_reservation_refused: say({ exit: 5, retry: "never" }, "Checks are paused because OpenGame's spending allowance turned this check down. Nothing in your game needs to change. Contact the OpenGame team; keep the current game files.", 503),
  spend_start_refused: say({ exit: 5, retry: "never" }, "Checks are paused because OpenGame's spending allowance turned down starting this check. Nothing in your game needs to change. Contact the OpenGame team; keep the current game files.", 503),
  spend_start_unavailable: say({ exit: 5, retry: "never" }, "OpenGame could not confirm whether an earlier paid attempt started. Run opengame status and contact the OpenGame team before starting another request, which could repeat a charge.", 503),
  spend_already_started: say({ exit: 5, retry: "later" }, "OpenGame is resolving an earlier paid attempt. Run opengame status to follow the queued work; keep the current game files.", 503),
  spend_budget_paused: BUDGET_PAUSED,
  // Report reassessments retain this earlier code in their durable queue.
  // They resume the same work after a spending pause, just like deploy checks.
  budget_paused: BUDGET_PAUSED,
  controlled_incident_review: {
    ...say({ exit: 5, retry: "never" }, "Checks are stopped for an OpenGame safety review. Contact the OpenGame team before trying again; keep the current game files.", 503),
    page: "Checks are stopped for an OpenGame safety review. Contact the OpenGame team before trying again; keep the current game files.",
    console: "This check stopped because access to the release is restricted for safety review. Follow the incident review process before resuming it.",
  },
  submission_intake_paused: say({ exit: 5, retry: "later" }, "Submissions are briefly paused. Your game and saved request are still here. Try again in a few minutes.", 503),
  submission_quota_exhausted: say(limited, "The submission allowance for today (UTC) is used. Nothing was submitted; try again after midnight UTC.", 429),
  gpu_quota_exhausted: say(limited, "The playtest allowance for the last 24 hours is used. Nothing was queued; submit again when the next run frees up.", 429),
  at_entry_limit: say(input, "You already have the most entries this jam takes. Withdraw one on your jam entries page before entering another game.", 409),
  /* `input`, not `limited`, since 5 Nov 2026: the jam takes a build whose deploy began at or
     after its kickoff, so waiting never makes this release an entry and running the same
     command again is refused again. The fix is a new deploy once the jam opens. */
  jam_not_open: say(input, "This jam was not open for entries yet, so this build cannot enter it. Deploy again once it opens to enter. Nothing was submitted.", 409),
  certification_incomplete: say(input, "Tick every statement to certify this release.", 400),
  submission_not_found: say(input, "This submission was not found in your account.", 404),
  preview_not_ready: { exit: 4, retry: "later", status: 409 },
  invalid_request: say(input, "The request could not be read. Check the command's flags and run it again.", 400),
  invalid_range: input, range_not_supported: input, content_type: input, body_too_large: input,
  // Two first reads of one analytics week are checked one after the other, so each
  // sees what the other kept. The second waits, and past that wait it is told to retry.
  // Creator report filters were removed on 23 Oct 2026. Dropping the flag is the fix.
  filters_removed: say(input, ANALYTICS_FILTERS_REMOVED, 400),
  // A CLI too old to read weekly reports. Updating is the fix; exit 6 is "this CLI is too old".
  analytics_cli_outdated: say({ exit: 6, retry: "after-fix" }, ANALYTICS_CLI_OUTDATED, 426),
  analytics_busy: say({ exit: 5, retry: "now" }, "Another read of this week is being checked. Run it again in a few seconds.", 503),
  // No route at this /api/v1 path, or the platform is switched off on this server, which
  // answers as if the route did not exist.
  not_found: { exit: 5, retry: "after-fix", status: 404 },
  // Browser-only appeals (the private game page). Each is a reason, not an outage. These
  // sentences were a second table in apps/web's submit.ts, which had already drifted from
  // this one and alone knew release_unavailable.
  appeal_used: say(input, "This release has already been appealed. Deploy an updated release to submit again.", 409),
  not_returned: say(input, "Only a release returned with fixes can be appealed.", 409),
  invalid_appeal: say(input, `Say in a sentence or two what the review missed, up to ${TEXT.platformAppeal.max.toLocaleString("en-US")} characters.`, 409),
  superseded: say(input, "A newer release of this game is already in review, so this one cannot be appealed.", 409),
  release_unavailable: say({ exit: 2, retry: "never" }, "This release is too old to appeal because its files have been cleared. Deploy it again and submit the new release.", 409),
  // Rolling a game back to a release it published before: the owner from the game's
  // workspace, staff from the console. These were a third table, in @opengame/hosting.
  game_not_live: say(input, "This game is not live, so there is nothing to roll back. Put it back up first.", 409),
  own_game_held: say({ exit: 3, retry: "never" }, "This is your own game, so another reviewer puts it back. Nothing changed.", 409),
  release_never_live: { ...say(input, "That release was never live, so it cannot be rolled back to. Submit it for review instead.", 409),
    console: "That release was never live, so it cannot be rolled back to. Nothing changed." },
  release_not_promoted: { ...say(input, "That release has no public copy, so it cannot be served. Submit it for review instead.", 409),
    console: "That release has no public copy, so it cannot be served. Nothing changed." },
  release_bytes_deleted: say({ exit: 2, retry: "never" }, "That release’s files were cleaned up, so it cannot be served again.", 409),
  release_copy_changed: { ...say({ exit: 5, retry: "never" }, "That release’s public copy no longer matches the files that were checked, so it was not served again. Nothing changed. Submit it for review instead.", 409),
    console: "That release’s public copy in og-public no longer matches its scanned files, so it was not served again. Nothing changed." },
  publishing_in_progress: say({ exit: 5, retry: "later" }, "A release of this game is being published right now. Roll back once it is live, in a minute or two.", 409),
  report_open: { ...say({ exit: 2, retry: "later" }, "A report about this game is open, so that release waits for us to look at it first. Nothing changed.", 409),
    console: "A report about this game is open. Resolve it in Reports before rolling back. Nothing changed." },
  release_held_by_us: say({ exit: 2, retry: "never" }, "We took the game off that release, so it cannot be made live again from here. Write to team@opengame.io to ask for another look, or submit a new release.", 409),
  invalid_reason: say(input, `Keep the reason under ${TEXT.reviewNote.max.toLocaleString("en-US")} characters.`, 409),
  // Ours. The sentence names the cause, so it is the caller's to write and these rows carry none.
  host_failed: { exit: 5, retry: "now", status: 502 },
  rollback_failed: { exit: 5, retry: "later", status: 409 },
  /* The rest of what @opengame/hosting's rollback refuses with, each in a sentence it writes
     for its audience (copyright, the build's own holds, the creator's account). They had no
     row, so the owner's rollback met `refused()`'s missing-row fault: a 500 from the API and
     the page's "could not be made" in place of the reason. None is fixed by waiting or by
     sending it again; another release, or a person, is what changes them. */
  copyright_hold: { exit: 2, retry: "never", status: 409 }, copyright_evidence_version: { exit: 2, retry: "never", status: 409 },
  build_threat: { exit: 2, retry: "never", status: 409 }, build_legal_hold: { exit: 2, retry: "never", status: 409 },
  account_suspended: { exit: 2, retry: "never", status: 409 }, account_deleted: { exit: 2, retry: "never", status: 409 },
  /* Unpublish and put it back, on Your games (the page reads these for its own words) and
     from the creator API, through the same
     functions. A refusal is about this game and none changes by sending it again.
     `unpublish_refused` has one reason, a game that is not live; `restore_refused` carries
     `verdicts`' own sentence (our takedown, a hold, a report, the scanner), and this one
     when the game is not one its owner took down. The rest are ours, and say which half
     of the act happened. `unpublish_incomplete` is a game already down, because the edge
     leads. `restore_incomplete` is a restore that stopped and was put back on hold. */
  unpublish_refused: say({ exit: 2, retry: "never" }, "This game is not on the gallery, so there is nothing to take off it.", 409),
  restore_refused: say({ exit: 2, retry: "never" }, "Only a game you unpublished yourself can go back up.", 409),
  no_reviewed_build: { ...say({ exit: 2, retry: "never" }, "There is no reviewed build to serve, so putting this back would give players a page that does not load. Write to team@opengame.io and we will sort it out.", 409),
    page: "There is no reviewed build to serve, so putting this back would give players a page that does not load. Write to us and we will sort it out." },
  take_down_unreachable: say({ exit: 5, retry: "later" }, "Nothing changed and your game is exactly where it was. We could not reach the part of our system that starts and stops serving a game, which is ours to fix rather than yours. Try again in a minute.", 503),
  restore_unverified: say({ exit: 5, retry: "later" }, "The address could not be checked. Your game and uploads are saved. Check its review status, then try again.", 503),
  unpublish_incomplete: { ...say({ exit: 5, retry: "now" }, "Your game is no longer being served and browsers have been told to drop what they cached. The gallery has not caught up yet, so it may still be listed for a moment. Run it again, and write to team@opengame.io if that keeps happening.", 502),
    page: "Your game is no longer being served and browsers have been told to drop what they cached. The gallery has not caught up yet, so it may still be carded for a moment. Press it again, and write to us if that keeps happening." },
  restore_incomplete: say({ exit: 5, retry: "now" }, "Your game’s gallery status could not be confirmed. Your build and uploads are saved. Try again in a minute.", 502),
  /* Delete for good from the creator API, through the website's `deleteGameAs`. The typed
     title is compared on the server; `delete_refused` carries `verdicts`' sentence (a legal
     hold, a reviewer holding it, a jam being scored, already deleted). */
  delete_title_mismatch: say(input, "Nothing was deleted. The title you typed does not match the game's title. Type it exactly as opengame games prints it.", 400),
  delete_refused: { exit: 2, retry: "never", status: 409 },
  delete_incomplete: say({ exit: 5, retry: "now" }, "Your game is no longer being served, and the gallery has not caught up with the delete yet. Run the same delete again, and write to team@opengame.io if that keeps happening.", 502),
  /* Editing a game's words and renaming a handle from the creator API, through the
     website's own functions, whose sentences these carry. */
  invalid_details: { exit: 2, retry: "after-fix", status: 400 },
  // The two refusals the website gives every writer of a game's words, which it reads from here.
  legacy_game_words: say({ exit: 2, retry: "never" }, "This game’s words are changed on its entry page, so nothing was saved here.", 409),
  words_refused: say({ exit: 3, retry: "never" }, "This account can’t edit its games, so nothing was saved.", 403),
  invalid_handle: { exit: 2, retry: "after-fix", status: 400 }, handle_unavailable: { exit: 2, retry: "after-fix", status: 409 },
  handle_unchanged: say({ exit: 2, retry: "never" }, "That is already your handle.", 409),
  /* Withdrawing a jam entry and putting it back from the creator API (lib/platform/
     jam-entry.ts), through /jam/entries' own functions. `kind_not_in_jam` and
     `at_entry_limit` are the submit path's rows and say the same thing here. */
  jam_entry_not_found: { exit: 2, retry: "never", status: 404 },
  withdraw_closed: say({ exit: 2, retry: "never" }, "Nothing changed. That jam has stopped taking entries, so its entries stay as they are. Write to team@opengame.io if you need this one out.", 409),
  reenter_closed: say({ exit: 2, retry: "later" }, "Nothing changed. That jam is not taking entries right now, so the entry stays withdrawn. Run this again once it opens; after it closes, write to team@opengame.io.", 409),
  jam_entry_taken: say({ exit: 2, retry: "never" }, "A later entry of this game is already standing in the jam, so this one stays withdrawn.", 409),
  jam_entry_held: say({ exit: 3, retry: "never" }, "Nothing changed. This account cannot enter the jam right now, so the entry stays withdrawn. Write to team@opengame.io if you think that is wrong.", 403),
  // A cron route refusing the private setup's clock because this process is not the
  // internal one (lib/platform/internal-clock.ts). Only the bridge ever reads it; a row
  // keeps the one-table rule true for every code the platform's web code sends.
  not_the_internal_process: { exit: 5, retry: "never", status: 409 },
  // Who is asking, beyond the credential refusals above.
  not_signed_in: auth, unauthorized: auth, forbidden: auth, token_format: auth, access_denied: auth,
  login_expired: auth, credential_storage: auth,
  // Not signed in YET: the person has the code and has not pressed Allow. Exit 3 rather
  // than 0, so `opengame login && opengame deploy` stops here instead of deploying
  // signed out; `next` is opengame login --continue.
  login_pending: say(auth, "Waiting for the person to allow access in the browser. When they have, run opengame login --continue."), keychain_unavailable: auth, credential_busy: auth,
  game_not_found: auth, profile_unavailable: ours,
  // A deleted game took new releases into a page that answers Unavailable, and the
  // terminal called each one a ready preview.
  // Removed by its owner or after a notice; the same words fit both, and neither is
  // told to upload it again as a new game.
  game_removed: say(input, "This folder is linked to a game that was removed, so it takes no new releases. It shows as Unavailable under Your games on the website.", 409),
  // Waiting is the fix.
  deploy_rate_limited: say(limited, "The hourly deploy allowance is used. Try again later.", 429),
  /* Five deploys in any 24 hours (platform.deploy.perAccountPerDay, 20261105180200). */
  deploy_day_limited: say(limited, `You have started ${LIMITS.platform.deploy.perAccountPerDay} deploys in the last 24 hours, the most one account can. Nothing was uploaded. Try again later.`, 429),
  /* Only a granted large-asset lane has a daily scan allowance since 4 Nov 2026. */
  scan_budget_exhausted: say(limited, "This lane's daily scan allowance is used. Try again tomorrow.", 429),
  // The platform's own daily ceiling on granted large-asset uploads (20261023129200), which
  // 20261105220700 removed: nothing raises this now. Kept so a refusal recorded before then
  // still reads as itself rather than as an unknown code.
  platform_scan_budget_exhausted: say(limited, "OpenGame has scanned as much as it can today. This does not count against your allowance. Try again tomorrow.", 429),
  // The large-asset lanes: Kaigen's (20261023122000) and the engine-agnostic large-game
  // lane (20261027170400). Engine detection is forgeable, so each is admitted by a person
  // turning it on for the account, and Kaigen's also by the creator accepting the
  // publication statement when the upload begins. Both are refused before a single upload
  // URL is signed. The sentence names no engine because it is said for both lanes.
  large_asset_lane_not_granted: { exit: 3, retry: "never", status: 403,
    message: "This upload is past the standard limits and needs large-asset access on your account. Ask the OpenGame team to turn it on." },
  asset_plan_missing: say(input, "The asset plan file is missing. Give its path from the game folder, or an absolute path.", 400),
  large_asset_statement_required: say(input, "This upload needs the Kaigen publication statement. Run opengame check with the same asset plan to read it, then deploy again with --accept-statement and the version it prints.", 400),
  rate_limited: limited, slow_down: limited,
  // Ours, or the network between us.
  network: ours, invalid_response: ours, temporarily_unavailable: ours, platform_unconfigured: ours,
  api_error: ours, api_unavailable: ours, internal_error: ours, preflight_unavailable: ours,
  // This machine rather than ours: the folder, its permissions or a full disk. Its message
  // says to fix those and retry, and "later" told an agent that waiting would do it.
  local_error: { exit: 5, retry: "after-fix" },
  upload_interrupted: ours, invalid_upload: ours,
  checks_pending: ours, project_busy: ours, upgrade_failed: ours, upload_missing: ours,
  // Terminal outcomes written by platform_finalize_deploy and the reconcile sweep
  // (pipeline-ready, 20261005040110 onwards). Each sentence names what happened, whose
  // fault it was, and whether a retry can help.
  deploy_expired: say(ours, "This upload expired before its checks finished. Run opengame deploy to start again."),
  upload_abandoned: say(ours, "The upload did not finish before its upload window closed, so no checks ran. Run opengame deploy to start again."),
  deploy_checks_failed: say(game, "A check refused this upload. Each failed check's finding names the file and what to change. Change those, then deploy again."),
  text_policy_blocked: say(game, "Text in this upload crossed a text check's threshold. The text finding names the question. Change that text, then deploy again."),
  upload_hash_mismatch: say(game, "The uploaded archive does not match the hash this deploy declared, so it was not checked. Run opengame deploy again from a fresh build."),
  candidate_unavailable: say(ours, "We could not prepare a release from this upload in time. The failure was on our side. Run opengame deploy later to try again."),
  /* A stale deploy keeps the website's fields, and a cover the website held is imported
     with them. Since 30 Oct 2026 nobody supplies a cover, so the way past a missing one is
     to go ahead without it: --metadata=local carries no website-only picture, and OpenGame
     makes the cover after approval. */
  cover_source_unavailable: say(input, "The cover saved on the website could not be found. Run opengame deploy --metadata=local to deploy without it; OpenGame makes a new cover after approval. That also replaces website edits to the title, description and other details with opengame.json, so run opengame pull first to keep them."),
  receipt_contract_unsupported: say(ours, "This release was prepared under check rules the server no longer runs. Run opengame deploy to upload it again."),
  release_storage_unavailable: say(ours, "The stored copy of this upload was removed before its checks finished. Run opengame deploy to upload it again."),
  scan_exhausted: say(ours, "Our scanner stopped before a verdict on every attempt for this upload. Nothing in the game has been found wrong. Run opengame deploy later to try again."),
  scan_unavailable: say(ours, "Our scanner did not finish within the check allowance. The failure was on our side. Run opengame deploy later to try again."),
  finalize_failed: say(ours, "We could not finish deciding this upload before its check allowance ran out. The failure was on our side. Run opengame deploy to try again."),
  scan_evidence_inconsistent: say(ours, "Our checks produced evidence we could not verify. The failure was on our side. Run opengame deploy later to try again."),
  // An archive warning nobody can clear fails the deploy: nothing escalates it to a
  // person (only images are, through platform_escalate_images), so changing the files
  // the archive check warned about is the only way the deploy can pass.
  archive_warning_unreviewed: say(game, "The archive check raised a warning that cannot be cleared automatically. Read the archive findings, change those files, then deploy again."),
  image_coverage_unsupported: say(game, "Some images in this upload could not be checked, so the upload was not deployed. The image findings name the file that could not be read, or the image count or size limit it passed. Remove unused images, make textures or animation frames smaller, or convert the named file, then deploy again."),
  /* Only a cover the game already had reaches the image check now, carried forward by the
     deploy (20261105220000); nothing in the upload is a cover any more. A retry reads the
     same picture, and the creator cannot replace it, so the way past is the one deploy
     that carries none. */
  cover_unavailable: say(input, "The cover this game already had could not be read, so this upload was not checked. Nothing in your game needs to change. Run opengame deploy --metadata=local to deploy without that cover; OpenGame makes a new one after approval. That also replaces website edits to the title, description and other details with opengame.json, so run opengame pull first to keep them."),
  /* The images finding says what to do, and it is not the same for every image: a file in
     the upload is removed or replaced, and the cover the game already had is deployed
     without (20261105220400's platform_image_outcome). This sentence covers both by
     pointing at it, as image_needs_review does. */
  image_policy_blocked: say(game, "The image safety check flagged an image in this upload, so the upload was not deployed. The images finding names the image and what to do about it. The flagged image is kept and recorded for the OpenGame team."),
  // A game row, not "a person decides": no clearance exists for this deploy or a later
  // one of the same image to wait for (20261005040180 says so beside the receipt it
  // writes). A person may look at the escalation, but only for retention; replacing the
  // image is the creator's only way forward, so this says nothing about a person. It said
  // "held for a person" and "names it and why" while the finding said only that the check
  // "could not judge" an image it had flagged for self-harm. 20261015150000 makes the
  // finding name the category, which is what makes the second sentence here true.
  image_needs_review: say(game, "The image safety check held an image in this upload, so the upload was not deployed. The images finding names the image and why it was held. Replace that image with a different one, then deploy again. The held image is kept and recorded for the OpenGame team."),
  image_review_unavailable: say(ours, "The image safety check was unavailable for longer than a deploy can wait. The failure was on our side. Run opengame deploy later to try again."),
  // A large-asset lane account's rolling day of image checks (20261023125100). Waiting
  // is the fix, so it is the rate-limited row; the images finding gives the time.
  image_review_daily_cap: {
    ...say(limited, "Your account reached its daily limit of image checks on the large asset lane, so this upload was not checked. The game can stay as it is. Run opengame deploy again after the time in the images finding."),
    page: "Your account reached its daily limit of image checks on the large asset lane, so this upload was not checked. The game can stay as it is. Deploy again after the time in the images finding.",
  },
  text_credential: say(game, "Text in your game or its metadata matches a credential pattern. Remove the key, rotate it, then deploy again."),
  text_policy_uncalibrated: say(ours, "This release needs a text check that is not running yet. Run opengame deploy to upload it again under the current rules."),
  text_review_unavailable: say(ours, "The text check did not finish within the deploy allowance. Run opengame deploy later to try again."),
  // A dead upload: the CLI starts a fresh deploy rather than resuming it. All four are
  // 409s, upload_attempts_exhausted included although the database raises it as OG429:
  // waiting does not revive the upload, a new deploy does, and the OpenAPI says 409.
  upload_expired: say(input, "This upload expired before the archive arrived. Run opengame deploy to start a new one.", 409),
  upload_attempts_exhausted: say(input, "This upload has used its retry allowance. Start a new deploy.", 409),
  upload_size_mismatch: say(input, "The uploaded archive has a different size. Start a new deploy with the original archive.", 409),
  build_conflict: say(input, "This upload can no longer be completed. Start a new deploy.", 409),
  // Private previews (preview-serving). Revoked is final for that grant. preview_unavailable
  // has no row on purpose: the server sends it as a 409 (this release cannot have one) and
  // as a 503 (this server is not configured for previews), and the status says which.
  preview_revoked: { exit: 2, retry: "never", status: 409 },
  // A moderator's take-down or a reviewer's rejection. Waiting does not change it, and
  // the game page says what does.
  preview_held: { exit: 2, retry: "never", status: 409 },
  upgrade_required: { exit: 6, retry: "after-fix" },
  // Analytics reports, exports, drains and embed settings, added 21 Oct 2026. They were sent
  // with no row for two weeks of development, so `errorExit` guessed each one from its
  // status; the review-findings test read only double-quoted codes and did not see them.
  invalid_webhook: say(input, "Use a public HTTPS address that accepts analytics reports.", 400),
  invalid_origin: { ...auth, status: 403, message: "Open analytics settings on OpenGame to make this change." },
  report_expired: say(input, "This report expired. Request a new snapshot.", 410),
  export_expired: say(input, "This export expired. Request it again from the saved report.", 410),
  // Too much analytics work waiting for this account: reports, exports and deliveries
  // together. Waiting is the fix: queued work finishes and frees room. The response
  // carries retryAfterSeconds.
  report_queue_full: say(limited, `Your account already has ${LIMITS.analytics.reports.outstandingJobsPerOwnerMax} reports and deliveries waiting. Try again once some of them finish.`, 429),
  // The report already reached the webhook. Sending it again would be a second copy.
  delivery_not_replayable: say(input, "This report already reached your webhook, so it is not sent again.", 409),
  // Waiting is the fix, and the response carries retryAfterSeconds.
  export_pending: say(limited, "Your export is being prepared. Try this address again shortly.", 409),
  cursor_expired: say(input, "Start a new drain to read the available history.", 410),
  drain_not_replayable: say(input, "These changes already reached your webhook or are no longer kept, so they cannot be sent again.", 409),
  // A race with another change to the same settings. Reading them again is the fix.
  embed_conflict: say({ exit: 5, retry: "now" }, "The embed settings changed. Reload them before trying again.", 409),
  // The experiment changed, or its Studio action could not be confirmed. Reading it again is the fix.
  experiment_conflict: say({ exit: 5, retry: "now" }, "This experiment changed. Reload it before trying again.", 409),
  // Starting is switched off on this server until per-version serving inventory ships.
  // An operator turns it on, so waiting is the answer and the versions are untouched.
  experiments_unavailable: say(ours, "Experiments can’t start yet. Your versions are unchanged.", 503),
  // The database's refusals of a Studio experiment action. Their status and sentence
  // stay in studioExperimentRefusals, because the Studio Worker imports that file
  // without this one; the rows here add what an agent decides by. None of them is
  // fixed by trying again: an intent that is not staged waits on the creator, and the
  // other three are final for this run.
  experiment_intent_not_staged: { ...input, ...studioExperimentRefusals.experiment_intent_not_staged },
  studio_experiment_forbidden: { exit: 3, retry: "never", ...studioExperimentRefusals.studio_experiment_forbidden },
  studio_experiment_run_mismatch: { exit: 3, retry: "never", ...studioExperimentRefusals.studio_experiment_run_mismatch },
  experiment_studio_run_closed: { exit: 2, retry: "never", ...studioExperimentRefusals.experiment_studio_run_closed },
  // `opengame stats` refuses these itself, before any request.
  invalid_query: say(input, "Use --window week and a --period such as 2026-W43. Run opengame stats --help."),
  ambiguous_game: say(input, "Supply a positional game ID or --game, not both."),
};

/** The sentence for one audience: the CLI and API get `message`, the website and the
 * console get theirs where the row has one. One row per code either way, so the three
 * cannot drift apart the way the appeal's and the rollback's own tables did. */
export function errorSentence(code: string, audience: "cli" | "page" | "console"): string | undefined {
  if (!Object.hasOwn(ERRORS, code)) return undefined;
  const row = ERRORS[code]!;
  return (audience === "cli" ? undefined : row[audience]) ?? row.message;
}

/** Exit and retry for a code. Unknown codes are ours: the safe reading of an
 * error nobody wrote copy for is "not your game, try again later". */
export function errorExit(code: string, status?: number): Pick<Row, "exit" | "retry"> {
  if (Object.hasOwn(ERRORS, code)) { const { exit, retry } = ERRORS[code]!; return { exit, retry }; }
  if (status === 401 || status === 403) return auth;
  if (status === 429) return limited;
  if (status !== undefined && status >= 400 && status < 500 && status !== 404 && status !== 408) return input;
  return ours;
}

/** Saved uploads that can never finish. Resuming one repeats the same refusal. */
export const DEAD_UPLOAD_CODES = ["upload_expired", "upload_attempts_exhausted", "upload_size_mismatch", "build_conflict"] as const;

/** Every v1 error body. `requestId` is present when the server logged something to match. */
export interface PlatformErrorBody {
  error: string;
  message: string;
  retry?: Retry;
  retryAfterSeconds?: number;
  /** Where the fix happens, when it is a page: settings, claim. Absolute. */
  url?: string;
  /** The token a refusal is about, by its public id and name, never its secret. */
  token?: { id: string; name: string };
  requestId?: string;
}
