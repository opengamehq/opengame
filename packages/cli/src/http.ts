import { gzipSync } from "node:zlib";
import { ReadableStream } from "node:stream/web";
import { EXIT, errorExit, errorSentence, isPlatformAuthErrorCode, platformAuthError, type PlatformAuthErrorCode } from "@opengame/protocol";
import { EnvHttpProxyAgent, fetch } from "undici";
import { LIMITS } from "@opengame/shared";
import { CliError, terminalText } from "./output";
import { readableBytes } from "./bytes";
import { CLI_VERSION, olderThan } from "./version";
import type { TokenSource } from "./credentials";

export function apiOrigin(env = process.env): string {
  try {
    // Empty is unset, as it is for OPENGAME_TOKEN: `OPENGAME_API_URL=` is how a shell
    // clears it, and `??` let "" through to fail as a malformed origin.
    const url = new URL(env.OPENGAME_API_URL || "https://opengame.io");
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (url.protocol !== "https:" && !(local && url.protocol === "http:"))) throw new Error();
    return url.origin;
  } catch { throw new CliError("api_origin", "OPENGAME_API_URL must be an HTTPS origin, or an HTTP localhost origin for development."); }
}

export const PROTECTION_BYPASS_ENV = "OPENGAME_VERCEL_PROTECTION_BYPASS";
/** The launch rehearsal's host, the one origin the
 * bypass secret is ever sent to. Moving the rehearsal to another name is a reviewed change here. */
export const REHEARSAL_HOST = "opengame-launch-rehearsal.vercel.app";

/**
 * The header that lets this CLI through Vercel's Deployment Protection on a preview, for the
 * launch rehearsal and nothing else.
 *
 * A protected preview answers every request without a Vercel login with Vercel's own sign-in
 * page, so a CLI pointed at one could never reach the API it was meant to rehearse. Turning the
 * protection off is not the answer: from the rehearsed launch minute that preview lets strangers
 * sign in, so its host must stay behind Vercel's door. Vercel's answer for tools is "Protection
 * Bypass for Automation", a project secret sent as `x-vercel-protection-bypass`.
 *
 * It goes only to OPENGAME_API_URL, because `send` below is the one place it is added and
 * `send` reaches nothing else: the upload PUTs carry their own headers to object storage, and
 * vendoring and the registry use their own fetch. And only when that origin is the rehearsal's
 * own host, REHEARSAL_HOST, a name on `vercel.app` attached to the rehearsal. Every other
 * origin stops the command before its first request, opengame.io above all: production is not
 * behind Deployment Protection, so the secret has no business there, and a shell left with the
 * variable set from a rehearsal would otherwise hand a project secret to every production
 * request it made. It stops with a sentence rather than quietly leaving the header off, so the
 * person learns the variable is still set.
 *
 * An allow-list of one host rather than a refusal of ours, since 5 Nov 2026. The refusal named
 * opengame.io and its subdomains and sent the secret everywhere else, so `https://opengame.io.`
 * (the same host, spelled with DNS's trailing dot) reached production with it (review of this
 * lane). A suffix, `*.vercel.app`, was the next answer and is not enough either: anybody can
 * deploy a name there, and the secret opens every preview of the project, which reads
 * production's database (review of the fixes). The host is compared lowercased with a
 * trailing dot taken off.
 *
 * The value is never printed, logged or put in an error: the sentences below name the variable
 * and never what it holds.
 */
export function protectionBypassHeader(origin: string, env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  // Empty is unset, as it is for OPENGAME_API_URL and OPENGAME_TOKEN.
  const secret = env[PROTECTION_BYPASS_ENV];
  if (!secret) return {};
  const host = new URL(origin).hostname.toLowerCase().replace(/\.$/, "");
  if (host !== REHEARSAL_HOST) {
    throw new CliError("api_origin", `${PROTECTION_BYPASS_ENV} is set and the API origin is ${origin}. It is only for the launch rehearsal at https://${REHEARSAL_HOST}. Unset ${PROTECTION_BYPASS_ENV} to use OpenGame. Nothing was sent.`);
  }
  /* Vercel's secrets are 32 letters and digits. A wider shape is allowed in case that changes,
     but nothing that could end a header line or carry a second one. */
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(secret)) {
    throw new CliError("api_origin", `${PROTECTION_BYPASS_ENV} is not a Vercel protection bypass secret. Copy it again from the project's Deployment Protection settings.`);
  }
  return { "x-vercel-protection-bypass": secret };
}

