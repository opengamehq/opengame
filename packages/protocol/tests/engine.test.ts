import { test } from "node:test";
import assert from "node:assert/strict";
import { creatorGameSchema, operationSummarySchema } from "../src/catalog";
import { releaseEngineMetadata } from "../src/engine";

const evidence = { id: "godot", name: "Godot", version: "4.5", evidence: "game.pck and GODOT_CONFIG in index.html", also: [] };
const build = { compression: ["br"], wasmBytes: 123, largestFile: { path: "game.wasm.br", bytes: 123 }, hashedFilenames: false };

test("release readers retain measured metadata and preserve unknown threading", () => {
  const observed = releaseEngineMetadata({ engine_evidence: evidence, build_info: build });
  assert.deepEqual(observed, { engine: { ...evidence, threaded: null }, build });
  assert.equal(releaseEngineMetadata({ engine_evidence: evidence, threaded: true }).engine?.threaded, true);
  assert.equal(releaseEngineMetadata({ engine_evidence: evidence, threaded: false }).engine?.threaded, false);
});

test("missing or malformed metadata costs the observation, not the release", () => {
  assert.deepEqual(releaseEngineMetadata(null), { engine: null, build: null });
  assert.deepEqual(releaseEngineMetadata({ engine_evidence: { id: "godot" }, build_info: { ...build, wasmBytes: -1 } }), { engine: null, build: null });
  assert.equal(releaseEngineMetadata({ engine_evidence: evidence, threaded: "false", build_info: build }).engine, null);
  assert.deepEqual(releaseEngineMetadata({ engine_evidence: evidence, build_info: build }).build, build);
});

test("operation and creator schemas accept old servers and the same additive observations", () => {
  const operation = { id: "11111111-1111-4111-8111-111111111111", state: "checking", gameId: "22222222-2222-4222-8222-222222222222", releaseId: null, error: null };
  const game = { id: operation.gameId, publicId: "littleorbit", title: "Orbit", visibility: "draft", latestOperation: operation };
  assert.equal(operationSummarySchema.parse(operation).engine, undefined);
  assert.equal(creatorGameSchema.parse(game).build, undefined);
  const observed = releaseEngineMetadata({ engine_evidence: evidence, build_info: build });
  assert.deepEqual(operationSummarySchema.parse({ ...operation, ...observed }).engine, observed.engine);
  assert.deepEqual(creatorGameSchema.parse({ ...game, ...observed }).build, observed.build);
  assert.equal(creatorGameSchema.parse({ ...game, engine: null, build: null }).engine, null);
});
