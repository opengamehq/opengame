import { createHash, randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { LIMITS, gameKindOrDefault, kindEntersJam } from "@opengame/shared";
import { ERRORS, EXIT, RELEASE_STATUS, SUBMISSION_OPEN, deploymentPath, heldMessage, submissionStatus, jamFormSchema, submissionDestinationSchema, repairFindingSchema, returnedMessage, submissionSchema, validateJamAnswers,
  type GameManifest, type JamAnswers, type JamForm, type RepairFinding, type Submission } from "@opengame/protocol";
import { openBrowser, trustedBrowserUrl } from "./browser";
import { activeToken } from "./credentials";
import { loadManifest } from "./files";
import { readGame } from "./games";
import { Api, ApiError } from "./http";
import { CliError, Output, agentMode, terminalText } from "./output";
import { readProject, savedSubmit, validKey, withProject, type SubmitRequest } from "./project";
import { confirm } from "./prompt";

type Flags = Record<string, string | boolean>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const list = (value: string | boolean | undefined) => typeof value === "string" ? value.split(",").map(v => v.trim()).filter(Boolean) : [];

/**
 * `opengame submit`: send one exact release to review, and optionally into a jam.
 *
 * Agents name the release (`--release`, which `deploy --json` prints as `releaseId`) and
 * answer the jam with flags; a missing answer exits 2 and names the flag that supplies it.
 * A person in a terminal is offered the newest ready release of the linked game and asked
 * to confirm it. Since 11 Nov 2026 they are no longer walked through the jam's form: a
 * person who names no jam answer is given the deploy's page, where the entry is made, and
 * nothing is sent. The form comes from the server, so nothing here knows about any
 * particular jam.
 *
 * Certification is a person's statement and only happens in a browser. When the server
 * answers `needs_certification` this prints the page, opens it for a person, and waits
 * for it to be done.
 *
 * The retry key is saved in `.opengame/project.json` before the request leaves, and reused
 * while the request is the same, so running the same command again after a lost answer
 * returns the submission that was made rather than making a second one. Outside a project
 * folder the key is derived from the request itself, which has the same effect.
 *
 * Running the same command again is also how a person or an agent checks on it. Once the
 * project knows which submission the request made, a rerun reads that submission rather
 * than sending anything, so waiting on a person to certify, a playtest, or a reviewer is
 * one command with no new state behind it.
 *
 * Two things can have happened to it since. Replaced by a newer submission of the SAME
 * release (renewed from the certify page after the statements were reworded, or sent
 * again with other jam answers): the CLI follows it to the newer one. Replaced by a
 * different release: it is reported as replaced and nothing is sent, because "check on
 * my submission" must never quietly put an older release back in front of a newer one;
 * a person who means that names a new --idempotency-key. Withdrawn, or returned for a
 * failure of ours: running submit again means submit it again, so it goes under a new key
 * (sendAgain). Another checkout may already have a newer release in review or live.
 * This command cannot see that, so it sends, and the server refuses with
 * release_superseded rather than retiring the newer one.
 */
export async function submitCommand(root: string, flags: Flags, output: Output) {
  const api = new Api();
  try {
    const qa = flags.qa === true;
    if (qa) refuseJamFlags(flags);
    // The same resolution deploy uses, so a refused token is named by where it came from.
    const active = await activeToken(api.origin, Boolean(flags["token-stdin"]));
    if (!active) throw new CliError("not_signed_in", "Run opengame login, or supply OPENGAME_TOKEN.", 3, { next: "opengame login" });
    const token = active.token;
    api.tokenSource = active.source;
    const person = !output.json && !agentMode() && Boolean(process.stdin.isTTY);
    const key = typeof flags["idempotency-key"] === "string" ? flags["idempotency-key"] : undefined;
    if (key !== undefined && !validKey(key)) throw new CliError("invalid_idempotency_key", "Use letters, numbers, dots, colons, hyphens or underscores in --idempotency-key.");
    if (flags["no-jam"] && flags.jam) throw new CliError("conflicting_flags", "Use --jam to enter a jam or --no-jam to skip it, not both.");
    const inProject = await exists(join(root, "opengame.json")) || await exists(join(root, ".opengame", "project.json"));
    // Asked for by name, so refused before a release is chosen or anything is sent. Without
    // --jam the server's destination decides, and chooseDestination asks the same question.
    if (typeof flags.jam === "string" && inProject) refuseJamKind(await loadManifest(root).catch(() => null));

    // The QA destination is asked for, never decided here: the server reads the account's
    // grant and refuses without one. The operator's jam is not read either, because
    // nothing it says applies to a submission that enters no jam. Said before the release
    // is chosen, and again in the confirmation, so a person answers knowing where it goes.
    if (qa) output.emit({ type: "notice", code: "qa_destination", message: "Sending to review for the QA destination. It enters no jam, and a reviewer decides whether it is published unlisted." });
    const release = await chooseRelease(api, token, root, flags, inProject, person, output);
    const destination = qa ? null : await chooseDestination(api, token, root, flags, inProject, person, output);
    if (destination === "page") {
      // Nothing is sent: the deploy already went to review, and the entry is made on its page.
      const url = await releasePage(api, token, root, inProject, release);
      if (!flags["no-browser"]) openBrowser(url, true, api.origin);
      output.emit({ type: "result", command: "submit", data: { submitted: false, url,
        message: `Your deploy is already in review. Enter the jam on its page, where you choose the track, the models you used and any sponsor track:\n${url}\nAn agent can enter it from here instead with --track, --models and --sponsor.` } });
      return;
    }
    const jam = destination;
    const request: SubmitRequest = qa ? { releaseId: release, jam: null, destination: "qa" } : { releaseId: release, jam };

    const post = async (retryKey: string) =>
      submission((await api.json("/api/v1/submissions", { token, body: request, idempotencyKey: retryKey }).catch(error => { throw explain(error); })).submission, api.origin);
    // A replay names whatever the key made first. Followed to the current submission of
    // this release; when that was withdrawn and the person did not name the key, sent
    // again under a new one.
    const send = async (retryKey: string, renew: (fresh: string) => Promise<void>) => {
      const answered = await post(retryKey);
      if (!answered.replayed) return answered;
      const current = await follow(api, token, answered, release);
      if (key !== undefined || !sendAgain(current)) return current;
      const fresh = randomUUID();
      await renew(fresh);
      return post(fresh);
    };
    let result: Submission;
    if (inProject) {
      result = await withProject(root, api.origin, async (state, save) => {
        savedSubmit(state, true);
        const same = state.submit && JSON.stringify(state.submit.request) === JSON.stringify(request);
        if (same && key === undefined && state.submit!.submissionId) {
          const stored = await readSubmission(api, token, state.submit!.submissionId);
          const current = stored && await follow(api, token, stored, release);
          if (current && !sendAgain(current)) {
            state.submit!.submissionId = current.id;
            await save();
            return current;
          }
          if (current) state.submit = { key: randomUUID(), request };
        }
        state.submit = { key: key ?? (same ? state.submit!.key : undefined) ?? randomUUID(), request };
        await save();
        const answered = await send(state.submit.key, async fresh => { state.submit = { key: fresh, request }; await save(); });
        state.submit.submissionId = answered.id;
        await save();
        return answered;
      });
    } else {
      const derived = key ?? `submit-${createHash("sha256").update(JSON.stringify(request)).digest("hex").slice(0, 40)}`;
      result = await send(derived, async () => {});
    }

    /* The release was already in review when this ran: its deploy sent it there by itself
       (the one flow), so the server answered with that submission and did not use the jam
       answers. Said, so "in review" is not read as "entered"; the entry is made on the
       deploy's page, which certifyUrl names while the details are owed. */
    if (result.existing && request.jam) {
      let page: string | null = null;
      try { page = result.certifyUrl ? trustedBrowserUrl(result.certifyUrl, api.origin) : null; } catch { /* said without the link */ }
      output.emit({ type: "notice", code: "jam_answers_unused", message: page
        ? `This release was already in review, sent there by its deploy, so these jam answers were not used. Enter the jam on its deploy page once review finishes: ${page}`
        : "This release was already in review, sent there by its deploy, so these jam answers were not used." });
    }
    if (result.state === "needs_certification" && result.certifyUrl) {
      // Validate before printing too: an agent may hand this link to the creator.
      const certifyUrl = trustedBrowserUrl(result.certifyUrl, api.origin);
      // A notice, not a stage: a person's terminal settles a stage with a tick, and
      // this one was ticked off as done the moment it was printed.
      output.emit({ type: "notice", code: "certify_required", url: certifyUrl, message: `One step only you can do: certify at ${certifyUrl}` });
      if (!flags["no-browser"]) openBrowser(certifyUrl, true, api.origin);
      if (!flags["no-wait"]) result = await waitForCertification(api, token, result, release, output);
    }
    report(result, output);
  } finally { await api.close(); }
}

/**
 * Whether running submit again means sending this release again, rather than reading
 * where it stands. Withdrawn, because the creator took it back. Returned with nothing but
 * findings of ours, because the review engine returns a release whose checks ran past the
 * deadline or whose playtest stopped on our side, and tells the creator to submit it again
 * (review.ts); read back, that instruction would start nothing. A return for the game's
 * own findings is still read back: the same bytes would be returned the same way, and the
 * next thing to send is a fixed release.
 */
export function sendAgain(current: Submission): boolean {
  if (current.state === "withdrawn") return true;
  const findings = current.state === "returned" ? current.outcome?.findings ?? [] : [];
  return findings.length > 0 && findings.every(finding => "fault" in finding && finding.fault === "platform");
}

/**
 * `--qa` beside anything that answers a jam is two destinations in one command. Refused
 * before a token is read or a request leaves, rather than by dropping the jam half:
 * somebody who typed --track meant a jam, and a QA submission made in its place is the
 * wrong game in the wrong queue. --no-jam is refused too, because it names the
 * marketplace and QA is neither.
 */
function refuseJamFlags(flags: Flags) {
  const named = ["jam", "no-jam", "track", "models", "sponsor"].filter(name => flags[name] !== undefined)
    .concat(Object.keys(flags).filter(name => name.startsWith("evidence-")));
  if (named.length) throw new CliError("conflicting_flags",
    `A QA submission enters no jam. Remove ${named.map(name => `--${name}`).join(", ")}, or remove --qa to submit to the jam.`, EXIT.input);
}

async function exists(path: string) { try { await access(path); return true; } catch { return false; } }

/** From a replaced submission to the newest submission of the same release, if there is one. */
async function follow(api: Api, token: string, start: Submission, releaseId: string): Promise<Submission> {
  let current = start;
  for (let hop = 0; hop < 8 && current.state === "superseded" && current.replacedBy?.releaseId === releaseId; hop++) {
    const newer = await readSubmission(api, token, current.replacedBy.id);
    if (!newer) break;
    current = newer;
  }
  return current;
}

/** The stored submission, or null when this account cannot see it any more. */
export async function readSubmission(api: Api, token: string, id: string): Promise<Submission | null> {
  try { return submission((await api.json(`/api/v1/submissions/${encodeURIComponent(id)}`, { token })).submission, api.origin); }
  catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw explain(error);
  }
}

