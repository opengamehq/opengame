/**
 * A geometry audit for a 3D game scene: floating props, buried props, solids driven
 * through each other, coplanar faces that z-fight, visible solids with no collider, and
 * a walk bot that climbs every staircase holding forward only. No GPU, no browser.
 *
 * Copy this file into the game and feed it the scene the game actually builds:
 *
 *   import { runSceneAudit, fromThreeScene } from "./scene-audit.js";
 *   const scene = fromThreeScene(THREE, world, { colliders: collisionBoxes });
 *   scene.routes = [{ name: "west stairs", from: [2, 0, 8], to: [2, 3, -4] }];
 *   const report = runSceneAudit(scene);
 *   console.log(formatReport(report));
 *   if (!report.ok) process.exitCode = 1;
 *
 * Or describe the scene directly. A part is an axis-aligned box in world metres:
 *   { id, min: [x, y, z], max: [x, y, z], solid, collider, nocollide, hangs, group, prop }
 *   solid      opaque volume a body should not pass through (default true)
 *   collider   true when the game's collision layer blocks it
 *   nocollide  a reason it is deliberately walk-through ("foliage", "decal")
 *   hangs      a reason it is held up by design ("lamp on a wire")
 *   group      parts emitted together as one object; they may touch and overlap
 *   triangles  optional [[ax,ay,az, bx,by,bz, cx,cy,cz], ...] for the coplanar check;
 *              boxes without triangles contribute their six faces
 * plus `colliders` (boxes the controller collides with), `ramps` (invisible stair
 * ramps), `groundY` (a number or a function of x and z), `floors` (walkable heights)
 * and `routes` for the walk bot.
 *
 * EVERY CHECK PLANTS A DEFECT FIRST. Before measuring the real scene, each check runs on
 * a copy with a known defect placed at a site it chooses from the real scene, and the
 * audit fails if the defect is not found. A check that examined nothing also fails.
 * Both rules exist because an audit that cannot fail reports the same clean zero as a
 * clean scene: one coplanar audit in our own games clipped triangles with inverted
 * winding and measured 0 m² on every prop, including one with 0.4 m² of z-fighting.
 *
 * Default tolerances are World at War's map-coherence reference configuration, measured
 * for a human-scale shooter in metres. Pass `tolerances` to change them for your scale.
 */

export const TOLERANCES = Object.freeze({
  floatTol: 0.12,        // a base this far above its support is floating
  contactTol: 0.08,      // parts this close are touching
  sinkTol: 0.25,         // a prop's base this far below the ground is buried
  propScale: 2.5,        // larger than this in plan or height is structure, not a prop
  penVolume: 0.02,       // overlaps smaller than this many cubic metres are rounding
  penFraction: 0.2,      // a fifth of the smaller part inside the other
  penSlack: 0.05,        // slack on "deeper than the thinner part"
  zEps: 0.002,           // faces closer than this to one plane have no depth winner
  zArea: 0.02,           // overlap smaller than this many square metres is not visible
  bodyRadius: 0.35, bodyHeight: 1.8, stepHeight: 0.42, walkSpeed: 4.9,
  stuckSeconds: 1.0, routeSeconds: 30,
});

/* ----------------------------------------------------------------- geometry basics */

const sizeOf = (p, axis) => p.max[axis] - p.min[axis];
const volumeOf = (p) => sizeOf(p, 0) * sizeOf(p, 1) * sizeOf(p, 2);
const centre = (p) => [0, 1, 2].map((a) => (p.min[a] + p.max[a]) / 2);
function overlap1(a, b, axis) { return Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]); }
function boxGap(a, b) {
  let d2 = 0;
  for (let axis = 0; axis < 3; axis++) { const gap = -overlap1(a, b, axis); if (gap > 0) d2 += gap * gap; }
  return Math.sqrt(d2);
}
const footprintsOverlap = (a, b) => overlap1(a, b, 0) > 0 && overlap1(a, b, 2) > 0;
const isSolid = (p) => p.solid !== false;
const lowestBase = new WeakMap();
/**
 * The ground under a point: `scene.groundY` as a number or a function of x and z. A
 * scene that gives neither is grounded at its lowest solid base, which is the world's
 * own floor in any scene built on one.
 */
