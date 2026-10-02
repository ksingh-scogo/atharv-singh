/* The shared arena: one World that every connected player plays in.
   This file knows nothing about sockets. It is given a `send(text)` function per player and
   messages to handle, so it can be tested without a network (see tests/net.js).

   Messages from a player (JSON):
     {t:'join', name, skin, legged, difficulty}   join the arena (or start a new run)
     {t:'in', a}                                  where I want to steer (angle in radians)
     {t:'revive'}   {t:'finish'}   {t:'afk', on}  {t:'ping', ts}
   Messages to a player:
     {t:'hi', v, online}   {t:'joined', id, name}   {t:'s', ...snapshot...}   {t:'over'}   {t:'pong'}
*/
'use strict';
require('../js/config.js');
require('../js/util.js');
require('../js/skins.js');
require('../js/world.js');

var SC = globalThis.SC, CFG = SC.CFG;

var PROTOCOL = 1;
var FX_IDS = ['speed', 'shine', 'legs', 'slow', 'dizzy', 'stun'];
// flag bits in a snake record: 1 king, 2 shield, 4 being eaten, 8 eaten from the head end, then the box effects
var F_KING = 1, F_SHIELD = 2, F_EATEN = 4, F_FROMHEAD = 8, F_FX = 16;

var GLOBAL_EVENTS = { crown: 1, bossWarning: 1, bossSpawn: 1, bossDefeated: 1, playerJoined: 1, playerLeft: 1 };
var PERSONAL_EVENTS = { egg: 1, shield: 1, eatStart: 1, bite: 1, eaten: 1, playerDied: 1, revived: 1 };

function r1(n) { return Math.round(n); }

function Arena() {
  this.world = new SC.World();
  this.world.startAttract();
  this.clients = {};
  this.seq = 0;
  this.tickN = 0;
  this.snapN = 0;
  this.snapEvery = Math.max(1, Math.round(CFG.TICK_HZ / CFG.SNAP_HZ));
  this.pending = [];       // world events since the last snapshot
  this.shared = null;      // leaderboard + map data, built once and given to everyone
  this.stats = { ticks: 0, msPerTick: 0, bytesOut: 0, snapshots: 0 };
}

// ---------------------------------------------------------------- connections
Arena.prototype.addClient = function (send) {
  var id = 'u' + (++this.seq);
  var c = this.clients[id] = {
    id: id, send: send, joined: false, known: {}, cx: 0, cy: 0, first: true,
    lastMsg: Date.now(), joinedAt: 0, eggSnap: 0, msgs: 0, msgWindow: Date.now()
  };
  this.send(c, { t: 'hi', v: PROTOCOL, online: this.world.players.length });
  return id;
};

Arena.prototype.removeClient = function (id) {
  if (this.world.slotById[id]) this.world.removePlayer(id);
  delete this.clients[id];
};

Arena.prototype.send = function (c, obj) {
  var text = typeof obj === 'string' ? obj : JSON.stringify(obj);
  this.stats.bytesOut += text.length;
  c.send(text);
};

Arena.prototype.playerCount = function () { return this.world.players.length; };

// ---------------------------------------------------------------- messages from players
Arena.prototype.handle = function (id, raw) {
  var c = this.clients[id], msg, w = this.world;
  if (!c) return;
  var now = Date.now();
  if (now - c.msgWindow > 1000) { c.msgWindow = now; c.msgs = 0; }
  if (++c.msgs > 60) return;                       // more than 60 messages a second: ignore the flood
  try { msg = JSON.parse(raw); } catch (e) { return; }
  if (!msg || typeof msg.t !== 'string') return;
  c.lastMsg = now;
  var slot = w.slotById[id];

  switch (msg.t) {
    case 'join':
      var prof = { name: msg.name, skin: msg.skin, legged: msg.legged, difficulty: msg.difficulty };
      if (slot) { w.restartPlayer(id, prof); }
      else { w.addPlayer(id, prof); }
      slot = w.slotById[id];
      c.joined = true; c.known = {}; c.first = true; c.joinedAt = now;
      this.send(c, { t: 'joined', id: id, name: slot.name });
      break;
    case 'in':
      if (slot && typeof msg.a === 'number') w.setInput(id, Math.max(-7, Math.min(7, msg.a)));
      break;
    case 'revive':
      if (slot) w.revive(id);
      break;
    case 'finish':
      if (slot) {
        w.finishPlayer(id);
        w.removePlayer(id);                 // they have left the arena (their friends are told)
        c.joined = false; c.known = {};
        this.send(c, { t: 'over' });
      }
      break;
    case 'afk':
      if (slot) { slot.afk = !!msg.on; c.afkSince = slot.afk ? now : 0; }
      break;
    case 'ping':
      this.send(c, { t: 'pong', ts: msg.ts, online: w.players.length });
      break;
    default: break;
  }
};

