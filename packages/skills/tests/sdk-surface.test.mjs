/**
 * The skills and the SDK they teach, held to each other in both directions.
 *
 * A skill is read by a model that will type exactly what it says. So a skill that names
 * `og.player.credential()` after the SDK removed it, or says rooms have no host
 * migration after the SDK grew one, is not a stale paragraph: it is a call that throws in
 * somebody's game, or a feature nobody uses. Both happened. Until 28 Oct 2026 no skill
 * mentioned `og.achievements` or `og.openLink`, and the multiplayer skill said there was
 * no host migration while multiplayer.ts had an opt-in adapter for it.
 *
 * This reads the SDK's SOURCE, not a build, so it runs on a fresh checkout with nothing
 * installed; packages/sdk/src is the surface a game gets. Two checks:
 *
 * - every name the skills use exists and is not `@internal`: `og.x.y` (one level into
 *   og.player, og.audio, og.fullscreen, og.achievements, og.env and og.player.avatar),
 *   `room.x`, a `room.on('event')`, `multiplayer.x` and the option keys passed to it,
 *   `board.x`, `peer.x`, `bridge.x`, `OpenGame.x`, a named import from
 *   `@opengamehq/sdk/...`, and, in the skills that teach the SDK, a bare helper name and
 *   a bare snake_case code;
 * - every public part of og, of a room and of multiplayer, every room event and option,
 *   and every value an entry exports is named by some skill, or is in UNNAMED with the
 *   reason it is left to the SDK's README.
 *
 * What it does not read, so a reviewer still has to: a peer, room or board held in a
 * variable under another name (`p.seat`, `lobby.begin()` on a createLobby result);
 * options passed through a variable rather than written in the call; a `)` inside a
 * string before the options; a result's fields (`saved.value.best`); single-word codes
 * such as `network`; and whether a code is named in the right place, since `room_full`
 * reads as valid wherever it appears.
 *
 * The extraction is regular expressions over a known file layout. A layout change that
 * blinds it would read as a clean pass, so the first test pins what it must find.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { collectSkills } from "../build.mjs";

const sdkSource = (file) => readFileSync(fileURLToPath(new URL(`../../sdk/src/${file}`, import.meta.url)), "utf8");

/** Public names the skills deliberately leave to the SDK's README, each with why. */
export const UNNAMED = Object.freeze({
  "og.dispose": "teardown for test harnesses and pages that swap games; the README's Core table has it",
  OpenGameClient: "the class behind og; a game uses the og instance",
  trustedParent: "the SDK's own origin check, exported for the og-platform adapter and tests",
});

/** Skills that teach the SDK, where a bare `camelCase` name in code is read as an SDK name. */
const SDK_SKILLS = Object.freeze(["opengame-sdk"]);

/** Bare names in those skills that are not the SDK's, each with whose they are. */
export const NOT_SDK = Object.freeze({
  requestFullscreen: "the browser's, which the game frame is refused",
  preventDefault: "the browser's, on a keyboard event inside the game frame",
  SharedArrayBuffer: "the browser's, which a threaded build needs",
});

function classBody(text, name) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => new RegExp(`^(?:export )?class ${name}\\b`).test(line));
  if (start < 0) throw new Error(`class ${name} not found`);
  const end = lines.findIndex((line, i) => i > start && line === "}");
  return lines.slice(start + 1, end);
}

/** A member is internal when the comment right above it says `@internal`. */
function internalAt(lines, index) {
  if (lines[index].includes("@internal")) return true;
  for (let i = index - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!(line.startsWith("/*") || line.startsWith("*") || line.startsWith("//") || line.endsWith("*/"))) return false;
    if (line.includes("@internal")) return true;
  }
  return false;
}

/** Members declared at the class's own indentation, excluding private and static ones. */
function members(lines, indent = "  ") {
  const found = new Map();
  const pattern = new RegExp(`^${indent}(?!private |static |protected )(?:public |override |declare )?(?:readonly |async \\*?|get |set |\\*)?([A-Za-z_$][\\w$]*)\\s*[(<=:]`);
  lines.forEach((line, index) => {
    const match = pattern.exec(line);
    if (!match || match[1] === "constructor") return;
    found.set(match[1], { internal: internalAt(lines, index) });
  });
  return found;
}

