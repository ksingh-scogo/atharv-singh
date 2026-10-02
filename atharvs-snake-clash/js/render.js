/* Draws the world: camera, arena floor, eggs, snakes, names, minimap, arrows to the King and the Boss. */
(function (root) {
  'use strict';
  var SC = root.SC = root.SC || {};
  var CFG = SC.CFG, U = SC.util, art = SC.art;
  var TAU = U.TAU;
  var FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

  function Renderer(canvas, mini) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.mini = mini;
    this.mctx = mini.getContext('2d');
    this.quality = 1;
    this.cam = { x: 0, y: 0, scale: 0.8, shake: 0 };
    this.w = 1; this.h = 1; this.dpr = 1;
    this.focus = null; this.focusT = 0;
    this.resize();
  }

  Renderer.prototype.resize = function () {
    var dpr = Math.min(root.devicePixelRatio || 1, 2) * this.quality;
    var w = root.innerWidth || 800, h = root.innerHeight || 600;
    this.cv.width = Math.max(1, Math.floor(w * dpr));
    this.cv.height = Math.max(1, Math.floor(h * dpr));
    this.w = w; this.h = h; this.dpr = dpr;
  };

  Renderer.prototype.setQuality = function (q) { this.quality = q; this.resize(); };

  Renderer.prototype.toScreen = function (x, y) {
    var c = this.cam;
    return { x: (x - c.x) * c.scale + this.w / 2, y: (y - c.y) * c.scale + this.h / 2 };
  };

  // where the camera wants to look, and how zoomed out it should be
  Renderer.prototype.target = function (world, dt) {
    var P = world.player;
    if (P && P.alive) return { x: P.x, y: P.y, r: P.radius };
    if (world.match && world.deathInfo) return { x: world.deathInfo.x, y: world.deathInfo.y, r: 18 };
    // title screen: drift along after a random snake
    this.focusT -= dt;
    if (!this.focus || !this.focus.alive || this.focusT <= 0) {
      var cand = world.snakes.filter(function (s) { return s.alive && !s.eaten && !s.isBoss; });
      this.focus = cand.length ? U.pick(cand) : null;
      this.focusT = 12;
    }
    return this.focus ? { x: this.focus.x, y: this.focus.y, r: 30 } : { x: 0, y: 0, r: 30 };
  };

  Renderer.prototype.follow = function (world, dt, snap) {
    var cam = this.cam, t = this.target(world, dt);
    var ts = U.clamp(Math.min(this.w, this.h) / (420 + t.r * 9), 0.12, 1.6);
    if (snap) { cam.x = t.x; cam.y = t.y; cam.scale = ts; return; }
    var k = Math.min(1, dt * 7);
    cam.x += (t.x - cam.x) * k; cam.y += (t.y - cam.y) * k;
    cam.scale += (ts - cam.scale) * Math.min(1, dt * 2.5);
    if (cam.shake > 0) cam.shake = Math.max(0, cam.shake - dt * 28);
  };

  function inView(s, L, R, T, B) {
    var r = s.radius * 2.5, segs = s.segs;
    for (var i = 0; i < segs.length; i++) {
      var p = segs[i];
      if (p.x > L - r && p.x < R + r && p.y > T - r && p.y < B + r) return true;
    }
    return false;
  }

  function rankOf(s) { return s.isMe ? 4e6 : s.isPlayer ? 3e6 : s.isBoss ? 2e6 : s.isKing ? 1e6 : s.mass; }

  Renderer.prototype.draw = function (world, fx, t, ui) {
    var ctx = this.ctx, cam = this.cam, sc = cam.scale, dpr = this.dpr, w = this.w, h = this.h, R = CFG.ARENA_R;
    var i, s, e;
    var sx = 0, sy = 0;
    if (cam.shake > 0.1) { sx = (Math.random() * 2 - 1) * cam.shake; sy = (Math.random() * 2 - 1) * cam.shake; }

    // outside of the arena
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0826';
    ctx.fillRect(0, 0, this.cv.width, this.cv.height);

    // world space
    ctx.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * (w / 2 - cam.x * sc + sx), dpr * (h / 2 - cam.y * sc + sy));
    var hw = w / sc / 2, hh = h / sc / 2;
    var L = cam.x - hw - 40, Rt = cam.x + hw + 40, T = cam.y - hh - 40, B = cam.y + hh + 40;

    // floor
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0, '#382c92'); g.addColorStop(1, '#241a68');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 8;
    for (i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(0, 0, R * i / 4, 0, TAU); ctx.stroke(); }

    // polka dots + little twinkles so you can tell you are moving
    var gs = 110, x0 = Math.floor(L / gs) * gs, y0 = Math.floor(T / gs) * gs, gx, gy, row;
    ctx.fillStyle = 'rgba(255,255,255,0.09)'; ctx.beginPath();
    var stars = [];
    for (gy = y0; gy < B; gy += gs) {
      row = Math.round(gy / gs) & 1;
      for (gx = x0; gx < Rt; gx += gs) {
        var ox = gx + (row ? gs / 2 : 0);
        if (ox * ox + gy * gy > (R - 50) * (R - 50)) continue;
        var hsh = Math.abs(Math.imul(Math.round(ox / gs * 2), 73856093) ^ Math.imul(Math.round(gy / gs), 19349663)) % 9;
        if (hsh === 0) stars.push(ox, gy); else { ctx.moveTo(ox + 3, gy); ctx.arc(ox, gy, 3, 0, TAU); }
      }
    }
    ctx.fill();
    ctx.fillStyle = 'rgba(255,225,255,0.2)';
    for (i = 0; i < stars.length; i += 2) art.star4(ctx, stars[i], stars[i + 1], 8 + Math.sin(t * 2 + stars[i]) * 2);

    // glowing border
    ctx.strokeStyle = 'rgba(255,90,170,0.10)'; ctx.lineWidth = 120; ctx.beginPath(); ctx.arc(0, 0, R + 60, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,90,170,0.30)'; ctx.lineWidth = 44; ctx.beginPath(); ctx.arc(0, 0, R + 12, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#ff7ac6'; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();

    // eggs
    var eggs = world.eggs;
    for (i = 0; i < eggs.length; i++) {
      e = eggs[i];
      if (e.x < L || e.x > Rt || e.y < T || e.y > B) continue;
      art.drawEgg(ctx, e, t);
    }

    // mystery boxes
    var boxes = world.boxes || [];
    for (i = 0; i < boxes.length; i++) {
      var bx = boxes[i];
      if (bx.x < L - 40 || bx.x > Rt + 40 || bx.y < T - 40 || bx.y > B + 40) continue;
      art.drawBox(ctx, bx, t, bx.life - (world.time - bx.born));
    }

    // which snake is mine? (it gets a white ring), and is the Boss scared of me?
    var me = world.player;
    for (i = 0; i < world.snakes.length; i++) {
      s = world.snakes[i];
      s.isMe = world.localId != null && s.owner === world.localId;
      if (s.isBoss) s.scared = !!(me && me.alive && me.mass >= s.mass);
    }

    // snakes (small first, so big ones and you are on top)
    var list = world.snakes.slice().sort(function (a, b) { return rankOf(a) - rankOf(b); });
    var shown = [];
    for (i = 0; i < list.length; i++) {
      s = list[i];
      if (!s.segs.length || !inView(s, L, Rt, T, B)) continue;
      shown.push(s);
      if (s.eaten) ctx.globalAlpha = 0.72;
      art.drawBody(ctx, s, t);
      if (!(s.eaten && s.eaten.fromHead)) art.drawHead(ctx, s, t);
      ctx.globalAlpha = 1;
      art.drawAura(ctx, s, t);
      if (s.shield > 0 && s.isPlayer) art.drawShield(ctx, s, t);
    }

    if (fx) fx.draw(ctx, sc);

    // ---- screen space ----
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    for (i = 0; i < shown.length; i++) {
      s = shown[i];
      if (!s.segs.length || (s.eaten && s.eaten.fromHead)) continue;
      var p = this.toScreen(s.segs[0].x, s.segs[0].y);
      var lift = (s.radius * 1.25 + (s.isKing ? s.radius * 1.05 + 6 : 0)) * sc + 8;
      var label = s.isBoss ? 'BOSS Lv ' + s.bossLevel + ' · ' + s.name : s.name;
      if (s.fx) for (var q = 0; q < CFG.BOX_EFFECTS.length; q++) if (s.fx[CFG.BOX_EFFECTS[q].id] > 0) label += ' ' + CFG.BOX_EFFECTS[q].icon;
      var friend = s.isPlayer && !s.isMe;
      ctx.font = '800 ' + (s.isBoss ? 15 : s.isMe ? 14 : friend ? 14 : 12) + 'px ' + FONT;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,10,60,0.9)';
      ctx.strokeText(label, p.x, p.y - lift);
      ctx.fillStyle = s.isBoss ? '#ff9aa8' : s.isMe ? '#ffffff' : friend ? '#7fe8ff' : s.isKing ? '#ffe066' : 'rgba(255,255,255,0.85)';
      ctx.fillText(label, p.x, p.y - lift);
    }

    if (ui && ui.arrows) {
      var P = world.player;
      if (world.king && world.king !== P && world.king.alive && P && P.alive) this.edgeArrow(ctx, world.king, 'king', t, false);
      if (world.boss && world.boss.alive && !world.boss.eaten) this.edgeArrow(ctx, world.boss, 'boss', t, !!(P && P.alive && P.mass >= world.boss.mass));
    }

    if (ui && ui.joy) { // the touch joystick
      var j = ui.joy, dx = j.x - j.ox, dy = j.y - j.oy, d = Math.sqrt(dx * dx + dy * dy) || 1, m = Math.min(d, 50);
      ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(j.ox, j.oy, 54, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.arc(j.ox + dx / d * m, j.oy + dy / d * m, 24, 0, TAU); ctx.fill();
    }
  };

  // little badge at the edge of the screen pointing to something off-screen
  Renderer.prototype.edgeArrow = function (ctx, target, kind, t, good) {
    var w = this.w, h = this.h, mx = 34, top = 96, bottom = 70;
    var p = this.toScreen(target.x, target.y);
    if (p.x > mx && p.x < w - mx && p.y > top && p.y < h - bottom) return;
    var cx = (mx + w - mx) / 2, cy = (top + h - bottom) / 2, hx = (w - 2 * mx) / 2, hy = (h - top - bottom) / 2;
    var dx = p.x - cx, dy = p.y - cy, a = Math.atan2(dy, dx);
    var k = Math.min(hx / Math.max(1e-6, Math.abs(dx)), hy / Math.max(1e-6, Math.abs(dy)));
    var ax = cx + dx * k, ay = cy + dy * k;
    var col = kind === 'king' ? '#ffd23f' : good ? '#5cff9d' : '#ff5470';
    var pulse = 1 + Math.sin(t * 6) * 0.06;
    ctx.save(); ctx.translate(ax, ay); ctx.scale(pulse, pulse);
    ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 30, Math.sin(a) * 30);
    ctx.lineTo(Math.cos(a + 2.4) * 22, Math.sin(a + 2.4) * 22);
    ctx.lineTo(Math.cos(a - 2.4) * 22, Math.sin(a - 2.4) * 22);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(25,12,70,0.85)'; ctx.strokeStyle = col; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 19, 0, TAU); ctx.fill(); ctx.stroke();
    if (kind === 'king') art.drawCrown(ctx, 0, 8, 24, t);
    else this.bossIcon(ctx, 0, 0, 14, col);
    ctx.restore();
  };

  Renderer.prototype.bossIcon = function (ctx, x, y, r, col) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y + 1, r * 0.72, 0, TAU); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - r * 0.7, y - r * 0.2); ctx.lineTo(x - r * 0.95, y - r * 0.95); ctx.lineTo(x - r * 0.15, y - r * 0.6);
    ctx.moveTo(x + r * 0.7, y - r * 0.2); ctx.lineTo(x + r * 0.95, y - r * 0.95); ctx.lineTo(x + r * 0.15, y - r * 0.6);
    ctx.fill();
    ctx.fillStyle = '#1a1035';
    ctx.beginPath(); ctx.arc(x - r * 0.28, y, r * 0.14, 0, TAU); ctx.arc(x + r * 0.28, y, r * 0.14, 0, TAU); ctx.fill();
  };

  Renderer.prototype.drawMinimap = function (world, t) {
    var c = this.mctx, S = this.mini.width, R = CFG.ARENA_R, k = (S / 2 - 5) / R, C = S / 2, i, s, P = world.player;
    c.clearRect(0, 0, S, S);
    c.fillStyle = 'rgba(25,12,70,0.6)'; c.beginPath(); c.arc(C, C, S / 2 - 2, 0, TAU); c.fill();
    c.strokeStyle = '#ff7ac6'; c.lineWidth = 2; c.stroke();

    c.fillStyle = '#ffd23f';
    var golds = world.goldList;
    if (golds) for (i = 0; i < golds.length; i++) { c.beginPath(); c.arc(C + golds[i][0] * k, C + golds[i][1] * k, 2, 0, TAU); c.fill(); }
    else for (i = 0; i < world.eggs.length; i++) {
      var e = world.eggs[i];
      if (e.golden) { c.beginPath(); c.arc(C + e.x * k, C + e.y * k, 2, 0, TAU); c.fill(); }
    }
    // mystery boxes: little purple squares
    c.fillStyle = '#c77dff';
    var boxes = world.boxes || [];
    for (i = 0; i < boxes.length; i++) c.fillRect(C + boxes[i].x * k - 2.5, C + boxes[i].y * k - 2.5, 5, 5);

    var kingId = world.king ? world.king.id : -1, myId = P ? P.id : -2;
    if (world.mapDots) {            // online: the server tells us where everyone is
      for (i = 0; i < world.mapDots.length; i++) {
        var d = world.mapDots[i];     // [x, y, 0 = computer snake / 1 = friend, id]
        if (d[3] === kingId || d[3] === myId) continue;
        c.fillStyle = d[2] ? '#7fe8ff' : '#9a8fd8';
        c.beginPath(); c.arc(C + d[0] * k, C + d[1] * k, d[2] ? 3 : 2, 0, TAU); c.fill();
      }
    } else {
      for (i = 0; i < world.snakes.length; i++) {
        s = world.snakes[i];
        if (!s.alive || s.isKing || s.isBoss || s === P) continue;
        c.fillStyle = s.isPlayer ? '#7fe8ff' : SC.skins.baseColor(s.skin);
        c.beginPath(); c.arc(C + s.x * k, C + s.y * k, s.isPlayer ? 3 : 2, 0, TAU); c.fill();
      }
    }
    var K = world.king;
    if (K && K !== P && K.alive) {
      c.fillStyle = '#ffd23f'; c.strokeStyle = '#b8860b'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(C + K.x * k, C + K.y * k, 4.5, 0, TAU); c.fill(); c.stroke();
    }
    var b = world.boss;
    if (b && b.alive) {
      var ok = P && P.alive && P.mass >= b.mass;
      c.fillStyle = ok ? '#5cff9d' : '#ff3355';
      c.beginPath(); c.arc(C + b.x * k, C + b.y * k, 5.5 + Math.sin(t * 6) * 1.2, 0, TAU); c.fill();
    }
    if (P && P.alive) {
      var px = C + P.x * k, py = C + P.y * k;
      c.fillStyle = '#fff'; c.strokeStyle = '#3aa8ff'; c.lineWidth = 2;
      c.beginPath(); c.arc(px, py, 4, 0, TAU); c.fill(); c.stroke();
      c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath();
      c.moveTo(px, py); c.lineTo(px + Math.cos(P.angle) * 9, py + Math.sin(P.angle) * 9); c.stroke();
    }
  };

  // ---- a little animated snake for menus and the share card ----
  function previewSnake(skin, legged, r, n, t, cx, cy, flip) {
    var segs = [], sp = r * 0.62, i;
    for (i = 0; i < n; i++) {
      var f = i / n;
      segs.push({ x: cx + (n / 2 - i) * sp * (flip ? -1 : 1), y: cy + Math.sin(i * 0.55 - t * 3) * r * 1.0 * (0.35 + f) });
    }
    var a = Math.atan2(segs[0].y - segs[1].y, segs[0].x - segs[1].x);
    return {
      segs: segs, radius: r, skin: skin, legged: legged, dist: t * 140, angle: a, id: 7, isPlayer: false, isKing: false,
      isBoss: false, scared: false, eaten: null, dangerous: false, fx: {}, hasLegs: function () { return legged; }
    };
  }

  SC.drawPreview = function (canvas, skin, legged, t, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (opts.clear !== false) ctx.clearRect(0, 0, w, h);
    var r = opts.r || h * 0.17, n = opts.n || 14;
    var s = previewSnake(skin, legged, r, n, t, w / 2, h / 2, false);
    art.drawBody(ctx, s, t);
    art.drawHead(ctx, s, t, { noRing: true });
  };

  SC.Renderer = Renderer;
})(typeof window !== 'undefined' ? window : globalThis);
