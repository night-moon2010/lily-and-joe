/* Lily & Joe — game engine
 * Owns the canvas, the render loop, input and the player's commands.
 * The world is drawn at 256x192 and scaled up by a whole number so pixels stay crisp.
 */
(function (root) {
  'use strict';
  const LJ = (root.LJ = root.LJ || {});
  const Wd = LJ.World, T = Wd.T;
  const LW = Wd.W * T, LH = Wd.H * T;
  const ACCENT = { lily: '#cdb9ff', joe: '#f2c230' };

  class Game {
    constructor(canvas, container) {
      this.canvas = canvas; this.container = container;
      this.ctx = canvas.getContext('2d');
      this.off = document.createElement('canvas'); this.off.width = LW; this.off.height = LH;
      this.g = this.off.getContext('2d');
      this.bg = Wd.renderRoom();
      this.fx = new LJ.Effects();
      this.home = new LJ.Household(this.fx);
      this.selected = this.home.lily;
      this.time = 0; this.bird = null; this.sparkT = 1; this.tapMark = null;
      this.onMessage = function () {}; this.onSelect = function () {}; this.onTick = function () {}; this.paused = false;
      this.home.onEvent = (t) => this.onMessage(t);
      this.frame = this.frame.bind(this);
      this.bindInput();
      this.fit();
      window.addEventListener('resize', () => this.fit());
    }

    start() { this.last = performance.now(); requestAnimationFrame(this.frame); }

    fit() {
      const dpr = window.devicePixelRatio || 1;
      const fs = document.body.classList.contains('is-fs');
      const landscape = window.innerWidth > window.innerHeight;
      const availW = Math.max(LW / dpr, this.container.clientWidth - 24);
      const availH = Math.max(LH / dpr, fs ? (landscape ? window.innerHeight - 110 : window.innerHeight * 0.5) : window.innerHeight * 0.68);
      let s = Math.floor(Math.min(availW * dpr * 1.02 / LW, availH * dpr / LH));
      s = Math.max(1, s);
      this.canvas.width = LW * s; this.canvas.height = LH * s;
      this.canvas.style.width = (LW * s / dpr) + 'px';
      this.canvas.style.height = (LH * s / dpr) + 'px';
      this.ctx.imageSmoothingEnabled = false;
    }

    frame(ts) {
      const dt = Math.min(0.05, (ts - this.last) / 1000 || 0);
      this.last = ts;
      this.update(dt); this.render();
      requestAnimationFrame(this.frame);
    }

    update(dt) {
      this.time += dt;
      if (!this.paused) this.home.update(dt);
      this.fx.update(dt);
      this.onTick(dt);
      if (this.bird) { this.bird.t += dt; if (this.bird.t > this.bird.dur) this.bird = null; }
      if (this.tapMark) { this.tapMark.t += dt; if (this.tapMark.t > 0.5) this.tapMark = null; }
      this.sparkT -= dt;
      if (this.sparkT <= 0) {
        this.sparkT = 1.2 + Math.random() * 2;
        const y = 36 + Math.random() * 56;
        this.fx.spark(Wd.GLASS.x + (y - 32) * 0.5 + Math.random() * 36, y);
      }
    }

    // ---------- drawing ----------
    render() {
      const g = this.g, h = this.home;
      g.drawImage(this.bg, 0, 0);
      if (this.bird) Wd.drawBird(g, this.bird.t, this.bird.dur);
      Wd.drawSun(g, this.time);

      if (h.bowl) this.drawBowl(g, h.bowl);
      const cats = h.cats.slice().sort(function (a, b) { return a.y - b.y; });
      if (h.ball) this.drawBall(g, h.ball);
      g.fillStyle = 'rgba(40,20,20,0.25)';
      for (const c of cats) g.fillRect(Math.round(c.x) + 3, Math.round(c.y) + 13, 10, 2);

      for (const c of cats) {
        if (c.state === 'sleep' && h.cuddling(c)) {
          const o = h.other(c);
          if (c.tx < o.tx) {
            g.fillRect(c.x + 2, c.y + 13, 28, 2);
            g.drawImage(LJ.Sprites.cuddle(c.id, o.id, Math.floor(c.clock / 1.1)), Math.round(c.x + c.ox), Math.round(c.y + c.oy));
          }
          continue;
        }
        const l = c.look();
        g.drawImage(LJ.Sprites.cat(c.id, c.dir, l.pose, l.frame, l.closed, l.sad), Math.round(c.x + c.ox + l.dx), Math.round(c.y + c.oy + l.dy));
        if (c.state === 'bath') this.drawFoam(g, c);
      }

      this.fx.draw(g);
      this.drawMarker(g);
      if (this.tapMark) {
        const m = this.tapMark, r = Math.floor(m.t * 14);
        g.fillStyle = 'rgba(255,255,255,0.75)';
        g.fillRect(m.x - r, m.y, 2, 1); g.fillRect(m.x + r, m.y, 2, 1);
        g.fillRect(m.x, m.y - r, 1, 2); g.fillRect(m.x, m.y + r, 1, 2);
      }
      this.ctx.drawImage(this.off, 0, 0, this.canvas.width, this.canvas.height);
    }

    drawBowl(g, b) {
      const x = b.tx * T, y = b.ty * T;
      g.fillStyle = 'rgba(40,20,20,0.25)'; g.fillRect(x + 2, y + 12, 12, 2);
      g.fillStyle = '#7a2f3b'; g.fillRect(x + 3, y + 8, 10, 1); g.fillRect(x + 4, y + 12, 8, 1);
      g.fillStyle = '#c8475b'; g.fillRect(x + 2, y + 9, 12, 3);
      g.fillStyle = '#e07a8a'; g.fillRect(x + 3, y + 9, 10, 1);
      if (b.amount > 0.02) {
        const w = Math.max(2, Math.round(2 + b.amount * 6));
        g.fillStyle = '#8b5a2b'; g.fillRect(x + 8 - w / 2 | 0, y + 7, w, 2);
        g.fillStyle = '#b3813f'; g.fillRect(x + 8 - w / 2 | 0, y + 7, w, 1);
      }
    }

    drawBall(g, b) {
      const k = b.t, ax = (b.fx + (b.tx - b.fx) * k) * T + 5, ay = (b.fy + (b.ty - b.fy) * k) * T + 7;
      const lift = Math.round(Math.sin(Math.PI * k) * 7);
      g.fillStyle = 'rgba(40,20,20,0.25)'; g.fillRect(Math.round(ax), Math.round(ay) + 5, 6, 2);
      const x = Math.round(ax), y = Math.round(ay) - lift;
      const map = ['..XX..', '.XXXX.', 'XXXXXX', 'XXXXXX', '.XXXX.', '..XX..'];
      g.fillStyle = '#e0556e';
      for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) if (map[j][i] === 'X') g.fillRect(x + i, y + j, 1, 1);
      g.fillStyle = '#b83a54'; g.fillRect(x + 2, y + 2, 1, 1); g.fillRect(x + 3, y + 3, 1, 1); g.fillRect(x + 4, y + 2, 1, 1);
      g.fillStyle = '#ffa0b4'; g.fillRect(x + 1, y + 1, 1, 1);
    }

    drawFoam(g, c) {
      const x = Math.round(c.x), y = Math.round(c.y), w = Math.floor(this.time * 3) % 2;
      const blob = function (bx, by) {
        g.fillStyle = '#bfe6f5'; g.fillRect(bx, by + 1, 4, 3);
        g.fillStyle = '#ffffff'; g.fillRect(bx + 1, by, 2, 1); g.fillRect(bx, by + 1, 4, 2);
      };
      blob(x + 3, y + 9 + w); blob(x + 9, y + 8 + (1 - w)); blob(x + 6, y + 11); blob(x + 11, y + 11 + w); blob(x + 5, y + 2 + w);
    }

    drawMarker(g) {
      const c = this.selected;
      const bob = Math.floor(this.time * 3) % 2;
      const x = Math.round(c.x) + 5, y = Math.round(c.y) - 6 + bob + (c.state === 'sleep' ? 6 : 0);
      g.fillStyle = '#2a1b33';
      g.fillRect(x - 1, y - 1, 7, 3); g.fillRect(x, y + 2, 5, 1); g.fillRect(x + 1, y + 3, 3, 1); g.fillRect(x + 2, y + 4, 1, 1);
      g.fillStyle = ACCENT[c.id];
      g.fillRect(x, y, 5, 1); g.fillRect(x + 1, y + 1, 3, 1); g.fillRect(x + 2, y + 2, 1, 1);
    }

    // ---------- input ----------
    bindInput() {
      this.canvas.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const r = this.canvas.getBoundingClientRect();
        this.tap((e.clientX - r.left) / r.width * LW, (e.clientY - r.top) / r.height * LH);
      });
    }

    tap(x, y) {
      let hit = null, best = 1e9;
      for (const c of this.home.cats) {
        if (x >= c.x - 1 && x <= c.x + 17 && y >= c.y - 3 && y <= c.y + 16) {
          const d = Math.abs(x - (c.x + 8)) + Math.abs(y - (c.y + 8));
          if (d < best) { best = d; hit = c; }
        }
      }
      if (hit) { this.select(hit); this.act({ type: 'pet', cat: hit.id }); return; }
      const w = Wd.WINDOW;
      if (x >= w.x && x <= w.x + w.w && y <= w.y + w.h) { this.act({ type: 'look' }); return; }
      if (y < 32) return;
      const tx = Math.floor(x / T), ty = Math.floor(y / T);
      this.tapMark = { x: tx * T + 8, y: ty * T + 8, t: 0 };
      this.act({ type: 'move', cat: this.selected.id, x: tx, y: ty });
    }

    select(c) { this.selected = c; this.onSelect(c); }

    // Every player action goes through act(); Sync decides where it actually runs
    // (here when playing solo or leading the room, otherwise on the leader's machine).
    act(cmd) { this.onAct(cmd); }
    onAct(cmd) { const r = this.perform(cmd); if (r && r.msg) this.onMessage(r.msg); }

    moveSelectedBy(dir) {
      const c = this.selected, d = c.destTile, v = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] }[dir];
      const tx = d.x + v[0], ty = d.y + v[1];
      if (ty < Wd.MINY || ty >= Wd.H || tx < 0 || tx >= Wd.W) return;
      this.tapMark = { x: tx * T + 8, y: ty * T + 8, t: 0 };
      this.act({ type: 'move', cat: c.id, x: tx, y: ty });
    }

    // ---------- commands: run only by whoever simulates the cats ----------
    // Each returns { ok, msg, act } where act is a short key used for the shared activity line.
    perform(cmd) {
      const h = this.home, c = h[cmd.cat];
      switch (cmd.type) {
        case 'pet': return c ? this.petCat(c) : null;
        case 'move': return c ? this.moveCat(c, cmd.x, cmd.y) : null;
        case 'feed': return c ? this.wrap(c.feed(h), 'feed') : null;
        case 'play': return c ? this.wrap(c.play(h), 'play') : null;
        case 'bathe': return c ? this.wrap(c.bathe(h), 'bathe') : null;
        case 'sleep': return c ? this.wrap(c.sleepNow(h), 'sleep') : null;
        case 'nuzzle': return c ? this.nuzzleCat(c) : null;
        case 'nap': return this.napTogether();
        case 'look': return this.lookOutside();
      }
      return null;
    }
    wrap(r, act) { r.act = r.ok ? act : null; return r; }

    moveCat(c, tx, ty) {
      const h = this.home;
      if (!Number.isInteger(tx) || !Number.isInteger(ty) || ty < Wd.MINY || ty >= Wd.H || tx < 0 || tx >= Wd.W) return { ok: false, msg: '' };
      if (c.state === 'sleep') return { ok: false, msg: c.name + ' is asleep. Tap to pet, or let them rest.' };
      if (h.occupied(tx, ty, c)) return { ok: false, msg: h.other(c).name + ' is already there.' };
      return { ok: c.startPath(h, tx, ty, { type: 'wander' }), msg: '' };
    }

    petCat(c) {
      if (c.state === 'sleep') {
        this.fx.heart(c.x + 8, c.y + 2); this.fx.heart(c.x + 6, c.y + 4);
        return { ok: true, msg: c.name + ' is fast asleep, but a soft purr rumbles anyway.', act: 'pet' };
      }
      c.petted(this.home);
      return { ok: true, msg: c.name + ' is purring.', act: 'pet' };
    }

    nuzzleCat(a) {
      const b = this.home.other(a), h = this.home;
      if (a.state === 'sleep' || b.state === 'sleep') return { ok: false, msg: 'Let sleeping cats lie.' };
      h.calm(b);
      a.goAdjacent(h, 'nuzzle');
      return { ok: true, msg: a.name + ' goes to say hello to ' + b.name + '.', act: 'nuzzle' };
    }

    napTogether() {
      const r = this.home.napPair(this.home.lily, this.home.joe);
      if (r === 'already') return { ok: false, msg: 'Lily and Joe are already napping.' };
      if (r === 'ok') return { ok: true, msg: 'Lily and Joe are heading to the sunbeam for a nap.', act: 'nap' };
      return { ok: false, msg: 'They could not find a cozy spot just now. Try again.' };
    }

    lookOutside() {
      const awake = this.home.cats.filter(function (c) { return c.awake; });
      if (!awake.length) return { ok: false, msg: 'Both cats are asleep.' };
      this.bird = { t: 0, dur: 6 };
      const spots = [[6, 2], [8, 2]];
      awake.forEach((c, i) => c.startPath(this.home, spots[i][0], spots[i][1], { type: 'gaze' }));
      return { ok: true, msg: 'A little bird landed outside the window.', act: 'look' };
    }

    // ---------- status text for the UI ----------
    statusOf(c) {
      const o = this.home.other(c), h = this.home;
      switch (c.state) {
        case 'walk':
          if (c.intent && c.intent.type === 'chase') return 'is chasing the yarn';
          if (c.intent && c.intent.type === 'eat') return 'is heading to the bowl';
          return 'is exploring the room';
        case 'sit': return h.adjacent(c, o) ? 'is sitting next to ' + o.name : 'is sitting quietly';
        case 'gaze': return 'is watching the window';
        case 'happy': return h.ball ? 'is chasing the yarn' : 'is purring';
        case 'eat': return 'is eating';
        case 'bath': return 'is getting a bath';
        case 'nuzzle': return 'is nuzzling ' + o.name;
        case 'sleep': return h.cuddling(c) ? 'is asleep, cuddled up with ' + o.name : 'is napping';
        default: return c.sad ? 'looks sad' : 'is relaxing';
      }
    }
  }

  LJ.Game = Game;
})(typeof window !== 'undefined' ? window : globalThis);
