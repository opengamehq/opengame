import { LIMITS } from "@opengame/shared/browser";

/**
 * `.opengameignore`: the files in a build folder that are not the game.
 *
 * A game folder is often also where its maker works, with test harnesses, probe pages and
 * screenshots beside the game. Every one of them was uploaded, and `opengame check` reported
 * the probes' missing screenshots as `missing-ref` on every run. A jam creator kept them in
 * a tools/ folder and asked for a way to say so (feedback, 25 Nov 2026). The fixed list of
 * litter (node_modules, .git, source maps) stays where it is; this is the creator's own.
 *
 * The file sits at the top of the folder that is uploaded, which is the project folder
 * unless `build.output` in opengame.json names another, and its patterns are read relative
 * to that folder. The syntax is .gitignore's:
 *
 * - one pattern a line; blank lines and lines starting with `#` are skipped, and trailing
 *   spaces are dropped unless the last one is written `\ `
 * - `*` is any run of characters within one name, `?` one character, `[abc]`, `[a-z]`,
 *   `[!abc]` and `[[:digit:]]` one character from a set, and `\` makes the next one literal
 * - `**` as a whole segment is any number of folders: `**\/x` at any depth, `a/**\/b` with
 *   any folders between, and `a/**` everything inside `a` (but not `a` itself)
 * - a pattern ending in `/` matches folders only
 * - a pattern with a `/` anywhere but its end is anchored to the top of the folder; one
 *   without matches that name at any depth
 * - `!` before a pattern brings back something an earlier line left out, unless a folder
 *   above it is left out, as in git
 *
 * One implementation for every door: the CLI walks a folder on disk, Drop a folder in the
 * browser, and the GitHub door a repository tree, and all three ask this.
 *
 * WHY NO REGULAR EXPRESSIONS, AND WHY THE CAPS. The GitHub door reads the file from any public
 * repository in the visitor's own tab. The first version built a regular expression, and
 * `*a*a*a*a*a*a*a*a*b` backtracked for seconds per path; the second matched directly but
 * decided every folder again for every file under it, and measured 8.6 s for 200 patterns
 * over 25,000 paths (reviews of 25 Nov 2026). Each folder is now decided once and kept, a
 * name is matched in time linear in its length for each star, and the patterns and their
 * length are capped in limits.json, which bounds the rest.
 */
export const IGNORE_FILE = ".opengameignore";

/** The largest .opengameignore any door reads: the manifest's own limit, since both are
 * small project files read whole before anything else. */
export const IGNORE_FILE_BYTES_MAX = LIMITS.platform.manifest.bytesMax;
/** The refusal for a list past that size, in bytes: rounded, both numbers read "64 KB". */
export const ignoreFileTooLarge = (bytes: number) =>
  `${IGNORE_FILE} is ${bytes.toLocaleString("en-GB")} bytes, and it can be at most ${IGNORE_FILE_BYTES_MAX.toLocaleString("en-GB")}. Name folders rather than every file in them.`;
const RULES_MAX = LIMITS.platform.manifest.ignoreFileRulesMax;
const LINE_CHARS_MAX = LIMITS.platform.manifest.ignoreFileLineCharsMax;
const STEPS_MAX = LIMITS.platform.manifest.ignoreFileStepsMax;

/**
 * Thrown by `ignores` when one list has cost more matching than any real list does. The caps on
 * patterns and line length bound a list's size but not its work: a star before a long literal
 * costs name length times pattern length, and a deep tree reruns every rule at each folder
 * (third review of 25 Nov 2026: an adversarial 63 KB list projected to twenty minutes over a
 * big build). Every door turns this into an `ignore_file` refusal in these words.
 */
export class IgnoreFileTooComplex extends Error {
  constructor() { super(`${IGNORE_FILE} takes too long to match against this build. Use fewer and simpler patterns, such as whole folders.`); this.name = "IgnoreFileTooComplex"; }
}

/** One character of a pattern segment, decoded once: a literal, `?`, `*`, or a set. */
type Token = { kind: "char"; char: string } | { kind: "any" } | { kind: "star" }
  | { kind: "set"; negate: boolean; chars: Set<string>; ranges: [string, string][]; test: ((char: string) => boolean)[] };
type Segment = Token[] | "**";
type Rule = { negate: boolean; directoryOnly: boolean; segments: Segment[] };

