/**
 * The helpers an agent copies into a game. Each helper carries its own `selfTest`,
 * which plants the defect it exists to prevent; these tests run that, and then pin the
 * behaviours a game depends on from outside, so a self-test that quietly stopped
 * planting anything cannot pass on its own say-so.
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import * as springs from "../skills/opengame-game-feel/helpers/spring.js";
import * as pool from "../skills/opengame-lighting/helpers/light-pool.js";
import * as audio from "../skills/opengame-audio/helpers/audio-chain.js";
import * as audit from "../skills/opengame-scene-audit/helpers/scene-audit.js";

test("every helper self-test passes and examines something", () => {
  for (const [name, helper] of Object.entries({ springs, pool, audio, audit: { selfTest: () => {
    const report = audit.runSceneAudit(audit.stairScene(0.17));
    return { ok: report.ok, examined: report.checks.length, failures: report.failures };
  } } })) {
    const result = helper.selfTest();
    assert.deepEqual(result.failures, [], name);
    assert.equal(result.ok, true, name);
    assert.ok(result.examined > 0, `${name} examined nothing`);
  }
});

test("the closed-form spring is exact across frame rates and the Euler spring is not", () => {
  assert.deepEqual(springs.springProperties(springs.spring), []);
  const euler = (s, t, o, dt) => { s.v += (-o * o * (s.x - t) - 2 * o * s.v) * dt; s.x += s.v * dt; return s.x; };
  const failures = springs.springProperties(euler);
  assert.ok(failures.some((f) => f.includes("unstable at 20 fps")), failures.join("; "));
  assert.ok(failures.some((f) => f.includes("frame-rate dependent")), failures.join("; "));
  // One 50 ms frame lands where five 10 ms frames do.
  const a = { x: 0, v: 1 }, b = { x: 0, v: 1 };
  springs.spring(a, 0, 22, 0.05);
  for (let i = 0; i < 5; i++) springs.spring(b, 0, 22, 0.01);
  assert.ok(Math.abs(a.x - b.x) < 1e-12 && Math.abs(a.v - b.v) < 1e-12);
});

test("hitstop freezes the simulation and hands back the rest of a frame", () => {
  const stop = springs.createHitstop();
  assert.equal(stop.step(0.016), 0.016);
  stop.hold(0.05);
  assert.equal(stop.frozen, true);
  assert.equal(stop.step(0.04), 0);
  assert.ok(Math.abs(stop.step(0.04) - 0.03) < 1e-12);
  assert.equal(stop.frozen, false);
});

test("the light pool never changes its light count and never moves a lit light to a new source", () => {
  const measured = pool.measurePool(() => pool.createLightPool());
  assert.equal(measured.countChanges, 0);
  assert.equal(measured.litTeleports, 0);
  assert.equal(measured.pops, 0);
  const result = pool.selfTest();
  assert.ok(result.measured.ranked.litTeleports > 0, "the ranked plant must teleport");
  assert.ok(result.measured.twitchy.reassignments > result.measured.real.reassignments * 2);
});

test("an empty pool slot is dark, and a vanished source fades out where it stood", () => {
  const p = pool.createLightPool({ size: 2, fadeSeconds: 0.1 });
  const lamp = { id: "a", x: 1, y: 2, z: 3, intensity: 10, range: 10 };
  let slots = p.update(1 / 60, [lamp], { x: 0, y: 0, z: 0 });
  assert.equal(slots.length, 2);
  assert.equal(slots[1].intensity, 0);
  for (let i = 0; i < 10; i++) slots = p.update(1 / 60, [lamp], { x: 0, y: 0, z: 0 });
  assert.ok(slots[0].intensity > 0);
  const lit = slots[0].intensity;
  slots = p.update(1 / 60, [], { x: 0, y: 0, z: 0 });
  assert.ok(slots[0].intensity < lit && slots[0].intensity > 0, "fades rather than cutting");
  assert.deepEqual([slots[0].x, slots[0].y, slots[0].z], [1, 2, 3]);
  for (let i = 0; i < 10; i++) slots = p.update(1 / 60, [], { x: 0, y: 0, z: 0 });
  assert.equal(slots[0].intensity, 0);
  assert.equal(slots[0].sourceId, null);
});

test("every audio bus reaches the output only through the limiter and the soft clip", () => {
  const chain = audio.createMasterChain(audio.createFakeAudioContext());
  assert.deepEqual(audio.chainProperties(chain), []);
  assert.equal(chain.clip.oversample, "4x");
  const curve = audio.softClipCurve();
  assert.ok(Math.max(...curve.map(Math.abs)) <= 0.97 + 1e-6);
  // Unity below the knee: a quarter-scale signal passes unchanged.
  const index = Math.round(((0.25 + 1) / 2) * (curve.length - 1));
  const x = (index / (curve.length - 1)) * 2 - 1;
  assert.ok(Math.abs(curve[index] - x) < 1e-6);
});

test("the voice pool steals the quietest unprotected voice with a 6 ms fade", () => {
  const steal = audio.stealBehaviour((chain) => audio.createVoicePool(chain, { max: 6 }), audio.createMasterChain(audio.createFakeAudioContext()));
  assert.deepEqual(audio.stealFailures(steal), []);
  assert.equal(steal.gain, 0.2);
});

test("a voice pool reclaims finished voices by their scheduled end, not by onended", () => {
  const ctx = audio.createFakeAudioContext();
  const voices = audio.createVoicePool(audio.createMasterChain(ctx), { max: 2 });
  voices.play({ duration: 0.5 }); voices.play({ duration: 0.5 });
  ctx.currentTime = 1;
  voices.play({ duration: 0.5 });
  assert.equal(voices.stats.stolen, 0, "two finished voices were free without any onended event");
  assert.equal(voices.active, 1);
});

test("a duck holds the bus at full level for its lead, then lowers it", () => {
  assert.equal(audio.duckHoldsLead(audio.createMasterChain(audio.createFakeAudioContext())), true);
  const noLead = audio.createMasterChain(audio.createFakeAudioContext(), { duck: { ...audio.CHAIN_DEFAULTS.duck, leadSeconds: 0 } });
  assert.equal(audio.duckHoldsLead(noLead), false);
});

/* --------------------------------------------------------------------- scene audit */

