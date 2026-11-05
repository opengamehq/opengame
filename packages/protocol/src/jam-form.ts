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
  /** Account email and demo link for each selected sponsor. Same reason as `demoUrl`:
   * a correction has to change this object, or the open entry is handed back unchanged. */
  sponsorDetails?: Record<string, { accountEmail?: string; demoUrl?: string }>;
}

export interface JamAnswerProblem {
  field: "track" | "models" | "sponsors" | "evidence";
  /** The flag that supplies the answer, so an agent can retry without reading prose. */
  flag: string;
  message: string;
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
  const sponsorDetails: Record<string, { accountEmail?: string; demoUrl?: string }> = {};
  for (const [key, value] of Object.entries(raw.sponsorDetails ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    if (!value || typeof value !== "object") continue;
    const accountEmail = typeof value.accountEmail === "string" ? value.accountEmail.trim().toLowerCase() : "";
    const demoUrl = typeof value.demoUrl === "string" ? value.demoUrl.trim() : "";
    if (accountEmail || demoUrl) sponsorDetails[key.trim().toLowerCase()] = {
      ...(accountEmail ? { accountEmail } : {}), ...(demoUrl ? { demoUrl } : {}),
    };
  }
  const demoUrl = typeof raw.demoUrl === "string" ? raw.demoUrl.trim() : "";
  return { slug: slug.trim().toLowerCase(), track: typeof raw.track === "string" ? raw.track.trim().toLowerCase() : "",
    models: unique(raw.models).sort(), sponsors: unique(raw.sponsors).sort(), evidence,
    ...(demoUrl ? { demoUrl } : {}),
    ...(Object.keys(sponsorDetails).length ? { sponsorDetails } : {}) };
}
const characters = (n: number) => n.toLocaleString("en-US");

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

  if (problems.length) return { ok: false, problems };
  return { ok: true, answers: canonical };
}


// The jam's time formatters and jamStateLabel: dependency-free, so client pages can import them alone.
export { whenPacific, whenUtc, utcInstant, jamStateLabel } from "./jam-time";