function groundAt(scene, x, z) {
  if (typeof scene.groundY === "function") return scene.groundY(x, z);
  if (typeof scene.groundY === "number") return scene.groundY;
  if (!lowestBase.has(scene)) {
    const bases = scene.parts.filter((p) => p.visible !== false && p.solid !== false).map((p) => p.min[1]);
    lowestBase.set(scene, bases.length ? Math.min(...bases) : null);
  }
  return lowestBase.get(scene);
}
const site = (p) => centre(p).map((v) => Math.round(v * 100) / 100);

/** The six faces of a box as twelve triangles, outward facing. */
export function boxTriangles(p) {
  const [x0, y0, z0] = p.min, [x1, y1, z1] = p.max;
  const quads = [
    [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]],
    [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]],
    [[x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]], [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]],
  ];
  return quads.flatMap(([a, b, c, d]) => [[...a, ...b, ...c], [...a, ...c, ...d]]);
}

/* ------------------------------------------------------------------ the checks */

/**
 * float: a part whose base hangs above whatever is under it and which is not, through
 * any chain of contact, standing on the ground. "Attached" is derived from contact, not
 * named, and contact only counts when it leads to the ground: two crates touching each
 * other in mid-air do not hold each other up.
 */
export function checkFloat(scene, tol = TOLERANCES) {
  const parts = scene.parts.filter((p) => p.visible !== false);
  const judged = parts.filter((p) => !p.hangs);
  const surfaceUnder = (p) => {
    const [cx, , cz] = centre(p);
    let best = groundAt(scene, cx, cz);
    for (const floor of scene.floors ?? []) if (floor <= p.min[1] + tol.floatTol && (best === null || floor > best)) best = floor;
    for (const q of parts) {
      if (q === p || !footprintsOverlap(p, q) || q.max[1] > p.min[1] + tol.contactTol) continue;
      if (best === null || q.max[1] > best) best = q.max[1];
    }
    return best;
  };
  // Seed only from the ground and published floors. Seeding from "the top of whatever
  // is under me" lets two crates in mid-air hold each other up for ever.
  const grounded = new Set(parts.filter((p) => p.hangs));
  for (const p of judged) {
    const [cx, , cz] = centre(p);
    const levels = [groundAt(scene, cx, cz), ...(scene.floors ?? [])].filter((y) => y !== null);
    if (levels.some((y) => Math.abs(p.min[1] - y) <= tol.floatTol || (p.min[1] < y && p.max[1] > y))) grounded.add(p);
  }
  // Spread support through contact until nothing changes.
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of judged) {
      if (grounded.has(p)) continue;
      for (const q of grounded) if (boxGap(p, q) <= tol.contactTol) { grounded.add(p); changed = true; break; }
    }
  }
  const findings = judged.filter((p) => !grounded.has(p)).map((p) => {
    const under = surfaceUnder(p);
    const gap = under === null ? null : p.min[1] - under;
    return { id: p.id, at: site(p), why: gap === null ? "nothing under it and touching nothing that reaches the ground" : `base is ${gap.toFixed(3)} m above the surface under it and nothing holds it up` };
  });
  return { name: "float", examined: judged.length, findings };
}

const isProp = (p, tol) => p.prop ?? (Math.max(sizeOf(p, 0), sizeOf(p, 1), sizeOf(p, 2)) <= tol.propScale);

/**
 * buried: a prop whose base sits well under the floor it stands on while its top still
 * stands proud. The floor is the ground, or the highest structure (anything larger than
 * a prop) under the prop's centre whose top is below the prop's top. A part sunk deeper
 * than it is tall, or a large one, is a footing or a foundation, which is what those
 * are for, and is not judged.
 */
export function checkBuried(scene, tol = TOLERANCES) {
  const solids = scene.parts.filter((p) => p.visible !== false && isSolid(p));
  const structure = solids.filter((p) => !isProp(p, tol));
  const findings = [];
  let examined = 0;
  for (const p of solids) {
    if (!isProp(p, tol)) continue;
    const [cx, , cz] = centre(p);
    let floor = groundAt(scene, cx, cz);
    if (floor !== null && floor > p.max[1]) floor = null;
    for (const q of structure) {
      if (q === p || cx < q.min[0] || cx > q.max[0] || cz < q.min[2] || cz > q.max[2] || q.max[1] > p.max[1]) continue;
      if (floor === null || q.max[1] > floor) floor = q.max[1];
    }
    if (floor === null) continue;
    examined++;
    const depth = floor - p.min[1];
    if (depth > tol.sinkTol && depth < sizeOf(p, 1)) findings.push({ id: p.id, at: site(p), why: `base is ${depth.toFixed(3)} m under the floor it stands on` });
  }
  return { name: "buried", examined, findings };
}