/** The getters and arrows of an object literal a member returns, such as og.player. */
function literalMembers(lines, owner) {
  const start = lines.findIndex((line) => line.startsWith(`  readonly ${owner} = `));
  if (start < 0) throw new Error(`og.${owner} not found`);
  const out = new Set();
  for (let i = start + 1; i < lines.length && !lines[i].startsWith("  }; })();"); i++) {
    const match = /^    (?:get |set |async )?([A-Za-z_$][\w$]*)\s*[(:]/.exec(lines[i]);
    if (match) out.add(match[1]);
  }
  return out;
}

/** Names an entry exports as values; `export type` and `type X` re-exports are not values. */
/** The keys of a one-line `export type Name = ...`, including any `& { ... }` it adds. */
function typeKeys(text, name) {
  const match = new RegExp(`^export type ${name} = (.*)$`, "m").exec(text);
  if (!match) throw new Error(`type ${name} not found`);
  return new Set([...match[1].matchAll(/([A-Za-z_$][\w$]*)\??:/g)].map((m) => m[1]));
}

function valueExports(text) {
  const out = new Set();
  for (const match of text.matchAll(/^export (?:async )?(?:function|class|const|let)\s+([A-Za-z_$][\w$]*)/gm)) out.add(match[1]);
  for (const match of text.matchAll(/^export const \{([^}]+)\}/gm)) for (const name of match[1].split(",")) out.add(name.trim());
  for (const match of text.matchAll(/^export \{([^}]+)\}/gm)) {
    for (const part of match[1].split(",")) {
      const name = part.trim();
      if (name && !name.startsWith("type ")) out.add(name.split(/\s+as\s+/).pop().trim());
    }
  }
  return out;
}

