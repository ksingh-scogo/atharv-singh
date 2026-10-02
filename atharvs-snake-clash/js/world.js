/* The game world: snakes, eggs, mystery boxes, the King, the Boss, eating, dying, reviving.
   Any number of human players can be in the same world (each has a "slot" with their own score,
   revives and multiplier). No drawing and no DOM in here, so it also runs on the game server
   and in headless tests. */
(function (root) {
  'use strict';
  var SC = root.SC = root.SC || {};
  var CFG = SC.CFG, U = SC.util, SK = SC.skins;
  var TAU = U.TAU;
  var nextId = 1;
  var nextBoxId = 1;

  var NAMES = ['Zippy', 'Bubbles', 'Sparky', 'Nacho', 'Mango', 'Pixel', 'Waffles', 'Noodle', 'Turbo', 'Jelly',
    'Coco', 'Ziggy', 'Pickle', 'Biscuit', 'Comet', 'Ginger', 'Lulu', 'Peanut', 'Ollie', 'Dash', 'Rocket',
    'Sunny', 'Tango', 'Fuzzy', 'Kiwi', 'Donut', 'Sprout', 'Muffin', 'Blaze', 'Gizmo', 'Twinkle', 'Bolt'];

  var EGG_COLORS = ['#ff8ab3', '#7fd6ff', '#ffe066', '#9ef29a', '#c7a6ff', '#ffb27a'];
  var EFFECT_BY_ID = {};
  CFG.BOX_EFFECTS.forEach(function (e) { EFFECT_BY_ID[e.id] = e; });

  // ---------------------------------------------------------------- Snake
  function Snake(o) {
    this.id = o.id != null ? o.id : nextId++;
    this.name = o.name || 'Snake';
    this.skin = o.skin;
    this.legged = !!o.legged;
    this.isPlayer = !!o.isPlayer;   // true for every human-controlled snake
    this.owner = o.owner != null ? o.owner : null;   // which player slot steers it
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
    this.fx = { speed: 0, shine: 0, legs: 0, slow: 0, dizzy: 0, stun: 0 };   // mystery box effects (seconds left)
    this.dist = 0;      // distance travelled (drives the leg animation)
    this.eaten = null;  // set while another snake is swallowing this one
    this.alive = true;
    this.ai = {
      t: U.rnd(0, 0.3), timid: U.rand() < 0.4, boxLover: U.rand() < 0.7,
      chase: 0, cool: U.rnd(0, 3), rest: 0
    };
    this.segs = [];
    var n = U.segsFor(this.mass), sp = this.radius * CFG.SPACING;
    for (var i = 0; i < n; i++) {
      this.segs.push({ x: this.x - Math.cos(this.angle) * sp * i, y: this.y - Math.sin(this.angle) * sp * i });
    }
  }
  // legs: born with them, or from a Crawly Legs mystery box (bosses always have legs but no bonus)
  Snake.prototype.hasLegs = function () { return this.legged || this.fx.legs > 0; };
  Snake.prototype.turnRate = function () {
    return this.turnBase / (1 + this.radius / 140) * (this.hasLegs() && !this.isBoss ? CFG.LEG_TURN_BONUS : 1);
  };
  Snake.prototype.speedNow = function () {
    var s = this.baseSpeed;
    if (this.hasLegs() && !this.isBoss) s *= CFG.LEG_SPEED_BONUS;
    if (this.isKing && !this.isPlayer) s = Math.min(s, CFG.KING_SPEED);
    if (this.fx.speed > 0) s *= CFG.FX_SPEED_MUL;
    if (this.fx.slow > 0) s *= CFG.FX_SLOW_MUL;
    if (this.fx.stun > 0) s *= CFG.FX_STUN_MUL;
    return s;
  };
  Snake.prototype.growMul = function () { return this.hasLegs() ? 1 : CFG.LEGLESS_GROWTH_BONUS; };

  function newMatch() {
    return {
      score: 0, stars: 0, revivesUsed: 0, multiplier: 1,
      bossesDefeated: 0, eggs: 0, snakes: 0,
      bestMass: CFG.START_MASS, time: 0, over: false, won: false
    };
  }

  // Does `s` count as a danger to player snake P? (the red warning glow, the red screen edge)
  // The King (including a friend who is King) is always dangerous; a Boss only while it is bigger;
  // in Brave mode an ordinary computer snake 1.5x your size is too.
  function dangerFor(s, P, brave) {
    if (!P || !P.alive || s === P || s.eaten || !s.alive) return false;
    if (s.isKing) return true;
    if (s.isBoss) return P.mass < s.mass;
    return !!brave && !s.isPlayer && s.mass >= P.mass * 1.5;
  }

  // ---------------------------------------------------------------- World
  function World() { this.clear(); }

  World.prototype.clear = function () {
    this.time = 0;
    this.snakes = [];
    this.eggs = [];
    this.boxes = [];
    this.events = [];
    this.players = [];       // human player slots
    this.slotById = {};
    this.localId = null;     // the player this screen belongs to (solo play); the server has none
    this.online = false;     // true on screens that are playing on a game server
    this.boss = null;
    this.king = null;
    this.bossLevel = 1;      // which Boss is next (shared by everyone in the arena)
    this.bossWarn = 0;
    this.lastBossEnd = -99;
    this.spawnCool = 0;
    this.kingTimer = 0;
    this.goldTimer = 0;
    this.boxTimer = CFG.BOX_FIRST;
    this._hum = [];
  };

  // Handy views of "the player on this screen" (solo play and the test suite use these)
  Object.defineProperties(World.prototype, {
    player: { get: function () { var p = this.slotById[this.localId]; return p ? p.snake : null; } },
    match: { get: function () { var p = this.slotById[this.localId]; return p ? p.match : null; } },
    deathInfo: { get: function () { var p = this.slotById[this.localId]; return p ? p.deathInfo : null; } },
    profile: { get: function () { var p = this.slotById[this.localId]; return p ? p.profile : null; } }
  });

  World.prototype.emit = function (type, data) {
    data = data || {};
    data.type = type;
    this.events.push(data);
  };

  World.prototype.randomPoint = function (maxR) {
    var a = U.rnd(0, TAU), r = Math.sqrt(U.rand()) * maxR;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  };

  World.prototype.snakeById = function (id) {
    for (var i = 0; i < this.snakes.length; i++) if (this.snakes[i].id === id) return this.snakes[i];
    return null;
  };
  World.prototype.slotOf = function (snake) { return snake && snake.owner != null ? this.slotById[snake.owner] || null : null; };
  World.prototype.localSlot = function () { return this.slotById[this.localId] || null; };

  // alive human snakes
  World.prototype.humans = function () {
    var out = [];
    for (var i = 0; i < this.players.length; i++) {
      var s = this.players[i].snake;
      if (s && s.alive && !s.eaten) out.push(s);
    }
    return out;
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

  // Solo play: one human, who is "the player on this screen".
  World.prototype.startMatch = function (profile) {
    this.clear();
    this.populate();
    this.localId = 1;
    this.addPlayer(1, profile);
  };

  // A new human joins (any number of them can). profile: { name, skin, legged, difficulty }
  World.prototype.addPlayer = function (id, profile) {
    var slot = {
      id: id,
      name: this.uniqueName(U.cleanName(profile && profile.name, 'Player')),
      profile: {
        skin: SK.byId(profile && profile.skin).id,
        legged: !!(profile && profile.legged),
        difficulty: profile && profile.difficulty === 'brave' ? 'brave' : 'easy'
      },
      snake: null, match: newMatch(), deathInfo: null, want: null, state: 'playing'
    };
    this.players.push(slot);
    this.slotById[id] = slot;
    this.spawnPlayer(slot, CFG.START_MASS);
    slot.snake.shield = CFG.REVIVE_SHIELD + 1;
    this.updateCrown(true);
    this.emit('playerJoined', { pid: id, name: slot.name });
    return slot;
  };

  // two friends with the same name get "Ava" and "Ava 2" so their snakes can be told apart
  World.prototype.uniqueName = function (name) {
    var taken = {}, i;
    for (i = 0; i < this.players.length; i++) taken[this.players[i].name.toLowerCase()] = true;
    if (!taken[name.toLowerCase()]) return name;
    for (i = 2; i < 1000; i++) {
      var cand = Array.from(name).slice(0, CFG.NAME_MAX - String(i).length - 1).join('') + ' ' + i;
      if (!taken[cand.toLowerCase()]) return cand;
    }
    return name;
  };

  // A friend closes the page: their snake bursts into eggs and they are gone.
  World.prototype.removePlayer = function (id) {
    var slot = this.slotById[id];
    if (!slot) return;
    if (slot.snake && slot.snake.alive) {
      this.dropEggs(slot.snake, slot.snake.mass * 0.3, 8, 'tail');
      slot.snake.alive = false;
    }
    this.players.splice(this.players.indexOf(slot), 1);
    delete this.slotById[id];
    this.emit('playerLeft', { pid: id, name: slot.name });
  };

  // The player ends their run (no more revives wanted); their match stats stay readable.
  World.prototype.finishPlayer = function (id) {
    var slot = this.slotById[id];
    if (!slot) return null;
    if (slot.snake && slot.snake.alive) {
      this.dropEggs(slot.snake, slot.snake.mass * 0.3, 8, 'tail');
      slot.snake.alive = false;
    }
    slot.state = 'over';
    slot.match.over = true;
    return slot.match;
  };

  // "Play again": a fresh 29 revives, zero score, new snake
  World.prototype.restartPlayer = function (id, profile) {
    var slot = this.slotById[id];
    if (!slot) return this.addPlayer(id, profile);
    if (slot.snake && slot.snake.alive) slot.snake.alive = false;
    if (profile) {
      slot.profile.skin = SK.byId(profile.skin).id;
      slot.profile.legged = !!profile.legged;
      slot.profile.difficulty = profile.difficulty === 'brave' ? 'brave' : 'easy';
    }
    slot.match = newMatch();
    slot.deathInfo = null;
    slot.state = 'playing';
    slot.afk = false;
    this.spawnPlayer(slot, CFG.START_MASS);
    slot.snake.shield = CFG.REVIVE_SHIELD + 1;
    this.updateCrown(true);
    return slot;
  };

  World.prototype.playerCount = function () { return this.players.length; };

  World.prototype.setInput = function (id, angle) {
    var slot = this.slotById[id];
    if (slot && typeof angle === 'number' && isFinite(angle)) slot.want = angle;
  };

  World.prototype.spawnPlayer = function (slot, mass) {
    var pos, tries = 0, ok;
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
      name: slot.name, skin: SK.byId(slot.profile.skin), legged: slot.profile.legged, isPlayer: true, owner: slot.id,
      mass: mass, x: pos.x, y: pos.y, angle: U.rnd(-Math.PI, Math.PI), speed: CFG.PLAYER_SPEED
    });
    slot.snake = s;
    slot.want = null;
    this.snakes.push(s);
    return s;
  };

  // how big the humans are on average (computer snakes are sized to match)
  World.prototype.humanMass = function () {
    var hum = this.humans(), sum = 0;
    for (var i = 0; i < hum.length; i++) sum += hum[i].mass;
    return hum.length ? sum / hum.length : CFG.START_MASS;
  };

  World.prototype.spawnAI = function (o) {
    o = o || {};
    var hum = this.humans(), p, tries = 0, near;
    do {
      p = this.randomPoint(CFG.ARENA_R * 0.88);
      near = false;
      for (var h = 0; h < hum.length; h++) if (U.dist(p, hum[h]) < 850) { near = true; break; }
    } while (near && ++tries < 15);
    var pm = this.humanMass();
    // mostly small snakes, sometimes a big one; bigger when the players are bigger
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

  // Turn some of a snake's size into eggs lying around (from its tail, or all around it for a blast)
  World.prototype.dropEggs = function (s, total, count, mode) {
    if (total <= 0 || count <= 0) return;
    var each = total / count, i, sg, a, r;
    for (i = 0; i < count; i++) {
      if (mode === 'blast') {
        a = U.rnd(0, TAU); r = U.rnd(40, 170);
        this.spawnEgg(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r, each, false);
      } else {
        var from = mode === 'tail' ? Math.floor(s.segs.length * 0.4) : 0;
        sg = s.segs[Math.min(s.segs.length - 1, from + Math.floor(i * (s.segs.length - from) / count))];
        this.spawnEgg(sg.x + U.rnd(-12, 12), sg.y + U.rnd(-12, 12), each, false);
      }
    }
  };

  // ---- main update ----
  // steer: where the player on this screen wants to go (solo play); on a server, inputs come in through setInput.
  World.prototype.update = function (dt, steer) {
    this.time += dt;
    var i, s, slot;
    var local = this.localSlot();
    if (local && steer != null) local.want = steer;
    for (i = 0; i < this.players.length; i++) {
      slot = this.players[i];
      if (slot.snake && slot.snake.alive && slot.want != null) slot.snake.want = slot.want;
      if (slot.snake) slot.snake.frozen = !!slot.afk;
    }
    this._hum = this.humans();

    for (i = 0; i < this.snakes.length; i++) {
      s = this.snakes[i];
      if (!s.alive) continue;
      if (s.eaten) { this.processEaten(s, dt); continue; }
      if (!s.isPlayer) this.think(s, dt);
      this.move(s, dt);
    }
    this.updateEggs(dt);
    this.updateBoxes(dt);
    this.collide();
    this.snakes = this.snakes.filter(function (x) { return x.alive; });

    this.kingTimer -= dt;
    if (this.kingTimer <= 0) { this.kingTimer = 0.2; this.updateCrown(false); }
    this.bossLogic(dt);
    this.maintain(dt);

    for (i = 0; i < this.players.length; i++) {
      slot = this.players[i];
      if (slot.snake && slot.snake.alive) {
        slot.match.time += dt;
        if (slot.snake.mass > slot.match.bestMass) slot.match.bestMass = slot.snake.mass;
      }
    }

    // on a solo screen: flag the snakes that can hurt the player (drawn with a red warning glow)
    var P = this.player, brave = local && local.profile.difficulty === 'brave';
    if (local) for (i = 0; i < this.snakes.length; i++) this.snakes[i].dangerous = dangerFor(this.snakes[i], P, brave);
  };

  World.prototype.move = function (s, dt) {
    if (s.frozen) { if (s.shield < 1) s.shield = 1; return; }   // a player who stepped away (menu open) stands still, safe in a bubble
    if (s.shield > 0) s.shield -= dt;
    var fx = s.fx;
    if (fx.speed > 0) fx.speed -= dt;
    if (fx.shine > 0) fx.shine -= dt;
    if (fx.legs > 0) fx.legs -= dt;
    if (fx.slow > 0) fx.slow -= dt;
    if (fx.dizzy > 0) fx.dizzy -= dt;
    if (fx.stun > 0) fx.stun -= dt;

    // steer toward where we want to go, limited by the turn rate (Dizzy flips the steering!)
    var diff = U.angDiff(s.want, s.angle), mt = s.turnRate() * dt;
    if (fx.dizzy > 0) diff = -diff;
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
      if (n > want + 6) segs.pop();   // a big shrink (Length Reducer / Blast) is quick
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
      // eggs drift toward a player's mouth; a Super Shine snake (anyone) pulls them in from twice as far
      var mag = s.isPlayer ? s.radius * 1.9 + 50 : 0;
      if (s.fx.shine > 0) mag = (s.radius * 1.9 + 50) * CFG.FX_MAGNET_MUL;
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
    var slot = this.slotOf(s);
    if (slot) {
      this.addScore(slot, e.v);
      slot.match.eggs++;
      this.emit('egg', { pid: slot.id, x: e.x, y: e.y, v: e.v, golden: e.golden, c: e.c });
      if (e.golden) {   // golden eggs also give a human a short shield
        s.shield = Math.min(8, s.shield + CFG.GOLD_SHIELD);
        this.emit('shield', { pid: slot.id });
      }
    }
  };

  World.prototype.grow = function (s, amount) {
    s.mass += amount;
    if (s.isBoss) { if (s.maxMass && s.mass > s.maxMass) s.mass = s.maxMass; }
    else if (!s.isPlayer) s.mass = Math.min(s.mass, s.isKing ? CFG.KING_MASS_CAP : CFG.AI_MASS_CAP);
  };

  World.prototype.addScore = function (slot, base) {
    if (slot) slot.match.score += base * slot.match.multiplier;
  };

  // ---- mystery boxes ----
  World.prototype.spawnBox = function () {
    var hum = this._hum.length ? this._hum : this.humans(), p;
    var R = CFG.ARENA_R * 0.9;
    if (hum.length && U.rand() < 0.6) {          // often near somebody, so they get found
      var h = U.pick(hum), a = U.rnd(0, TAU), r = U.rnd(450, 1000);
      p = { x: h.x + Math.cos(a) * r, y: h.y + Math.sin(a) * r };
      var d = Math.sqrt(p.x * p.x + p.y * p.y);
      if (d > R) { p.x *= R / d; p.y *= R / d; }
    } else p = this.randomPoint(R);
    var b = { id: nextBoxId++, x: p.x, y: p.y, born: this.time, life: CFG.BOX_LIFE * U.rnd(0.85, 1.15), ph: U.rnd(0, TAU) };
    this.boxes.push(b);
    return b;
  };

  World.prototype.updateBoxes = function (dt) {
    this.boxTimer -= dt;
    if (this.boxTimer <= 0) {
      this.boxTimer = CFG.BOX_INTERVAL * U.rnd(0.8, 1.2);
      if (this.boxes.length < CFG.BOX_MAX) this.spawnBox();
    }
    var list = this.snakes, i, j, b, s;
    for (i = this.boxes.length - 1; i >= 0; i--) {
      b = this.boxes[i];
      if (this.time - b.born > b.life) {           // nobody opened it: it vanishes
        this.boxes.splice(i, 1);
        this.emit('boxGone', { id: b.id, x: b.x, y: b.y });
        continue;
      }
      for (j = 0; j < list.length; j++) {
        s = list[j];
        if (!s.alive || s.eaten || s.isBoss) continue;
        var dx = s.x - b.x, dy = s.y - b.y, reach = s.radius + CFG.BOX_REACH;
        if (dx * dx + dy * dy < reach * reach) {
          this.boxes.splice(i, 1);
          this.openBox(s, b);
          break;
        }
      }
    }
  };

  // Any snake can open a box (computer snakes too). It gives one of the 8 effects at random.
  World.prototype.openBox = function (s, b) {
    var eff = U.pick(CFG.BOX_EFFECTS);
    this.applyEffect(s, eff.id, b);
    this.emit('boxOpen', { id: b.id, x: b.x, y: b.y, sid: s.id, pid: s.owner != null ? s.owner : 0, eff: eff.id, good: eff.good });
  };

  World.prototype.applyEffect = function (s, id, b) {
    var def = EFFECT_BY_ID[id], fx = s.fx, loss;
    if (!def) return;
    switch (id) {
      case 'speed': fx.speed = def.dur; fx.slow = 0; break;
      case 'slow': fx.slow = def.dur; fx.speed = 0; break;
      case 'shine': fx.shine = def.dur; break;
      case 'legs': fx.legs = def.dur; break;
      case 'dizzy': fx.dizzy = def.dur; break;
      case 'grow': this.grow(s, Math.max(8, s.mass * CFG.FX_GROW)); break;
      case 'shrink':
        loss = Math.min(s.mass * CFG.FX_SHRINK, Math.max(0, s.mass - CFG.START_MASS));
        if (loss >= 1) { s.mass -= loss; this.dropEggs(s, loss * 0.7, U.clamp(Math.round(loss / 3), 3, 12), 'tail'); }
        break;
      case 'blast':
        loss = Math.min(s.mass * CFG.FX_BLAST, Math.max(0, s.mass - CFG.START_MASS));
        if (loss >= 1) { s.mass -= loss; this.dropEggs(s, loss * 0.7, U.clamp(Math.round(loss / 3), 4, 14), 'blast'); }
        fx.stun = CFG.FX_STUN_TIME;
        break;
      default: break;
    }
  };

  // ---- AI ----
  World.prototype.think = function (s, dt) {
    var a = s.ai;
    a.t -= dt; a.chase -= dt; a.cool -= dt; a.rest -= dt;
    if (a.t > 0) return;
    a.t = 0.16 + U.rand() * 0.14;
    var want = s.isBoss ? this.thinkBoss(s) : this.thinkSnake(s);

    // stay away from the wall
    var R = CFG.ARENA_R, dd = Math.sqrt(s.x * s.x + s.y * s.y), margin = 300 + s.radius * 2;
    if (dd > R - margin) {
      var f = U.clamp((dd - (R - margin)) / margin, 0, 1);
      want = U.blendAngle(want, Math.atan2(-s.y, -s.x), Math.min(1, f * 1.5));
    }
    s.want = want;
  };

  // the nearest of `list` (to s) that passes `pred`, or null
  World.prototype.nearest = function (s, list, pred) {
    var best = null, bd = Infinity;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o === s || !o.alive || o.eaten || (pred && !pred(o))) continue;
      var dx = o.x - s.x, dy = o.y - s.y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  };

  // aim at where the player is going to be
  World.prototype.leadAngle = function (s, P, lead) {
    var tx = P.x + Math.cos(P.angle) * P.speedNow() * lead;
    var ty = P.y + Math.sin(P.angle) * P.speedNow() * lead;
    return Math.atan2(ty - s.y, tx - s.x);
  };

  // Chase a player for a few seconds, then take a break (keeps things fair for a kid).
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

  World.prototype.isBrave = function (P) {
    var slot = this.slotOf(P);
    return !!slot && slot.profile.difficulty === 'brave';
  };

  // Brave mode only: a much bigger ordinary computer snake can eat that player too
  World.prototype.isBigHunterFor = function (s, P) {
    return !!P && P.alive && !s.isPlayer && !s.isKing && !s.isBoss && s.mass >= P.mass * 1.5 && this.isBrave(P);
  };

  World.prototype.thinkSnake = function (s) {
    var a = s.ai, i, d, o, hum = this._hum, self = this;

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
    var ang, P;
    if (s.isKing) {
      P = this.nearest(s, hum, function (h) { return h.shield <= 0; });
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
    } else {
      P = this.nearest(s, hum, function (h) { return h.shield <= 0 && self.isBigHunterFor(s, h); });
      if (P) {
        ang = this.huntPlayer(s, P, 420);
        if (ang !== null) return ang;
      }
    }

    // 3. a mystery box nearby? (most computer snakes are curious)
    if (a.boxLover && this.boxes.length) {
      var bx = null, bd = 520 * 520;
      for (i = 0; i < this.boxes.length; i++) {
        var q = this.boxes[i], qx = q.x - s.x, qy = q.y - s.y, qd = qx * qx + qy * qy;
        if (qd < bd) { bd = qd; bx = q; }
      }
      if (bx) return Math.atan2(bx.y - s.y, bx.x - s.x);
    }

    // 4. timid snakes run away from players
    if (a.timid && !s.isKing) {
      P = this.nearest(s, hum);
      if (P) {
        d = U.dist(s, P);
        if (d < 230 + P.radius) return Math.atan2(s.y - P.y, s.x - P.x) + U.rnd(-0.3, 0.3);
      }
    }

    // 5. go for the nearest (or shiniest) egg
    var best = null, bs = 1e18, r2 = 520 * 520, eggs = this.eggs;
    for (i = 0; i < eggs.length; i++) {
      var e = eggs[i], dx = e.x - s.x, dy = e.y - s.y, d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      var sc = d2 / (e.golden ? 3 : 1 + e.v * 0.4);
      if (sc < bs) { bs = sc; best = e; }
    }
    if (best) return Math.atan2(best.y - s.y, best.x - s.x);

    // 6. wander
    return s.angle + U.rnd(-0.7, 0.7);
  };

  World.prototype.thinkBoss = function (s) {
    var a = s.ai, i, o, d, hum = this._hum;
    // somebody big enough is near: the Boss is afraid and runs!
    var scary = this.nearest(s, hum, function (h) { return h.mass >= s.mass; });
    s.scared = hum.some(function (h) { return h.mass >= s.mass; });
    if (scary && U.dist(s, scary) < 550) return Math.atan2(s.y - scary.y, s.x - scary.x) + U.rnd(-0.2, 0.2);
    // otherwise chase the nearest player it can beat
    if (a.rest <= 0) {
      var P = this.nearest(s, hum, function (h) { return h.mass < s.mass && h.shield <= 0; });
      if (P && U.dist(s, P) < 950) return this.leadAngle(s, P, 0.3);
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

  // Rules, for every human P:
  //  - bumping an ordinary computer snake: P eats it (from the head-end or the tail-end)
  //  - bumping the King (a computer snake or a friend wearing the crown) kills P
  //  - bumping a Boss: P wins if P is at least as big, otherwise P is eaten
  //  - friends who are not King just slide past each other
  World.prototype.collide = function () {
    var humans = this.humans(), list = this.snakes, hi, i, j, o, L, P, k;

    // humans bump into other snakes
    for (hi = 0; hi < humans.length; hi++) {
      P = humans[hi];
      if (!P.alive || P.eaten) continue;
      for (i = 0; i < list.length; i++) {
        o = list[i];
        if (o === P || !o.alive || o.eaten) continue;
        if (o.isPlayer && !o.isKing) continue;                  // friends pass through each other
        var hunter = this.isBigHunterFor(o, P);
        var lethal = o.isKing || o.isBoss || hunter;
        k = this.touch(P, o, !lethal);
        if (k < 0) continue;
        if (o.isBoss) {
          if (P.mass >= o.mass) this.defeatBoss(o, P, k);
          else if (P.shield <= 0) { this.killPlayer(P, o); break; }
        } else if (o.isKing || hunter) {
          if (P.shield <= 0) { this.killPlayer(P, o); break; }
        } else {
          this.beginEat(o, P, k); // ordinary computer snakes: YOU eat THEM
        }
      }
    }

    // the King / a Boss (and, in Brave mode, very big computer snakes) bump into humans and others
    for (i = 0; i < list.length; i++) {
      L = list[i];
      if (!L.alive || L.eaten) continue;
      var dangerous = L.isKing || L.isBoss || (!L.isPlayer && humans.some(function (h) { return this.isBigHunterFor(L, h); }, this));
      if (!dangerous) continue;

      for (hi = 0; hi < humans.length; hi++) {
        P = humans[hi];
        if (!P.alive || P.eaten || P === L || P.shield > 0) continue;
        if (L.isBoss && P.mass >= L.mass) continue;
        if (!L.isKing && !L.isBoss && !this.isBigHunterFor(L, P)) continue;
        if (this.touch(L, P, false) >= 0) this.killPlayer(P, L);
      }
      if (L.isPlayer || !(L.isKing || L.isBoss)) continue;       // only the computer King / Boss eat computer snakes
      for (j = 0; j < list.length; j++) {
        o = list[j];
        if (o === L || o.isPlayer || !o.alive || o.eaten || o.isKing || o.isBoss) continue;
        if (L.isKing && o.mass > L.mass * 0.95) continue;
        k = this.touch(L, o, true);
        if (k >= 0) this.beginEat(o, L, k);
      }
    }
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
    this.emit('eatStart', { pid: by.owner != null ? by.owner : 0, eaterId: by.id, victimId: v.id, x: v.segs[k].x, y: v.segs[k].y });
  };

  World.prototype.processEaten = function (v, dt) {
    var e = v.eaten, by = e.by, slot = this.slotOf(by);
    e.acc += e.rate * dt;
    while (e.acc >= 1 && v.segs.length) {
      e.acc -= 1;
      var seg = e.fromHead ? v.segs.shift() : v.segs.pop();
      if (slot) this.emit('bite', { pid: slot.id, x: seg.x, y: seg.y, eaterId: by.id, victimId: v.id, vBoss: v.isBoss, vSkin: v.skin.id });
      if (by.alive) {
        this.grow(by, e.per * by.growMul());
        if (slot) this.addScore(slot, e.per);
      }
    }
    if (!v.segs.length) {
      v.alive = false;
      if (slot && by.alive && !v.isBoss) { slot.match.snakes++; this.addScore(slot, 10); }
      this.emit('eaten', { pid: slot ? slot.id : 0, eaterId: by.id, victimId: v.id, vBoss: v.isBoss, x: by.x, y: by.y });
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
      if (best) {
        best.isKing = true;
        if (!silent) {
          this.emit('crown', {
            id: best.id, name: best.name, pid: best.owner != null ? best.owner : 0,
            prevId: cur ? cur.id : 0, prevPid: cur && cur.owner != null ? cur.owner : 0
          });
        }
      }
    }
  };

  // ---- the Boss ----
  // One Boss at a time for the whole arena. It wakes up when any player gets big enough.
  World.prototype.bossLogic = function (dt) {
    var hum = this.humans();
    if (!hum.length) return;
    if (this.boss) { if (!this.boss.alive) this.boss = null; return; }
    if (this.bossLevel > CFG.BOSSES.length) return;
    var L = CFG.BOSSES[this.bossLevel - 1];
    if (this.bossWarn > 0) {
      this.bossWarn -= dt;
      if (this.bossWarn <= 0) this.spawnBoss(L, this.bossLevel);
      return;
    }
    var top = 0;
    for (var i = 0; i < hum.length; i++) if (hum[i].mass > top) top = hum[i].mass;
    if (top >= L.trigger && this.time - this.lastBossEnd > 8) {
      this.bossWarn = CFG.BOSS_WARN;
      this.emit('bossWarning', { level: this.bossLevel, name: L.name });
    }
  };

  World.prototype.spawnBoss = function (L, level) {
    var hum = this.humans(), R = CFG.ARENA_R, top = null, i;
    for (i = 0; i < hum.length; i++) if (!top || hum[i].mass > top.mass) top = hum[i];
    var ang = top ? Math.atan2(top.y, top.x) + Math.PI : U.rnd(0, TAU);
    var x = Math.cos(ang) * R * 0.72, y = Math.sin(ang) * R * 0.72;
    var close = hum.some(function (h) { return U.dist(h, { x: x, y: y }) < 900; });
    if (close) { var p = this.randomPoint(R * 0.7); x = p.x; y = p.y; }
    var b = new Snake({
      name: L.name, skin: SK.bossSkin(level), legged: true, isBoss: true, bossLevel: level,
      mass: L.mass, maxMass: L.mass * CFG.BOSS_GROW_CAP, x: x, y: y, angle: Math.atan2(-y, -x),
      speed: CFG.PLAYER_SPEED * L.speed, turn: L.turn
    });
    b.ai.rest = 2;
    this.snakes.push(b);
    this.boss = b;
    this.emit('bossSpawn', { id: b.id, level: level, name: L.name });
  };

  World.prototype.defeatBoss = function (b, P, k) {
    var slot = this.slotOf(P), m = slot ? slot.match : null;
    this.beginEat(b, P, k);
    P.shield = Math.max(P.shield, 4);
    this.boss = null;
    this.lastBossEnd = this.time;
    var level = b.bossLevel, bonus = CFG.BOSS_BONUS * level;
    this.bossLevel = level + 1;
    var final = this.bossLevel > CFG.BOSSES.length;
    if (m) {
      m.bossesDefeated++;
      m.multiplier += 1;            // the multiplier bonus!
      m.score += bonus;
      if (final) m.won = true;
    }
    this.emit('bossDefeated', {
      pid: slot ? slot.id : 0, name: b.name, by: P.name, level: level,
      multiplier: m ? m.multiplier : 1, bonus: bonus, final: final, x: b.x, y: b.y
    });
  };

  // ---- dying and reviving ----
  // P is the human snake that was eaten, `by` the snake that ate it.
  World.prototype.killPlayer = function (P, by) {
    var slot = this.slotOf(P), i;
    if (!slot || !P.alive) return;
    var m = slot.match;
    P.alive = false;
    var byBoss = !!(by && by.isBoss), lost = false, prevMult = m.multiplier;
    // Boss: multiplier is safe. Anything else (the King, a big snake): multiplier is lost.
    if (!byBoss && m.multiplier > 1) { lost = true; m.multiplier = 1; }
    var canRevive = m.revivesUsed < CFG.MAX_REVIVES;
    if (canRevive) m.stars++;   // a bonus point, but only while revives remain
    else m.over = true;
    slot.state = canRevive ? 'dead' : 'over';
    // the body pops into eggs
    var cnt = U.clamp(Math.floor(P.segs.length / 2), 6, 26), each = P.mass * 0.45 / cnt;
    for (i = 0; i < cnt; i++) {
      var sg = P.segs[Math.floor(i * P.segs.length / cnt)];
      this.spawnEgg(sg.x + U.rnd(-12, 12), sg.y + U.rnd(-12, 12), each, false);
    }
    if (byBoss) by.ai.rest = 7;   // the Boss relaxes after a snack
    slot.deathInfo = {
      pid: slot.id, x: P.x, y: P.y, mass: P.mass, segs: P.segs.slice(), skinId: P.skin.id,
      byId: by ? by.id : 0, byName: by ? by.name : '', byBoss: byBoss, byKing: !!(by && by.isKing),
      byFriend: !!(by && by.isPlayer), lostMultiplier: lost, prevMult: prevMult,
      canRevive: canRevive, gotStar: canRevive
    };
    this.emit('playerDied', slot.deathInfo);
  };

  World.prototype.revive = function (id) {
    var slot = this.slotById[id != null ? id : this.localId];
    if (!slot || slot.match.over || (slot.snake && slot.snake.alive)) return false;
    var m = slot.match;
    if (m.revivesUsed >= CFG.MAX_REVIVES) return false;
    m.revivesUsed++;
    var keep = slot.deathInfo && slot.deathInfo.byBoss ? CFG.REVIVE_KEEP_BOSS : CFG.REVIVE_KEEP_REGULAR;
    var mass = Math.max(CFG.START_MASS, Math.floor((slot.deathInfo ? slot.deathInfo.mass : 0) * keep));
    var s = this.spawnPlayer(slot, mass);
    s.shield = CFG.REVIVE_SHIELD;
    slot.state = 'playing';
    this.updateCrown(true);
    this.emit('revived', { pid: slot.id });
    return true;
  };

  // ---- keeping the arena full ----
  World.prototype.aiTarget = function () {
    return CFG.AI_COUNT + Math.min(CFG.AI_EXTRA_MAX, Math.floor(this.players.length * CFG.AI_PER_PLAYER));
  };

  World.prototype.maintain = function (dt) {
    var i, n = 0, k = 0;
    // more friends, more eggs
    var eggTarget = CFG.EGG_COUNT + Math.min(CFG.EGGS_EXTRA_MAX, this.players.length * CFG.EGGS_PER_PLAYER);
    while (this.eggs.length < eggTarget && k++ < 6) this.spawnRandomEgg();

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
    if (n < this.aiTarget()) {
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

  // The top of the leaderboard plus where player `pid` stands.
  World.prototype.leaderboard = function (pid, n) {
    var list = this.standings(), rows = [], rank = 0, i, mine = null, slot = this.slotById[pid != null ? pid : this.localId];
    if (slot && slot.snake && slot.snake.alive) mine = slot.snake;
    function row(s, r) {
      return { id: s.id, name: s.name, mass: Math.floor(s.mass), king: !!s.isKing, human: !!s.isPlayer, me: s === mine, rank: r };
    }
    for (i = 0; i < list.length; i++) {
      if (list[i] === mine) rank = i + 1;
      if (i < n) rows.push(row(list[i], i + 1));
    }
    if (mine && rank > n) rows.push(row(mine, rank));
    return { rows: rows, rank: rank, total: list.length, players: this.players.length };
  };

  // How close is the nearest thing that could hurt player `pid`? (gap between bodies, or Infinity)
  World.prototype.nearestThreat = function (pid) {
    var slot = this.slotById[pid != null ? pid : this.localId], P = slot ? slot.snake : null, best = null, bd = Infinity;
    if (!P || !P.alive || P.shield > 0) return { snake: null, gap: Infinity };
    var brave = slot.profile.difficulty === 'brave';
    for (var i = 0; i < this.snakes.length; i++) {
      var o = this.snakes[i];
      if (!dangerFor(o, P, brave)) continue;
      var gap = U.dist(o, P) - o.radius - P.radius;
      if (gap < bd) { bd = gap; best = o; }
    }
    return { snake: best, gap: bd };
  };

  SC.Snake = Snake;
  SC.World = World;
  SC.EGG_COLORS = EGG_COLORS;
  SC.dangerFor = dangerFor;
  SC.newMatch = newMatch;
})(typeof window !== 'undefined' ? window : globalThis);