/**
 * interpenetration: two solids sharing volume, judged two ways because each misses
 * what the other sees. Depth past the thinner part's own thickness catches a wall
 * through a wall; a fraction of the smaller part catches two equal crates inside each
 * other, which depth alone never can.
 */
export function checkInterpenetration(scene, tol = TOLERANCES) {
  const solids = scene.parts.filter((p) => p.visible !== false && isSolid(p) && volumeOf(p) > 0).sort((a, b) => a.min[0] - b.min[0]);
  const findings = [];
  let examined = 0;
  for (let i = 0; i < solids.length; i++) {
    const a = solids[i];
    for (let j = i + 1; j < solids.length && solids[j].min[0] < a.max[0]; j++) {
      const b = solids[j];
      if (a.group !== undefined && a.group === b.group) continue;
      examined++;
      // A prop entering a structure through its top surface is standing in it, which is
      // the buried check's question, not this one's.
      const [big, small] = volumeOf(a) >= volumeOf(b) ? [a, b] : [b, a];
      if (!isProp(big, tol) && small.max[1] > big.max[1] && small.min[1] >= big.min[1]) continue;
      const ox = overlap1(a, b, 0), oy = overlap1(a, b, 1), oz = overlap1(a, b, 2);
      if (ox <= 0 || oy <= 0 || oz <= 0) continue;
      const shared = ox * oy * oz;
      if (shared < tol.penVolume) continue;
      const smaller = Math.min(volumeOf(a), volumeOf(b));
      const thinner = Math.min(...[0, 1, 2].map((axis) => Math.min(sizeOf(a, axis), sizeOf(b, axis))));
      const depth = Math.min(ox, oy, oz);
      const fraction = shared / smaller;
      if (fraction > tol.penFraction || depth > thinner + tol.penSlack) {
        findings.push({ id: `${a.id} + ${b.id}`, at: site({ min: [0, 1, 2].map((k) => Math.max(a.min[k], b.min[k])), max: [0, 1, 2].map((k) => Math.min(a.max[k], b.max[k])) }),
          why: `${shared.toFixed(3)} m³ shared, ${(fraction * 100).toFixed(0)}% of the smaller part` });
      }
    }
  }
  return { name: "interpenetration", examined, findings };
}

/* coplanar faces --------------------------------------------------------------- */

function triNormal(t) {
  const ux = t[3] - t[0], uy = t[4] - t[1], uz = t[5] - t[2], vx = t[6] - t[0], vy = t[7] - t[1], vz = t[8] - t[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz);
  return len < 1e-12 ? null : [nx / len, ny / len, nz / len, len / 2];
}
/** Projects a triangle onto the plane's two largest axes, wound counter-clockwise. */
function project(t, n) {
  const drop = Math.abs(n[0]) > Math.abs(n[1]) ? (Math.abs(n[0]) > Math.abs(n[2]) ? 0 : 2) : (Math.abs(n[1]) > Math.abs(n[2]) ? 1 : 2);
  const [u, v] = [0, 1, 2].filter((a) => a !== drop);
  const pts = [[t[u], t[v]], [t[3 + u], t[3 + v]], [t[6 + u], t[6 + v]]];
  return area2(pts) < 0 ? pts.reverse() : pts;
}
function area2(poly) { let s = 0; for (let i = 0; i < poly.length; i++) { const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length]; s += x0 * y1 - x1 * y0; } return s / 2; }
/** Sutherland-Hodgman: the part of `subject` inside the convex counter-clockwise `clip`. */
function clipPolygon(subject, clip) {
  let output = subject;
  for (let i = 0; i < clip.length && output.length; i++) {
    const [ax, ay] = clip[i], [bx, by] = clip[(i + 1) % clip.length];
    const inside = ([x, y]) => (bx - ax) * (y - ay) - (by - ay) * (x - ax) >= 0;
    const input = output; output = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j], q = input[(j + 1) % input.length];
      const pin = inside(p), qin = inside(q);
      if (pin) output.push(p);
      if (pin !== qin) {
        const [px, py] = p, [qx, qy] = q;
        const den = (bx - ax) * (qy - py) - (by - ay) * (qx - px);
        if (Math.abs(den) > 1e-15) {
          const s = ((bx - ax) * (ay - py) - (by - ay) * (ax - px)) / den;
          output.push([px + s * (qx - px), py + s * (qy - py)]);
        }
      }
    }
  }
  return output;
}
export function overlapArea(t1, t2, n) {
  const poly = clipPolygon(project(t1, n), project(t2, n));
  if (poly.length < 3) return 0;
  // Projection onto an axis plane shrinks area by |n . axis|; undo it.
  const scale = Math.max(Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2]));
  return Math.abs(area2(poly)) / scale;
}