/**
 * A refusal from the API, as one sentence the caller can act on and an exit code that
 * says which kind of act. Two rules, from two sides of one table (protocol errors.ts):
 *
 * Credential refusals are worded HERE from the shared table, never from the server's
 * prose, so a revoked token says "revoked" and names itself, a removed tester is not
 * told to log in again, and a 401 says which credential to replace (the environment's,
 * the piped one, or the saved login).
 *
 * Everything else carries the server's own code and sentence, cleaned of terminal
 * controls. Those are written for the agent: "This upload expired. Start a new deploy."
 * is the instruction, and replacing it with "Try again" is what kept agents resuming a
 * dead upload for ever. A 500 the server says not to retry is reported with its request
 * id so a person can find the log line.
 */
function credentialMessage(code: PlatformAuthErrorCode | null, status: number, data: Record<string, unknown>, source?: TokenSource): string {
  if (code === "token_revoked" || code === "token_invalid" || (code === null && status === 401)) {
    const token = data.token as { id?: unknown; name?: unknown } | undefined;
    const hasName = typeof token?.name === "string" && typeof token.id === "string";
    /* token_invalid naming a token is a login the server issued and then let lapse after
       LIMITS.platform.device.inactiveDaysMax days unused (credentialRefusal in
       the platform access policy). A token nobody issued has no name to send. */
    const expired = code === "token_invalid" && hasName;
    const named = (code === "token_revoked" || expired) && hasName
      ? ` (${(token!.name as string).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, LIMITS.platform.device.nameCharsMax)}, ${(token!.id as string).replace(/[^0-9a-f]/g, "")})` : "";
    const what = code === "token_revoked" ? "was revoked." : expired ? `expired after ${LIMITS.platform.device.inactiveDaysMax} days without use.`
      : code === "token_invalid" ? "is not valid." : "is not valid or was revoked.";
    return source === "env" ? `OPENGAME_TOKEN${named} ${what} Replace it with a token from OpenGame settings.`
      : source === "stdin" ? `The piped token${named} ${what} Supply a current token from OpenGame settings.`
      : source === "stored" ? `Your saved login${named} ${what} Run opengame login to sign in again.`
      : expired ? `This login${named} ${what} Run opengame login to sign in again.`
      : code ? platformAuthError(code).message.replace(/^This token/, `This token${named}`)
      : platformAuthError("token_invalid").message;
  }
  return platformAuthError(code ?? "insufficient_scope").message;
}

export class ApiError extends CliError {
  constructor(readonly status: number, readonly reason: string, readonly data: Record<string, unknown>, origin = "", source?: TokenSource, retryAfter?: number) {
    const own = typeof data.message === "string" ? terminalText(data.message).replace(/\s+/g, " ").trim().slice(0, 400) : "";
    const credential = isPlatformAuthErrorCode(reason) ? reason : null;
    const code = credential ?? (status === 401 ? "unauthorized" : status === 404 && reason === "not_found" ? "api_unavailable"
      : /^[a-z][a-z0-9_]{1,63}$/.test(reason) && reason !== "unknown" ? reason : status === 429 ? "rate_limited" : "api_error");
    const fatal = status === 500 && data.retry === "never" && typeof data.requestId === "string" && /^[0-9a-f-]{36}$/.test(data.requestId);
    const message = credential || status === 401 ? credentialMessage(credential, status, data, source)
      // A 403 the server sent without a sentence still has one in the shared table, and that
      // names the real reason (a missing QA grant is not a token's permissions).
      : status === 403 ? (own || errorSentence(code, "cli") || "This token does not have access to this action or game. Check its permissions in OpenGame settings.")
      : code === "api_unavailable" ? `The OpenGame API is not available at ${origin || "the configured origin"}. Check OPENGAME_API_URL.`
      : fatal ? `The server hit an error that retrying will not fix. Report request ${data.requestId}.`
      : own || (status === 429 ? "Too many requests. Wait before trying again." : "The server could not complete this request. Try again shortly.");
    const row = errorExit(code, status);
    const serverRetry = row.exit === 5 && (data.retry === "never" || data.retry === "after-fix") ? data.retry : undefined;
    const wait = retryAfter ?? (typeof data.retryAfterSeconds === "number" && Number.isFinite(data.retryAfterSeconds) && data.retryAfterSeconds >= 0 ? Math.ceil(data.retryAfterSeconds) : undefined);
    // A 403 is about this account, exit 3, except "not launched", whose row has its own exit.
    super(code, message, status === 401 || (status === 403 && row.exit !== EXIT.notLaunched) ? 3 : row.exit,
      fatal ? { retry: "never" } : serverRetry ? { retry: serverRetry } : wait !== undefined && row.retry === "later" ? { retry: "later", retryAfterSeconds: wait } : {});
  }
}

