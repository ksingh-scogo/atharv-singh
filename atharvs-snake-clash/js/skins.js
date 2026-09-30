/* Snake skins: colors, patterns and rarity tiers (common / shiny / fancy). */
(function (root) {
  'use strict';
  var SC = root.SC = root.SC || {};
  var U = SC.util;

  function hex2rgb(h) {
    h = h.replace('#', '');
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }
  function rgb2hex(c) {
    function p(v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }
    return '#' + p(c[0]) + p(c[1]) + p(c[2]);
  }
  // amt < 0 darkens, amt > 0 lightens (-1..1)
  function shade(hex, amt) {
    var c = hex2rgb(hex);
    for (var i = 0; i < 3; i++) c[i] = amt < 0 ? c[i] * (1 + amt) : c[i] + (255 - c[i]) * amt;
    return rgb2hex(c);
  }
  function mix(h1, h2, t) {
    var a = hex2rgb(h1), b = hex2rgb(h2);
    return rgb2hex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  }

  var GRAD_STEPS = 24;
  function tierDark(h) { var c = hex2rgb(h); return c[0] + c[1] + c[2] < 300; }  // is this a dark color?

  // pat: solid | stripes | spots | gradient | rainbow | galaxy | fire | ice
  function make(id, name, tier, pat, colors, glow) {
    var s = { id: id, name: name, tier: tier, pat: pat, c: colors };
    s.dark = shade(colors[0], -0.45);
    s.light = shade(colors[0], 0.45);
    s.glow = glow || colors[0];
    s.grad = [];
    var a = colors[0], b = colors[1] || colors[0];
    if (pat === 'ice') { a = '#e8fbff'; b = '#62d0ff'; }
    for (var i = 0; i < GRAD_STEPS; i++) s.grad.push(mix(a, b, i / (GRAD_STEPS - 1)));
    s.leg = shade(colors[0], -0.2);   // legs are a bit darker than the body so they show up
    if (pat === 'rainbow') { s.dark = '#3a2a6a'; s.glow = '#ffffff'; s.leg = '#b98cff'; }
    if (pat === 'galaxy') { s.dark = '#0a0624'; s.glow = '#9a7bff'; s.leg = '#6a4fd0'; }
    if (pat === 'fire') { s.dark = '#6a1200'; s.glow = '#ff7a1a'; s.leg = '#ff8a1a'; }
    if (pat === 'ice') { s.dark = '#2a7da8'; s.glow = '#9fe6ff'; s.leg = '#8fdcff'; }
    if (pat === 'stripes') s.leg = colors[1] && tierDark(colors[1]) ? colors[1] : s.leg;
    return s;
  }

  var LIST = [
    // ---- Common: bright solid colors and simple patterns ----
    make('leaf', 'Leaf', 'common', 'solid', ['#4cd964']),
    make('sky', 'Sky', 'common', 'solid', ['#3aa8ff']),
    make('sunny', 'Sunny', 'common', 'solid', ['#ffd93b']),
    make('tangerine', 'Tangerine', 'common', 'solid', ['#ff9f43']),
    make('bubblegum', 'Bubblegum', 'common', 'solid', ['#ff6fb5']),
    make('grape', 'Grape', 'common', 'solid', ['#9b6bff']),
    make('cherry', 'Cherry', 'common', 'solid', ['#ff4d5e']),
    make('mint', 'Mint', 'common', 'solid', ['#2ed8c3']),
    make('zebra', 'Zebra', 'common', 'stripes', ['#f5f5f5', '#2b2b3a']),
    make('bee', 'Bee', 'common', 'stripes', ['#ffd93b', '#2b2b3a']),
    make('spotty', 'Spotty', 'common', 'spots', ['#7be06a', '#2f9e44']),
    make('sunset', 'Sunset', 'common', 'gradient', ['#ff9f43', '#ff4d8d']),
    make('ocean', 'Ocean', 'common', 'gradient', ['#3aa8ff', '#2ed8c3']),

    // ---- Shiny: glowing metallic/gem colors with sparkles ----
    make('gold', 'Gold', 'shiny', 'gradient', ['#ffe27a', '#ffa800'], '#ffd34d'),
    make('silver', 'Silver', 'shiny', 'gradient', ['#f4f8ff', '#9fb0c8'], '#dfe9ff'),
    make('emerald', 'Emerald', 'shiny', 'gradient', ['#5dffb0', '#0a9d63'], '#3dff9c'),
    make('ruby', 'Ruby', 'shiny', 'gradient', ['#ff6b7f', '#b0002a'], '#ff4d6d'),
    make('sapphire', 'Sapphire', 'shiny', 'gradient', ['#6fb6ff', '#2a3cff'], '#5aa0ff'),
    make('rosegold', 'Rose Gold', 'shiny', 'gradient', ['#ffc9b8', '#e8836e'], '#ffb19a'),

    // ---- Fancy: animated, extra glow, sparkle trails ----
    make('rainbow', 'Rainbow', 'fancy', 'rainbow', ['#ff5c5c']),
    make('galaxy', 'Galaxy', 'fancy', 'galaxy', ['#4b22b8', '#140a4c']),
    make('fire', 'Fire', 'fancy', 'fire', ['#ff6a00']),
    make('ice', 'Ice', 'fancy', 'ice', ['#62d0ff']),
    make('candy', 'Candy', 'fancy', 'stripes', ['#ff7ab8', '#ffffff'], '#ff9ad0')
  ];

  var BY_ID = {};
  LIST.forEach(function (s) { BY_ID[s.id] = s; });

  var BOSS_SKINS = [
    make('boss1', 'Sir Wobbly', 'boss', 'gradient', ['#b48cff', '#6a3fd6'], '#b48cff'),
    make('boss2', 'Grumpy Python', 'boss', 'spots', ['#ff8a4c', '#b53a00'], '#ff8a4c'),
    make('boss3', 'Mega Mamba', 'boss', 'stripes', ['#35d07f', '#0b5f3a'], '#35d07f'),
    make('boss4', 'Giga Cobra', 'boss', 'gradient', ['#ff5d73', '#7a0a2a'], '#ff5d73'),
    make('boss5', 'Dragon Duper', 'boss', 'fire', ['#ff3d00'], '#ffb000')
  ];

  SC.skins = {
    list: LIST,
    byId: function (id) { return BY_ID[id] || BY_ID.sapphire; },
    bossSkin: function (level) { return BOSS_SKINS[Math.max(0, Math.min(BOSS_SKINS.length - 1, level - 1))]; },
    shade: shade,
    mix: mix,

    // pick a random skin; shiny and fancy ones are rare on purpose
    random: function () {
      var r = U.rand(), tier = r < 0.72 ? 'common' : r < 0.93 ? 'shiny' : 'fancy';
      var pool = LIST.filter(function (s) { return s.tier === tier; });
      return U.pick(pool);
    },

    // the main body color of a segment (i = 0 is the head)
    colorAt: function (s, i, n, t) {
      switch (s.pat) {
        case 'solid': return s.c[0];
        case 'spots': return s.c[0];
        case 'stripes': return (Math.floor(i / 3) & 1) ? s.c[1] : s.c[0];
        case 'gradient': return s.grad[Math.min(GRAD_STEPS - 1, Math.floor(i / Math.max(1, n - 1) * GRAD_STEPS))];
        case 'ice': return s.grad[Math.min(GRAD_STEPS - 1, Math.floor(i / Math.max(1, n - 1) * GRAD_STEPS))];
        case 'rainbow': return 'hsl(' + Math.floor((i * 11 + t * 90) % 360) + ',92%,60%)';
        case 'fire':
          return 'hsl(' + Math.floor(8 + (Math.sin(t * 7 - i * 0.6) * 0.5 + 0.5) * 38 + (i / Math.max(1, n)) * 10) + ',100%,' +
            Math.floor(48 + (Math.sin(t * 9 + i) * 0.5 + 0.5) * 10) + '%)';
        case 'galaxy': return s.grad[Math.min(GRAD_STEPS - 1, Math.floor(i / Math.max(1, n - 1) * GRAD_STEPS))];
        default: return s.c[0];
      }
    },

    // one representative color (minimap dots, particles)
    baseColor: function (s) {
      if (s.pat === 'rainbow') return '#ff8adf';
      if (s.pat === 'fire') return '#ff8a1a';
      return s.c[0];
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
