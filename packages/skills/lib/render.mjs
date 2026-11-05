/**
 * Skill sources are templates so that a number the platform enforces is never typed by
 * hand into an instruction an agent will follow. `{{mib bundle.archiveBytesMax}}` reads
 * `packages/shared/limits.json` at build time; a path that does not exist, or a
 * formatter nobody wrote, fails the build rather than shipping a literal "{{".
 *
 * Craft numbers are deliberately NOT templated. They are reference configurations from
 * one of our games, and they live in the skill text tagged with the game they came from.
 * Only platform numbers, the ones the CLI and the server refuse on, come from here.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { installMarkdown, npmReleaseForBuild } from "../../shared/npm-release.mjs";

const sharedRoot = new URL("../../shared/", import.meta.url);

/** `env` decides only one thing: whether this is a build scripts/release.mjs runs with the
 * switch open, which renders the install steps as published (npmReleaseForBuild says why, and
 * what its check of the variable does and does not stop). */
export function loadContext({ env = process.env } = {}) {
  const limits = JSON.parse(readFileSync(fileURLToPath(new URL("limits.json", sharedRoot)), "utf8"));
  const genres = JSON.parse(readFileSync(fileURLToPath(new URL("genres.json", sharedRoot)), "utf8")).genres;
  // The four kinds an upload can be, read like the genres so a skill never lists them by hand.
  const kinds = JSON.parse(readFileSync(fileURLToPath(new URL("game-kinds.json", sharedRoot)), "utf8")).kinds;
  // Whether the packages are on npm, which decides what `{{install cli}}` prints, and the
  // launch clock, which `{{launch opens}}` reads. Neither is typed into a skill.
  const npmRelease = npmReleaseForBuild(JSON.parse(readFileSync(fileURLToPath(new URL("npm-release.json", sharedRoot)), "utf8")), env);
  const launch = JSON.parse(readFileSync(fileURLToPath(new URL("launch.json", sharedRoot)), "utf8"));
  return { limits, genres, kinds, npmRelease, launch };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/* The launch clock is set in Pacific time (12:00 am PT on the day), so the day a skill names
   is the Pacific calendar day of the instant, which is also the UTC day for every instant
   launch.json has held. */
export function pacificDate(iso) {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) throw new Error(`launch.json has ${JSON.stringify(iso)}, which is not an instant`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "numeric", day: "numeric" })
    .formatToParts(instant).map(({ type, value }) => [type, value]));
  return `${Number(parts.day)} ${MONTHS[Number(parts.month) - 1]} ${parts.year}`;
}

/** The launch text a skill may name, by the word after `{{launch ...}}`. */
export function launchText(launch, name) {
  if (name === "opens") return pacificDate(launch.launchAt);
  if (name === "kickoff") return launch.kickoffCopy;
  if (name === "close") return launch.closeCopy;
  throw new Error(`no launch value "${name}"; use opens, kickoff or close`);
}

function lookup(limits, path) {
  let value = limits;
  for (const key of path.split(".")) {
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, key)) {
      throw new Error(`limits.json has no ${path}`);
    }
    value = value[key];
  }
  return value;
}

const grouped = (n) => Math.round(n).toLocaleString("en-US");
const trim = (n) => Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));

/**
 * Each formatter takes the raw value and returns text. Units are written out in full
 * where a person reads them, which is why `s` says "seconds" rather than "s".
 */