function submission(value: unknown, origin: string): Submission {
  const parsed = submissionSchema.safeParse(value);
  if (!parsed.success) throw new CliError("invalid_response", "The server returned an incomplete submission. Run the same command again to check on it.", 5);
  if (parsed.data.certifyUrl) parsed.data.certifyUrl = trustedBrowserUrl(parsed.data.certifyUrl, origin);
  return parsed.data;
}

/** A refusal of the jam answers lists each flag that was wrong, one per line. Every
 * other refusal is the ApiError as it came: the server's sentence, and the exit, retry
 * and wait the shared table gives its code. This used to rebuild every ApiError from
 * its status alone, which dropped the credential wording, retryAfterSeconds and the
 * request id, and exited 2 on a handle_required that every other command exits 3 on.
 * A refused QA destination needs nothing here for that reason: its row in protocol's
 * errors.ts carries exit 3, `retry: never` and the sentence the server sends. */
function explain(error: unknown): unknown {
  if (!(error instanceof ApiError)) return error;
  const problems = Array.isArray(error.data.problems) ? error.data.problems as { flag: string; message: string }[] : [];
  if (error.status === 400 && problems.length) {
    return new CliError("invalid_jam_answers", problems.map(p => `${p.flag}: ${terminalText(p.message)}`).join("\n"), EXIT.input);
  }
  return error;
}