/**
 * coplanar: two opaque faces in one plane, facing the same way, overlapping. Neither
 * wins the depth test, so the seam crawls as the camera moves. Opposite-facing pairs
 * are ignored (only one can face the camera) and so is a down-facing face lying on a
 * floor (an underside nobody sees). Faces of one part are compared with faces of other
 * parts only: inside one mesh, a quad's two triangles share an edge and overlap by zero.
 */
export function checkCoplanar(scene, tol = TOLERANCES) {
  const faces = [];
  for (const p of scene.parts) {
    if (p.visible === false || !isSolid(p) || p.decal) continue;
    for (const t of p.triangles ?? boxTriangles(p)) {
      const n = triNormal(t);
      if (!n) continue;
      const d = n[0] * t[0] + n[1] * t[1] + n[2] * t[2];
      if (n[1] < -0.999 && (scene.floors ?? [groundAt(scene, t[0], t[2])]).some((f) => f !== null && Math.abs(-d - f) < tol.zEps)) continue;
      faces.push({ part: p.id, group: p.group, t, n, d, min: [0, 1, 2].map((a) => Math.min(t[a], t[3 + a], t[6 + a])), max: [0, 1, 2].map((a) => Math.max(t[a], t[3 + a], t[6 + a])) });
    }
  }
  const bins = new Map();
  const keyOf = (f, slot) => `${Math.round(f.n[0] * 1000)},${Math.round(f.n[1] * 1000)},${Math.round(f.n[2] * 1000)},${slot}`;
  for (const f of faces) {
    const slot = Math.floor(f.d / tol.zEps);
    const key = keyOf(f, slot);
    if (!bins.has(key)) bins.set(key, []);
    bins.get(key).push(f);
  }
  const pairs = new Map();
  let examined = 0;
  for (const f of faces) {
    const slot = Math.floor(f.d / tol.zEps);
    for (const s of [slot, slot + 1]) {
      for (const g of bins.get(keyOf(f, s)) ?? []) {
        if (g === f || g.part === f.part || (f.group !== undefined && f.group === g.group)) continue;
        if (s === slot && g.part < f.part) continue; // count each cross-part pair once
        if (f.n[0] * g.n[0] + f.n[1] * g.n[1] + f.n[2] * g.n[2] < 0.9999 || Math.abs(f.d - g.d) > tol.zEps) continue;
        let apart = false;
        for (let a = 0; a < 3; a++) if (f.min[a] > g.max[a] + tol.zEps || g.min[a] > f.max[a] + tol.zEps) { apart = true; break; }
        if (apart) continue;
        examined++;
        const area = overlapArea(f.t, g.t, f.n);
        if (area <= 0) continue;
        const key = [f.part, g.part].sort().join(" + ");
        const entry = pairs.get(key) ?? { area: 0, at: f.t.slice(0, 3) };
        entry.area += area;
        pairs.set(key, entry);
      }
    }
  }
  const findings = [...pairs].filter(([, e]) => e.area > tol.zArea).map(([id, e]) => ({ id, at: e.at.map((v) => Math.round(v * 100) / 100), area: e.area, why: `${e.area.toFixed(3)} m² of same-facing faces in one plane` }));
  return { name: "coplanar", examined: faces.length, pairsCompared: examined, findings, area: findings.reduce((sum, f) => sum + f.area, 0) };
}

