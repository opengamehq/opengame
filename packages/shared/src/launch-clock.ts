import launch from "../launch.json" with { type: "json" };
import { sha256Hex } from "./sha256";

/**
 * The launch clock: the one place that says when OpenGame opens and when entries close.
 *
 * The owner's call of 4 Nov 2026 ("Clock, with a hold"): everything goes live by itself at
 * 17 Nov 2026 12:00 am PT and nothing new deploys after 19 Dec 2026 12:00 am PT. Web, the
 * API, the CLI, the pipeline and the Workers all read these two instants, from launch.json
 * when they are not TypeScript, so no surface can open a minute before another. The
 * database cannot read a file, so it carries the same two instants in
 * `private.launch_clock_json()` (20261105120000_launch_clock.sql), and
 * `tests/launch-clock.test.ts` fails the moment the two disagree.
 *
 * THREE THINGS CAN MOVE THE ANSWER, and only one of them can move it earlier.
 *
 * - The owner hold. A row in the database (`launch.hold`) that pushes the opening later,
 *   read server-side by the web app and by the database's own rules. It is passed in here as
 *   `heldUntil` because this module never touches the network. A hold earlier than launchAt
 *   changes nothing: it can delay launch and never bring it forward. It does not touch the
 *   close; a late launch shortens the jam rather than moving its end.
 * - The rehearsal override. `OPENGAME_REHEARSAL_LAUNCH_AT` and
 *   `OPENGAME_REHEARSAL_ENTRIES_CLOSE_AT`, set on a Vercel PREVIEW so the launch can be
 *   walked with the minute ten minutes ahead. This is the one that can move the opening
 *   earlier, which is why it is refused outright where `VERCEL_ENV` is "production": a
 *   variable set on the wrong environment must not be able to open the real site. Refused,
 *   not merely ignored-and-silent: `rehearsalRefusal` says why, and the status route prints
 *   it.
 * - Nothing else. In particular local development does NOT move this clock. "Local behaves
 *   as launched" (plan item 8) is about which doors are drawn on a local server, and the web
 *   app decides that (its lib/site-open.ts); the CLI, a Worker and the pipeline read this
 *   module too, and none of them is "local development" in that sense.
 *
 * The exported names are the interface the launch lanes build against: add, never rename.
 */

/** The instants as committed, whatever any environment says. What the database is pinned to. */
export const COMMITTED_LAUNCH_AT = new Date(launch.launchAt);
export const COMMITTED_ENTRIES_CLOSE_AT = new Date(launch.entriesCloseAt);
/**
 * When the launch jam takes its first entry, and when the creator platform opens to
 * everybody: 18 Nov 2026 12:00 am PT, a day after the site opens at launchAt.
 *
 * The launch team's decision of 5 Nov 2026 put the jam's first entry here and left the CLI
 * and uploads at launchAt. The owner, 8 Nov 2026, moved those too: "the jam entries open on
 * nov 18th 12am PST 2026 and thats when cli and uploading etc will be unlocked". So from
 * launchAt anybody can sign in, claim a handle, make a profile and play, and from this
 * instant they can connect the CLI, mint a token, upload and enter. The jam's row carries the same instant in
 * `config.kickoff_at` and the database's clock carries it as `jamKickoffAt`
 * (20261108120000); the launch-clock test fails if any of them part. The close is shared:
 * entries and deploys both stop at entriesCloseAt.
 */
export const COMMITTED_JAM_KICKOFF_AT = new Date(launch.jamKickoffAt);

export const REHEARSAL_LAUNCH_AT_ENV = "OPENGAME_REHEARSAL_LAUNCH_AT";
export const REHEARSAL_ENTRIES_CLOSE_AT_ENV = "OPENGAME_REHEARSAL_ENTRIES_CLOSE_AT";

export type LaunchEnv = Readonly<Record<string, string | undefined>>;

export type LaunchClock = {
  readonly launchAt: Date;
  readonly entriesCloseAt: Date;
  /** "rehearsal" only on a preview with the override set; never on production. */
  readonly source: "launch.json" | "rehearsal";
};