export async function chooseRelease(api: Api, token: string, root: string, flags: Flags, inProject: boolean, person: boolean, output: Output): Promise<string> {
  if (typeof flags.release === "string") {
    if (!uuid.test(flags.release)) throw new CliError("invalid_release", "Use the release id from opengame deploy --json with --release.");
    return flags.release.toLowerCase();
  }
  if (!person) throw new CliError("release_required", "Name the release to submit with --release <id>. Once a deploy is ready, opengame status --json and opengame deployments --json print it as releaseId.");
  // A read, not the lock: a deploy running beside this holds it for minutes.
  const state = inProject ? await readProject(root, api.origin) : null;
  if (!state?.gameId) throw new CliError("not_linked", "Run this in a deployed project folder, or name the release with --release <id>.");
  const game = await readGame(api, token, state.gameId);
  const latest = game.latestOperation;
  const releaseId = latest?.state === "ready" ? latest.releaseId : null;
  // Which deploy is in the way decides what to do next. A redeploy whose upload was
  // interrupted read "This game has no ready release yet" beside a release that was
  // playing on the private page, and running deploy again was not obviously the fix.
  if (!releaseId) {
    if (latest?.state === "uploading") throw new CliError("no_ready_release", "Your newest deploy has not finished uploading. Run opengame deploy to resume it, then submit.", 2, { next: "opengame deploy" });
    if (latest?.state === "queued" || latest?.state === "checking") throw new CliError("no_ready_release", "Your newest deploy is still being checked. Run opengame status --watch, then submit when it is ready.", 2, { next: "opengame status --watch" });
    if (latest) throw new CliError("no_ready_release", "Your newest deploy did not become ready. Run opengame status to see why, fix it and deploy again, or submit an earlier release with --release <id>.", 2, { next: "opengame status" });
    throw new CliError("no_ready_release", "This game has no ready release yet. Run opengame deploy, then submit.", 2, { next: "opengame deploy" });
  }
  output.emit({ type: "notice", code: "release", message: `${terminalText(game.title)}, release ${releaseId.slice(0, 8)}` });
  const question = flags.qa === true ? "Submit this release to the QA destination, not the jam?" : "Submit this release for review?";
  if (!flags.yes && !await confirm(question)) throw new CliError("cancelled", "Cancelled. Nothing was submitted.", EXIT.input);
  return releaseId;
}