/** Visible solids that no collider covers and that give no reason for it. */
export function uncollided(scene) {
  const colliders = scene.colliders ?? scene.parts.filter((p) => p.collider);
  const ramps = scene.ramps ?? [];
  const covered = (p) => p.collider === true
    || colliders.some((c) => [0, 1, 2].every((a) => c.min[a] <= p.min[a] + 0.05 && c.max[a] >= p.max[a] - 0.05))
    || ramps.some((r) => r.min[0] <= p.min[0] + 0.05 && r.max[0] >= p.max[0] - 0.05 && r.min[2] <= p.min[2] + 0.05 && r.max[2] >= p.max[2] - 0.05);
  return scene.parts.filter((p) => p.visible !== false && isSolid(p) && !p.nocollide && !covered(p));
}

/** colliders: every visible solid either blocks a body or says why it does not. */
export function checkColliders(scene) {
  const examined = scene.parts.filter((p) => p.visible !== false && isSolid(p)).length;
  const findings = uncollided(scene).map((p) => ({ id: p.id, at: site(p), why: "drawn solid with no collider and no nocollide reason: a body walks through it" }));
  return { name: "colliders", examined, findings };
}

/* the walk bot ---------------------------------------------------------------- */

function rampHeight(ramp, x, z) {
  if (x < ramp.min[0] || x > ramp.max[0] || z < ramp.min[2] || z > ramp.max[2]) return null;
  const axis = ramp.axis === "x" ? 0 : 2, at = axis === 0 ? x : z;
  let t = (at - ramp.min[axis]) / (ramp.max[axis] - ramp.min[axis]);
  if (ramp.rises === "negative") t = 1 - t;
  return ramp.min[1] + t * (ramp.max[1] - ramp.min[1]);
}

/**
 * A kinematic capsule driven with forward input only: no jump, ever. Support is the
 * highest collider top or ramp surface under the body that is within one step of the
 * feet; anything taller that overlaps the body blocks it, and the body slides along it.
 */
export function createWalker(scene, tol = TOLERANCES) {
  const boxes = (scene.colliders ?? scene.parts.filter((p) => p.collider)).filter((c) => sizeOf(c, 1) > 0);
  const ramps = scene.ramps ?? [];
  const r = tol.bodyRadius;
  const circleHitsBox = (x, z, c) => {
    const nx = Math.max(c.min[0], Math.min(x, c.max[0])), nz = Math.max(c.min[2], Math.min(z, c.max[2]));
    return (x - nx) ** 2 + (z - nz) ** 2 < r * r - 1e-9;
  };
  function support(x, z, feet) {
    let best = null;
    const ground = groundAt(scene, x, z);
    if (ground !== null && ground <= feet + tol.stepHeight) best = ground;
    for (const c of boxes) if (c.max[1] <= feet + tol.stepHeight + 1e-9 && circleHitsBox(x, z, c) && (best === null || c.max[1] > best)) best = c.max[1];
    for (const ramp of ramps) {
      const h = rampHeight(ramp, x, z);
      if (h !== null && h <= feet + tol.stepHeight && (best === null || h > best)) best = h;
    }
    return best;
  }
  function blocked(x, z, feet) {
    for (const c of boxes) {
      if (c.max[1] <= feet + tol.stepHeight + 1e-9 || c.min[1] >= feet + tol.bodyHeight) continue;
      if (circleHitsBox(x, z, c)) return true;
    }
    return false;
  }
  return {
    support, blocked,
    /** One fixed step toward `goal`. Returns the new position. */
    step(pos, goal, dt) {
      const dx = goal[0] - pos[0], dz = goal[2] - pos[2], dist = Math.hypot(dx, dz);
      let [x, y, z] = pos;
      if (dist > 1e-6) {
        const travel = Math.min(dist, tol.walkSpeed * dt);
        const substeps = Math.max(1, Math.ceil(travel / Math.max(0.05, r * 0.45)));
        const sx = (dx / dist) * travel / substeps, sz = (dz / dist) * travel / substeps;
        for (let i = 0; i < substeps; i++) {
          for (const [mx, mz] of [[sx, sz], [sx, 0], [0, sz]]) {
            const nx = x + mx, nz = z + mz;
            const under = support(nx, nz, y);
            if (blocked(nx, nz, y) || under === null) continue;
            x = nx; z = nz;
            // Step up onto the landing; fall at most one step per substep downhill.
            y = under > y ? under : Math.max(under, y - tol.stepHeight);
            break;
          }
        }
      }
      const under = support(x, z, y);
      if (under !== null && under < y) y = Math.max(under, y - 9.8 * dt);
      return [x, y, z];
    },
  };
}

