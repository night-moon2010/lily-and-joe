/* Lily & Joe — the room
 * 16 x 12 tiles of 16px. Rows 0-1 are the wall, rows 2-11 are wooden floor.
 * The room starts empty on purpose: furniture is bought in the shop later.
 */
(function (root) {
  'use strict';
  const LJ = (root.LJ = root.LJ || {});

  const T = 16, W = 16, H = 12, MINY = 2;
  // Tiles inside the sunbeam that falls from the window; the cats love napping here.
  const SUN = [[7, 3], [8, 3], [9, 3], [8, 4], [9, 4], [9, 5], [10, 5]];
  const SUN_PAIRS = [[[7, 3], [8, 3]], [[8, 3], [9, 3]], [[8, 4], [9, 4]], [[9, 5], [10, 5]]];
  const WINDOW = { x: 88, y: 0, w: 64, h: 31 };   // clickable area
  const GLASS = { x: 100, y: 5, w: 40, h: 20 };   // visible sky

  function seeded(seed) {
    let s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function renderRoom() {
    const c = document.createElement('canvas');
    c.width = W * T; c.height = H * T;
    const g = c.getContext('2d');
    const R = function (x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); };
    const rand = seeded(7);

    // wall
    R(0, 0, 256, 32, '#d9a58f');
    for (let x = 0; x < 256; x += 16) R(x, 0, 8, 20, '#d09b85');
    R(0, 20, 256, 10, '#a8665f'); R(0, 20, 256, 1, '#e3b9a1'); R(0, 21, 256, 1, '#8f544f');
    for (let x = 0; x < 256; x += 32) {
      R(x + 2, 23, 28, 5, '#b87771'); R(x + 2, 23, 28, 1, '#c98a83'); R(x + 2, 27, 28, 1, '#8f544f');
    }
    R(0, 30, 256, 2, '#5a352f'); R(0, 30, 256, 1, '#7a4a42');

    // floor: horizontal planks with staggered seams
    R(0, 32, 256, 160, '#c08650');
    for (let r = 0; r < 20; r++) {
      const y = 32 + r * 8;
      R(0, y, 256, 8, r % 2 ? '#bb7f4a' : '#c58b54');
      R(0, y, 256, 1, '#8d5a30');
      R(0, y + 1, 256, 1, '#d29d65');
      const off = (r * 37) % 64;
      for (let x = -off; x < 256; x += 64) R(x, y, 1, 8, '#8d5a30');
      for (let k = 0; k < 5; k++) {
        const gx = Math.floor(rand() * 250), gy = y + 3 + Math.floor(rand() * 4);
        R(gx, gy, 3 + Math.floor(rand() * 4), 1, '#ad7340');
      }
    }
    R(0, 32, 256, 3, 'rgba(60,30,20,0.30)');

    // window with curtains
    R(84, 1, 72, 2, '#6e4b3a');
    R(98, 3, 44, 24, '#f2e6d0');
    R(GLASS.x, GLASS.y, GLASS.w, GLASS.h, '#86c7ee');
    R(GLASS.x, 13, GLASS.w, 6, '#a6dcf5');
    R(GLASS.x, 19, GLASS.w, 6, '#c5eaf8');
    R(104, 9, 9, 2, '#ffffff'); R(107, 7, 6, 2, '#ffffff');
    R(124, 12, 10, 2, '#ffffff'); R(127, 10, 5, 2, '#ffffff');
    R(GLASS.x, 22, GLASS.w, 3, '#7fbf7a'); R(GLASS.x, 24, GLASS.w, 1, '#5f9f5f');
    R(119, 5, 2, 20, '#f2e6d0'); R(GLASS.x, 14, GLASS.w, 2, '#f2e6d0');
    R(98, 3, 44, 1, '#fff7e6');
    R(92, 27, 56, 3, '#e3d3b6'); R(92, 29, 56, 1, '#a98f6a');
    R(90, 2, 8, 26, '#c75b6e'); R(92, 2, 1, 26, '#a94557'); R(95, 2, 1, 26, '#a94557');
    R(142, 2, 8, 26, '#c75b6e'); R(144, 2, 1, 26, '#a94557'); R(147, 2, 1, 26, '#a94557');
    R(90, 27, 8, 1, '#8c3a49'); R(142, 27, 8, 1, '#8c3a49');
    return c;
  }

  function drawBird(g, t, dur) {
    const p = Math.min(1, t / dur);
    const x = Math.round(GLASS.x - 4 + p * (GLASS.w + 8));
    const y = Math.round(10 + Math.sin(t * 2.4) * 2);
    g.save();
    g.beginPath(); g.rect(GLASS.x, GLASS.y, GLASS.w, GLASS.h); g.clip();
    g.fillStyle = '#35283f';
    const up = Math.floor(t * 8) % 2 === 0;
    const px = function (dx, dy) { g.fillRect(x + dx, y + dy, 1, 1); };
    if (up) { px(0, 0); px(4, 0); px(1, 1); px(2, 1); px(3, 1); }
    else { px(1, 0); px(2, 0); px(3, 0); px(0, 1); px(4, 1); }
    g.fillStyle = '#e9a23b'; g.fillRect(x + 5, y + 1, 1, 1);
    g.restore();
  }

  function drawSun(g, t) {
    const a = 0.15 + 0.03 * Math.sin(t * 0.8);
    g.fillStyle = 'rgba(255,244,170,' + a.toFixed(3) + ')';
    for (let y = 32; y < 96; y++) {
      const x0 = GLASS.x + Math.floor((y - 32) * 0.5);
      g.fillRect(x0, y, GLASS.w, 1);
    }
  }

  LJ.World = {
    T: T, W: W, H: H, MINY: MINY, SUN: SUN, SUN_PAIRS: SUN_PAIRS,
    WINDOW: WINDOW, GLASS: GLASS,
    renderRoom: renderRoom, drawBird: drawBird, drawSun: drawSun
  };
})(typeof window !== 'undefined' ? window : globalThis);
