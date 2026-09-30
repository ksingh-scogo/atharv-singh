/* Headless simulation: plays the game logic with a simple bot, checks the rules from the spec.
   Run:  node tests/sim.js            (no browser needed) */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');

var sandbox = { console: console, Math: Math, Date: Date };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
['config', 'util', 'skins', 'world'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), sandbox, { filename: f + '.js' });
});
var SC = sandbox.SC, CFG = SC.CFG, U = SC.util;

var failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.log('  FAIL: ' + msg); }
}
function section(t) { console.log('\n' + t); }

function newWorld(seed, opts) {
  U.rand = U.mulberry32(seed);
  var w = new SC.World();
  w.startMatch(Object.assign({ name: 'Atharv', skin: 'sapphire', legged: true, difficulty: 'easy' }, opts || {}));
  return w;
}
function step(w, dt, steer) { w.update(dt, steer); w.events.length = 0; }

// ------------------------------------------------------------ a simple bot
function botSteer(w) {
  var P = w.player;
  if (!P || !P.alive) return null;
  var i, o, d;
  // run from the King / Boss when they are close and dangerous
  var th = w.nearestThreat();
  if (th.snake && th.gap < 320) return Math.atan2(P.y - th.snake.y, P.x - th.snake.x);
  // chase the Boss if we are big enough
  if (w.boss && w.boss.alive && !w.boss.eaten && P.mass >= w.boss.mass) return Math.atan2(w.boss.y - P.y, w.boss.x - P.x);
  // prey: nearest regular snake, else nearest egg
  var best = null, bd = 1e18;
  for (i = 0; i < w.snakes.length; i++) {
    o = w.snakes[i];
    if (o === P || !o.alive || o.eaten || o.isBoss || o.isKing) continue;
    d = U.dist(P, o);
    if (d < 700 && d < bd) { bd = d; best = o; }
  }
  if (best) return Math.atan2(best.y - P.y, best.x - P.x);
  for (i = 0; i < w.eggs.length; i++) {
    var e = w.eggs[i]; d = (e.x - P.x) * (e.x - P.x) + (e.y - P.y) * (e.y - P.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best ? Math.atan2(best.y - P.y, best.x - P.x) : null;
}

function sanity(w, label) {
  var R = CFG.ARENA_R + 5;
  for (var i = 0; i < w.snakes.length; i++) {
    var s = w.snakes[i];
    if (!isFinite(s.x) || !isFinite(s.y) || !isFinite(s.mass) || !isFinite(s.radius)) { check(false, label + ': NaN in snake ' + s.name); return false; }
    if (s.x * s.x + s.y * s.y > R * R) { check(false, label + ': snake outside arena ' + s.name); return false; }
    if (s.segs.length < 1) { check(false, label + ': snake with no segments ' + s.name); return false; }
  }
  return true;
}

// ------------------------------------------------------------ 1. basic start
section('1. Match start');
(function () {
  var w = newWorld(1);
  check(w.player && w.player.alive, 'player exists');
  check(w.king && w.king.isKing && !w.king.isPlayer, 'a King exists at the start and it is not the player');
  check(w.king.mass > CFG.KING_SEED_MASS[0] - 1, 'King is big: ' + w.king.mass.toFixed(0));
  check(w.snakes.filter(function (s) { return !s.isPlayer; }).length >= CFG.AI_COUNT, 'AI snakes present');
  check(w.eggs.length >= CFG.EGG_COUNT, 'eggs present');
  var skins = {}; w.snakes.forEach(function (s) { skins[s.skin.id] = 1; });
  check(Object.keys(skins).length >= 6, 'visual variety: ' + Object.keys(skins).length + ' different skins');
  check(w.snakes.some(function (s) { return s.legged; }) && w.snakes.some(function (s) { return !s.legged; }), 'both legged and legless snakes');
  check(w.snakes.some(function (s) { return s.skin.tier !== 'common'; }), 'shiny/fancy skins appear');
  console.log('  King:', w.king.name, w.king.mass.toFixed(0), ' skins:', Object.keys(skins).length);
})();

// ------------------------------------------------------------ 2. eating regular snakes (head-end / tail-end)
section('2. Colliding with a regular snake EATS it (head end or tail end)');
(function () {
  ['head', 'tail'].forEach(function (end) {
    var w = newWorld(2);
    var P = w.player; P.shield = 0;
    // remove everybody else, add one regular snake directly in front of the player
    w.eggs = [];
    // a huge, frozen King far away, so the victim stays an ordinary snake
    var farKing = new SC.Snake({ name: 'Far King', skin: SC.skins.byId('ruby'), mass: 500, x: -1800, y: 0, angle: 0, speed: 0 });
    farKing.ai.cool = 999;
    w.snakes = [P, farKing];
    w.king = null;
    var v = new SC.Snake({ name: 'Victim', skin: SC.skins.byId('leaf'), mass: 40, x: P.x, y: P.y, angle: 0, speed: 0 });
    // lay the victim out so that the touched end is the head end or the tail end
    var vs = v.segs, sp = v.radius * CFG.SPACING;
    var axis = 1;
    for (var i = 0; i < vs.length; i++) { vs[i].x = P.x + 60 + (end === 'head' ? i : vs.length - 1 - i) * sp * axis; vs[i].y = P.y + 200; }
    v.x = vs[0].x; v.y = vs[0].y;
    w.snakes.push(v);
    P.angle = P.want = Math.PI / 2; // head straight toward the victim
    P.x = P.segs[0].x = vs[Math.floor(vs.length / (end === 'head' ? 8 : 1.15))].x; P.y = P.segs[0].y = P.y;
    var before = P.mass, eatenEvt = false, fromHead = null;
    for (var t = 0; t < 200; t++) {
      w.update(1 / 30, null);
      w.events.forEach(function (e) { if (e.type === 'eatStart') fromHead = e.victim.eaten.fromHead; if (e.type === 'eaten') eatenEvt = true; });
      w.events.length = 0;
      if (eatenEvt) break;
    }
    check(P.alive, end + ': player survives touching a regular snake');
    check(eatenEvt, end + ': regular snake was eaten');
    check(P.mass > before + 15, end + ': player grew (' + before.toFixed(1) + ' -> ' + P.mass.toFixed(1) + ')');
    check(fromHead === (end === 'head'), end + ': swallowed from the ' + end + '-end (fromHead=' + fromHead + ')');
  });
})();

// ------------------------------------------------------------ 3. eggs
section('3. Eggs grow the snake; golden eggs give a shield');
(function () {
  var w = newWorld(3), P = w.player;
  P.shield = 0;
  var m0 = P.mass;
  w.eggs = [];
  w.spawnEgg(P.x + 5, P.y, 1, false);
  step(w, 1 / 60);
  check(P.mass > m0, 'normal egg grows snake');
  m0 = P.mass;
  w.spawnEgg(P.x + 5, P.y, CFG.GOLD_MASS, true);
  step(w, 1 / 60);
  check(P.mass > m0 + 5, 'golden egg gives bonus growth');
  check(P.shield > 3, 'golden egg gives a shield (' + P.shield.toFixed(1) + 's)');
  // legless grows a bit more than legged
  var a = newWorld(3, { legged: true }), b = newWorld(3, { legged: false });
  [a, b].forEach(function (x) { x.player.shield = 0; x.eggs = []; x.spawnEgg(x.player.x + 3, x.player.y, 3, false); step(x, 1 / 60); });
  check(b.player.mass > a.player.mass, 'legless snake grows more from eggs than a legged one');
})();

// ------------------------------------------------------------ 4. King kills, dynamic crown
section('4. The King eats the player; the crown moves to whoever is biggest');
(function () {
  var w = newWorld(4), P = w.player; P.shield = 0;
  var K = w.king;
  K.x = P.x + 40; K.y = P.y; K.segs.forEach(function (s) { s.x = K.x; s.y = K.y; });
  var died = null;
  for (var i = 0; i < 30 && !died; i++) {
    w.update(1 / 30, null);
    w.events.forEach(function (e) { if (e.type === 'playerDied') died = e; });
    w.events.length = 0;
  }
  check(!!died, 'player dies when touching the King');
  check(died && died.byKing && !died.byBoss, 'death is credited to the King');
  check(w.match.stars === 1, 'bonus point awarded on death (' + w.match.stars + ')');

  // crown transfer to the player when bigger
  var w2 = newWorld(4), P2 = w2.player;
  P2.mass = w2.king.mass * 1.2;
  var old = w2.king;
  w2.kingTimer = 0; step(w2, 1 / 60);
  check(w2.king === P2 && P2.isKing && !old.isKing, 'crown transfers to the player when they become the biggest');
  // ...and back
  P2.mass = 12;
  w2.kingTimer = 0; step(w2, 1 / 60);
  check(w2.king !== P2 && !P2.isKing, 'crown moves away from the player when someone else is bigger');
})();

// ------------------------------------------------------------ 5. revive limit = 29
section('5. Revives: max 29, bonus point only while revives remain');
(function () {
  var w = newWorld(5);
  var revives = 0, deaths = 0;
  for (var round = 0; round < 40; round++) {
    var P = w.player;
    if (!P || !P.alive) break;
    P.shield = 0;
    // kill via the King
    var K = w.king; if (K === P) { P.mass = 5; w.kingTimer = 0; step(w, 1 / 60); K = w.king; }
    K.x = P.x; K.y = P.y; K.segs.forEach(function (s) { s.x = K.x; s.y = K.y; });
    step(w, 1 / 30);
    deaths++;
    if (w.player.alive) { check(false, 'player should have died in round ' + round); break; }
    var m = w.match;
    if (m.over) break;
    check(w.revive(), 'revive #' + (round + 1) + ' allowed');
    revives++;
  }
  m = w.match;
  check(revives === CFG.MAX_REVIVES, 'exactly ' + CFG.MAX_REVIVES + ' revives were possible (got ' + revives + ')');
  check(deaths === CFG.MAX_REVIVES + 1, 'the 30th death ends the run (' + deaths + ' deaths)');
  check(m.over, 'match is over after the last revive is used and the player dies again');
  check(m.stars === CFG.MAX_REVIVES, 'bonus points only for deaths that could revive: ' + m.stars);
  check(!w.revive(), 'no 30th revive');
  check(m.revivesUsed === CFG.MAX_REVIVES, 'revivesUsed = ' + m.revivesUsed);
})();

// ------------------------------------------------------------ 6. Boss + multiplier rules
section('6. Boss: out-grow it to defeat it; multiplier lost to a snake, kept when the Boss gets you');
function readyBoss(seed) {
  var w = newWorld(seed), P = w.player;
  P.shield = 0; P.mass = CFG.BOSSES[0].trigger + 5; P.radius = U.radiusFor(P.mass);
  var spawned = false;
  for (var i = 0; i < 400 && !spawned; i++) {
    w.update(1 / 30, null);
    w.events.forEach(function (e) { if (e.type === 'bossSpawn') spawned = true; });
    w.events.length = 0;
  }
  return { w: w, spawned: spawned };
}
(function () {
  var r = readyBoss(6), w = r.w;
  check(r.spawned, 'Boss appears once the player reaches the trigger size');
  check(w.boss && w.boss.isBoss, 'boss exists');
  var B = w.boss, P = w.player;

  // (a) too small: boss eats the player, multiplier survives
  w.match.multiplier = 3;
  P.shield = 0; P.mass = B.mass - 30; // smaller
  B.x = P.x; B.y = P.y; B.segs.forEach(function (s) { s.x = B.x; s.y = B.y; });
  var died = null;
  w.update(1 / 30, null);
  w.events.forEach(function (e) { if (e.type === 'playerDied') died = e; });
  w.events.length = 0;
  check(!!died && died.byBoss, 'smaller player is eaten by the Boss');
  check(w.match.multiplier === 3, 'multiplier is KEPT when the Boss eats you (x' + w.match.multiplier + ')');
  check(w.match.stars === 1, 'Boss death also gives a bonus point');
  w.revive();
  check(w.match.multiplier === 3, 'multiplier still there after reviving');

  // (b) a snake (King) eats the player: multiplier lost
  var P2 = w.player; P2.shield = 0;
  var K = w.king; if (K === P2) { P2.mass = 5; w.kingTimer = 0; step(w, 1 / 60); K = w.king; }
  K.x = P2.x; K.y = P2.y; K.segs.forEach(function (s) { s.x = K.x; s.y = K.y; });
  died = null;
  w.update(1 / 30, null);
  w.events.forEach(function (e) { if (e.type === 'playerDied') died = e; });
  w.events.length = 0;
  check(!!died && !died.byBoss, 'King eats the player');
  check(w.match.multiplier === 1 && died.lostMultiplier, 'multiplier is LOST when a snake eats you');
})();
(function () {
  // (c) big enough: player defeats the boss, gets the multiplier
  var r = readyBoss(7), w = r.w, B = w.boss, P = w.player;
  P.shield = 0; P.mass = B.mass + 5;
  B.x = P.x + 10; B.y = P.y; B.segs.forEach(function (s) { s.x = B.x; s.y = B.y; });
  var defeated = null, done = false;
  for (var i = 0; i < 400 && !done; i++) {
    w.update(1 / 30, null);
    w.events.forEach(function (e) { if (e.type === 'bossDefeated') defeated = e; if (e.type === 'eaten' && e.victim.isBoss) done = true; });
    w.events.length = 0;
  }
  check(P.alive, 'player survives defeating the Boss');
  check(!!defeated, 'Boss defeated when player is bigger or equal');
  check(w.match.multiplier === 2 && w.match.bossesDefeated === 1, 'multiplier bonus awarded (x' + w.match.multiplier + ')');
  check(done && !w.boss, 'Boss is gone');
  // equal size counts as a win
  var r2 = readyBoss(8), w2 = r2.w, B2 = w2.boss, P2 = w2.player;
  P2.shield = 0; P2.mass = B2.mass;
  B2.x = P2.x + 10; B2.y = P2.y; B2.segs.forEach(function (s) { s.x = B2.x; s.y = B2.y; });
  var d2 = false;
  w2.update(1 / 30, null); w2.events.forEach(function (e) { if (e.type === 'bossDefeated') d2 = true; });
  check(d2, 'equal size is enough to defeat the Boss');
})();

// ------------------------------------------------------------ 7. long bot runs
section('7. Bot plays 3 full matches (9 game-minutes each): no crashes, sensible pacing');
[11, 12, 13].forEach(function (seed) {
  var w = newWorld(seed), dt = 1 / 30, log = { boss: [], deaths: 0, defeats: 0, revives: 0, crown: 0, firstBoss: null, reached: {} };
  var ok = true, frames = 9 * 60 * 30;
  for (var f = 0; f < frames && ok; f++) {
    var P = w.player;
    if (P && !P.alive && !w.match.over) { w.revive(); log.revives++; }
    if (w.match.over) break;
    w.update(dt, botSteer(w));
    w.events.forEach(function (e) {
      if (e.type === 'bossSpawn') { log.boss.push(e.level); if (log.firstBoss === null) log.firstBoss = w.match.time; }
      if (e.type === 'playerDied') log.deaths++;
      if (e.type === 'bossDefeated') log.defeats++;
      if (e.type === 'crown') log.crown++;
    });
    w.events.length = 0;
    if (f % 30 === 0) ok = sanity(w, 'seed ' + seed + ' t=' + (f / 30).toFixed(0));
  }
  var m = w.match, me = w.player;
  console.log('  seed', seed, '| time', m.time.toFixed(0) + 's', '| size', me && me.alive ? me.mass.toFixed(0) : '(dead)', '| best', m.bestMass.toFixed(0),
    '| score', Math.floor(m.score), '| x' + m.multiplier, '| bosses defeated', m.bossesDefeated, '| deaths', log.deaths,
    '| first boss at', log.firstBoss === null ? 'never' : log.firstBoss.toFixed(0) + 's', '| crown changes', log.crown,
    '| AI', w.snakes.filter(function (s) { return !s.isPlayer && !s.isBoss; }).length, '| eggs', w.eggs.length);
  check(ok, 'world stays sane');
  check(log.firstBoss !== null, 'a boss showed up within 9 minutes');
});

// ------------------------------------------------------------ 8. Brave mode
section('8. Brave mode: a much bigger ordinary snake CAN eat you (and you lose the multiplier)');
(function () {
  var w = newWorld(21, { difficulty: 'brave' }), P = w.player; P.shield = 0;
  w.match.multiplier = 2;
  var K = w.king;
  // make a big non-king snake: make it bigger than the King, then put the crown elsewhere? simpler: use the King-free check
  var big = w.snakes.filter(function (s) { return !s.isPlayer && !s.isKing; })[0];
  big.mass = Math.max(P.mass * 2, 30); big.radius = U.radiusFor(big.mass);
  K.mass = Math.max(K.mass, big.mass * 1.5);
  big.x = P.x; big.y = P.y; big.segs.forEach(function (s) { s.x = big.x; s.y = big.y; });
  var died = null;
  w.update(1 / 30, null);
  w.events.forEach(function (e) { if (e.type === 'playerDied') died = e; });
  check(!!died && !died.byKing && !died.byBoss, 'big regular snake eats the player in Brave mode');
  check(w.match.multiplier === 1, 'multiplier lost to a regular snake');
  var w2 = newWorld(21, { difficulty: 'easy' }), P2 = w2.player; P2.shield = 0;
  var big2 = w2.snakes.filter(function (s) { return !s.isPlayer && !s.isKing; })[0];
  big2.mass = 60; big2.x = P2.x; big2.y = P2.y; big2.segs.forEach(function (s) { s.x = big2.x; s.y = big2.y; });
  w2.king.mass = 500;
  var died2 = false;
  w2.update(1 / 30, null);
  w2.events.forEach(function (e) { if (e.type === 'playerDied') died2 = true; });
  check(!died2 && P2.alive, 'Easy mode: regular snakes never hurt you');
})();

console.log('\n' + (failures ? failures + ' CHECK(S) FAILED' : 'ALL CHECKS PASSED'));
process.exit(failures ? 1 : 0);