/** Walks each route forward-only. A route passes when the body arrives without stalling. */
export function checkStairs(scene, tol = TOLERANCES) {
  const routes = scene.routes ?? [];
  const walker = createWalker(scene, tol);
  const visibleUncollided = uncollided(scene);
  const findings = [];
  const dt = 1 / 60;
  for (const route of routes) {
    let pos = [...route.from];
    let lastProgress = 0, best = Infinity, climbed = 0;
    const goal = route.to;
    let arrived = false;
    // One finding per route and cause. The loop runs every frame, so half a second
    // inside one uncollided wall was thirty identical findings, and formatReport's cap
    // hid the different ones behind them.
    const said = new Set();
    const once = (why) => { if (!said.has(why)) { said.add(why); findings.push({ id: route.name, at: pos.map((v) => Math.round(v * 100) / 100), why }); } };
    for (let time = 0; time < tol.routeSeconds; time += dt) {
      const before = pos[1];
      pos = walker.step(pos, goal, dt);
      climbed = Math.max(climbed, pos[1] - route.from[1]);
      if (pos[1] - before > tol.stepHeight + 1e-6) once("rose more than one step in a frame");
      const remaining = Math.hypot(goal[0] - pos[0], goal[2] - pos[2]);
      if (remaining < best - 0.05) { best = remaining; lastProgress = time; }
      if (remaining < 0.25 && Math.abs(pos[1] - goal[1]) <= tol.stepHeight) { arrived = true; break; }
      if (time - lastProgress > tol.stuckSeconds) break;
      for (const p of visibleUncollided) {
        if (pos[0] > p.min[0] && pos[0] < p.max[0] && pos[2] > p.min[2] && pos[2] < p.max[2] && pos[1] + 1 > p.min[1] && pos[1] < p.max[1]) {
          once(`walked through ${p.id}, which is drawn solid and has no collider`);
        }
      }
    }
    if (!arrived) findings.push({ id: route.name, at: pos.map((v) => Math.round(v * 100) / 100), why: `stuck holding forward with no jump, ${best.toFixed(2)} m short, after climbing ${climbed.toFixed(2)} m` });
  }
  return { name: "stairs", examined: routes.length, findings };
}

/* ------------------------------------------------------------------- the plants */

const clone = (scene) => ({ ...scene, parts: scene.parts.map((p) => ({ ...p })), colliders: scene.colliders?.map((c) => ({ ...c })), ramps: scene.ramps?.map((r) => ({ ...r })), routes: scene.routes?.map((r) => ({ ...r })) });

/**
 * Where a plant goes: open ground on the real scene, so a plant proves the check on
 * this scene's own geometry. The site is the top of a grounded structure larger than a
 * prop, with a clear column above it wide enough for every plant, searched on a grid.
 * A plant that lands inside an existing prop proves nothing about the rule, so a site
 * with anything in the column is skipped.
 */
function plantSite(scene, tol) {
  const visible = scene.parts.filter((p) => p.visible !== false);
  const floating = new Set(checkFloat(scene, tol).findings.map((f) => f.id));
  const floors = visible.filter((p) => isSolid(p) && !p.hangs && !floating.has(p.id) && sizeOf(p, 0) > tol.propScale + 0.5 && sizeOf(p, 2) > tol.propScale + 0.5)
    .sort((a, b) => sizeOf(b, 0) * sizeOf(b, 2) - sizeOf(a, 0) * sizeOf(a, 2));
  const half = 1.0, height = 3;
  for (const floor of floors) {
    const top = floor.max[1];
    for (let x = floor.min[0] + half; x <= floor.max[0] - half; x += 0.5) {
      for (let z = floor.min[2] + half; z <= floor.max[2] - half; z += 0.5) {
        const column = { min: [x - half, top + 0.001, z - half], max: [x + half, top + height, z + half] };
        if (visible.some((p) => p !== floor && overlap1(p, column, 0) > 0 && overlap1(p, column, 1) > 0 && overlap1(p, column, 2) > 0)) continue;
        return { x, y: top, z, floor };
      }
    }
  }
  return null;
}

