/* Lily & Joe — small pixel effects: hearts, sleepy Zs, sparkles */
(function (root) {
  'use strict';
  const LJ = (root.LJ = root.LJ || {});

  const HEART = ['.X.X.', 'XXXXX', 'XXXXX', '.XXX.', '..X..'];
  const Z = ['XXXX', '..X.', '.X..', 'XXXX'];
  const SPARK = ['.X.', 'XXX', '.X.'];
  const BUBBLE = ['.XX.', 'X..X', 'X..X', '.XX.'];
  const rnd = function (a, b) { return a + Math.random() * (b - a); };

  function bitmap(g, map, x, y, color) {
    g.fillStyle = color;
    for (let j = 0; j < map.length; j++) for (let i = 0; i < map[j].length; i++) {
      if (map[j][i] === 'X') g.fillRect(x + i, y + j, 1, 1);
    }
  }

  class Effects {
    constructor() { this.list = []; this.muted = false; }
    heart(x, y) { if (this.muted) return; this.list.push({ k: 'heart', x: x, y: y, vx: rnd(-3, 3), vy: -rnd(9, 15), t: 0, max: rnd(1.5, 2.1), ph: rnd(0, 6) }); }
    z(x, y) { if (this.muted) return; this.list.push({ k: 'z', x: x, y: y, vx: 4, vy: -6, t: 0, max: 2.6, ph: rnd(0, 6) }); }
    spark(x, y) { if (this.muted) return; this.list.push({ k: 'spark', x: x, y: y, vx: 0, vy: -2, t: 0, max: rnd(0.7, 1.2), ph: 0 }); }
    bubble(x, y) { if (this.muted) return; this.list.push({ k: 'bubble', x: x, y: y, vx: rnd(-4, 4), vy: -rnd(8, 14), t: 0, max: rnd(0.9, 1.5), ph: rnd(0, 6) }); }
    update(dt) {
      for (let i = this.list.length - 1; i >= 0; i--) {
        const p = this.list[i];
        p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.t >= p.max) this.list.splice(i, 1);
      }
    }
    draw(g) {
      for (const p of this.list) {
        const left = p.max - p.t;
        g.globalAlpha = left < 0.4 ? Math.max(0, left / 0.4) : 1;
        const sway = Math.round(Math.sin(p.t * 5 + p.ph) * 1.5);
        const x = Math.round(p.x) + (p.k === 'spark' ? 0 : sway), y = Math.round(p.y);
        if (p.k === 'heart') {
          bitmap(g, HEART, x + 1, y + 1, '#7a1f45');
          bitmap(g, HEART, x, y, '#ff6a95');
          g.fillStyle = '#ffc2d4'; g.fillRect(x + 1, y + 1, 1, 1);
        } else if (p.k === 'z') {
          bitmap(g, Z, x + 1, y + 1, '#4a3d7a');
          bitmap(g, Z, x, y, '#eef0ff');
        } else if (p.k === 'bubble') {
          bitmap(g, BUBBLE, x, y, '#bfe9ff');
          g.fillStyle = '#ffffff'; g.fillRect(x + 1, y + 1, 1, 1);
        } else {
          bitmap(g, SPARK, x, y, p.t % 0.3 < 0.15 ? '#fff6b0' : '#ffe27a');
        }
        g.globalAlpha = 1;
      }
    }
  }

  LJ.Effects = Effects;
})(typeof window !== 'undefined' ? window : globalThis);
