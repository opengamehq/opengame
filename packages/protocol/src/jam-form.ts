import { z } from "./zod";

/**
 * A jam's entry form, as the server describes it and as every client checks it.
 *
 * `GET /api/v1/jams/:slug/form` builds this from `jams.config` and the `jam_tracks` rows,
 * and the CLI, the certify page and the submit route all run `validateJamAnswers` over
 * the same object. Nothing in the CLI knows about a particular jam: the next one needs a
 * row edit, not a CLI release.
 *
 * The four answer keys are the platform's jam vocabulary rather than one jam's: a genre
 * track, the models used, the sponsor tracks those models unlock, and a note per sponsor
 * track. The database refuses the same mistakes again inside the submit transaction,
 * because a track can stop being offered between this read and that write.
 */

const option = z.object({
  value: z.string().min(1).max(80),
  label: z.string().min(1).max(200),
  hint: z.string().max(500).nullable().default(null),
  /** On a model: who makes it. On a sponsor track: whose model unlocks it. */
  provider: z.string().max(80).nullable().default(null),
  /** On a sponsor track: what its note asks, and how long the note may be. */
  evidenceLabel: z.string().max(120).nullable().default(null),
  evidenceCharsMax: z.number().int().positive().max(2000).nullable().default(null),
  /** On a sponsor track: the entry has to link a post on X, as Meshy's rules ask (26 Nov 2026).
   * Absent from an older server's form, which is the same as false. */
  xPostRequired: z.boolean().default(false),
});
export type JamFormOption = z.infer<typeof option>;

export const jamSummarySchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/),
  name: z.string().min(1),
  state: z.enum(["upcoming", "open", "judging", "announced", "archived"]),
  acceptingEntries: z.boolean(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  rulesUrl: z.url(),
  tracks: z.array(z.object({ key: z.string(), name: z.string(), kind: z.enum(["theme", "sponsor"]) })),
});
export type JamSummary = z.infer<typeof jamSummarySchema>;

/** The operator's destination for new submissions, regardless of the jam deadline. */
export const submissionDestinationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("jam"), slug: jamSummarySchema.shape.slug, name: z.string().min(1) }),
  z.object({ kind: z.literal("marketplace") }),
]);
export type SubmissionDestination = z.infer<typeof submissionDestinationSchema>;


export const jamFormSchema = z.object({
  formVersion: z.literal(1),
  jam: jamSummarySchema.extend({
    entriesPerCreator: z.number().int().positive(),
    termsVersion: z.string().min(1),
  }),
  track: z.object({ flag: z.literal("--track"), label: z.string(), options: z.array(option).min(1) }),
  models: z.object({ flag: z.literal("--models"), label: z.string(), min: z.number().int().min(0), options: z.array(option) }),
  sponsors: z.object({ flag: z.literal("--sponsor"), label: z.string(), options: z.array(option) }),
  evidence: z.object({ flagPrefix: z.literal("--evidence-"), label: z.string() }),
});
export type JamForm = z.infer<typeof jamFormSchema>;

export interface JamAnswers {
  slug: string;
  track: string;
  models: string[];
  sponsors: string[];
  evidence: Record<string, string>;
  /** Optional demo link for the entry. It sits on the jam object because
   * `platform_submit_release` treats an unchanged jam object as the same entry. */
  demoUrl?: string;
  /** Account email, demo link and post on X for each selected sponsor. Same reason as
   * `demoUrl`: a correction has to change this object, or the open entry is handed back
   * unchanged. */
  sponsorDetails?: Record<string, SponsorDetail>;
}
export type SponsorDetail = { accountEmail?: string; demoUrl?: string; postUrl?: string };

export interface JamAnswerProblem {
  field: "track" | "models" | "sponsors" | "evidence" | "posts";
  /** The flag that supplies the answer, so an agent can retry without reading prose. */
  flag: string;
  message: string;
  /** On a `posts` problem, the sponsor track it is about, so a form can say it under that field. */
  sponsor?: string;
  /** On a `posts` problem: no post was given for a track that asks for one (`jamPostsOwed`),
   * rather than a link given that is not a post. */
  owed?: true;
}

/** The one shape a post link is stored in, which `jam_entry_tracks_x_post_url_shape` in the
 * database checks again: `https://x.com/<handle>/status/<id>`. */
