import './style.css';
import { state, collect, ready } from './platform.js';
import { Engine, Actor, Color, vec, DisplayMode } from 'excalibur';
const canvas = document.createElement('canvas'); document.querySelector('#game').append(canvas);
const engine = new Engine({ canvasElement: canvas, width: 640, height: 440, displayMode: DisplayMode.FitContainer, backgroundColor: Color.fromHex('#17191c') });
const target = new Actor({ pos: vec(320, 220), width: 80, height: 80, color: Color.fromHex('#f0be55') });
target.on('pointerdown', () => { collect(); target.pos = vec(50 + Math.random() * 540, 50 + Math.random() * 340); });
engine.add(target); await engine.start(); ready();
