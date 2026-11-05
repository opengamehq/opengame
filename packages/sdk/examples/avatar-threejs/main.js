/*
 * Draws one OG from a recipe. Open index.html from a static server; pass a recipe with
 * ?look=panda.dots.tangerine&character=c3.tall.regular.hoodie.jeans.cape.jumpcourt.blue.ink.match.chalk
 * or leave both out for the signed-in player the SDK mocks locally.
 *
 * In a game, take the recipe from the player instead:
 *
 *   import { og } from '@opengamehq/sdk';
 *   import { watchAvatar } from '@opengamehq/sdk/avatar';
 *   await og.init();
 *   watchAvatar(og, (avatar) => show(avatar)); // null for a guest: draw your default character
 */
import * as THREE from 'three';
import { portraitUrl, readAvatar } from '@opengamehq/sdk/avatar';
import { buildOg } from './og-model.js';

const query = new URLSearchParams(location.search);
const recipe = {
  look: query.get('look') ?? 'circle.classic.white',
  character: query.get('character') ?? 'c4.classic.regular.hoodie.jeans.cape-watch.retro.avatar.avatar.avatar.avatar',
};
const still = query.has('still');

const canvas = document.getElementById('stage');
const status = document.getElementById('status');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: still });
const { width, height } = canvas;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(width, height, false); // the page sizes the canvas, so it fits a narrow screen
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x151517);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 50);

/* Lit from the top left, as OpenGame shades a head, with a soft fill so the far side keeps
   its color. */
scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3836, 1.4));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(-3, 5, 4);
scene.add(key);
const rim = new THREE.DirectionalLight(0xffffff, 0.6);
rim.position.set(3, 2, -4);
scene.add(rim);

/* The portrait shows only once it has loaded, and its figure goes with it, so a portrait
   that cannot load leaves no caption and no broken image behind. */
const figure = document.getElementById('portrait-figure');
const portrait = document.getElementById('portrait');
portrait.addEventListener('load', () => { figure.hidden = false; });
portrait.addEventListener('error', () => { figure.hidden = true; });

let og = null;
function show(avatar) {
  if (og) { scene.remove(og); og.userData.dispose(); og = null; }
  figure.hidden = true;
  if (!avatar) { status.textContent = 'No OG to draw: a game shows its default character here.'; return; }
  /* The scene is dark, so the OG is drawn for a dark ground, the same as its portrait. */
  og = buildOg(avatar, { theme: 'dark' });
  scene.add(og);
  const tall = og.userData.height;
  camera.position.set(0, tall * 0.52, tall * 2.25);
  camera.lookAt(0, tall * 0.5, 0);
  portrait.crossOrigin = 'anonymous';
  portrait.src = portraitUrl(avatar, { size: 128, theme: 'dark' });
  status.textContent = `Head: ${avatar.head.recipe}. Outfit: ${avatar.outfit?.recipe ?? 'none'}.`;
}

show(readAvatar(recipe));
renderer.setAnimationLoop((time) => {
  if (og && !still) og.rotation.y = Math.sin(time / 2400) * 0.5;
  renderer.render(scene, camera);
  if (still) { renderer.setAnimationLoop(null); document.body.dataset.rendered = 'true'; }
});
