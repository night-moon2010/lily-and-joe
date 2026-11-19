/* Lily & Joe — keeping two players in step
 *
 * One player at a time is the LEADER: that browser runs the cats' decisions and the care
 * rules, and publishes a compact snapshot of the scene whenever the cats' plans change
 * (not every frame). The other player is a FOLLOWER: their browser replays the same
 * movement from each snapshot, and anything they press is sent to the leader as a command.
 * If the leader leaves, the other player takes over from the last snapshot.
 *
 * Playing solo skips all of this: the same game runs locally and saves to this browser.
 */
(function (root) {
  'use strict';
  const LJ = (root.LJ = root.LJ || {});
  const FB = LJ.FB, Net = LJ.Net;

  const cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };
  const ACT = {
    feed: function (c, n) { return n + ' fed ' + cap(c) + '.'; },
    play: function (c, n) { return n + ' played with ' + cap(c) + '.'; },
    bathe: function (c, n) { return n + ' gave ' + cap(c) + ' a bath.'; },
    sleep: function (c, n) { return n + ' put ' + cap(c) + ' to bed.'; },
    pet: function (c, n) { return n + ' petted ' + cap(c) + '.'; },
    nuzzle: function (c, n) { return n + ' brought Lily and Joe together.'; },
    nap: function (c, n) { return n + ' tucked Lily and Joe in for a nap.'; },
    look: function (c, n) { return n + ' pointed out the window.'; }
  };
  const CMD_KEYS = ['type', 'cat', 'x', 'y'];

  const Sync = {
    mode: 'solo', role: 'solo', ready: false, game: null, home: null,
    onStatus: function () {},      // set by the lobby: called when anything the status bar shows changes
    _flags: {}, _data: {}, _pending: {}, _done: {}, _sinceScene: 0, _sinceStats: 0, _sinceCmd: 0,
    _lastSig: '', _lastPetAct: 0, _joinedAt: 0, _fallback: null, _lastError: 0,

    attach: function (game) {
      Sync.game = game; Sync.home = game.home;
      game.onAct = Sync.dispatch;
      game.onTick = Sync.tick;
      game.home.onEvent = Sync.event;
      game.home.onCare = function () { Sync._sinceStats = 999; };
      root.addEventListener('pagehide', Sync.flush);
    },

    // ---------- entering and leaving ----------
    enter: function () {
      Sync.mode = 'room'; Sync.role = 'follower'; Sync.ready = false;
      Sync._flags = {}; Sync._data = {}; Sync._pending = {}; Sync._done = {};
      Sync._lastSig = ''; Sync._sinceScene = 999; Sync._sinceStats = 0;
      Sync._joinedAt = FB.now();
      Sync.game.paused = true;           // freeze the cats for a moment while the room's state arrives
      Sync.home.follower = true;
      const H = Net.handlers;
      H.players = H.presence = function () { Sync._flag(); Sync.recheck(); Sync.onStatus(); };
      H.connection = function () { Sync.onStatus(); };
      H.scene = function (v) { Sync._data.scene = v; Sync._flag('scene'); Sync.onScene(v); };
      H.pets = function (v) { Sync._data.pets = v; Sync._flag('pets'); Sync.onStats(); };
      H.rel = function (v) { Sync._data.rel = v; Sync._flag('rel'); Sync.onStats(); };
      H.activity = Sync.onActivity;
      H.command = function (v, key) { Sync._pending[key] = v; Sync.drain(); };
      H.reply = function (v) { if (v.n !== Sync._lastReply) { Sync._lastReply = v.n; Sync.game.onMessage(v.msg); } };
      H.error = function (e) {
        const now = Date.now();
        if (now - Sync._lastError > 8000) { Sync._lastError = now; Sync.game.onMessage('Connection problem: ' + ((e && e.message) || 'unknown') + '. Retrying.'); }
      };
      Sync._flags.players = Sync._flags.presence = false;
      clearTimeout(Sync._fallback);
      Sync._fallback = setTimeout(function () { Sync._start(); }, 4500);
    },

    leave: function () {
      clearTimeout(Sync._fallback);
      Net.handlers = {};
      Sync.mode = 'solo'; Sync.role = 'solo'; Sync.ready = false;
      Sync.home.follower = false; Sync.game.paused = false;
      return Net.leave();
    },

    _flag: function (k) {
      if (k) Sync._flags[k] = true;
      if (Net.players.a && Net.active) Sync._flags.players = true;
      if (Object.keys(Net.presence).length) Sync._flags.presence = true;
      const f = Sync._flags;
      if (f.players && f.presence && f.pets && f.rel && f.scene) Sync._start();
    },

    // First moment all the room's data is here: pick a role and load the saved world.
    _start: function () {
      if (Sync.ready || Sync.mode !== 'room') return;
      Sync.ready = true; clearTimeout(Sync._fallback);
      const home = Sync.home, d = Sync._data;
      const leader = Net.isLeader();
      const st = Sync._statsFrom(d);
      if (st) {
        // Only the first player to arrive adds the time nobody was watching.
        const at = d.pets && d.pets.lily && d.pets.lily.at;
        const away = leader && !Net.partnerOnline() && at ? Math.max(0, (FB.now() - at) / 1000) : 0;
        home.applyStats(st, away);
      }
      Sync._applyScene(d.scene, 60);
      Sync._setRole(leader);
      Sync.game.paused = false;
      if (leader) { Net.pruneActivities(40); Sync.game.onMessage('You are in the room. Share the code so your partner can join.'); }
      Sync.onStatus();
    },

    _statsFrom: function (d) {
      if (!d.pets) return null;
      return { lily: d.pets.lily, joe: d.pets.joe, rel: d.rel || null };
    },

    _setRole: function (leader) {
      const was = Sync.role;
      Sync.role = leader ? 'leader' : 'follower';
      Sync.home.follower = !leader;
      if (leader && was !== 'leader') { Sync._lastSig = ''; Sync._sinceScene = 999; Sync.drain(); }
    },

    // The partner arrived or left: the leader may change.
    recheck: function () {
      if (!Sync.ready || Sync.mode !== 'room') return;
      const leader = Net.isLeader();
      if ((Sync.role === 'leader') !== leader) Sync._setRole(leader);
    },

    // ---------- incoming data ----------
    _applyScene: function (s, maxAge) {
      if (!s || !s.c) return false;
      const age = (FB.now() - s.t) / 1000;
      if (!(age < maxAge)) return false;
      Sync.home.applySnap(s);
      if (age > 0.05) Sync.home.fastForward(Math.min(age, 3));
      if (s.bird && !Sync.game.bird) Sync.game.bird = { t: (+s.bird.t || 0) + Math.min(age, 3), dur: 6 };
      return true;
    },
    onScene: function (s) {
      if (!Sync.ready || Sync.role !== 'follower' || !s || s.by === FB.uid) return;
      Sync._applyScene(s, 1e9);
    },
    onStats: function () {
      if (!Sync.ready || Sync.role !== 'follower') return;
      const st = Sync._statsFrom(Sync._data);
      if (st) Sync.home.applyStats(st, 0);
    },
    onActivity: function (v, key) {
      if (Net._seen[key]) return;
      Net._seen[key] = true;
      if (typeof v.t === 'number' && v.t < Sync._joinedAt - 4000) return;   // history from before we arrived
      Sync.game.onMessage(v.text);
    },

    // ---------- outgoing ----------
    dispatch: function (cmd) {
      if (Sync.mode === 'solo' || Sync.role === 'leader') { Sync._run(cmd, FB.uid, Net.name || 'You', true); return; }
      if (!Net.active) return;
      if (!Net.connected) { Sync.game.onMessage('You are offline right now. Reconnecting...'); return; }
      const out = {};
      CMD_KEYS.forEach(function (k) { if (cmd[k] !== undefined) out[k] = cmd[k]; });
      Net.sendCommand(out);
    },

    // Runs a command here and tells the right people about it.
    _run: function (cmd, byUid, byName, mine) {
      const r = Sync.game.perform(cmd);
      if (!r) return;
      if (mine) { if (r.msg) Sync.game.onMessage(r.msg); }
      else if (!r.ok && r.msg) Net.reply(byUid, r.msg);
      if (Sync.mode === 'room' && r.ok && r.act && ACT[r.act]) {
        if (r.act === 'pet') {
          const now = Date.now();
          if (now - Sync._lastPetAct < 8000) return;
          Sync._lastPetAct = now;
        }
        Net.activity(ACT[r.act](cmd.cat || '', byName), byName, mine);
      }
    },

    // Things the cats do on their own ("Lily and Joe curled up together.").
    event: function (text) {
      if (Sync.mode === 'room' && Sync.role !== 'leader') return;
      Sync.game.onMessage(text);
      if (Sync.mode === 'room') Net.activity(text, 'Lily & Joe', true);
    },

    nameOf: function (uid) {
      const a = Net.players.a, b = Net.players.b;
      return a && a.uid === uid ? a.name : b && b.uid === uid ? b.name : 'Your partner';
    },

    drain: function () {
      if (Sync.role !== 'leader') return;
      Object.keys(Sync._pending).forEach(function (key) {
        const v = Sync._pending[key];
        delete Sync._pending[key];
        if (Sync._done[key]) return;
        Sync._done[key] = true;
        Net.removeCommand(key);
        if (v.by === FB.uid) return;
        if (typeof v.t === 'number' && FB.now() - v.t > 30000) return;   // too old to still be wanted
        Sync._run({ type: v.type, cat: v.cat, x: v.x, y: v.y }, v.by, Sync.nameOf(v.by), false);
      });
    },

    tick: function (dt) {
      if (Sync.mode !== 'room' || !Sync.ready) return;
      if (Sync.role !== 'leader') return;
      Sync._sinceScene += dt; Sync._sinceStats += dt; Sync._sinceCmd += dt;
      if (Sync._sinceCmd > 0.5) { Sync._sinceCmd = 0; Sync.drain(); }
      const home = Sync.home, sig = home.signature(), online = Net.partnerOnline();
      const minGap = online ? 0.35 : 6, beat = online ? 6 : 20;
      if ((sig !== Sync._lastSig && Sync._sinceScene >= minGap) || Sync._sinceScene >= beat) {
        Sync._lastSig = sig; Sync._sinceScene = 0;
        Net.publishScene(home.toSnap(), Sync.game.bird ? { bird: { t: Math.round(Sync.game.bird.t * 100) / 100 } } : null);
      }
      if (Sync._sinceStats >= 30) { Sync._sinceStats = 0; Net.publishStats(home.statsSnap()); }
    },

    // Best effort when the tab closes.
    flush: function () {
      if (Sync.mode === 'room' && Sync.ready && Sync.role === 'leader') Net.publishStats(Sync.home.statsSnap());
    },

    status: function () {
      return {
        mode: Sync.mode, role: Sync.role, ready: Sync.ready,
        connected: Net.connected, code: Net.code,
        partner: Net.partner ? { name: Net.partner.name, online: Net.partnerOnline() } : null
      };
    }
  };

  LJ.Sync = Sync;
})(typeof window !== 'undefined' ? window : globalThis);
