import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ERRORS } from "@opengame/protocol";
import { agentMode, richTerminal } from "../src/output";
import { cleanEnv, events, fakeApi, reply, spawnCli, tempDir, token } from "./shell";
import { RUNS, help, project, releaseId, sweep } from "./agent-shells-sweep";

/**
 * The CLI as an agent's shell runs it: stdin a pipe nobody closes, no terminal, output
 * read only when the process exits (Claude Code, Codex, Cursor and OpenCode all work this
 * way for at least some commands). In that shell a prompt, a read of stdin or a wait on a
 * person is not slow, it is a hang the agent cannot see the reason for. So every command
 * the help lists is run here, and the test fails on the first one that does not come back.
 *
 * The sweep under each agent's own markers is agent-shells-agents-*.test.ts, and login and
 * --token-stdin are agent-shells-login.test.ts and agent-shells-token.test.ts.
 */

test("every command in the help is exercised by the agent-shell sweep", async () => {
  const listed = Object.keys((await help()).commands).sort();
  assert.deepEqual(Object.keys(RUNS).sort(), listed, "add the new command to RUNS so an agent shell is shown not to hang on it");
});

test("no command waits on an open stdin, with --json, when the shell has no terminal", async () => {
  assert.deepEqual(await sweep("json"), []);
});

test("no command waits on an open stdin in plain output either, and none of it is styled", async () => {
  assert.deepEqual(await sweep("plain"), []);
});

test("agent mode is read from every agent's own marker, and CI=false is not CI", () => {
  for (const marker of ["CLAUDECODE", "CODEX_SANDBOX", "CODEX_THREAD_ID", "CURSOR_AGENT", "OPENCODE", "AI_AGENT", "CI"]) {
    assert.equal(agentMode({ [marker]: "1" }, true), true, marker);
    assert.equal(richTerminal({ [marker]: "1" }, true), false, marker);
  }
  for (const value of ["false", "0", ""]) assert.equal(agentMode({ CI: value }, true), false, `CI=${value}`);
  assert.equal(agentMode({}, true), false);
  assert.equal(agentMode({}, false), true);
});

test("every prompt a person can be asked has a flag, and an agent is told which", async () => {
  const jam = { slug: "fixture-jam", name: "Fixture jam", state: "open", acceptingEntries: true, startsAt: null, endsAt: null,
    rulesUrl: "https://opengame.io/rules", tracks: [{ key: "rpg", name: "RPG", kind: "theme" }] };
  const form = { formVersion: 1, jam: { ...jam, entriesPerCreator: 3, termsVersion: "2026-09-27" },
    track: { flag: "--track", label: "Genre track", options: [{ value: "rpg", label: "RPG" }] },
    models: { flag: "--models", label: "Models used", min: 1, options: [{ value: "claude", label: "Claude", provider: "Anthropic" }] },
    sponsors: { flag: "--sponsor", label: "Sponsor tracks", options: [] }, evidence: { flagPrefix: "--evidence-", label: "What it did" } };
  const api = await fakeApi((req, res) => {
    if (req.url === "/api/v1/jams") return reply(res, 200, { jams: [jam], submissionDestination: { kind: "jam", slug: jam.slug, name: jam.name } });
    if (req.url === "/api/v1/jams/fixture-jam/form") return reply(res, 200, { form });
    if (req.url?.startsWith("/api/v1/games")) return reply(res, 200, { games: [], nextCursor: null });
  });
  const root = await project();
  const config = await tempDir("og-shell-prompts-");
  try {
    const env = cleanEnv({ OPENGAME_API_URL: api.origin, NO_PROXY: "127.0.0.1", OPENGAME_TOKEN: token, XDG_CONFIG_HOME: config.dir });
    const asks: [string[], string, RegExp][] = [
      [["submit", root.dir], "release_required", /--release/],
      [["submit", root.dir, "--release", releaseId], "jam_answers_required", /--track[\s\S]*--models/],
      [["submit", root.dir, "--release", releaseId, "--jam", "fixture-jam"], "jam_answers_required", /--track[\s\S]*--models/],
      [["link", root.dir], "game_required", /--game/],
      [["open", root.dir], "not_linked", /opengame open --game/],
    ];
    for (const [args, code, flag] of asks) {
      // Under a real terminal too, with CI set: CI has no person at the keyboard either.
      for (const tty of [false, true]) {
        const run = await spawnCli([...args, "--jsonl"], { env: tty ? { ...env, CI: "1" } : env, stdin: "open", tty, deadlineMs: 15_000 });
        assert.equal(run.hung, false, `${args.join(" ")} waited for an answer`);
        const last = events(run.stdout).at(-1)!;
        assert.equal(last.code, code, `${args.join(" ")}: ${run.stdout}`);
        assert.equal(run.code, 2);
        assert.match(String(last.message), flag);
      }
    }
  } finally { await api.close(); await root.remove(); await config.remove(); }
});