export const COMMITTED_CLOCK: LaunchClock = Object.freeze({
  launchAt: COMMITTED_LAUNCH_AT, entriesCloseAt: COMMITTED_ENTRIES_CLOSE_AT, source: "launch.json",
});

/* `process` is absent in a Worker without nodejs_compat and in some browser bundles. A
   client bundle gets `{}` here, so a client component always reads the committed clock; the
   decisions that matter are made on the server. */
function processEnv(): LaunchEnv {
  return typeof process === "undefined" || !process.env ? {} : process.env;
}

/** An ISO instant with an explicit zone, or null. `Date.parse` alone takes "2026-11-17",
 * which is midnight UTC on one runtime and local midnight on another. */
function instant(value: string | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(trimmed)) return null;
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

/* Production's Supabase project, by both of the names it answers to: its own host and the
   custom domain auth is served from. A rehearsal moves the clock for every request its server
   sends with the secret key, so one pointed at production's database would open or freeze
   the real platform for a minute, so a rehearsal runs against a scratch project only (the
   clock lane's rehearsal runbook). VERCEL_ENV alone does not catch it, because every preview
   reads production's database unless somebody built its environment otherwise (re-check of
   5 Nov 2026).

   Held as SHA-256 digests of the lowercased host rather than the hosts, because this file is
   public in the mirror and inside the CLI's npm bundle, and the owner's call of 5 Nov 2026 was
   that this repository does not publish the project's own host. That keeps it out of our
   source, not out of the world: auth.opengame.io's DNS record names it. A digest matches
   exactly what the host did, and the guard still fails closed. The hosts are in packages/shared/tests/fixtures/
   production-database.json, which is not exported, and tests/launch-clock.test.ts holds these
   digests to them; change both together if production's project ever moves. */
const PRODUCTION_DATABASE_HOST_DIGESTS = new Set([
  "5bdc36d56f55eda49b621de98d51d66f1aa6e863e49dccc9c84b8a81100901bc", // production's project, <ref>.supabase.co
  "0fb12be6597ae6faefc57e90eeda6263836bf34a80128eda797d22ddb7b8380e", // auth.opengame.io, the custom domain auth is served from
]);

/* The public Supabase URL as a Next bundle sees it. Next replaces the literal
   `process.env.NEXT_PUBLIC_SUPABASE_URL` with its build-time value in server bundles as well
   as client ones, while `env.NEXT_PUBLIC_SUPABASE_URL` above reads the runtime object, so a
   build made with production's URL and started with a scratch project's would pass the
   runtime check while every Supabase client in it talks to production (review of the fixes,
   5 Nov 2026). Asked only for the process's own environment, so a caller passing an env of
   its own, a test, gets an answer about that env alone. Outside a bundle this is the runtime
   value again. */
function inlinedPublicUrl(): string | undefined {
  return typeof process === "undefined" || !process.env ? undefined : process.env.NEXT_PUBLIC_SUPABASE_URL;
}

/** Whether a Supabase URL names production's project. A URL that does not parse counts as
 * production, so a typo refuses the rehearsal rather than sending it somewhere unknown, and
 * so does one that parses with no host or with a scheme other than http(s): until 5 Nov 2026
 * `auth.opengame.io:443` parsed as the scheme `auth.opengame.io:` with an empty host, and
 * passed (review of the digest change). */
function readsProductionDatabase(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw.trim());
    if (!/^https?:$/.test(url.protocol) || !url.hostname) return true;
    return PRODUCTION_DATABASE_HOST_DIGESTS.has(sha256Hex(url.hostname.toLowerCase().replace(/\.$/, "")));
  } catch {
    return true;
  }
}

/**
 * Why the rehearsal variables are not being used, or null when they are (or are not set).
 * Read by the status route, so a rehearsal that is not running says so rather than
 * quietly walking the real clock.
 */