const FORMATTERS = {
  raw: (value) => typeof value === "object" ? JSON.stringify(value) : String(value),
  n: (value) => grouped(Number(value)),
  mib: (value) => `${trim(Number(value) / 1048576)} MiB`,
  gib: (value) => `${trim(Number(value) / 1073741824)} GiB`,
  kib: (value) => `${trim(Number(value) / 1024)} KiB`,
  s: (value) => { const seconds = Number(value) / 1000; return `${trim(seconds)} second${seconds === 1 ? "" : "s"}`; },
  seconds: (value) => `${trim(Number(value))} second${Number(value) === 1 ? "" : "s"}`,
  minutes: (value) => `${trim(Number(value) / 60)} minute${Number(value) === 60 ? "" : "s"}`,
  hours: (value) => `${trim(Number(value) / 3600)} hour${Number(value) === 3600 ? "" : "s"}`,
  percent: (value) => `${trim(Number(value) * 100)}%`,
  ratio: (value) => `${grouped(Number(value))} : 1`,
  list: (value) => Array.isArray(value) ? value.map((item) => `\`${item}\``).join(", ") : String(value),
  keys: (value) => Object.keys(value).filter((key) => !key.startsWith("_")).map((key) => `\`${key}\``).join(", "),
  // Each key with the type the policy gives it, for a map of key to type such as
  // play.scoreMeta.keys, where a name without its type is how a numeric level got sent.
  typedkeys: (value) => Object.entries(value).filter(([key]) => !key.startsWith("_")).map(([key, type]) => `\`${key}\` (${type})`).join(", "),
  labels: (value) => value.map((item) => item.label).join("; "),
  viewports: (value) => value.map((v) => `${v.width} x ${v.height}${v.primary ? " (primary)" : ""}`).join(", "),
  checktable: (value) => value.map((c) => `| \`${c.key}\` | ${c.label} | ${c.kind === "auto" ? "automatic" : "a person"} | ${c.blocking ? "yes" : "no, a warning"} |`).join("\n"),
};

/* A path may hold a hyphen because limits.json keys plan kinds by name
   (largeAssetPlans.large-game-v1), and a value under one is still a limit to quote. */
const TOKEN = /\{\{\s*([a-z]+)(?:\s+([A-Za-z0-9_.-]+))?\s*\}\}/g;

/** Renders one template. Throws with the file name and the token on any miss. */
export function render(text, context, file = "template") {
  const out = text.replace(TOKEN, (_, name, path) => {
    // A number a person deliberately quotes, such as a measurement from one of our
    // games that happens to equal a limit. Writing it this way says "not a limit".
    if (name === "literal") return path ?? "";
    // An install step: the command once npm-release.json says the packages are published,
    // the shut sentence every other surface prints before then. On a line of its own,
    // because it becomes a code block.
    if (name === "install") {
      // `cli-agent` and `sdk-agent` address the agent reading the skill: before the publish
      // they tell it to stop and send the creator for a copy, rather than write in itself.
      if (!["cli", "cli-agent", "sdk", "sdk-agent", "skills"].includes(path)) throw new Error(`${file}: {{install}} takes cli, cli-agent, sdk, sdk-agent or skills`);
      return installMarkdown(path, context.npmRelease);
    }
    if (name === "launch") {
      try { return launchText(context.launch, path); }
      catch (error) { throw new Error(`${file}: ${error.message}`); }
    }
    if (name === "genres") return context.genres.map((genre) => `\`${genre.slug}\``).join(", ");
    if (name === "genretable") return context.genres.map((genre) => `| \`${genre.slug}\` | ${genre.label} |`).join("\n");
    if (name === "kindtable") return context.kinds.map((kind) =>
      `| \`${kind.slug}\` | ${kind.help} | ${kind.basedOn ? "Required" : "Not allowed"} | ${kind.jam ? "Yes" : "No"} |`).join("\n");
    const format = FORMATTERS[name];
    if (!format) throw new Error(`${file}: unknown formatter "${name}"`);
    if (!path) throw new Error(`${file}: {{${name}}} needs a limits.json path`);
    return format(lookup(context.limits, path));
  });
  // Only an opening pair is a template: JSON examples legitimately end in "}}".
  if (out.includes("{{")) {
    const line = out.split("\n").findIndex((row) => row.includes("{{")) + 1;
    throw new Error(`${file}:${line}: unresolved template braces`);
  }
  return out;
}

export const formatterNames = Object.freeze(Object.keys(FORMATTERS));

/** The limits.json paths a template reads, which is what the public mirror keeps of that
 * file for the skills: every formatted token's path, and nothing for the tokens that read
 * the genres, the kinds, the launch clock or the install switch instead. */
export function limitPaths(text) {
  return [...text.matchAll(TOKEN)].filter(([, name, path]) => path && Object.hasOwn(FORMATTERS, name)).map(([, , path]) => path);
}

/** The formatters that turn a number into a quantity with a unit, so the hand-typed
 * limit check can look for every spelling the renderer itself would produce. */
export const UNIT_FORMATTERS = Object.freeze(["mib", "gib", "kib", "s", "seconds", "minutes", "hours", "percent"]);
export const formatValue = (name, value) => FORMATTERS[name](value);