function room() {
  const scene = audit.stairScene(0.17);
  scene.parts.push({ id: "crate", min: [5, 0, 5], max: [6, 1, 6], collider: true });
  scene.parts.push({ id: "lamp", min: [5, 3, 5], max: [5.3, 3.3, 5.3], hangs: "on a wire", nocollide: "out of reach" });
  return scene;
}

test("a clean scene passes every check, and every plant is caught on it", () => {
  const report = audit.runSceneAudit(room());
  assert.deepEqual(report.failures, []);
  assert.equal(report.ok, true, audit.formatReport(report));
  for (const check of report.checks) {
    assert.equal(check.plant, "caught", check.name);
    assert.ok(check.examined > 0, check.name);
  }
});

test("each defect is named with its part and position", () => {
  const scene = room();
  scene.parts.push({ id: "floating crate", min: [8, 0.5, 8], max: [9, 1.5, 9], collider: true });
  scene.parts.push({ id: "buried barrel", min: [-6, -0.6, 6], max: [-5.4, 0.6, 6.6], collider: true });
  scene.parts.push({ id: "crate A", min: [8, 0, -8], max: [9, 1, -7], collider: true });
  scene.parts.push({ id: "crate B", min: [8.5, 0, -8], max: [9.5, 1, -7], collider: true });
  scene.parts.push({ id: "ghost wall", min: [-8, 0, -8], max: [-2, 3, -7.8] });
  const report = audit.runSceneAudit(scene);
  const ids = Object.fromEntries(report.checks.map((c) => [c.name, c.findings.map((f) => f.id)]));
  assert.deepEqual(ids.float, ["floating crate"]);
  assert.deepEqual(ids.buried, ["buried barrel"]);
  assert.deepEqual(ids.interpenetration, ["crate A + crate B"]);
  assert.deepEqual(ids.coplanar, ["crate A + crate B"]);
  assert.deepEqual(ids.colliders, ["ghost wall"]);
  assert.equal(report.ok, false);
});

test("two crates stacked in mid-air do not hold each other up", () => {
  const scene = room();
  scene.parts.push({ id: "upper", min: [8, 2, 8], max: [9, 3, 9], collider: true }, { id: "lower", min: [8, 1, 8], max: [9, 2, 9], collider: true });
  const ids = audit.checkFloat(scene).findings.map((f) => f.id).sort();
  assert.deepEqual(ids, ["lower", "upper"]);
});

test("equal crates halfway inside each other are caught by the fraction rule, which depth alone misses", () => {
  const scene = { parts: [{ id: "a", min: [0, 0, 0], max: [1.2, 1.2, 1.2] }, { id: "b", min: [0.6, 0, 0], max: [1.8, 1.2, 1.2] }] };
  assert.equal(audit.checkInterpenetration(scene).findings.length, 1);
  const depthOnly = audit.checkInterpenetration(scene, { ...audit.TOLERANCES, penFraction: Infinity });
  assert.equal(depthOnly.findings.length, 0, "the depth rule alone cannot see this");
  // A wall corner overlapping by one thickness is a joint.
  const corner = { parts: [{ id: "w1", min: [0, 0, 0], max: [4, 3, 0.2] }, { id: "w2", min: [0, 0, 0], max: [0.2, 3, 4] }] };
  assert.equal(audit.checkInterpenetration(corner).findings.length, 0);
});

test("coplanar faces need the same facing, the same plane within 2 mm and real overlap", () => {
  // Offset in x and z so only the horizontal faces can share a plane.
  const slab = (id, y, x0 = 0, z0 = 0) => ({ id, min: [x0, y - 0.1, z0], max: [x0 + 2, y, z0 + 2] });
  assert.equal(audit.checkCoplanar({ parts: [slab("a", 1), slab("b", 1.0015, 0.5, 0.5)] }).findings.length, 1, "1.5 mm apart fights");
  assert.equal(audit.checkCoplanar({ parts: [slab("a", 1), slab("b", 1.004, 0.5, 0.5)] }).findings.length, 0, "4 mm apart resolves");
  assert.equal(audit.checkCoplanar({ parts: [slab("a", 1), slab("b", 1, 2, 0)] }).findings.length, 0, "butted edge to edge overlaps by zero");
  const area = audit.checkCoplanar({ parts: [slab("a", 1), slab("b", 1, 1, 0.5)], groundY: 0 }).area;
  assert.ok(Math.abs(area - 3) < 1e-6, `tops and bottoms each overlap 1 x 1.5 m, measured ${area}`);
  const resting = audit.checkCoplanar({ parts: [slab("a", 1), slab("b", 1, 1, 0.5)], floors: [0.9] }).area;
  assert.ok(Math.abs(resting - 1.5) < 1e-6, `undersides lying on a floor are not visible, measured ${resting}`);
  const lowest = audit.checkCoplanar({ parts: [slab("a", 1), slab("b", 1, 1, 0.5)] }).area;
  assert.ok(Math.abs(lowest - 1.5) < 1e-6, "with no ground given, the lowest base is the floor");
});

test("the walk bot climbs honest stairs and stalls on a riser taller than a step", () => {
  assert.deepEqual(audit.checkStairs(audit.stairScene(0.17)).findings, []);
  const stuck = audit.checkStairs(audit.stairScene(0.17, 0.5)).findings;
  assert.equal(stuck.length, 1);
  assert.match(stuck[0].why, /stuck holding forward/);
});

test("a route through one uncollided wall is one finding, not one per frame", () => {
  const scene = {
    parts: [{ id: "ground", min: [-20, -1, -20], max: [20, 0, 20], collider: true },
      { id: "painted wall", min: [-3, 0, -2], max: [3, 2, -1] }],
    groundY: 0, routes: [{ name: "corridor", from: [0, 0, 2], to: [0, 0, -6] }],
  };
  const walked = audit.checkStairs(scene).findings.filter((f) => /walked through/.test(f.why));
  assert.equal(walked.length, 1, `got ${walked.length}`);
  assert.match(walked[0].why, /painted wall/);
});

test("an invisible ramp carries the body up stairs whose treads are not colliders", () => {
  const treads = Array.from({ length: 10 }, (_, i) => ({ id: `tread${i}`, min: [-0.8, 0, -i * 0.3 - 0.3], max: [0.8, (i + 1) * 0.2, -i * 0.3], nocollide: "the ramp carries the body" }));
  const scene = {
    parts: [{ id: "ground", min: [-20, -1, -20], max: [20, 0, 20], collider: true }, ...treads, { id: "landing", min: [-1.5, 0, -6], max: [1.5, 2, -3], collider: true }],
    ramps: [{ min: [-0.8, 0, -3], max: [0.8, 2, 0], axis: "z", rises: "negative" }],
    groundY: 0, routes: [{ name: "ramp stairs", from: [0, 0, 2], to: [0, 2, -4.5] }],
  };
  assert.deepEqual(audit.checkStairs(scene).findings, []);
});

test("the three.js adapter reads world boxes, flags and triangles from a real scene", () => {
  const world = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 0.2, 20), new THREE.MeshStandardMaterial());
  floor.position.set(0, -0.1, 0); floor.name = "floor"; floor.userData.collider = true;
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  crate.position.set(3, 0.8, 3); crate.name = "crate"; crate.userData.collider = true;
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.05), new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.3 }));
  glass.position.set(-3, 0.5, 0); glass.name = "glass";
  world.add(floor, crate, glass);
  const scene = audit.fromThreeScene(THREE, world);
  const byId = Object.fromEntries(scene.parts.map((p) => [p.id, p]));
  assert.deepEqual(byId.crate.min.map((v) => Math.round(v * 100) / 100), [2.5, 0.3, 2.5]);
  assert.equal(byId.crate.triangles.length, 12);
  assert.equal(byId.glass.solid, false);
  const floats = audit.checkFloat(scene).findings.map((f) => f.id);
  assert.deepEqual(floats, ["crate"], "the crate sits 0.3 m above the floor");
  assert.equal(audit.checkColliders(scene).findings.length, 0, "glass is not opaque volume");
});