const box = (id, x, y, z, w, h, d, extra = {}) => ({ id, min: [x - w / 2, y, z - d / 2], max: [x + w / 2, y + h, z + d / 2], collider: true, ...extra });

/** A synthetic flight of stairs with one riser too tall, and an honest flight beside it. */
export function stairScene(riser = 0.17, badRiser = null) {
  const parts = [box("ground", 0, -1, 0, 40, 1, 40)];
  let y = 0;
  for (let i = 0; i < 12; i++) {
    const rise = badRiser !== null && i === 6 ? badRiser : riser;
    y += rise;
    parts.push(box(`tread${i}`, 0, 0, -i * 0.3 - 0.15, 1.6, y, 0.3));
  }
  parts.push(box("landing", 0, 0, -3.6 - 1.5, 3, y, 3));
  return { parts, groundY: 0, routes: [{ name: badRiser ? "planted stairs" : "honest stairs", from: [0, 0, 3], to: [0, y, -5.5] }] };
}

/**
 * Each plant returns the scene with a defect added and the id the check must report.
 * Plants that need a site take it from the real scene; if the scene offers none, the
 * plant reports that rather than passing.
 */
const PLANTS = {
  float(scene, tol) {
    const s = plantSite(scene, tol); if (!s) return null;
    const copy = clone(scene);
    copy.parts.push(box("planted-float", s.x, s.y + tol.floatTol * 2.5, s.z, 0.5, 0.5, 0.5));
    return { scene: copy, id: "planted-float" };
  },
  buried(scene, tol) {
    const s = plantSite(scene, tol); if (!s) return null;
    const copy = clone(scene);
    copy.parts.push(box("planted-buried", s.x, s.y - tol.sinkTol * 2, s.z, 0.6, 1.2, 0.6, { prop: true }));
    return { scene: copy, id: "planted-buried" };
  },
  interpenetration(scene, tol) {
    const s = plantSite(scene, tol); if (!s) return null;
    const copy = clone(scene);
    copy.parts.push(box("planted-crate-a", s.x - 0.2, s.y, s.z, 0.8, 0.8, 0.8), box("planted-crate-b", s.x + 0.2, s.y, s.z, 0.8, 0.8, 0.8));
    return { scene: copy, id: "planted-crate-a + planted-crate-b" };
  },
  coplanar(scene, tol) {
    const s = plantSite(scene, tol); if (!s) return null;
    const copy = clone(scene);
    copy.parts.push(box("planted-panel-a", s.x - 0.25, s.y, s.z, 1, 1, 0.2), box("planted-panel-b", s.x + 0.25, s.y + 0.3, s.z, 1, 1, 0.2));
    return { scene: copy, id: "planted-panel-a + planted-panel-b" };
  },
  colliders(scene, tol) {
    const s = plantSite(scene, tol); if (!s) return null;
    const copy = clone(scene);
    copy.parts.push(box("planted-ghost-wall", s.x, s.y, s.z, 1.6, 2, 0.2, { collider: false }));
    return { scene: copy, id: "planted-ghost-wall" };
  },
  stairs(_scene, tol) {
    return { scene: stairScene(0.17, tol.stepHeight + 0.08), id: "planted stairs" };
  },
};

const CHECKS = { float: checkFloat, buried: checkBuried, interpenetration: checkInterpenetration, coplanar: checkCoplanar, colliders: checkColliders, stairs: checkStairs };

/**
 * Runs every check (or `only`), each after its plant. Returns
 * `{ ok, failures, checks: [{ name, examined, findings, plant }] }`. A finding is a
 * defect in the scene; a failure is a defect in the instrument or an unexamined check.
 */
