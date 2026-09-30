/* Particles: sparkles, confetti, rings, floating "+5" text, and the little bits that fly into a snake's mouth. */
(function (root) {
  'use strict';
  var SC = root.SC = root.SC || {};
  var U = SC.util, TAU = U.TAU;
  var MAX = 520;
  var CONFETTI = ['#ff5c8a', '#ffd93b', '#4cd964', '#3aa8ff', '#9b6bff', '#ff9f43', '#2ed8c3'];

  function FX() {
    this.list = [];
    this.calm = false; // "reduced motion": fewer particles
  }

  FX.prototype.add = function (p) {
    if (this.list.length >= MAX) this.list.shift();
    this.list.push(p);
  };

  FX.prototype.burst = function (x, y, color, n, speed, size) {
    if (this.calm) n = Math.ceil(n / 2);
    for (var i = 0; i < n; i++) {
      var a = U.rnd(0, TAU), v = U.rnd(0.3, 1) * speed;
      this.add({ k: 0, x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: U.rnd(0.35, 0.7), max: 0.7, size: size * U.rnd(0.6, 1.2), color: color });
    }
  };

  FX.prototype.confetti = function (x, y, n, spread) {
    if (this.calm) n = Math.ceil(n / 3);
    for (var i = 0; i < n; i++) {
      var a = U.rnd(0, TAU), v = U.rnd(0.2, 1) * spread;
      this.add({
        k: 1, x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - spread * 0.25, life: U.rnd(1.4, 2.8), max: 2.8,
        size: U.rnd(7, 14), color: U.pick(CONFETTI), rot: U.rnd(0, TAU), vr: U.rnd(-9, 9)
      });
    }
  };

  FX.prototype.text = function (x, y, str, color, px) {
    this.add({ k: 2, x: x, y: y, vx: 0, vy: -45, life: 1.1, max: 1.1, size: px || 18, color: color || '#fff', str: str });
  };

  FX.prototype.ring = function (x, y, color, radius) {
    this.add({ k: 3, x: x, y: y, vx: 0, vy: 0, life: 0.55, max: 0.55, size: radius, color: color });
  };

  // a bit of snake that flies into the eater's head
  FX.prototype.suck = function (x, y, target, color, size) {
    this.add({ k: 4, x: x, y: y, vx: 0, vy: 0, life: 0.5, max: 0.5, size: size, color: color, target: target });
  };

  FX.prototype.update = function (dt) {
    var L = this.list, i, p;
    for (i = L.length - 1; i >= 0; i--) {
      p = L[i];
      p.life -= dt;
      if (p.life <= 0) { L[i] = L[L.length - 1]; L.pop(); continue; }
      if (p.k === 4) {
        var t = p.target;
        p.x += (t.x - p.x) * Math.min(1, dt * 11); p.y += (t.y - p.y) * Math.min(1, dt * 11);
        continue;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.k === 1) { p.vy += 330 * dt; p.vx *= 0.985; p.rot += p.vr * dt; }
      else if (p.k === 0) { p.vx *= 0.94; p.vy *= 0.94; }
    }
  };

  // scale = screen pixels per world unit (so text stays the same size on screen)
  FX.prototype.draw = function (ctx, scale) {
    var L = this.list, i, p, f;
    for (i = 0; i < L.length; i++) {
      p = L[i];
      f = Math.max(0, Math.min(1, p.life / p.max));
      if (p.k === 0) {
        ctx.globalAlpha = f; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * f), 0, TAU); ctx.fill();
      } else if (p.k === 1) {
        ctx.globalAlpha = Math.min(1, f * 2); ctx.fillStyle = p.color;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore();
      } else if (p.k === 2) {
        ctx.globalAlpha = Math.min(1, f * 1.6);
        ctx.font = '800 ' + (p.size / scale) + 'px "Trebuchet MS", system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.lineWidth = 4 / scale; ctx.strokeStyle = 'rgba(20,10,60,0.85)';
        ctx.strokeText(p.str, p.x, p.y); ctx.fillStyle = p.color; ctx.fillText(p.str, p.x, p.y);
      } else if (p.k === 3) {
        ctx.globalAlpha = f * 0.9; ctx.strokeStyle = p.color; ctx.lineWidth = 5 / scale * 2 * f + 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - f) + 6, 0, TAU); ctx.stroke();
      } else {
        ctx.globalAlpha = 0.5 + 0.5 * f; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * f), 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  };

  SC.FX = FX;
})(typeof window !== 'undefined' ? window : globalThis);
