import './style.css';
import { state, collect, ready } from './platform.js';
const canvas = document.createElement('canvas'); document.querySelector('#game')!.append(canvas); const ctx = canvas.getContext('2d')!;
let x = 160, y = 160;
function resize() { canvas.width = canvas.parentElement!.clientWidth; canvas.height = canvas.parentElement!.clientHeight; draw(); }
function draw() { ctx.fillStyle = '#17191c'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#f0be55'; ctx.fillRect(x, y, 70, 70); }
canvas.addEventListener('pointerdown', event => { const rect = canvas.getBoundingClientRect(); const px = event.clientX - rect.left, py = event.clientY - rect.top; if (!state.paused && px >= x && px <= x + 70 && py >= y && py <= y + 70) { collect(); x = Math.random() * Math.max(1, canvas.width - 70); y = Math.random() * Math.max(1, canvas.height - 70); draw(); } });
addEventListener('resize', resize); resize(); ready();
