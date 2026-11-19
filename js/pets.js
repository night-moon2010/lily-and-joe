/* Lily & Joe — the cats and their life together
 * Cat        : one cat's state machine (idle, walk, sit, sleep, happy, nuzzle, gaze)
 * Household  : both cats, shared pathfinding, and the things they do together
 *
 * Stage 2: care stats (belly, joy, energy, clean, health), feeding / playing /
 * bathing / sleeping, and the Lily-Joe relationship (affection, trust, bond level).
 * Everything is still local; Stage 3 moves the shared state to Firebase.
 */
(function (root) {
  'use strict';
  const LJ = (root.LJ = root.LJ || {});
  const Wd = LJ.World;
  const T = Wd.T, W = Wd.W, H = Wd.H, MINY = Wd.MINY;

  const DV = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
  const SPEED = 36; // pixels per second
  // Care stats drift slowly, in real time, so a cat that is left alone for hours needs you.
  const RATE = { hunger: 12 / 3600, happy: 8 / 3600, clean: 5 / 3600 };   // per second
  const TIRE = 0.15, REST = 0.8;                                          // energy: per second
  const BOND_NAMES = ['Curious friends', 'Good friends', 'Close companions', 'Best friends', 'Inseparable'];
  const BOND_AT = [0, 15, 35, 60, 85];
  const clamp = function (v) { return v < 0 ? 0 : v > 100 ? 100 : v; };
  const rnd = function (a, b) { return a + Math.random() * (b - a); };
  const chance = function (p) { return Math.random() < p; };
  const pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };
  const inBounds = function (x, y) { return x >= 0 && x < W && y >= MINY && y < H; };
  const dirOf = function (dx, dy) {
    if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'l' : 'r';
    return dy < 0 ? 'u' : 'd';
  };
  const shuffle = function (a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };

  class Cat {
    constructor(id, name, tx, ty, sleepiness) {
      this.id = id; this.name = name;
      this.tx = tx; this.ty = ty; this.x = tx * T; this.y = ty * T;
      this.dir = 'd'; this.state = 'idle'; this.stateT = 0; this.hold = rnd(1, 3);
      this.path = []; this.step = null; this.goal = null; this.intent = null;
      this.sleepiness = sleepiness; this.minSleep = 0;
      this.hunger = 30; this.happy = 75; this.clean = 80; this.health = 100;
      this.feedCool = 0; this.bathCool = 0; this.playCool = 0; this.petCool = 0; this.next = null;
      this.rev = 0; this.ox = 0; this.oy = 0;   // rev: bumped on every plan change (used by sync); ox/oy: soft correction offset
      this.affCool = rnd(4, 12);       // cooldown before the next nuzzle
      this.clock = rnd(0, 5); this.blinkAt = rnd(2, 5); this.blink = 0;
      this.sitting = false; this.waitT = 0; this.heartT = rnd(4, 8); this.zT = 1;
    }

    get awake() { return this.state !== 'sleep'; }
    get energy() { return 100 - this.sleepiness; }
    get belly() { return 100 - this.hunger; }
    get sad() { return this.happy < 25 || this.hunger > 85 || this.clean < 10 || this.health < 30; }
    get destTile() { return this.step ? { x: this.step.tx, y: this.step.ty } : { x: this.tx, y: this.ty }; }

    setState(s, hold) { this.state = s; this.stateT = 0; this.hold = hold || 0; this.rev++; }
    rest() { this.sitting = chance(0.5); this.setState(this.sitting ? 'sit' : 'idle', rnd(2, 5)); }

    // ---------- main update ----------
    update(dt, h) {
      this.clock += dt; this.stateT += dt; this.affCool -= dt;
      if (this.ox || this.oy) {
        const k = Math.max(0, 1 - dt * 8);
        this.ox *= k; this.oy *= k;
        if (Math.abs(this.ox) < 0.2) this.ox = 0;
        if (Math.abs(this.oy) < 0.2) this.oy = 0;
      }
      this.feedCool -= dt; this.bathCool -= dt; this.playCool -= dt; this.petCool -= dt;
      if (this.awake) this.sleepiness = Math.min(100, this.sleepiness + dt * TIRE);
      this.tickStats(dt);
      this.blinkAt -= dt;
      if (this.blinkAt < 0) { this.blink = 0.14; this.blinkAt = rnd(2.5, 6); }
      if (this.blink > 0) this.blink -= dt;

      switch (this.state) {
        case 'walk': this.updateWalk(dt, h); break;
        case 'sleep': this.updateSleep(dt, h); break;
        case 'happy':
        case 'gaze':
          if (!h.follower && this.stateT >= this.hold) {
            if (this.next) { const n = this.next; this.next = null; n(); } else this.rest();
          }
          break;
        case 'eat':
          if (h.bowl) h.bowl.amount = Math.max(0, h.bowl.amount - dt / 4.5);
          this.hunger = Math.max(0, this.hunger - dt * 8.9);
          this.happy = clamp(this.happy + dt * 0.7);
          if (!h.follower && this.stateT >= this.hold) {
            h.bowl = null; this.feedCool = 25; this.rest();
            h.say(this.name + ' finished eating.', true);
            h.careDone();
          }
          break;
        case 'bath':
          this.clean = clamp(this.clean + dt * 10);
          this.happy = clamp(this.happy - dt * 0.45);
          this.heartT -= dt;
          if (this.heartT <= 0) { this.heartT = 0.18; h.fx.bubble(this.x + 4 + Math.random() * 8, this.y + 6); }
          if (!h.follower && this.stateT >= this.hold) {
            this.bathCool = 30; this.rest();
            h.say(this.name + ' is squeaky clean.', true);
            h.careDone();
          }
          break;
        case 'nuzzle':
          this.heartT -= dt;
          if (this.heartT <= 0) { this.heartT = 0.7; h.fx.heart(this.x + 8, this.y + 1); }
          if (!h.follower && this.stateT >= this.hold) this.rest();
          break;
        default: // idle / sit
          if (h.adjacent(this, h.other(this)) && h.other(this).awake) {
            this.heartT -= dt;
            if (this.heartT <= 0) { this.heartT = rnd(7, 14); h.fx.heart(this.x + 8, this.y + 1); }
          }
          if (!h.follower && this.stateT >= this.hold) this.decide(h);
      }
    }

    tickStats(dt) {
      const asleep = this.state === 'sleep';
      this.hunger = clamp(this.hunger + dt * RATE.hunger * (asleep ? 0.5 : 1));
      this.happy = clamp(this.happy - dt * RATE.happy * (this.hunger > 80 ? 2 : 1));
      this.clean = clamp(this.clean - dt * RATE.clean);
      const bad = this.hunger > 90 || this.clean < 8 || this.energy < 5;
      const good = this.hunger < 65 && this.clean > 25 && this.happy > 20;
      if (bad) this.health = clamp(this.health - dt * 10 / 3600);
      else if (good) this.health = clamp(this.health + dt * 6 / 3600);
    }

    updateWalk(dt, h) {
      if (!this.step) {
        if (!this.path.length) { if (!h.follower) this.arrive(h); return; }
        const n = this.path[0];
        if (h.occupied(n.x, n.y, this)) {
          if (h.follower) return;   // wait for the next snapshot from the leader
          this.waitT += dt;
          if (this.waitT > 0.7 && this.goal) {
            const p = h.findPath(this.tx, this.ty, this.goal.x, this.goal.y, this);
            if (p) this.path = p;
          }
          if (this.waitT > 2.2) { // stuck: give up gracefully
            this.waitT = 0; this.path = [];
            if (!(this.intent && this.intent.type === 'sleep')) this.intent = null;
            this.arrive(h);
          }
          return;
        }
        this.waitT = 0; this.path.shift();
        this.dir = dirOf(n.x - this.tx, n.y - this.ty);
        this.step = { fx: this.tx, fy: this.ty, tx: n.x, ty: n.y, p: 0 };
      }
      const s = this.step;
      s.p += dt * SPEED / T;
      if (s.p >= 1) {
        this.tx = s.tx; this.ty = s.ty; this.x = this.tx * T; this.y = this.ty * T; this.step = null;
      } else {
        this.x = (s.fx + (s.tx - s.fx) * s.p) * T;
        this.y = (s.fy + (s.ty - s.fy) * s.p) * T;
      }
    }

    updateSleep(dt, h) {
      this.sleepiness = Math.max(0, this.sleepiness - dt * REST);
      this.zT -= dt;
      if (this.zT <= 0) { h.fx.z(this.x + 11, this.y + 3); this.zT = rnd(1.6, 2.4); }
      if (h.cuddling(this)) {
        this.heartT -= dt;
        if (this.heartT <= 0) { h.fx.heart(this.x + (this.tx < h.other(this).tx ? 14 : 2), this.y + 2); this.heartT = rnd(4, 7); }
      }
      if (!h.follower && this.stateT >= this.minSleep && this.sleepiness <= 10) this.wake(h);
    }

    wake(h) {
      const o = h.other(this);
      this.sleepiness = Math.min(this.sleepiness, 8);
      if (o.state === 'sleep' && h.adjacent(this, o) && chance(0.5)) {
        this.dir = dirOf(o.tx - this.tx, o.ty - this.ty);
        this.sitting = true; this.setState('sit', rnd(6, 10));
        h.fx.heart(this.x + 8, this.y + 1);
      } else {
        this.sitting = true; this.setState('sit', rnd(1.5, 3.5));
      }
    }

    // ---------- movement commands ----------
    startPath(h, gx, gy, intent) {
      const ox = this.step ? this.step.tx : this.tx, oy = this.step ? this.step.ty : this.ty;
      const p = h.findPath(ox, oy, gx, gy, this);
      if (!p) return false;
      this.path = p; this.goal = { x: gx, y: gy }; this.intent = intent; this.waitT = 0; this.rev++;
      if (this.state !== 'walk') this.setState('walk');
      return true;
    }

    // ---------- arrival ----------
    arrive(h) {
      const it = this.intent; this.intent = null;
      const o = h.other(this);
      switch (it && it.type) {
        case 'pet':
          this.dir = 'd'; this.setState('happy', 2.6); break;
        case 'nuzzle':
          if (o.awake && !o.step && (o.state === 'idle' || o.state === 'sit') && h.adjacent(this, o)) {
            this.dir = dirOf(o.tx - this.tx, o.ty - this.ty);
            o.dir = dirOf(this.tx - o.tx, this.ty - o.ty);
            this.setState('nuzzle', 2.8); o.setState('nuzzle', 2.8);
            this.heartT = 0.2; o.heartT = 0.6;
            this.affCool = o.affCool = rnd(25, 50);
            h.fx.spark(this.x + 8, this.y + 2);
            h.say(this.name + ' and ' + o.name + ' touched noses.');
            h.bond('nuzzle');
          } else this.rest();
          break;
        case 'sitBeside':
          if (h.adjacent(this, o)) this.dir = dirOf(o.tx - this.tx, o.ty - this.ty); else this.dir = 'd';
          this.sitting = true; this.setState('sit', it.hold || rnd(7, 14));
          if (h.adjacent(this, o)) h.bond('sit');
          if (o.state === 'sleep') h.say(this.name + ' sat down to keep ' + o.name + ' company.');
          else if (chance(0.5)) h.say(this.name + ' sat down next to ' + o.name + '.');
          break;
        case 'sleep': this.beginSleep(h); break;
        case 'eat':
          if (h.bowl && h.bowl.tx === this.tx && h.bowl.ty === this.ty + 1) { this.dir = 'd'; this.setState('eat', 4.5); }
          else { h.bowl = null; this.rest(); }
          break;
        case 'bath': this.dir = 'd'; this.setState('bath', 4.5); this.heartT = 0; break;
        case 'chase':
          if (!h.ball) { this.rest(); break; }
          if (h.ball.tx === this.tx && h.ball.ty === this.ty) {
            if (h.bat(this) === 'go') { this.setState('happy', 0.45); this.next = () => this.chaseAgain(h); }
            else this.setState('happy', 1.6);
          } else this.chaseAgain(h);
          break;
        case 'gaze': this.dir = 'u'; this.sitting = true; this.setState('gaze', rnd(6, 9)); break;
        default: this.rest();
      }
    }

    beginSleep(h) {
      const o = h.other(this);
      this.setState('sleep'); this.minSleep = rnd(16, 24); this.zT = rnd(0.5, 1.5); this.heartT = rnd(3, 6);
      this.path = []; this.step = null;
      if (o.state === 'sleep' && h.adjacent(this, o)) {
        const cud = h.cuddling(this);
        h.say(cud ? this.name + ' and ' + o.name + ' curled up together.' : this.name + ' fell asleep next to ' + o.name + '.');
        h.fx.spark(this.x + 8, this.y + 6);
        h.bond(cud ? 'cuddle' : 'near');
      } else {
        h.say(this.name + ' is taking a nap.');
        if (o.awake && (o.state === 'idle' || o.state === 'sit')) o.hold = Math.min(o.hold, o.stateT + rnd(0.6, 2.2));
      }
    }

    // ---------- autonomous decisions ----------
    decide(h) {
      const o = h.other(this);
      const oIdle = o.awake && !o.step && (o.state === 'idle' || o.state === 'sit');
      if (this.sleepiness >= 72) return this.seekSleep(h);
      if (this.sad && chance(0.6)) { this.sitting = true; this.dir = 'd'; return this.setState('sit', rnd(4, 9)); }
      if (!h.ball && oIdle && this.playCool <= 0 && o.playCool <= 0 && this.sleepiness < 60 && o.sleepiness < 60 && chance(0.05)) {
        if (h.startPlay(this, true)) return;
      }
      if (o.state === 'sleep') {
        if (this.sleepiness > 28 && chance(0.6) && this.sleepBeside(h)) return;
        if (chance(0.35)) return this.goAdjacent(h, 'sitBeside', rnd(8, 16));
      }
      const r = Math.random();
      if (oIdle && this.affCool <= 0 && r < 0.26) return this.goAdjacent(h, 'nuzzle');
      if (oIdle && r < 0.44) return this.goAdjacent(h, 'sitBeside');
      if (r < 0.56 && o.awake) return this.follow(h);
      if (r < 0.66) {
        this.sitting = !this.sitting; this.dir = pick(['u', 'd', 'l', 'r']);
        return this.setState(this.sitting ? 'sit' : 'idle', rnd(3, 7));
      }
      return this.wander(h);
    }

    wander(h) {
      for (let i = 0; i < 8; i++) {
        const x = this.tx + Math.round(rnd(-5, 5)), y = this.ty + Math.round(rnd(-4, 4));
        if (inBounds(x, y) && !h.occupied(x, y, this) && (x !== this.tx || y !== this.ty)) {
          if (this.startPath(h, x, y, { type: 'wander' })) return;
        }
      }
      this.rest();
    }

    follow(h) {
      const o = h.other(this), d = o.destTile;
      const spots = [];
      for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) {
        const m = Math.abs(dx) + Math.abs(dy);
        if (m >= 2 && m <= 3 && inBounds(d.x + dx, d.y + dy) && !h.occupied(d.x + dx, d.y + dy, this)) spots.push([d.x + dx, d.y + dy]);
      }
      if (spots.length) { const s = pick(spots); if (this.startPath(h, s[0], s[1], { type: 'wander' })) return; }
      this.rest();
    }

    neighbours(h) {
      const d = h.other(this).destTile, out = [];
      for (const k in DV) {
        const x = d.x + DV[k][0], y = d.y + DV[k][1];
        if (inBounds(x, y) && !h.occupied(x, y, this)) out.push({ x: x, y: y, horiz: DV[k][1] === 0 });
      }
      return out;
    }

    goAdjacent(h, type, hold) {
      const c = this.neighbours(h);
      if (!c.length) return this.rest();
      c.sort(function (a, b) { return h.dist(this.tx, this.ty, a.x, a.y) - h.dist(this.tx, this.ty, b.x, b.y) + rnd(-1, 1); }.bind(this));
      if (!this.startPath(h, c[0].x, c[0].y, { type: type, hold: hold })) this.rest();
    }

    sleepBeside(h) {
      let c = this.neighbours(h);
      if (!c.length) return false;
      const horiz = c.filter(function (n) { return n.horiz; });
      if (horiz.length && chance(0.7)) c = horiz;
      const s = pick(c);
      return this.startPath(h, s.x, s.y, { type: 'sleep' });
    }

    seekSleep(h, solo) {
      const o = h.other(this);
      if (o.state === 'sleep') { if (this.sleepBeside(h)) return; }
      else if (!solo && o.awake && o.sleepiness > 40 && !o.step && chance(0.75) && h.napPair(this, o) === 'ok') return;
      const sun = Wd.SUN.filter(function (t) { return !h.occupied(t[0], t[1], this); }.bind(this));
      let spot = null;
      if (sun.length && chance(0.7)) spot = pick(sun);
      else { const x = Math.floor(rnd(1, W - 1)), y = Math.floor(rnd(3, H - 1)); if (!h.occupied(x, y, this)) spot = [x, y]; }
      if (spot && this.startPath(h, spot[0], spot[1], { type: 'sleep' })) return;
      this.beginSleep(h);
    }

    // ---------- player interaction ----------
    chaseAgain(h) {
      if (!h.ball) { this.rest(); return; }
      if (!this.startPath(h, h.ball.tx, h.ball.ty, { type: 'chase' })) this.rest();
    }

    // ---------- care actions (each returns { ok, msg }) ----------
    feed(h) {
      if (this.state === 'sleep') return { ok: false, msg: this.name + ' is asleep.' };
      if (this.hunger < 15) return { ok: false, msg: this.name + ' is not hungry right now.' };
      if (this.feedCool > 0) return { ok: false, msg: this.name + ' just ate. Try again in a little while.' };
      if (h.bowl) return { ok: false, msg: 'There is already food out.' };
      const mine = this.destTile, spots = [];
      for (let x = 0; x < W; x++) for (let y = MINY; y < H - 1; y++) {
        if (h.occupied(x, y, this) || h.occupied(x, y + 1, this)) continue;
        if (x === mine.x && y + 1 === mine.y) continue;
        if (h.ball && h.ball.tx === x && h.ball.ty === y + 1) continue;
        spots.push({ x: x, y: y, d: h.dist(x, y, mine.x, mine.y) + rnd(0, 2) });
      }
      spots.sort(function (a, b) { return a.d - b.d; });
      const s = spots[0];
      if (!s) return { ok: false, msg: 'There is no room to put a bowl down.' };
      h.bowl = { tx: s.x, ty: s.y + 1, amount: 1, who: this, age: 0 };
      if (!this.startPath(h, s.x, s.y, { type: 'eat' })) { h.bowl = null; return { ok: false, msg: this.name + ' cannot reach the bowl.' }; }
      return { ok: true, msg: 'A bowl of kibble is down. ' + this.name + ' is on the way.' };
    }

    play(h) {
      if (this.state === 'sleep') return { ok: false, msg: this.name + ' is asleep.' };
      if (this.sleepiness > 80) return { ok: false, msg: this.name + ' is too tired to play.' };
      if (this.playCool > 0) return { ok: false, msg: this.name + ' needs a short rest before playing again.' };
      if (h.ball) return { ok: false, msg: 'There is already a game going.' };
      if (!h.startPlay(this, chance(0.6))) return { ok: false, msg: 'There is no room to play right now.' };
      return { ok: true, msg: 'A ball of yarn rolls out. ' + this.name + ' pounces.' };
    }

    bathe(h) {
      if (this.state === 'sleep') return { ok: false, msg: this.name + ' is asleep.' };
      if (this.clean > 90) return { ok: false, msg: this.name + ' is already clean.' };
      if (this.bathCool > 0) return { ok: false, msg: this.name + ' just had a bath.' };
      if (this.state === 'walk') { this.path = []; this.goal = null; this.intent = { type: 'bath' }; this.rev++; }
      else { this.dir = 'd'; this.setState('bath', 4.5); this.heartT = 0; }
      return { ok: true, msg: this.name + ' is not thrilled, but here come the bubbles.' };
    }

    sleepNow(h) {
      if (this.state === 'sleep') return { ok: false, msg: this.name + ' is already asleep.' };
      if (this.sleepiness < 5) return { ok: false, msg: this.name + ' is wide awake.' };
      this.next = null; this.seekSleep(h, true);
      return { ok: true, msg: this.name + ' is looking for a cozy spot.' };
    }

    petted(h) {
      if (this.petCool <= 0) { this.happy = clamp(this.happy + 4); this.petCool = 3; }
      for (let i = 0; i < 3; i++) h.fx.heart(this.x + 8 + rnd(-4, 4), this.y + rnd(-2, 2));
      if (this.state === 'walk') { this.path = []; this.goal = null; this.intent = { type: 'pet' }; this.rev++; }
      else { this.dir = 'd'; this.setState('happy', 2.6); }
      const o = h.other(this);
      if (o.awake && !o.step && (o.state === 'idle' || o.state === 'sit') && o.affCool <= 0 &&
          h.dist(this.tx, this.ty, o.tx, o.ty) <= 7 && chance(0.55)) {
        const self = this;
        setTimeout(function () {
          if (self.state === 'happy' || self.intent) o.goAdjacent(h, 'nuzzle');
        }, 900);
      }
    }

    // ---------- sharing the scene between players ----------
    toSnap() {
      const r2 = function (v) { return Math.round(v * 100) / 100; };
      const o = { x: this.tx, y: this.ty, d: this.dir, s: this.state, sit: this.sitting ? 1 : 0, h: r2(this.hold), sT: r2(this.stateT), ms: r2(this.minSleep) };
      if (this.path.length) o.p = this.path.slice(0, 30).map(function (n) { return n.x + ',' + n.y; }).join(';');
      if (this.step) o.st = [this.step.fx, this.step.fy, this.step.tx, this.step.ty, r2(this.step.p)].join(',');
      if (this.goal) o.g = this.goal.x + ',' + this.goal.y;
      if (this.intent) { o.in = this.intent.type; if (this.intent.hold) o.ih = r2(this.intent.hold); }
      return o;
    }
    fromSnap(o, h) {
      const num = function (v, f) { return typeof v === 'number' && isFinite(v) ? v : f; };
      const ox = this.x, oy = this.y, was = this.state;
      this.tx = Math.max(0, Math.min(W - 1, num(o.x, this.tx))); this.ty = Math.max(MINY, Math.min(H - 1, num(o.y, this.ty)));
      this.dir = DV[o.d] ? o.d : 'd'; this.state = typeof o.s === 'string' ? o.s : 'idle';
      this.sitting = !!o.sit; this.hold = num(o.h, 0); this.stateT = num(o.sT, 0); this.minSleep = num(o.ms, 0);
      this.path = typeof o.p === 'string' ? o.p.split(';').map(function (t) { const a = t.split(','); return { x: +a[0], y: +a[1] }; }) : [];
      this.step = null;
      if (typeof o.st === 'string') { const a = o.st.split(',').map(Number); this.step = { fx: a[0], fy: a[1], tx: a[2], ty: a[3], p: a[4] }; }
      this.goal = typeof o.g === 'string' ? { x: +o.g.split(',')[0], y: +o.g.split(',')[1] } : null;
      this.intent = typeof o.in === 'string' ? { type: o.in, hold: o.ih } : null;
      this.next = null; this.waitT = 0; this.rev++;
      if (this.step) {
        this.x = (this.step.fx + (this.step.tx - this.step.fx) * this.step.p) * T;
        this.y = (this.step.fy + (this.step.ty - this.step.fy) * this.step.p) * T;
      } else { this.x = this.tx * T; this.y = this.ty * T; }
      const dx = ox - this.x, dy = oy - this.y;
      if (Math.abs(dx) + Math.abs(dy) <= 24) { this.ox = dx; this.oy = dy; } else { this.ox = 0; this.oy = 0; }
      if (was !== 'happy' && this.state === 'happy' && !h.ball) {
        for (let i = 0; i < 3; i++) h.fx.heart(this.x + 8 + rnd(-4, 4), this.y + rnd(-2, 2));
      }
    }

    // ---------- drawing info ----------
    look() {
      let pose = 'stand', frame = Math.floor(this.clock / 0.7) % 2, closed = this.blink > 0, dx = 0, dy = 0, sad = false;
      switch (this.state) {
        case 'walk': pose = 'walk'; frame = Math.floor(this.clock * 6) % 2; dy = frame ? 0 : -1; break;
        case 'sit': case 'gaze': pose = 'sit'; frame = Math.floor(this.clock / 0.8) % 2; break;
        case 'happy': pose = 'happy'; frame = Math.floor(this.clock * 4) % 2; dy = Math.floor(this.clock * 6) % 2 ? -1 : 0; break;
        case 'nuzzle':
          pose = 'happy'; frame = Math.floor(this.clock * 3) % 2;
          dx = DV[this.dir][0]; dy = Math.floor(this.clock * 4) % 2 ? -1 : 0; break;
        case 'sleep': pose = 'sleep'; frame = Math.floor(this.clock / 1.1) % 2; closed = true; break;
        case 'eat': pose = 'eat'; frame = Math.floor(this.clock * 3) % 2; break;
        case 'bath': pose = 'sit'; closed = true; frame = Math.floor(this.clock * 4) % 2; dx = Math.floor(this.clock * 8) % 2 ? 1 : 0; break;
        default:
          pose = this.sitting ? 'sit' : 'stand';
          if (this.sad && this.dir !== 'u') { pose = 'sit'; sad = true; }
      }
      return { pose: pose, frame: frame, closed: closed, dx: dx, dy: dy, sad: sad };
    }
  }

  class Household {
    constructor(fx) {
      this.fx = fx;
      this.lily = new Cat('lily', 'Lily', 5, 6, 38);
      this.joe = new Cat('joe', 'Joe', 10, 7, 52);
      this.cats = [this.lily, this.joe];
      this.onEvent = null; this.time = 0; this.lastSay = -99;
      this.bowl = null; this.ball = null;
      this.follower = false;   // true on the player who only watches; the leader runs the cats' decisions
      this.onCare = null;
      this.rel = { affection: 10, trust: 5, together: 0 };
    }
    other(c) { return c === this.lily ? this.joe : this.lily; }
    dist(ax, ay, bx, by) { return Math.abs(ax - bx) + Math.abs(ay - by); }
    adjacent(a, b) { return !a.step && !b.step && this.dist(a.tx, a.ty, b.tx, b.ty) === 1; }
    cuddling(c) {
      const o = this.other(c);
      return c.state === 'sleep' && o.state === 'sleep' && !c.step && !o.step && c.ty === o.ty && Math.abs(c.tx - o.tx) === 1;
    }
    occupied(x, y, c) {
      const o = this.other(c);
      if (this.bowl && this.bowl.tx === x && this.bowl.ty === y) return true;
      return (o.tx === x && o.ty === y) || (!!o.step && o.step.tx === x && o.step.ty === y);
    }
    occupiedAny(x, y) {
      if (this.bowl && this.bowl.tx === x && this.bowl.ty === y) return true;
      return this.cats.some(function (c) {
        const d = c.destTile; return (c.tx === x && c.ty === y) || (d.x === x && d.y === y);
      });
    }
    careDone() { if (this.onCare) this.onCare(); }
    say(text, force) {
      if (!force && this.time - this.lastSay < 3) return;
      this.lastSay = this.time;
      if (this.onEvent) this.onEvent(text);
    }
    update(dt) {
      this.time += dt;
      for (const c of this.cats) c.update(dt, this);
      const a = this.lily, b = this.joe;
      if (this.dist(a.tx, a.ty, b.tx, b.ty) <= 3) {
        this.rel.together += dt;
        this.rel.trust = Math.min(100, this.rel.trust + dt * 0.0015);
      }
      if (this.bowl && !this.follower) {
        this.bowl.age += dt;
        const w = this.bowl.who, ok = w.state === 'eat' || (w.intent && w.intent.type === 'eat');
        if (!ok || this.bowl.age > 45) this.bowl = null;
      }
      if (this.ball) {
        this.ball.age += dt; this.ball.t = Math.min(1, this.ball.t + dt / 0.35);
        if (this.ball.age > 40 && !this.follower) this.finishPlay();
      }
    }

    // ---------- relationship ----------
    bond(kind) {
      const t = { nuzzle: [0.12, 1.5], cuddle: [0.2, 2], sit: [0.03, 0.4], play: [0.3, 0], near: [0.08, 0.6] }[kind];
      if (!t) return;
      this.rel.affection = Math.min(100, this.rel.affection + t[0]);
      // company alone lifts joy up to 85; petting, play and food take it the rest of the way
      for (const c of this.cats) if (c.happy < 85) c.happy = Math.min(85, c.happy + t[1]);
    }
    bondInfo() {
      const avg = (this.rel.affection + this.rel.trust) / 2;
      let lv = 0;
      for (let i = 0; i < BOND_AT.length; i++) if (avg >= BOND_AT[i]) lv = i;
      return { level: lv + 1, name: BOND_NAMES[lv], affection: this.rel.affection, trust: this.rel.trust, together: this.rel.together };
    }

    // ---------- yarn-ball games ----------
    startPlay(c, withPartner) {
      if (this.ball) return false;
      let tile = null;
      for (let i = 0; i < 25 && !tile; i++) {
        const x = Math.floor(rnd(2, W - 2)), y = Math.floor(rnd(3, H - 1));
        if (!this.occupiedAny(x, y) && this.dist(x, y, c.tx, c.ty) >= 3) tile = [x, y];
      }
      if (!tile) return false;
      this.ball = { tx: tile[0], ty: tile[1], fx: tile[0], fy: tile[1], t: 1, hits: 6, age: 0, players: [c] };
      if (!c.startPath(this, tile[0], tile[1], { type: 'chase' })) { this.ball = null; return false; }
      const o = this.other(c);
      if (withPartner && o.awake && !o.step && (o.state === 'idle' || o.state === 'sit') && o.sleepiness <= 80) {
        if (o.startPath(this, tile[0], tile[1], { type: 'chase' })) this.ball.players.push(o);
      }
      return true;
    }
    bat(c) {
      const b = this.ball;
      b.hits--;
      this.fx.spark(c.x + 8, c.y + 4);
      if (b.hits <= 0) { this.finishPlay(); return 'done'; }
      let nx = b.tx, ny = b.ty;
      for (let i = 0; i < 14; i++) {
        const dx = Math.round(rnd(-4, 4)), dy = Math.round(rnd(-3, 3)), m = Math.abs(dx) + Math.abs(dy);
        if (m < 2 || m > 5) continue;
        const x = b.tx + dx, y = b.ty + dy;
        if (inBounds(x, y) && !this.occupiedAny(x, y)) { nx = x; ny = y; break; }
      }
      b.fx = b.tx; b.fy = b.ty; b.tx = nx; b.ty = ny; b.t = 0;
      for (const p of b.players) {
        if (p !== c && p.state === 'walk' && p.intent && p.intent.type === 'chase') p.startPath(this, nx, ny, { type: 'chase' });
      }
      return 'go';
    }
    finishPlay() {
      const b = this.ball; if (!b) return;
      this.ball = null;
      for (const p of b.players) { p.happy = clamp(p.happy + 14); p.sleepiness = Math.min(100, p.sleepiness + 7); p.playCool = 45; }
      this.careDone();
      if (b.players.length > 1) { this.bond('play'); this.say('Lily and Joe played together.', true); }
      else this.say(b.players[0].name + ' had a great time playing.', true);
    }

    // ---------- sharing the scene between players ----------
    signature() {
      return [this.lily.rev, this.joe.rev, this.bowl ? this.bowl.tx + ',' + this.bowl.ty : '-',
        this.ball ? this.ball.hits + ',' + this.ball.tx + ',' + this.ball.ty : '-'].join('|');
    }
    toSnap() {
      const o = { c: { lily: this.lily.toSnap(), joe: this.joe.toSnap() } };
      if (this.bowl) o.bowl = { x: this.bowl.tx, y: this.bowl.ty, a: Math.round(this.bowl.amount * 100) / 100, w: this.bowl.who.id };
      if (this.ball) {
        const b = this.ball;
        o.ball = { x: b.tx, y: b.ty, fx: b.fx, fy: b.fy, t: Math.round(b.t * 100) / 100, n: b.hits, pl: b.players.map(function (p) { return p.id; }).join(',') };
      }
      return o;
    }
    applySnap(o) {
      if (!o || !o.c) return;
      const self = this;
      for (const c of this.cats) if (o.c[c.id]) c.fromSnap(o.c[c.id], this);
      const b = o.bowl;
      this.bowl = b && typeof b.x === 'number' ? { tx: b.x, ty: b.y, amount: +b.a || 0, who: b.w === 'joe' ? this.joe : this.lily, age: 0 } : null;
      const l = o.ball;
      this.ball = l && typeof l.x === 'number' ? {
        tx: l.x, ty: l.y, fx: l.fx, fy: l.fy, t: +l.t || 0, hits: +l.n || 0, age: 0,
        players: String(l.pl || '').split(',').filter(Boolean).map(function (id) { return id === 'joe' ? self.joe : self.lily; })
      } : null;
    }
    // Catch a freshly received snapshot up to "now" (it travelled for lag seconds).
    fastForward(sec) {
      this.fx.muted = true;
      for (let t = 0; t < sec; t += 0.05) this.update(0.05);
      this.fx.muted = false;
    }
    statsSnap() {
      const r1 = function (v) { return Math.round(v * 10) / 10; };
      const pack = function (c) { return { hunger: r1(c.hunger), happy: r1(c.happy), clean: r1(c.clean), health: r1(c.health), sleepiness: r1(c.sleepiness) }; };
      return { lily: pack(this.lily), joe: pack(this.joe), rel: { affection: r1(this.rel.affection), trust: r1(this.rel.trust), together: Math.round(this.rel.together) } };
    }
    applyStats(st, away) {
      if (!st) return;
      const num = function (v, f) { return typeof v === 'number' && isFinite(v) ? clamp(v) : f; };
      for (const c of this.cats) {
        const s = st[c.id]; if (!s) continue;
        c.hunger = num(s.hunger, c.hunger); c.happy = num(s.happy, c.happy); c.clean = num(s.clean, c.clean);
        c.health = num(s.health, c.health); c.sleepiness = num(s.sleepiness, c.sleepiness);
      }
      if (st.rel) {
        this.rel.affection = num(st.rel.affection, this.rel.affection); this.rel.trust = num(st.rel.trust, this.rel.trust);
        if (typeof st.rel.together === 'number' && isFinite(st.rel.together) && st.rel.together >= 0) this.rel.together = st.rel.together;
      }
      if (away > 60) this.catchUp(Math.min(48 * 3600, away));
    }

    // ---------- saving and offline catch-up ----------
    serialize() {
      const pack = function (c) {
        return { hunger: c.hunger, happy: c.happy, clean: c.clean, health: c.health, sleepiness: c.sleepiness };
      };
      return { v: 2, savedAt: Date.now(), cats: { lily: pack(this.lily), joe: pack(this.joe) }, rel: this.rel };
    }
    load(d) {
      if (!d || d.v !== 2 || !d.cats || !d.rel) return 0;
      const num = function (v, f) { return typeof v === 'number' && isFinite(v) ? clamp(v) : f; };
      for (const c of this.cats) {
        const s = d.cats[c.id]; if (!s) continue;
        c.hunger = num(s.hunger, c.hunger); c.happy = num(s.happy, c.happy); c.clean = num(s.clean, c.clean);
        c.health = num(s.health, c.health); c.sleepiness = num(s.sleepiness, c.sleepiness);
      }
      this.rel.affection = num(d.rel.affection, 10); this.rel.trust = num(d.rel.trust, 5);
      this.rel.together = typeof d.rel.together === 'number' && isFinite(d.rel.together) && d.rel.together > 0 ? d.rel.together : 0;
      const away = typeof d.savedAt === 'number' && isFinite(d.savedAt) ? Math.min(48 * 3600, Math.max(0, (Date.now() - d.savedAt) / 1000)) : 0;
      if (away > 60) this.catchUp(away);
      return away;
    }
    // While nobody is watching the cats rest, get a little hungrier and a little lonelier.
    catchUp(sec) {
      for (const c of this.cats) {
        c.hunger = clamp(c.hunger + RATE.hunger * sec * 0.6);
        c.happy = clamp(c.happy - RATE.happy * sec * 0.6);
        c.clean = clamp(c.clean - RATE.clean * sec * 0.6);
        c.sleepiness = Math.max(0, c.sleepiness - sec * 30 / 3600);
        const harm = Math.max(0, c.hunger - 90) * 0.5 + Math.max(0, 10 - c.clean) * 0.5;
        c.health = clamp(c.health - harm);
      }
    }

    findPath(sx, sy, gx, gy, cat) {
      if (!inBounds(gx, gy)) return null;
      if (sx === gx && sy === gy) return [];
      const key = function (x, y) { return y * W + x; };
      const prev = new Map(); prev.set(key(sx, sy), null);
      const q = [[sx, sy]];
      while (q.length) {
        const cur = q.shift();
        for (const d of shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]])) {
          const nx = cur[0] + d[0], ny = cur[1] + d[1], k = key(nx, ny);
          if (!inBounds(nx, ny) || prev.has(k)) continue;
          if (!(nx === gx && ny === gy) && this.occupied(nx, ny, cat)) continue;
          prev.set(k, cur);
          if (nx === gx && ny === gy) {
            const path = []; let at = [nx, ny];
            while (at && !(at[0] === sx && at[1] === sy)) { path.unshift({ x: at[0], y: at[1] }); at = prev.get(key(at[0], at[1])); }
            return path;
          }
          q.push([nx, ny]);
        }
      }
      return null;
    }

    // Both cats walk to a pair of neighbouring tiles (sunbeam first) and fall asleep side by side.
    napPair(a, b) {
      if (a.state === 'sleep' && b.state === 'sleep') return 'already';
      if (a.state === 'sleep') return b.sleepBeside(this) ? 'ok' : 'fail';
      if (b.state === 'sleep') return a.sleepBeside(this) ? 'ok' : 'fail';
      let pair = null;
      if (chance(0.85)) pair = pick(Wd.SUN_PAIRS);
      else {
        const x = Math.floor(rnd(1, W - 2)), y = Math.floor(rnd(3, H - 1));
        pair = [[x, y], [x + 1, y]];
      }
      const left = a.tx <= b.tx ? a : b, right = left === a ? b : a;
      const ok1 = left.startPath(this, pair[0][0], pair[0][1], { type: 'sleep' });
      const ok2 = right.startPath(this, pair[1][0], pair[1][1], { type: 'sleep' });
      return ok1 && ok2 ? 'ok' : 'fail';
    }

    // Tell a cat to stop what it is doing and wait where it is.
    calm(c) {
      c.path = []; c.goal = null; c.intent = null;
      if (!c.step && c.state !== 'sleep') c.setState('idle', 3);
    }
  }

  LJ.Cat = Cat;
  LJ.Household = Household;
})(typeof window !== 'undefined' ? window : globalThis);
