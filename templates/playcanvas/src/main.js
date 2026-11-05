import './style.css';
import { state, collect, ready } from './platform.js';
import * as pc from 'playcanvas';
const canvas = document.createElement('canvas'); document.querySelector('#game').append(canvas);
const app = new pc.Application(canvas); app.start(); app.setCanvasFillMode(pc.FILLMODE_NONE); app.setCanvasResolution(pc.RESOLUTION_AUTO);
// The canvas is sized to #game, not the window. FILLMODE_FILL_WINDOW made it the full window
// height inside a box 100px shorter that clips, so the bottom of the scene was never seen.
// A ResizeObserver sees every change to that box, a window resize included.
const host = document.querySelector('#game');
const fit = () => app.resizeCanvas(host.clientWidth, host.clientHeight);
new ResizeObserver(fit).observe(host); fit();
const camera = new pc.Entity('camera'); camera.addComponent('camera', { clearColor: new pc.Color(.09, .1, .11) }); camera.setPosition(0, 0, 5); app.root.addChild(camera);
const light = new pc.Entity('light'); light.addComponent('light'); light.setEulerAngles(45, 45, 0); app.root.addChild(light);
const target = new pc.Entity('target'); target.addComponent('render', { type: 'box' }); app.root.addChild(target);
canvas.addEventListener('pointerdown', collect); app.on('update', dt => { if (!state.paused) target.rotate(0, dt * 35, 0); });
app.once('frameend', ready);
