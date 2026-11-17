import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { manifestSchema } from "@opengame/protocol";
import { playersFlags, resolveAuto } from "../src/auto";
import { initProject } from "../src/init";
import { publishAnswers } from "../src/publish";

/* How a game is played, as opengame.json's `players` says it (17 Nov 2026): single player,
   private lobbies from X to Y players, or online from X to Y. The file says `players`; the wire
   says `multiplayer`; an older file's `multiplayer` still deploys as it did. */

const game = { title: "Tide runner", description: "Race the rain to the river before the water closes every road.", genre: "racing-sports", controls: ["keyboard"] };
const resolved = async (value: Record<string, unknown>) => {
  const out = await resolveAuto({ ...game, ...value }, tmpdir());
  return { manifest: manifestSchema.parse(out.value), auto: out.auto };
};

test("players in the file becomes multiplayer on the wire, in each of its three modes", async () => {
  assert.deepEqual((await resolved({ players: "single" })).manifest.multiplayer, { mode: "none", maxPlayers: 1 });
  assert.deepEqual((await resolved({ players: { mode: "single" } })).manifest.multiplayer, { mode: "none", maxPlayers: 1 });
  assert.deepEqual((await resolved({ players: { mode: "private", min: 2, max: 8 } })).manifest.multiplayer,
    { mode: "p2p", minPlayers: 2, maxPlayers: 8, lobbies: "private" });
  assert.deepEqual((await resolved({ players: { mode: "online", min: 1, max: 16 } })).manifest.multiplayer,
    { mode: "p2p", minPlayers: 1, maxPlayers: 16, lobbies: "online" });
  // No min is from two: played together only.
  assert.equal((await resolved({ players: { mode: "online", max: 4 } })).manifest.multiplayer?.minPlayers, 2);
  assert.equal("players" in (await resolved({ players: "single" })).manifest, false, "the wire never carries players");
});

test("players left out, blank or auto is Auto: no multiplayer is sent, and nothing is named provisional for it", async () => {
  for (const value of [{}, { players: "auto" }, { players: "" }, { players: null }]) {
    const { manifest, auto } = await resolved(value);
    assert.equal(manifest.multiplayer, undefined, JSON.stringify(value));
    assert.ok(auto.includes("players"), JSON.stringify(value));
  }
});

test("an older file's multiplayer deploys as it did, and a file cannot say both", async () => {
  const old = await resolved({ multiplayer: { mode: "p2p", maxPlayers: 4 } });
  assert.deepEqual(old.manifest.multiplayer, { mode: "p2p", maxPlayers: 4 });
  assert.equal(old.auto.includes("players"), false, "an old file that says how it is played is not Auto");
  assert.deepEqual((await resolved({ multiplayer: { mode: "none", maxPlayers: 1 } })).manifest.multiplayer, { mode: "none", maxPlayers: 1 });
  await assert.rejects(resolved({ players: "single", multiplayer: { mode: "none", maxPlayers: 1 } }), /both players and multiplayer/);
});

test("players the file gets wrong is refused with what it takes", async () => {
  await assert.rejects(resolved({ players: { mode: "private", min: 6, max: 4 } }), /no larger than the largest/);
  await assert.rejects(resolved({ players: { mode: "online", max: 99 } }), /players:/);
  await assert.rejects(resolved({ players: "lots" }), /players:/);
  await assert.rejects(resolved({ players: { mode: "private" } }), /players:/);
});

test("--players, --min-players and --max-players read as players does", () => {
  assert.equal(playersFlags({}), undefined);
  assert.equal(playersFlags({ players: "auto" }), "auto");
  assert.deepEqual(playersFlags({ players: "single" }), { mode: "single" });
  assert.deepEqual(playersFlags({ players: "Private", "max-players": "8" }), { mode: "private", min: 2, max: 8 });
  assert.deepEqual(playersFlags({ players: "online", "min-players": "1", "max-players": "16" }), { mode: "online", min: 1, max: 16 });
  assert.throws(() => playersFlags({ players: "online" }), /--max-players/);
  assert.throws(() => playersFlags({ "max-players": "4" }), /--players private/);
  assert.throws(() => playersFlags({ players: "single", "max-players": "4" }), /takes no/);
  assert.throws(() => playersFlags({ players: "co-op", "max-players": "4" }), /single, private, online or auto/);
  assert.throws(() => playersFlags({ players: "online", "max-players": "four" }), /whole number/);
  assert.throws(() => playersFlags({ players: "online", "min-players": "5", "max-players": "4" }), /--min-players/);
});

test("publish sends players only when told, since leaving it out is what the page would send", () => {
  assert.equal(publishAnswers({}).players, undefined);
  assert.equal(publishAnswers({ players: "auto" }).players, undefined);
  assert.deepEqual(publishAnswers({ players: "private", "min-players": "2", "max-players": "8" }).players, { mode: "private", min: 2, max: 8 });
});

test("init writes players as Auto, or what the flags say", async () => {
  const folder = await mkdtemp(join(tmpdir(), "og-players-"));
  await writeFile(join(folder, "index.html"), "<!doctype html><title>Tide runner</title><canvas></canvas>");
  await initProject(folder, { title: "Tide runner" });
  assert.equal(JSON.parse(await readFile(join(folder, "opengame.json"), "utf8")).players, "auto");
  const flagged = await mkdtemp(join(tmpdir(), "og-players-"));
  await writeFile(join(flagged, "index.html"), "<!doctype html><title>Tide runner</title><canvas></canvas>");
  await initProject(flagged, { title: "Tide runner", players: "online", "min-players": "1", "max-players": "16" });
  assert.deepEqual(JSON.parse(await readFile(join(flagged, "opengame.json"), "utf8")).players, { mode: "online", min: 1, max: 16 });
});