function retryAfterHeader(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value.trim())) return Math.min(Number(value.trim()), 86_400);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.min(86_400, Math.ceil((date - Date.now()) / 1000))) : undefined;
}

/** The bounds a gzip-capable route reads a body to: `sentMax` on the wire, `decodedMax`
 * once inflated (incrementalUpload.bodyBytesMax and assetPlanBodyBytesMax for the start
 * of a large-asset deploy). */
export type GzipBody = { sentMax: number; decodedMax: number };

/**
 * A JSON body as it goes on the wire: exactly as it always was while it fits `sentMax`,
 * and gzip-encoded only past it. The plain case is kept byte for byte so that this CLI
 * still deploys an ordinary-sized plan to a server that has never heard of
 * Content-Encoding, which is every server before the large-game lane. A body the server
 * would refuse either way is refused here, before a request is made, in words that say
 * what to change: a 413 after a minute of hashing says nothing about why.
 */
export function encodeJsonBody(value: unknown, gzip?: GzipBody): { body: string | Buffer; encoding?: "gzip" } {
  const text = JSON.stringify(value);
  const bytes = Buffer.byteLength(text);
  if (!gzip || bytes <= gzip.sentMax) return { body: text };
  const tooLarge = (size: number, limit: number) => new CliError("unity_assets_limit", `The file list for this deploy is ${readableBytes(size, "up")}${size === bytes ? "" : " compressed"}, and the server accepts at most ${readableBytes(limit)}. Send fewer, larger files (combine small ones into packs) or use shorter paths, then deploy again.`, 1);
  if (bytes > gzip.decodedMax) throw tooLarge(bytes, gzip.decodedMax);
  const compressed = gzipSync(text);
  if (compressed.byteLength > gzip.sentMax) throw tooLarge(compressed.byteLength, gzip.sentMax);
  return { body: compressed, encoding: "gzip" };
}

