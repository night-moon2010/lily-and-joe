/* Lily & Joe — the room screen: create, join or play solo, plus the status bar */
(function (root) {
  'use strict';
  const LJ = (root.LJ = root.LJ || {});
  const $ = function (id) { return document.getElementById(id); };
  const FB = LJ.FB, Net = LJ.Net, Sync = LJ.Sync;
  const SESSION = 'lilyjoe.session', NAME = 'lilyjoe.name', MODE = 'lilyjoe.mode';

  const Lobby = {
    game: null, hooks: {}, busy: false,

    init: function (game, hooks) {
      Lobby.game = game; Lobby.hooks = hooks || {};
      $('btn-create').addEventListener('click', Lobby.create);
      $('btn-join').addEventListener('click', Lobby.join);
      $('btn-solo').addEventListener('click', Lobby.solo);
      $('btn-close').addEventListener('click', function () { Lobby.hide(); });
      $('btn-online').addEventListener('click', function () { Lobby.show(); });
      $('btn-leave').addEventListener('click', Lobby.leave);
      $('btn-invite').addEventListener('click', function () { Lobby.copy(Lobby.link(Net.code), 'Invite link copied.'); });
      $('btn-copy-code').addEventListener('click', function () { Lobby.copy(Net.pretty(Net.code), 'Code copied.'); });
      $('btn-copy-link').addEventListener('click', function () { Lobby.copy(Lobby.link(Net.code), 'Invite link copied.'); });
      $('btn-enter').addEventListener('click', function () { Lobby.hide(); });
      $('in-code').addEventListener('input', function (e) {
        const c = Net.cleanCode(e.target.value);
        e.target.value = c.length > 4 ? c.slice(0, 4) + '-' + c.slice(4) : c;
      });
      $('lobby').addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !$('btn-close').hidden) Lobby.hide();
      });
      Sync.onStatus = Lobby.updateBar;
      $('in-name').value = localStorage.getItem(NAME) || '';
      Lobby.updateBar();
    },

    // First screen: pick up where this device left off.
    boot: function () {
      const params = new URLSearchParams(root.location.search);
      const urlCode = Net.cleanCode(params.get('room'));
      let session = null;
      try { session = JSON.parse(localStorage.getItem(SESSION)); } catch (e) { session = null; }
      if (urlCode) $('in-code').value = urlCode.slice(0, 4) + '-' + urlCode.slice(4);

      if (session && session.room && (!urlCode || urlCode === session.room) && !FB.problem()) {
        Lobby.show('Reconnecting to your room...');
        Net.resume(session.room).then(function (code) { Lobby.entered(code, false); }, function () {
          localStorage.removeItem(SESSION);
          Lobby.show('', 'You are no longer in that room. Create a new one or join with a code.');
        });
        return;
      }
      if (urlCode) { Lobby.show('You were invited to a room. Type your name and join.'); return; }
      if (localStorage.getItem(MODE) === 'solo') { Lobby.hide(); return; }
      Lobby.show();
    },

    show: function (lead, error) {
      const why = FB.problem();
      $('lobby-main').hidden = false; $('lobby-created').hidden = true;
      $('lobby-warn').hidden = !why; $('lobby-warn').textContent = why;
      $('lobby-error').textContent = error || '';
      const inRoom = Sync.mode === 'room';
      $('btn-create').disabled = $('btn-join').disabled = !!why || inRoom;
      $('btn-close').hidden = false;
      $('btn-solo').hidden = inRoom;
      if (lead) $('lobby-error').textContent = lead;
      $('lobby').hidden = false;
      setTimeout(function () { (why ? $('btn-solo') : $('in-name').value ? $('in-code') : $('in-name')).focus(); }, 30);
    },
    hide: function () { $('lobby').hidden = true; },

    name: function () {
      const n = $('in-name').value.trim().slice(0, 12);
      if (!n) { $('lobby-error').textContent = 'Please type a name first.'; $('in-name').focus(); return ''; }
      localStorage.setItem(NAME, n);
      return n;
    },
    setBusy: function (b) { Lobby.busy = b; $('btn-create').disabled = $('btn-join').disabled = b; },

    create: function () {
      if (Lobby.busy) return;
      const n = Lobby.name(); if (!n) return;
      $('lobby-error').textContent = ''; Lobby.setBusy(true);
      Net.create(n, Lobby.game.home.statsSnap()).then(function (code) {
        Lobby.entered(code, true);
      }, function (e) { Lobby.fail(e); });
    },
    join: function () {
      if (Lobby.busy) return;
      const n = Lobby.name(); if (!n) return;
      $('lobby-error').textContent = ''; Lobby.setBusy(true);
      Net.join($('in-code').value, n).then(function (code) {
        Lobby.entered(code, false);
      }, function (e) { Lobby.fail(e); });
    },
    fail: function (e) {
      Lobby.setBusy(false);
      $('lobby-error').textContent = (e && e.message) || 'Something went wrong. Please try again.';
    },

    // We are a member of the room: start the live connection.
    entered: function (code, fresh) {
      Lobby.setBusy(false);
      Sync.enter();
      Net.start();
      localStorage.setItem(SESSION, JSON.stringify({ room: code }));
      localStorage.setItem(MODE, 'room');
      Lobby.updateBar();
      if (fresh) {
        $('lobby-main').hidden = true; $('lobby-created').hidden = false;
        $('created-code').textContent = Net.pretty(code);
        setTimeout(function () { $('btn-copy-code').focus(); }, 30);
      } else Lobby.hide();
    },

    solo: function () { localStorage.setItem(MODE, 'solo'); Lobby.hide(); Lobby.updateBar(); },

    leave: function () {
      if (!root.confirm('Leave this room? You can come back later with the code.')) return;
      Sync.leave().then(function () {
        localStorage.removeItem(SESSION); localStorage.setItem(MODE, 'solo');
        if (Lobby.hooks.reloadSolo) Lobby.hooks.reloadSolo();
        Lobby.updateBar();
        Lobby.game.onMessage('You left the room. Back to solo mode.');
      });
    },

    link: function (code) {
      return root.location.origin + root.location.pathname + '?room=' + code + (root.LJ_MOCK ? '&mock=1' : '');
    },
    copy: function (text, done) {
      const ok = function () { Lobby.game.onMessage(done); };
      if (root.navigator.clipboard && root.navigator.clipboard.writeText) {
        root.navigator.clipboard.writeText(text).then(ok, function () { root.prompt('Copy this:', text); });
      } else root.prompt('Copy this:', text);
    },

    updateBar: function () {
      const room = Sync.mode === 'room';
      $('pill-conn').hidden = $('pill-partner').hidden = $('room-code').hidden = !room;
      $('btn-invite').hidden = $('btn-leave').hidden = !room;
      $('solo-note').hidden = $('btn-online').hidden = room;
      if (!room) return;
      const c = $('pill-conn');
      c.className = 'pill ' + (Net.connected ? 'ok' : 'warn');
      c.textContent = Net.connected ? 'Connected' : 'Reconnecting...';
      const p = Net.partner, pp = $('pill-partner');
      if (!p) { pp.className = 'pill warn'; pp.textContent = 'Waiting for your partner'; }
      else if (Net.partnerOnline()) { pp.className = 'pill ok'; pp.textContent = p.name + ' is here'; }
      else { pp.className = 'pill off'; pp.textContent = p.name + ' is away'; }
      $('room-code').textContent = 'Room ' + Net.pretty(Net.code || '--------');
    }
  };

  LJ.Lobby = Lobby;
})(window);
