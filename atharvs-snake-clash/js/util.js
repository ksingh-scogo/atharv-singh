/* Small helpers: math, random numbers, saved settings. */
(function (root) {
  'use strict';
  var SC = root.SC = root.SC || {};
  var TAU = Math.PI * 2;

  var U = SC.util = {
    TAU: TAU,
    rand: Math.random, // tests swap this for a seeded generator
    rnd: function (a, b) { return a + U.rand() * (b - a); },
    rint: function (a, b) { return Math.floor(a + U.rand() * (b - a + 1)); },
    pick: function (arr) { return arr[Math.floor(U.rand() * arr.length)]; },
    clamp: function (v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp: function (a, b, t) { return a + (b - a) * t; },

    // a - b wrapped into [-PI, PI]
    angDiff: function (a, b) {
      var d = (a - b) % TAU;
      if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
      return d;
    },
    blendAngle: function (a, b, t) { return a + U.angDiff(b, a) * t; },
    dist: function (a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); },

    // Body size from "mass" (what the score/size number means)
    radiusFor: function (m) { return Math.min(SC.CFG.MAX_RADIUS, 9 + 2.1 * Math.sqrt(Math.max(0, m))); },
    segsFor: function (m) { return 10 + Math.floor(2 * Math.sqrt(Math.max(0, m))); },

    fmt: function (n) { return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); },

    mulberry32: function (a) {
      return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        var t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
  };

  // Saved settings + high scores (localStorage, with a safe fallback)
  var KEY = 'atharvs-snake-clash-v1';
  var mem = null;
  SC.store = {
    load: function () {
      if (mem) return mem;
      var data = {};
      try { data = JSON.parse(root.localStorage.getItem(KEY)) || {}; } catch (e) { data = {}; }
      mem = data;
      return mem;
    },
    save: function () {
      try { root.localStorage.setItem(KEY, JSON.stringify(mem || {})); } catch (e) { /* private mode etc. */ }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
