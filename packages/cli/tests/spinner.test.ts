import test from "node:test";
import assert from "node:assert/strict";
import spinners from "cli-spinners";
import type { RepairFinding } from "@opengame/protocol";
import { Output, questionAnswered, questionGap, releaseTerminal, stepsLeft, wrapLine } from "../src/output";
import { answered } from "../src/prompt";
import { CLOCK_AFTER_MS, ROTATE_AFTER_MS, ROTATE_EVERY_MS, SPINNER, spinnerFrame, stageText } from "../src/spinner";

const visible = (text: string) => text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
/** What a terminal shows: each line as it stands after its last carriage return. */
const rendered = (text: string) => visible(text).split("\n").map(line => line.slice(line.lastIndexOf("\r") + 1));
const DOTS = new RegExp(`[${spinners.dots.frames.join("")}]`);

/** A rich Output with no face (nothing calls begin), so the spinner runs on its own line,
 * as it does in a terminal too small for the corner. Everything it writes, through every
 * stream, lands in one log in the order a terminal would show it. */
function screen() {
  let log = "";
  const output = new Output(false, line => { log += `${line}\n`; }, line => { log += `${line}\n`; }, "rich", text => { log += text; });
  return { output, read: () => log };
}

/** Runs `body` as if stdout were a terminal `columns` wide, which is the only place the
 * output wraps: a pipe has no width, and a log broken at an imagined 80 is harder to search. */
function asTerminal<T>(columns: number, body: () => T): T {
  const was = { isTTY: process.stdout.isTTY, columns: process.stdout.columns };
  Object.assign(process.stdout, { isTTY: true, columns });
  try { return body(); } finally { Object.assign(process.stdout, was); }
}

const listeners = () => ["exit", "SIGINT", "SIGTERM", "SIGHUP"].map(name => process.listenerCount(name));

const finding = (over: Partial<RepairFinding> = {}): RepairFinding => ({ release: null, check: "build", checkVersion: "1", state: "failed",
  certainty: "certain", fault: "game", evidence: { observed: "The build command exited with code 1. Its output is above.", file: "opengame.json" },
  fix: "Fix the error the build printed, then run npm run build until it succeeds.", verify: "npm run build, then opengame deploy", retry: "after-fix", ...over });

test("the spinner's frames are cli-spinners' dots, at its own pace", () => {
  assert.deepEqual(SPINNER.frames, spinners.dots.frames);
  assert.equal(spinnerFrame(0), spinners.dots.frames[0]);
  assert.equal(spinnerFrame(SPINNER.interval), spinners.dots.frames[1]);
  assert.equal(spinnerFrame(SPINNER.interval * spinners.dots.frames.length), spinners.dots.frames[0]);
});

test("a long stage takes turns with its other true lines, and an unknown stage keeps its own words", () => {
  assert.equal(stageText("check", "Checking and packaging your game", 0), "Checking and packaging your game");
  assert.equal(stageText("check", "Checking and packaging your game", ROTATE_AFTER_MS - 1), "Checking and packaging your game");
  const seen = new Set<string>();
  for (let at = ROTATE_AFTER_MS; at < ROTATE_AFTER_MS + ROTATE_EVERY_MS * 6; at += ROTATE_EVERY_MS) seen.add(stageText("check", "Checking and packaging your game", at));
  assert.ok(seen.has("Reading every file in your export") && seen.has("Running the local checks on each file") && seen.has("Checking and packaging your game"), [...seen].join(" | "));
  // The server names its own check stages; a stage the table does not know is never dressed up.
  for (const at of [0, 10_000, 60_000]) assert.equal(stageText("images", "Reviewing the images in your build", at), "Reviewing the images in your build");
  assert.equal(stageText(undefined, "Working", 60_000), "Working");
  assert.ok(CLOCK_AFTER_MS >= 4000 && CLOCK_AFTER_MS <= 6000);
});

test("--json, --jsonl and plain output never draw a spinner or touch the cursor", () => {
  for (const mode of ["json", "jsonl", false] as const) {
    const lines: string[] = []; const raw: string[] = [];
    const before = listeners();
    const output = new Output(mode, line => lines.push(line), line => lines.push(line), mode === false ? "plain" : undefined, text => raw.push(text));
    output.emit({ type: "progress", stage: "check", message: "Checking and packaging your game" });
    output.emit({ type: "progress", stage: "upload", message: "Sending archive: 5 of 10 bytes", bytes: 5, total: 10 });
    output.emit({ type: "result", command: "check", data: { message: "Done." } });
    output.finish();
    assert.deepEqual(raw, [], `${mode}: wrote to the terminal directly`);
    assert.ok(!lines.join("\n").includes("\x1b"), `${mode}: an escape code reached the output`);
    assert.ok(!DOTS.test(lines.join("\n")), `${mode}: a spinner frame reached the output`);
    assert.deepEqual(listeners(), before, `${mode}: left a listener behind`);
    if (mode === "jsonl") for (const line of lines) assert.doesNotThrow(() => JSON.parse(line));
    if (mode === "json") assert.equal(lines.length, 1);
  }
});

