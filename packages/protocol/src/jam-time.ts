import { CLOSE_COPY, COMMITTED_ENTRIES_CLOSE_AT, COMMITTED_JAM_KICKOFF_AT, COMMITTED_LAUNCH_AT, KICKOFF_COPY, LAUNCH_COPY } from "@opengame/shared/launch-clock";

/* The jam's one way of writing an instant: `9 November, 3:59 pm PT`. The site's jam time
   module re-exports this; `opengame jams` prints deadlines with it.

   PACIFIC, NOT UTC, SINCE 5 NOV 2026. The deadline is written in Pacific time
   (packages/shared/launch.json's CLOSE_COPY, "..., 11:59 pm PT"), and every other time a
   creator compares with it was written in UTC: an entry made at 11:58 pm PT on the last
   evening had a receipt saying 07:58 UTC on the next day's date, which reads as the
   morning after the close. One zone for every time that sits beside the deadline, and
   still one zone for everybody, which is what lets the server and the browser render the
   same string (when.ts says why a reader's own clock cannot).

   THE COPY'S SHAPE, SINCE THE SAME DAY'S DESIGN REVIEW. This wrote `9 Nov 2026, 3:59 pm PT`
   while the launch clock's own moments read `<day> <Month>, 11:59 pm PT`, so /jam/entries and
   the receipt mail set an entry's time and the close side by side in two spellings. So the
   month is written out like the copy, and the year is left off when it is the jam's own: the
   Pacific year the close falls in, which the copy never names either. Any other year is
   written (`3 January 2027, 9:00 am PT`), because a date in another year without it would
   name the wrong day.

   Built from parts rather than taken whole, so the string is ours and not the runtime's:
   the day first like the copy, a lower-case `am`/`pm` like CLOSE_COPY, and `PT` written
   out, never PST or PDT, because the reader should not have to know which half of the year
   the deadline falls in. */
const PACIFIC = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
});
const PACIFIC_YEAR = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric" });

/* The year the copy leaves unsaid: the close's, in Pacific time. A millisecond before the
   instant, because the close is the first minute of the day after the one it names. */
const JAM_YEAR = PACIFIC_YEAR.format(new Date(COMMITTED_ENTRIES_CLOSE_AT.getTime() - 1));

/* The committed instants, said the way the site says them. The launch and the kickoff are
   days with no time; the close is the last minute of the day before, so nobody misses it by
   a timezone. To the millisecond, so no other time (an entry's own timestamp) is rewritten. */
function committedCopy(ms: number): string | null {
  if (ms === COMMITTED_JAM_KICKOFF_AT.getTime()) return KICKOFF_COPY;
  if (ms === COMMITTED_LAUNCH_AT.getTime()) return LAUNCH_COPY;
  if (ms === COMMITTED_ENTRIES_CLOSE_AT.getTime()) return CLOSE_COPY;
  return null;
}

function pacific(at: Date, withYear: boolean): string {
  const parts = PACIFIC.formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? "";
  const year = withYear || part("year") !== JAM_YEAR ? ` ${part("year")}` : "";
  return `${part("day")} ${part("month")}${year}, ${part("hour")}:${part("minute")} ${part("dayPeriod").toLowerCase()} PT`;
}

/**
 * An instant a reader in any timezone can act on, in Pacific time; the input back when it
 * cannot be parsed.
 *
 * THE LAUNCH CLOCK'S MOMENTS ARE SAID THE WAY THE SITE SAYS THEM (4 Nov 2026; the
 * jam's own kickoff, 5 Nov). The jam's kickoff reads KICKOFF_COPY, the site's opening
 * LAUNCH_COPY, and the close CLOSE_COPY. Here rather than at each caller, because every jam
 * surface, the receipt mail and `opengame jams` write their moments through this function,
 * and a caller that forgot would print the kickoff as "<day> November, 12:00 am PT" beside a
 * page saying KICKOFF_COPY.
 *
 * `year` puts the year into every instant ("<day> <month> 2026"), those three included, for
 * a table that stands on its own, like the dates in /rules. Without it an instant carries its
 * year only when that is not the jam's.
 *
 * `instant` skips that substitution, for a time that records when something happened rather
 * than naming one of the clock's moments: a deploy or a release in a list (design review of
 * the clock lane, 5 Nov 2026). Such a row is a moment, and one landing on a committed instant
 * to the millisecond printed as a day with no time ("18 November"), beside rows that each
 * carry one. Same formatter, same zone; only the copy is left out.
 */
export function whenPacific(at: string | number, options: { year?: boolean; instant?: boolean } = {}): string {
  const parsed = new Date(at);
  if (Number.isNaN(parsed.getTime())) return typeof at === "string" ? at : "";
  const copy = options.instant ? null : committedCopy(parsed.getTime());
  if (!copy) return pacific(parsed, options.year === true);
  if (!options.year) return copy;
  /* The year of the day the copy names, which for the close is the day before its instant. */
  const year = PACIFIC_YEAR.format(new Date(parsed.getTime() - 1));
  return copy.replace(/^(\d{1,2} \p{L}+)/u, `$1 ${year}`);
}

/**
 * @deprecated The name is older than the zone: this is `whenPacific`. Kept because a
 * caller outside this repository's grep (an older checkout's tests, a script) may still
 * import it. Never use it for a time that has to read in UTC; that is `utcInstant`.
 */
export const whenUtc = whenPacific;

/* A time that belongs to a UTC day rather than to the jam: the submission allowance resets at
   midnight UTC and says so ("Submissions today (UTC)"), so its reset reads in the same zone.
   Not for anything a creator compares with the deadline; that is `whenPacific`. */
const UTC_INSTANT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short",
});
export function utcInstant(at: string | number): string {
  const parsed = new Date(at);
  if (Number.isNaN(parsed.getTime())) return typeof at === "string" ? at : "";
  return UTC_INSTANT.format(parsed);
}

/* What a jam that is not taking entries is doing, in words. Only read once acceptingEntries
   has said no, so `open` means its deadline has passed. apps/web's jamStateLabel re-exports it. */
const JAM_STATES: Record<string, string> = {
  draft: "not announced", upcoming: "not open yet", open: "past its deadline",
  judging: "being judged", announced: "results are out", archived: "finished",
};
export function jamStateLabel(state: string): string {
  return JAM_STATES[state] ?? state.replace(/_/g, " ");
}
