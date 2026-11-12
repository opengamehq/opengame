import { jamFormSchema, jamStateLabel, jamSummarySchema, whenPacific, type JamSummary } from "@opengame/protocol";
import { activeToken } from "./credentials";
import { Api, ApiError } from "./http";
import { CliError, Output, terminalText } from "./output";

type Flags = Record<string, string | boolean>;

/**
 * `opengame jams` lists the jams, their tracks and the rules link. `opengame jams <slug>`
 * prints that jam's form: every flag `opengame submit` takes for it and the values each
 * accepts, which is what an agent needs to submit without a person at the keyboard.
 */
export async function jamsCommand(slug: string | undefined, flags: Flags, output: Output) {
  const api = new Api();
  try {
    // The same resolution deploy uses, so a refused token is named by where it came from.
    const active = await activeToken(api.origin, Boolean(flags["token-stdin"]));
    if (!active) throw new CliError("not_signed_in", "Run opengame login, or supply OPENGAME_TOKEN.", 3, { next: "opengame login" });
    const token = active.token;
    api.tokenSource = active.source;
    if (slug === undefined) {
      const jams = jamSummarySchema.array().parse((await api.json("/api/v1/jams", { token })).jams);
      /* The deadline is the one number somebody plans around, and it was only in the JSON.
         Sponsor keys are --sponsor values, not --track values, so they are listed apart. */
      const lines = jams.length ? jams.flatMap(jam => [
        `${jam.name} (${jam.slug})  ${window(jam)}`,
        `  Genre tracks    ${jam.tracks.filter(t => t.kind === "theme").map(t => t.key).join(", ") || "none"}`,
        ...(jam.tracks.some(t => t.kind === "sponsor") ? [`  Sponsor tracks  ${jam.tracks.filter(t => t.kind === "sponsor").map(t => t.key).join(", ")}`] : []),
        `  Rules           ${jam.rulesUrl}`,
      ]) : ["There are no jams right now. opengame submit sends a release to the marketplace."];
      output.emit({ type: "result", command: "jams", data: { jams, message: lines.map(terminalText).join("\n") } });
      return;
    }
    if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/i.test(slug)) throw new CliError("invalid_jam", "Use a jam's short name from opengame jams.", undefined, { next: "opengame jams" });
    let raw;
    try { raw = await api.json(`/api/v1/jams/${slug.toLowerCase()}/form`, { token }); }
    catch (error) {
      if (error instanceof ApiError && error.status === 404) throw new CliError("jam_not_found", "There is no jam with that name. Run opengame jams to see the open ones.", undefined, { next: "opengame jams" });
      throw error;
    }
    const form = jamFormSchema.parse(raw.form);
    const lines = [
      `${form.jam.name}  ${window(form.jam)}. Rules: ${form.jam.rulesUrl}`,
      "",
      `${form.track.flag} (one, required)`, ...form.track.options.map(o => `  ${o.value.padEnd(24)} ${o.label}`),
      "", `${form.models.flag} (comma separated, at least ${form.models.min})`, ...form.models.options.map(o => `  ${o.value.padEnd(24)} ${o.label}${o.provider && o.provider !== o.label ? `, ${o.provider}` : ""}`),
      "", `${form.sponsors.flag} (comma separated, optional; each needs a model from its sponsor)`,
      ...form.sponsors.options.map(o => `  ${o.value.padEnd(24)} ${o.label}. ${form.evidence.flagPrefix}${o.value} "${o.evidenceLabel ?? form.evidence.label}"`),
      "", `opengame submit --release <id> --jam ${form.jam.slug} --track <key> --models <keys>`,
    ];
    output.emit({ type: "result", command: "jams", data: { form, message: lines.map(terminalText).join("\n") } });
  } finally { await api.close(); }
}

/** Open until when, or what the jam is doing instead, in the jam pages' own words. */
function window(jam: Pick<JamSummary, "acceptingEntries" | "state" | "startsAt" | "endsAt">): string {
  if (jam.acceptingEntries) return jam.endsAt ? `Open until ${whenPacific(jam.endsAt)}` : "Open for entries";
  /* Before kickoff the row's state is already `open`, so its label would read "past its
     deadline" for a jam that has not started. apps/web's entries page answers the same case
     with the date, and so does this. */
  const beforeKickoff = jam.state === "open" && jam.startsAt !== null && Date.parse(jam.startsAt) > Date.now();
  if ((jam.state === "upcoming" || beforeKickoff) && jam.startsAt) return `Opens ${whenPacific(jam.startsAt)}`;
  const label = jamStateLabel(jam.state);
  return label.charAt(0).toUpperCase() + label.slice(1);
}