export const X_POST_URL_PATTERN = /^https:\/\/x\.com\/[A-Za-z0-9_]{1,15}\/status\/[0-9]{1,25}$/;

/**
 * A link to one post on X, in the shape stored, or null when the text is not one.
 *
 * People paste what their share button gave them: `twitter.com` as often as `x.com`, a
 * `mobile.` or `www.` host, `?s=20&t=...` on the end, or `/video/1` after the id. All of those
 * name the same post, so they are taken and written one way, which is what lets a judge open
 * every link alike and lets the database check the column with one pattern. A profile, a search
 * or any other site is not a post, and is refused rather than guessed at.
 */
export function xPostUrl(value: string): string | null {
  let url: URL;
  const text = value.trim();
  try { url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!/^(?:www\.|mobile\.)?(?:x|twitter)\.com$/i.test(url.hostname)) return null;
  const post = /^\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/([0-9]{1,25})(?:\/.*)?$/.exec(url.pathname);
  return post ? `https://x.com/${post[1]}/status/${post[2]}` : null;
}

const list = (values: readonly string[]) => values.join(", ");
const unique = (values: unknown) => Array.isArray(values)
  ? [...new Set(values.filter((v): v is string => typeof v === "string").map(v => v.trim().toLowerCase()).filter(Boolean))]
  : [];

/**
 * The answers in the one shape the server stores and compares: keys lowercased, lists
 * deduplicated and sorted, empty notes dropped. An idempotent retry is recognised by this
 * shape, so it is the only place answers are normalised.
 */
export function canonicalJamAnswers(slug: string, raw: Partial<JamAnswers>): JamAnswers {
  const evidence: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw.evidence ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    const note = typeof value === "string" ? value.trim() : "";
    if (note) evidence[key.trim().toLowerCase()] = note;
  }
  const sponsorDetails: Record<string, SponsorDetail> = {};
  for (const [key, value] of Object.entries(raw.sponsorDetails ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    if (!value || typeof value !== "object") continue;
    const accountEmail = typeof value.accountEmail === "string" ? value.accountEmail.trim().toLowerCase() : "";
    const demoUrl = typeof value.demoUrl === "string" ? value.demoUrl.trim() : "";
    // Kept as typed when it is not a post, so validateJamAnswers can say so rather than drop it.
    const typed = typeof value.postUrl === "string" ? value.postUrl.trim() : "";
    const postUrl = typed ? xPostUrl(typed) ?? typed : "";
    if (accountEmail || demoUrl || postUrl) sponsorDetails[key.trim().toLowerCase()] = {
      ...(accountEmail ? { accountEmail } : {}), ...(demoUrl ? { demoUrl } : {}), ...(postUrl ? { postUrl } : {}),
    };
  }
  const demoUrl = typeof raw.demoUrl === "string" ? raw.demoUrl.trim() : "";
  return { slug: slug.trim().toLowerCase(), track: typeof raw.track === "string" ? raw.track.trim().toLowerCase() : "",
    models: unique(raw.models).sort(), sponsors: unique(raw.sponsors).sort(), evidence,
    ...(demoUrl ? { demoUrl } : {}),
    ...(Object.keys(sponsorDetails).length ? { sponsorDetails } : {}) };
}
const characters = (n: number) => n.toLocaleString("en-US");
/** The CLI flag that supplies a sponsor track's post on X, as `sponsor=link` pairs. */
const POST_FLAG = "--sponsor-post";

/**
 * The answers as the server will store them, or every problem with them.
 *
 * Every problem is reported, not just the first, because an agent fixes them all in one
 * retry and a person reads them all in one screen. Order follows the form.
 */