export class Api {
  private readonly dispatcher = new EnvHttpProxyAgent();
  /** Where the token in use came from, so a 401 names the right remedy. */
  tokenSource?: TokenSource;
  /** Read once, so a bad value stops the command before its first request. */
  private readonly bypass: Record<string, string>;
  constructor(readonly origin = apiOrigin()) { this.bypass = protectionBypassHeader(origin); }
  async close() { await this.dispatcher.close(); }
  private async send(path: string, options: { token?: string; body?: unknown; method?: string; idempotencyKey?: string; signal?: AbortSignal; gzip?: GzipBody } = {}) {
    // A funnel step can legitimately contain ../assets or a backslash. Only the
    // route can traverse; query values must remain ordinary encoded data.
    const pathname = path.split("?", 1)[0]!;
    if (!pathname.startsWith("/api/v1/") || pathname.includes("..") || pathname.includes("\\")) throw new CliError("api_path", "The API path is invalid.");
    const encoded = options.body === undefined ? undefined : encodeJsonBody(options.body, options.gzip);
    return await fetch(this.origin + path, { method: options.method ?? (options.body === undefined ? "GET" : "POST"),
        dispatcher: this.dispatcher, redirect: "error", signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(LIMITS.platform.http.timeoutMs)]) : AbortSignal.timeout(LIMITS.platform.http.timeoutMs),
        headers: { accept: "application/json", "x-opengame-cli-version": CLI_VERSION, ...this.bypass,
          ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
          ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}),
          ...(encoded ? { "content-type": "application/json" } : {}), ...(encoded?.encoding ? { "content-encoding": encoded.encoding } : {}) },
        body: encoded?.body });
  }
  /**
   * `anyVersion` is for `opengame upgrade` alone. Every other command stops with
   * exit 6 when the server says this CLI is too old, but upgrade is the fix for
   * exactly that, and refusing it there left "run opengame upgrade" as the
   * answer to running opengame upgrade.
   */
  async json(path: string, options: { token?: string; body?: unknown; method?: string; idempotencyKey?: string; anyVersion?: boolean; signal?: AbortSignal; gzip?: GzipBody } = {}): Promise<Record<string, unknown>> {
    let answered = false;
    try {
      const response = await this.send(path, options);
      // Every platform response names the oldest CLI it serves, so the check runs
      // on whatever command a person happens to use, not only on deploy.
      const minimum = response.headers.get("x-opengame-min-cli")?.trim();
      if (!options.anyVersion && minimum && /^\d+\.\d+\.\d+$/.test(minimum) && olderThan(CLI_VERSION, minimum)) {
        await response.body?.cancel();
        throw new CliError("upgrade_required", `This is CLI ${CLI_VERSION} and the server needs ${minimum} or newer. Run opengame upgrade; if you are signed out, run opengame login first, which works on this version.`, 6, { next: "opengame upgrade" });
      }
      const reader = response.body?.getReader();
      let bytes = 0; const chunks: Uint8Array[] = [];
      if (reader) while (true) {
        const next = await reader.read(); if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > LIMITS.platform.http.responseBytesMax) { await reader.cancel(); throw new Error(); }
        chunks.push(next.value);
      }
      // Only a body that arrived whole is an answer; a reset or a timeout mid-body is
      // still "could not reach".
      answered = true;
      let data: unknown;
      try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { data = undefined; }
      // An error page from a proxy is still an answer with a status.
      if (!response.ok) {
        const value = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
        throw new ApiError(response.status, typeof value.error === "string" ? value.error : "unknown", value, this.origin, this.tokenSource, retryAfterHeader(response.headers.get("retry-after")));
      }
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
      const value = data as Record<string, unknown>;
      if (!options.anyVersion && value.apiVersion !== undefined && value.apiVersion !== LIMITS.platform.apiVersion && value.apiVersion !== Number(LIMITS.platform.apiVersion)) {
        throw new CliError("upgrade_required", `This server speaks a different API version than CLI ${CLI_VERSION}. Run opengame upgrade.`, 6, { next: "opengame upgrade" });
      }
      return value;
    } catch (error) {
      if (error instanceof CliError) throw error;
      // Transport errors may include proxy passwords or request headers. Never echo them.
      // The origin is safe to name (URL.origin carries no credentials), and naming it is
      // what turns "check your API origin" into something a person can check. Something
      // that answered with a body this CLI cannot read is not "could not reach": a proxy's
      // sign-in page or a wrong origin answers, and the fix is the same two settings.
      throw new CliError("network", answered
        ? `The OpenGame API at ${this.origin} sent an answer this CLI could not read. Check OPENGAME_API_URL and HTTPS_PROXY, then retry.`
        : `Could not reach the OpenGame API at ${this.origin}. Check your connection, HTTPS_PROXY and OPENGAME_API_URL, then retry.`, 5);
    }
  }

  /** The upload capability supplies its own authority. Never send the account token
   * or follow a redirect from object storage. Its URL must also stay out of errors. */
  async upload(value: unknown, bytes: Uint8Array, progress?: (sent: number, total: number) => void): Promise<void> {
    return this.uploadObject(value, bytes, "application/zip", progress);
  }

  async uploadFile(value: unknown, bytes: Uint8Array, progress?: (sent: number, total: number) => void): Promise<void> {
    return this.uploadObject(value, bytes, "application/octet-stream", progress);
  }

  /**
   * One part of an archive sent in parts (packages/protocol archive-parts.ts). The URL names
   * the upload and the part number and signs the length, so the only header is the length;
   * there is no create-only condition on a part, and a part sent twice replaces itself.
   */
  async uploadPart(value: unknown, bytes: Uint8Array, progress?: (sent: number, total: number) => void): Promise<void> {
    const upload = value as { url?: unknown; headers?: Record<string, unknown> } | undefined;
    const url = this.uploadUrl(upload, upload?.headers?.["content-length"] === String(bytes.byteLength)
      && Object.keys(upload?.headers ?? {}).length === 1);
    return this.put(url, bytes, { "content-length": String(bytes.byteLength) }, progress);
  }

  /** A storage URL this CLI will send bytes to: HTTPS, or plain HTTP to a local server
   * from a CLI already talking to one, never with credentials or a fragment in it. */
  private uploadUrl(upload: { url?: unknown } | undefined, headersMatch: boolean): URL {
    try {
      const url = new URL(String(upload?.url));
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if (url.username || url.password || url.hash || (url.protocol !== "https:" && !(local && url.protocol === "http:" && this.origin.startsWith("http:")))) throw new Error();
      if (!headersMatch) throw new Error();
      return url;
    } catch { throw new CliError("invalid_upload", "The server returned an invalid upload. Run opengame deploy again.", 5); }
  }

  private async uploadObject(value: unknown, bytes: Uint8Array, contentType: "application/zip" | "application/octet-stream", progress?: (sent: number, total: number) => void): Promise<void> {
    const upload = value as { url?: unknown; headers?: Record<string, unknown> } | undefined;
    const url = this.uploadUrl(upload, upload?.headers?.["content-type"] === contentType && upload.headers["if-none-match"] === "*" &&
      upload.headers["content-length"] === String(bytes.byteLength));
    return this.put(url, bytes, { "content-type": contentType, "content-length": String(bytes.byteLength), "if-none-match": "*" }, progress);
  }

  private async put(url: URL, bytes: Uint8Array, headers: Record<string, string>, progress?: (sent: number, total: number) => void): Promise<void> {
    // One PUT, so the deadline scales with the archive: the fixed limit, or
    // 64 KiB a second, whichever is longer. A slow link can finish a large build.
    const timeout = Math.max(LIMITS.platform.deploy.uploadTimeoutMs, Math.ceil(bytes.byteLength / 65_536) * 1000);
    const chunk = LIMITS.platform.incrementalUpload.chunkBytesMax;
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= bytes.byteLength) { controller.close(); return; }
        const end = Math.min(sent + chunk, bytes.byteLength);
        controller.enqueue(bytes.subarray(sent, end));
        sent = end;
        progress?.(sent, bytes.byteLength);
      },
    });
    // What stopped it, in words that name no URL, header or credential: the deploy
    // retries on its own, and its last message says which of these it kept meeting.
    try {
      progress?.(0, bytes.byteLength);
      const response = await fetch(url, { method: "PUT", dispatcher: this.dispatcher, redirect: "error", duplex: "half",
        signal: AbortSignal.timeout(timeout), body, headers });
      await response.body?.cancel();
      // A lost successful response is indistinguishable from a completed retry.
      // The API verifies the stored size and the scanner verifies the digest. A part
      // has no create-only condition, so it never answers 412.
      if (!response.ok && !(response.status === 412 && headers["if-none-match"] === "*")) throw new UploadInterrupted(`storage answered ${response.status}`);
    } catch (error) {
      if (error instanceof UploadInterrupted) throw error;
      throw new UploadInterrupted(uploadFailureCause(error));
    }
  }
}

