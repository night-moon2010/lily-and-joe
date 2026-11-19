/* Lily & Joe — LOCAL TEST BACKEND (developer tool)
 * Only active when the page is opened with ?mock=1. It imitates the small part of Firebase
 * that the game uses, storing the "database" in this browser so two tabs of the same browser
 * can play together without a Firebase project. Each tab is a different player.
 * It does NOT test the security rules and is not used for real play.
 */
(function (root) {
  'use strict';
  if (!/[?&]mock=1/.test(root.location.search)) return;
  root.LJ_MOCK = true;

  const KEY = 'ljmock:tree';
  const chan = new BroadcastChannel('ljmock');
  const sv = function (o) { return o && typeof o === 'object' && o['.sv'] === 'timestamp'; };
  let tree = load();
  const listeners = [];
  const onDisc = [];
  let seq = 0;

  function load() { try { return JSON.parse(root.localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save() { root.localStorage.setItem(KEY, JSON.stringify(tree)); chan.postMessage(1); }
  const split = function (p) { return String(p).split('/').filter(Boolean); };
  const clone = function (v) { return v === undefined ? null : JSON.parse(JSON.stringify(v)); };
  function resolve(v) {
    if (sv(v)) return Date.now();
    if (v && typeof v === 'object') { const o = {}; for (const k in v) { const r = resolve(v[k]); if (r !== null && r !== undefined) o[k] = r; } return Object.keys(o).length ? o : null; }
    return v === undefined ? null : v;
  }
  function get(path) {
    if (path === '.info/connected') return true;
    if (path === '.info/serverTimeOffset') return 0;
    let n = tree;
    for (const k of split(path)) { if (n === null || typeof n !== 'object' || !(k in n)) return null; n = n[k]; }
    return n === undefined ? null : n;
  }
  function put(path, val) {
    const ks = split(path);
    val = resolve(val);
    if (!ks.length) { tree = val || {}; return; }
    const trail = [tree]; let n = tree;
    for (let i = 0; i < ks.length - 1; i++) {
      if (n[ks[i]] === null || typeof n[ks[i]] !== 'object') { if (val === null) return; n[ks[i]] = {}; }
      n = n[ks[i]]; trail.push(n);
    }
    if (val === null) delete n[ks[ks.length - 1]]; else n[ks[ks.length - 1]] = val;
    for (let i = trail.length - 1; i > 0; i--) if (!Object.keys(trail[i]).length) delete trail[i - 1][ks[i - 1]];
  }
  function deny(path, val) {   // a tiny imitation of the "two players only" rule
    const m = /^rooms\/([^/]+)\/slots\/b$/.exec(path);
    if (!m || val === null) return false;
    const a = get('rooms/' + m[1] + '/slots/a'), b = get('rooms/' + m[1] + '/slots/b');
    return !a || (b && b.uid !== val.uid);
  }
  function fail() { const e = new Error('PERMISSION_DENIED: Permission denied'); e.code = 'PERMISSION_DENIED'; return e; }

  function snap(path, val) {
    const key = split(path).pop() || null;
    return {
      key: key, val: function () { return clone(val); }, exists: function () { return val !== null; },
      forEach: function (fn) { if (val && typeof val === 'object') Object.keys(val).sort().forEach(function (k) { fn(snap(path + '/' + k, val[k])); }); }
    };
  }

  function notify() {
    listeners.slice().forEach(function (l) {
      const v = get(l.path);
      if (l.ev === 'value') {
        const j = JSON.stringify(v);
        if (j !== l.last) { l.last = j; l.cb(snap(l.path, clone(v))); }
      } else if (l.ev === 'child_added') {
        const keys = v && typeof v === 'object' ? Object.keys(v).sort() : [];
        keys.forEach(function (k) { if (!l.known[k]) { l.known[k] = true; l.cb(snap(l.path + '/' + k, clone(v[k]))); } });
        Object.keys(l.known).forEach(function (k) { if (!keys.includes(k)) delete l.known[k]; });
      }
    });
  }
  const later = function (fn) { setTimeout(fn, 0); };
  chan.onmessage = function () { tree = load(); later(notify); };

  function Ref(path, limit) { this.path = split(path).join('/'); this.limit = limit || 0; this.key = split(path).pop() || null; }
  Ref.prototype = {
    child: function (p) { return new Ref(this.path + '/' + p); },
    limitToLast: function (n) { return new Ref(this.path, n); },
    set: function (v) {
      const self = this;
      return new Promise(function (res, rej) {
        later(function () {
          if (deny(self.path, v)) { rej(fail()); return; }
          put(self.path, v); save(); notify(); res();
        });
      });
    },
    update: function (obj) {
      const self = this;
      return new Promise(function (res, rej) {
        later(function () {
          for (const k in obj) if (deny(self.path + '/' + k, obj[k])) { rej(fail()); return; }
          if (/^rooms\/[^/]+$/.test(self.path) && 'meta' in obj && get(self.path + '/meta')) { rej(fail()); return; }
          for (const k in obj) put(self.path + '/' + k, obj[k]);
          save(); notify(); res();
        });
      });
    },
    remove: function () { return this.set(null); },
    push: function (v) { const r = new Ref(this.path + '/' + Date.now().toString(36).padStart(9, '0') + (seq++).toString(36).padStart(3, '0') + Math.random().toString(36).slice(2, 5));
      if (v !== undefined) { const pr = r.set(v); r.then = pr.then.bind(pr); r.catch = pr.catch.bind(pr); }
      return r; },
    once: function () { const p = this.path; return new Promise(function (res) { later(function () { res(snap(p, clone(get(p)))); }); }); },
    on: function (ev, cb) {
      const l = { path: this.path, ev: ev, cb: cb, last: undefined, known: {} };
      if (this.limit && ev === 'child_added') {
        const v = get(this.path), keys = v && typeof v === 'object' ? Object.keys(v).sort() : [];
        keys.slice(0, Math.max(0, keys.length - this.limit)).forEach(function (k) { l.known[k] = true; });
      }
      listeners.push(l);
      later(notify);
    },
    off: function (ev, cb) { for (let i = listeners.length - 1; i >= 0; i--) if (listeners[i].path === this.path && listeners[i].ev === ev && listeners[i].cb === cb) listeners.splice(i, 1); },
    onDisconnect: function () {
      const p = this.path;
      return {
        set: function (v) { onDisc.push(function () { put(p, v); }); return Promise.resolve(); },
        remove: function () { onDisc.push(function () { put(p, null); }); return Promise.resolve(); }
      };
    }
  };
  root.addEventListener('pagehide', function () { tree = load(); onDisc.forEach(function (f) { f(); }); save(); });

  let uid = root.sessionStorage.getItem('ljmock:uid');
  if (!uid) { uid = 'mock' + Math.random().toString(36).slice(2, 12); root.sessionStorage.setItem('ljmock:uid', uid); }
  const database = function () { return { ref: function (p) { return new Ref(p); } }; };
  database.ServerValue = { TIMESTAMP: { '.sv': 'timestamp' } };
  root.firebase = {
    apps: [], initializeApp: function () { this.apps.push(1); },
    auth: function () { return { currentUser: { uid: uid }, signInAnonymously: function () { return Promise.resolve({ user: { uid: uid } }); } }; },
    database: database
  };
})(window);