export function rehearsalRefusal(env: LaunchEnv = processEnv()): string | null {
  const rawLaunch = env[REHEARSAL_LAUNCH_AT_ENV];
  const rawClose = env[REHEARSAL_ENTRIES_CLOSE_AT_ENV];
  if (!rawLaunch && !rawClose) return null;
  if (env.VERCEL_ENV === "production") return "refused on production";
  if ([env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_URL, ...(env === processEnv() ? [inlinedPublicUrl()] : [])]
    .some(readsProductionDatabase)) return "refused against production's database";
  const launchAt = rawLaunch ? instant(rawLaunch) : COMMITTED_LAUNCH_AT;
  const closeAt = rawClose ? instant(rawClose) : COMMITTED_ENTRIES_CLOSE_AT;
  if (!launchAt) return `${REHEARSAL_LAUNCH_AT_ENV} is not an ISO instant with a zone`;
  if (!closeAt) return `${REHEARSAL_ENTRIES_CLOSE_AT_ENV} is not an ISO instant with a zone`;
  if (closeAt.getTime() <= launchAt.getTime()) return "the rehearsal close is not after its launch";
  /* A close later than the real one is accepted here and ignored by the database
     (`private.launch_instants`), which holds the freeze: the app's tests set a rehearsal close
     a month out so they stay true after the real close, and only the database's answer can
     lift a freeze. A rehearsal walks a close minutes after its launch, well before 19 Dec. */
  return null;
}

/** The clock in force for this process: the rehearsal on a preview that sets it, otherwise launch.json. */
export function launchClock(env: LaunchEnv = processEnv()): LaunchClock {
  const rawLaunch = env[REHEARSAL_LAUNCH_AT_ENV];
  const rawClose = env[REHEARSAL_ENTRIES_CLOSE_AT_ENV];
  if ((!rawLaunch && !rawClose) || rehearsalRefusal(env) !== null) return COMMITTED_CLOCK;
  return Object.freeze({
    launchAt: rawLaunch ? instant(rawLaunch)! : COMMITTED_LAUNCH_AT,
    entriesCloseAt: rawClose ? instant(rawClose)! : COMMITTED_ENTRIES_CLOSE_AT,
    source: "rehearsal",
  });
}

/* The clock as this process started. On a rehearsal preview these are the rehearsal
   instants, so a lane that compares against LAUNCH_AT directly still flips at the rehearsed
   minute; the functions below re-read per call, which is what tests rely on. */
export const LAUNCH_AT = launchClock().launchAt;
export const ENTRIES_CLOSE_AT = launchClock().entriesCloseAt;

/* What the site says. Never derived from the instants: the kickoff copy deliberately names
   the day after the real opening (the plan's margin), and the close names the last minute
   in Pacific time rather than the first minute of the next day. */
export const KICKOFF_COPY = launch.kickoffCopy;
/** The day the site opens, "17 November", for sentences about launch rather than the jam.
 * Before 5 Nov 2026 those borrowed KICKOFF_COPY, which named the wrong day once the jam's
 * kickoff moved a day after the opening. A sentence that must stay true under an owner hold
 * says the held day instead (`opensAtCopy` below). */
export const LAUNCH_COPY = launch.launchCopy;
export const CLOSE_COPY = launch.closeCopy;
/** The close as a day alone, for a badge with no room for a time. */
export const CLOSE_DAY_COPY = launch.closeDayCopy;
/** The day the winners are announced, "30 December", a day with no time like the kickoff.
 * Here since 5 Nov 2026, because the welcome mail sent after the close names it as well as
 * /jam and /rules, and those read a copy of it kept in the web app until then. The owner moved
 * it from 22 to 30 December on 7 Nov 2026, which is when the instant below joined it. */
export const ANNOUNCE_COPY = launch.announceCopy;
/**
 * When the winners are announced: 30 Dec 2026, 9:00 am PT. Not a gate on anything; nothing
 * opens or closes at it. It is here so the jam page's fallback instant and the migration that
 * sets the jam row's `announce_at` (20261107160000) read one value, and the launch-clock test
 * fails when either parts from it. Before 7 Nov 2026 the instant was written in the web app
 * and the day here, and moving the announcement meant finding both.
 */
