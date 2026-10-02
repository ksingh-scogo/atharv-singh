/* The player's copy of the shared arena when playing online.
   It looks the same to the drawing code as the real World does (snakes, eggs, boxes, King, Boss, leaderboard),
   but it is only filled in from what the game server sends, and it smooths movement between updates.
   No drawing and no DOM here, so it can be tested in Node. */
(function (root) {
  'use strict';
  var SC = root.SC = root.SC || {};
  var CFG = SC.CFG, U = SC.util, SK = SC.skins;
  var TAU = U.TAU;

  var FX_IDS = ['speed', 'shine', 'legs', 'slow', 'dizzy', 'stun'];
  var F_KING = 1, F_SHIELD = 2, F_EATEN = 4, F_FROMHEAD = 8, F_FX = 16;

  function unflat(flat) {
    var out = [];
    for (var i = 0; i + 1 < flat.length; i += 2) out.push({ x: flat[i], y: flat[i + 1] });
    return out;
  }

  function Mirror() { this.clear(); }

  Mirror.prototype.clear = function () {
    this.time = 0;
    this.snakes = [];
    this.byId = {};
    this.eggs = [];
    this.boxes = [];
    this.boxById = {};
    this.events = [];
    this.localId = this.localId || null;
    this.myName = this.myName || '';
    this.online = true;
    this.king = null;
    this.boss = null;
    this.bossLevel = 1;
    this.bossWarn = 0;
    this.mapDots = [];
    this.goldList = [];
    this.lbData = null;
    this.mine = null;
    this.matchData = null;
    this.deathData = null;
    this.state = 'playing';
    this.brave = false;
    this.count = 1;
    this.lastSnapAt = 0;
    this.snapCount = 0;
  };

  // What the drawing code and the HUD read, same names as on a real World
  Object.defineProperties(Mirror.prototype, {
    player: { get: function () { return this.mine && this.mine.alive ? this.mine : null; } },
    match: { get: function () { return this.matchData; } },
    deathInfo: { get: function () { return this.deathData; } },
    profile: { get: function () { return { difficulty: this.brave ? 'brave' : 'easy' }; } }
  });

  Mirror.prototype.playerCount = function () { return this.count; };
  Mirror.prototype.snakeById = function (id) { return this.byId[id] || null; };

  // ---------------------------------------------------------------- applying what the server says
  Mirror.prototype.makeSnake = function (n, rec) {
    var skin = n.b ? SK.bossSkin(n.b) : SK.byId(n.k);
    var s = new SC.Snake({
      id: n.i, name: n.n, skin: skin, legged: !!n.l, isPlayer: !!n.h, owner: n.o != null ? n.o : null,
      isBoss: !!n.b, bossLevel: n.b || 0, mass: rec[4] / 10, x: rec[1], y: rec[2], angle: rec[3] / 1000, speed: 0
    });
    s.segs = unflat(n.sg);
    if (!s.segs.length) s.segs = [{ x: rec[1], y: rec[2] }];
    s.radius = U.radiusFor(s.mass);
    s.tx = rec[1]; s.ty = rec[2]; s.ta = rec[3] / 1000; s.tm = s.mass;
    s.vx = 0; s.vy = 0; s.snapAt = this.time; s.px = rec[1]; s.py = rec[2];
    return s;
  };

  Mirror.prototype.apply = function (m) {
    var i, s, rec, n, k, now = this.time;
    this.snapCount++;
    this.state = m.st;
    var mm = m.you.m;
    this.matchData = {
      score: mm[0], stars: mm[1], revivesUsed: mm[2], multiplier: mm[3], bossesDefeated: mm[4], eggs: mm[5], snakes: mm[6],
      bestMass: mm[7], over: !!mm[8], won: !!mm[9], time: 0
    };

    var dyn = {};
    for (i = 0; i < m.sn.length; i++) dyn[m.sn[i][0]] = m.sn[i];

    // snakes that just came into view
    if (m.nw) for (i = 0; i < m.nw.length; i++) {
      n = m.nw[i];
      rec = dyn[n.i];
      if (!rec) continue;
      if (this.byId[n.i]) this.removeSnake(n.i);
      s = this.makeSnake(n, rec);
      this.byId[s.id] = s;
      this.snakes.push(s);
    }

    // where everybody is now
    for (i = 0; i < m.sn.length; i++) {
      rec = m.sn[i];
      s = this.byId[rec[0]];
      if (!s) continue;
      var dtS = now - s.snapAt;
      if (dtS > 0.02 && dtS < 1.2) {            // how fast it is going, from the last two updates
        s.vx += ((rec[1] - s.px) / dtS - s.vx) * 0.6;
        s.vy += ((rec[2] - s.py) / dtS - s.vy) * 0.6;
      }
      s.px = rec[1]; s.py = rec[2]; s.snapAt = now;
      s.tx = rec[1]; s.ty = rec[2]; s.ta = rec[3] / 1000; s.tm = rec[4] / 10;
      var f = rec[5];
      s.isKing = !!(f & F_KING);
      if (!(s.isMe)) s.shield = (f & F_SHIELD) ? 3 : 0;
      for (k = 0; k < FX_IDS.length; k++) {
        if (f & (F_FX << k)) { if (!(s.fx[FX_IDS[k]] > 0)) s.fx[FX_IDS[k]] = 1.5; } else s.fx[FX_IDS[k]] = 0;
      }
      if (f & F_EATEN) { s.eaten = s.eaten || { fromHead: false }; s.eaten.fromHead = !!(f & F_FROMHEAD); }
      else s.eaten = null;
    }
    // snakes being swallowed: the server sends their whole body each time
    if (m.ea) for (i = 0; i < m.ea.length; i++) {
      s = this.byId[m.ea[i][0]];
      if (s) { s.segs = unflat(m.ea[i].slice(1)); if (s.segs.length) { s.x = s.segs[0].x; s.y = s.segs[0].y; } }
    }
    if (m.gn) for (i = 0; i < m.gn.length; i++) this.removeSnake(m.gn[i]);

    // me
    var y = m.you;
    this.mine = y.id ? this.byId[y.id] || null : null;
    for (i = 0; i < this.snakes.length; i++) this.snakes[i].isMe = (this.snakes[i] === this.mine);
    if (this.mine) {
      this.mine.shield = y.sh / 10;
      for (k = 0; k < FX_IDS.length; k++) this.mine.fx[FX_IDS[k]] = y.fx[k] / 10;
    }

    // eggs (the server sends them every other time)
    if (m.eg) {
      var eggs = [];
      for (i = 0; i < m.eg.length; i++) {
        var g = m.eg[i];
        eggs.push({
          x: g[0], y: g[1], c: g[2], v: g[3], golden: !!g[4],
          r: g[4] ? 12 : U.clamp(5.5 + Math.sqrt(g[3]) * 2.6, 6.5, 22), ph: ((g[0] * 0.0137 + g[1] * 0.0071) % TAU + TAU) % TAU
        });
      }
      this.eggs = eggs;
    }

    // mystery boxes
    var boxes = [], byId = {};
    for (i = 0; i < m.bx.length; i++) {
      var b = m.bx[i], old = this.boxById[b[0]];
      var box = old || { id: b[0], ph: (b[0] * 1.7) % TAU };
      box.x = b[1]; box.y = b[2]; box.born = this.time; box.life = b[3] / 10;
      byId[box.id] = box; boxes.push(box);
    }
    this.boxes = boxes; this.boxById = byId;

    // King and Boss (even far away: they get an arrow at the edge of the screen)
    this.king = null; this.boss = null;
    if (m.kg) this.king = this.byId[m.kg[0]] || { id: m.kg[0], x: m.kg[1], y: m.kg[2], mass: m.kg[3] / 10, alive: true, eaten: null, radius: U.radiusFor(m.kg[3] / 10), isKing: true };
    if (m.bs) this.boss = this.byId[m.bs[0]] || { id: m.bs[0], x: m.bs[1], y: m.bs[2], mass: m.bs[3] / 10, alive: true, eaten: null, radius: U.radiusFor(m.bs[3] / 10), isBoss: true, bossLevel: m.bs[4] };
    this.bossLevel = m.bl;
    this.bossWarn = m.bw ? 1 : 0;

    if (m.lb) {
      this.lbData = m.lb;
      this.count = m.lb.pl;
      this.mapDots = m.mp || this.mapDots;
      this.goldList = m.gd || this.goldList;
    }

    if (m.ev) for (i = 0; i < m.ev.length; i++) this.pushEvent(m.ev[i]);
  };

  Mirror.prototype.pushEvent = function (e) {
    if (e.type === 'playerDied') {
      e.segs = unflat(e.sg || []);
      if (e.pid === this.localId) this.deathData = e;
    }
    this.events.push(e);
  };

  Mirror.prototype.removeSnake = function (id) {
    var s = this.byId[id];
    if (!s) return;
    delete this.byId[id];
    var i = this.snakes.indexOf(s);
    if (i >= 0) this.snakes.splice(i, 1);
    if (this.mine === s) this.mine = null;
  };

  // ---------------------------------------------------------------- every frame: smooth things out
  Mirror.prototype.update = function (dt) {
    this.time += dt;
    var i, k, s, P = this.mine && this.mine.alive ? this.mine : null;
    var kHead = 1 - Math.exp(-dt * 16);

    for (i = 0; i < this.snakes.length; i++) {
      s = this.snakes[i];
      for (k = 0; k < FX_IDS.length; k++) if (s.fx[FX_IDS[k]] > 0) s.fx[FX_IDS[k]] -= dt;

      if (s.eaten) {                       // frozen while it is being swallowed; the body comes from the server
        s.radius += (U.radiusFor(s.tm) - s.radius) * Math.min(1, dt * 4);
        continue;
      }
      s.mass = s.tm;

      // the head glides toward where it should be now (last known spot plus a little extrapolation)
      var age = Math.min(0.4, this.time - s.snapAt);
      var tx = s.tx + s.vx * age, ty = s.ty + s.vy * age;
      var ddx = tx - s.x, ddy = ty - s.y;
      if (ddx * ddx + ddy * ddy > 400 * 400) { s.x = tx; s.y = ty; }          // a jump (revive, new snake): just go there
      else { s.x += ddx * kHead; s.y += ddy * kHead; s.dist += Math.sqrt(ddx * ddx + ddy * ddy) * kHead; }
      s.angle += U.angDiff(s.ta, s.angle) * kHead;

      // the body follows the head like a rope, just as on the server
      s.radius += (U.radiusFor(s.mass) - s.radius) * Math.min(1, dt * 4);
      var segs = s.segs, want = U.segsFor(s.mass), n = segs.length;
      if (n < want) {
        var tail = segs[n - 1];
        segs.push({ x: tail.x, y: tail.y });
        if (n + 1 < want) segs.push({ x: tail.x, y: tail.y });
      } else if (n > want + 1 && n > 2) {
        segs.pop();
        if (n > want + 6) segs.pop();
      }
      var gap = s.radius * CFG.SPACING;
      segs[0].x = s.x; segs[0].y = s.y;
      for (var j = 1; j < segs.length; j++) {
        var a = segs[j - 1], b = segs[j];
        var dx = a.x - b.x, dy = a.y - b.y, dd = Math.sqrt(dx * dx + dy * dy);
        if (dd > gap) { var q = (dd - gap) / dd; b.x += dx * q; b.y += dy * q; }
      }
    }

    // eggs near my mouth drift toward it between server updates (the server does the real eating)
    if (P) {
      var mag = P.radius * 1.9 + 50; if (P.fx.shine > 0) mag *= CFG.FX_MAGNET_MUL;
      for (i = 0; i < this.eggs.length; i++) {
        var e = this.eggs[i], ex = P.x - e.x, ey = P.y - e.y, d2 = ex * ex + ey * ey;
        if (d2 < mag * mag && d2 > 1) {
          var d = Math.sqrt(d2), pull = ((1 - d / mag) * 420 + 70) * dt;
          e.x += ex / d * pull; e.y += ey / d * pull;
        }
      }
    }

    // flag what can hurt me (red glow)
    for (i = 0; i < this.snakes.length; i++) this.snakes[i].dangerous = SC.dangerFor(this.snakes[i], P, this.brave);
  };

  // ---------------------------------------------------------------- for the screen
  Mirror.prototype.leaderboard = function (pid, n) {
    var d = this.lbData, rows = [], me = this.mine;
    if (!d) return { rows: rows, rank: 0, total: 0, players: this.count };
    var myId = me ? me.id : -1, i;
    function row(a, rank) { return { id: a[0], name: a[1], mass: a[2], king: !!a[3], human: !!a[4], me: a[0] === myId, rank: rank }; }
    for (i = 0; i < d.r.length && i < n; i++) rows.push(row(d.r[i], i + 1));
    if (d.rk > n && d.me) rows.push(row(d.me, d.rk));
    return { rows: rows, rank: d.rk, total: d.tot, players: d.pl };
  };

  Mirror.prototype.nearestThreat = function () {
    var P = this.player, best = null, bd = Infinity;
    if (!P || P.shield > 0) return { snake: null, gap: Infinity };
    for (var i = 0; i < this.snakes.length; i++) {
      var o = this.snakes[i];
      if (!SC.dangerFor(o, P, this.brave)) continue;
      var gap = U.dist(o, P) - o.radius - P.radius;
      if (gap < bd) { bd = gap; best = o; }
    }
    return { snake: best, gap: bd };
  };

  SC.Mirror = Mirror;
})(typeof window !== 'undefined' ? window : globalThis);
