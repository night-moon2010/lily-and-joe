/* Lily & Joe — start-up and interface wiring */
(function () {
  'use strict';
  const LJ = window.LJ;
  const $ = function (id) { return document.getElementById(id); };
  const SAVE_KEY = 'lilyjoe.stage2';

  const game = new LJ.Game($('game'), $('stage'));
  const home = game.home;
  LJ.Sync.attach(game);
  LJ.app = { game: game };   // handy for debugging in the browser console

  // ---------- solo save (this browser only; rooms keep their state in Firebase) ----------
  function loadSolo() {
    try { return home.load(JSON.parse(localStorage.getItem(SAVE_KEY))); } catch (e) { return 0; }
  }
  const away = loadSolo();
  function save() {
    if (LJ.Sync.mode !== 'solo') return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(home.serialize())); } catch (e) { /* storage unavailable */ }
  }
  setInterval(save, 15000);
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', function () { if (document.hidden) save(); });

  // ---------- portraits ----------
  ['lily', 'joe'].forEach(function (id) {
    const c = $('portrait-' + id).getContext('2d');
    c.imageSmoothingEnabled = false;
    c.drawImage(LJ.Sprites.cat(id, 'd', 'sit', 0, false), 0, 0);
  });

  // ---------- message line ----------
  const toast = $('toast');
  let toastTimer = null;
  game.onMessage = function (text) {
    toast.textContent = text;
    toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('on'); }, 5000);
  };

  // ---------- selection ----------
  const cards = { lily: $('pick-lily'), joe: $('pick-joe') };
  function showSelection() {
    for (const id in cards) cards[id].setAttribute('aria-pressed', String(game.selected.id === id));
  }
  game.onSelect = showSelection;
  cards.lily.addEventListener('click', function () { game.select(home.lily); });
  cards.joe.addEventListener('click', function () { game.select(home.joe); });

  // ---------- stat bars ----------
  const STATS = [
    ['belly', 'Belly', '#f0a04b', function (c) { return c.belly; }],
    ['joy', 'Joy', '#ff7fa6', function (c) { return c.happy; }],
    ['energy', 'Energy', '#6ab0ff', function (c) { return c.energy; }],
    ['clean', 'Clean', '#5fd7e6', function (c) { return c.clean; }],
    ['health', 'Health', '#8bd36b', function (c) { return c.health; }]
  ];
  const bars = { lily: {}, joe: {} };
  ['lily', 'joe'].forEach(function (id) {
    const box = $('stats-' + id);
    STATS.forEach(function (s) {
      const row = document.createElement('span'); row.className = 'stat';
      const label = document.createElement('span'); label.className = 'sl'; label.textContent = s[1];
      const bar = document.createElement('span'); bar.className = 'bar'; bar.setAttribute('role', 'img');
      const fill = document.createElement('i'); fill.style.setProperty('--c', s[2]);
      bar.appendChild(fill); row.appendChild(label); row.appendChild(bar); box.appendChild(row);
      bars[id][s[0]] = { bar: bar, fill: fill, label: s[1] };
    });
  });

  function setBar(b, v) {
    const r = Math.round(v);
    b.fill.style.width = r + '%';
    b.bar.classList.toggle('low', r < 25);
    b.bar.setAttribute('aria-label', b.label + ' ' + r + ' out of 100');
  }

  // ---------- relationship panel ----------
  const heartCtx = $('bond-hearts').getContext('2d');
  const HEART = ['.X.X.', 'XXXXX', 'XXXXX', '.XXX.', '..X..'];
  let lastLevel = 0;
  function drawHearts(level) {
    if (level === lastLevel) return;
    lastLevel = level;
    heartCtx.clearRect(0, 0, 40, 5);
    for (let i = 0; i < 5; i++) {
      heartCtx.fillStyle = i < level ? '#ff6a95' : '#4a3a5c';
      for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) if (HEART[y][x] === 'X') heartCtx.fillRect(i * 8 + x, y, 1, 1);
    }
  }
  function fmtTime(sec) {
    const m = Math.floor(sec / 60);
    return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
  }
  const bondBars = { affection: { bar: $('bar-affection'), fill: $('bar-affection').firstElementChild, label: 'Affection' },
                     trust: { bar: $('bar-trust'), fill: $('bar-trust').firstElementChild, label: 'Trust' } };
  bondBars.affection.fill.style.setProperty('--c', '#ff6a95');
  bondBars.trust.fill.style.setProperty('--c', '#c9a6ff');

  // ---------- live refresh ----------
  const st = { lily: $('st-lily'), joe: $('st-joe') };
  function refresh() {
    home.cats.forEach(function (c) {
      const t = game.statusOf(c);
      if (st[c.id].textContent !== t) st[c.id].textContent = t;
      STATS.forEach(function (s) { setBar(bars[c.id][s[0]], s[3](c)); });
    });
    const b = home.bondInfo();
    drawHearts(b.level);
    $('bond-name').textContent = b.name;
    setBar(bondBars.affection, b.affection); setBar(bondBars.trust, b.trust);
    bondBars.affection.bar.classList.remove('low'); bondBars.trust.bar.classList.remove('low');
    $('together').textContent = fmtTime(b.together);
  }
  setInterval(refresh, 400);
  refresh();

  // ---------- actions ----------
  function onCat(type) { return function () { game.act({ type: type, cat: game.selected.id }); }; }
  $('act-feed').addEventListener('click', onCat('feed'));
  $('act-play').addEventListener('click', onCat('play'));
  $('act-bathe').addEventListener('click', onCat('bathe'));
  $('act-sleep').addEventListener('click', onCat('sleep'));
  $('act-pet').addEventListener('click', onCat('pet'));
  $('act-nuzzle').addEventListener('click', onCat('nuzzle'));
  $('act-nap').addEventListener('click', function () { game.act({ type: 'nap' }); });
  $('act-look').addEventListener('click', function () { game.act({ type: 'look' }); });

  // ---------- fullscreen ----------
  const app = document.querySelector('.app'), fsBtn = $('act-fs'), body = document.body;
  function showFs(on) {
    body.classList.toggle('is-fs', on);
    fsBtn.setAttribute('aria-pressed', String(on));
    fsBtn.textContent = on ? 'Exit fullscreen' : 'Fullscreen';
    setTimeout(function () { game.fit(); }, 60);
  }
  function nativeFs() { return document.fullscreenElement || document.webkitFullscreenElement; }
  function toggleFs() {
    if (body.classList.contains('is-fs')) {
      body.classList.remove('pseudo-fs');
      if (nativeFs()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
      showFs(false);
      return;
    }
    const req = app.requestFullscreen || app.webkitRequestFullscreen;
    if (req) {
      try {
        const p = req.call(app);
        showFs(true);
        if (p && p.catch) p.catch(function () { body.classList.add('pseudo-fs'); });
        return;
      } catch (e) { /* fall through */ }
    }
    body.classList.add('pseudo-fs');   // iPhone and other browsers without the Fullscreen API
    showFs(true);
  }
  function onFsChange() {
    if (nativeFs()) showFs(true);
    else if (!body.classList.contains('pseudo-fs')) showFs(false);
  }
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);
  fsBtn.addEventListener('click', toggleFs);

  // ---------- keyboard ----------
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const map = { ArrowUp: 'u', ArrowDown: 'd', ArrowLeft: 'l', ArrowRight: 'r', w: 'u', s: 'd', a: 'l', d: 'r' };
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (map[k]) { e.preventDefault(); game.moveSelectedBy(map[k]); }
    else if (k === '1') game.select(home.lily);
    else if (k === '2') game.select(home.joe);
    else if (k === 'p') game.act({ type: 'pet', cat: game.selected.id });
    else if (k === 'f') toggleFs();
    else if (k === 'Escape' && body.classList.contains('pseudo-fs')) toggleFs();
  });

  showSelection();
  game.start();
  LJ.Lobby.init(game, { reloadSolo: loadSolo });
  if (away > 3600) game.onMessage('Welcome back. Lily and Joe got a little hungrier while you were away.');
  else game.onMessage('Tap the floor to walk, tap a cat to pet it, or try Feed and Play.');
  LJ.Lobby.boot();
})();
