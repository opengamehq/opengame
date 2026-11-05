import * as THREE from "three";
import { og } from "@opengamehq/sdk";
import manifest from "../opengame.json";

await og.init({ manifest });

/* A jam entry is judged by people playing it, so the parts every game needs are here
 * already: a title screen, a pause menu that does not depend on Escape (Safari and
 * Firefox take Escape to leave fullscreen), results with a retry, a leaderboard, and
 * the ready signal. Replace the dodging game in `world` and `update` with yours. */

const SPEED = 9;
const ARENA = 10;

const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector("#game"), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0b);
scene.fog = new THREE.Fog(0x0a0a0b, 16, 36);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(0, 16, 14);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight(0xbcc8ff, 0x202024, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 1.5);
key.position.set(4, 14, 6);
scene.add(key);

const world = {
  floor: new THREE.Mesh(new THREE.BoxGeometry(ARENA * 2, 0.2, ARENA * 2), new THREE.MeshStandardMaterial({ color: 0x3b3b42, roughness: 0.85 })),
  player: new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.8, 4, 12), new THREE.MeshStandardMaterial({ color: 0x4b84ff, roughness: 0.4 })),
  blocks: [],
};
world.floor.position.y = -0.1;
world.player.position.y = 0.8;
scene.add(world.floor, world.player);
const blockGeometry = new THREE.BoxGeometry(1.2, 1.2, 1.2);
const blockMaterial = new THREE.MeshStandardMaterial({ color: 0xf26a60, roughness: 0.6 });

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

const held = new Set();
addEventListener("keydown", (event) => {
  held.add(event.code);
  if (event.code === "KeyP" && state.mode === "playing") setMode("paused");
  else if (event.code === "KeyP" && state.mode === "paused") setMode("playing");
});
addEventListener("keyup", (event) => held.delete(event.code));
addEventListener("blur", () => { held.clear(); if (state.mode === "playing") setMode("paused"); });

/* ---------------------------------------------------------------- screens */
const screens = { title: "#title", paused: "#paused", results: "#results" };
const state = { mode: "title", elapsed: 0, spawnIn: 0 };
function setMode(mode) {
  state.mode = mode;
  for (const [name, selector] of Object.entries(screens)) document.querySelector(selector).hidden = name !== mode;
}
document.addEventListener("click", (event) => {
  const action = event.target instanceof HTMLElement ? event.target.dataset.action : undefined;
  if (action === "play") start();
  if (action === "resume") setMode("playing");
  if (action === "quit") setMode("title");
});
document.querySelector("#pause").addEventListener("click", () => { if (state.mode === "playing") setMode("paused"); });
og.onPause((paused) => { if (paused && state.mode === "playing") setMode("paused"); });
og.audio.onHostMute(() => { /* route this to your mixer */ });

function start() {
  for (const block of world.blocks) scene.remove(block);
  world.blocks.length = 0;
  world.player.position.set(0, 0.8, 0);
  Object.assign(state, { elapsed: 0, spawnIn: 0 });
  setMode("playing");
  og.track("run_started", { mode: "solo" });
}

// Seconds to a tenth, the unit the game page shows beside the board's label; a board in
// milliseconds read as 12345 to every player who opened it.
const board = og.leaderboard("survived_s");
async function finish() {
  setMode("results");
  const ms = Math.round(state.elapsed * 1000);
  document.querySelector("#result-line").textContent = `You lasted ${(ms / 1000).toFixed(1)} seconds`;
  og.track("run_ended", { duration_ms: ms, result: "hit" });
  const saved = await board.submit(Math.round(ms / 100) / 10);
  if (!saved.ok) console.warn("Score not saved:", saved.reason ?? saved.error);
  const top = await board.top({ limit: 5 });
  document.querySelector("#board").replaceChildren(...(top.ok ? top.value.entries : []).map((entry) => {
    const item = document.createElement("li");
    item.textContent = `${entry.rank}. ${entry.name ?? "Guest"}, ${entry.score.toFixed(1)} s`;
    return item;
  }));
}

/* ---------------------------------------------------------------- the game */
function update(dt) {
  state.elapsed += dt;
  const x = (held.has("KeyD") || held.has("ArrowRight") ? 1 : 0) - (held.has("KeyA") || held.has("ArrowLeft") ? 1 : 0);
  const z = (held.has("KeyS") || held.has("ArrowDown") ? 1 : 0) - (held.has("KeyW") || held.has("ArrowUp") ? 1 : 0);
  const length = Math.hypot(x, z) || 1;
  const p = world.player.position;
  p.x = THREE.MathUtils.clamp(p.x + (x / length) * SPEED * dt, -ARENA + 0.5, ARENA - 0.5);
  p.z = THREE.MathUtils.clamp(p.z + (z / length) * SPEED * dt, -ARENA + 0.5, ARENA - 0.5);

  state.spawnIn -= dt;
  if (state.spawnIn <= 0) {
    // Blocks come faster the longer you last.
    state.spawnIn = Math.max(0.18, 0.9 - state.elapsed * 0.02);
    const block = new THREE.Mesh(blockGeometry, blockMaterial);
    block.position.set((Math.random() * 2 - 1) * ARENA, 14, (Math.random() * 2 - 1) * ARENA);
    scene.add(block);
    world.blocks.push(block);
  }
  for (const block of [...world.blocks]) {
    block.position.y -= (10 + state.elapsed * 0.3) * dt;
    block.rotation.x += dt;
    if (block.position.y < -1) { scene.remove(block); world.blocks.splice(world.blocks.indexOf(block), 1); continue; }
    if (Math.abs(block.position.x - p.x) < 1 && Math.abs(block.position.z - p.z) < 1 && block.position.y < 1.8) { void finish(); return; }
  }
}

// Timer rather than Clock, which three.js deprecated in r183; see the three-vite starter.
// Connected to the document so a hidden tab steps by zero.
const timer = new THREE.Timer();
timer.connect(document);
const time = document.querySelector("#time");
let readySent = false;
function frame() {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  if (state.mode === "playing") update(dt);
  time.textContent = `${state.elapsed.toFixed(1)} s`;
  renderer.render(scene, camera);
  if (!readySent) { readySent = true; og.ready(); }
  requestAnimationFrame(frame);
}
setMode("title");
requestAnimationFrame(frame);
