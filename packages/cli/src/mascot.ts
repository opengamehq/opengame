import { inkColor, mascotSurface, parseMascot, sampleMascot, type MascotFrame, type MascotLook, type MascotPose } from "@opengame/ui/mascot-art";
import { constants as osConstants } from "node:os";
import { stripVTControlCharacters } from "node:util";
import { MascotDriver } from "@opengame/ui/mascot-driver";
import { flagSet } from "./env";
import { CHANGE_MS, SIDE, TOP, applyChange, burst, cleanPose, drawSparks, glint, stageCells, stepSparks, type Change, type Spark } from "./stage-art";

/**
 * The OpenGame character in a terminal: the same face the site puts beside a name, drawn
 * by the same sampler and moved by the same driver, so the CLI shows a person the
 * creature they built rather than a picture of something else.
 *
 * Until 7 Oct 2026 this was an 8x8 mirrored sprite from `avatar_seed`, which the product
 * stopped drawing on 6 Oct ("we shouldnt be using these pixelated icons anywhere
 * anymore"). The terminal kept it for a day because the platform branch was cut before
 * the character existed.
 *
 * ## Cells
 *
 * One terminal character is two cells, the upper half block in the top cell's colour on
 * the bottom cell's, which makes each cell close to square in every monospace font. A
 * cell nobody painted is left as the terminal's own background rather than painted
 * black, so the face sits on a light theme as well as a dark one.
 *
 * Twenty-eight cells across, because that is where every eye holds together. The first take
 * was sixteen, and its eyes looked terrible and had no pupils. A sheet of
 * every size from sixteen to twenty-eight bore it out: below twenty-four most eye styles
 * come apart into a white blob and a stray cell under it, and at twenty-four the default
 * white face's classic eyes, which are drawn as outlines on white, still broke into what
 * looked like two musical notes. Twenty-eight is also what the site's top bar draws. At
 * that size the face is too tall to sit beside text, so it sits in the corner while a
 * command works and the text reads down the left as it always did.
 */

export const MASCOT_COLUMNS = 28;
/** Two rows of sky above a still picture, so it is drawn with the room a hop would have. */
const HEADROOM = 2;
/** The corner: the face with room either side and above for sparks and a hop. */
export const STAGE_COLUMNS = MASCOT_COLUMNS + SIDE * 2;
export const MASCOT_LINES = (MASCOT_COLUMNS + TOP) / 2;

type Rgb = readonly [number, number, number];
export type ColorDepth = "truecolor" | "256";

/** Truecolor where the terminal says so. Anything else gets the 256-colour cube, which
 * every terminal still in use draws; Apple's Terminal set no COLORTERM and mangled
 * 24-bit sequences into the wrong colours for most of its life. */
export function colorDepth(env = process.env): ColorDepth {
  return /^(truecolor|24bit)$/i.test(env.COLORTERM ?? "") ? "truecolor" : "256";
}

/** A terminal says it is light with COLORFGBG ("0;15" is dark text on white); most say
 * nothing, and most are dark. The character's rim and pupils are chosen per theme. */
export function darkTerminal(env = process.env): boolean {
  const bg = Number((env.COLORFGBG ?? "").split(";").pop());
  return !Number.isInteger(bg) || bg < 7 || bg === 8;
}

/** Motion is for a person who wants it. There is no prefers-reduced-motion in a terminal,
 * so the CLI reads its own switch, and the character keeps the logo's still glance. */
export function stillTerminal(env = process.env): boolean {
  return flagSet(env.OPENGAME_REDUCED_MOTION);
}

function cube(value: number) {
  return value < 48 ? 0 : value < 115 ? 1 : Math.min(5, Math.floor((value - 35) / 40));
}
const LEVELS = [0, 95, 135, 175, 215, 255];