export function validateJamAnswers(form: JamForm, raw: Partial<JamAnswers>):
  { ok: true; answers: JamAnswers } | { ok: false; problems: JamAnswerProblem[] } {
  const problems: JamAnswerProblem[] = [];
  const canonical = canonicalJamAnswers(form.jam.slug, raw);

  const tracks = form.track.options.map(o => o.value);
  const track = canonical.track;
  if (!track) problems.push({ field: "track", flag: form.track.flag, message: `Choose a ${form.track.label.toLowerCase()} with ${form.track.flag}. Options: ${list(tracks)}.` });
  else if (!tracks.includes(track)) problems.push({ field: "track", flag: form.track.flag, message: `${track} is not a track in ${form.jam.name}. Options: ${list(tracks)}.` });

  const models = canonical.models;
  const known = new Map(form.models.options.map(o => [o.value, o]));
  const unknownModels = models.filter(m => !known.has(m));
  if (unknownModels.length) problems.push({ field: "models", flag: form.models.flag, message: `${list(unknownModels)} ${unknownModels.length === 1 ? "is" : "are"} not in the model list. Run opengame jams ${form.jam.slug} to see the keys.` });
  else if (models.length < form.models.min) problems.push({ field: "models", flag: form.models.flag, message: `Name at least ${form.models.min === 1 ? "one model" : `${form.models.min} models`} you used with ${form.models.flag}, separated by commas.` });
  const providers = new Set(models.map(m => known.get(m)?.provider).filter((p): p is string => Boolean(p)));

  const sponsors = canonical.sponsors;
  const offered = new Map(form.sponsors.options.map(o => [o.value, o]));
  for (const sponsor of sponsors) {
    const track = offered.get(sponsor);
    if (!track) problems.push({ field: "sponsors", flag: form.sponsors.flag, message: `${sponsor} is not a sponsor track in ${form.jam.name}. Options: ${list([...offered.keys()]) || "none"}.` });
    else if (track.provider && !providers.has(track.provider)) problems.push({ field: "sponsors", flag: form.sponsors.flag, message: `${track.label} opens once you list a ${track.provider} model under ${form.models.flag}.` });
  }

  for (const [sponsor, note] of Object.entries(canonical.evidence)) {
    const track = offered.get(sponsor);
    if (!sponsors.includes(sponsor) || !track) {
      problems.push({ field: "evidence", flag: `${form.evidence.flagPrefix}${sponsor}`, message: `Add ${sponsor} with ${form.sponsors.flag} before describing it.` });
      continue;
    }
    const max = track.evidenceCharsMax ?? 2000;
    if ([...note].length > max) problems.push({ field: "evidence", flag: `${form.evidence.flagPrefix}${sponsor}`, message: `${track.evidenceLabel ?? form.evidence.label} is ${characters([...note].length)} characters. Keep it to ${characters(max)}.` });
  }

  /* A post given is a link to one post. A profile or a search is not something a judge can
     watch. Whether one is OWED is `jamPostsOwed`, because that depends on the game's standing
     entry, which this form-only check cannot see. */
  for (const sponsor of sponsors) {
    const postUrl = canonical.sponsorDetails?.[sponsor]?.postUrl;
    if (postUrl && !X_POST_URL_PATTERN.test(postUrl)) {
      problems.push({ field: "posts", flag: POST_FLAG, sponsor, message: `${postUrl} is not a link to a post on X. Copy the post’s own link, which looks like https://x.com/you/status/123.` });
    }
  }

  if (problems.length) return { ok: false, problems };
  return { ok: true, answers: canonical };
}


/**
 * The selected tracks that ask for a post on X (`xPostRequired`, Meshy's) and were given none.
 *
 * `held` is the tracks the game's standing entry already holds. An entry made before a track
 * asked for a post is not refused when its game is updated, which replaces the entry: the
 * database keeps the link the entrant added on /jam/entries, or the lack of one, and
 * `platform_jam_check` (20261126164932) asks exactly this. A new entry holds nothing, so every
 * such track it names owes a post. Separate from `validateJamAnswers` because only the server
 * can read what the entry holds; a client that cannot passes nothing and asks as for a new one.
 */
export function jamPostsOwed(form: JamForm, raw: Partial<JamAnswers>, held: Iterable<string> = []): JamAnswerProblem[] {
  const canonical = canonicalJamAnswers(form.jam.slug, raw);
  const holds = new Set([...held].map(key => key.trim().toLowerCase()));
  return form.sponsors.options
    .filter(o => o.xPostRequired && canonical.sponsors.includes(o.value) && !holds.has(o.value) && !canonical.sponsorDetails?.[o.value]?.postUrl)
    .map(o => ({ field: "posts" as const, flag: POST_FLAG, sponsor: o.value, owed: true as const,
      message: `${o.label} asks for a link to your post on X about the game. Add it with ${POST_FLAG} ${o.value}=https://x.com/you/status/123, or on the game’s deploy page.` }));
}

// The jam's time formatters and jamStateLabel: dependency-free, so client pages can import them alone.
export { whenPacific, whenUtc, utcInstant, jamStateLabel } from "./jam-time";
