import { hostname } from "node:os";
import { openBrowser } from "./browser";
import { setTimeout as sleep } from "node:timers/promises";
import { LIMITS, isValidHandle } from "@opengame/shared";
import { Api, ApiError } from "./http";
import { Credentials, PendingLogins, platformToken, suppliedToken, type PendingLogin } from "./credentials";
import { Output, CliError, agentMode } from "./output";

type Flags = Record<string, string | boolean>;
function invalidResponse(): never { throw new CliError("invalid_response", "The server returned an incomplete login response. Try again.", 5); }

function identity(value: Record<string, unknown>) {
  if (typeof value.handle !== "string" || (!isValidHandle(value.handle) || /[\u0000-\u001f\u007f]/.test(value.handle)) ||
    (value.ogNumber !== null && !Number.isSafeInteger(value.ogNumber))) invalidResponse();
  // Passed through for --json, which has always carried it; the terminal draws no one's own face.
  const avatar = value.avatar && typeof value.avatar === "object" ? { avatar: value.avatar } : {};
  return { handle: value.handle, ogNumber: value.ogNumber, ...avatar, credential: value.credential };
}
/* No OG number in the sentence. A product decision, 6 Oct 2026: the number shows nowhere in the product
   but on the two founders' own pages, and the terminal is the product too. It stays in
   the JSON, which is data rather than something anybody reads aloud. */
const signedIn = (profile: ReturnType<typeof identity>) => `Signed in as @${profile.handle}.`;

const ENV_TOKEN = "OPENGAME_TOKEN is set, so every command already uses that token. Unset OPENGAME_TOKEN to sign in with the browser, or run opengame whoami to check it.";