export const COMMITTED_ANNOUNCE_AT = new Date(launch.announceAt);

/** When the site actually opens: launchAt, or a later owner hold. Never earlier. */
export function opensAt(heldUntil: Date | null = null, clock: LaunchClock = launchClock()): Date {
  return heldUntil && heldUntil.getTime() > clock.launchAt.getTime() ? heldUntil : clock.launchAt;
}

/**
 * When the jam takes its first entry. The committed kickoff, except on a rehearsal preview,
 * where it is the rehearsed launchAt: a rehearsal walks the opening minute, and a jam that
 * stayed shut for a day after it would leave nothing to walk. A hold later than the kickoff
 * holds the jam too, because nobody can enter a site that is not open.
 */
export function jamOpensAt(heldUntil: Date | null = null, clock: LaunchClock = launchClock()): Date {
  const kickoff = clock.source === "rehearsal" ? clock.launchAt : COMMITTED_JAM_KICKOFF_AT;
  const opens = opensAt(heldUntil, clock);
  return opens.getTime() > kickoff.getTime() ? opens : kickoff;
}

const PACIFIC_DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "America/Los_Angeles" });

/**
 * The day the site opens, as a sentence says it: LAUNCH_COPY, or the held day in Pacific time
 * while an owner hold pushes the opening later. For copy shown before launch ("until 17
 * November, only the team can sign in"), which would otherwise name a day that has passed
 * during a long hold.
 */
export function opensAtCopy(heldUntil: Date | null = null, clock: LaunchClock = launchClock()): string {
  const opens = opensAt(heldUntil, clock);
  if (opens.getTime() === COMMITTED_LAUNCH_AT.getTime()) return LAUNCH_COPY;
  return PACIFIC_DAY.format(opens);
}

/**
 * The kickoff as a sentence says it: KICKOFF_COPY, or the held day in Pacific time while an
 * owner hold pushes the site's opening past the kickoff. For every sentence that says when
 * the CLI, uploads or entries open, so none of them names a day that has passed during a
 * long hold. On a rehearsal the moment is the rehearsed opening, named in Pacific time.
 */
export function jamOpensAtCopy(heldUntil: Date | null = null, clock: LaunchClock = launchClock()): string {
  const opens = jamOpensAt(heldUntil, clock);
  if (opens.getTime() === COMMITTED_JAM_KICKOFF_AT.getTime()) return KICKOFF_COPY;
  return PACIFIC_DAY.format(opens);
}

/** Launched once the clock passes launchAt, unless an owner hold pushes it later. */
export function isLaunched(now: Date = new Date(), heldUntil: Date | null = null, clock: LaunchClock = launchClock()): boolean {
  return now.getTime() >= opensAt(heldUntil, clock).getTime();
}

/** Every deploy path is open from launch until the close instant. The name is older than the
 * jam's own kickoff: jam ENTRIES also wait for `jamOpensAt`. */
export function entriesOpen(now: Date = new Date(), heldUntil: Date | null = null, clock: LaunchClock = launchClock()): boolean {
  return isLaunched(now, heldUntil, clock) && !deploysFrozen(now, clock);
}

/** After the close, every deploy path refuses, fixes included, until reopened by a reviewed
 * change to launch.json and the clock migration. There is no switch for it on purpose. */
export function deploysFrozen(now: Date = new Date(), clock: LaunchClock = launchClock()): boolean {
  return now.getTime() >= clock.entriesCloseAt.getTime();
}

/**
 * The one sentence every deploy path answers with after the close, the CLI, Drop, GitHub
 * import and remix alike (plan item 4). Kept here so the Python pipeline's copy
 * (in the validation pipeline) is the only other spelling, and a test pins that one to this.
 */
export const ENTRIES_CLOSED_MESSAGE = `Entries closed on ${launch.closeCopy}, so no game can be deployed or updated now. Published games stay live.`;