export function sdkSurface() {
  const index = sdkSource("index.ts");
  const client = classBody(index, "Client");
  const og = members(client);
  const nested = Object.fromEntries(["player", "audio", "fullscreen"].map((name) => [name, literalMembers(client, name)]));
  nested.achievements = new Set(members(classBody(sdkSource("achievements.ts"), "Achievements")).keys());
  const boardInterface = /export interface Leaderboard \{([\s\S]*?)\n\}/.exec(sdkSource("leaderboards.ts"))?.[1] ?? "";
  const leaderboard = new Set([...boardInterface.matchAll(/^  (\w+)\(/gm)].map((m) => m[1]));
  // Multiplayer is not part of the SDK. These sets stay so a skill that still
  // names a room or a lobby method fails the surface check.
  const room = new Set();
  const multiplayer = new Map();
  const peer = new Set();
  const entries = {
    "@opengamehq/sdk": valueExports(index),
    "@opengamehq/sdk/avatar": valueExports(sdkSource("avatar.ts")),
    "@opengamehq/sdk/bridge": valueExports(sdkSource("bridge.ts")),
    "@opengamehq/sdk/og-platform": valueExports(sdkSource("og-platform.ts")),
    "@opengamehq/sdk/radio": valueExports(sdkSource("radio.ts")),
  };
  // og.radio's methods and fields, from its `Radio` type: `radio.x` and `OpenGame.radio.x`.
  const radioType = /export type Radio = \{([\s\S]*?)\n\};/.exec(sdkSource("radio.ts"))?.[1] ?? "";
  const radio = new Set([...radioType.matchAll(/^  (?:readonly )?([A-Za-z_$][\w$]*)\s*[(:]/gm)].map((m) => m[1]));
  // The global is the core itself plus what global/bridge.ts assigns onto it.
  const assigned = /Object\.assign\(og, \{([^}]+)\}\)/.exec(sdkSource("global/bridge.ts"));
  const global = new Set([...og.keys(), ...(assigned?.[1] ?? "").split(",").map((name) => name.trim()).filter(Boolean)]);
  const options = new Set();
  const events = new Set();
  const env = typeKeys(index, "Environment");
  const avatar = typeKeys(index, "AvatarRecipe");
  const bridgeType = /export interface OpenGameBridge \{([\s\S]*?)\n\}/.exec(sdkSource("bridge.ts"))?.[1] ?? "";
  const bridge = new Set([...bridgeType.matchAll(/^  (?:readonly )?([A-Za-z_$][\w$]*)\s*[(:]/gm)].map((m) => m[1]));
  const files = readdirSync(fileURLToPath(new URL("../../sdk/src/", import.meta.url)), { recursive: true })
    .filter((file) => String(file).endsWith(".ts")).map((file) => sdkSource(String(file)));
  const text = files.join("\n");
  const declared = new Set(files.flatMap((file) => [...file.matchAll(/^(?:export )?(?:async )?(?:function|class|const|let)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1])));
  // The words an inline snake_case span in an SDK skill may be: an error code, a string
  // the SDK itself compares against, or a key the shared event and score policies allow.
  const errorCodes = new Set([...sdkSource("errors.ts").matchAll(/code: '([a-z_]+)'/g)].map((m) => m[1]));
  const limits = JSON.parse(readFileSync(fileURLToPath(new URL("../../shared/limits.json", import.meta.url)), "utf8"));
  // Not every snake_case string in the SDK: `sdk_ready` is an event name, and a skill
  // calling it an error must fail. Only strings the SDK hands back as an error, a reason
  // or a source.
  const returned = [...text.matchAll(/(?:error|reason|source):\s*'([a-z_]+)'|fail\('([a-z_]+)'(?:,\s*'([a-z_]+)')?/g)]
    .flatMap((m) => m.slice(1)).filter(Boolean);
  // Reasons the SDK returns through an expression rather than a literal argument: a
  // ternary inside fail(), and the relay fallbacks room.stats() reports as relayReason.
  // A fail() call may run onto the next line, so that line is read with it.
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (!/fail\('unavailable'|fallback\(|relayReason/.test(line)) return;
    returned.push(...[...`${line}\n${lines[i + 1] ?? ""}`.matchAll(/'([a-z]+(?:_[a-z]+)+)'/g)].map((m) => m[1]));
  });
  const vocabulary = new Set([...errorCodes, ...returned,
    ...limits.play.frameEventPropertyKeys, ...Object.keys(limits.play.scoreMeta.keys)]);
  return { og, nested, leaderboard, room, multiplayer, peer, entries, global, text, declared, options, events, env, avatar, bridge, radio, vocabulary };
}

/** Every code span and fenced block in the rendered skills, with where it came from. */
export function skillCode(skills) {
  const out = [];
  for (const skill of skills) {
    for (const [file, text] of Object.entries(skill.files)) {
      if (!file.endsWith(".md")) continue;
      const fenced = [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)];
      for (const match of fenced) out.push({ skill: skill.name, where: `${skill.name}/${file}`, code: match[1], fenced: true });
      const prose = text.replace(/```[^\n]*\n[\s\S]*?```/g, "");
      for (const match of prose.matchAll(/`([^`\n]+)`/g)) out.push({ skill: skill.name, where: `${skill.name}/${file}`, code: match[1], fenced: false });
    }
  }
  return out;
}

/* The manifest's `multiplayer` object shares a name with the room client, and skills
   name its fields in prose as `multiplayer.maxPlayers`. */
const MANIFEST_MULTIPLAYER = new Set(["maxPlayers", "mode", "lobby"]);

/** The top-level keys of each object literal passed to a multiplayer method. */
export function optionCalls(text) {
  const calls = [];
  for (const match of text.matchAll(/(?<![\w$.])multiplayer\.(host|join|joinInvite|lobby|createLobby)\(/g)) {
    let depth = 0, braces = 0, key = "", keys = [], expectKey = false;
    for (let i = match.index + match[0].length; i < text.length; i++) {
      const c = text[i];
      if (c === "(") depth++;
      else if (c === ")") { if (depth === 0) break; depth--; }
      else if (c === "{") { braces++; expectKey = braces === 1; key = ""; continue; }
      else if (c === "}") { if (braces === 1 && key) keys.push(key); braces--; key = ""; expectKey = false; continue; }
      if (braces !== 1) continue;
      if (expectKey && /[\w$]/.test(c)) key += c;
      else if (expectKey && key && /[\s:,]/.test(c)) { keys.push(key); key = ""; expectKey = c === ","; }
      else if (c === ",") { expectKey = true; key = ""; }
    }
    calls.push({ method: match[1], keys });
  }
  return calls;
}

/** Every SDK name the skills use that does not exist, or exists only as `@internal`. */
export function unknownNames(surface, code) {
  const problems = [];
  const report = (where, name, why) => problems.push(`${where}: ${name} ${why}`);
  const exported = new Set([...Object.values(surface.entries).flatMap((names) => [...names]), ...surface.global]);
  for (const { skill, where, code: raw, fenced } of code) {
    // `cyclicLerp` on its own, in a skill that teaches the SDK, names an SDK helper: it
    // must still be in the source, and not as a helper no entry exports.
    const bare = !fenced && SDK_SKILLS.includes(skill) && /^([A-Za-z_$][\w$]*)(?:\(\))?$/.exec(raw);
    if (bare && /[a-z][A-Z]|^[A-Z][a-z]+[A-Z]/.test(bare[1]) && !Object.hasOwn(NOT_SDK, bare[1])) {
      const name = bare[1];
      if (!new RegExp(`(?<![\\w$])${name}(?![\\w$])`).test(surface.text)) report(where, name, "is not in the SDK");
      else if (surface.declared.has(name) && !exported.has(name)) report(where, name, "is declared in the SDK and exported by no entry");
    }
    // A path through the global is the same path as through the import.
    const text = raw.replace(/\bOpenGame\.og\./g, "og.").replace(/\bOpenGame\.multiplayer\./g, "multiplayer.");
    for (const match of text.matchAll(/(?<![\w$.'"/@-])og((?:\.[A-Za-z_$][\w$]*)+)/g)) {
      const [first, second] = match[1].slice(1).split(".");
      const member = surface.og.get(first);
      if (!member) { report(where, `og.${first}`, "is not a member of og"); continue; }
      if (member.internal) { report(where, `og.${first}`, "is @internal"); continue; }
      const inner = first === "env" ? surface.env : surface.nested[first];
      if (inner && second !== undefined && !inner.has(second)) { report(where, `og.${first}.${second}`, `is not a member of og.${first}`); continue; }
      const third = match[1].slice(1).split(".")[2];
      if (first === "player" && second === "avatar" && third !== undefined && !surface.avatar.has(third)) report(where, `og.player.avatar.${third}`, "is not a field of the avatar recipe");
    }
    for (const match of text.matchAll(/(?:(?<![\w$.'"/@-])board|leaderboard\([^)]*\))\.([A-Za-z_$][\w$]*)/g)) {
      if (!surface.leaderboard.has(match[1])) report(where, `board.${match[1]}`, "is not a leaderboard method");
    }
    for (const match of text.matchAll(/(?<![\w$])room\.on\(\s*['"]([^'"]+)['"]/g)) {
      if (!surface.events.has(match[1])) report(where, `room.on('${match[1]}')`, "is not a room event");
    }
    for (const match of text.matchAll(/(?<![\w$'"/@-])(?:OpenGame\.)?bridge\.([A-Za-z_$][\w$]*)/g)) {
      if (!surface.bridge.has(match[1])) report(where, `bridge.${match[1]}`, "is not a bridge member");
    }
    for (const match of text.matchAll(/(?<![\w$.'"/@-])(?:OpenGame\.)?radio\.([A-Za-z_$][\w$]*)/g)) {
      if (!surface.radio.has(match[1])) report(where, `radio.${match[1]}`, "is not a member of the radio");
    }
    for (const call of optionCalls(text)) {
      for (const key of call.keys) if (!surface.options.has(key)) report(where, `multiplayer.${call.method}({ ${key} })`, "is not an option");
    }
    if (!fenced && SDK_SKILLS.includes(skill) && /^[a-z]+(?:_[a-z]+)+$/.test(raw) && !surface.vocabulary.has(raw)) {
      report(where, raw, "is not an error code, a string the SDK uses, or an allowed event or score key");
    }
    for (const match of text.matchAll(/(?<![\w$.'"/@-])room\.([A-Za-z_$][\w$]*)/g)) {
      if (!surface.room.has(match[1])) report(where, `room.${match[1]}`, "is not a member of a room");
    }
    for (const match of text.matchAll(/(?<![\w$.'"/@-])multiplayer\.([A-Za-z_$][\w$]*)/g)) {
      const name = match[1];
      const member = surface.multiplayer.get(name);
      if (MANIFEST_MULTIPLAYER.has(name)) continue;
      if (!member) report(where, `multiplayer.${name}`, "is not a member of multiplayer");
      else if (member.internal) report(where, `multiplayer.${name}`, "is @internal");
    }
    for (const match of text.matchAll(/(?<![\w$.'"/@-])peer\.([A-Za-z_$][\w$]*)/g)) {
      if (!surface.peer.has(match[1])) report(where, `peer.${match[1]}`, "is not a field of a room peer");
    }
    for (const match of text.matchAll(/(?<![\w$.'"/@-])OpenGame\.([A-Za-z_$][\w$]*)/g)) {
      if (!surface.global.has(match[1])) report(where, `OpenGame.${match[1]}`, "is not on the global");
    }
    for (const match of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](@opengamehq\/sdk(?:\/[\w-]+)?)['"]/g)) {
      const exported = surface.entries[match[2]];
      if (!exported) { report(where, match[2], "is not an entry of the SDK"); continue; }
      for (const part of match[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/)[0];
        if (name && !name.startsWith("type ") && !exported.has(name)) report(where, `${name} from ${match[2]}`, "is not exported");
      }
    }
  }
  return problems;
}

/** Every public name a game can reach that no skill names and UNNAMED does not excuse. */
export function unnamedSurface(surface, code, unnamed = UNNAMED) {
  const all = code.map((entry) => entry.code).join("\n");
  const said = (pattern) => pattern.test(all);
  const word = (name) => new RegExp(`(?<![\\w$])${name.replace(/\$/g, "\\$")}(?![\\w$])`);
  const missing = [];
  const need = (name, pattern) => { if (!Object.hasOwn(unnamed, name) && !said(pattern)) missing.push(name); };
  for (const [name, member] of surface.og) {
    if (member.internal) continue;
    need(`og.${name}`, new RegExp(`(?<![\\w$])og\\.${name}(?![\\w$])`));
  }
  for (const [owner, names] of Object.entries(surface.nested)) {
    for (const name of names) need(`og.${owner}.${name}`, new RegExp(`(?<![\\w$])og\\.${owner}\\.${name}(?![\\w$])`));
  }
  for (const name of surface.leaderboard) need(`leaderboard.${name}`, new RegExp(`\\b(?:board|leaderboard\\([^)]*\\))\\.${name}\\(`));
  for (const [name, member] of surface.multiplayer) {
    if (member.internal) continue;
    need(`multiplayer.${name}`, new RegExp(`(?<![\\w$])multiplayer\\.${name}(?![\\w$])`));
  }
  for (const name of surface.radio) need(`radio.${name}`, new RegExp(`(?<![\\w$])radio\\.${name}(?![\\w$])`));
  for (const name of surface.room) need(`room.${name}`, new RegExp(`(?<![\\w$])room\\.${name}(?![\\w$])`));
  // An event counts as named only as a room listener, `room.on('message'`, so a CLI
  // field, a method that shares its word, or Playwright's page.on('close') does not.
  for (const name of surface.events) need(`room event ${name}`, new RegExp(`(?<![\\w$])room\\.on\\(\\s*['"]${name}['"]`));
  for (const name of surface.options) need(`option ${name}`, word(name));
  for (const entry of ["@opengamehq/sdk", "@opengamehq/sdk/avatar"]) {
    for (const name of surface.entries[entry]) need(name, word(name));
  }
  return missing;
}

const { skills } = await collectSkills();
const code = skillCode(skills);
const surface = sdkSurface();

test("the extraction finds the surface it is meant to, so a blind parse cannot pass", () => {
  for (const name of ["init", "ready", "track", "player", "leaderboard", "achievements", "openLink", "fullscreen", "onPause"]) {
    assert.ok(surface.og.has(name), `og.${name} was not extracted`);
  }
  assert.equal(surface.og.get("connect")?.internal, true, "og.connect is @internal and must read as internal");
  assert.ok(surface.nested.player.has("onChange") && surface.nested.player.has("requestSignIn"));
  assert.ok(surface.nested.achievements.has("unlock"));
  assert.deepEqual([...surface.leaderboard].sort(), ["around", "me", "submit", "submitRun", "top"]);
  assert.equal(surface.room.size, 0, "the SDK has no room");
  assert.equal(surface.multiplayer.size, 0, "multiplayer is not part of the SDK");
  assert.equal(surface.entries["@opengamehq/sdk/multiplayer"], undefined);
  assert.equal(surface.entries["@opengamehq/sdk/netcode"], undefined);
  assert.ok(surface.entries["@opengamehq/sdk/avatar"].has("watchAvatar"));
  assert.ok(surface.global.has("bridge"));
  assert.equal(surface.global.has("multiplayer"), false);
  assert.deepEqual([...surface.env].sort(), ["capabilities", "connected", "embedded", "preview", "sdkVersion"]);
  assert.deepEqual([...surface.avatar].sort(), ["character", "look", "palette", "seed"]);
  for (const name of ["setHandler", "request", "env", "player", "ready"]) assert.ok(surface.bridge.has(name), `bridge.${name}`);
  for (const name of ["available", "state", "onChange", "stations", "tracks", "play", "pause", "setVolume", "mountPicker"]) assert.ok(surface.radio.has(name), `radio.${name}`);
  assert.ok(surface.entries["@opengamehq/sdk/radio"].has("radio"));
  assert.ok(surface.global.has("radio"));
  assert.equal(surface.bridge.has("send"), false, "the bridge has no room send");
  for (const code of ["invalid_event", "gesture_required", "duration_ms"]) assert.ok(surface.vocabulary.has(code), code);
  assert.ok(code.length > 200, `only ${code.length} code snippets were read from the skills`);
});

test("every SDK name a skill uses exists, and none is internal", () => {
  assert.deepEqual(unknownNames(surface, code), []);
});

test("every public part of the SDK is named by a skill or excused with a reason", () => {
  assert.deepEqual(unnamedSurface(surface, code), []);
  for (const [name, why] of Object.entries(UNNAMED)) assert.ok(why.length > 20, `${name} needs a reason`);
});

test("an excuse for a name the SDK no longer has is removed with it", () => {
  const exists = (name) => {
    const [head, tail] = name.split(".");
    if (head === "og") return surface.og.has(tail);
    if (head === "multiplayer") return surface.multiplayer.has(tail);
    return Object.values(surface.entries).some((names) => names.has(name));
  };
  assert.deepEqual(Object.keys(UNNAMED).filter((name) => !exists(name)), []);
  assert.deepEqual(Object.keys(NOT_SDK).filter((name) => exists(name)), [], "an SDK name cannot be excused as somebody else's");
});

test("each check fires on a planted defect", () => {
  const plant = (snippet) => unknownNames(surface, [{ skill: "planted", where: "planted", code: snippet, fenced: true }]);
  assert.match(plant("og.player.handel").join(), /og\.player\.handel/);
  assert.match(plant("og.credential()").join(), /og\.credential is not a member/);
  assert.match(plant("og.connect()").join(), /@internal/);
  assert.match(plant("room.migrate()").join(), /room\.migrate/);
  assert.match(plant("multiplayer.matchmake()").join(), /multiplayer\.matchmake/);
  assert.match(plant("peer.slotIndex").join(), /peer\.slotIndex/);
  assert.match(plant("OpenGame.lobbyTicket").join(), /OpenGame\.lobbyTicket/);
  assert.match(plant("import { readAvatarr } from '@opengamehq/sdk/avatar'").join(), /readAvatarr/);
  assert.match(plant("import { og } from '@opengamehq/sdk/rooms'").join(), /not an entry/);
  assert.deepEqual(plant("OpenGame.og.player.onChange(f); multiplayer.maxPlayers"), []);
  assert.match(plant("board.topScores()").join(), /board\.topScores/);
  assert.match(plant("og.leaderboard('x').best()").join(), /board\.best/);
  assert.match(plant("og.env.previewing").join(), /og\.env\.previewing/);
  assert.match(plant("og.player.avatar.looks").join(), /og\.player\.avatar\.looks/);
  assert.match(plant("room.on('joined', f)").join(), /not a room event/);
  assert.match(plant("OpenGame.bridge.requestt('init')").join(), /bridge\.requestt/);
  assert.match(plant("multiplayer.lobby({ container: el, minPlayerz: 2 })").join(), /minPlayerz|container/);
  assert.match(plant("multiplayer.host(ok ? { migrate } : {})").join(), /migrate|multiplayer.host/);
  const span = (raw, skill = "opengame-sdk") => unknownNames(surface, [{ skill, where: "planted", code: raw, fenced: false }]);
  assert.match(span("room_ful").join(), /room_ful/);
  assert.match(span("sdk_ready").join(), /sdk_ready/, "an SDK event name is not an error code");
  for (const reason of ["leaderboards_unavailable", "invalid_event", "gesture_required"]) {
    assert.deepEqual(span(reason), [], `${reason} is a reason the SDK returns`);
  }
  assert.match(span("room_full").join(), /room_full/);
  assert.deepEqual(span("room_ful", "opengame-look"), []);
  const bare = (name, skill = "opengame-sdk") => unknownNames(surface, [{ skill, where: "planted", code: name, fenced: false }]);
  assert.match(bare("cyclicLerpp").join(), /not in the SDK/);
  assert.match(bare("describeError").join(), /exported by no entry/);
  assert.deepEqual(bare("watchAvatar"), []);
  assert.deepEqual(bare("cyclicLerpp", "opengame-look"), [], "only skills that teach the SDK are read this way");

  const fewer = code.filter((entry) => !/og\.openLink/.test(entry.code));
  assert.ok(unnamedSurface(surface, fewer).includes("og.openLink"), "a skill losing its only og.openLink must fail");
  const grown = { ...surface, og: new Map([...surface.og, ["share", { internal: false }]]) };
  assert.ok(unnamedSurface(grown, code).includes("og.share"), "an SDK gaining a public member must fail");
  const roomGrown = { ...surface, room: new Set(["kick"]), events: new Set(["kicked"]), options: new Set(["region"]) };
  const missing = unnamedSurface(roomGrown, code);
  for (const name of ["room.kick", "room event kicked", "option region"]) assert.ok(missing.includes(name), `${name} must be required`);
  const withMessage = { ...surface, events: new Set(["message"]) };
  const noMessage = code.filter((entry) => !/on\(\s*['"]message['"]/.test(entry.code))
    .concat([{ skill: "opengame-verification", where: "planted", code: "page.on('message', log)", fenced: true }]);
  assert.ok(unnamedSurface(withMessage, noMessage).includes("room event message"), "a CLI field named message must not cover the event");
  const withMigration = { ...surface, options: new Set(["migration"]) };
  const noMigration = code.filter((entry) => !/migration|migrating|authority/.test(entry.code));
  assert.ok(unnamedSurface(withMigration, noMigration).includes("option migration"), "deleting the migration section must fail");
});