// ---------------------------------------------------------------- the clock
Arena.prototype.tick = function (dt) {
  var w = this.world, t0 = process.hrtime.bigint(), i, id;
  if (!w.players.length) { w.events.length = 0; this.pending.length = 0; return; }   // nobody here: the arena sleeps
  this.tickN++;

  // players who went quiet (closed laptop, lost signal) are removed after a while
  var now = Date.now();
  for (id in this.clients) {
    var c = this.clients[id];
    if (c.joined && (now - c.lastMsg > 90000 || (c.afkSince && now - c.afkSince > 300000))) { this.dropIdle(c); }
  }

  w.update(dt);
  for (i = 0; i < w.events.length; i++) this.pending.push(w.events[i]);
  w.events.length = 0;

  if (this.tickN % this.snapEvery === 0) this.broadcast();

  var ms = Number(process.hrtime.bigint() - t0) / 1e6;
  this.stats.ticks++;
  this.stats.msPerTick += (ms - this.stats.msPerTick) * 0.05;
};

Arena.prototype.dropIdle = function (c) {
  if (this.world.slotById[c.id]) this.world.removePlayer(c.id);
  c.joined = false;
  this.send(c, { t: 'kick', why: 'idle' });
  if (c.close) c.close();
};

// ---------------------------------------------------------------- snapshots
Arena.prototype.broadcast = function () {
  var w = this.world, id, c, events = this.pending;
  this.pending = [];
  this.snapN++;
  this.shared = null;
  var sendLb = (this.snapN % 8 === 0);
  var sendEggs = (this.snapN % 2 === 0);
  for (id in this.clients) {
    c = this.clients[id];
    if (!c.joined || !w.slotById[id]) continue;
    var snap = this.snapshotFor(c, events, sendLb || c.first, sendEggs || c.first);
    c.first = false;
    this.stats.snapshots++;
    this.send(c, snap);
  }
};

// leaderboard + minimap data, the same for everyone (built once per snapshot round)
Arena.prototype.sharedData = function () {
  if (this.shared) return this.shared;
  var w = this.world, list = w.standings(), rankById = {}, rows = [], i, s;
  for (i = 0; i < list.length; i++) {
    s = list[i];
    rankById[s.id] = i + 1;
    if (i < 5) rows.push([s.id, s.name, Math.floor(s.mass), s.isKing ? 1 : 0, s.isPlayer ? 1 : 0]);
  }
  var dots = [], golds = [];
  for (i = 0; i < w.snakes.length; i++) {
    s = w.snakes[i];
    if (!s.alive || s.isBoss) continue;
    dots.push([r1(s.x), r1(s.y), s.isPlayer ? 1 : 0, s.id]);
  }
  for (i = 0; i < w.eggs.length; i++) if (w.eggs[i].golden) golds.push([r1(w.eggs[i].x), r1(w.eggs[i].y)]);
  this.shared = { list: list, rankById: rankById, rows: rows, total: list.length, players: w.players.length, dots: dots, golds: golds };
  return this.shared;
};

function snakeFlags(s) {
  var f = 0, i;
  if (s.isKing) f |= F_KING;
  if (s.shield > 0) f |= F_SHIELD;
  if (s.eaten) { f |= F_EATEN; if (s.eaten.fromHead) f |= F_FROMHEAD; }
  for (i = 0; i < FX_IDS.length; i++) if (s.fx[FX_IDS[i]] > 0) f |= (F_FX << i);
  return f;
}

function flatSegs(segs, step) {
  var out = [];
  for (var i = 0; i < segs.length; i += step) out.push(r1(segs[i].x), r1(segs[i].y));
  return out;
}

// How far around a player we tell them about things. Big snakes zoom out further, so they see further.
function viewRange(me) {
  if (!me) return 1100;
  return Math.max(900, Math.min(CFG.VIEW_RANGE, 1.25 * (420 + 9 * me.radius) + 150));
}

