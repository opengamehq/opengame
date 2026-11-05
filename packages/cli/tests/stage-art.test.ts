import test from "node:test";
import assert from "node:assert/strict";
import { STILL_POSE, mascotFrame, parseMascot } from "@opengame/ui/mascot-art";
import { CHANGE_MS, SIDE, TOP, applyChange, burst, cleanPose, diagonal, drawSparks, stageCells, stepSparks, type Spark } from "../src/stage-art";

const coral = parseMascot("circle.classic.coral")!;
const mint = parseMascot("gem.hearts.mint") ?? parseMascot("cat.classic.mint")!;

test("at rest the body is square and level and the eyes sit on steps; a hop still squashes", () => {
  const breathing = cleanPose({ ...STILL_POSE, squashX: 0.988, squashY: 1.018, tilt: 0.04, lookX: 0.41, lookY: 0.12, turnX: -0.6 });
  assert.equal(breathing.squashX, 1);
  assert.equal(breathing.squashY, 1);
  assert.equal(breathing.tilt, 0);
  assert.equal(breathing.lookX, 1 / 3);
  assert.equal(breathing.lookY, 0);
  assert.equal(breathing.turnX, -0.5);
  const hopping = cleanPose({ ...STILL_POSE, squashY: 0.91, squashX: 1.07, lift: 0 });
  assert.equal(hopping.squashY, 0.91, "a hop lost its crouch");
});

test("a change morphs the shape over CHANGE_MS and wipes the colour instead of dithering it", () => {
  const change = { from: coral, at: 1000 };
  const mid = applyChange(STILL_POSE, mint, change, 1000 + CHANGE_MS / 2);
  assert.equal(mid.moving, true);
  assert.equal(mid.pose.fromColor, null, "the dither dissolve is still on");
  assert.equal(mid.pose.dissolve, 1);
  assert.ok(mid.wipe && mid.wipe.from === "coral" && mid.wipe.front > 0.3 && mid.wipe.front < 0.7);
  const done = applyChange(STILL_POSE, mint, change, 1000 + CHANGE_MS);
  assert.equal(done.moving, false);
  assert.equal(done.wipe, null);
  assert.equal(done.pose.morph, 1);
});

test("the wipe paints the top left in the new colour first", () => {
  const frame = mascotFrame(mint);
  const grid = stageCells(mint, cleanPose(STILL_POSE), frame, true, 28, { from: "coral", front: 0.5 });
  const columns = grid[0]!.length, rows = grid.length;
  const painted = (i: number, j: number) => grid[j]![i];
  // Find body cells either side of the front and check they differ in colour.
  let early: readonly number[] | null = null, late: readonly number[] | null = null;
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
    const cell = painted(i, j);
    if (!cell) continue;
    const d = diagonal(i, j, columns, rows);
    if (d < 0.4 && !early) early = cell;
    if (d > 0.6) late = cell;
  }
  assert.ok(early && late);
  assert.notDeepEqual(early, late);
});

test("sparks burst from the silhouette, fall, and go out", () => {
  const sparks: Spark[] = [];
  let seed = 3;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  burst(sparks, SIDE + 14, TOP + 14, 11, 0, false, random);
  assert.equal(sparks.length, 20);
  const grid = Array.from({ length: 32 }, () => Array.from({ length: 36 }, () => null as readonly [number, number, number] | null));
  drawSparks(grid, sparks, 10);
  const lit = grid.flat().filter(Boolean).length;
  assert.ok(lit >= 20, `only ${lit} cells lit`);
  for (let t = 16; t < 2000; t += 16) stepSparks(sparks, t, 0.016);
  assert.equal(sparks.length, 0, "a spark outlived its life");
  const cheer: Spark[] = [];
  burst(cheer, 18, 18, 11, 0, true, random);
  assert.ok(cheer.length > 20, "a cheer is no bigger than a change");
});
