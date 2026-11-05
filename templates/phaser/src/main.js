import './style.css';
import { state, collect, ready } from './platform.js';
import Phaser from 'phaser';
class Play extends Phaser.Scene {
  create() {
    const target = this.add.circle(320, 220, 45, 0xf0be55).setInteractive();
    target.on('pointerdown', () => { collect(); target.x = 60 + Math.random() * 520; target.y = 60 + Math.random() * 320; });
    this.game.events.once('postrender', ready);
  }
}
new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: 640, height: 440, backgroundColor: '#17191c', scene: Play, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH } });
