import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MASCOT, parseMascot } from "@opengame/ui/mascot-art";
import { MASCOT_COLUMNS, MASCOT_LINES, MascotStage, ansi256, colorDepth, darkTerminal, stillMascot, stillTerminal, terminalLines } from "../src/mascot";
import { Output } from "../src/output";

const visible = (line: string) => line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");

test("the character is drawn MASCOT_COLUMNS across, with the terminal's own background around it", () => {
  const lines = stillMascot(DEFAULT_MASCOT, "truecolor", true);
  assert.equal(lines.length, (MASCOT_COLUMNS + 2) / 2);
  for (const line of lines) assert.equal([...visible(line)].length, MASCOT_COLUMNS);
  // Corners are sky, not painted black: a light terminal must not get a dark square.
  assert.equal(visible(lines[0]!)[0], " ");
  assert.ok(!lines.join("").includes("\x1b[48;2;0;0;0m"));
  // The default character is the white one from the avatar step, not a seeded sprite: its
  // commonest colour is a near-white body, and something dark (the eyes) sits on it.
  const colours = [...lines.join("").matchAll(/\x1b\[[34]8;2;(\d+);(\d+);(\d+)m/g)].map(m => [Number(m[1]), Number(m[2]), Number(m[3])]);
  const counts = new Map<string, number>();
  for (const c of colours) counts.set(c.join(","), (counts.get(c.join(",")) ?? 0) + 1);
  const commonest = [...counts].sort((a, b) => b[1] - a[1])[0]![0].split(",").map(Number);
  assert.ok(commonest.every(channel => channel > 200), `the body is ${commonest}, not white`);
  assert.ok(colours.some(c => c.every(channel => channel < 60)), "no eyes");
});

test("half blocks keep a cell with nothing under it on the terminal background", () => {
  const red = [255, 0, 0] as const;
  const [line] = terminalLines([[red, null, null], [null, red, null]], "truecolor");
  assert.equal(visible(line!), "▀▄ ");
  assert.ok(line!.includes("\x1b[49m"), "an unpainted half must reset the background");
  assert.ok(line!.endsWith("\x1b[0m"), "the caption beside it must not inherit a colour");
});

test("a terminal without truecolor gets the nearest of the 256", () => {
  assert.equal(ansi256([0, 0, 0]), 16);
  assert.equal(ansi256([255, 255, 255]), 231);
  assert.equal(ansi256([128, 128, 128]), 244);
  assert.equal(ansi256([255, 0, 0]), 196);
  const [line] = stillMascot(DEFAULT_MASCOT, "256", true).slice(4);
  assert.ok(!line!.includes(";2;"), "a 256-colour terminal was sent a truecolor sequence");
  assert.equal(colorDepth({ COLORTERM: "truecolor" }), "truecolor");
  assert.equal(colorDepth({ TERM_PROGRAM: "Apple_Terminal" }), "256");
});

test("light terminals are told apart only when they say so, and motion has an off switch", () => {
  assert.equal(darkTerminal({}), true);
  assert.equal(darkTerminal({ COLORFGBG: "15;0" }), true);
  assert.equal(darkTerminal({ COLORFGBG: "0;15" }), false);
  assert.equal(stillTerminal({}), false);
  assert.equal(stillTerminal({ OPENGAME_REDUCED_MOTION: "1" }), true);
  assert.equal(stillTerminal({ OPENGAME_REDUCED_MOTION: "false" }), false);
});

test("a stage hides the cursor while it moves and always gives it back", async () => {
  let written = "";
  const stage = new MascotStage({ write: text => { written += text; }, caption: () => ["Signed in as @tester."] });
  stage.start();
  assert.ok(written.includes("\x1b[?25l"));
  await stage.settle(50);
  assert.ok(written.endsWith("\x1b[?25h"), "the cursor was left hidden");
  assert.equal(process.listenerCount("SIGINT"), 0, "a finished stage still owns Ctrl-C");
  // The caption sits beside the face, on the face's middle line.
  const frames = written.split("\x1b[?2026h");
  assert.ok(frames.some(frame => visible(frame).includes("Signed in as @tester.")));
  stage.end(true);
});

test("a stage under reduced motion paints once and does not wait", async () => {
  let paints = 0;
  const stage = new MascotStage({ write: text => { if (text.includes("\x1b[?2026h")) paints++; }, caption: () => [], still: true, shuffle: true });
  stage.start();
  const started = Date.now();
  await stage.settle(5000);
  stage.end(true);
  assert.ok(Date.now() - started < 200, "a still stage waited out its animation");
  assert.ok(paints <= 2);
});

test("plain output never draws the face, and the result still names the person", async () => {
  const lines: string[] = [];
  const raw: string[] = [];
  const output = new Output(false, line => lines.push(line), () => {}, "plain", text => raw.push(text));
  output.companion();
  await output.identity("Signed in as @tester.");
  output.emit({ type: "result", command: "whoami", data: { message: "Signed in as @tester." } });
  assert.deepEqual(raw, []);
  assert.deepEqual(lines, ["Signed in as @tester."]);
});

test("a face that already says who this is is not repeated by the result under it", async () => {
  const lines: string[] = [];
  const output = new Output(false, line => lines.push(line), () => {}, "rich", () => {});
  const columns = process.stdout.columns;
  Object.defineProperty(process.stdout, "columns", { value: 100, configurable: true });
  try {
    await output.identity("Signed in as @tester.");
    output.emit({ type: "result", command: "login", data: { message: "Signed in as @tester. Run opengame login --force to sign in again, or opengame logout to sign out." } });
  } finally { Object.defineProperty(process.stdout, "columns", { value: columns, configurable: true }); }
  assert.deepEqual(lines, ["Run opengame login --force to sign in again, or opengame logout to sign out."]);
});

test("the upload bar fills in whole cells, dithers the cell being filled, and keeps its width", async () => {
  const { pixelBar, clockText } = await import("../src/output");
  const width = (fraction: number) => [...visible(pixelBar(fraction))].length;
  assert.equal(visible(pixelBar(0)), `${"░".repeat(16)}   0%`);
  assert.equal(visible(pixelBar(1)), `${"█".repeat(16)} 100%`);
  assert.equal(visible(pixelBar(0.5)), `${"█".repeat(8)}${"░".repeat(8)}  50%`);
  assert.ok(visible(pixelBar(0.53)).includes("█▒"), "the leading cell is not dithered");
  for (const fraction of [0, 0.01, 0.33, 0.5, 0.99, 1]) assert.equal(width(fraction), 21);
  assert.equal(clockText(2999), "2s");
  assert.equal(clockText(64_000), "1m 04s");
});

/* The test above sends one fixed message, and deploy does not: it sends "Sending archive:
   N of M bytes", which changes every percent. Keyed on its words, each step settled the
   spinner, so a 40 MB upload on 30 Oct 2026 left a column of "✓ Sending archive: ... 0.0s"
   lines, one per percent, where one line should have filled its bar. */
test("an upload whose byte count changes in its words keeps one line and ticks once", () => {
  let screen = "";
  const output = new Output(false, () => {}, () => {}, "rich", text => { screen += text; });
  const columns = process.stdout.columns;
  Object.defineProperty(process.stdout, "columns", { value: 100, configurable: true });
  try {
    output.begin();
    for (const sent of [0, 1048576, 2097152, 3145728, 4000000])
      output.emit({ type: "progress", stage: "upload", message: `Sending archive: ${sent} of 4000000 bytes`, bytes: sent, total: 4000000 });
    output.emit({ type: "progress", stage: "queued", message: "Queued for checks" });
    output.stop();
  } finally { Object.defineProperty(process.stdout, "columns", { value: columns, configurable: true }); }
  const ticks = visible(screen).match(/✓ Sending archive[^\n]*\n/g) ?? [];
  assert.equal(ticks.length, 1, ticks.join(""));
  assert.match(ticks[0]!, /✓ Sending archive: 4000000 of 4000000 bytes \d+\.\ds\n/);
});

test("finished stages print where the text was going, and the corner is given back", async () => {
  let screen = "";
  const output = new Output(false, () => {}, () => {}, "rich", text => { screen += text; });
  const columns = process.stdout.columns;
  Object.defineProperty(process.stdout, "columns", { value: 100, configurable: true });
  try {
    output.begin();
    output.emit({ type: "progress", stage: "check", message: "Checking and packaging your game" });
    output.emit({ type: "progress", stage: "upload", message: "Uploading your game", bytes: 5, total: 10 });
    await new Promise(resolve => setTimeout(resolve, 40));
    output.emit({ type: "progress", stage: "upload", message: "Uploading your game", bytes: 10, total: 10 });
    output.emit({ type: "progress", stage: "queued", message: "Queued for checks" });
    output.stop();
  } finally { Object.defineProperty(process.stdout, "columns", { value: columns, configurable: true }); }
  const text = visible(screen);
  assert.match(text, /✓ Checking and packaging your game \d+\.\ds\n/);
  assert.match(text, /✓ Uploading your game \d+\.\ds\n/);
  assert.match(text, /✓ Queued for checks \d+\.\ds\n/);
  // The corner is cleared on the way out: back up over the block and erase below.
  assert.ok(screen.includes(`\x1b[${MASCOT_LINES}A\r\x1b[J\x1b[?25h`), "the face was left in the corner");
  // The face sits against the right, past the text, not beside the first column.
  const frame = screen.split("\x1b[?2026h").find(part => part.includes("▀"))!;
  assert.ok(/ {20,}\x1b\[/.test(frame), "the face is not pushed to the right");
});

test("the corner draws random characters from the pools, never the same twice running", async () => {
  const { SHAPES, EYES, COLOURS, randomCharacter } = await import("../src/mascot");
  for (const shape of SHAPES) for (const eyes of EYES) for (const color of COLOURS) assert.ok(parseMascot(`${shape}.${eyes}.${color}`), `${shape}.${eyes}.${color}`);
  let previous = randomCharacter();
  const seen = new Set<string>();
  for (let n = 0; n < 200; n += 1) {
    const next = randomCharacter(previous);
    assert.notEqual(next.shape, previous.shape);
    assert.notEqual(next.color, previous.color);
    seen.add(`${next.shape}.${next.eyes}.${next.color}`);
    previous = next;
  }
  assert.ok(seen.size > 100, "the same few characters keep coming back");
  let written = "";
  let now = 0;
  const stage = new MascotStage({ write: text => { written += text; }, caption: () => [], shuffle: true, now: () => now });
  stage.start();
  const shapes = new Set<string>();
  /* A minute, not twenty seconds. The stage shuffles every 3.4 s, so twenty seconds is only
     six or seven draws from sixteen shapes, and four distinct came up by chance twice in a
     week (31 Oct and 3 Nov 2026), which the flaky ledger turns red. Eighteen draws make
     fewer than five distinct shapes a practical impossibility; the claim is unchanged. */
  for (now = 0; now < 60_000; now += 600) { (stage as unknown as { paint(force: boolean): void }).paint(true); shapes.add(stage.driver.look.shape); }
  stage.end(true);
  assert.ok(shapes.size >= 5, `only ${[...shapes].join(", ")} in a minute`);
});

test("a help row too long for the terminal wraps under its description, not under its name", async () => {
  const { hang } = await import("../src/output");
  const row = "  OPENGAME_API_URL           The OpenGame origin to talk to. Defaults to https://opengame.io. Set it when you were given a different origin.";
  const lines = hang(row, 80).split("\n");
  assert.ok(lines.length > 1);
  for (const line of lines) assert.ok(line.length <= 79, line);
  for (const line of lines.slice(1)) assert.ok(line.startsWith(" ".repeat(29)) && line[29] !== " ", `not hung under the description: ${JSON.stringify(line)}`);
  // The period stays on the origin. A wrap that breaks the URL cannot keep that
  // whole token on one line, which is what the old semicolon check was for.
  assert.ok(lines.some((line) => line.includes("https://opengame.io.")), "a URL was split");
  assert.equal(hang("  short", 80), "  short");
});

test("what a command says prints above the face, which then gives the corner back; errors too", async () => {
  let screen = "";
  const errors: string[] = [];
  const output = new Output(false, () => {}, line => { errors.push(line); }, "rich", text => { screen += text; });
  const columns = process.stdout.columns;
  Object.defineProperty(process.stdout, "columns", { value: 110, configurable: true });
  try {
    output.begin();
    output.emit({ type: "notice", code: "n", message: "Kept website changes to description." });
    output.emit({ type: "result", command: "games", data: { message: "Orb Run  private  3tzjvybpx3" } });
    await output.settled();
    output.finish();
  } finally { Object.defineProperty(process.stdout, "columns", { value: columns, configurable: true }); }
  const text = visible(screen);
  assert.ok(text.indexOf("Kept website changes") < text.indexOf("Orb Run"), "the notice and the result are out of order");
  // A face under every command stacked up in the scrollback; only login and whoami keep it.
  assert.ok(screen.endsWith(`\x1b[${MASCOT_LINES}A\r\x1b[J\x1b[?25h`), "the face was left in the corner");
  assert.deepEqual(errors, []);

  let second = "";
  const failing = new Output(false, () => {}, line => { second += `ERR:${line}\n`; }, "rich", text => { second += text; });
  Object.defineProperty(process.stdout, "columns", { value: 110, configurable: true });
  try {
    failing.begin();
    failing.emit({ type: "error", code: "x", message: "The checks are still running.", exitCode: 5 });
    await failing.settled();
  } finally { Object.defineProperty(process.stdout, "columns", { value: columns, configurable: true }); }
  // Up over the face, then the error on its own stream, then the face drawn again under it.
  assert.match(second, new RegExp(`\\x1b\\[${MASCOT_LINES}A\\r\\x1b\\[J(?:\\x1b\\[[0-9;?]*[A-Za-z])*ERR:`));
});

test("a question takes the terminal from the face, and the next stage brings it back", async () => {
  const { releaseTerminal } = await import("../src/output");
  let screen = "";
  const output = new Output(false, () => {}, () => {}, "rich", text => { screen += text; });
  const columns = process.stdout.columns;
  Object.defineProperty(process.stdout, "columns", { value: 110, configurable: true });
  try {
    output.begin();
    const before = screen.length;
    releaseTerminal();
    assert.ok(screen.slice(before).includes("\x1b[?25h"), "the cursor is still hidden for the question");
    const after = screen.length;
    output.emit({ type: "progress", stage: "certify", message: "Waiting for you to certify in the browser" });
    assert.ok(screen.slice(after).includes("\x1b[?25l"), "the face did not come back");
    output.stop();
  } finally { Object.defineProperty(process.stdout, "columns", { value: columns, configurable: true }); }
});

test("a build that takes the terminal from the face is a heading, not a finished stage", () => {
  let screen = "";
  const output = new Output(false, () => {}, () => {}, "rich", text => { screen += text; });
  const columns = process.stdout.columns;
  Object.defineProperty(process.stdout, "columns", { value: 110, configurable: true });
  try {
    output.begin();
    output.emit({ type: "progress", stage: "build", message: "Building your game" });
    output.yieldTerminal();
  } finally { Object.defineProperty(process.stdout, "columns", { value: columns, configurable: true }); }
  const text = visible(screen);
  assert.match(text, /› Building your game/);
  assert.doesNotMatch(text, /✓ Building your game/, "the build was ticked off before it ran");
  assert.ok(screen.endsWith("\x1b[?25h"));
});