export async function authCommand(command: "login" | "logout" | "whoami", flags: Flags, output: Output) {
  const api = new Api();
  const credentials = new Credentials(api.origin);
  try {
    const supplied = await suppliedToken(Boolean(flags["token-stdin"]));
    const stored = supplied ? null : await credentials.read();
    const token = supplied?.token ?? stored;
    api.tokenSource = supplied?.source ?? (stored ? "stored" : undefined);
    if (command === "whoami") {
      if (!token) throw new CliError("not_signed_in", "Run opengame login, or supply OPENGAME_TOKEN.", 3, { next: "opengame login" });
      const profile = identity(await api.json("/api/v1/auth/me", { token }));
      await output.identity(signedIn(profile));
      output.emit({ type: "result", command, data: { ...profile, source: api.tokenSource, message: signedIn(profile) } });
      return;
    }
    if (command === "logout") {
      if (!token) {
        /* An `oga_` an older CLI saved reads as signed out, so it used to stay on disk for
           good. It is removed here, not revoked: nothing on OpenGame has taken one since the
           jam upload tokens were removed on 3 Nov 2026, so there is nothing to revoke. */
        const jam = supplied ? null : await credentials.storedJamToken();
        if (jam && await credentials.remove(jam)) {
          output.emit({ type: "result", command, data: { removed: true, message: "Removed a jam upload token (oga_) an older CLI saved here. It was never signed in to the platform, and OpenGame no longer accepts these tokens." } });
          return;
        }
        output.emit({ type: "result", command, data: { message: "You are already signed out." } }); return;
      }
      // A token from the environment is somebody else's to revoke. An automation token
      // made in settings never expires, and a device login lapses only after
      // LIMITS.platform.device.inactiveDaysMax days unused, so revoking CI's by accident
      // breaks every pipeline that uses it.
      if (supplied?.source === "env" && !flags.revoke) {
        throw new CliError("environment_token", "OPENGAME_TOKEN supplies this token, and logging out would revoke it for every tool that uses it. Unset OPENGAME_TOKEN to stop using it here, or run opengame logout --revoke to revoke it everywhere.", 2);
      }
      /* A lapsed login is refused as token_invalid naming the token (credentialRefusal in
         the platform access policy), and the server revoked nothing, because it
         would not act on it. Saying "revoked" there would report a revocation nobody made. */
      let expired = false;
      try { await api.json("/api/v1/auth/logout", { token, method: "POST" }); }
      catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) throw error;
        expired = error.reason === "token_invalid" && typeof (error.data.token as { name?: unknown } | undefined)?.name === "string";
      }
      // A failed revocation leaves the local credential available for a retry.
      // An environment token belongs to its caller; do not erase another local login.
      const removed = supplied ? true : await credentials.remove(token);
      const lapsed = `This login had already expired after ${LIMITS.platform.device.inactiveDaysMax} days without use, so there was nothing for the server to revoke.`;
      output.emit({ type: "result", command, data: { revoked: !expired, ...(expired ? { expired: true } : {}), message: expired
        ? (supplied ? `${lapsed} Remove it from ${supplied.source === "env" ? "OPENGAME_TOKEN and the secret store that set it" : "the secret store that supplied it"}.`
          : removed ? `Signed out. ${lapsed}` : `${lapsed} A newer login is still saved.`)
        : supplied ? (supplied.source === "env" ? "Token revoked. Remove it from OPENGAME_TOKEN and the secret store that set it." : "Token revoked. Remove it from the secret store that supplied it.")
        : removed ? "Signed out. This token has been revoked." : "The previous token has been revoked. A newer login is still saved." } });
      return;
    }
    if (flags["no-wait"] && flags.wait) throw new CliError("conflicting_flags", "Use --wait or --no-wait, not both.");
    if (supplied?.source === "env") throw new CliError("environment_token", ENV_TOKEN, 2);
    if (supplied) throw new CliError("token_supplied", "Login uses the browser, not a piped token. Run opengame login without --token-stdin.", 2);
    const pending = new PendingLogins(api.origin);
    if (flags.continue) {
      const saved = await pending.read();
      if (!saved) throw new CliError("no_pending_login", "There is no login waiting for approval, or its code expired. Run opengame login --no-wait for a new code.", 2, { next: "opengame login --no-wait" });
      /* --continue is the step every agent runs, so in an agent's shell it is bounded the
         same way plain login is: it polls for a short while and, if nobody has pressed
         Allow yet, keeps the pending login and says to run it again. Unbounded, it sat in
         the agent's shell with one progress line for the ten minutes the code lives,
         which is the hang plain login had before a8ae8c7d, moved one command along. */
      const budget = (agentMode() || output.json) && !flags.wait ? LIMITS.platform.device.continueWaitSeconds * 1000 : null;
      await finishLogin(api, credentials, pending, saved, stored, output, budget);
      return;
    }
    let replacing: string | null = null;
    if (stored) {
      // A revoked saved token used to block login, while whoami said to log in:
      // two commands telling the agent to run each other. Check it instead.
      try {
        const profile = identity(await api.json("/api/v1/auth/me", { token: stored }));
        if (!flags.force) {
          // Signed in is the state login exists to reach, so it is a success. It
          // used to exit 3 "auth", and an agent following the copied prompt in a
          // folder where login had already worked was steered to --force, which
          // asks the person to approve again and revokes the login that worked.
          await output.identity(signedIn(profile));
          output.emit({ type: "result", command, data: { ...profile, signedIn: true, pending: false, source: "stored", next: null,
            message: `${signedIn(profile)} Run opengame login --force to sign in again, or opengame logout to sign out.` } });
          return;
        }
        replacing = stored;
      } catch (error) {
        /* A saved login the server refuses is replaced, whichever refusal it is: invalid
           or revoked (401), an account removed from the platform (403 not_member), a
           suspended or deleted account (403 account_inactive), one the moderators banned
           (403 account_banned), an account with no handle (409 handle_required), or an
           account the launch switch has not let in yet (403 not_launched). /api/v1/auth/me
           asks that switch before it can say not_member, so a saved login from before
           launch used to exit here and never reach the browser. whoami still reports that
           answer. Those codes are not all 401s, and treating only 401 as stale left a
           removed tester unable to sign in as anybody else, --force included. An outage
           is not a refusal and still stops here. */
        const refused = error instanceof ApiError && (error.status === 401 || error.code === "not_member"
          || error.code === "account_inactive" || error.code === "account_banned" || error.code === "handle_required"
          || error.code === "not_launched");
        if (!refused && !flags.force) throw error;
        if (refused) output.emit({ type: "notice", code: "stale_login", message: error.code === "not_member"
          ? "Your saved login is for an account without platform access. Starting a new login, so you can sign in with another account."
          : error.code === "account_inactive"
          ? "Your saved login is for an account that is suspended or deleted. Starting a new login, so you can sign in with another account."
          : error.code === "account_banned"
          ? "Your saved login is for an account OpenGame's moderators have banned. Starting a new login, so you can sign in with another account."
          : error.code === "handle_required"
          ? "Your saved login is for an account with no handle yet. Starting a new login: claim a handle when the browser asks, or sign in with another account."
          : error.code === "not_launched"
          ? "Your saved account is not let in yet. Starting a new login, so you can sign in with another account."
          : "Your saved login was revoked or is no longer valid. Starting a new one." });
        replacing = stored;
      }
    }
    // A plain login while a code is still waiting resumes that code, so a person
    // who already pressed Allow is not sent to approve a second one.
    const fresh = async (): Promise<PendingLogin> => {
      // Dated by default, so three logins from one laptop are three distinguishable tokens in settings.
      const name = String(flags["device-name"] ?? `${hostname()} · ${new Date().toISOString().slice(0, 10)}`).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, LIMITS.platform.device.nameCharsMax);
      const device = await api.json("/api/v1/auth/device", { body: { device_name: name || "OpenGame CLI" } });
      // The server builds this from its own configured origin. A different one means the two
      // were set up apart, which "incomplete response" would hide.
      if (typeof device.verification_uri === "string" && device.verification_uri !== `${api.origin}/cli`) {
        throw new CliError("origin_mismatch", `OPENGAME_API_URL is ${api.origin}, but that server says its address is ${device.verification_uri.replace(/\/cli$/, "").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200)}. Set both to the same origin.`, 5);
      }
      if (typeof device.device_code !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(device.device_code) ||
        typeof device.user_code !== "string" || !/^[BCDFGHJKLMNPQRSTVWXYZ23456789]{4}-[BCDFGHJKLMNPQRSTVWXYZ23456789]{4}$/.test(device.user_code) ||
        device.verification_uri !== `${api.origin}/cli` || !Number.isFinite(device.expires_in) || !Number.isFinite(device.interval) ||
        Number(device.expires_in) <= 0 || Number(device.expires_in) > LIMITS.platform.device.expiresSeconds || Number(device.interval) < LIMITS.platform.device.pollIntervalSeconds) invalidResponse();
      const request = { origin: api.origin, deviceCode: device.device_code, userCode: device.user_code, url: `${api.origin}/cli?code=${device.user_code}`,
        expiresAt: new Date(Date.now() + Number(device.expires_in) * 1000).toISOString(), interval: Number(device.interval), deviceName: name || "OpenGame CLI" };
      await pending.save(request);
      return request;
    };
    const reveal = async (request: PendingLogin) => {
      const minutes = Math.max(1, Math.ceil((Date.parse(request.expiresAt) - Date.now()) / 60_000));
      // First line, and structured: an agent may only see output when a command
      // exits, and a person has to see this code within the next few minutes.
      await output.revealCode({ type: "notice", code: "device_approval", url: request.url, userCode: request.userCode, expiresAt: request.expiresAt,
        message: `Open ${request.url}\nType code ${request.userCode} there, then allow access. This code expires in ${minutes} minute${minutes === 1 ? "" : "s"}.` }, request.userCode);
    };
    let request = await pending.read() ?? await fresh();
    await reveal(request);
    /* An agent's shell shows nothing until the command exits, so a login that waits for the
       browser there kept the URL and code from the only one who could pass them on, for
       the ten minutes the code lives. In agent mode the code comes back at once and
       --continue finishes; a person at a terminal is still waited for. */
    /* Not signed in yet, so not a success: exit 3 with `next`, after the notice above has
       carried the URL and code. It used to be a result with exit 0, and
       `opengame login && opengame deploy` in a script went on to deploy signed out. */
    if (flags["no-wait"] || ((agentMode() || output.json) && !flags.wait)) {
      throw new CliError("login_pending", "Not signed in yet. Allow access in the browser with the link and code above, then run opengame login --continue to finish signing in.", 3, { next: "opengame login --continue" });
    }
    openBrowser(request.url, !output.json && !flags["no-browser"]);
    /* A person at a terminal who let the code lapse gets a new one and the terminal keeps
       waiting, as the plan's edge-case table says; ending the command made them start
       over. Only here: an agent's login never waits for the browser, so it never lapses
       inside a command. One renewal, so a terminal left alone does not ask for ever. */
    for (let renewals = 0; ; renewals++) {
      try { await finishLogin(api, credentials, pending, request, replacing, output); return; }
      catch (error) {
        if (!(error instanceof CliError && error.code === "login_expired") || renewals >= 1 || output.style !== "rich") throw error;
        output.emit({ type: "notice", code: "login_renewed", message: "That code expired before access was allowed. Here is a new one." });
        request = await fresh();
        await reveal(request);
        openBrowser(request.url, !flags["no-browser"]);
      }
    }
  } finally { await api.close(); }
}

