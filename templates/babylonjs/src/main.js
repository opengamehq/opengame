import './style.css';
import { state, collect, ready } from './platform.js';
// Deep imports, not the '@babylonjs/core' barrel. The barrel ships the whole engine, including
// modules that name files on assets.babylonjs.com and cdn.babylonjs.com outright (the VR
// button image, the blue-noise and environment textures). This game uses none of them, but
// check read each as a request to a CDN and blocked the build, which also took 19 minutes.
// The last two lines are side effects the barrel used to bring in: scene.pick lives in
// Culling/ray, and a mesh with no material of its own needs StandardMaterial for the default.
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import '@babylonjs/core/Culling/ray';
import '@babylonjs/core/Materials/standardMaterial';
const canvas = document.createElement('canvas'); document.querySelector('#game').append(canvas);
const engine = new Engine(canvas, true); const scene = new Scene(engine);
new ArcRotateCamera('camera', 0, Math.PI / 2, 5, Vector3.Zero(), scene);
new HemisphericLight('light', new Vector3(0, 1, 0), scene);
const target = CreateBox('target', {}, scene);
canvas.addEventListener('pointerdown', event => { if (scene.pick(event.offsetX, event.offsetY)?.hit) collect(); });
function resize() { canvas.width = canvas.parentElement.clientWidth; canvas.height = canvas.parentElement.clientHeight; engine.resize(); }
addEventListener('resize', resize); resize();
let first = true;
engine.runRenderLoop(() => { if (!state.paused) target.rotation.y += .01; scene.render(); if (first) { first = false; ready(); } });