Arena.prototype.snapshotFor = function (c, events, withLb, withEggs) {
  var w = this.world, slot = w.slotById[c.id], me = slot.snake, i, j, s, id;
  var range = viewRange(me && me.alive ? me : null);

  // where this player is looking (a dead player keeps looking where they died)
  if (me && me.alive) { c.cx = me.x; c.cy = me.y; }
  else if (slot.deathInfo) { c.cx = slot.deathInfo.x; c.cy = slot.deathInfo.y; }
  var cx = c.cx, cy = c.cy;

  var sn = [], fresh = [], eaten = [], seen = {}, gone = [];
  for (i = 0; i < w.snakes.length; i++) {
    s = w.snakes[i];
    if (!s.alive) continue;
    var dx = s.x - cx, dy = s.y - cy, reach = range + s.segs.length * s.radius * CFG.SPACING;
    var d2 = dx * dx + dy * dy;
    if (d2 > reach * reach) continue;
    seen[s.id] = 1;
    // snakes in the outer part of your view only need an update every third time (they are small and far)
    var far = d2 > range * range * 0.36 && s !== me && !s.eaten && c.known[s.id] && (this.snapN + s.id) % 3 !== 0;
    if (!far) sn.push([s.id, r1(s.x), r1(s.y), r1(s.angle * 1000), r1(s.mass * 10), snakeFlags(s)]);
    if (!c.known[s.id]) {
      c.known[s.id] = 1;
      fresh.push({
        i: s.id, n: s.name, k: s.skin.id, l: s.legged ? 1 : 0, h: s.isPlayer ? 1 : 0, o: s.owner, b: s.isBoss ? s.bossLevel : 0,
        sg: flatSegs(s.segs, 1)
      });
    }
    if (s.eaten) eaten.push([s.id].concat(flatSegs(s.segs, 1)));
  }
  for (id in c.known) if (!seen[id]) { gone.push(+id); delete c.known[id]; }

  var m = slot.match;
  var snap = {
    t: 's', n: this.snapN, st: slot.state,
    you: {
      m: [r1(m.score), m.stars, m.revivesUsed, m.multiplier, m.bossesDefeated, m.eggs, m.snakes, r1(m.bestMass), m.over ? 1 : 0, m.won ? 1 : 0],
      sh: me ? r1(Math.max(0, me.shield) * 10) : 0,
      fx: me ? FX_IDS.map(function (k) { return r1(Math.max(0, me.fx[k]) * 10); }) : [0, 0, 0, 0, 0, 0],
      id: me && me.alive ? me.id : 0
    },
    sn: sn, bl: w.bossLevel, bw: w.bossWarn > 0 ? 1 : 0
  };
  if (fresh.length) snap.nw = fresh;
  if (eaten.length) snap.ea = eaten;
  if (gone.length) snap.gn = gone;

  // boxes (there are only a few) and where the King and the Boss are, wherever they are
  var bx = [];
  for (i = 0; i < w.boxes.length; i++) {
    var b = w.boxes[i];
    bx.push([b.id, r1(b.x), r1(b.y), r1(Math.max(0, b.life - (w.time - b.born)) * 10)]);
  }
  snap.bx = bx;
  if (w.king) snap.kg = [w.king.id, r1(w.king.x), r1(w.king.y), r1(w.king.mass * 10)];
  if (w.boss && w.boss.alive) snap.bs = [w.boss.id, r1(w.boss.x), r1(w.boss.y), r1(w.boss.mass * 10), w.boss.bossLevel];

  if (withEggs) {
    var eg = [], eggs = w.eggs, R2 = range * range;
    for (j = 0; j < eggs.length; j++) {
      var e = eggs[j], ex = e.x - cx, ey = e.y - cy;
      if (ex * ex + ey * ey < R2) eg.push([r1(e.x), r1(e.y), e.c, Math.round(e.v * 10) / 10, e.golden ? 1 : 0]);
    }
    snap.eg = eg;
  }

  if (withLb) {
    var sh = this.sharedData();
    var myRank = me && me.alive ? sh.rankById[me.id] || 0 : 0;
    snap.lb = { r: sh.rows, rk: myRank, tot: sh.total, pl: sh.players };
    if (myRank > 5) snap.lb.me = [me.id, me.name, Math.floor(me.mass), me.isKing ? 1 : 0, 1];
    snap.mp = sh.dots;
    snap.gd = sh.golds;
  }

  var ev = this.eventsFor(c, events, cx, cy);
  if (ev.length) snap.ev = ev;
  return snap;
};

// which of the world's events does this player get to see?
Arena.prototype.eventsFor = function (c, events, cx, cy) {
  var out = [], i, e;
  for (i = 0; i < events.length; i++) {
    e = events[i];
    if (GLOBAL_EVENTS[e.type]) { out.push(e); continue; }
    if (PERSONAL_EVENTS[e.type]) {
      if (e.pid !== c.id) continue;
      if (e.type === 'playerDied') {
        var copy = {};
        for (var k in e) if (k !== 'segs') copy[k] = e[k];
        copy.sg = flatSegs(e.segs, 2);
        out.push(copy);
      } else out.push(e);
      continue;
    }
    if (e.type === 'boxOpen' || e.type === 'boxGone') {      // seen by anyone nearby
      var dx = e.x - cx, dy = e.y - cy;
      if (e.pid === c.id || dx * dx + dy * dy < 1600 * 1600) out.push(e);
    }
  }
  return out;
};

Arena.PROTOCOL = PROTOCOL;
Arena.FX_IDS = FX_IDS;
Arena.F_FX = F_FX;
module.exports = Arena;
