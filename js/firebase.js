/* Lily & Joe — Firebase start-up (anonymous sign-in, database handle, shared clock) */
(function (root) {
  'use strict';
  const LJ = (root.LJ = root.LJ || {});

  const FB = {
    uid: null, db: null, auth: null, offset: 0, TS: null, mock: !!root.LJ_MOCK,

    // Why online rooms are unavailable, or '' when they can be used.
    problem: function () {
      if (!root.firebase) return 'The Firebase library could not be loaded. Check your internet connection.';
      if (FB.mock) return '';
      if (root.location.protocol === 'file:') return 'Online rooms need the page to be served over http(s). Use GitHub Pages, or run a local server (see the README).';
      const c = root.LJ_FIREBASE_CONFIG;
      if (!c || !c.apiKey || /^YOUR_/.test(c.apiKey) || /YOUR_PROJECT/.test(c.databaseURL || '')) {
        return 'Online rooms are not set up yet. Add your Firebase settings to js/firebase-config.js (see the README).';
      }
      return '';
    },

    // Signs in anonymously and resolves with the player's uid.
    init: function () {
      if (FB.uid) return Promise.resolve(FB.uid);
      const why = FB.problem();
      if (why) return Promise.reject(new Error(why));
      if (!root.firebase.apps.length) root.firebase.initializeApp(root.LJ_FIREBASE_CONFIG || {});
      FB.auth = root.firebase.auth();
      FB.db = root.firebase.database();
      FB.TS = root.firebase.database.ServerValue.TIMESTAMP;
      FB.db.ref('.info/serverTimeOffset').on('value', function (s) { FB.offset = +s.val() || 0; });
      return FB.auth.signInAnonymously().then(function (cred) {
        FB.uid = (cred && cred.user ? cred.user : FB.auth.currentUser).uid;
        return FB.uid;
      });
    },

    now: function () { return Date.now() + FB.offset; },
    ref: function (p) { return FB.db.ref(p); }
  };

  LJ.FB = FB;
})(typeof window !== 'undefined' ? window : globalThis);