export async function chooseDestination(api: Api, token: string, root: string, flags: Flags, inProject: boolean, person: boolean, output: Output):
  Promise<JamAnswers | null | "page"> {
  const raw = await api.json("/api/v1/jams", { token });
  const selected = submissionDestinationSchema.safeParse(raw.submissionDestination);
  if (!selected.success) throw new CliError("invalid_response", "The server did not provide a submission destination. Contact the OpenGame team, then retry.", 5);
  const destination = selected.data;
  const requested = typeof flags.jam === "string" ? flags.jam.toLowerCase() : null;
  if (destination.kind === "marketplace") {
    if (requested) throw new CliError("submission_destination", "Submissions currently go to the marketplace. Remove --jam and its jam answers.", EXIT.input);
    return null;
  }
  if (flags["no-jam"] || (requested && requested !== destination.slug)) {
    throw new CliError("submission_destination", `Submissions currently go to ${destination.name}. Remove --no-jam or use --jam ${destination.slug}.`, EXIT.input);
  }
  refuseJamKind(inProject ? await loadManifest(root).catch(() => null) : null);
  // The operator's destination persists after the deadline; the form and submission
  // endpoint report a closed jam. A deadline never turns a jam entry into marketplace.
  const slug = destination.slug;
  const form = jamFormSchema.parse((await api.json(`/api/v1/jams/${encodeURIComponent(slug)}/form`, { token }).catch(error => { throw explain(error); })).form);
  const answers: Partial<JamAnswers> = {
    track: typeof flags.track === "string" ? flags.track : undefined,
    models: list(flags.models),
    sponsors: list(flags.sponsor),
    evidence: Object.fromEntries(Object.entries(flags).filter(([k, v]) => k.startsWith("evidence-") && typeof v === "string")
      .map(([k, v]) => [k.slice("evidence-".length), v as string])),
  };
  /* A person is no longer walked through the jam's form here (the owner's call, 11 Nov 2026: the CLI
     collects the minimum, and the rest is filled in on a private page). Their deploy went to
     review by itself, and its page is where the track, the models and the sponsor tracks are
     chosen, so a person who named none of them is sent there. An agent still answers with
     flags, and a missing one still exits 2 naming the flag. */
  const asked = Boolean(answers.track) || answers.models!.length > 0 || answers.sponsors!.length > 0 || Object.keys(answers.evidence!).length > 0;
  if (person && !asked) return "page";
  const checked = validateJamAnswers(form, answers);
  if (!checked.ok) throw new CliError("jam_answers_required", checked.problems.map(p => `${p.flag}: ${p.message}`).join("\n"), EXIT.input);
  output.emit({ type: "notice", code: "jam", message: summary(form, checked.answers) });
  return checked.answers;
}

