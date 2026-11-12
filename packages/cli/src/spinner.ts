import spinners from "cli-spinners";
import { constants as osConstants } from "node:os";

/**
 * The spinner a person sees while a command works, and the words beside it.
 *
 * The frames are cli-spinners' "dots", at its own 80 ms, added on 11 Nov 2026
 * after `opengame init` sat silent for twenty seconds once the genre was chosen. The
 * package is a list of frames and nothing else, and it is bundled, so a cold npx start
 * pays for one JSON table.
 */
export const SPINNER: { interval: number; frames: readonly string[] } = spinners.dots;

export function spinnerFrame(elapsedMs: number): string {
  return SPINNER.frames[Math.floor(Math.max(0, elapsedMs) / SPINNER.interval) % SPINNER.frames.length]!;
}

/** The clock joins the line once a stage has run this long: long enough that a quick stage
 * never shows one, short enough that a slow one never looks frozen. */
export const CLOCK_AFTER_MS = 5000;
/** The event's own words hold this long before the line starts taking turns. */
export const ROTATE_AFTER_MS = 4000;
export const ROTATE_EVERY_MS = 3500;

/**
 * Other true things about a stage that runs long, shown in turn after the event's own words.
 *
 * Every line here has to describe what the code under that stage really does for its whole
 * run, because the line changes on a timer and not when the work does. So a line names a
 * part of the stage ("reading the files"), never a moment in it ("now uploading the last
 * file"), and a stage with no line that stays true for its whole run has none: the event's
 * words and the clock are enough. Stages are the `stage` of a progress event; a server
 * stage this table does not know shows its own message alone.
 */
const STAGE_LINES: Record<string, readonly string[]> = {
  // init.ts: engineSetup, detectBuildOutput and detectControls, which walk the project,
  // find each folder holding index.html and read the files in it.
  "init:project": ["Looking for index.html in your project", "Reading your project's files to tell which engine it uses"],
  // archive.ts inspectArchive: a snapshot of every file, then the local checks over it.
  check: ["Reading every file in your export", "Running the local checks on each file"],
  // archive.ts createArchive, after the check: the checked files zipped into one archive.
  package: ["Packing your files into one archive"],
  // The operation's own state (protocol OPERATION_STATUS), while deploy and status watch. A
  // checking operation has none: the server names the check it is on in its own words.
  queued: ["Waiting for checks to start"],
  // auth.ts finishLogin: polling until the person presses Allow access.
  approval: ["Press Allow access in your browser to finish signing in"],
};

/** What the spinner says `elapsedMs` into a stage: the event's words first, then the
 * stage's other lines in turn, coming back to the event's words each round. */
export function stageText(stage: string | undefined, message: string, elapsedMs: number): string {
  const extra = (stage && Object.hasOwn(STAGE_LINES, stage) ? STAGE_LINES[stage]! : []).filter(line => line !== message);
  if (!extra.length || elapsedMs < ROTATE_AFTER_MS) return message;
  const lines = [message, ...extra];
  return lines[(1 + Math.floor((elapsedMs - ROTATE_AFTER_MS) / ROTATE_EVERY_MS)) % lines.length]!;
}

const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

/**
 * Hide the cursor for a spinner line and promise to give it back. A hidden cursor that
 * outlives the CLI stays hidden in the person's shell, and a spinner frame left on its line
 * makes zsh mark the line as unfinished, so the line is cleared and the cursor shown on the
 * way out however the process ends: the returned release, the process exiting, or Ctrl-C.
 *
 * On a signal, a handler somebody else registered (a build passing Ctrl-C to its own
 * group) decides what happens next. With none, the process leaves with the code the
 * signal's default would have given it, as the face in the corner does (mascot.ts).
 */
export function holdCursor(write: (text: string) => void): () => void {
  let held = true;
  const release = () => {
    if (!held) return;
    held = false;
    process.removeListener("exit", onExit);
    for (const signal of SIGNALS) process.removeListener(signal, onSignal);
    write("\r\x1b[2K\x1b[?25h");
  };
  const onExit = () => release();
  const onSignal = (signal: NodeJS.Signals) => {
    release();
    if (process.listenerCount(signal) === 0) process.exit(128 + (osConstants.signals[signal] ?? 2));
  };
  write("\x1b[?25l");
  process.once("exit", onExit);
  for (const signal of SIGNALS) process.once(signal, onSignal);
  return release;
}
