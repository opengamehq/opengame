import * as THREE from "three";
import { og } from "@opengamehq/sdk";
import manifest from "../opengame.json";

// The platform handshake. Outside OpenGame this resolves straight away with a local
// mock, so `npm run dev` works with no account. Passing the manifest lets the mock's
// leaderboards read the boards declared in opengame.json.
await og.init({ manifest });

const ROUND_SECONDS = 60;
const ARENA = 14;
const SPEED = 9;

const canvas = document.querySelector("#game");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0b);
scene.fog = new THREE.Fog(0x0a0a0b, 18, 40);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
camera.position.set(0, 18, 16);
camera.lookAt(0, 0, 0);

scene.add(new THREE.HemisphereLight(0xaabbff, 0x202024, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 1.4);
key.position.set(6, 12, 4);
scene.add(key);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(ARENA + 1, 64),
  new THREE.MeshStandardMaterial({ color: 0x3b3b42, roughness: 0.8 }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const orb = new THREE.Mesh(
  new THREE.SphereGeometry(0.6, 32, 16),
  new THREE.MeshStandardMaterial({ color: 0x4b84ff, emissive: 0x0054ff, emissiveIntensity: 0.8 }),
);
orb.position.y = 0.6;
const glow = new THREE.PointLight(0x4b84ff, 6, 8);
orb.add(glow);
scene.add(orb);

const spark = new THREE.Mesh(
  new THREE.OctahedronGeometry(0.35),
  new THREE.MeshStandardMaterial({ color: 0xe8b93f, emissive: 0xe8b93f, emissiveIntensity: 0.6 }),
);
spark.position.y = 0.6;
scene.add(spark);

function placeSpark() {
  const angle = Math.random() * Math.PI * 2;
  const radius = 2 + Math.random() * (ARENA - 3);
  spark.position.set(Math.cos(angle) * radius, 0.6, Math.sin(angle) * radius);
}

const held = new Set();
addEventListener("keydown", (event) => held.add(event.code));
addEventListener("keyup", (event) => held.delete(event.code));
addEventListener("blur", () => held.clear());

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

const hud = { score: document.querySelector("#score"), clock: document.querySelector("#clock") };
const menu = document.querySelector("#menu");
const boardList = document.querySelector("#board");
const board = og.leaderboard("sparks");

const state = { playing: false, paused: false, score: 0, timeLeft: ROUND_SECONDS };

// The page pauses the game when its tab is hidden or its own menu is open.
og.onPause((paused) => { state.paused = paused; });
// The page's mute button. This starter has no audio; wire it to your mixer.
og.audio.onHostMute(() => {});

async function showBoard() {
  const top = await board.top({ limit: 5 });
  boardList.replaceChildren(...(top.ok ? top.value.entries : []).map((entry) => {
    const item = document.createElement("li");
    item.textContent = `${entry.rank}. ${entry.name ?? "Guest"}, ${entry.score}`;
    if (entry.isMe) item.style.color = "#f7f7f8";
    return item;
  }));
}

function start() {
  Object.assign(state, { playing: true, score: 0, timeLeft: ROUND_SECONDS });
  orb.position.set(0, 0.6, 0);
  placeSpark();
  menu.hidden = true;
}

async function finish() {
  state.playing = false;
  menu.hidden = false;
  menu.querySelector("button").textContent = "Play again";
  // A score is the game's claim. A failed submit is shown, never fatal.
  const saved = await board.submit(state.score);
  if (!saved.ok) console.warn("Score not saved:", saved.reason ?? saved.error);
  await showBoard();
}

document.querySelector("#play").addEventListener("click", start);
addEventListener("keydown", (event) => { if (!state.playing && event.code === "Enter") start(); });

// Timer rather than Clock, which three.js deprecated in r183. Connecting it to the
// document gives a zero step while the tab is hidden, so a long absence does not land
// as one huge frame. It reads performance.now() itself: a requestAnimationFrame
// timestamp can predate the timer's own start and make the first step negative.
const timer = new THREE.Timer();
timer.connect(document);
let readySent = false;

function frame() {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  if (state.playing && !state.paused) {
    const x = (held.has("KeyD") || held.has("ArrowRight") ? 1 : 0) - (held.has("KeyA") || held.has("ArrowLeft") ? 1 : 0);
    const z = (held.has("KeyS") || held.has("ArrowDown") ? 1 : 0) - (held.has("KeyW") || held.has("ArrowUp") ? 1 : 0);
    const length = Math.hypot(x, z) || 1;
    orb.position.x += (x / length) * SPEED * dt;
    orb.position.z += (z / length) * SPEED * dt;
    const distance = Math.hypot(orb.position.x, orb.position.z);
    if (distance > ARENA) orb.position.multiplyScalar(ARENA / distance).setY(0.6);

    if (orb.position.distanceTo(spark.position) < 1) { state.score += 1; placeSpark(); }
    state.timeLeft = Math.max(0, state.timeLeft - dt);
    if (state.timeLeft === 0) void finish();
  }
  spark.rotation.y += dt * 2;
  hud.score.textContent = `${state.score} ${state.score === 1 ? "spark" : "sparks"}`;
  hud.clock.textContent = String(Math.ceil(state.timeLeft));
  renderer.render(scene, camera);

  // Tell the page the first playable frame is on screen. It measures time to
  // playable from this, and stops showing its own loading state.
  if (!readySent) { readySent = true; og.ready(); }
  requestAnimationFrame(frame);
}

placeSpark();
void showBoard();
requestAnimationFrame(frame);