/**
 * A decomp or a mod is refused here, from the checkout's own opengame.json, before the
 * jam's form is fetched or walked: the jam's rules require that you own every asset and
 * built it after kickoff, and somebody else's game is neither. The server refuses it again
 * from the release itself, which is the answer that counts when the checkout and the
 * release disagree; this only spares a person the form for an entry that cannot stand. A
 * manifest that will not load, or says no kind, is a game as far as this is concerned.
 */
export function refuseJamKind(manifest: Pick<GameManifest, "kind" | "basedOn"> | null) {
  const kind = gameKindOrDefault(manifest?.kind);
  if (kindEntersJam(kind)) return;
  throw new CliError("kind_not_in_jam", `opengame.json says this is a ${kind}${manifest?.basedOn ? ` of ${manifest.basedOn}` : ""}. ${ERRORS.kind_not_in_jam!.message!} Nothing was submitted.`, EXIT.input);
}

/**
 * The deploy page of the release being submitted, for a person sent there to enter the jam:
 * the linked game's newest deploy when it made this release, which is the usual case, and
 * the account's games otherwise. Read loosely, since a failed read changes one link.
 */
export async function releasePage(api: Api, token: string, root: string, inProject: boolean, releaseId: string): Promise<string> {
  try {
    const state = inProject ? await readProject(root, api.origin) : null;
    if (state?.gameId) {
      const latest = (await readGame(api, token, state.gameId)).latestOperation;
      if (latest && latest.releaseId === releaseId) return api.origin + deploymentPath(latest.id);
    }
  } catch { /* the account's games, below */ }
  return `${api.origin}/settings/games`;
}

function summary(form: JamForm, answers: JamAnswers) {
  const name = (options: { value: string; label: string }[], value: string) => options.find(o => o.value === value)?.label ?? value;
  return [
    `Entering ${form.jam.name}`,
    `  Genre track   ${name(form.track.options, answers.track)}`,
    ...(answers.sponsors.length ? [`  Sponsors      ${answers.sponsors.map(s => name(form.sponsors.options, s)).join(", ")}`] : []),
    `  Models used   ${answers.models.map(m => name(form.models.options, m)).join(", ")}`,
  ].map(terminalText).join("\n");
}

/**
 * Poll until a person has certified, or until the watch window closes. Running out of
 * time is not an error: the submission was made and is waiting on a person, so the
 * command reports it like `--no-wait` would and exits 0, and running it again picks the
 * wait back up. Exit 2 here used to say the input was wrong.
 */
async function waitForCertification(api: Api, token: string, initial: Submission, releaseId: string, output: Output): Promise<Submission> {
  const deadline = Date.now() + LIMITS.platform.operations.watchTimeoutMs;
  let current = initial;
  await output.face();
  output.emit({ type: "progress", stage: "certify", message: "Waiting for you to certify in the browser" });
  while (current.state === "needs_certification" && Date.now() < deadline) {
    await sleep(LIMITS.platform.operations.pollIntervalMs);
    // Renewed from the certify page after the wording changed: keep waiting on the new one.
    current = await follow(api, token, submission((await api.json(`/api/v1/submissions/${current.id}`, { token })).submission, api.origin), releaseId);
  }
  return current;
}

