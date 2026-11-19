/* Lily & Joe — rooms
 * Creates, joins and resumes a private two-player room and wires the Realtime Database
 * listeners. It knows nothing about cats; sync.js turns this data into game behaviour.
 *
 * rooms/CODE/
 *   meta              who made the room
 *   slots/a, slots/b  the two players (uid, name) - the room is full when both exist
 *   presence/UID      online flag, cleared by the server on disconnect
 *   state/pets        saved care stats      state/relationship   saved bond
 *   state/scene       latest snapshot of where the cats are and what they do
 *   commands/ID       actions a player asked the leader to run
 *   replies/UID       private answer to a command (for example "Lily is asleep")
 *   activities/ID     shared log line everyone sees
 */
(function (root) {
  'use strict';
  const LJ = (root.LJ = root.LJ || {});
  const FB = LJ.FB;
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O/1/I/L

  function genCode() {
    let s = '';
    const buf = new Uint32Array(8);
    (root.crypto || root.msCrypto).getRandomValues(buf);
    for (let i = 0; i < 8; i++) s += ALPHABET[buf[i] % ALPHABET.length];
    return s;
  }
  function cleanCode(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); }
  function pretty(code) { return code.slice(0, 4) + '-' + code.slice(4); }

  const Net = {
    code: null, name: '', slot: null, active: false, connected: false,
    players: {}, presence: {}, handlers: {}, _subs: [], _seen: {},
    genCode: genCode, cleanCode: cleanCode, pretty: pretty,

    get uid() { return FB.uid; },
    get partnerUid() {
      const a = Net.players.a, b = Net.players.b, me = FB.uid;
      return a && a.uid === me ? (b && b.uid) : (a && a.uid);
    },
    get partner() {
      const a = Net.players.a, b = Net.players.b, me = FB.uid;
      return a && a.uid === me ? b : a;
    },
    partnerOnline: function () { const u = Net.partnerUid; return !!(u && Net.presence[u] && Net.presence[u].online); },
    isOnline: function (uid) { return !!(Net.presence[uid] && Net.presence[uid].online); },

    // Slot a leads whenever it is online, otherwise slot b.
    leaderUid: function () {
      const a = Net.players.a, b = Net.players.b;
      if (a && Net.isOnline(a.uid)) return a.uid;
      if (b && Net.isOnline(b.uid)) return b.uid;
      return FB.uid;
    },
    isLeader: function () { return Net.leaderUid() === FB.uid; },

    R: function (p) { return FB.ref('rooms/' + Net.code + (p ? '/' + p : '')); },

    // ---------- entering a room ----------
    create: function (name, initialStats) {
      return FB.init().then(function () {
        let tries = 0;
        function attempt() {
          const code = genCode();
          return FB.ref('rooms/' + code).update({
            meta: { createdAt: FB.TS, owner: FB.uid, v: 3 },
            'slots/a': { uid: FB.uid, name: name, joinedAt: FB.TS }
          }).then(function () { return code; }, function (e) {
            if (++tries < 5) return attempt();
            throw e;
          });
        }
        return attempt();
      }).then(function (code) {
        Net.code = code; Net.name = name; Net.slot = 'a';
        const st = initialStats || {};
        const upd = {};
        ['lily', 'joe'].forEach(function (id) { if (st[id]) upd['pets/' + id] = Object.assign({ at: FB.TS }, st[id]); });
        if (st.rel) upd.relationship = Object.assign({ at: FB.TS }, st.rel);
        return Net.R('state').update(upd).then(function () { return code; });
      });
    },

    join: function (rawCode, name) {
      const code = cleanCode(rawCode);
      if (code.length !== 8) return Promise.reject(new Error('Invitation codes have 8 letters and numbers.'));
      return FB.init().then(function () {
        return FB.ref('rooms/' + code + '/slots/b').set({ uid: FB.uid, name: name, joinedAt: FB.TS });
      }).then(function () {
        Net.code = code; Net.name = name; Net.slot = 'b';
        return code;
      }, function (e) {
        if (e && /permission|denied/i.test(String(e.code || e.message))) {
          // Maybe we are already in this room (rejoining on this device).
          return Net.resume(code, name).catch(function () {
            throw new Error('That room does not exist, or it already has two players.');
          });
        }
        throw e;
      });
    },

    // Re-enter a room this browser already belongs to.
    resume: function (rawCode) {
      const code = cleanCode(rawCode);
      return FB.init().then(function () {
        return FB.ref('rooms/' + code + '/slots').once('value');
      }).then(function (snap) {
        const v = snap.val() || {};
        const slot = v.a && v.a.uid === FB.uid ? 'a' : v.b && v.b.uid === FB.uid ? 'b' : null;
        if (!slot) throw new Error('This browser is not a member of that room.');
        Net.code = code; Net.slot = slot; Net.name = v[slot].name;
        return code;
      });
    },

    leave: function () {
      if (!Net.active) return Promise.resolve();
      const done = Net.R('presence/' + FB.uid).set({ online: false, lastSeen: FB.TS }).catch(function () {});
      Net._stop();
      Net.code = null; Net.slot = null; Net.players = {}; Net.presence = {};
      return done;
    },

    // Call after create / join / resume succeeded (and after Sync.enter) to start listening.
    start: function () { Net._begin(); },

    // ---------- listeners ----------
    _on: function (ref, ev, fn) {
      ref.on(ev, fn, function (err) { if (Net.handlers.error) Net.handlers.error(err); });
      Net._subs.push([ref, ev, fn]);
    },
    _stop: function () {
      Net._subs.forEach(function (s) { try { s[0].off(s[1], s[2]); } catch (e) { /* ignore */ } });
      Net._subs = []; Net.active = false; Net.connected = false;
    },
    _emit: function (name, a, b) { const f = Net.handlers[name]; if (f) f(a, b); },

    _begin: function () {
      Net.active = true; Net._seen = {};
      const me = FB.uid, pres = Net.R('presence/' + me);

      Net._on(FB.ref('.info/connected'), 'value', function (s) {
        Net.connected = s.val() === true;
        if (Net.connected) {
          pres.onDisconnect().set({ online: false, lastSeen: FB.TS });
          pres.set({ online: true, lastSeen: FB.TS });
        }
        Net._emit('connection', Net.connected);
      });
      Net._on(Net.R('slots'), 'value', function (s) { Net.players = s.val() || {}; Net._emit('players'); });
      Net._on(Net.R('presence'), 'value', function (s) { Net.presence = s.val() || {}; Net._emit('presence'); });
      Net._on(Net.R('state/scene'), 'value', function (s) { Net._emit('scene', s.val()); });
      Net._on(Net.R('state/pets'), 'value', function (s) { Net._emit('pets', s.val()); });
      Net._on(Net.R('state/relationship'), 'value', function (s) { Net._emit('rel', s.val()); });
      Net._on(Net.R('replies/' + me), 'value', function (s) { if (s.val()) Net._emit('reply', s.val()); });
      Net._on(Net.R('activities').limitToLast(12), 'child_added', function (s) {
        const v = s.val(); if (v) Net._emit('activity', v, s.key);
      });
      Net._on(Net.R('commands'), 'child_added', function (s) {
        const v = s.val(); if (v) Net._emit('command', v, s.key);
      });
    },

    // ---------- publishing ----------
    publishScene: function (snap, extra) {
      return Net.R('state/scene').set(Object.assign({ by: FB.uid, t: FB.TS }, snap, extra || {})).catch(Net._fail);
    },
    publishStats: function (st) {
      const upd = {};
      ['lily', 'joe'].forEach(function (id) { upd['pets/' + id] = Object.assign({ at: FB.TS }, st[id]); });
      upd.relationship = Object.assign({ at: FB.TS }, st.rel);
      return Net.R('state').update(upd).catch(Net._fail);
    },
    // suppress: the author already showed this line locally, so do not show it again on echo.
    activity: function (text, actor, suppress) {
      const ref = Net.R('activities').push();
      if (suppress) Net._seen[ref.key] = true;
      return ref.set({ by: FB.uid, actor: actor || Net.name, text: String(text).slice(0, 160), t: FB.TS }).catch(Net._fail);
    },
    sendCommand: function (cmd) {
      return Net.R('commands').push(Object.assign({ by: FB.uid, t: FB.TS }, cmd)).catch(Net._fail);
    },
    removeCommand: function (key) { return Net.R('commands/' + key).remove().catch(function () {}); },
    reply: function (uid, msg) {
      return Net.R('replies/' + uid).set({ msg: String(msg).slice(0, 160), n: Date.now() }).catch(Net._fail);
    },
    pruneActivities: function (keep) {
      return Net.R('activities').once('value').then(function (s) {
        const keys = []; s.forEach(function (c) { keys.push(c.key); });
        keys.slice(0, Math.max(0, keys.length - keep)).forEach(function (k) { Net.R('activities/' + k).remove(); });
      }).catch(function () {});
    },
    _fail: function (e) { if (Net.handlers.error) Net.handlers.error(e); }
  };

  LJ.Net = Net;
})(typeof window !== 'undefined' ? window : globalThis);
