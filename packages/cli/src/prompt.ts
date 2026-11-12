import { emitKeypressEvents } from "node:readline";
import { createInterface } from "node:readline/promises";
import { CliError, questionAnswered, questionGap, releaseTerminal, terminalText } from "./output";

/**
 * Terminal questions for a person, never for an agent: callers ask only after
 * `agentMode()` says a person is there, and every question has a flag that answers it.
 *
 * Raw ANSI rather than a prompt library, for the same reason the rest of the CLI is: a
 * cold `npx` start pays for every import. The highlight moves between options in place,
 * so the menu reads as one control rather than a scrolling list. Colour carries meaning
 * only (the highlight), and `NO_COLOR` turns it into a plain marker.
 *
 * Questions start in column one, where everything else the CLI says starts, and the options
 * sit two in under them. Answered questions stack as a form does, with no blank lines
 * between them, and one blank line separates the form from what came before and after
 * (`questionGap` in output.ts). Until 11 Nov 2026 each question was indented two and
 * opened with a blank line, and the summary init printed under them ran flush left with
 * none, so the two halves of one command looked like two programs.
 */

const plain = () => process.env.NO_COLOR !== undefined || process.env.TERM === "dumb";
const highlight = (text: string) => plain() ? `> ${text}` : `\x1b[1m\x1b[38;2;0;84;255m›\x1b[0m \x1b[1m${text}\x1b[0m`;
const quiet = (text: string) => plain() ? `  ${text}` : `  \x1b[2m${text}\x1b[0m`;
// A question needs the terminal to itself: the face in the corner steps aside first.
const write = (text: string) => { releaseTerminal(); return process.stdout.write(text); };

export interface PromptOption { value: string; label: string; hint?: string | null }

function interrupted(): never {
  throw new CliError("cancelled", "Cancelled. Nothing was submitted.", 2);
}

/** The rows a menu may use: the terminal's height less the question, the help line and
 * room for the answers above it. A list taller than the screen cannot be redrawn in place,
 * because the cursor cannot move above the top row; the jam's 36 models did exactly that
 * in a 30-row terminal and every keypress printed another copy. */
export function menuWindow(count: number, cursor: number, top: number, rows: number): { top: number; size: number } {
  const size = Math.max(3, Math.min(count, rows - 8));
  let start = Math.min(Math.max(0, top), Math.max(0, count - size));
  if (cursor < start) start = cursor;
  if (cursor >= start + size) start = cursor - size + 1;
  return { top: start, size };
}