const POSIX: Record<string, (char: string) => boolean> = {
  alpha: c => /\p{L}/u.test(c), digit: c => c >= "0" && c <= "9", alnum: c => /[\p{L}\p{N}]/u.test(c),
  upper: c => /\p{Lu}/u.test(c), lower: c => /\p{Ll}/u.test(c), space: c => /\s/.test(c),
  punct: c => /[!-/:-@[-`{-~]/.test(c), xdigit: c => /[0-9a-fA-F]/.test(c), blank: c => c === " " || c === "\t",
};

function tokens(segment: string): Token[] {
  const out: Token[] = [];
  const chars = [...segment];
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i]!;
    if (char === "\\" && i + 1 < chars.length) { out.push({ kind: "char", char: chars[++i]! }); continue; }
    if (char === "?") { out.push({ kind: "any" }); continue; }
    if (char === "*") { if (out.at(-1)?.kind !== "star") out.push({ kind: "star" }); continue; }
    if (char === "[") {
      // A set runs to the next `]` that is not its first member or the end of a [:class:].
      let j = i + 1;
      const negate = chars[j] === "!" || chars[j] === "^";
      if (negate) j++;
      const members = new Set<string>(), ranges: [string, string][] = [], test: ((char: string) => boolean)[] = [];
      let first = true, closed = false;
      while (j < chars.length) {
        const at = chars[j]!;
        if (at === "]" && !first) { closed = true; break; }
        first = false;
        if (at === "[" && chars[j + 1] === ":") {
          const end = chars.indexOf(":", j + 2);
          const name = end > 0 && chars[end + 1] === "]" ? chars.slice(j + 2, end).join("") : "";
          if (POSIX[name]) { test.push(POSIX[name]); j = end + 2; continue; }
        }
        const from = at === "\\" && j + 1 < chars.length ? chars[++j]! : at;
        if (chars[j + 1] === "-" && j + 2 < chars.length && chars[j + 2] !== "]") { ranges.push([from, chars[j + 2]!]); j += 3; continue; }
        members.add(from);
        j++;
      }
      if (closed) { out.push({ kind: "set", negate, chars: members, ranges, test }); i = j; continue; }
      // An unclosed `[` is an ordinary character.
    }
    out.push({ kind: "char", char });
  }
  return out;
}

function one(token: Token, char: string): boolean {
  if (token.kind === "char") return token.char === char;
  if (token.kind === "any") return true;
  if (token.kind === "set") {
    const hit = token.chars.has(char) || token.ranges.some(([from, to]) => char >= from && char <= to) || token.test.some(test => test(char));
    return hit !== token.negate;
  }
  return false;
}

/** One name against one segment. Stars backtrack only to the most recent one, which is
 * enough for a pattern with no folder separators inside it and keeps the walk linear. */
function nameMatches(pattern: Token[], chars: readonly string[], spend: () => void): boolean {
  let p = 0, c = 0, star = -1, resume = 0;
  while (c < chars.length) {
    spend();
    const token = pattern[p];
    if (token && token.kind !== "star" && one(token, chars[c]!)) { p++; c++; continue; }
    if (token?.kind === "star") { star = p++; resume = c; continue; }
    if (star < 0) return false;
    p = star + 1; c = ++resume;
  }
  while (pattern[p]?.kind === "star") p++;
  return p === pattern.length;
}

/** The path's names against the rule's segments. `**` takes any number of names, and at the
 * end of a pattern at least one, as git reads `a/**`: everything inside `a`, not `a`. */
function segmentsMatch(segments: Segment[], names: readonly (readonly string[])[], spend: () => void): boolean {
  /* The two shapes nearly every list is made of, answered without the table: a name at any
     depth (`*.psd`, `tools`), which only the last name can match, and a pattern with no `**`,
     which matches only a path of exactly its length. */
  if (segments.length === 2 && segments[0] === "**" && segments[1] !== "**") return names.length >= 1 && nameMatches(segments[1] as Token[], names.at(-1)!, spend);
  if (!segments.includes("**")) return segments.length === names.length && segments.every((segment, i) => nameMatches(segment as Token[], names[i]!, spend));
  // reach[j]: the segments so far can consume exactly the first j names.
  let reach = new Array<boolean>(names.length + 1).fill(false);
  reach[0] = true;
  segments.forEach((segment, index) => {
    const next = new Array<boolean>(names.length + 1).fill(false);
    const last = index === segments.length - 1;
    for (let j = 0; j <= names.length; j++) {
      spend();
      if (!reach[j]) continue;
      if (segment === "**") { for (let k = last ? j + 1 : j; k <= names.length; k++) next[k] = true; break; }
      if (j < names.length && nameMatches(segment, names[j]!, spend)) next[j + 1] = true;
    }
    reach = next;
  });
  return reach[names.length]!;
}

/** A line without its trailing spaces, unless the last is escaped. A loop, not a regular
 * expression, which was quadratic on a long run of spaces. Git keeps a trailing tab. */
function trimTrailing(line: string): string {
  let end = line.length;
  while (end > 0 && line[end - 1] === " " && line[end - 2] !== "\\") end--;
  return line.slice(0, end);
}

function parseRules(text: string): { rules: Rule[]; problem: string | null } {
  const rules: Rule[] = [];
  for (const raw of text.replace(/^\uFEFF/, "").normalize("NFC").split(/\r?\n/)) {
    let line = trimTrailing(raw);
    if (!line || line.startsWith("#")) continue;
    if (line.length > LINE_CHARS_MAX) return { rules: [], problem: `A line of ${IGNORE_FILE} is ${line.length.toLocaleString("en-GB")} characters long, and a line can be at most ${LINE_CHARS_MAX.toLocaleString("en-GB")}.` };
    if (rules.length >= RULES_MAX) return { rules: [], problem: `${IGNORE_FILE} has more than ${RULES_MAX.toLocaleString("en-GB")} patterns. Name folders rather than every file in them.` };
    const negate = line.startsWith("!");
    if (negate) line = line.slice(1);
    let end = line.length;
    while (end > 0 && line[end - 1] === "/") end--;
    const directoryOnly = end < line.length;
    line = line.slice(0, end);
    const anchored = line.includes("/");
    let start = 0;
    while (line[start] === "/") start++;
    line = line.slice(start);
    if (!line) continue;
    const parts: Segment[] = line.split("/").filter(Boolean).map(part => part === "**" ? "**" as const : tokens(part))
      .filter((part, index, all) => !(part === "**" && all[index - 1] === "**"));
    // A pattern without a `/` matches the name at any depth: a leading `**`, built once.
    rules.push({ negate, directoryOnly, segments: anchored || parts[0] === "**" ? parts : ["**", ...parts] });
  }
  return { rules, problem: null };
}

export type IgnoreRules = {
  /** True when `path` (relative to the uploaded folder, `/`-separated) is left out, itself
   *  or through a folder above it. `directory` says whether the path is a folder. Throws
   *  IgnoreFileTooComplex once the list has cost more than any real list does. */
  ignores(path: string, directory?: boolean): boolean;
  /** The outermost thing that leaves `path` out: a folder above it, written with a trailing
   *  `/`, or the path itself. Null when it stays in. For saying what was left out by folder,
   *  as the CLI's notice does, rather than file by file. */
  ignoredAt(path: string, directory?: boolean): string | null;
  /** How many patterns the file holds, so a caller can say nothing when it has none. */
  readonly size: number;
  /** Why this file cannot be used, when it cannot: too many patterns, a line too long, or
   *  it leaves out the page the game starts from. Every door refuses it in these words. */
  readonly problem: string | null;
};

export function ignoreRules(text: string | null | undefined): IgnoreRules {
  const parsed = text ? parseRules(text) : { rules: [], problem: null };
  const { rules } = parsed;
  // Each folder is decided once, however many files sit under it.
  const folders = new Map<string, boolean>();
  let steps = 0;
  const spend = () => { if (++steps > STEPS_MAX) throw new IgnoreFileTooComplex(); };
  const decide = (names: string[], directory: boolean): boolean => {
    // Each name split into characters once, not once for every pattern it meets.
    const chars = names.map(name => [...name]);
    let ignored = false;
    for (const rule of rules) {
      if (rule.directoryOnly && !directory) continue;
      if (segmentsMatch(rule.segments, chars, spend)) ignored = !rule.negate;
    }
    return ignored;
  };
  const folderIgnored = (names: string[]): boolean => {
    const key = names.join("/");
    let known = folders.get(key);
    if (known === undefined) { known = decide(names, true); folders.set(key, known); }
    return known;
  };
  const ignoredAt = (path: string, directory = false): string | null => {
    if (!rules.length) return null;
    const names = path.normalize("NFC").replace(/^\/+|\/+$/g, "").split("/");
    // A folder left out takes everything in it, and nothing inside can be brought back.
    for (let depth = 1; depth < names.length; depth++) {
      if (folderIgnored(names.slice(0, depth))) return `${names.slice(0, depth).join("/")}/`;
    }
    const ignored = directory ? folderIgnored(names) : decide(names, false);
    return ignored ? names.join("/") + (directory ? "/" : "") : null;
  };
  const entry = LIMITS.bundle.entryPoint;
  return {
    size: rules.length,
    ignoredAt,
    ignores: (path, directory) => ignoredAt(path, directory) !== null,
    problem: parsed.problem ?? (ignoredAt(entry) ? `${IGNORE_FILE} leaves out ${entry}, the page the game starts from. Change the pattern that matches it, or bring it back with a line reading !/${entry}.` : null),
  };
}
