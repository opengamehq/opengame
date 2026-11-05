import { setTimeout as sleep } from "node:timers/promises";
import { stripVTControlCharacters } from "node:util";
import { flagSet } from "./env";
import { MASCOT_LINES, STAGE_COLUMNS, MascotStage, randomCharacter, stillMascot, stillTerminal } from "./mascot";
import { INVISIBLE_CONTROLS, errorExit, findingLabel, groupFindings, type CliEvent, type RepairFinding } from "@opengame/protocol";

interface ErrorExtra { retry?: RepairFinding["retry"]; retryAfterSeconds?: number; next?: string; finding?: RepairFinding }

/** The exit code comes from the protocol's one table unless a caller has a
 * reason to differ, so an agent reads the same code from every command. */
export class CliError extends Error {
  readonly exitCode: number;
  readonly retry?: RepairFinding["retry"];
  readonly retryAfterSeconds?: number;
  readonly next?: string;
  readonly finding?: RepairFinding;
  constructor(public code: string, message: string, exitCode?: number, extra: ErrorExtra = {}) {
    super(message);
    const row = errorExit(code);
    this.exitCode = exitCode ?? row.exit;
    this.retry = extra.retry ?? (exitCode === undefined || exitCode === row.exit ? row.retry : undefined);
    if (extra.retryAfterSeconds !== undefined) this.retryAfterSeconds = extra.retryAfterSeconds;
    if (extra.next !== undefined) this.next = extra.next;
    if (extra.finding !== undefined) this.finding = extra.finding;
  }
}

/**
 * The variables agents set in the shells they run commands in. Cursor's agent runs
 * commands in a real terminal, so without its marker it got the spinner and the prompts.
 * CODEX_SANDBOX is only set when Codex sandboxes the command; CODEX_THREAD_ID is set in
 * every Codex shell. AI_AGENT is the cross-tool convention Claude Code also sets.
 * Read from each tool's own code on 5 Oct 2026, except OPENCODE, which was not installed
 * here to check; a non-terminal stdout is agent mode whatever any of these say.
 */
export const AGENT_MARKERS = ["CLAUDECODE", "CODEX_SANDBOX", "CODEX_THREAD_ID", "CURSOR_AGENT", "OPENCODE", "AI_AGENT"] as const;

let human = false;
/** `--human`: a person has said they are the one at this terminal, so the agent markers
 * stop counting. A stdout that is not a terminal is still agent mode, because a prompt
 * there has nobody to answer it. */
export function preferHuman() { human = true; }

export function agentMode(env = process.env, tty = process.stdout.isTTY): boolean {
  return !tty || (!human && (flagSet(env.CI) || AGENT_MARKERS.some((key) => flagSet(env[key]))));
}

/** Colour, motion and the avatar are for a person at a terminal. Anything else
 * (a pipe, CI, an agent, NO_COLOR, a dumb terminal) gets plain lines. */
export function richTerminal(env = process.env, tty = process.stdout.isTTY): boolean {
  return !agentMode(env, tty) && env.NO_COLOR === undefined && env.TERM !== "dumb";
}

/** API titles and filenames are data, including when the terminal supports OSC.
 * Tab and newline survive (build output needs them); every other control, bidi
 * override, mark and zero-width character goes, the same set the mapper strips. */
export function terminalText(value: string): string {
  return stripVTControlCharacters(value).replace(INVISIBLE_CONTROLS, match => match.replace(/[^\t\n]/g, ""));
}

// Eight spokes, one frame per 120 ms motion step: the same spinner the product
// puts inside a button, at the same speed.
const SPOKES = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"];
const FRAME_MS = 120;
const ansi = (code: string, text: string) => `\x1b[${code}m${text}\x1b[0m`;

/** A table row too long for the terminal, wrapped at a space with the rest of its
 * description under the description, not under the name. The terminal's own wrap broke
 * "Defaults to https://opengame.io" at the dot and started the line in column one. */
