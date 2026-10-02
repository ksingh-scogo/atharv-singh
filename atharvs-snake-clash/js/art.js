/* Drawing helpers: snake bodies (with optional crawling legs), heads, eggs, crown, shield bubble. */
(function (root) {
  'use strict';
  var SC = root.SC = root.SC || {};
  var TAU = Math.PI * 2;

  function taper(i, n) { var f = i / Math.max(1, n - 1); return 1 - 0.38 * f * f; }

  function star4(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill();
  }

  // ---- crown ----
  function drawCrown(ctx, x, y, w, t) {
    var h = w * 0.72;
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#b8860b';
    ctx.lineWidth = Math.max(1, w * 0.07); ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.lineTo(x - w / 2, y - h * 0.6); ctx.lineTo(x - w * 0.25, y - h * 0.25);
    ctx.lineTo(x, y - h); ctx.lineTo(x + w * 0.25, y - h * 0.25);
    ctx.lineTo(x + w / 2, y - h * 0.6); ctx.lineTo(x + w / 2, y);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff4d6d';
    ctx.beginPath(); ctx.arc(x, y - h * 0.3, w * 0.09, 0, TAU); ctx.fill();
    ctx.fillStyle = '#4dd0ff';
    ctx.beginPath(); ctx.arc(x - w * 0.3, y - h * 0.18, w * 0.06, 0, TAU); ctx.arc(x + w * 0.3, y - h * 0.18, w * 0.06, 0, TAU); ctx.fill();
  }

  // ---- legs (only for "legged" snakes): they really swing as the snake crawls ----
  function drawLegs(ctx, s) {
    var segs = s.segs, n = segs.length, r = s.radius, phase = s.dist * 0.055;
    var len = r * (s.isBoss ? 2.3 : 1.95), pts = [], i, side;
    for (i = 2; i < n - 1; i += 3) {
      var a = segs[i - 1], b = segs[i + 1], sg = segs[i];
      var dx = a.x - b.x, dy = a.y - b.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      dx /= d; dy /= d;
      var nx = -dy, ny = dx, k = taper(i, n);
      for (side = -1; side <= 1; side += 2) {
        var sw = Math.sin(phase + i * 1.1 + (side > 0 ? 0 : Math.PI));   // the two sides swing in turn
        var reach = len * k * (0.95 + 0.12 * sw);
        pts.push(sg.x, sg.y, sg.x + nx * side * reach + dx * sw * len * 0.5, sg.y + ny * side * reach + dy * sw * len * 0.5);
      }
    }
    ctx.lineCap = 'round';
    // dark outline first, then the lighter leg on top
    for (var pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? s.skin.leg : s.skin.dark;
      ctx.lineWidth = Math.max(2, r * (pass ? 0.3 : 0.46));
      ctx.beginPath();
      for (i = 0; i < pts.length; i += 4) { ctx.moveTo(pts[i], pts[i + 1]); ctx.lineTo(pts[i + 2], pts[i + 3]); }
      ctx.stroke();
      ctx.fillStyle = pass ? s.skin.leg : s.skin.dark; ctx.beginPath();
      var fr = r * (pass ? 0.27 : 0.38);
      for (i = 0; i < pts.length; i += 4) { ctx.moveTo(pts[i + 2] + fr, pts[i + 3]); ctx.arc(pts[i + 2], pts[i + 3], fr, 0, TAU); }
      ctx.fill();
    }
  }

  // ---- body ----
  function drawBody(ctx, s, t) {
    var segs = s.segs, n = segs.length, r = s.radius, skin = s.skin, i, sg, rr;
    if (n < 1) return;
    var step = n > 64 ? 2 : 1;
    var shineBox = !!(s.fx && s.fx.shine > 0);     // a Super Shine box makes any snake sparkle
    var fancy = skin.tier === 'fancy', shiny = skin.tier === 'shiny' || shineBox;

    // soft glow for shiny / fancy / boss skins
    if (skin.tier !== 'common' || shineBox) {
      ctx.globalAlpha = (s.isBoss ? 0.26 : shineBox ? 0.3 : 0.17) + 0.05 * Math.sin(t * 4 + s.id);
      ctx.strokeStyle = shineBox && skin.tier === 'common' ? '#ffe9a0' : skin.glow; ctx.lineWidth = r * 3.1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(segs[0].x, segs[0].y);
      for (i = step; i < n; i += step) ctx.lineTo(segs[i].x, segs[i].y);
      ctx.stroke(); ctx.globalAlpha = 1;
    }

    // danger ring: this snake can hurt the player
    if (s.dangerous) {
      ctx.globalAlpha = 0.28 + 0.18 * Math.sin(t * 8);
      ctx.strokeStyle = '#ff2d55'; ctx.lineWidth = r * 3.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(segs[0].x, segs[0].y);
      for (i = step; i < n; i += step) ctx.lineTo(segs[i].x, segs[i].y);
      ctx.stroke(); ctx.globalAlpha = 1;
    }

    if (s.hasLegs ? s.hasLegs() : s.legged) drawLegs(ctx, s);

    // boss spikes along the back
    if (s.isBoss) {
      ctx.fillStyle = skin.dark; ctx.beginPath();
      for (i = 3; i < n - 1; i += 3) {
        sg = segs[i]; var pv = segs[i - 1], nx2 = segs[i + 1];
        var bx = pv.x - nx2.x, by = pv.y - nx2.y, bl = Math.sqrt(bx * bx + by * by) || 1;
        bx /= bl; by /= bl;
        var sr = r * taper(i, n), px = -by, py = bx;
        for (var sd = -1; sd <= 1; sd += 2) {
          ctx.moveTo(sg.x + px * sd * sr * 0.8 - bx * sr * 0.4, sg.y + py * sd * sr * 0.8 - by * sr * 0.4);
          ctx.lineTo(sg.x + px * sd * sr * 1.45, sg.y + py * sd * sr * 1.45);
          ctx.lineTo(sg.x + px * sd * sr * 0.8 + bx * sr * 0.4, sg.y + py * sd * sr * 0.8 + by * sr * 0.4);
        }
      }
      ctx.fill();
    }

    // outline (one batched path)
    ctx.fillStyle = skin.dark; ctx.beginPath();
    for (i = n - 1; i >= 0; i -= step) {
      sg = segs[i]; rr = r * taper(i, n) + r * 0.11 + 1;
      ctx.moveTo(sg.x + rr, sg.y); ctx.arc(sg.x, sg.y, rr, 0, TAU);
    }
    ctx.fill();

    // body color
    if (skin.pat === 'solid' || skin.pat === 'spots') {
      ctx.fillStyle = skin.c[0]; ctx.beginPath();
      for (i = n - 1; i >= 0; i -= step) {
        sg = segs[i]; rr = r * taper(i, n);
        ctx.moveTo(sg.x + rr, sg.y); ctx.arc(sg.x, sg.y, rr, 0, TAU);
      }
      ctx.fill();
    } else {
      for (i = n - 1; i >= 0; i -= step) {
        sg = segs[i]; rr = r * taper(i, n);
        ctx.fillStyle = SC.skins.colorAt(skin, i, n, t);
        ctx.beginPath(); ctx.arc(sg.x, sg.y, rr, 0, TAU); ctx.fill();
      }
    }

    // pattern extras
    if (skin.pat === 'spots') {
      ctx.fillStyle = skin.c[1]; ctx.beginPath();
      for (i = n - 2; i >= 1; i -= 3) { sg = segs[i]; rr = r * taper(i, n) * 0.42; ctx.moveTo(sg.x + rr, sg.y); ctx.arc(sg.x, sg.y, rr, 0, TAU); }
      ctx.fill();
    }
    if (skin.pat === 'galaxy') {
      ctx.fillStyle = '#fff';
      for (i = 1; i < n; i += 2) {
        sg = segs[i]; rr = r * taper(i, n);
        ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * 3 + i * 1.7));
        ctx.beginPath(); ctx.arc(sg.x + Math.cos(i * 2.4) * rr * 0.5, sg.y + Math.sin(i * 2.4) * rr * 0.5, r * 0.11, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // glossy highlight along the top-left edge
    ctx.fillStyle = shiny || fancy ? 'rgba(255,255,255,0.34)' : 'rgba(255,255,255,0.2)'; ctx.beginPath();
    for (i = n - 1; i >= 0; i -= step) {
      sg = segs[i]; rr = r * taper(i, n) * 0.38;
      ctx.moveTo(sg.x - r * 0.28 + rr, sg.y - r * 0.3); ctx.arc(sg.x - r * 0.28, sg.y - r * 0.3, rr, 0, TAU);
    }
    ctx.fill();

    // twinkling sparkles for shiny and fancy snakes
    if (shiny || fancy) {
      ctx.fillStyle = '#fff';
      var cnt = fancy || shineBox ? 4 : 3;
      for (var j = 0; j < cnt; j++) {
        var idx = Math.floor((j * 13 + Math.floor(t * 2.2 + j * 3) * 7 + s.id) % n);
        var ph = (t * 2.2 + j * 3) % 1, size = r * 0.65 * Math.sin(ph * Math.PI);
        if (size > 0.5) star4(ctx, segs[idx].x + r * 0.15, segs[idx].y - r * 0.2, size);
      }
    }
  }

  // ---- head: eyes look where the snake is heading ----
  function drawHead(ctx, s, t, opts) {
    var r = s.radius, x = s.segs[0].x, y = s.segs[0].y, a = s.angle, skin = s.skin;
    var hr = r * 1.1, ex = Math.cos(a), ey = Math.sin(a), nx = -ey, ny = ex, side;

    // tongue
    if (!s.eaten && Math.sin(t * 6 + s.id) > 0.55) {
      ctx.strokeStyle = '#ff3b6b'; ctx.lineWidth = Math.max(1.5, r * 0.14); ctx.lineCap = 'round';
      var tx = x + ex * hr * 1.75, ty = y + ey * hr * 1.75;
      ctx.beginPath(); ctx.moveTo(x + ex * hr * 0.9, y + ey * hr * 0.9); ctx.lineTo(tx, ty);
      ctx.moveTo(tx, ty); ctx.lineTo(tx + ex * r * 0.3 + nx * r * 0.25, ty + ey * r * 0.3 + ny * r * 0.25);
      ctx.moveTo(tx, ty); ctx.lineTo(tx + ex * r * 0.3 - nx * r * 0.25, ty + ey * r * 0.3 - ny * r * 0.25);
      ctx.stroke();
    }

    // boss horns
    if (s.isBoss) {
      ctx.fillStyle = '#fff3d0'; ctx.strokeStyle = skin.dark; ctx.lineWidth = Math.max(1.5, r * 0.08);
      for (side = -1; side <= 1; side += 2) {
        var bx = x - ex * hr * 0.2 + nx * side * hr * 0.6, by = y - ey * hr * 0.2 + ny * side * hr * 0.6;
        ctx.beginPath();
        ctx.moveTo(bx + nx * side * hr * 0.25, by + ny * side * hr * 0.25);
        ctx.lineTo(bx + nx * side * hr * 0.75 + ex * hr * 0.45, by + ny * side * hr * 0.75 + ey * hr * 0.45);
        ctx.lineTo(bx - nx * side * hr * 0.25, by - ny * side * hr * 0.25);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }

    ctx.fillStyle = skin.dark; ctx.beginPath(); ctx.arc(x, y, hr + r * 0.1, 0, TAU); ctx.fill();
    ctx.fillStyle = SC.skins.colorAt(skin, 0, 10, t); ctx.beginPath(); ctx.arc(x, y, hr, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.35, hr * 0.4, 0, TAU); ctx.fill();

    // eyes
    var scared = s.scared, eyeR = r * (scared ? 0.5 : 0.42);
    for (side = -1; side <= 1; side += 2) {
      var px = x + ex * r * 0.45 + nx * side * r * 0.52, py = y + ey * r * 0.45 + ny * side * r * 0.52;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, eyeR, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a1035'; ctx.beginPath();
      ctx.arc(px + ex * eyeR * 0.35, py + ey * eyeR * 0.35, eyeR * (scared ? 0.32 : 0.55), 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath();
      ctx.arc(px + ex * eyeR * 0.35 - eyeR * 0.15, py + ey * eyeR * 0.35 - eyeR * 0.2, eyeR * 0.14, 0, TAU); ctx.fill();
      if (s.isBoss && !scared) { // angry eyebrows
        ctx.strokeStyle = skin.dark; ctx.lineWidth = Math.max(2, r * 0.14); ctx.lineCap = 'round';
        ctx.beginPath();
        // brow slopes down toward the middle of the face
        ctx.moveTo(px + nx * side * eyeR * 1.1 + ex * eyeR * 0.9, py + ny * side * eyeR * 1.1 + ey * eyeR * 0.9);
        ctx.lineTo(px - nx * side * eyeR * 0.7 + ex * eyeR * 0.15, py - ny * side * eyeR * 0.7 + ey * eyeR * 0.15);
        ctx.stroke();
      }
    }
    if (scared) { // sweat drop
      ctx.fillStyle = '#7fe1ff'; ctx.beginPath();
      var sx = x - ex * r * 0.2 + nx * r * 1.3, sy = y - ey * r * 0.2 + ny * r * 1.3 + Math.sin(t * 6) * r * 0.1;
      ctx.moveTo(sx, sy - r * 0.35); ctx.quadraticCurveTo(sx + r * 0.3, sy + r * 0.05, sx, sy + r * 0.25);
      ctx.quadraticCurveTo(sx - r * 0.3, sy + r * 0.05, sx, sy - r * 0.35); ctx.fill();
    }

    if (s.isMe && !(opts && opts.noRing)) { // a white ring so you can always find yourself
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(2, r * 0.12);
      ctx.setLineDash([r * 0.5, r * 0.4]);
      ctx.beginPath(); ctx.arc(x, y, hr + r * 0.42, t * 1.5, t * 1.5 + TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (s.isKing) drawCrown(ctx, x, y - hr - r * 0.12 + Math.sin(t * 4 + s.id) * r * 0.05, Math.max(r * 1.25, 20), t);
  }

  function drawShield(ctx, s, t) {
    var x = s.segs[0].x, y = s.segs[0].y, r = s.radius * 2.2;
    var blink = s.shield < 1.2 ? (Math.sin(t * 22) > 0 ? 1 : 0.35) : 1;
    ctx.globalAlpha = 0.22 * blink; ctx.fillStyle = '#7fe8ff';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.85 * blink; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(2, s.radius * 0.1);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ---- eggs ----
  function drawEgg(ctx, e, t) {
    var bob = Math.sin(t * 3 + e.ph) * 1.6, r = e.r, x = e.x, y = e.y + bob;
    if (e.golden) {
      ctx.globalAlpha = 0.22 + 0.14 * Math.sin(t * 5 + e.ph);
      ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = e.golden ? '#ffc400' : SC.EGG_COLORS[e.c];
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.82, r, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.3, r * 0.24, 0, TAU); ctx.fill();
    ctx.fillStyle = e.golden ? 'rgba(180,100,0,0.35)' : 'rgba(0,0,0,0.14)';
    ctx.beginPath(); ctx.arc(x + r * 0.22, y + r * 0.28, r * 0.2, 0, TAU); ctx.arc(x - r * 0.3, y + r * 0.4, r * 0.13, 0, TAU); ctx.fill();
    if (e.golden) {
      ctx.fillStyle = '#fff';
      star4(ctx, x + r * 1.0, y - r * 1.0, r * 0.6 * (0.6 + 0.4 * Math.sin(t * 6 + e.ph)));
    }
  }


  // ---- mystery box: a purple gift box with a question mark ----
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  // ttl = seconds left before it vanishes (it blinks in the last few seconds)
  function drawBox(ctx, b, t, ttl) {
    var bob = Math.sin(t * 3 + b.ph) * 3, S = 30, x = b.x, y = b.y + bob;
    if (ttl < 6 && Math.sin(t * 14) > 0.2) ctx.globalAlpha = 0.35;
    // glow
    ctx.fillStyle = 'rgba(190,120,255,' + (0.22 + 0.12 * Math.sin(t * 4 + b.ph)) + ')';
    ctx.beginPath(); ctx.arc(x, y, S * 1.35, 0, TAU); ctx.fill();
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x, b.y + S * 0.62, S * 0.5, S * 0.14, 0, 0, TAU); ctx.fill();
    // box
    roundRect(ctx, x - S / 2, y - S / 2, S, S, 6);
    var g = ctx.createLinearGradient(x, y - S / 2, x, y + S / 2); g.addColorStop(0, '#b66bff'); g.addColorStop(1, '#6a2fd6');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#3a1590'; ctx.stroke();
    // ribbon
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(x - 3.5, y - S / 2, 7, S);
    ctx.fillRect(x - S / 2, y - 3.5, S, 7);
    // bow
    ctx.beginPath(); ctx.ellipse(x - 6, y - S / 2 - 3, 6, 4, -0.5, 0, TAU); ctx.ellipse(x + 6, y - S / 2 - 3, 6, 4, 0.5, 0, TAU); ctx.fill();
    // question mark
    ctx.font = '900 20px "Trebuchet MS", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = '#3a1590'; ctx.strokeText('?', x, y + 1);
    ctx.fillStyle = '#fff'; ctx.fillText('?', x, y + 1); ctx.textBaseline = 'alphabetic';
    // twinkle
    ctx.fillStyle = '#fff'; star4(ctx, x + S * 0.62, y - S * 0.6, 4 + 3 * Math.sin(t * 5 + b.ph));
    ctx.globalAlpha = 1;
  }

  // ---- little pictures around a snake while a box effect is on ----
  function drawAura(ctx, s, t) {
    var fx = s.fx;
    if (!fx || !s.segs.length) return;
    var r = s.radius, x = s.segs[0].x, y = s.segs[0].y, a = s.angle, ex = Math.cos(a), ey = Math.sin(a), nx = -ey, ny = ex, i;
    if (fx.speed > 0) {          // speed lines streaming out behind the head
      ctx.strokeStyle = '#9dff5c'; ctx.lineWidth = Math.max(2, r * 0.14); ctx.lineCap = 'round';
      ctx.globalAlpha = 0.55 + 0.3 * Math.sin(t * 20);
      ctx.beginPath();
      for (i = -1; i <= 1; i++) {
        var sx = x - ex * r * 1.6 + nx * r * 0.7 * i, sy = y - ey * r * 1.6 + ny * r * 0.7 * i, L = r * (1.5 + 0.5 * Math.sin(t * 17 + i));
        ctx.moveTo(sx, sy); ctx.lineTo(sx - ex * L, sy - ey * L);
      }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (fx.slow > 0) {           // a blue gloomy ring and drips
      ctx.strokeStyle = 'rgba(110,190,255,0.8)'; ctx.lineWidth = Math.max(2, r * 0.12); ctx.setLineDash([r * 0.3, r * 0.3]);
      ctx.beginPath(); ctx.arc(x, y, r * 1.5, -t, -t + TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(130,200,255,0.9)';
      for (i = 0; i < 3; i++) {
        var f = (t * 0.9 + i / 3) % 1;
        ctx.beginPath(); ctx.arc(x + (i - 1) * r * 0.9, y - r * 1.3 + f * r * 2.2, r * 0.16, 0, TAU); ctx.fill();
      }
    }
    if (fx.dizzy > 0) {          // stars spinning around the head
      ctx.fillStyle = '#ffe066';
      for (i = 0; i < 3; i++) {
        var ang = t * 5 + i * TAU / 3;
        star4(ctx, x + Math.cos(ang) * r * 1.6, y - r * 0.9 + Math.sin(ang) * r * 0.55, r * 0.34);
      }
    }
    if (fx.stun > 0) {           // a flash after a blast
      ctx.globalAlpha = Math.min(1, fx.stun) * 0.6; ctx.strokeStyle = '#ff7a3d'; ctx.lineWidth = Math.max(3, r * 0.3);
      ctx.beginPath(); ctx.arc(x, y, r * (2.4 - fx.stun), 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }

  SC.art = { drawBox: drawBox, drawAura: drawAura, roundRect: roundRect, drawBody: drawBody, drawHead: drawHead, drawShield: drawShield, drawEgg: drawEgg, drawCrown: drawCrown, star4: star4 };
})(typeof window !== 'undefined' ? window : globalThis);