/** A question settled to one line: the question, two spaces, and the answer in bold. */
export function answered(question: string, answer: string): string {
  return `${terminalText(question)}  ${plain() ? terminalText(answer) : `\x1b[1m${terminalText(answer)}\x1b[0m`}`;
}

/** One display row, cut to the terminal width so a long hint cannot wrap and throw the
 * redraw's line count off. */
function fit(text: string, columns: number) {
  const chars = [...text];
  return chars.length < columns - 2 ? text : chars.slice(0, Math.max(8, columns - 3)).join("") + "…";
}

/** One option's text before it is cut to the terminal: the label padded to `width` code
 * points, then its hint, so every hint in a menu starts in one column. `width` is the longest
 * label in that menu (`labelWidth`), measured per menu so a short list is not padded out to a
 * long one's. The pad is spaces after the label rather than a tab, because a tab's width is
 * the terminal's to decide and the redraw counts characters. */
export function menuRow(option: PromptOption, width: number, mark = ""): string {
  if (!option.hint) return `${mark}${option.label}`;
  return `${mark}${option.label}${" ".repeat(Math.max(0, width - [...option.label].length))}  ${option.hint}`;
}

/** The widest label among the options that carry a hint, in code points. */
export function labelWidth(options: PromptOption[]): number {
  return Math.max(0, ...options.filter(option => option.hint).map(option => [...option.label].length));
}

/** Arrow keys and Enter; space toggles in a multi-select. Returns the chosen values. */
async function menu(question: string, options: PromptOption[], { many = false, initial = 0, selected = [] as string[] } = {}): Promise<string[]> {
  if (!options.length) return [];
  // Before the gap is read: a spinner stopped here prints its tick, which changes it.
  releaseTerminal();
  const input = process.stdin;
  emitKeypressEvents(input);
  const wasRaw = input.isRaw;
  input.setRawMode?.(true);
  input.resume();
  let cursor = Math.max(0, Math.min(initial, options.length - 1));
  let top = 0;
  const picked = new Set(selected);
  const help = many ? "Space to choose, Enter to continue" : "Enter to choose";
  const width = labelWidth(options);
  const lines = () => {
    const columns = process.stdout.columns || 80;
    const view = menuWindow(options.length, cursor, top, process.stdout.rows || 24);
    top = view.top;
    const shown = options.slice(view.top, view.top + view.size).map((option, offset) => {
      const index = view.top + offset;
      const mark = many ? (picked.has(option.value) ? "[x] " : "[ ] ") : "";
      const text = fit(terminalText(menuRow(option, width, mark)), columns);
      return index === cursor ? highlight(text) : quiet(text);
    });
    const above = view.top, below = options.length - view.top - view.size;
    return [...(above ? [quiet(`↑ ${above} more`)] : []), ...shown, ...(below ? [quiet(`↓ ${below} more`)] : []), quiet(help)];
  };
  let drawn = lines();
  write(`${questionGap()}${terminalText(question)}\n${drawn.join("\n")}\n`);
  const redraw = () => { const next = lines(); write(`\x1b[${drawn.length}A\x1b[0J${next.join("\n")}\n`); drawn = next; };
  try {
    const chosen = await new Promise<string[]>((resolve, reject) => {
      const onKey = (_: string, key: { name?: string; ctrl?: boolean }) => {
        if (key.ctrl && key.name === "c") { input.off("keypress", onKey); reject(new CliError("cancelled", "Cancelled. Nothing was submitted.", 2)); return; }
        if (key.name === "up" || key.name === "k") { cursor = (cursor - 1 + options.length) % options.length; redraw(); }
        else if (key.name === "down" || key.name === "j") { cursor = (cursor + 1) % options.length; redraw(); }
        else if (many && key.name === "space") {
          const value = options[cursor]!.value;
          if (picked.has(value)) picked.delete(value); else picked.add(value);
          redraw();
        } else if (key.name === "return") {
          input.off("keypress", onKey);
          resolve(many ? options.filter(o => picked.has(o.value)).map(o => o.value) : [options[cursor]!.value]);
        }
      };
      input.on("keypress", onKey);
    });
    // The answered question settles to one line, the way a form keeps what was filled in,
    // so the next question is not read under a wall of options nobody can change now.
    const answer = options.filter(o => chosen.includes(o.value)).map(o => o.label).join(", ") || "None";
    write(`\x1b[${drawn.length + 1}A\x1b[0J${answered(question, answer)}\n`);
    questionAnswered();
    return chosen;
  } finally {
    input.setRawMode?.(wasRaw ?? false);
    input.pause();
  }
}

export async function choose(question: string, options: PromptOption[], initial = 0): Promise<string> {
  const [value] = await menu(question, options, { initial });
  if (value === undefined) interrupted();
  return value;
}

export function chooseMany(question: string, options: PromptOption[], selected: string[] = []): Promise<string[]> {
  return menu(question, options, { many: true, selected });
}

export async function ask(question: string): Promise<string> {
  releaseTerminal();
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  // The typed answer stays on the question's line, which is its answered form.
  try { const answer = (await reader.question(`${questionGap()}${terminalText(question)} `)).trim(); questionAnswered(); return answer; }
  finally { reader.close(); }
}

export async function confirm(question: string): Promise<boolean> {
  return /^y(es)?$/i.test(await ask(`${question} (y/N)`));
}
