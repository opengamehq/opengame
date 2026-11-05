import './style.css';
import { state, collect, ready } from './platform.js';
import { engineInit, drawRect, vec2, Color, mouseWasPressed, mousePos, setCanvasFixedSize } from 'littlejsengine';
setCanvasFixedSize(vec2(640, 440));
let target = vec2(0, 0);
function update() { if (!state.paused && mouseWasPressed(0) && mousePos.distance(target) < 1.5) { collect(); target = vec2(Math.random() * 10 - 5, Math.random() * 6 - 3); } }
let first = true;
function render() { drawRect(target, vec2(2), new Color(1, .75, .3)); if (first) { first = false; ready(); } }
engineInit(() => {}, update, () => {}, render, () => {}, [], document.querySelector('#game'));
