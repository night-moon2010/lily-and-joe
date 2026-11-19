/* Lily & Joe — pixel sprites
 * Every sprite is drawn from code on a 16x16 grid (cuddling pair: 32x16),
 * then outlined automatically so both cats share one consistent look.
 */
(function (root) {
  'use strict';
  const LJ = (root.LJ = root.LJ || {});

  // f fur, s shade, l light patch, i inner ear / blush, e eyes,
  // n nose, c closed-eye line, o outline
  const PAL = {
    lily: { f: '#f6f2ee', s: '#d4cbe0', l: '#ffffff', i: '#f3a6b8', e: '#4a6fd8', n: '#ef8aa0', c: '#7d7194', o: '#6b6185' },
    joe:  { f: '#34303f', s: '#4d475c', l: '#4d475c', i: '#c77a8e', e: '#f2c230', n: '#d98a9a', c: '#9a8fb8', o: '#0f0d15' }
  };

  function grid(w, h) {
    const g = [];
    for (let y = 0; y < h; y++) g.push(new Array(w).fill(null));
    return g;
  }
  function put(g, x, y, c) {
    if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = c;
  }
  function rect(g, x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(g, x + i, y + j, c);
  }
  function outline(g, c) {
    const h = g.length, w = g[0].length, add = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (g[y][x]) continue;
      if ((y > 0 && g[y - 1][x]) || (y < h - 1 && g[y + 1][x]) ||
          (x > 0 && g[y][x - 1]) || (x < w - 1 && g[y][x + 1])) add.push([x, y]);
    }
    add.forEach(function (p) { g[p[1]][p[0]] = c; });
  }
  function flip(g) { return g.map(function (r) { return r.slice().reverse(); }); }

  // ---- side view (facing right) ----
  function side(g, P, o) {
    const p = function (x, y, c) { put(g, x, y, c); };
    const R = function (x, y, w, h, c) { rect(g, x, y, w, h, c); };
    const sw = o.frame;
    if (!o.sit) {
      p(3, 9, P.f); p(2, 8, P.f); p(2, 7, P.f); p(2, 6, P.f); p(sw ? 1 : 3, 5, P.s);
      R(3, 8, 8, 4, P.f); R(4, 11, 6, 1, P.s);
      if (o.walk) {
        if (!sw) { R(4, 12, 1, 2, P.f); R(9, 12, 1, 2, P.f); p(6, 12, P.s); p(7, 12, P.s); }
        else { R(6, 12, 1, 2, P.s); R(7, 12, 1, 2, P.s); p(4, 12, P.f); p(9, 12, P.f); }
      } else {
        R(4, 12, 1, 2, P.f); R(9, 12, 1, 2, P.f); R(6, 12, 1, 2, P.s); R(7, 12, 1, 2, P.s);
      }
      R(10, 5, 5, 5, P.f);
      p(10, 4, P.f); p(10, 3, P.f); p(11, 4, P.i);
      p(14, 4, P.f); p(14, 3, P.f); p(13, 4, P.i);
      if (o.closed) { p(12, 7, P.c); p(13, 7, P.c); } else { p(13, 6, P.e); p(13, 7, P.e); }
      p(14, 8, P.n);
    } else {
      p(3, 12, P.f); p(2, 12, P.f); p(1, 12, P.f); p(1, sw ? 10 : 11, P.s);
      R(4, 7, 6, 6, P.f); p(5, 9, P.s); p(5, 10, P.s); p(6, 10, P.s);
      R(9, 8, 2, 5, P.f); R(9, 13, 2, 1, P.l); R(5, 13, 3, 1, P.l);
      R(9, 3, 5, 5, P.f);
      p(9, 2, P.f); p(9, 1, P.f); p(10, 2, P.i);
      p(13, 2, P.f); p(13, 1, P.f); p(12, 2, P.i);
      if (o.closed) { p(11, 5, P.c); p(12, 5, P.c); }
      else if (o.sad) { p(12, 5, P.e); p(12, 4, P.c); p(12, 6, '#8fd0f0'); }
      else { p(12, 4, P.e); p(12, 5, P.e); }
      p(13, 6, P.n);
      if (o.happy) p(11, 6, P.i);
    }
  }

  // ---- front view (facing down / toward the player) ----
  function front(g, P, o) {
    const p = function (x, y, c) { put(g, x, y, c); };
    const R = function (x, y, w, h, c) { rect(g, x, y, w, h, c); };
    const sw = o.frame;
    p(11, 11, P.f); p(12, 10, P.f); p(12, 9, P.f); p(sw ? 13 : 12, 8, P.s);
    R(5, 8, 6, 5, P.f); R(5, 12, 6, 1, P.s);
    if (o.sit) { p(4, 11, P.f); p(4, 12, P.f); }
    R(7, 9, 2, 3, P.l);
    if (o.walk) { if (!sw) R(5, 13, 2, 1, P.l); else R(9, 13, 2, 1, P.l); }
    else { R(5, 13, 2, 1, P.l); R(9, 13, 2, 1, P.l); }
    R(5, 3, 6, 5, P.f);
    p(5, 2, P.f); p(5, 1, P.f); p(6, 2, P.i);
    p(10, 2, P.f); p(10, 1, P.f); p(9, 2, P.i);
    if (o.closed) { p(6, 5, P.c); p(9, 5, P.c); }
    else if (o.sad) { p(6, 5, P.e); p(9, 5, P.e); p(6, 4, P.c); p(9, 4, P.c); p(6, 6, '#8fd0f0'); }
    else { p(6, 4, P.e); p(6, 5, P.e); p(9, 4, P.e); p(9, 5, P.e); }
    p(7, 6, P.n); p(8, 6, P.n);
    if (o.sad) { p(7, 7, P.c); p(8, 7, P.c); }
    if (o.happy) { p(5, 6, P.i); p(10, 6, P.i); }
  }

  // ---- eating: front view, head lowered toward the bowl ----
  function eatFront(g, P, o) {
    const p = function (x, y, c) { put(g, x, y, c); };
    const R = function (x, y, w, h, c) { rect(g, x, y, w, h, c); };
    const sw = o.frame;
    p(11, 11, P.f); p(12, 10, P.f); p(12, 9, P.f); p(sw ? 13 : 12, 8, P.s);
    R(5, 9, 6, 4, P.f); R(5, 12, 6, 1, P.s); p(4, 11, P.f); p(4, 12, P.f);
    R(5, 13, 2, 1, P.l); R(9, 13, 2, 1, P.l);
    const hy = 6 + sw;
    R(5, hy, 6, 4, P.f);
    p(5, hy - 1, P.f); p(5, hy - 2, P.f); p(6, hy - 1, P.i);
    p(10, hy - 1, P.f); p(10, hy - 2, P.f); p(9, hy - 1, P.i);
    p(6, hy + 2, P.c); p(9, hy + 2, P.c);
    p(7, hy + 3, P.n); p(8, hy + 3, P.n);
  }

  // ---- back view (facing up / away) ----
  function back(g, P, o) {
    const p = function (x, y, c) { put(g, x, y, c); };
    const R = function (x, y, w, h, c) { rect(g, x, y, w, h, c); };
    const sw = o.frame;
    R(5, 8, 6, 5, P.f);
    if (o.sit) { p(4, 11, P.f); p(4, 12, P.f); p(11, 11, P.f); p(11, 12, P.f); }
    R(7 + sw, 8, 2, 5, P.s);
    R(5, 3, 6, 5, P.f); R(6, 6, 4, 1, P.s);
    p(5, 2, P.f); p(5, 1, P.f); p(6, 2, P.f);
    p(10, 2, P.f); p(10, 1, P.f); p(9, 2, P.f);
    if (o.walk) { if (!sw) R(5, 13, 2, 1, P.l); else R(9, 13, 2, 1, P.l); }
    else { R(5, 13, 2, 1, P.l); R(9, 13, 2, 1, P.l); }
  }

  // ---- curled-up sleeping cat; ox shifts it inside a wider grid ----
  function sleepCat(g, P, ox, frame, mir) {
    const q = function (x, y, c) { put(g, ox + (mir ? 15 - x : x), y, c); };
    const Q = function (x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) q(x + i, y + j, c); };
    Q(6, 8, 7, 1, P.f); Q(5, 9, 9, 1, P.f); Q(4, 10, 11, 2, P.f); Q(5, 12, 9, 1, P.f);
    if (frame) Q(7, 7, 5, 1, P.f);
    Q(8, 8, 4, 1, P.s);
    Q(4, 13, 10, 1, P.s); q(14, 12, P.s);
    Q(2, 9, 4, 1, P.f); Q(1, 10, 5, 2, P.f); Q(2, 12, 4, 1, P.f);
    q(2, 8, P.f); q(5, 8, P.f);
    q(2, 10, P.c); q(3, 10, P.c);
    q(1, 11, P.n);
  }

  function buildCat(id, dir, pose, frame, closed, sad) {
    const P = PAL[id];
    const g = grid(16, 16);
    const o = { frame: frame % 2, closed: !!closed, sad: !!sad, sit: false, walk: false, happy: false };
    if (pose === 'sleep') {
      sleepCat(g, P, 0, o.frame, dir === 'r' || dir === 'd');
      outline(g, P.o);
      return g;
    }
    if (pose === 'eat') { eatFront(g, P, o); outline(g, P.o); return g; }
    if (pose === 'sit') o.sit = true;
    if (pose === 'walk') o.walk = true;
    if (pose === 'happy') { o.sit = true; o.happy = true; o.closed = true; }
    const base = dir === 'l' ? 'r' : dir;
    if (base === 'r') side(g, P, o);
    else if (base === 'd') front(g, P, o);
    else back(g, P, o);
    outline(g, P.o);
    return dir === 'l' ? flip(g) : g;
  }

  function buildCuddle(leftId, rightId, frame) {
    const g = grid(32, 16);
    sleepCat(g, PAL[leftId], 2, frame % 2, true);
    sleepCat(g, PAL[rightId], 15, (frame + 1) % 2, false);
    outline(g, '#1a1320');
    return g;
  }

  // ---- canvas conversion + cache (browser only) ----
  const cache = {};
  function toCanvas(g) {
    const c = document.createElement('canvas');
    c.width = g[0].length; c.height = g.length;
    const x = c.getContext('2d');
    for (let j = 0; j < g.length; j++) for (let i = 0; i < g[0].length; i++) {
      if (g[j][i]) { x.fillStyle = g[j][i]; x.fillRect(i, j, 1, 1); }
    }
    return c;
  }
  function cat(id, dir, pose, frame, closed, sad) {
    const k = [id, dir, pose, frame % 2, closed ? 1 : 0, sad ? 1 : 0].join('|');
    return cache[k] || (cache[k] = toCanvas(buildCat(id, dir, pose, frame, closed, sad)));
  }
  function cuddle(leftId, rightId, frame) {
    const k = 'cuddle|' + leftId + '|' + rightId + '|' + (frame % 2);
    return cache[k] || (cache[k] = toCanvas(buildCuddle(leftId, rightId, frame)));
  }

  LJ.Sprites = { PAL: PAL, cat: cat, cuddle: cuddle, buildCat: buildCat, buildCuddle: buildCuddle };
})(typeof window !== 'undefined' ? window : globalThis);
