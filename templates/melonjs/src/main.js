import './style.css';
import { state, collect, ready } from './platform.js';
import * as me from 'melonjs';
// scaleTarget, because auto scale otherwise measures the parent of #game, the whole body,
// and draws taller than the box that clips it.
const app = new me.Application(640, 440, { parent: 'game', scaleTarget: 'game', scale: 'auto', renderer: me.video.CANVAS });
await app.init();
class Target extends me.Renderable {
  constructor() { super(0, 0, 640, 440); this.alwaysUpdate = true; this.first = true; }
  draw(renderer) { renderer.setColor('#17191c'); renderer.fillRect(0, 0, 640, 440); renderer.setColor('#f0be55'); renderer.fillRect(280, 180, 80, 80); if (this.first) { this.first = false; ready(); } }
}
class Play extends me.Stage { onResetEvent(application) { application.world.addChild(new Target()); } }
me.state.set(me.state.PLAY, new Play()); me.state.change(me.state.PLAY);
document.querySelector('#game').addEventListener('pointerdown', collect);
