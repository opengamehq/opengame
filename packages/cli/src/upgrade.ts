import { execFile, spawn } from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, isAbsolute } from "node:path";
import { promisify } from "node:util";
import { CLI_PACKAGE_PATTERN as PACKAGE } from "@opengame/protocol";
import { readBootstrap } from "./bootstrap";
import { Api } from "./http";
import { activeToken } from "./credentials";
import { CliError, Output, terminalText, agentMode } from "./output";
import { confirm } from "./prompt";
import { CLI_REGISTRY, REGISTRY_RELEASE, downloadRegistryRelease } from "./registry-release";
import { CLI_VERSION, olderThan } from "./version";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

/** True when this file runs from npm's global prefix, which is the one install
 * `upgrade` may replace by itself. A project install belongs to its lockfile. */
async function globalInstall(): Promise<boolean> {
  try {
    const { stdout } = await promisify(execFile)(npm, ["root", "-g"], { timeout: 15_000, shell: process.platform === "win32" });
    const root = await realpath(stdout.trim());
    const location = relative(root, await realpath(process.argv[1] ?? ""));
    return location !== ".." && !location.startsWith(".." + (process.platform === "win32" ? "\\" : "/")) && !isAbsolute(location);
  } catch { return false; }
}

export async function upgradeCommand(flags: Record<string, string | boolean>, output: Output) {
  const api = new Api();
  try {
    const active = await activeToken(api.origin, false).catch(() => null);
    if (active) api.tokenSource = active.source;
    const info = await readBootstrap(api, active?.token, "cli", true);
    const minimum = typeof info.minimumCliVersion === "string" && /^\d+\.\d+\.\d+$/.test(info.minimumCliVersion) ? info.minimumCliVersion : null;
    const spec = typeof info.package === "string" && PACKAGE.test(info.package) ? info.package : null;
    const behind = minimum !== null && olderThan(CLI_VERSION, minimum);
    const base = { current: CLI_VERSION, minimum, behind, package: spec };
    if (!spec) {
      /* Signed out, the package is not shown, and signing in works on any version (the
         sign-in answers carry no minimum), so login is the next step rather than asking
         the team: the old sentence sent a person between this and login's exit 6. */
      output.emit({ type: "result", command: "upgrade", data: { ...base, upgraded: false, command: null, next: active ? null : "opengame login",
        message: `This is CLI ${CLI_VERSION}.${behind ? ` The server needs ${minimum} or newer.` : ""} ${active
          ? "This server did not name a CLI package to install. Write to team@opengame.io for the current release."
          : "Run opengame login, which works on this version, then opengame upgrade again to install the current package."}` } });
      return;
    }
    // Legacy private deployments still advertise tarballs. They are not an updater
    // trust root: even a same-origin URL can serve a different npm package.
    if (!REGISTRY_RELEASE.test(spec)) throw new CliError("upgrade_untrusted", "OpenGame named a package that is not an npm release of the CLI, so nothing was installed. Write to team@opengame.io for the current release.", 5);
    /* The server names the version to install, and nothing stopped that being an older
       one. A downgrade is how a fixed CLI goes back to carrying the defect, whether the
       server was compromised, misconfigured or rolled back by mistake, so it takes a
       person saying so. Equal versions reinstall, which is harmless. */
    const target = spec.slice(spec.lastIndexOf("@") + 1);
    /* A person at a terminal, not an agent that read the flag out of the sentence below.
       The same test the install prompt uses: agentMode() is false only on a TTY with no
       agent marker, or with --human, and stdin has to be a terminal for anybody to be
       answering. Refused before the npm line is built, so an agent is not handed the
       downgrade command to run itself. */
    const person = !output.json && !agentMode() && process.stdin.isTTY === true;
    if (olderThan(target, CLI_VERSION) && flags["allow-downgrade"] === true && !person) {
      throw new CliError("upgrade_untrusted", `This is CLI ${CLI_VERSION} and the server offers ${target}, which is older. --allow-downgrade is for a person at a terminal, so nothing was installed and no install command is shown. Run it yourself in an interactive shell.`, undefined, { retry: "never" });
    }
    if (olderThan(target, CLI_VERSION) && flags["allow-downgrade"] !== true) {
      // upgrade_untrusted rather than a code of its own: like a private tarball, it is a
      // server-chosen install the CLI will not make on the server's word alone. No `next`
      // and retry "never", so an agent is not handed the bypass as its next step; the flag
      // is in the sentence, for the person who decides.
      throw new CliError("upgrade_untrusted", `This is CLI ${CLI_VERSION} and the server offers ${target}, which is older. Nothing was installed. If you meant to go back to ${target}, run opengame upgrade --allow-downgrade yourself.`, undefined, { retry: "never" });
    }
    const global = await globalInstall();
    const args = ["install", global ? "-g" : "--save-dev", spec, `--registry=${CLI_REGISTRY}`, "--ignore-scripts"];
    const line = `npm ${args.join(" ")}`;
    if (!global || flags["dry-run"] || output.json || agentMode() || !process.stdin.isTTY || process.platform === "win32") {
      output.emit({ type: "result", command: "upgrade", data: { ...base, upgraded: false, command: line,
        message: `This is CLI ${CLI_VERSION}.${behind ? ` The server needs ${minimum} or newer.` : ""} Run ${line}${global ? "" : " in this project, or add -g if you installed the CLI globally"}.` } });
      return;
    }
    if (!await confirm(`Install ${spec} from the official npm registry?`)) {
      output.emit({ type: "result", command: "upgrade", data: { ...base, upgraded: false, command: line, message: "Cancelled. Nothing was installed." } });
      return;
    }
    output.emit({ type: "progress", stage: "upgrade", message: `Verifying ${terminalText(spec)}` });
    const bytes = await downloadRegistryRelease(spec);
    const directory = await mkdtemp(join(tmpdir(), "opengame-upgrade-"));
    try {
      const archive = join(directory, "cli.tgz");
      await writeFile(archive, bytes, { mode: 0o600, flag: "wx" });
      output.emit({ type: "progress", stage: "upgrade", message: `Installing ${terminalText(spec)}` });
      output.yieldTerminal();
      // Install precisely the bytes whose digest and package metadata were checked.
      // No shell and no lifecycle scripts; this bundled CLI has no runtime dependencies.
      const code = await new Promise<number | null>(resolve => {
        const child = spawn(npm, ["install", "-g", archive, `--registry=${CLI_REGISTRY}`, "--ignore-scripts", "--no-audit", "--no-fund"], { stdio: "inherit", shell: false, timeout: 120_000 });
        child.on("error", () => resolve(null)); child.on("close", resolve);
      });
      if (code !== 0) throw new CliError("upgrade_failed", "npm could not finish installing the CLI. Run opengame --version to check the installed version, then retry opengame upgrade.", 5);
      output.emit({ type: "result", command: "upgrade", data: { ...base, upgraded: true, command: line, message: "Upgraded. Run opengame --version to check." } });
    } finally { await rm(directory, { recursive: true, force: true }); }
  } finally { await api.close(); }
}