test("help --json describes every command, flag, exit code and environment variable the CLI uses", async () => {
  const schema = await help();
  for (const [name, spec] of Object.entries(schema.commands)) {
    assert.ok(spec.description.length > 10, `${name} has no description`);
    assert.ok(spec.flags.some(flag => flag.name === "--jsonl"), `${name} has no --json`);
    for (const flag of spec.flags) {
      assert.match(flag.name, /^--[a-z][a-z0-9<>-]*$/, `${name} ${flag.name}`);
      assert.ok(flag.type === "boolean" || flag.type === "string", `${name} ${flag.name} type`);
      assert.ok(flag.description.length > 10, `${name} ${flag.name} has no description`);
    }
    const one = events((await spawnCli([name, "--help", "--jsonl"], { stdin: "closed" })).stdout);
    assert.equal(one.length, 1, `${name} --help --json prints one line`);
    assert.equal((one[0]!.data as { command: string }).command, name);
  }
  assert.deepEqual(schema.exitCodes.map(row => row.code), [0, 1, 2, 3, 4, 5, 6, 7]);

  const source = fileURLToPath(new URL("../src/", import.meta.url));
  const files = (await readdir(source)).filter(file => file.endsWith(".ts"));
  const text = (await Promise.all(files.map(file => readFile(join(source, file), "utf8")))).join("\n");

  // Every environment variable the CLI reads is either documented or one of the agent
  // markers the help's agentMode sentence names.
  const read = new Set([...text.matchAll(/(?:process\.)?env(?:\?)?\.([A-Z][A-Z0-9_]+)/g)].map(match => match[1]!)
    .concat([...text.matchAll(/\[\s*((?:"[A-Z][A-Z0-9_]+",?\s*)+)\]/g)].flatMap(match => [...match[1]!.matchAll(/"([A-Z][A-Z0-9_]+)"/g)].map(m => m[1]!))
      .filter(name => /^(CI|CLAUDECODE|CODEX_|CURSOR_|OPENCODE|AI_AGENT)/.test(name))));
  const documented = new Set(schema.env.map(row => row.name));
  // Read by the CLI and kept out of the public list on purpose: help --json feeds the docs,
  // and this one exists only for this package's tests (cli.ts, beside ENV, says why). Any
  // other test-only variable belongs in tests/, not in src/.
  const testOnly = ["OPENGAME_TEST_SKIP_LAUNCH_CHECK"];
  for (const name of testOnly) {
    assert.ok(read.has(name), `${name} is no longer read; drop it from testOnly`);
    assert.ok(!schema.env.some(row => JSON.stringify(row).includes(name)) && !JSON.stringify(schema).includes(name), `${name} is test-only and must not appear in help --json`);
  }
  for (const name of read) {
    if (["HOME", "PATH", "USERPROFILE", "APPDATA"].includes(name) || testOnly.includes(name)) continue;
    assert.ok(documented.has(name) || schema.agentMode.includes(name) || [...documented].some(row => row.includes(name)) ||
      schema.env.some(row => JSON.stringify(row).includes(name)), `the CLI reads ${name} and help --json does not mention it`);
  }

  // Every code the CLI throws has its own row in the shared table, so its exit code and
  // retry advice are a decision rather than the fallback for codes nobody listed.
  const thrown = new Set([...text.matchAll(/new CliError\(\s*"([a-z][a-z0-9_]*)"/g)].map(match => match[1]!));
  const missing = [...thrown].filter(code => !Object.hasOwn(ERRORS, code)).sort();
  assert.deepEqual(missing, [], "add these codes to ERRORS in packages/protocol/src/errors.ts");

  // A sentence that tells an agent to use a flag only works if the flag exists.
  const flags = new Set(Object.values(schema.commands).flatMap(spec => spec.flags.map(flag => flag.name)).concat(["--help", "--version"]));
  const named = new Set([...text.matchAll(/(?<![\w-])--([a-z][a-z0-9-]+)/g)].map(match => `--${match[1]}`));
  // These options belong to npm, Node and engine build tools, not OpenGame's
  // command parser. Keep the exception list explicit so misspelled product
  // flags still fail this guard.
  const externalFlags = new Set(["--save-dev", "--registry", "--ignore-scripts", "--no-audit", "--no-fund",
    "--input-type", "--conditions", "--import", "--test", "--headless", "--export-release", "--release", "--no-web-resources-cdn", "--web-resources-cdn",
    // `vite build` flags read from a build script by build-output.ts. The match above
    // stops at a capital, so --outDir, --assetsDir and --logLevel appear truncated.
    "--assets", "--base", "--config", "--filter", "--log", "--mode", "--out", "--root", "--target",
    // The locked installs deploy runs before a build (deploy.ts, installDependencies), and
    // parcel's output folder, read from a build script by build-output.ts.
    "--frozen-lockfile", "--immutable", "--dist-dir"]);
  const unknown = [...named].filter(flag => !flags.has(flag) && !/^--evidence-/.test(flag) && !externalFlags.has(flag)).sort();
  assert.deepEqual(unknown, [], "the source names flags that no command accepts");
});