/** The nearest of xterm's 256: the 6x6x6 cube or the 24-step grey ramp, whichever is closer. */
export function ansi256([r, g, b]: Rgb): number {
  const [cr, cg, cb] = [cube(r), cube(g), cube(b)];
  const fromCube = (LEVELS[cr]! - r) ** 2 + (LEVELS[cg]! - g) ** 2 + (LEVELS[cb]! - b) ** 2;
  const grey = Math.max(0, Math.min(23, Math.round(((r + g + b) / 3 - 8) / 10)));
  const level = 8 + grey * 10;
  const fromGrey = (level - r) ** 2 + (level - g) ** 2 + (level - b) ** 2;
  return fromGrey < fromCube ? 232 + grey : 16 + 36 * cr + 6 * cg + cb;
}

function sgr(layer: 38 | 48, rgb: Rgb, depth: ColorDepth) {
  return depth === "truecolor" ? `\x1b[${layer};2;${rgb[0]};${rgb[1]};${rgb[2]}m` : `\x1b[${layer};5;${ansi256(rgb)}m`;
}

/** The character as a grid of colours, `MASCOT_COLUMNS` across and two rows of headroom
 * taller, null where nothing is drawn. */
export function mascotCells(look: MascotLook, pose: MascotPose, frame: MascotFrame, dark: boolean, columns = MASCOT_COLUMNS): (Rgb | null)[][] {
  const cell = frame.span / columns;
  const top = frame.top - HEADROOM * cell;
  const hit = mascotSurface();
  const rows: (Rgb | null)[][] = [];
  for (let j = 0; j < columns + HEADROOM; j += 1) {
    const row: (Rgb | null)[] = [];
    for (let i = 0; i < columns; i += 1) {
      const ink = sampleMascot(look, pose, (i + 0.5) * cell + frame.left, (j + 0.5) * cell + top, cell, i, j, false, hit);
      row.push(ink ? inkColor(look, pose, ink, i, j, dark, hit) : null);
    }
    rows.push(row);
  }
  return rows;
}

/** Cells to terminal lines, two rows to a line. Every line ends reset, so nothing bleeds
 * into the caption beside it or the prompt below. */
export function terminalLines(cells: (Rgb | null)[][], depth: ColorDepth): string[] {
  const lines: string[] = [];
  for (let y = 0; y < cells.length; y += 2) {
    let line = "";
    for (let x = 0; x < cells[y]!.length; x += 1) {
      const top = cells[y]![x] ?? null;
      const bottom = cells[y + 1]?.[x] ?? null;
      if (top && bottom) line += `${sgr(38, top, depth)}${sgr(48, bottom, depth)}▀`;
      else if (top) line += `\x1b[49m${sgr(38, top, depth)}▀`;
      else if (bottom) line += `\x1b[49m${sgr(38, bottom, depth)}▄`;
      else line += "\x1b[0m ";
    }
    lines.push(line + "\x1b[0m");
  }
  return lines;
}

/** The still character, for a caller that only wants the picture. */
export function stillMascot(look: MascotLook, depth = colorDepth(), dark = darkTerminal()): string[] {
  const driver = new MascotDriver(look, 0, true);
  const { pose, frame } = driver.frame(0);
  return terminalLines(mascotCells(look, pose, frame, dark), depth);
}

/**
 * The characters the corner draws, which are never the person's own. The brief, 8 Oct 2026:
 * characters and eyes that look good here rather than the player's own, with the shapes,
 * colours, eyes and pupils changing every time so it is never the same twice. Each one is
 * a random pick from three pools chosen from sheets
 * drawn exactly as the corner draws them: shapes with bold silhouettes, eye styles that
 * have a filled white eye with a pupil in it (73 of the 158 do, measured by sampling each),
 * and the vivid colours round the wheel. No two in a row share a shape or a colour.
 */
