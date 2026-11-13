import { ERRORS } from "@opengame/protocol";
import { activeToken } from "./credentials";
import { Api, ApiError } from "./http";
import { CliError } from "./output";
import { readProject } from "./project";
import { resumesSavedDeploy } from "./deploy";

/**
 * Before the creator platform opens, the first thing a stranger who installed this sees is
 * one sentence, "OpenGame opens for creators on" the kickoff day (the `not_launched` row in
 * @opengame/protocol, which reads the day from the launch clock). Since 8 Nov 2026 that is
 * the jam's kickoff, a day after the site opens: the owner moved the CLI and uploads there.
 *
 * THE SERVER IS THE GATE, NOT THIS. This file is public code on npm, and anybody can delete
 * the line that calls it. What keeps people out is the API, which refuses every creator
 * route with `not_launched` for an account the switch does not let through
 * (the server's launch policy). This exists so the local commands, which never
 * reach that API, say the same thing rather than working as if OpenGame were open, and so
 * nobody has to get as far as a refused deploy to find out.
 *
 * Asked before every command but version, help and the three that sign in and out (cli.ts,
 * BEFORE_LAUNCH): `login`, because our own people have to be able to sign in to be let
 * through; `logout`, which is never a thing to refuse; and `whoami`, which the server
 * answers itself. With the saved login or OPENGAME_TOKEN when there is one, because the
 * answer depends on whose it is: the team and their testers pass while it is shut.
 *
 * A network failure is the network error it always was, exit 5, and never "not launched":
 * that sentence told to somebody whose Wi-Fi dropped would send them looking for a switch.
 * A server too old to have the status route (404) is let through, because that server
 * cannot refuse anything on the switch's behalf either way.
 *
 * OPENGAME_TEST_SKIP_LAUNCH_CHECK is how this package's own test suite runs local commands
 * with no server at all. It hides a sentence and nothing else, for the reason above.
 *
 * THE CLOSE IS THE SERVER'S TOO. After entriesCloseAt every new deploy is refused, fixes
 * included (the launch clock). The status answer says so (`deploysFrozen`), and this returns
 * it, so `deploy` can stop before it builds and uploads anything only to be refused at the
 * end (`refuseNewDeployAfterClose`). Asked of the server rather than of the clock bundled
 * into this release, because a reopening is a change to the server's clock that an installed
 * CLI would never hear of.
 */
export async function requireLaunched(tokenStdin: boolean): Promise<{ deploysFrozen: boolean }> {
  if (process.env.OPENGAME_TEST_SKIP_LAUNCH_CHECK === "1") return { deploysFrozen: false };
  const api = new Api();
  try {
    const active = await activeToken(api.origin, tokenStdin);
    let status: Record<string, unknown>;
    try { status = await api.json("/api/v1/status", { token: active?.token, anyVersion: true }); }
    catch (error) { if (error instanceof ApiError && error.status === 404) return { deploysFrozen: false }; throw error; }
    /* Signed out, the way through is a login, since any signed-in account is let in before
       launch: so it says that first, and names the command (J-opus-G2). Signed in and still
       shut, the day is the whole answer. */
    if (status.launched !== true && status.access !== true) {
      if (!active) throw new CliError("not_launched", `Sign in first: run opengame login, then run this again. ${notLaunchedMessage(status.creatorsOpenAt)}`, undefined, { next: "opengame login" });
      throw new CliError("not_launched", notLaunchedMessage(status.creatorsOpenAt));
    }
    return { deploysFrozen: status.deploysFrozen === true };
  } finally { await api.close(); }
}

/**
 * For the commands that never reach the creator API, `init` and `check`: the same question,
 * answered as a sentence to print beside the result, never as a refusal. A creator who has
 * just installed this can set a folder up and check it on their own machine before
 * OpenGame opens; what waits for the day is sending it to us, which the server refuses
 * anyway (launch E2E judges, J-opus-G2, 13 Nov 2026: `check` before sign-in printed the
 * opening date, exited 7 and said nothing about what to do). Null when OpenGame is open
 * to this caller, and on any failure to ask, since a local command should not need the
 * network at all.
 */
export async function launchNotice(tokenStdin: boolean): Promise<string | null> {
  if (process.env.OPENGAME_TEST_SKIP_LAUNCH_CHECK === "1") return null;
  const api = new Api();
  try {
    const active = await activeToken(api.origin, tokenStdin);
    const status: Record<string, unknown> = await api.json("/api/v1/status", { token: active?.token, anyVersion: true });
    return status.launched !== true && status.access !== true ? notLaunchedMessage(status.creatorsOpenAt) : null;
  } catch { return null; }
  finally { await api.close(); }
}

const PACIFIC_DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "America/Los_Angeles" });

/**
 * The sentence with the day the server reports, so an owner hold past the kickoff is not
 * answered with the day bundled into this release. A server too old to report it, or an
 * answer that does not parse, gets the bundled sentence.
 */
export function notLaunchedMessage(creatorsOpenAt: unknown): string {
  const at = typeof creatorsOpenAt === "string" ? Date.parse(creatorsOpenAt) : NaN;
  return Number.isFinite(at) ? `OpenGame opens for creators on ${PACIFIC_DAY.format(new Date(at))}.` : ERRORS.not_launched!.message!;
}

/**
 * After the close, `opengame deploy` stops before it builds, unless it would resume a deploy
 * saved in this folder (`resumesSavedDeploy`, the deploy's own rule). That one goes on,
 * because the server answers its saved key as the same deploy (a postmark, not a new entry)
 * and refuses only a new one. A dry run uploads nothing and is never asked.
 */
export async function refuseNewDeployAfterClose(root: string, key: string | undefined): Promise<void> {
  const api = new Api();
  let resumable = false;
  try { resumable = resumesSavedDeploy((await readProject(root, api.origin)).deploy, key); }
  catch { resumable = false; }
  finally { await api.close(); }
  if (!resumable) throw new CliError("entries_closed", ERRORS.entries_closed!.message!);
}