function report(result: Submission, output: Output) {
  const next = result.state === "playtesting" ? " It is decided when the playtest finishes; your game page follows each step."
    : result.state === "needs_certification" && result.certifyUrl ? ` Certify at ${result.certifyUrl}, then run this command again to follow it.`
    : result.state === "superseded" && result.replacedBy ? ` ${result.replacedBy.ref}, release ${result.replacedBy.releaseId.slice(0, 8)}, is in review instead. To send this release again anyway, run with a new --idempotency-key.`
    : result.state === "withdrawn" ? " If you withdrew it, run this command again to submit it again. A game that is off the gallery has to be back on it before a release can go live." : "";
  const lines = emitReview(result, output);
  output.emit({ type: "result", command: "submit", data: { ...result,
    message: [`${reviewLine(result)}${next}`, ...lines, result.gameUrl].join("\n") } });
}

/**
 * A submission's state in one line, in the words every surface uses: the status, the queue
 * and, once returned, what there is to read and which release to send next. `opengame
 * submit` and `opengame status` both print it, so the two cannot describe one review two
 * ways. `newest` is the newest ready release, where the caller knows it.
 */
export function reviewLine(result: Submission, newest: string | null = null): string {
  const key = submissionStatus(result);
  const status = RELEASE_STATUS[key];
  const ahead = result.state === "review" && result.queuePosition !== null ? ` ${result.queuePosition} ${result.queuePosition === 1 ? "release is" : "releases are"} ahead of yours.` : "";
  const message = result.state === "returned" && sendAgain(result) ? "This stopped on our side. Nothing to change in your game. Run opengame submit to rerun the checks."
    : result.state === "returned" ? returnedMessage({ findings: result.outcome?.findings.length ?? 0, release: result.releaseId, newer: newest })
    : key === "held" ? heldMessage(result.hold) : status.message;
  return `${result.ref}: ${status.label}. ${message}${ahead}`;
}

/** The findings of a decision as `finding` events, the shape a deploy's take, so the
 * terminal prints the same Fix and Then run block and an agent reads fix, verify, retry
 * and fault. Findings from an older server have only a sentence; those, and the
 * decision's reason, come back as lines for the caller's message. */
export function emitReview(result: Submission, output: Output): string[] {
  const lines: string[] = [];
  for (const item of result.outcome?.findings ?? []) {
    const parsed = repairFindingSchema.safeParse(item);
    if (parsed.success) output.emit({ type: "finding", finding: parsed.data as RepairFinding });
    else lines.push(`  ${terminalText(item.message)}`);
  }
  if (result.outcome?.reason) lines.push(`  ${terminalText(result.outcome.reason)}`);
  return lines;
}

/**
 * Follow a submission while it is still moving, until it settles or `deadline` passes:
 * what `opengame status --watch` does once the deploy is ready. Each read runs the review
 * engine on the server, which is part of what moves it. A person reviewing can take days,
 * so running out of time is not an error; the caller reports where it stands.
 */
export async function followReview(api: Api, token: string, start: Submission, output: Output, deadline: number): Promise<Submission> {
  let current = start;
  const say = (value: Submission) => output.emit({ type: "progress", stage: `review:${value.state}`, message: reviewLine(value) });
  /* Told apart by what the line says rather than by the stored state: an outage turning
     into the launch hold is "waiting" both times, and printed nothing. */
  const seen = (value: Submission) => `${submissionStatus(value)}:${value.hold?.passed ?? ""}`;
  /* A hold moves only when limits.json says the test machine is verified, which no poll
     can bring closer, so watching one until the deadline only kept the terminal busy. */
  const held = (value: Submission) => {
    if (submissionStatus(value) !== "held") return false;
    output.emit({ type: "progress", stage: "review:held", message: "Stopped watching. A release on hold waits until our test machine is verified." });
    return true;
  };
  if ((SUBMISSION_OPEN as readonly string[]).includes(current.state)) { await output.face(); say(current); if (held(current)) return current; }
  while ((SUBMISSION_OPEN as readonly string[]).includes(current.state) && Date.now() < deadline) {
    await sleep(Math.min(LIMITS.platform.review.statusPollMs, Math.max(0, deadline - Date.now())));
    const next = await readSubmission(api, token, current.id).catch(error => {
      // One failed read of a review still moving is not the review failing.
      if (error instanceof CliError && error.exitCode === 5) return current;
      throw error;
    });
    if (!next) break;
    if (seen(next) !== seen(current)) say(next);
    current = next;
    if (held(current)) break;
  }
  return current;
}