export const SHAPES = ["gem", "slab", "cat", "house", "star", "circle", "penguin", "mouse", "camera", "pill", "hippo", "bulb", "octagon", "egg", "pear", "cookie"] as const;
export const EYES = ["classic", "wide", "doll", "worried", "walleyed", "crush", "owl", "anime", "raised", "lashes"] as const;
export const COLOURS = ["coral", "tangerine", "honey", "lime", "mint", "aqua", "sky", "cobalt", "iris", "violet", "fuchsia", "rose"] as const;
const pick = <T>(items: readonly T[], not?: T) => {
  const choices = items.filter(item => item !== not);
  return choices[Math.floor(Math.random() * choices.length)]!;
};
/** A character from the pools, different in shape and colour from `previous`. */
export function randomCharacter(previous?: MascotLook): MascotLook {
  return parseMascot(`${pick(SHAPES, previous?.shape as never)}.${pick(EYES)}.${pick(COLOURS, previous?.color as never)}`)!;
}

/** Faces a character pulls for a moment while it holds: all white eyes with pupils. */
export const EXPRESSIONS: readonly string[] = ["sparkle", "wide", "starstruck", "raised", "anime", "worried", "crush"];
const SHUFFLE_START_MS = 1800;
/* What a character does while it holds, in milliseconds from when it arrived: look one way
   and the other, pull a face, look down, blink back to itself. The next one arrives at
   HOLD_MS, so a change always comes just after a blink. */
const HOLD_MS = 3400;
const BEATS: readonly (readonly [number, "left" | "right" | "face" | "down" | "back"])[] = [
  [900, "left"], [1500, "right"], [2000, "face"], [2600, "down"], [3000, "back"],
];
/** The bob: up a whole cell and down again, so the outline never sits between cells. */
const BOB_MS = 480;
const BLINK_MS = 150;

interface StageOptions {
  write: (text: string) => void;
  /** The lines down the left while the face is in the corner. */
  caption: (now: number) => string[];
  still?: boolean;
  /** Change character every few seconds, as the avatar step's Shuffle does. */
  shuffle?: boolean;
  depth?: ColorDepth;
  dark?: boolean;
  now?: () => number;
  columns?: () => number;
}

/* Sixty frames a second while anything moves (a change, a spark, a hop) and thirty at rest.
   Sampling the face costs about 2 ms a frame, so a long wait at sixty was an eighth of a
   core and twice the escape codes down an ssh connection for a face that was only blinking. */
const FRAME_MS = 16;
const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

/** Width on screen, ignoring colour codes. */
export function visibleWidth(text: string) {
  return [...stripVTControlCharacters(text)].length;
}


/**
 * A live character in the corner of the lines above the cursor: the block is the face's
 * height, the caption runs down its left from the top line, and the face sits at the
 * right. The cursor stays on the line after the block, so anything printed through
 * `above` lands where the text was going anyway, and the block is drawn again under it.
 * Each frame rewrites only the lines that changed.
 *
 * Nothing else may write to the terminal while a stage runs; `Output` ends it first.
 */
export class MascotStage {
  readonly driver: MascotDriver;
  private drawn: string[] = [];
  private timer: NodeJS.Timeout | null = null;
  private started: number;
  private nextShuffle: number;
  private change: Change | null = null;
  private sparks: Spark[] = [];
  /** When the character on screen arrived, which beat it is on, and its own eyes. */
  private holdAt: number;
  private beat = 0;
  private ownEyes: MascotLook["eyes"];
  private blinkAt = -Infinity;
  private last: number;
  private frames = 0;
  private readonly depth: ColorDepth;
  private readonly dark: boolean;
  private readonly clock: () => number;
  private readonly restore = () => this.opts.write("\x1b[?25h");
  /* Ctrl-C, a closed window or a kill while the face is up: take the face away and give the
     cursor back before going, or the shell is left with no cursor and a frozen face. A
     listener replaces the signal's default exit, so this exits with the code it would have. */
  private readonly interrupt = (signal: NodeJS.Signals) => { this.end(true); process.exit(128 + (osConstants.signals[signal] ?? 2)); };