export function runSceneAudit(scene, { tolerances = {}, only, notApplicable = {} } = {}) {
  const tol = { ...TOLERANCES, ...tolerances };
  const failures = [], checks = [];
  for (const [name, check] of Object.entries(CHECKS)) {
    if (only && !only.includes(name)) continue;
    const reason = notApplicable[name];
    if (typeof reason === "string" && reason.trim()) {
      checks.push({ name, examined: 0, findings: [], plant: "not applicable", reason: reason.trim() });
      continue;
    }
    const plant = PLANTS[name](scene, tol);
    let plantState = "caught";
    if (!plant) { plantState = "no site"; failures.push(`${name}: found no open grounded floor larger than a prop with a clear 2 m column to plant a defect on`); }
    else if (!check(plant.scene, tol).findings.some((f) => f.id === plant.id)) { plantState = "missed"; failures.push(`${name}: the planted defect ${plant.id} was not found, so this check cannot be trusted`); }
    const result = check(scene, tol);
    if (result.examined === 0) failures.push(`${name}: examined nothing${name === "stairs" ? "; add scene.routes for every staircase" : ""}`);
    checks.push({ ...result, plant: plantState });
  }
  const findings = checks.reduce((n, c) => n + c.findings.length, 0);
  return { ok: failures.length === 0 && findings === 0, failures, checks };
}

export function formatReport(report) {
  const lines = [];
  for (const c of report.checks) {
    if (c.reason) { lines.push(`${c.name.padEnd(17)} not applicable: ${c.reason}`); continue; }
    lines.push(`${c.name.padEnd(17)} examined ${String(c.examined).padStart(6)}  findings ${String(c.findings.length).padStart(4)}  plant ${c.plant}`);
    for (const f of c.findings.slice(0, 20)) lines.push(`  ${f.id} at (${f.at.join(", ")}): ${f.why}`);
    if (c.findings.length > 20) lines.push(`  and ${c.findings.length - 20} more`);
  }
  for (const failure of report.failures) lines.push(`FAILED ${failure}`);
  lines.push(report.ok ? "Scene audit passed." : "Scene audit did not pass.");
  return lines.join("\n");
}

/* --------------------------------------------------------------- three.js adapter */

/**
 * Reads a three.js scene into the audit's shape. Pass the THREE namespace the game
 * already imports. Mesh flags come from `userData`: `collider`, `nocollide` (a reason),
 * `hangs` (a reason), `group`, `prop`, `decal`. Transparent and alpha-tested materials
 * are not opaque volume. `colliders` may be Box3s or meshes from the collision layer.
 */
export function fromThreeScene(THREE, root, { colliders = [], groundY = null, floors, triangles = true } = {}) {
  root.updateMatrixWorld(true);
  const parts = [];
  const v = new THREE.Vector3();
  root.traverse((object) => {
    if (!object.isMesh || !object.visible || object.isSkinnedMesh) return;
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    const opaque = !material || (!material.transparent && (material.alphaTest ?? 0) === 0 && (material.opacity ?? 1) >= 1);
    const bounds = new THREE.Box3().setFromObject(object);
    if (bounds.isEmpty()) return;
    const data = object.userData ?? {};
    const part = { id: object.name || object.uuid, min: bounds.min.toArray(), max: bounds.max.toArray(), solid: opaque && !data.decal,
      collider: data.collider === true, nocollide: data.nocollide, hangs: data.hangs, group: data.group, prop: data.prop, decal: data.decal || material?.polygonOffset };
    if (triangles && object.geometry?.attributes?.position) {
      const position = object.geometry.attributes.position, index = object.geometry.index;
      const count = index ? index.count : position.count;
      const tris = [];
      for (let i = 0; i + 2 < count; i += 3) {
        const t = [];
        for (let k = 0; k < 3; k++) { v.fromBufferAttribute(position, index ? index.getX(i + k) : i + k).applyMatrix4(object.matrixWorld); t.push(v.x, v.y, v.z); }
        tris.push(t);
      }
      part.triangles = tris;
    }
    parts.push(part);
  });
  const boxes = colliders.map((c, i) => {
    const b = c.isBox3 ? c : new THREE.Box3().setFromObject(c);
    return { id: c.name || `collider${i}`, min: b.min.toArray(), max: b.max.toArray() };
  });
  return { parts, colliders: boxes.length ? boxes : undefined, groundY, floors };
}
