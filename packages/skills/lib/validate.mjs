/**
 * The rules every shipped skill is held to, run on the RENDERED output so a template
 * cannot hide a defect the agent would read.
 *
 * Each rule exists because the skill is read by a model that will act on it literally:
 *
 * - a name that is not `opengame-...` stops the brand travelling with the install;
 * - a description without trigger phrasing is a skill no agent ever loads;
 * - a body past the line budget is context an agent pays for on every load;
 * - a reference file nothing links to is a file no agent will open, which is the
 *   "built and never called" shape this repository keeps paying for;
 * - a craft rule without its five tags reads as a universal law, when the numbers in it
 *   worked in one game at one scale;
 * - an em dash is the house style's one absolute.
 */

import { posix } from "node:path";
import { UNIT_FORMATTERS, formatValue } from "./render.mjs";

export const SKILL_LINES_MAX = 300;
/** Under 500 characters: the smallest description limit we have seen documented among
 * the agents `opengame skills add` installs for, so no agent cuts off the trigger
 * phrases that make it load the skill. */
export const DESCRIPTION_CHARS_MAX = 500;
export const RULE_TAGS = Object.freeze(["Invariant", "Technique", "Reference configuration", "Applies when", "Verify"]);
/** Tags whose text must stay free of measured numbers, so a number only ever appears
 * where it is attributed to the game it was measured in, or in how to check. */
export const NUMBER_FREE_TAGS = Object.freeze(["Invariant", "Technique", "Applies when"]);
const UNIT_NUMBER = /\d(?:[.,]\d+)?\s?(?:mm|cm|m|m²|m³|ms|s|seconds?|dB|dBFS|dBTP|LUFS|Hz|kHz|fps|%|MB|MiB|GB|KB|px|°|degrees?|k)(?![A-Za-z])/;
const EM_DASH = "\u2014";

/** `major.minor.patch`, no pre-release or build suffix: a skill is released or it is not. */
export const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Negative, zero or positive as `a` is older than, equal to or newer than `b`. */
export function compareVersions(a, b) {
  const [x, y] = [SEMVER.exec(a), SEMVER.exec(b)];
  if (!x || !y) throw new Error(`not a version: ${!x ? a : b}`);
  for (let i = 1; i <= 3; i++) if (Number(x[i]) !== Number(y[i])) return Number(x[i]) - Number(y[i]);
  return 0;
}

/**
 * The frontmatter as flat `key: value` lines, plus one nested map: `metadata`, which the
 * Agent Skills format reserves for fields of a publisher's own and which is where a
 * skill's version lives. Indented lines belong to the key above them that has no value.
 */
export function parseFrontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) return null;
  const fields = {};
  let nested = null;
  for (const line of match[1].split("\n")) {
    const child = /^ {2}([a-z][a-z-]*):\s*(.*)$/.exec(line);
    if (child) {
      if (!nested) return { error: `cannot read frontmatter line "${line}"` };
      nested[child[1]] = unquote(child[2]);
      continue;
    }
    const pair = /^([a-z][a-z-]*):\s*(.*)$/.exec(line);
    if (!pair) return { error: `cannot read frontmatter line "${line}"` };
    nested = null;
    if (pair[2].trim() === "") fields[pair[1]] = nested = {};
    else fields[pair[1]] = unquote(pair[2]);
  }
  return { fields, body: text.slice(match[0].length) };
}

function unquote(raw) {
  const value = raw.trim();
  return value.startsWith('"') && value.endsWith('"') ? JSON.parse(value) : value;
}

/**
 * Links to files shipped in the skill folder, resolved against the linking file: a
 * markdown link with a relative target, or a code span naming `references/...` or
 * `helpers/...`. External links and anchors are not files and are skipped.
 */
