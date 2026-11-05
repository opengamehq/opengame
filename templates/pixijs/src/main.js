// First, before anything creates a renderer. PixiJS 8 compiles its shader and uniform
// upload code with `new Function` unless this polyfill replaces it, and OpenGame serves
// games without 'unsafe-eval', so without this line the game throws on boot and the
// player gets a blank frame.
import 'pixi.js/unsafe-eval';
import './style.css';
import { state, collect, ready } from './platform.js';
import { Application, Graphics } from 'pixi.js';
const app = new Application(); await app.init({ resizeTo: document.querySelector('#game'), background: '#17191c', preference: 'webgl' });
document.querySelector('#game').append(app.canvas);
const target = new Graphics().circle(0, 0, 45).fill(0xf0be55); target.position.set(160, 160); target.eventMode = 'static'; target.cursor = 'pointer';
target.on('pointerdown', () => { collect(); target.position.set(50 + Math.random() * Math.max(1, app.screen.width - 100), 50 + Math.random() * Math.max(1, app.screen.height - 100)); });
app.stage.addChild(target); app.render(); ready();
