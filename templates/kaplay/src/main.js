import './style.css';
import { state, collect, ready } from './platform.js';
import kaplay from 'kaplay';
const canvas = document.createElement('canvas'); document.querySelector('#game').append(canvas);
const k = kaplay({ canvas, width: 640, height: 440, background: [23, 25, 28], letterbox: true });
const target = k.add([k.rect(80, 80), k.pos(280, 180), k.color(240, 190, 85), k.area()]);
target.onClick(() => { collect(); target.pos = k.vec2(k.rand(0, 560), k.rand(0, 360)); });
ready();
