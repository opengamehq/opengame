// Run with `node --test`. Pins the two checks added in 1.1.0: colliders with nothing
// drawn (invisible walls) and ties measured on a quantised vertex grid. The package's
// own suite covers the older checks.
import test from "node:test";
import assert from "node:assert/strict";
import { runSceneAudit, checkInvisible, checkCoplanar, stairScene, formatReport, fromThreeScene, TOLERANCES } from "./scene-audit.js";

const box = (id, min, max, extra = {}) => ({ id, min, max, ...extra });

function yard() {
  return {
    groundY: 0,
    parts: [
      box("ground", [-20, -1, -20], [20, 0, 20], { collider: true }),
      box("crate", [2, 0, 2], [3, 1, 3]),
      box("bush", [6, 0, 6], [7, 1.2, 7], { nocollide: "foliage" }),
    ],
    colliders: [
      box("ground-collider", [-20, -1, -20], [20, 0, 20]),
      box("crate-collider", [1.95, 0, 1.95], [3.05, 1.05, 3.05]),
    ],
  };
}

test("a collider with nothing drawn in it is an invisible wall", () => {
  const scene = yard();
  assert.deepEqual(checkInvisible(scene).findings, [], "a collider a little larger than its crate is drawn");
  scene.colliders.push(box("leftover gate", [-5, 0, -5], [-3, 2.2, -4.8]));
  const ids = checkInvisible(scene).findings.map((f) => f.id);
  assert.deepEqual(ids, ["leftover gate"]);
});

test("a collider the player can see the reason for says so, and is not reported", () => {
  const scene = yard();
  scene.colliders.push(box("map edge", [19, 0, -20], [20, 3, 20], { nodraw: "behind the visible cliff fence" }));
  assert.deepEqual(checkInvisible(scene).findings, []);
  scene.colliders.at(-1).nodraw = "   ";
  assert.deepEqual(checkInvisible(scene).findings.map((f) => f.id), ["map edge"], "a blank reason is no reason");
});

test("a collider over nothing but foliage blocks where only walk-through things are drawn", () => {
  const scene = yard();
  scene.colliders.push(box("bush-collider", [6, 0, 6], [7, 1.2, 7]));
  assert.deepEqual(checkInvisible(scene).findings.map((f) => f.id), ["bush-collider"]);
});

test("collision under the ground is not an invisible wall", () => {
  const scene = yard();
  scene.colliders.push(box("deep slab", [-10, -6, -10], [10, 0, 10]));
  assert.deepEqual(checkInvisible(scene).findings, []);
});

test("the audit plants an invisible wall in either kind of scene and catches it", () => {
  for (const scene of [yard(), stairScene(0.17)]) {
    const report = runSceneAudit(scene);
    const invisible = report.checks.find((c) => c.name === "invisible");
    assert.equal(invisible.plant, "caught", formatReport(report));
    assert.ok(invisible.examined > 0);
  }
});

test("ties are measured in steps of the shipped vertex grid", () => {
  // Two slabs whose tops are 3 mm apart: clear of a 2 mm float tolerance, but a format
  // storing positions on a 2.2 mm grid can round them into one plane. Offset in x and z
  // so only the horizontal faces can share a plane.
  const slab = (id, y, x0, extra = {}) => box(id, [x0, y - 0.1, x0], [x0 + 2, y, x0 + 2], extra);
  const parts = [slab("a", 1, 0), slab("b", 1.003, 0.5)];
  assert.equal(checkCoplanar({ parts }).findings.length, 0, "float positions resolve 3 mm");
  const quantised = [slab("a", 1, 0, { gridStep: 0.0022 }), slab("b", 1.003, 0.5)];
  assert.equal(checkCoplanar({ parts: quantised }).findings.length, 1, "two steps of the coarser grid tie them");
  assert.equal(checkCoplanar({ parts }, { ...TOLERANCES, gridStep: 0.0022 }).findings.length, 1, "a scene-wide grid does the same");
  const lifted = [slab("a", 1, 0, { gridStep: 0.0022 }), slab("b", 1.01, 0.5)];
  assert.equal(checkCoplanar({ parts: lifted }).findings.length, 0, "a lift past two steps resolves");
});

test("a leftover gate whose collider runs deep underground is still an invisible wall", () => {
  const scene = yard();
  scene.colliders.push(box("buried gate", [-5, -8, -5], [-3, 2.2, -4.8]));
  assert.deepEqual(checkInvisible(scene).findings.map((f) => f.id), ["buried gate"], "the share is of the part above ground");
});

test("decals do not count as drawn, and a flat lid with nothing drawn is reported", () => {
  const scene = yard();
  scene.parts.push(box("poster", [-8, 0, -8], [-6, 2, -7.99], { decal: true }));
  scene.colliders.push(box("poster-collider", [-8, 0, -8.1], [-6, 2, -7.9]));
  scene.colliders.push(box("roof lid", [10, 3, 10], [14, 3, 14]));
  assert.deepEqual(checkInvisible(scene).findings.map((f) => f.id).sort(), ["poster-collider", "roof lid"]);
});

test("the three.js adapter reads hidden collision meshes as undrawn colliders, and a Box3 can carry nodraw", async () => {
  let THREE;
  try { THREE = await import("three"); } catch { return; } // the package suite has three; a copied helper may not
  const world = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.BoxGeometry(40, 1, 40), new THREE.MeshStandardMaterial());
  ground.position.set(0, -0.5, 0); ground.userData.collider = true; world.add(ground);
  const ghost = new THREE.Mesh(new THREE.BoxGeometry(2, 2.2, 0.2), new THREE.MeshBasicMaterial({ visible: false }));
  ghost.name = "hidden gate"; ghost.position.set(-4, 1.1, -4.9); ghost.userData.collider = true; world.add(ghost);
  const edge = new THREE.Box3(new THREE.Vector3(19, 0, -20), new THREE.Vector3(20, 3, 20));
  edge.nodraw = "behind the cliff fence";
  const scene = fromThreeScene(THREE, world, { colliders: [], groundY: 0 });
  assert.deepEqual(checkInvisible(scene).findings.map((f) => f.id), ["hidden gate"]);
  const withEdge = fromThreeScene(THREE, world, { colliders: [edge], groundY: 0 });
  assert.equal(withEdge.colliders[0].nodraw, "behind the cliff fence");
  // A hidden collision mesh that says why it stops the player keeps its reason.
  ghost.userData.nodraw = "the gate's bars";
  assert.deepEqual(checkInvisible(fromThreeScene(THREE, world, { colliders: [], groundY: 0 })).findings, []);
});

test("on a quantised grid the coplanar plant sits between the steps, and is caught", () => {
  const scene = stairScene(0.17);
  for (const p of scene.parts) p.gridStep = 0.004;
  const report = runSceneAudit(scene, { only: ["coplanar"] });
  assert.equal(report.checks[0].plant, "caught", formatReport(report));
});
