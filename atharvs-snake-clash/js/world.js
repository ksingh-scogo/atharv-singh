/* The game world: snakes, eggs, the King, the Boss, eating, dying, reviving.
   No drawing and no DOM in here, so it can also be tested headless in Node. */
(function (root) {
  'use strict';
  var SC = root.SC = root.SC || {};
  var CFG = SC.CFG, U = SC.util, SK = SC.skins;
  var TAU = U.TAU;
  var nextId = 1;

  var NAMES = ['Zippy', 'Bubbles', 'Sparky', 'Nacho', 'Mango', 'Pixel', 'Waffles', 'Noodle', 'Turbo', 'Jelly',
    'Coco', 'Ziggy', 'Pickle', 'Biscuit', 'Comet', 'Ginger', 'Lulu', 'Peanut', 'Ollie', 'Dash', 'Rocket',
    'Sunny', 'Tango', 'Fuzzy', 'Kiwi', 'Donut', 'Sprout', 'Muffin', 'Blaze', 'Gizmo', 'Twinkle', 'Bolt'];

  var EGG_COLORS = ['#ff8ab3', '#7fd6ff', '#ffe066', '#9ef29a', '#c7a6ff', '#ffb27a'];

  // ---------------------------------------------------------------- Snake
  function Snake(o) {
    this.id = nextId++;
    this.name = o.name || 'Snake';
    this.skin = o.skin;
    this.legged = !!o.legged;
    this.isPlayer = !!o.isPlayer;
    this.isBoss = !!o.isBoss;
    this.bossLevel = o.bossLevel || 0;
    this.isKing = false;
    this.scared = false;
    this.mass = o.mass;
    this.maxMass = o.maxMass || 0;
    this.radius = U.radiusFor(o.mass);
    this.x = o.x; this.y = o.y;
    this.angle = o.angle; this.want = o.angle;
    this.baseSpeed = o.speed;
    this.turnBase = o.turn || CFG.TURN_RATE;
    this.shield = 0;
    this.dist = 0;      // distance travelled (drives the leg animation)
    this.eaten = null;  // set while another snake is swallowing this one
    this.alive = true;
    this.ai = {
      t: U.rnd(0, 0.3), timid: U.rand() < 0.4,
      chase: 0, cool: U.rnd(0, 3), rest: 0
    };
    this.segs = [];
    var n = U.segsFor(this.mass), sp = this.radius * CFG.SPACING;
    for (var i = 0; i < n; i++) {
      this.segs.push({ x: this.x - Math.cos(this.angle) * sp * i, y: this.y - Math.sin(this.angle) * sp * i });
    }
  }
  Snake.prototype.turnRate = function () {
    return this.turnBase / (1 + this.radius / 140) * (this.legged && !this.isBoss ? CFG.LEG_TURN_BONUS : 1);
  };
  Snake.prototype.speedNow = function () {
    var s = this.baseSpeed;
    if (this.legged && !this.isBoss) s *= CFG.LEG_SPEED_BONUS;
    if (this.isKing && !this.isPlayer) s = Math.min(s, CFG.KING_SPEED);
    return s;
  };
  Snake.prototype.growMul = function () { return this.legged ? 1 : CFG.LEGLESS_GROWTH_BONUS; };

  // ---------------------------------------------------------------- World
  function World(opts) {
    this.difficulty = (opts && opts.difficulty) || 'easy';
    this.clear();
  }

  World.prototype.clear = function () {
    this.time = 0;
    this.snakes = [];
    this.eggs = [];
    this.events = [];
    this.player = null;
    this.boss = null;
    this.king = null;
    this.match = null;
    this.profile = null;
    this.deathInfo = null;
    this.bossWarn = 0;
    this.lastBossEnd = -99;
    this.spawnCool = 0;
    this.kingTimer = 0;
    this.goldTimer = 0;
  };

  World.prototype.emit = function (type, data) {
    data = data || {};
    data.type = type;
    this.events.push(data);
  };

  World.prototype.randomPoint = function (maxR) {
    var a = U.rnd(0, TAU), r = Math.sqrt(U.rand()) * maxR;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  };

  // ---- setup ----
  World.prototype.populate = function () {
    var i;
    for (i = 0; i < CFG.EGG_COUNT; i++) this.spawnRandomEgg();
    for (i = 0; i < CFG.GOLDEN_MAX; i++) this.spawnGoldenEgg();
    for (i = 0; i < CFG.AI_COUNT; i++) this.spawnAI();
    // make sure there is a proper big King right from the start
    var big = this.spawnAI({ mass: U.rnd(CFG.KING_SEED_MASS[0], CFG.KING_SEED_MASS[1]) });
    big.skin = SK.byId('ruby');
    this.updateCrown(true);
  };

  World.prototype.startAttract = function () {
    this.clear();
    this.populate();
  };

  World.prototype.startMatch = function (profile) {
    this.clear();
    this.profile = profile;
    this.difficulty = profile.difficulty || 'easy';
    this.match = {
      score: 0, stars: 0, revivesUsed: 0, multiplier: 1,
      bossLevel: 1, bossesDefeated: 0, eggs: 0, snakes: 0,
      bestMass: CFG.START_MASS, time: 0, over: false, won: false
    };
    this.populate();
    this.spawnPlayer(CFG.START_MASS);
    this.player.shield = CFG.REVIVE_SHIELD + 1;
    this.updateCrown(true);
  };

  World.prototype.spawnPlayer = function (mass) {
    var p = this.profile, pos, tries = 0, ok;
    do {
      pos = this.randomPoint(CFG.ARENA_R * 0.7);
      ok = true;
      for (var i = 0; i < this.snakes.length; i++) {
        var o = this.snakes[i];
        if (!o.alive || o.eaten) continue;
        var danger = o.isBoss || o.isKing || o.mass > mass * 1.5;
        if (danger && U.dist(o, pos) < 950) { ok = false; break; }
      }
    } while (!ok && ++tries < 40);
    var s = new Snake({
      name: p.name || 'Atharv', skin: SK.byId(p.skin), legged: !!p.legged, isPlayer: true,
      mass: mass, x: pos.x, y: pos.y, angle: U.rnd(-Math.PI, Math.PI), speed: CFG.PLAYER_SPEED
    });
    this.player = s;
    this.snakes.push(s);
    return s;
  };

  World.prototype.spawnAI = function (o) {
    o = o || {};
    var P = this.player && this.player.alive ? this.player : null;
    var p, tries = 0;
    do { p = this.randomPoint(CFG.ARENA_R * 0.88); } while (P && U.dist(p, P) < 850 && ++tries < 15);
    var pm = P ? P.mass : CFG.START_MASS;
    // mostly small snakes, sometimes a big one; bigger when you are bigger
    var mass = o.mass || Math.min(CFG.AI_MASS_CAP, 6 + U.rand() * U.rand() * 50 + Math.min(pm, 600) * CFG.PREY_SCALE * U.rand() * U.rand());
    var used = {};
    this.snakes.forEach(function (s) { used[s.name] = true; });
    var free = NAMES.filter(function (n) { return !used[n]; });
    var s = new Snake({
      name: U.pick(free.length ? free : NAMES), skin: SK.random(), legged: U.rand() < 0.45,
      mass: mass, x: p.x, y: p.y, angle: U.rnd(-Math.PI, Math.PI), speed: U.rnd(CFG.AI_SPEED_MIN, CFG.AI_SPEED_MAX)
    });
    this.snakes.push(s);
    return s;
  };

  World.prototype.spawnEgg = function (x, y, v, golden) {
    var e = {
      x: x, y: y, v: v, golden: !!golden, c: U.rint(0, EGG_COLORS.length - 1), ph: U.rnd(0, TAU),
      r: golden ? 12 : U.clamp(5.5 + Math.sqrt(v) * 2.6, 6.5, 22)
    };
    this.eggs.push(e);
    return e;
  };
  World.prototype.spawnRandomEgg = function () {
    var p = this.randomPoint(CFG.ARENA_R * 0.96);
    this.spawnEgg(p.x, p.y, U.rand() < 0.12 ? 3 : 1, false);
  };
  World.prototype.spawnGoldenEgg = function () {
    var p = this.randomPoint(CFG.ARENA_R * 0.85);
    this.spawnEgg(p.x, p.y, CFG.GOLD_MASS, true);
  };

  // ---- main update ----
  // steer: the angle the player wants to go (or null to keep going straight)
  World.prototype.update = function (dt, steer) {
    this.time += dt;
    var P = this.player, i, s;
    if (P && P.alive && steer != null) P.want = steer;

    for (i = 0; i < this.snakes.length; i++) {
      s = this.snakes[i];
      if (!s.alive) continue;
      if (s.eaten) { this.processEaten(s, dt); continue; }
      if (!s.isPlayer) this.think(s, dt);
      this.move(s, dt);
    }
    this.updateEggs(dt);
    this.collide();
    this.snakes = this.snakes.filter(function (x) { return x.alive; });

    this.kingTimer -= dt;
    if (this.kingTimer <= 0) { this.kingTimer = 0.2; this.updateCrown(false); }
    this.bossLogic(dt);
    this.maintain(dt);

    // flag the snakes that can hurt the player (drawn with a red warning glow)
    for (i = 0; i < this.snakes.length; i++) {
      s = this.snakes[i];
      s.dangerous = !!(P && P.alive && s !== P && !s.eaten &&
        (s.isKing || (s.isBoss && P.mass < s.mass) || this.isBigHunter(s)));
    }

    var m = this.match;
    if (m && P && P.alive) {
      m.time += dt;
      if (P.mass > m.bestMass) m.bestMass = P.mass;
    }
  };

  World.prototype.move = function (s, dt) {
    if (s.shield > 0) s.shield -= dt;

    // steer toward where we want to go, limited by the turn rate
    var diff = U.angDiff(s.want, s.angle), mt = s.turnRate() * dt;
    s.angle += diff < -mt ? -mt : diff > mt ? mt : diff;
    if (s.angle > Math.PI) s.angle -= TAU; else if (s.angle < -Math.PI) s.angle += TAU;

    var sp = s.speedNow() * dt;
    s.x += Math.cos(s.angle) * sp;
    s.y += Math.sin(s.angle) * sp;
    s.dist += sp;

    // the wall is soft: you slide along it, it never hurts
    var R = CFG.ARENA_R - s.radius * 0.5, d2 = s.x * s.x + s.y * s.y;
    if (d2 > R * R) {
      var d = Math.sqrt(d2), nx = s.x / d, ny = s.y / d;
      s.x = nx * R; s.y = ny * R;
      var hx = Math.cos(s.angle), hy = Math.sin(s.angle), dot = hx * nx + hy * ny;
      if (dot > 0) {
        hx -= dot * nx; hy -= dot * ny;
        hx += -ny * 0.15; hy += nx * 0.15;
        s.angle = Math.atan2(hy, hx);
      }
    }

    // smooth growth of girth and length
    s.radius += (U.radiusFor(s.mass) - s.radius) * Math.min(1, dt * 4);
    var segs = s.segs, want = U.segsFor(s.mass), n = segs.length;
    if (n < want) {
      var tail = segs[n - 1];
      segs.push({ x: tail.x, y: tail.y });
      if (n + 1 < want) segs.push({ x: tail.x, y: tail.y });
    } else if (n > want + 1 && n > 2) {
      segs.pop();
    }

    // the body follows the head like a rope
    var gap = s.radius * CFG.SPACING;
    segs[0].x = s.x; segs[0].y = s.y;
    for (var i = 1; i < segs.length; i++) {
      var a = segs[i - 1], b = segs[i];
      var dx = a.x - b.x, dy = a.y - b.y, dd = Math.sqrt(dx * dx + dy * dy);
      if (dd > gap) { var k = (dd - gap) / dd; b.x += dx * k; b.y += dy * k; }
    }
  };

  // ---- eggs ----
  World.prototype.updateEggs = function (dt) {
    var eggs = this.eggs, list = this.snakes, i, j, s, e;
    for (j = 0; j < list.length; j++) {
      s = list[j];
      if (!s.alive || s.eaten) continue;
      var mag = s.isPlayer ? s.radius * 1.9 + 50 : 0; // eggs drift toward the player's mouth
      for (i = eggs.length - 1; i >= 0; i--) {
        e = eggs[i];
        var dx = s.x - e.x, dy = s.y - e.y, d2 = dx * dx + dy * dy, reach = s.radius + e.r;
        if (d2 < reach * reach) {
          this.eatEgg(s, e);
          eggs[i] = eggs[eggs.length - 1];
          eggs.pop();
        } else if (mag && d2 < mag * mag) {
          var d = Math.sqrt(d2) || 1, pull = ((1 - d / mag) * 420 + 70) * dt;
          e.x += dx / d * pull; e.y += dy / d * pull;
        }
      }
    }
  };

  World.prototype.eatEgg = function (s, e) {
    this.grow(s, e.v * s.growMul());
    if (s.isPlayer) {
      this.addScore(e.v);
      if (this.match) this.match.eggs++;
      this.emit('egg', { x: e.x, y: e.y, v: e.v, golden: e.golden, c: e.c });
      if (e.golden) {   // golden eggs also give the player a short shield
        s.shield = Math.min(8, s.shield + CFG.GOLD_SHIELD);
        this.emit('shield', { snake: s });
      }
    }
  };

  World.prototype.grow = function (s, amount) {
    s.mass += amount;
    if (s.isBoss) { if (s.maxMass && s.mass > s.maxMass) s.mass = s.maxMass; }
    else if (!s.isPlayer) s.mass = Math.min(s.mass, s.isKing ? CFG.KING_MASS_CAP : CFG.AI_MASS_CAP);
  };

  World.prototype.addScore = function (base) {
    if (this.match) this.match.score += base * this.match.multiplier;
  };

  // ---- AI ----
  World.prototype.think = function (s, dt) {
    var a = s.ai;
    a.t -= dt; a.chase -= dt; a.cool -= dt; a.rest -= dt;
    if (a.t > 0) return;
    a.t = 0.16 + U.rand() * 0.14;
    var P = this.player && this.player.alive && !this.player.eaten ? this.player : null;
    var want = s.isBoss ? this.thinkBoss(s, P) : this.thinkSnake(s, P);

    // stay away from the wall
    var R = CFG.ARENA_R, dd = Math.sqrt(s.x * s.x + s.y * s.y), margin = 300 + s.radius * 2;
    if (dd > R - margin) {
      var f = U.clamp((dd - (R - margin)) / margin, 0, 1);
      want = U.blendAngle(want, Math.atan2(-s.y, -s.x), Math.min(1, f * 1.5));
    }
    s.want = want;
  };

  // aim at where the player is going to be
  World.prototype.leadAngle = function (s, P, lead) {
    var tx = P.x + Math.cos(P.angle) * P.speedNow() * lead;
    var ty = P.y + Math.sin(P.angle) * P.speedNow() * lead;
    return Math.atan2(ty - s.y, tx - s.x);
  };

  // Chase the player for a few seconds, then take a break (keeps things fair for a kid).
  World.prototype.huntPlayer = function (s, P, range) {
    var a = s.ai;
    if (!P || P.shield > 0) return null;
    var d = U.dist(s, P);
    if (a.chase > 0 && d < range * 1.6) return this.leadAngle(s, P, 0.25);
    if (a.cool <= 0 && d < range) {
      a.chase = U.rnd(4.5, 6.5);
      a.cool = a.chase + U.rnd(3.5, 5.5);
      return this.leadAngle(s, P, 0.25);
    }
    return null;
  };

  World.prototype.thinkSnake = function (s, P) {
    var a = s.ai, i, d, o;

    // 1. run from the King and the Boss
    if (!s.isKing) {
      var threat = null, td = 1e9;
      var k = this.king;
      if (k && k !== s && k.alive && !k.eaten) {
        d = U.dist(s, k);
        if (d < 330 + k.radius + s.radius) { threat = k; td = d; }
      }
      var b = this.boss;
      if (b && b.alive && !b.eaten) {
        d = U.dist(s, b);
        if (d < 420 + b.radius && d < td) threat = b;
      }
      if (threat) return Math.atan2(s.y - threat.y, s.x - threat.x) + U.rnd(-0.25, 0.25);
    }

    // 2. hunting
    var ang;
    if (s.isKing) {
      ang = this.huntPlayer(s, P, CFG.KING_CHASE_RANGE);
      if (ang !== null) return ang;
      var prey = null, pd = 500;
      for (i = 0; i < this.snakes.length; i++) {
        o = this.snakes[i];
        if (o === s || o.isPlayer || o.isBoss || !o.alive || o.eaten || o.mass > s.mass * 0.95) continue;
        d = U.dist(s, o);
        if (d < pd) { pd = d; prey = o; }
      }
      if (prey) return Math.atan2(prey.y - s.y, prey.x - s.x);
    } else if (this.isBigHunter(s)) {
      ang = this.huntPlayer(s, P, 420);
      if (ang !== null) return ang;
    }

    // 3. timid snakes run away from the player
    if (P && a.timid && !s.isKing) {
      d = U.dist(s, P);
      if (d < 230 + P.radius) return Math.atan2(s.y - P.y, s.x - P.x) + U.rnd(-0.3, 0.3);
    }

    // 4. go for the nearest (or shiniest) egg
    var best = null, bs = 1e18, r2 = 520 * 520, eggs = this.eggs;
    for (i = 0; i < eggs.length; i++) {
      var e = eggs[i], dx = e.x - s.x, dy = e.y - s.y, d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      var sc = d2 / (e.golden ? 3 : 1 + e.v * 0.4);
      if (sc < bs) { bs = sc; best = e; }
    }
    if (best) return Math.atan2(best.y - s.y, best.x - s.x);

    // 5. wander
    return s.angle + U.rnd(-0.7, 0.7);
  };

  World.prototype.thinkBoss = function (s, P) {
    var a = s.ai, i, o, d;
    s.scared = false;
    if (P) {
      d = U.dist(s, P);
      if (P.mass >= s.mass) {
        s.scared = true;                       // you are big enough: the Boss is afraid!
        if (d < 550) return Math.atan2(s.y - P.y, s.x - P.x) + U.rnd(-0.2, 0.2);
      } else if (P.shield <= 0 && a.rest <= 0 && d < 950) {
        return this.leadAngle(s, P, 0.3);
      }
    }
    var prey = null, pd = 450;
    for (i = 0; i < this.snakes.length; i++) {
      o = this.snakes[i];
      if (o === s || o.isPlayer || o.isBoss || !o.alive || o.eaten) continue;
      d = U.dist(s, o);
      if (d < pd) { pd = d; prey = o; }
    }
    if (prey) return Math.atan2(prey.y - s.y, prey.x - s.x);
    return s.angle + U.rnd(-0.5, 0.5);
  };

  // ---- collisions ----
  // Does a's head touch any part of b? Returns the segment index or -1.
  World.prototype.touch = function (a, b, eating) {
    var dx = a.x - b.x, dy = a.y - b.y;
    var len = b.segs.length * b.radius * CFG.SPACING + b.radius + a.radius;
    if (dx * dx + dy * dy > len * len) return -1;
    var rr = eating
      ? a.radius * CFG.EAT_REACH_HEAD + b.radius * CFG.EAT_REACH_BODY
      : a.radius * CFG.LETHAL_REACH_A + b.radius * CFG.LETHAL_REACH_B;
    rr *= rr;
    var segs = b.segs;
    for (var i = 0; i < segs.length; i++) {
      dx = a.x - segs[i].x; dy = a.y - segs[i].y;
      if (dx * dx + dy * dy < rr) return i;
    }
    return -1;
  };

  World.prototype.collide = function () {
    var P = this.player, list = this.snakes, i, j, o, L, k;

    // You bump into other snakes
    if (P && P.alive && !P.eaten) {
      for (i = 0; i < list.length; i++) {
        o = list[i];
        if (o === P || !o.alive || o.eaten) continue;
        var lethal = o.isKing || o.isBoss || this.isBigHunter(o);
        k = this.touch(P, o, !lethal);
        if (k < 0) continue;
        if (o.isBoss) {
          if (P.mass >= o.mass) this.defeatBoss(o, P, k);
          else if (P.shield <= 0) { this.killPlayer(o); break; }
        } else if (o.isKing || this.isBigHunter(o)) {
          if (P.shield <= 0) { this.killPlayer(o); break; }
        } else {
          this.beginEat(o, P, k); // regular snakes: YOU eat THEM
        }
      }
    }

    // The King / Boss (and, in Brave mode, very big snakes) bump into you and others
    for (i = 0; i < list.length; i++) {
      L = list[i];
      if (!L.alive || L.eaten || L.isPlayer) continue;
      if (!(L.isKing || L.isBoss || this.isBigHunter(L))) continue;

      if (P && P.alive && !P.eaten && P.shield <= 0 && !(L.isBoss && P.mass >= L.mass)) {
        if (this.touch(L, P, false) >= 0) { this.killPlayer(L); continue; }
      }
      if (!(L.isKing || L.isBoss)) continue;
      for (j = 0; j < list.length; j++) {
        o = list[j];
        if (o === L || o === P || !o.alive || o.eaten || o.isKing || o.isBoss) continue;
        if (L.isKing && o.mass > L.mass * 0.95) continue;
        k = this.touch(L, o, true);
        if (k >= 0) this.beginEat(o, L, k);
      }
    }
  };

  // Brave mode only: a much bigger ordinary snake can eat the player too
  World.prototype.isBigHunter = function (s) {
    var P = this.player;
    return this.difficulty === 'brave' && !!P && P.alive && !s.isPlayer && !s.isKing && !s.isBoss && s.mass >= P.mass * 1.5;
  };

  // The victim gets swallowed from whichever end was touched (head-end or tail-end)
  World.prototype.beginEat = function (v, by, k) {
    if (v.eaten) return;
    var n = v.segs.length;
    v.eaten = {
      by: by, fromHead: k < n * 0.5, acc: 0,
      per: v.mass * (v.isBoss ? CFG.BOSS_EAT_SHARE : CFG.EAT_EFFICIENCY) / n,
      rate: Math.max(28, n / (v.isBoss ? 2.2 : 1.1))
    };
    this.emit('eatStart', { victim: v, eater: by, x: v.segs[k].x, y: v.segs[k].y });
  };

  World.prototype.processEaten = function (v, dt) {
    var e = v.eaten, by = e.by;
    e.acc += e.rate * dt;
    while (e.acc >= 1 && v.segs.length) {
      e.acc -= 1;
      var seg = e.fromHead ? v.segs.shift() : v.segs.pop();
      this.emit('bite', { x: seg.x, y: seg.y, eater: by, victim: v });
      if (by.alive) {
        this.grow(by, e.per * by.growMul());
        if (by.isPlayer) this.addScore(e.per);
      }
    }
    if (!v.segs.length) {
      v.alive = false;
      if (by.isPlayer && by.alive && !v.isBoss && this.match) { this.match.snakes++; this.addScore(10); }
      this.emit('eaten', { victim: v, eater: by });
    }
  };

  // ---- the King ----
  World.prototype.updateCrown = function (silent) {
    var best = null, i, s;
    for (i = 0; i < this.snakes.length; i++) {
      s = this.snakes[i];
      if (!s.alive || s.eaten || s.isBoss) continue;
      if (!best || s.mass > best.mass) best = s;
    }
    var cur = this.king;
    if (cur && cur.alive && !cur.eaten && best && best !== cur && best.mass < cur.mass * CFG.KING_SWITCH) best = cur;
    if (best !== cur) {
      if (cur) cur.isKing = false;
      this.king = best;
      if (best) { best.isKing = true; if (!silent) this.emit('crown', { snake: best, prev: cur }); }
    }
  };

  // ---- the Boss ----
  World.prototype.bossLogic = function (dt) {
    var m = this.match;
    if (!m) return;
    if (this.boss) { if (!this.boss.alive) this.boss = null; return; }
    if (m.bossLevel > CFG.BOSSES.length) return;
    var L = CFG.BOSSES[m.bossLevel - 1], P = this.player;
    if (this.bossWarn > 0) {
      this.bossWarn -= dt;
      if (this.bossWarn <= 0) this.spawnBoss(L, m.bossLevel);
      return;
    }
    if (P && P.alive && P.mass >= L.trigger && this.time - this.lastBossEnd > 8) {
      this.bossWarn = CFG.BOSS_WARN;
      this.emit('bossWarning', { level: m.bossLevel, name: L.name });
    }
  };

  World.prototype.spawnBoss = function (L, level) {
    var P = this.player, R = CFG.ARENA_R;
    var ang = P ? Math.atan2(P.y, P.x) + Math.PI : U.rnd(0, TAU);
    var x = Math.cos(ang) * R * 0.72, y = Math.sin(ang) * R * 0.72;
    if (P && P.alive && U.dist(P, { x: x, y: y }) < 900) { var p = this.randomPoint(R * 0.7); x = p.x; y = p.y; }
    var b = new Snake({
      name: L.name, skin: SK.bossSkin(level), legged: true, isBoss: true, bossLevel: level,
      mass: L.mass, maxMass: L.mass * CFG.BOSS_GROW_CAP, x: x, y: y, angle: Math.atan2(-y, -x),
      speed: CFG.PLAYER_SPEED * L.speed, turn: L.turn
    });
    b.ai.rest = 2;
    this.snakes.push(b);
    this.boss = b;
    this.emit('bossSpawn', { boss: b, level: level, name: L.name });
  };

  World.prototype.defeatBoss = function (b, P, k) {
    var m = this.match;
    this.beginEat(b, P, k);
    P.shield = Math.max(P.shield, 4);
    this.boss = null;
    this.lastBossEnd = this.time;
    if (!m) return;
    m.bossesDefeated++;
    m.multiplier += 1;            // the multiplier bonus!
    var bonus = CFG.BOSS_BONUS * b.bossLevel;
    m.score += bonus;
    m.bossLevel++;
    var final = m.bossLevel > CFG.BOSSES.length;
    if (final) m.won = true;
    this.emit('bossDefeated', { boss: b, level: b.bossLevel, multiplier: m.multiplier, bonus: bonus, final: final });
  };

  // ---- dying and reviving ----
  World.prototype.killPlayer = function (by) {
    var P = this.player, m = this.match, i;
    if (!P || !P.alive) return;
    P.alive = false;
    var byBoss = !!(by && by.isBoss), lost = false, canRevive = true, prevMult = m ? m.multiplier : 1;
    if (m) {
      // Boss: multiplier is safe. Anything else: multiplier is lost.
      if (!byBoss && m.multiplier > 1) { lost = true; m.multiplier = 1; }
      canRevive = m.revivesUsed < CFG.MAX_REVIVES;
      if (canRevive) m.stars++;   // bonus point only while revives remain
      else m.over = true;
    }
    // the body pops into eggs
    var cnt = U.clamp(Math.floor(P.segs.length / 2), 6, 26), each = P.mass * 0.45 / cnt;
    for (i = 0; i < cnt; i++) {
      var sg = P.segs[Math.floor(i * P.segs.length / cnt)];
      this.spawnEgg(sg.x + U.rnd(-12, 12), sg.y + U.rnd(-12, 12), each, false);
    }
    if (by && by.isBoss) by.ai.rest = 7;   // the Boss relaxes after a snack
    this.deathInfo = {
      x: P.x, y: P.y, mass: P.mass, segs: P.segs.slice(), skin: P.skin,
      by: by, byName: by ? by.name : '', byBoss: byBoss, byKing: !!(by && by.isKing), lostMultiplier: lost, prevMult: prevMult,
      canRevive: canRevive, gotStar: !!(m && canRevive)
    };
    this.emit('playerDied', this.deathInfo);
  };

  World.prototype.revive = function () {
    var m = this.match;
    if (!m || m.over || (this.player && this.player.alive)) return false;
    if (m.revivesUsed >= CFG.MAX_REVIVES) return false;
    m.revivesUsed++;
    var keep = this.deathInfo && this.deathInfo.byBoss ? CFG.REVIVE_KEEP_BOSS : CFG.REVIVE_KEEP_REGULAR;
    var mass = Math.max(CFG.START_MASS, Math.floor((this.deathInfo ? this.deathInfo.mass : 0) * keep));
    var s = this.spawnPlayer(mass);
    s.shield = CFG.REVIVE_SHIELD;
    this.updateCrown(true);
    this.emit('revived', { snake: s });
    return true;
  };

  // ---- keeping the arena full ----
  World.prototype.maintain = function (dt) {
    var i, n = 0, need = CFG.EGG_COUNT - this.eggs.length, k = 0;
    while (need-- > 0 && k++ < 6) this.spawnRandomEgg();

    this.goldTimer -= dt;
    if (this.goldTimer <= 0) {
      this.goldTimer = 1.5;
      var g = 0;
      for (i = 0; i < this.eggs.length; i++) if (this.eggs[i].golden) g++;
      if (g < CFG.GOLDEN_MAX && U.rand() < 0.5) this.spawnGoldenEgg();
    }

    for (i = 0; i < this.snakes.length; i++) {
      var s = this.snakes[i];
      if (s.alive && !s.isPlayer && !s.isBoss) n++;
    }
    if (n < CFG.AI_COUNT) {
      this.spawnCool -= dt;
      if (this.spawnCool <= 0) { this.spawnCool = 0.7; this.spawnAI(); }
    }
  };

  // ---- helpers for the screen ----
  // Everyone except the Boss, biggest first
  World.prototype.standings = function () {
    return this.snakes.filter(function (s) { return s.alive && !s.eaten && !s.isBoss; })
      .sort(function (a, b) { return b.mass - a.mass; });
  };

  // How close is the nearest thing that could hurt the player? (gap between bodies, or Infinity)
  World.prototype.nearestThreat = function () {
    var P = this.player, best = null, bd = Infinity;
    if (!P || !P.alive || P.shield > 0) return { snake: null, gap: Infinity };
    for (var i = 0; i < this.snakes.length; i++) {
      var o = this.snakes[i];
      if (o === P || !o.alive || o.eaten) continue;
      var bad = o.isKing || (o.isBoss && P.mass < o.mass) || this.isBigHunter(o);
      if (!bad) continue;
      var gap = U.dist(o, P) - o.radius - P.radius;
      if (gap < bd) { bd = gap; best = o; }
    }
    return { snake: best, gap: bd };
  };

  SC.Snake = Snake;
  SC.World = World;
  SC.EGG_COLORS = EGG_COLORS;
})(typeof window !== 'undefined' ? window : globalThis);