/* Node and undici error codes, by what a person can do about them. A cause is chosen from
   this table and never from the error's message, which carries the host, the port and
   OpenSSL's text and could carry the signed URL. */
const CAUSES: Array<[RegExp, string]> = [
  [/^(ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT)$/, "it timed out"],
  [/^(ENOTFOUND|EAI_AGAIN|EAI_NONAME|EAI_NODATA)$/, "the address could not be found"],
  [/^ECONNREFUSED$/, "the server refused the connection"],
  [/^(CERT_|UNABLE_TO_|DEPTH_ZERO_SELF_SIGNED_CERT$|SELF_SIGNED_CERT_IN_CHAIN$|ERR_TLS_CERT_ALTNAME_INVALID$|HOSTNAME_MISMATCH$)/, "the secure connection could not be verified"],
  [/^(ERR_SSL_|ERR_TLS_|EPROTO$)/, "the secure connection broke"],
];

/**
 * Why one upload PUT failed, in a few words. Every network failure used to read "the
 * connection dropped", and the ones met on a real machine were TLS "bad record mac"
 * resets, DNS failures and refused connections, each with a different fix. undici throws
 * `TypeError("fetch failed")` and puts the system error in `cause`, and a refused
 * connection to a name with two addresses is an AggregateError with one per address, so
 * the whole chain is read. Anything unrecognised is still "the connection dropped".
 */
export function uploadFailureCause(error: unknown): string {
  const seen = new Set<unknown>();
  const pending = [error];
  while (pending.length && seen.size < 16) {
    const item = pending.shift();
    if (!item || typeof item !== "object" || seen.has(item)) continue;
    seen.add(item);
    const { name, code, cause, errors } = item as { name?: unknown; code?: unknown; cause?: unknown; errors?: unknown };
    // Only the outer error: the upload's own deadline rejects fetch with its reason, a
    // TimeoutError. An AbortError deeper in the chain is undici giving up on a proxy that
    // refused the tunnel (407, 403), and "it timed out" would send the person the wrong way.
    if (item === error && (name === "TimeoutError" || name === "AbortError")) return "it timed out";
    if (typeof code === "string") for (const [pattern, words] of CAUSES) if (pattern.test(code)) return words;
    pending.push(cause, ...(Array.isArray(errors) ? errors : []));
  }
  return "the connection dropped";
}

/** One PUT that did not land. The deploy asks for a fresh URL and tries again, and
 * only the last one reaches the person, so the cause travels with it. */
export class UploadInterrupted extends CliError {
  constructor(readonly cause: string) {
    super("upload_interrupted", `The upload did not finish: ${cause}. Run opengame deploy again to resume the same operation.`, 5, { next: "opengame deploy" });
  }
}