/** Polls for the person's approval until the code expires, or for `budgetMs` when that is
 * set, after which the login is left pending and the caller is told to continue again. */
async function finishLogin(api: Api, credentials: Credentials, pending: PendingLogins, request: PendingLogin, replacing: string | null, output: Output, budgetMs: number | null = null) {
  const stopAt = budgetMs === null ? Infinity : Date.now() + budgetMs;
  // A person at a terminal waits with the character, which becomes theirs on Allow.
  if (budgetMs === null) output.companion();
  output.emit({ type: "progress", stage: "approval", message: budgetMs === null ? "Waiting for browser approval"
    : `Waiting up to ${Math.round(budgetMs / 1000)} seconds for browser approval` });
  const deadline = Date.parse(request.expiresAt);
  /* The server stamped the code's expiry before it answered, so this clock's deadline is
     later than the server's by at least the round trip, and a poll AT the deadline is
     always answered "expired" -- which lost an Allow pressed in the final interval. The
     last poll goes out a margin before it instead, never more than half the time left. */
  const finalPoll = deadline - Math.min(LIMITS.platform.device.finalPollMarginSeconds * 1000, Math.max(0, deadline - Date.now()) / 2);
  // `base` is the server's pace, raised only by slow_down. `interval` also backs off on an
  // outage and comes back to `base` as soon as the server answers properly again, so
  // one 503 cannot stretch every later poll to minutes.
  let base = request.interval;
  let interval = base;
  /* The earliest the server will take a poll without answering slow_down, which also adds
     five seconds to its pace. A poll before it is never sent, and the time is saved with
     the pending login after every answer, because each --continue is a new process. One
     that started from the original interval polled early every time, and on 11 Nov 2026 an
     agent running --continue as told stretched an allowed login's pace past its expiry, so
     it was never collected. A login saved before then has no time and waits one interval. */
  const savedNext = request.nextPollAt === undefined ? NaN : Date.parse(request.nextPollAt);
  let nextPoll = Number.isFinite(savedNext) ? Math.min(savedNext, deadline) : Date.now() + interval * 1000;
  const remember = async () => {
    // Only onto this same code: another --continue may have collected it and cleared the file.
    // Losing this only makes the next command's first poll early, which the server paces.
    try { await pending.pace(request.deviceCode, base, new Date(nextPoll).toISOString()); } catch { /* Kept in memory. */ }
  };
  let received: string | null = null;
  let busyNoticed = false;
  let polls = 0;
  let lastPoll = -Infinity;
  /* Poll until the code expires. The person may already have pressed Allow, so a server
     error or a dropped connection is not the end of the login: both are retried until the
     last poll, with the interval growing, and the agent is told the login is still alive. */
  let unanswered = false;
  while (true) {
    const now = Date.now();
    if (finalPoll - now < 0 || lastPoll >= finalPoll) break;
    /* The last poll goes out at finalPoll even when that is early: an Allow pressed in the
       final interval is otherwise lost, and the server collects an approved login on any
       poll. Every other poll waits for its time, and when this command's budget ends first
       it stops without polling, so an agent's repeated --continue cannot earn slow_down. */
    const at = Math.max(now, Math.min(nextPoll, finalPoll));
    if (at > stopAt) { unanswered = true; break; }
    await sleep(at - now);
    lastPoll = Date.now();
    polls++;
    try {
      const result = await api.json("/api/v1/auth/token", { body: { device_code: request.deviceCode, grant_type: "urn:ietf:params:oauth:grant-type:device_code" } });
      if (typeof result.access_token !== "string" || !platformToken(result.access_token)) invalidResponse();
      received = result.access_token;
      break;
    } catch (error) {
      const transient = (error instanceof ApiError && error.status >= 500) || (error instanceof CliError && error.code === "network");
      if (transient) {
        interval = Math.min(interval * 2, base * 4);
        nextPoll = Date.now() + interval * 1000;
        if (!busyNoticed) output.emit({ type: "progress", stage: "approval", message: "Still waiting (the server is busy). Your browser approval is kept." });
        busyNoticed = true;
        continue;
      }
      if (!(error instanceof ApiError)) throw error;
      interval = base;
      if (error.reason === "authorization_pending") { nextPoll = Date.now() + base * 1000; await remember(); continue; }
      if (error.reason === "slow_down" || error.status === 429) {
        base = Math.max(base + LIMITS.platform.device.pollIntervalSeconds, Number(error.data.interval) || 0); interval = base;
        nextPoll = Date.now() + base * 1000; await remember(); continue;
      }
      if (error.reason === "access_denied") {
        await pending.save(null);
        // An approval collected after its account stopped being a member says why; only a
        // bare access_denied is somebody pressing Deny.
        const why = error.data.reason === "account_inactive"
          ? "The account that approved this login is suspended or deleted. Run opengame login and approve it with a different account."
          : error.data.reason === "account_banned"
          ? "OpenGame's moderators have banned the account that approved this login. Run opengame login and approve it with a different account."
          : error.data.reason === "not_member"
          ? "The account that approved this login no longer has platform access. Run opengame login and approve it with a different account."
          : error.data.reason === "handle_required"
          ? "The account that approved this login has no handle. Claim one on OpenGame, then run opengame login again."
          : "Access was denied in the browser. Run opengame login to try again.";
        throw new CliError("access_denied", why, 3);
      }
      if (error.reason === "expired_token") break;
      throw error;
    }
  }
  if (!received && unanswered) {
    // The code is still alive and kept, so the next --continue polls the same one.
    const minutes = Math.max(1, Math.ceil((deadline - Date.now()) / 60_000));
    const alive = `The code ${request.userCode} at ${request.url} is good for ${minutes} more minute${minutes === 1 ? "" : "s"}.`;
    const wait = Math.max(1, Math.ceil((nextPoll - Date.now()) / 1000));
    throw new CliError("login_pending", polls > 0
      ? `Access has not been allowed yet. ${alive} Run opengame login --continue again once the person has typed the code and pressed Allow access.`
      : `Not checked yet: OpenGame asks for ${base} seconds between checks, and the next one is due in ${wait} second${wait === 1 ? "" : "s"}. ${alive} Run opengame login --continue again in ${wait} second${wait === 1 ? "" : "s"}.`,
      3, { next: "opengame login --continue" });
  }
  await pending.save(null);
  if (!received) throw new CliError("login_expired", "The login code expired. Run opengame login for a new code.", 3, { next: "opengame login" });
  // Polling ends here. Profile errors cannot restart a one-shot token exchange.
  let storage: "keychain" | "file";
  try { storage = await credentials.save(received); }
  catch {
    let retired = false;
    try { await api.json("/api/v1/auth/logout", { token: received, method: "POST" }); retired = true; }
    catch (error) { retired = error instanceof ApiError && error.status === 401; }
    let cleaned = false;
    try { cleaned = await credentials.remove(received); } catch { /* Storage may still be unavailable. */ }
    throw new CliError("credential_storage", retired && !cleaned
      ? "The token has been revoked, but local cleanup could not be confirmed. Fix your credential-storage permissions, then run opengame logout before signing in again."
      : retired
      ? "The token could not be saved and has been revoked. Check your credential-storage permissions, then run opengame login again."
      : `The token could not be saved, and revocation could not be confirmed. Revoke the device named ${request.deviceName} in OpenGame settings before trying again.`, 3);
  }
  // The login this one replaced is retired on the server too, so it cannot
  // linger as a second live credential for this machine.
  if (replacing && replacing !== received) {
    try { await api.json("/api/v1/auth/logout", { token: replacing, method: "POST" }); } catch { /* Already revoked, or revocable in settings. */ }
  }
  let profile: ReturnType<typeof identity>;
  try { profile = identity(await api.json("/api/v1/auth/me", { token: received })); }
  catch (error) {
    // An account outside the team signs in fine before launch and is then refused at
    // /auth/me. That is the one sentence a stranger should read, with exit 7, not a
    // profile failure that tells them to retry something that cannot work yet.
    if (error instanceof ApiError && error.code === "not_launched") throw error;
    throw new CliError("profile_unavailable", "Your login token was saved, but your profile could not be loaded. Run opengame whoami to retry without signing in again.", 5);
  }
  await output.identity(signedIn(profile));
  output.emit({ type: "result", command: "login", data: { ...profile, storage, message: signedIn(profile) } });
}