export function localLinks(text, from = "SKILL.md") {
  const base = posix.dirname(from);
  const links = new Set();
  for (const match of text.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)) {
    const target = match[1];
    if (/^[a-z]+:/i.test(target) || target.startsWith("/")) continue;
    links.add(posix.normalize(posix.join(base, target)));
  }
  for (const match of text.matchAll(/`((?:references|helpers)\/[A-Za-z0-9._/-]+)`/g)) links.add(match[1]);
  return links;
}

/** The `### ` rules inside `## Rules`, each with the tag lines found under it. */
export function readRules(body) {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => line.trim() === "## Rules");
  if (start < 0) return null;
  const rules = [];
  let current = null;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ")) break;
    if (line.startsWith("### ")) { current = { title: line.slice(4).trim(), line: i + 1, tags: [] }; rules.push(current); continue; }
    const tag = /^- \*\*([A-Za-z ]+):\*\*\s*(.*)$/.exec(line);
    if (tag && current) current.tags.push({ name: tag[1], text: tag[2], line: i + 1 });
  }
  return rules;
}

/**
 * Validates one rendered skill. `files` maps a path relative to the skill folder to its
 * text (binary helpers are passed as text too; they are all JavaScript).
 * Returns a list of problems, each a string naming the file and line.
 */