export function hang(line: string, columns: number): string {
  if (line.length <= columns - 1) return line;
  const lead = /^(\s+\S+\s{2,})/.exec(line)?.[1]?.length ?? (/^(\s+)/.exec(line)?.[1]?.length ?? 0);
  const room = Math.max(20, columns - 1 - lead);
  const words = line.slice(lead).split(" ");
  const rows: string[] = [];
  let row = "";
  for (const word of words) {
    if (row && row.length + 1 + word.length > room) { rows.push(row); row = word; }
    else row = row ? `${row} ${word}` : word;
  }
  if (row) rows.push(row);
  return rows.map((text, index) => (index ? " ".repeat(lead) : line.slice(0, lead)) + text).join("\n");
}

/** The stage under way: its words, when it began, and how far its bytes have got. */
interface Live { timer: NodeJS.Timeout | null; text: string; started: number; fraction?: number; stage?: string }

/** Cut to `max` characters, for a line that must not wrap: a wrapped line throws off the
 * count of lines the corner and the spinner redraw in place. */
function clip(text: string, max: number) {
  const chars = [...text];
  return chars.length <= max ? text : chars.slice(0, Math.max(4, max - 1)).join("") + "…";
}

/** 12s, then 1m 04s: time passing, so a long wait never looks like a frozen spinner. */
export function clockText(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/**
 * Bytes on their way, as pixels: solid cells for what has gone, the logo's dither for the
 * cell being filled, and a faint dithered track for the rest. The percentage is padded so
 * the line does not shuffle as the digits change.
 */
export function pixelBar(fraction: number, cells = 16) {
  const filled = Math.max(0, Math.min(1, fraction)) * cells;
  const whole = Math.floor(filled);
  const part = filled - whole;
  const edge = whole >= cells ? "" : part >= 2 / 3 ? "▓" : part >= 1 / 3 ? "▒" : part > 0 ? "░" : "";
  const track = cells - whole - (edge ? 1 : 0);
  const percent = `${Math.floor(Math.max(0, Math.min(1, fraction)) * 100)}%`.padStart(4);
  return `${"█".repeat(whole)}${edge}${ansi("2", "░".repeat(track))} ${percent}`;
}

const LABEL_COLOR = { "Blocker": "31", "Check with a person": "33", "Waiting on us": "36", "Stopped on our side": "36", "Worth a look": "2" } as const;
function label(finding: RepairFinding, ended: boolean): { text: string; color: string } {
  const text = findingLabel(finding, { ended });
  return { text, color: LABEL_COLOR[text] };
}

/** The Output whose face is in the corner, so code that takes the terminal for itself (a
 * question, a child process) can have it back first. */
let corner: Output | null = null;
export function releaseTerminal() { corner?.stop(); }

export class Output {
  readonly style: "json" | "rich" | "plain";
  readonly json: boolean;
  private readonly stream: boolean;
  private omittedResults = 0;
  private notices: Extract<CliEvent, { type: "notice" }>[] = [];
  private findings: RepairFinding[] = [];
  private ended = false;
  private spinner: Live | null = null;
  constructor(mode: boolean | "json" | "jsonl", private write = (line: string) => process.stdout.write(line + "\n"),
    private writeError = (line: string) => process.stderr.write(line + "\n"),
    style?: "rich" | "plain", private raw = (text: string) => process.stdout.write(text)) {
    this.json = mode === true || mode === "json" || mode === "jsonl";
    this.stream = mode === true || mode === "jsonl";
    this.style = this.json ? "json" : style ?? (richTerminal() ? "rich" : "plain");
  }

  async intermediate<T>(action: () => Promise<T>): Promise<T> {
    this.omittedResults++;
    try { return await action(); } finally { this.omittedResults--; }
  }

  /*
   * The corner: while any command works for a person, a character sits at the right of the
   * last lines of the terminal and the text reads down the left as it would without it.
   * Each finished stage prints where the text was going, with its tick and time; the one
   * under way sits under them with the spinner, a clock once it has run three seconds, and
   * a bar while bytes move. The character is never the person's own: it is a random one
   * from pools picked to look good here, it shuffles to another every few seconds, and when
   * the command ends it cheers and the corner is given back, so there is one face at a time.
   *
   * The brief, 7 and 8 Oct 2026: the stages need not sit side by side, more like Claude
   * Code; they are on every command; when a command is done the avatars go away; and the
   * characters are ones that look good here, not necessarily the player's own.
   *
   * Only for a person at a terminal with room. Agents, pipes, CI, --json and NO_COLOR
   * never see any of it, and a terminal too small gets the spinner line alone.
   */
  private stage: MascotStage | null = null;
  /** What sits down the left of the face instead of the stage under way, when anything. */
  private beside: ((now: number) => string[]) | null = null;
  /** A sentence the face is already showing, which the result does not repeat. */
  private shown: string | null = null;
  /** Set by `begin`: this command wants the corner whenever the terminal is its own. */
  private wantFace = false;
  private began = 0;
  /** Room for the face in the corner and a sentence down the left, with a few lines of
   * the terminal still free above it. */
  private roomForFace() {
    return this.style === "rich" && (process.stdout.columns ?? 80) >= STAGE_COLUMNS + 40 && (process.stdout.rows ?? 24) >= MASCOT_LINES + 8;
  }
  private width() {
    return (this.stage ? this.stage.faceColumn() - 2 : (process.stdout.columns ?? 80)) - 1;
  }
  private caption = (now: number): string[] => this.beside ? this.beside(now) : this.spinner ? [this.liveLine(this.spinner, now)] : [];
  private openStage(shuffle: boolean) {
    this.stop();
    // A line of air between the command and what it says, so neither is pressed to the other.
    this.raw("\n");
    this.stage = new MascotStage({ write: this.raw, still: stillTerminal(), shuffle, caption: this.caption });
    this.stage.start();
    corner = this;
    process.stdout.once("resize", this.resized);
    return this.stage;
  }
  /* Every move the corner makes counts lines from the bottom, and a terminal that reflows
     on a resize moves them, so the next frame lands in the middle of the face and stacks
     another under it. The face stops where it is and the spinner carries on alone. */
  private resized = () => {
    this.wantFace = false;
    this.stage?.end(false, false);
    this.stage = null;
    this.beside = null;
    if (corner === this) corner = null;
    if (this.spinner && !this.spinner.timer) { this.spinner.timer = setInterval(() => this.paint(), FRAME_MS); this.spinner.timer.unref(); this.raw("\n"); }
  };
  /** `clear` when the command only borrowed the corner; otherwise the face stays. */
  private closeStage(clear: boolean) {
    process.stdout.removeListener("resize", this.resized);
    this.stage?.end(clear);
    this.stage = null;
    this.beside = null;
    if (corner === this) corner = null;
  }
  /** Lines that belong where the text is going: above the face when it is there. */
  private say(lines: string[], error = false) {
    if (!lines.length) return;
    if (this.stage?.live) { this.stage.above(lines, error ? text => this.writeError(text.replace(/\n$/, "")) : this.raw); return; }
    for (const line of lines) (error ? this.writeError : this.write)(line);
  }

  /** Every command a person runs: the corner opens on a random character, which shuffles
   * once the command has run a moment. Login opens it itself, after the code is shown. */
  begin(open = true) {
    if (!this.roomForFace()) return;
    this.wantFace = true;
    this.began = performance.now();
    if (open) this.openStage(true);
  }

  /** Login's waiting face, opened once the code is on screen. */
  companion() {
    this.begin();
  }

  /** The corner, if this command wants it and it is not already there: after a build or a
   * prompt had the terminal to itself. */
  async face() {
    if (this.wantFace && !this.stage?.live && this.roomForFace()) this.openStage(true);
  }

  /** The character, still, with a few lines beside it: the CLI saying hello at the top of
   * its help. Still because help is read, and a person reading wants it to hold. */
  greet(caption: string[]) {
    if (!this.roomForFace()) return;
    const face = stillMascot(randomCharacter());
    const first = Math.max(0, Math.floor((face.length - caption.length) / 2));
    this.raw(face.map((line, index) => caption[index - first] ? `${line}  ${caption[index - first]}` : line).join("\n") + "\n\n");
  }

  /** Who they are signed in as: the sentence prints where the text is going, and the
   * character in the corner cheers for it before the corner is given back. */
  async identity(sentence: string) {
    if (!this.roomForFace()) { this.stop(); return; }
    this.settleSpinner(false);
    if (!this.stage?.live) this.openStage(false);
    this.say([terminalText(sentence).replace(/@[A-Za-z0-9_-]+/, handle => ansi("1", handle))]);
    this.shown = sentence;
    this.stage!.cheer(1000);
    await this.stage!.settle(1000, true);
    this.closeStage(true);
  }

  /** The end of a command with the face in the corner: it cheers when things went well and
   * the command took long enough for that to mean something, and the corner is given back.
   * One face at a time, as the 8 Oct 2026 brief put it: when a command is done the avatars go away. */
  private async finale(well: boolean) {
    const stage = this.stage;
    if (!stage?.live) return;
    if (well && performance.now() - this.began > 1200) {
      stage.cheer(900);
      await stage.settle(900, true);
    } else stage.end(true);
    this.closeStage(true);
  }

  /** For a command that keeps running after its one result, as dev does. Under --json that
   * object is already written, and a notice held for the next one would never print. Stdout
   * promises exactly one object, so the late event goes to stderr as one JSON line, which an
   * agent reading the command's output still sees. Everywhere else it is an ordinary emit. */
  emitLate(event: CliEvent) {
    if (this.json && !this.stream) { process.stderr.write(JSON.stringify(event) + "\n"); return; }
    this.emit(event);
  }

  emit(event: CliEvent) {
    if (event.type === "result" && this.omittedResults) return;
    if (this.json) {
      if (this.stream) { this.write(JSON.stringify(event)); return; }
      if (event.type === "finding") { this.findings.push(event.finding); return; }
      if (event.type === "notice") { this.notices.push(event); return; }
      if (event.type === "progress") return;
      const data = event.type === "result" && event.data && typeof event.data === "object" ? event.data as Record<string, unknown> : {};
      this.write(JSON.stringify({ ...event, ok: event.type === "result", url: data.url ?? data.previewUrl ?? data.certifyUrl ?? null,
        next: event.type === "error" ? event.next ?? null : data.next ?? null,
        findings: this.findings, notices: this.notices }, null, 2));
      this.findings = []; this.notices = [];
      return;
    }
    if (event.type === "finding") {
      // The local check and the server's receipt can say the same thing about the same
      // file ("Could not confirm Three.js in this build." twice, once from each). A
      // person reads it once, in the server's words, which arrive last.
      // Only when both ask the same thing of the person: a server note must not hide a local Blocker.
      const same = (f: RepairFinding) => f.evidence.observed === event.finding.evidence.observed && f.evidence.file === event.finding.evidence.file
        && findingLabel(f) === findingLabel(event.finding);
      this.findings = [...this.findings.filter(f => !same(f)), event.finding];
      return;
    }
    if (event.type === "progress") { this.progress(event); return; }
    if (event.type === "notice") {
      this.settleSpinner(true);
      this.say([terminalText(event.message)]);
      return;
    }
    if (event.type === "error") {
      this.settleSpinner(false); this.flushFindings();
      const message = terminalText(event.message);
      this.say([this.style === "rich" ? ansi("31", "×") + " " + message : message,
        ...(event.next && !message.includes(event.next) ? [`Next: ${terminalText(event.next)}`] : [])], true);
      this.pending = this.finale(false);
      return;
    }
    this.settleSpinner(true); this.flushFindings();
    const data = event.data as { message?: string };
    let message = data?.message ?? JSON.stringify(event.data, null, 2);
    // The face already said who this is; the result carries on from there.
    if (this.shown && message.startsWith(this.shown)) message = message.slice(this.shown.length).trim();
    this.shown = null;
    if (message) this.say(terminalText(message).split("\n"));
    this.pending = this.finale(true);
  }
  /** The face's last moment, which the process waits for before it exits. */
  private pending: Promise<void> | null = null;
  async settled() { await this.pending; }

  /** The findings about to be printed belong to a deploy that has finished, which nobody
   * retries: our fault on one is labelled as stopped rather than as something to wait on. */
  markEnded() { this.ended = true; }

  /** Findings read best together, grouped by the file they name, each with its
   * fix written out. The verify line is the same for most, so it prints once.
   * A fix the finding above already gave is not printed again: four relay notes from
   * one template each repeated the same ninety words. */
  flushFindings() {
    if (this.json || !this.findings.length) return;
    const rich = this.style === "rich";
    const lines: string[] = [];
    for (const { file, findings: items } of groupFindings(this.findings)) {
      lines.push(rich ? ansi("1", terminalText(file || "Your game")) : terminalText(file || "Your game"));
      let lastFix: string | null = null;
      for (const finding of items) {
        const tag = label(finding, this.ended);
        lines.push(`  ${rich ? ansi(tag.color, tag.text) : tag.text}: ${terminalText(finding.evidence.observed)}`);
        if (finding.fix !== lastFix) lines.push(`  ${rich ? ansi("2", "Fix:") : "Fix:"} ${terminalText(finding.fix)}`);
        lastFix = finding.fix;
      }
      lines.push("");
    }
    // The blocker's verify step is the one that matters. Notes ask for nothing.
    const lead = this.findings.find(finding => findingLabel(finding) === "Blocker");
    if (lead) lines.push(`Then run ${terminalText(lead.verify)}.`);
    this.say(lines);
    this.findings = [];
  }

  private progress(event: Extract<CliEvent, { type: "progress" }>) {
    const fraction = event.total ? Math.min(1, (event.bytes ?? 0) / event.total) : undefined;
    const text = terminalText(event.message.replace(/…$/, ""));
    if (this.style !== "rich") {
      // Byte progress is for a person watching a spinner, not for a log.
      if (event.total === undefined || event.bytes === 0) this.write(text);
      return;
    }
    if (this.wantFace && !this.stage?.live && this.roomForFace()) this.openStage(true);
    /* Byte progress is one stage however its words change: deploy says "Sending archive:
       N of M bytes", and keyed on the words alone every percent ticked a line of its own. */
    const sameBytes = fraction !== undefined && this.spinner?.fraction !== undefined && this.spinner.stage === event.stage;
    if (this.spinner && (this.spinner.text === text || sameBytes)) {
      this.spinner.fraction = fraction;
      this.spinner.text = text;
      if (!this.stage) this.paint();
      return;
    }
    this.settleSpinner(true);
    // Beside a face the stage repaints the line; on its own the spinner keeps its own time.
    const timer = this.stage ? null : setInterval(() => this.paint(), FRAME_MS);
    timer?.unref();
    this.spinner = { timer, text, stage: event.stage, started: performance.now(), ...(fraction !== undefined ? { fraction } : {}) };
    if (!this.stage) this.paint();
  }
  /** The stage under way: the spinner on the 120 ms step, its words, the bar while bytes
   * move, and a clock once it has run three seconds. */
  private liveLine(live: Live, now: number) {
    const elapsed = now - live.started;
    const bar = live.fraction !== undefined ? ` ${pixelBar(live.fraction)}` : "";
    const clock = elapsed >= 3000 ? ansi("2", `  ${clockText(elapsed)}`) : "";
    const room = this.width() - 2 - (bar ? 22 : 0) - (clock ? 9 : 0);
    return `${ansi("34", SPOKES[Math.floor(elapsed / FRAME_MS) % SPOKES.length]!)} ${clip(live.text, room)}${bar}${clock}`;
  }
  /** A finished stage: a tick, its words and how long it took. */
  private tickLine(live: Live) {
    const seconds = ((performance.now() - live.started) / 1000).toFixed(1);
    return `${ansi("32", "✓")} ${clip(live.text, this.width() - 10)} ${ansi("2", `${seconds}s`)}`;
  }
  private settleSpinner(done: boolean) {
    const live = this.spinner;
    if (!live) return;
    if (live.timer) clearInterval(live.timer);
    this.spinner = null;
    const line = done ? this.tickLine(live) : null;
    if (this.stage) { if (line) this.stage.above([line]); return; }
    this.raw(`\r\x1b[2K${line ? `${line}\n` : ""}`);
  }
  private paint() {
    if (this.spinner) this.raw(`\r\x1b[2K${this.liveLine(this.spinner, performance.now())}`);
  }
  /** The login code, typed in at a steady rhythm so a person reads it as it lands rather
   * than finding it in a block of text: it is the one thing on the screen they compare
   * with the browser. Everything else prints as the notice it is. */
  async revealCode(event: Extract<CliEvent, { type: "notice" }>, code: string) {
    if (this.style !== "rich") { this.emit(event); return; }
    this.stop();
    const text = terminalText(event.message);
    const at = text.lastIndexOf(code);
    if (at < 0) { this.write(text); return; }
    this.raw(text.slice(0, at));
    for (const char of code) { this.raw(ansi("1", char)); await new Promise(resolve => setTimeout(resolve, 55)); }
    this.raw(`${text.slice(at + code.length)}\n`);
  }
  /** A child process is about to write to this terminal itself. A running spinner
   * repaints its line every 120 ms with a carriage return, which lands in the middle
   * of the child's lines and glued "Building your game" onto vite's first one. The
   * stage becomes a plain heading instead, and the child's output follows it. */
  yieldTerminal() {
    if (this.stage) {
      // Not a tick: the stage has not run yet, the child is about to run it.
      if (this.spinner) { this.say([`${ansi("2", "›")} ${this.spinner.text}`]); this.spinner = null; }
      this.closeStage(true);
      return;
    }
    if (!this.spinner) return;
    if (this.spinner.timer) clearInterval(this.spinner.timer);
    this.raw(`\r\x1b[2K${ansi("2", "›")} ${this.spinner.text}\n`);
    this.spinner = null;
  }
  /** Settle the current stage: a tick and its time when it finished, nothing when it did
   * not. With a face in the corner, the corner is then given back, and whatever comes
   * next prints where the text was going. */
  stop(done = true) {
    this.settleSpinner(done);
    if (this.stage) this.closeStage(true);
  }

  /** The preview arriving is the one moment the terminal celebrates: a band of
   * the brand blue sweeps the title once, left to right, then it rests in bold.
   * One blue on neutral, like the product. Never loops, never in plain output. */
  async arrive(title: string) {
    const text = terminalText(title).replace(/\s+/g, " ").slice(0, 80);
    if (this.style !== "rich" || !text) return;
    this.settleSpinner(true); this.flushFindings();
    const chars = [...text];
    const band = 6;
    const frames = chars.length + band;
    const step = Math.max(16, Math.min(40, Math.floor(840 / frames)));
    const shimmer = (frame: number) => chars.map((char, index) => {
      const offset = frame - index;
      if (offset < 0 || offset >= band) return ansi("1", char);
      // #0054FF at the leading edge, easing toward the resting text behind it.
      const mix = offset / band;
      const [r, g, b] = BLUE.map(channel => Math.round(channel + (REST - channel) * mix * 0.6));
      return `\x1b[1;38;2;${r};${g};${b}m${char}\x1b[0m`;
    }).join("");
    // In the corner, the character turns back into the person and cheers while the title
    // shimmers beside it, and then the title takes its place in the text.
    if (this.stage?.live) {
      const started = performance.now();
      this.stage.cheer(1100);
      this.beside = now => [shimmer(Math.floor((now - started) / step))];
      if (!stillTerminal()) await sleep(Math.max(1100, (frames + 1) * step));
      this.beside = null;
      this.say([ansi("1", text)]);
      return;
    }
    for (let frame = 0; frame <= frames; frame++) {
      this.raw(`\r\x1b[2K${shimmer(frame)}`);
      await new Promise(resolve => setTimeout(resolve, step));
    }
    this.raw(`\r\x1b[2K${ansi("1", text)}\n`);
  }

  finish() { this.stop(false); this.flushFindings(); }
}

const BLUE = [0x00, 0x54, 0xff] as const;
const REST = 0xb4;
