/**
 * The CLI under every Node a creator or an agent is likely to have.
 *
 *   cd packages/cli && npm run test:matrix            # 18.17.0, 18, 20, 22 and 24
 *   npm run test:matrix -- 18 24                      # just those
 *
 * package.json promises Node 18.17 or later, and nothing else checked it: the bundle is
 * built for node18 by esbuild, which lowers syntax but not APIs, so one call to something
 * Node 20 added would pass every suite here, which runs on 22, and fail on the first
 * machine with 18. This runs the two suites that drive the built binary the way other
 * programs run it (agent-shells and environments) under each Node in turn: the binary
 * they spawn AND the test runner itself, because environments also calls the CLI's
 * source in-process (Windows paths, byte-order marks, older manifests, name composition)
 * and those cases ran only on the current Node until 5 Oct 2026, while the summary said
 * the suite passed under all five. One suite per invocation, in order: Node 18 has no
 * --test-concurrency, and the two side by side starve each other's spawned CLIs.
 *
 * Each Node comes from the `node` package on npm (`npx -p node@18`), so no version
 * manager is needed and nothing is installed globally. The first run downloads about
 * 40 MB per version into the npx cache.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("..", import.meta.url));
// 18.17.0 is the floor package.json engines names; 18 alone resolves to the newest 18.
const versions = process.argv.slice(2).length ? process.argv.slice(2) : ["18.17.0", "18", "20", "22", "24"];
const suites = ["tests/agent-shells.test.ts", "tests/environments.test.ts"];

execFileSync("npm", ["run", "build"], { cwd: here, stdio: "ignore" });
const results = [];
for (const version of versions) {
  let binary;
  try {
    binary = execFileSync("npx", ["-y", "-p", `node@${version}`, "--", "node", "-p", "process.execPath"], { encoding: "utf8" }).trim();
  } catch {
    results.push({ version, ok: false, detail: "could not fetch this Node with npx -p node@" + version });
    continue;
  }
  const actual = execFileSync(binary, ["--version"], { encoding: "utf8" }).trim();
  // --import arrived in 18.19; before it tsx loads through --loader.
  const [major, minor] = actual.slice(1).split(".").map(Number);
  const loader = major === 18 && minor < 19 ? ["--loader", "tsx"] : ["--import", "tsx"];
  let pass = 0, fail = 0, ok = true;
  const failed = [];
  for (const suite of suites) {
    // TAP pinned: from Node 23 the default reporter is spec even into a pipe, and this
    // reads TAP's counts. The flag exists from 18.15.
    const run = spawnSync(binary, [...loader, "--test", "--test-reporter=tap", suite], { cwd: here, env: { ...process.env, OPENGAME_TEST_NODE: binary }, encoding: "utf8" });
    const counted = /# pass (\d+)/.exec(run.stdout);
    if (!counted) failed.push(`${suite} did not run: ${(run.stderr || run.stdout).trim().split("\n").slice(-3).join(" ")}`);
    pass += Number(counted?.[1] ?? 0); fail += Number(/# fail (\d+)/.exec(run.stdout)?.[1] ?? 0);
    failed.push(...[...run.stdout.matchAll(/^not ok \d+ - (.+)$/gm)].map(match => match[1]));
    ok &&= run.status === 0 && Boolean(counted);
  }
  results.push({ version: actual, ok, detail: `${pass} pass, ${fail} fail${failed.length ? `: ${failed.join("; ")}` : ""}` });
  console.log(`${actual}: ${results.at(-1).detail}`);
}
const bad = results.filter(result => !result.ok);
if (bad.length) { for (const result of bad) console.error(`Node ${result.version}: ${result.detail}`); process.exit(1); }
console.log(`The CLI passed on ${results.map(result => result.version).join(", ")}.`);