export function validateSkill({ name, family, files }) {
  const problems = [];
  const at = (file, line, message) => problems.push(`${name}/${file}${line ? `:${line}` : ""}: ${message}`);
  if (!/^opengame-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) at("", 0, "the folder name must be opengame-<lowercase-words>");
  const skill = files["SKILL.md"];
  if (skill === undefined) { at("SKILL.md", 0, "missing"); return problems; }

  const front = parseFrontmatter(skill);
  if (!front) at("SKILL.md", 1, "frontmatter must open the file between --- lines");
  else if (front.error) at("SKILL.md", 1, front.error);
  else {
    const { fields } = front;
    if (fields.name !== name) at("SKILL.md", 2, `name is "${fields.name}" but the folder is "${name}"`);
    const description = fields.description ?? "";
    if (!description) at("SKILL.md", 3, "description is required");
    if (description.length > DESCRIPTION_CHARS_MAX) at("SKILL.md", 3, `description is ${description.length} characters; the limit is ${DESCRIPTION_CHARS_MAX}`);
    if (!/\bUse when\b/.test(description)) at("SKILL.md", 3, 'description must say when to load it, starting a sentence with "Use when"');
    if (/[<>]/.test(description)) at("SKILL.md", 3, "description must not contain angle brackets");
    // Agents parse this block as YAML. An unquoted value with ": " or " #" in it is a
    // different document from the one written, and some loaders refuse it outright.
    if (/: | #|^[\[\]{}>|*&!%@`'"]/.test(description)) at("SKILL.md", 3, 'description must be a plain YAML value: no ": ", no " #", no leading quote or symbol');
    // The ": " ban above pushes authors toward " - " as a separator, which is the em dash
    // the house style bans, typed with a hyphen. Descriptions are sentences.
    if (/ [-\u2013] /.test(description)) at("SKILL.md", 3, 'description uses " - " as a dash; write it as sentences');
    const unknown = Object.keys(fields).filter((key) => !["name", "description", "metadata"].includes(key));
    if (unknown.length) at("SKILL.md", 1, `unexpected frontmatter keys: ${unknown.join(", ")}`);
    // The version is what a person installing from the public repository compares, and
    // what the lock file holds the content to (build.mjs), so every skill has one.
    const metadata = fields.metadata;
    if (!metadata || typeof metadata !== "object") at("SKILL.md", 1, 'metadata.version is required, as "metadata:" with an indented "version: \"1.0.0\""');
    else {
      if (typeof metadata.version !== "string" || !SEMVER.test(metadata.version)) at("SKILL.md", 1, `metadata.version must be major.minor.patch; it is "${metadata.version ?? ""}"`);
      const extra = Object.keys(metadata).filter((key) => key !== "version");
      if (extra.length) at("SKILL.md", 1, `unexpected metadata keys: ${extra.join(", ")}`);
    }
  }

  const lineCount = skill.split("\n").length;
  if (lineCount > SKILL_LINES_MAX) at("SKILL.md", 0, `${lineCount} lines; the limit is ${SKILL_LINES_MAX}. Move detail into references/`);

  for (const [file, text] of Object.entries(files)) {
    const lines = text.split("\n");
    lines.forEach((line, index) => {
      if (line.includes(EM_DASH)) at(file, index + 1, "contains an em dash");
      if (line.includes("{{") && file.endsWith(".md")) at(file, index + 1, "unresolved template braces");
    });
  }

  // Every shipped file is reachable from SKILL.md, directly or through a reference
  // that SKILL.md links, and every link lands on a shipped file.
  const reachable = new Set(["SKILL.md"]);
  const queue = ["SKILL.md"];
  while (queue.length) {
    const file = queue.shift();
    for (const link of localLinks(files[file], file)) {
      if (!Object.hasOwn(files, link)) { at(file, 0, `links ${link}, which is not shipped`); continue; }
      if (!reachable.has(link)) { reachable.add(link); if (link.endsWith(".md")) queue.push(link); }
    }
  }
  for (const file of Object.keys(files)) {
    if (!reachable.has(file)) at(file, 0, "nothing links to this file from SKILL.md or its references");
  }

  if (family === "craft") {
    const rules = front?.body ? readRules(front.body) : null;
    if (!rules) at("SKILL.md", 0, 'craft skills keep their rules under a "## Rules" heading');
    else if (!rules.length) at("SKILL.md", 0, "craft skills need at least one rule under ## Rules");
    else for (const rule of rules) {
      const found = rule.tags.map((tag) => tag.name);
      const expected = RULE_TAGS.join(" / ");
      if (found.join(" / ") !== expected) {
        // Offset by the frontmatter so the line number matches the file.
        at("SKILL.md", 0, `rule "${rule.title}" has tags ${found.join(" / ") || "none"}; expected ${expected} in that order`);
      }
      for (const tag of rule.tags) {
        if (!tag.text.trim()) at("SKILL.md", 0, `rule "${rule.title}" has an empty ${tag.name}`);
        if (NUMBER_FREE_TAGS.includes(tag.name) && UNIT_NUMBER.test(tag.text)) {
          at("SKILL.md", 0, `rule "${rule.title}": ${tag.name} states a measured number ("${UNIT_NUMBER.exec(tag.text)[0]}"); put it under Reference configuration with the game it came from`);
        }
      }
    }
  }
  return problems;
}

/**
 * Platform skills must take every enforced number from limits.json. This finds a
 * number in a SOURCE template that equals a limit, which is the shape of somebody
 * typing "200 MiB" instead of `{{mib bundle.archiveBytesMax}}`.
 *
 * Three spellings count, because the small limits are the ones prose quotes most and a
 * bare "3" is in every numbered list:
 *
 * - the raw or grouped number, for limits of 100 and up;
 * - the number with a unit, in every spelling a unit formatter in render.mjs produces
 *   ("10 minutes" for 600 seconds, "200 MiB"), for every limit;
 * - any limit followed within three words by a word from its own key, so "30 deploys
 *   an hour" is caught for `platform.deploy.perAccountPerHour` and "3 entries" for
 *   `jam.entriesPerCreator`.
 *
 * Until 4 Oct 2026 only the first existed, and every limit under 100 passed unseen.
 */
const stem = (word) => word.toLowerCase().replace(/(?:es|s)$/, "");

/**
 * A launch, kickoff or close date typed into a skill rather than written as `{{launch ...}}`.
 * launch.json is the clock every surface reads, and an owner can move it; a typed date goes
 * on telling agents the old day. Every spelling of each date is looked for, in UTC and in
 * Pacific time, with or without the year, and the copy strings themselves.
 */
export function typedLaunchDates(sourceText, launch) {
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const spellings = new Set();
  for (const iso of [launch.launchAt, launch.entriesCloseAt]) {
    const instant = new Date(iso);
    for (const timeZone of ["UTC", "America/Los_Angeles"]) {
      const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
        .formatToParts(instant).map(({ type, value }) => [type, value]));
      const day = String(Number(parts.day)), month = months[Number(parts.month) - 1];
      spellings.add(`${parts.year}-${parts.month}-${parts.day}`);
      for (const name of [month, month.slice(0, 3)]) {
        spellings.add(`${day} ${name}`);
        spellings.add(`${name} ${day}`);
      }
    }
  }
  for (const copy of [launch.kickoffCopy, launch.closeCopy]) {
    spellings.add(copy);
    const date = copy.split(",")[0];
    spellings.add(date);
    spellings.add(date.replace(new RegExp(months.join("|")), (month) => month.slice(0, 3)));
  }
  const hits = [];
  sourceText.split("\n").forEach((line, index) => {
    const bare = line.replace(/\{\{[^}]*\}\}/g, "");
    for (const spelling of spellings) {
      const escaped = spelling.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`(?<![\\w])${escaped}(?![\\w])`, "i").test(bare)) { hits.push({ line: index + 1, spelling }); break; }
    }
  });
  return hits;
}