  constructor(private readonly opts: StageOptions) {
    const look = randomCharacter();
    this.clock = opts.now ?? (() => performance.now());
    this.started = this.clock();
    this.last = this.started;
    this.driver = new MascotDriver(look, this.started, Boolean(opts.still));
    this.depth = opts.depth ?? colorDepth();
    this.dark = opts.dark ?? darkTerminal();
    this.nextShuffle = this.started + SHUFFLE_START_MS;
    this.holdAt = this.started;
    this.ownEyes = look.eyes;
  }

  get live() { return this.timer !== null; }

  /** Where the corner starts: against the right edge, but never further out than a
   * comfortable reading line, so on a very wide terminal it stays near the text. */
  faceColumn() {
    const columns = this.opts.columns?.() ?? process.stdout.columns ?? 80;
    return Math.max(0, Math.min(columns - STAGE_COLUMNS - 1, 72));
  }

  start() {
    this.drawn = Array.from({ length: MASCOT_LINES }, () => "");
    this.opts.write("\n".repeat(MASCOT_LINES) + "\x1b[?25l");
    process.once("exit", this.restore);
    for (const signal of SIGNALS) process.once(signal, this.interrupt);
    this.paint(true);
    this.timer = setInterval(() => this.paint(), FRAME_MS);
    this.timer.unref();
  }

  /** Change to another character: the shape morphs, the colour wipes in from the top left,
   * and sparks fly off the silhouette. */
  private changeTo(look: MascotLook, now: number, cheer: boolean) {
    if (this.driver.still) { this.driver.set(look, now); return; }
    this.change = { from: this.driver.look, at: now };
    this.driver.set(look, now);
    this.holdAt = now;
    this.beat = 0;
    this.ownEyes = look.eyes;
    burst(this.sparks, SIDE + MASCOT_COLUMNS / 2, TOP + MASCOT_COLUMNS / 2, MASCOT_COLUMNS * 0.4, now, cheer);
  }

  /** Happy eyes, a hop and sparks, for something that went right. */
  cheer(ms = 1100) {
    const now = this.clock();
    this.driver.cheer(now, ms);
    if (!this.driver.still) burst(this.sparks, SIDE + MASCOT_COLUMNS / 2, TOP + MASCOT_COLUMNS / 2, MASCOT_COLUMNS * 0.4, now, true);
  }

  /** Print lines where the text was going, above the block, and draw the block again
   * under them. `write` is the stream they belong on: an error goes to stderr, which in
   * a terminal is the same screen, so the cursor is moved on stdout and the words follow. */
  above(lines: string[], write: (text: string) => void = this.opts.write) {
    if (!lines.length) return;
    this.opts.write(`\x1b[?2026h\x1b[${MASCOT_LINES}A\r\x1b[J`);
    write(`${lines.join("\n")}\n`);
    this.opts.write(`${"\n".repeat(MASCOT_LINES)}\x1b[?2026l`);
    this.drawn = Array.from({ length: MASCOT_LINES }, () => "");
    this.paint(true);
  }

  /** Keep moving for `ms`, then stop: leave the face where it is, or `clear` it. */
  async settle(ms: number, clear = false) {
    if (!this.driver.still) await new Promise(resolve => setTimeout(resolve, ms));
    this.end(clear);
  }

  /**
   * Stop, and give the cursor back. `clear` takes the block away, which is how a command
   * that only borrowed the corner leaves; otherwise the face stays on the logo's still
   * glance, the one a person remembers. `paint` false leaves the screen exactly as it is,
   * for when the lines under the cursor can no longer be trusted. Safe to call twice.
   */
  end(clear: boolean, paint = true) {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    this.sparks = [];
    this.change = null;
    if (clear) this.opts.write(`\x1b[${MASCOT_LINES}A\r\x1b[J`);
    else if (paint) { this.driver.still = true; this.paint(true); }
    this.restore();
    process.removeListener("exit", this.restore);
    for (const signal of SIGNALS) process.removeListener(signal, this.interrupt);
  }

