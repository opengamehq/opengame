import { constants } from "node:fs";
import { open, mkdir, lstat, chmod, unlink, readFile } from "node:fs/promises";
import { replaceFile } from "./files";
import { dirname, join, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { createHash, randomBytes } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { lock } from "proper-lockfile";
import { promisify } from "node:util";
import { CREATOR_TOKEN_PATTERN } from "@opengame/protocol";
import { LIMITS } from "@opengame/shared";
import { CliError } from "./output";

const exec = promisify(execFile);
const service = "io.opengame.cli";
export function validToken(value: string): boolean { return CREATOR_TOKEN_PATTERN.test(value); }
/** A token the platform API takes. `oga_` tokens were the jam upload routes' own until they
 * were removed on 3 Nov 2026, and the site refuses them (apps/web lib/agent-tokens.ts), so
 * this CLI does not hold or send one: it says so here, where the fix is a sentence, rather
 * than as token_invalid from the server. */
export function platformToken(value: string): boolean { return validToken(value) && value.startsWith("ogt_"); }
const storageError = () => new CliError("credential_storage", "Could not access private credential storage. Check permissions on ~/.config/opengame and retry.", 3);

export interface Keychain {
  read(account: string): Promise<string | null>;
  save(account: string, token: string): Promise<boolean>;
  remove(account: string): Promise<void>;
}
const systemKeychain: Keychain = {
  async read(account) {
    const result = await exec("/usr/bin/security", ["find-generic-password", "-s", service, "-a", account, "-w"], { timeout: LIMITS.platform.http.timeoutMs });
    return result.stdout.trim();
  },
  async save(account, token) {
    return new Promise<boolean>((resolve) => {
      const child = spawn("/usr/bin/security", ["-i"], { stdio: ["pipe", "ignore", "ignore"], timeout: LIMITS.platform.http.timeoutMs });
      child.on("error", () => resolve(false)); child.on("close", (code) => resolve(code === 0));
      child.stdin.on("error", () => {});
      // The restricted token and hex account go over stdin, never in process arguments.
      child.stdin.end(`add-generic-password -U -s ${service} -a ${account} -w ${token}\n`);
    });
  },
  async remove(account) {
    try { await exec("/usr/bin/security", ["delete-generic-password", "-s", service, "-a", account], { timeout: LIMITS.platform.http.timeoutMs }); }
    catch (error) { if ((error as { code?: number }).code !== 44) throw storageError(); }
  },
};

/** Where the CLI keeps its files: $XDG_CONFIG_HOME/opengame, or ~/.config/opengame. */
export function configDirectory(directory?: string) {
  const xdg = process.env.XDG_CONFIG_HOME;
  return directory ?? join(xdg && isAbsolute(xdg) ? xdg : join(homedir(), ".config"), "opengame");
}

export class Credentials {
  readonly file: string;
  private readonly account: string;
  constructor(readonly origin: string, readonly useKeychain = process.platform === "darwin" && process.env.OPENGAME_CREDENTIAL_STORE !== "file", directory?: string,
    private readonly keychain: Keychain = systemKeychain) {
    this.file = join(configDirectory(directory), "auth.json");
    this.account = createHash("sha256").update(origin).digest("hex");
  }
  private async secureDirectory() {
    const dir = dirname(this.file);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const stat = await lstat(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid())) throw storageError();
    await chmod(dir, 0o700);
  }
  private async readFile(): Promise<Record<string, string | null>> {
    let handle;
    try {
      handle = await open(this.file, constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = await handle.stat();
      // Windows reports every regular file as 0o666 whatever its ACL, so the mode
      // bits say nothing there; the profile directory's ACL is the protection.
      if (!stat.isFile() || stat.size > LIMITS.platform.credentials.fileBytesMax || (process.platform !== "win32" && (stat.mode & 0o077)) ||
        (process.getuid && stat.uid !== process.getuid())) throw storageError();
      const value: unknown = JSON.parse(await handle.readFile("utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value) || Object.values(value).some((token) => token !== null && (typeof token !== "string" || !validToken(token)))) throw storageError();
      return value as Record<string, string | null>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw storageError();
    } finally { await handle?.close(); }
  }
  private async withLock<T>(write: (check: () => void) => Promise<T>): Promise<T> {
    await this.secureDirectory();
    let compromised = false;
    let release: () => Promise<void>;
    try {
      release = await lock(this.file, { realpath: false, stale: LIMITS.platform.credentials.lockStaleMs,
        onCompromised: () => { compromised = true; } });
    } catch { throw new CliError("credential_busy", "Another CLI is updating credentials. Wait a few seconds, then retry.", 3); }
    try { return await write(() => { if (compromised) throw storageError(); }); }
    finally { await release(); }
  }
  private async updateFile(check: () => void, token?: string | null) {
    const temp = this.file + "." + randomBytes(8).toString("hex");
    try {
      const values = await this.readFile();
      if (token !== undefined) values[this.origin] = token; else delete values[this.origin];
      const encoded = JSON.stringify(values);
      if (Buffer.byteLength(encoded) > LIMITS.platform.credentials.fileBytesMax) throw storageError();
      const handle = await open(temp, "wx", 0o600);
      try { await handle.writeFile(encoded); await handle.sync(); } finally { await handle.close(); }
      check();
      await replaceFile(temp, this.file);
    } finally { await unlink(temp).catch(() => {}); }
  }
  /** Whatever is saved for this origin, whatever kind of token it is. */
  private async stored(): Promise<string | null> {
    // A fallback entry is the latest saved credential. A successful Keychain save
    // removes it, so an older Keychain item cannot reappear after an outage.
    const fallback = (await this.readFile())[this.origin];
    if (fallback !== undefined) return fallback;
    if (this.useKeychain) {
      try {
        const value = await this.keychain.read(this.account);
        if (value && validToken(value)) return value;
      } catch (error) {
        // A locked Keychain is not evidence that the user is signed out.
        if ((error as { code?: number }).code !== 44) throw new CliError("keychain_unavailable", "Keychain could not be read. Unlock it and retry, or explicitly use OPENGAME_CREDENTIAL_STORE=file.", 3);
      }
    }
    return null;
  }
  async read(): Promise<string | null> {
    // An `oga_` left by an older CLI is no credential here: signed out, and login fixes it.
    const value = await this.stored();
    return value && platformToken(value) ? value : null;
  }
  /** An `oga_` an older CLI saved here, which `read` treats as signed out. Logout removes it. */
  async storedJamToken(): Promise<string | null> {
    const value = await this.stored();
    return value && !platformToken(value) ? value : null;
  }
  async save(token: string): Promise<"keychain" | "file"> {
    if (!platformToken(token)) throw storageError();
    return this.withLock(async (check) => {
      // Check existing storage before creating anything in the other backend.
      await this.readFile();
      if (this.useKeychain) {
        let verified = false;
        try {
          // Interactive security can exit successfully after a command failed.
          // Read the exact credential back before reporting a successful save.
          if (await this.keychain.save(this.account, token)) verified = await this.keychain.read(this.account) === token;
        } catch { /* Fall back only after trying the provider-managed store. */ }
        if (verified) {
          try { await this.updateFile(check); }
          catch (error) {
            // A failed file update must not strand a partially saved Keychain login.
            try { if (await this.keychain.read(this.account) === token) await this.keychain.remove(this.account); } catch { /* The caller also attempts conditional cleanup. */ }
            throw error;
          }
          return "keychain";
        }
      }
      await this.updateFile(check, token); return "file";
    });
  }
  async remove(expected: string): Promise<boolean> {
    return this.withLock(async (check) => {
      const fallback = (await this.readFile())[this.origin];
      if (fallback === null) return true;
      // All saves take this lock. A different fallback is a newer login; a
      // Keychain entry underneath the expected fallback is its predecessor.
      if (fallback !== undefined && fallback !== expected) return false;
      if (this.useKeychain) {
        let current: string | null = null;
        try { current = await this.keychain.read(this.account); }
        catch (error) {
          if ((error as { code?: number }).code !== 44 && fallback !== expected) throw storageError();
        }
        if (fallback === undefined && current && current !== expected) return false;
        if (current) { check(); await this.keychain.remove(this.account); }
      }
      // Keep a signed-out marker even in explicit file mode. A later return to
      // Keychain mode must not restore a credential hidden by a newer fallback.
      await this.updateFile(check, null);
      return true;
    });
  }
}

export type TokenSource = "env" | "stdin" | "stored";

/** Where a token came from decides what the CLI may do with it. One the
 * environment supplies belongs to whoever set it, often CI, and tokens never
 * expire: telling that caller to "log out" would revoke it everywhere. */
let piped: Promise<string> | undefined;
export async function suppliedToken(stdin: boolean): Promise<{ token: string; source: "env" | "stdin" } | null> {
  if (stdin && process.env.OPENGAME_TOKEN) throw new CliError("ambiguous_token", "Use either OPENGAME_TOKEN or --token-stdin, not both.");
  // Empty is unset. CI templates and `env -u`-less shells write OPENGAME_TOKEN= to clear
  // it, and treating "" as a malformed token made whoami, deploy and login exit 3 with
  // token_format for somebody who had asked for no token at all.
  let token = process.env.OPENGAME_TOKEN || undefined;
  if (stdin) {
    if (process.stdin.isTTY) throw new CliError("token_stdin", "Pipe the token into stdin, or use OPENGAME_TOKEN.");
    // Once per process: the launch check reads the piped token before the command does
    // (launch.ts), and a pipe can be read to its end only once.
    token = (await (piped ??= readPipedToken())).trim();
  }
  if (token === undefined) return null;
  if (!validToken(token)) throw new CliError("token_format", stdin ? "The piped token is not valid. Copy a new token from settings." : "OPENGAME_TOKEN is not a valid token. Copy a new token from settings.", 3);
  if (!platformToken(token)) {
    throw new CliError("token_format", `${stdin ? "The piped token" : "OPENGAME_TOKEN"} is a jam upload token (oga_), which OpenGame no longer accepts. Run opengame login, or create a token in OpenGame settings.`, 3);
  }
  return { token, source: stdin ? "stdin" : "env" };
}

/**
 * Reads stdin to its end, giving up after `stdinWaitMs` with nothing new on it.
 *
 * An agent's shell (Cursor, Codex) starts every command with stdin as a pipe it never
 * writes to and never closes, and shows nothing until the command exits. `for await`
 * over that pipe waited for ever, so `--token-stdin` without anything piped in looked
 * to the agent like a CLI that had hung.
 */
function readPipedToken(): Promise<string> {
  const waitMs = LIMITS.platform.credentials.stdinWaitMs;
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const chunks: Buffer[] = []; let size = 0;
    const silent = () => new CliError("token_stdin", size === 0
      ? `Nothing arrived on stdin within ${Math.round(waitMs / 1000)} seconds. Pipe the token in and close the pipe, for example printf '%s' "$TOKEN" | opengame <command> --token-stdin, or set OPENGAME_TOKEN instead.`
      : `Part of a token arrived on stdin and then nothing more, with the pipe still open. Pipe the whole token and close stdin, for example printf '%s' "$TOKEN" | opengame <command> --token-stdin.`);
    /* Silence after a whole token is a writer that forgot to close the pipe, not a
       failure: the token is used. Silence after part of one, or none, is reported. */
    const quiet = () => validToken(Buffer.concat(chunks).toString("utf8").trim()) ? finish() : finish(silent());
    let timer = setTimeout(quiet, waitMs);
    const finish = (error?: CliError) => {
      clearTimeout(timer);
      input.off("data", data); input.off("end", end); input.off("error", failed);
      /* Pausing is what lets the process exit although the pipe it was handed is still
         open: a paused stdin holds no reference on the event loop. There was an optional
         `unref?.()` here as well, and with it removed the open-pipe test still exits on
         Node 18.17, 22 and 24, measured on 5 Oct 2026, so it went. */
      input.pause();
      if (error) reject(error); else resolve(Buffer.concat(chunks).toString("utf8"));
    };
    /* The deadline is on silence, not on the whole read: a writer that is slow to start
       (a password manager waiting on Touch ID) still gets the full wait, and one that
       writes and then keeps the pipe open is not waited on for ever either. */
    const data = (chunk: Buffer | string) => {
      clearTimeout(timer);
      size += chunk.length;
      if (size > LIMITS.platform.credentials.stdinBytesMax) { finish(new CliError("token_stdin", "The token input is too long. Pipe only the token from OpenGame settings, or set OPENGAME_TOKEN.")); return; }
      chunks.push(Buffer.from(chunk));
      timer = setTimeout(quiet, waitMs);
    };
    const end = () => finish();
    const failed = () => finish(new CliError("token_stdin", "stdin could not be read. Set OPENGAME_TOKEN instead."));
    input.on("data", data); input.once("end", end); input.once("error", failed);
    input.resume();
  });
}

/** The token every authenticated command uses, and where it came from. */
export async function activeToken(origin: string, stdin: boolean): Promise<{ token: string; source: TokenSource } | null> {
  const supplied = await suppliedToken(stdin);
  if (supplied) return supplied;
  const stored = await new Credentials(origin).read();
  return stored ? { token: stored, source: "stored" } : null;
}

/** A device login waiting for the person to press Allow. Kept so an agent whose
 * shell returns output only when a command exits can start the login, show the
 * code, and finish it with a second command instead of minting a new code.
 *
 * `interval` is the server's current pace, raised by every slow_down, and `nextPollAt` the
 * earliest this machine may poll again. Both are carried between commands because each
 * --continue is a new process: one that started from the original interval polled early,
 * the server answered slow_down and stretched the pace, and on 11 Nov 2026 a login the
 * person had allowed was paced past its own expiry and never collected. Files written
 * before then have no `nextPollAt`, which reads as "poll after one interval", as before. */
export interface PendingLogin { origin: string; deviceCode: string; userCode: string; url: string; expiresAt: string; interval: number; deviceName: string; nextPollAt?: string }

export class PendingLogins {
  readonly file: string;
  constructor(readonly origin: string, directory?: string) {
    this.file = join(configDirectory(directory), "login-pending.json");
  }
  async read(): Promise<PendingLogin | null> {
    let handle;
    try {
      handle = await open(this.file, constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > LIMITS.platform.credentials.fileBytesMax || (process.platform !== "win32" && (stat.mode & 0o077))) return null;
      const all = JSON.parse(await handle.readFile("utf8")) as Record<string, PendingLogin>;
      const value = all?.[this.origin];
      if (!value || typeof value.deviceCode !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value.deviceCode) || typeof value.userCode !== "string" ||
        typeof value.url !== "string" || !value.url.startsWith(this.origin + "/cli?code=") || !Number.isFinite(Date.parse(value.expiresAt)) ||
        !Number.isFinite(value.interval) || value.interval < LIMITS.platform.device.pollIntervalSeconds) return null;
      if (!(Date.parse(value.expiresAt) > Date.now())) return null;
      // A pace that cannot be read is dropped rather than losing the login: it only ever
      // makes the next poll wait, and the server still paces whatever arrives.
      if (value.nextPollAt !== undefined && (typeof value.nextPollAt !== "string" || !Number.isFinite(Date.parse(value.nextPollAt)))) {
        const rest = { ...value };
        delete rest.nextPollAt;
        return rest;
      }
      return value;
    } catch { return null; }
    finally { await handle?.close(); }
  }
  async save(value: PendingLogin | null) {
    await this.update((all) => { if (value) all[this.origin] = value; else delete all[this.origin]; return true; });
  }
  /** Records the server's pace for the login still saved here, and only for that one. Two
   * `--continue` processes can poll the same code: when one collects the token it clears
   * this entry, and the other's pace, saved from an answer it had before that, used to write
   * the entry back, so the next `--continue` reported an expired code to somebody signed in.
   * Returns whether anything was written. */
  async pace(deviceCode: string, interval: number, nextPollAt: string) {
    let written = false;
    await this.update((all) => {
      const entry = all[this.origin];
      if (!entry || entry.deviceCode !== deviceCode) return false;
      all[this.origin] = { ...entry, interval, nextPollAt };
      return (written = true);
    });
    return written;
  }
  /* Read, change and replace the whole file. The read is as late as it can be, just before
     the write, so the window in which another process's change is lost is the replace itself;
     there is no lock, because a lost pace only makes one poll early and the server paces it. */
  private async update(change: (all: Record<string, PendingLogin>) => boolean) {
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
    let all: Record<string, PendingLogin> = {};
    try { all = JSON.parse(await readFile(this.file, "utf8")) ?? {}; } catch { /* A missing or unreadable file starts empty. */ }
    if (!all || typeof all !== "object" || Array.isArray(all)) all = {};
    if (!change(all)) return;
    for (const [origin, entry] of Object.entries(all)) if (!(Date.parse(entry?.expiresAt) > Date.now())) delete all[origin];
    const temp = this.file + "." + randomBytes(8).toString("hex");
    try {
      const handle = await open(temp, "wx", 0o600);
      try { await handle.writeFile(JSON.stringify(all)); await handle.sync(); } finally { await handle.close(); }
      await replaceFile(temp, this.file);
    } finally { await unlink(temp).catch(() => {}); }
  }
}