export function handTypedLimits(sourceText, limits) {
  const leaves = [];
  const walk = (value, path) => {
    if (typeof value === "number" && Number.isFinite(value)) leaves.push({ value, path });
    else if (value && typeof value === "object" && !Array.isArray(value)) for (const [key, item] of Object.entries(value)) walk(item, [...path, key]);
  };
  walk(limits, []);
  const spellings = new Map();
  const nouns = new Map();
  for (const { value: n, path } of leaves) {
    if (n >= 100) {
      spellings.set(String(n), n);
      spellings.set(n.toLocaleString("en-US"), n);
    }
    for (const name of UNIT_FORMATTERS) {
      const text = formatValue(name, n);
      // A limit of 3 rendered as kibibytes is "0 KiB"; nobody writes that for it.
      if (n > 0 && !/^0(?![.\d])/.test(text)) spellings.set(text, n);
    }
    if (Number.isInteger(n) && n > 0) {
      const words = path.flatMap((key) => key.split(/(?=[A-Z])|_/)).map(stem).filter((word) => word.length >= 4);
      const set = nouns.get(n) ?? new Set();
      for (const word of words) set.add(word);
      nouns.set(n, set);
    }
  }
  const hits = [];
  let fenced = false;
  sourceText.split("\n").forEach((line, index) => {
    // Code examples are illustrations (a countdown of 3000 ms, a division by 1000), not
    // statements of a limit, so fenced blocks are not scanned.
    if (line.trimStart().startsWith("```")) { fenced = !fenced; return; }
    if (fenced) return;
    const bare = line.replace(/\{\{[^}]*\}\}/g, "");
    // One hit per line, naming the longest matching spelling ("200 MiB" over "200").
    let best = null;
    const consider = (spelling, value) => { if (!best || spelling.length > best.spelling.length) best = { line: index + 1, spelling, value }; };
    for (const [spelling, n] of spellings) {
      const escaped = spelling.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`(?<![\\d.,])${escaped}(?![\\d.,]*\\d)`).test(bare)) consider(spelling, n);
    }
    for (const match of bare.matchAll(/(?<![\w.,-])(\d+)(?![\d.,]*\d)((?:\s+[A-Za-z-]+){1,3})/g)) {
      const words = nouns.get(Number(match[1]));
      if (!words) continue;
      const after = match[2].trim().split(/\s+/);
      const word = after.find((candidate) => stem(candidate).length >= 4 &&
        [...words].some((noun) => noun === stem(candidate) || noun.startsWith(stem(candidate)) || stem(candidate).startsWith(noun)));
      if (word) consider(`${match[1]} ${after.slice(0, after.indexOf(word) + 1).join(" ")}`, Number(match[1]));
    }
    if (best) hits.push(best);
  });
  return hits;
}