  /** The beats of a hold: where it looks, the face it pulls, and the blink before it goes.
   * The person's own face, holding through a command, looks around and blinks but keeps
   * its eyes: an expression is for a character trying things on. */
  private choreograph(now: number) {
    if (!this.opts.shuffle && now - this.holdAt >= HOLD_MS) { this.holdAt = now; this.beat = 0; }
    while (this.beat < BEATS.length && now - this.holdAt >= BEATS[this.beat]![0]) {
      const act = BEATS[this.beat]![1];
      this.beat += 1;
      if (act === "left") this.driver.point(-0.75, 0.1, now);
      else if (act === "right") this.driver.point(0.75, 0.05, now);
      else if (act === "down") this.driver.point(0, 0.5, now);
      else if (act === "face" && this.opts.shuffle) {
        const faces = EXPRESSIONS.filter(eyes => eyes !== this.ownEyes);
        this.driver.set({ ...this.driver.look, eyes: faces[Math.floor(Math.random() * faces.length)] as MascotLook["eyes"] }, now);
      } else if (act === "back") {
        if (this.driver.look.eyes !== this.ownEyes) this.driver.set({ ...this.driver.look, eyes: this.ownEyes }, now);
        else this.blinkAt = now;
      }
    }
  }

  private paint(force = false) {
    const now = this.clock();
    const moving = this.sparks.length > 0 || (this.change !== null && now - this.change.at < CHANGE_MS);
    // At rest, every other tick: thirty frames a second is plenty for a blink.
    if (!force && !moving && this.frames++ % 2) return;
    if (this.opts.shuffle && !this.driver.still && now >= this.nextShuffle) {
      this.changeTo(randomCharacter(this.driver.look), now, false);
      this.nextShuffle = now + HOLD_MS;
    }
    if (!this.driver.still) this.choreograph(now);
    const frame = this.driver.frame(now);
    let pose = frame.pose;
    let wipe = null;
    if (!this.driver.still) {
      const changed = applyChange(cleanPose(pose), frame.look, this.change, now);
      pose = changed.pose;
      const bob = Math.floor((now - this.started) / BOB_MS) % 2 ? frame.frame.span / MASCOT_COLUMNS : 0;
      const blink = (now - this.blinkAt) / BLINK_MS;
      pose = { ...pose, lift: pose.lift + bob, blink: blink >= 0 && blink < 1 ? Math.max(pose.blink, Math.sin(blink * Math.PI)) : pose.blink };
      wipe = changed.wipe;
      if (!changed.moving) this.change = null;
      if (wipe) glint(this.sparks, wipe.front, STAGE_COLUMNS, MASCOT_COLUMNS + TOP, now);
      stepSparks(this.sparks, now, Math.min(0.05, (now - this.last) / 1000));
    }
    this.last = now;
    const grid = stageCells(frame.look, pose, frame.frame, this.dark, MASCOT_COLUMNS, wipe);
    drawSparks(grid, this.sparks, now);
    const face = terminalLines(grid, this.depth);
    const caption = this.opts.caption(now);
    const at = this.faceColumn();
    let out = "";
    for (let index = 0; index < MASCOT_LINES; index += 1) {
      const text = caption[index] ?? "";
      const pad = Math.max(1, at - visibleWidth(text));
      const next = `${text}\x1b[0m${" ".repeat(pad)}${face[index]}`;
      if (next === this.drawn[index]) continue;
      const up = MASCOT_LINES - index;
      out += `\x1b[${up}A\r${next}\x1b[K\x1b[${up}B\r`;
      this.drawn[index] = next;
    }
    // Synchronised output: a terminal that knows it draws the frame whole, one that does
    // not ignores the two private modes.
    if (out) this.opts.write(`\x1b[?2026h${out}\x1b[?2026l`);
  }
}