test("a running spinner clears its line and shows the cursor before anything else is written", () => {
  const { output, read } = screen();
  const before = listeners();
  output.emit({ type: "progress", stage: "check", message: "Checking and packaging your game" });
  const running = read();
  assert.ok(running.includes("\x1b[?25l"), "the cursor was not hidden while the spinner ran");
  assert.match(visible(running), DOTS);
  assert.notDeepEqual(listeners(), before, "nothing gives the cursor back if the process ends here");
  output.emit({ type: "notice", code: "n", message: "Excluded from upload: notes.txt" });
  const text = read();
  const notice = text.indexOf("Excluded from upload");
  const cleared = text.lastIndexOf("\r\x1b[2K", notice);
  const shown = text.lastIndexOf("\x1b[?25h", notice);
  const hidden = text.lastIndexOf("\x1b[?25l");
  assert.ok(cleared > hidden && shown > hidden, "the notice was written over a live spinner line");
  // The tick takes the spinner's place, on a line of its own, before the notice.
  assert.match(visible(text.slice(0, notice)), /✓ Checking and packaging your game \d+\.\ds\n$/);
  assert.deepEqual(listeners(), before, "the spinner's exit and signal listeners outlived it");
  output.finish();
});

test("an error, a question and a child process each get a clean line, and the cursor back", async () => {
  for (const takeover of ["error", "question", "child"] as const) {
    const { output, read } = screen();
    output.emit({ type: "progress", stage: "build", message: "Running build command: npm run build" });
    if (takeover === "error") output.emit({ type: "error", code: "x", message: "The build command failed.", exitCode: 1 });
    else if (takeover === "question") releaseTerminal();
    else output.yieldTerminal();
    const text = read();
    const last = text.slice(text.lastIndexOf("\x1b[?25"));
    assert.ok(last.startsWith("\x1b[?25h"), `${takeover}: the cursor was left hidden`);
    assert.ok(text.lastIndexOf("\r\x1b[2K") > text.lastIndexOf("\x1b[?25l"), `${takeover}: the spinner line was not cleared`);
    // Nothing repaints once the terminal is somebody else's.
    const after = text.length;
    await new Promise(resolve => setTimeout(resolve, SPINNER.interval * 3));
    assert.equal(read().length, after, `${takeover}: the spinner kept painting`);
    await output.settled();
    output.finish();
  }
});

test("a byte count keeps one line, and finishing leaves no spinner and the cursor shown", () => {
  const { output, read } = screen();
  for (const sent of [0, 4, 8]) output.emit({ type: "progress", stage: "upload", message: `Sending archive: ${sent} of 8 bytes`, bytes: sent, total: 8 });
  output.finish();
  const text = read();
  // Nothing of the spinner is left on its line, and the last word on the cursor is "show".
  assert.equal(visible(text.slice(text.lastIndexOf("\r"))), "\r", JSON.stringify(text.slice(-40)));
  assert.ok(text.slice(text.lastIndexOf("\x1b[?25")).startsWith("\x1b[?25h"));
  assert.equal(text.match(/\x1b\[\?25l/g)?.length, 1, "the cursor was hidden more than once for one stage");
  assert.equal(text.match(/\x1b\[\?25h/g)?.length, 1);
});

test("answered questions stack flush left, and what follows them starts after one blank line", () => {
  const { output, read } = screen();
  assert.equal(questionGap(), "\n", "the first question does not open with a blank line under the command");
  // The prompts write to the terminal themselves; the answered lines are all a test can see of them.
  assert.equal(visible(answered("Which genre fits best?", "Shooter & survival")), "Which genre fits best?  Shooter & survival");
  questionAnswered();
  assert.equal(questionGap(), "", "a blank line between one answered question and the next");
  output.emit({ type: "result", command: "init", data: { message: "Created opengame.json.\nNext: opengame check . --build" } });
  assert.deepEqual(visible(read()).split("\n"), ["", "Created opengame.json.", "Next: opengame check . --build", ""]);
});

test("work started by the answers runs under one blank line, and its summary after another", () => {
  const { output, read } = screen();
  questionAnswered();
  output.emit({ type: "progress", stage: "init:project", message: "Looking at your project" });
  output.emit({ type: "result", command: "init", data: { message: "Created opengame.json." } });
  const lines = rendered(read());
  assert.equal(lines[0], "");
  assert.match(lines[1]!, /^✓ Looking at your project \d+\.\ds$/);
  assert.deepEqual(lines.slice(2), ["", "Created opengame.json.", ""]);
});

test("a failed build's findings sit apart from its output, and ask for each step once", () => asTerminal(80, () => {
  const { output, read } = screen();
  output.emit({ type: "progress", stage: "build", message: "Running build command: npm run build" });
  output.yieldTerminal();
  output.emit({ type: "finding", finding: finding() });
  output.emit({ type: "error", code: "build_failed", message: "The build command failed. Its output is above.", exitCode: 1 });
  const text = visible(read());
  const lines = text.slice(text.indexOf("› Running build command")).split("\n");
  assert.deepEqual(lines, [
    "› Running build command: npm run build",
    "",
    "opengame.json",
    "  Blocker: The build command exited with code 1. Its output is above.",
    // Wrapped inside 80 columns, under the fix rather than in column one.
    "  Fix: Fix the error the build printed, then run npm run build until it",
    "    succeeds.",
    "",
    // The fix already says to run the build, so only the step after it is left.
    "Then run opengame deploy.",
    "",
    "× The build command failed. Its output is above.",
    "",
  ]);
  output.finish();
}));

test("an error's next command is a labelled suggestion under it, unless the message already gives it", () => {
  const { output, read } = screen();
  output.emit({ type: "error", code: "dependencies_missing", message: "Dependencies are not installed.", exitCode: 1, next: "npm install" });
  assert.deepEqual(visible(read()).split("\n"), ["", "× Dependencies are not installed.", "  Try: npm install", ""]);
  const plain: string[] = [];
  const quiet = new Output(false, () => {}, line => plain.push(line), "plain", () => {});
  quiet.emit({ type: "error", code: "dependencies_missing", message: "Dependencies are not installed.", exitCode: 1, next: "npm install" });
  quiet.emit({ type: "error", code: "x", message: "Run npm install, then retry.", exitCode: 1, next: "npm install" });
  assert.deepEqual(plain, ["Dependencies are not installed.", "Try: npm install", "Run npm install, then retry."]);
});

test("the steps a fix already asked for are not asked for again", () => {
  assert.deepEqual(stepsLeft("npm run build, then opengame deploy", "Fix the error the build printed, then run npm run build until it succeeds."), ["opengame deploy"]);
  assert.deepEqual(stepsLeft("npm ci, then opengame deploy", "Fix the error npm ci printed, then run opengame deploy again."), []);
  assert.deepEqual(stepsLeft("opengame check, then opengame deploy", "Delete it, then rotate it."), ["opengame check", "opengame deploy"]);
});

test("output with no terminal width is never wrapped, so a log keeps each message on one line", () => {
  const long = "This is CLI 0.9.0 and the server needs 99.0.0 or newer. Run opengame upgrade; if you are signed out, run opengame login first.";
  const was = { isTTY: process.stdout.isTTY, columns: process.stdout.columns };
  Object.assign(process.stdout, { isTTY: false, columns: undefined });
  try {
    const { output, read } = screen();
    output.emit({ type: "error", code: "upgrade_required", message: long, exitCode: 6 });
    assert.ok(visible(read()).includes(long));
  } finally { Object.assign(process.stdout, was); }
});

test("a long line wraps at a space inside 80 columns, under its own indent, with a URL kept whole", () => {
  const fix = "  Fix: Make npm run build finish within 10 minutes, or build first and set build.output in opengame.json to the folder it writes.";
  const rows = wrapLine(fix, 80);
  assert.ok(rows.length > 1);
  for (const row of rows) assert.ok(row.length <= 79, row);
  for (const row of rows.slice(1)) assert.match(row, /^ {4}\S/);
  assert.equal(rows.join(" ").replace(/\s+/g, " ").trim(), fix.trim());
  const url = `Guide: https://docs.opengame.io/engines/${"x".repeat(90)}`;
  assert.ok(wrapLine(url, 80).some(row => row.trim().startsWith("https://")));
  assert.deepEqual(wrapLine("Created opengame.json.", 80), ["Created opengame.json."]);
});
