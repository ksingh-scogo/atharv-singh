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
      w.events.forEach(function (e) { if (e.type === 'eatStart') fromHead = w.snakeById(e.victimId).eaten.fromHead; if (e.type === 'eaten') eatenEvt = true; });
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
    w.events.forEach(function (e) { if (e.type === 'bossDefeated') defeated = e; if (e.type === 'eaten' && e.vBoss) done = true; });
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


// ------------------------------------------------------------ 9. many players in one arena
section('9. Many human players share one arena (no limit)');
function bareWorld(seed) {
  U.rand = U.mulberry32(seed);
  var w = new SC.World();
  w.startAttract();
  return w;
}
function profile(name, extra) { return Object.assign({ name: name, skin: 'leaf', legged: false, difficulty: 'easy' }, extra || {}); }
function stackOn(a, b) { a.x = b.x; a.y = b.y; a.segs.forEach(function (s) { s.x = a.x; s.y = a.y; }); }
(function () {
  var w = bareWorld(91);
  var a = w.addPlayer('a', profile('Ava')), b = w.addPlayer('b', profile('Ava')), c = w.addPlayer('c', profile('ava'));
  check(a.name === 'Ava' && b.name === 'Ava 2' && c.name === 'ava 3', 'same names get a number so snakes can be told apart: ' + [a.name, b.name, c.name].join(' | '));
  check(U.cleanName('  <b>Zoe</b>  ') === 'bZoe/b' && U.cleanName('') === 'Player' && Array.from(U.cleanName('x'.repeat(50))).length === CFG.NAME_MAX, 'names are cleaned and capped at ' + CFG.NAME_MAX);

  // each has their own match
  [a, b, c].forEach(function (p) { p.snake.shield = 0; });
  check(a.match !== b.match && a.match.revivesUsed === 0 && b.match.stars === 0, 'every player has their own match (score, revives, bonus points)');

  // friends slide past each other
  stackOn(b.snake, a.snake); a.snake.mass = 30; b.snake.mass = 20;
  var ma = a.snake.mass, mb = b.snake.mass;
  for (var t = 0; t < 10; t++) step(w, 1 / 30);
  check(a.snake.alive && b.snake.alive && a.snake.mass >= ma && b.snake.mass >= mb, 'friends (not King) pass through each other without harm');

  // the King kills, even when the King is a friend
  var K = w.king;                                  // the computer King
  K.mass = 40; K.x = 1500; K.y = 1500; K.segs.forEach(function (sg) { sg.x = 1500; sg.y = 1500; }); K.ai.cool = 999;
  a.snake.mass = 400; a.snake.radius = U.radiusFor(400); w.kingTimer = 0; step(w, 1 / 30);
  check(a.snake.isKing && !K.isKing, 'a friend can become King');
  stackOn(b.snake, a.snake); b.snake.shield = 0; a.snake.shield = 0;
  var died = null;
  for (t = 0; t < 5 && !died; t++) { w.update(1 / 30, null); w.events.forEach(function (e) { if (e.type === 'playerDied') died = e; }); w.events.length = 0; }
  check(died && died.pid === 'b' && died.byFriend && died.byKing, 'a friend who is King eats other players on contact');
  check(a.snake.alive && a.match.stars === 0 && b.match.stars === 1 && c.match.stars === 0, 'only the eaten player gets the bonus point');
  check(w.revive('b') && b.snake.alive && b.match.revivesUsed === 1 && a.match.revivesUsed === 0, 'revives are counted per player');

  // leaving
  var eggs0 = w.eggs.length;
  w.removePlayer('c');
  check(!w.slotById.c && w.players.length === 2 && w.eggs.length > eggs0, 'a player who leaves is removed and their snake turns into eggs');
  step(w, 1 / 30);
  check(w.snakes.every(function (s) { return s.owner !== 'c'; }), "the leaver's snake is gone");

  // no player limit: 150 friends at once
  var big = bareWorld(92);
  for (var i = 0; i < 150; i++) big.addPlayer('p' + i, profile('Friend' + i));
  check(big.players.length === 150 && big.humans().length === 150, '150 players joined (no cap)');
  var t0 = Date.now();
  for (i = 0; i < 90; i++) { big.players.forEach(function (p) { big.setInput(p.id, Math.random() * 6.28 - 3.14); }); big.update(1 / 30); big.events.length = 0; }
  var ms = (Date.now() - t0) / 90;
  check(sanity(big, '150 players'), '150 players: world stays sane');
  check(big.snakes.filter(function (s) { return !s.isPlayer && !s.isBoss; }).length >= CFG.AI_COUNT, 'computer snakes keep topping up');
  console.log('  150 players + AI: ' + ms.toFixed(1) + ' ms per world update (budget ' + (1000 / CFG.TICK_HZ).toFixed(0) + ' ms)');
  check(ms < 1000 / CFG.TICK_HZ, 'a 150-player world updates within one server tick');
})();

(function () {
  // one shared Boss: any player can wake it; whoever beats it gets the multiplier
  var w = bareWorld(93);
  var a = w.addPlayer('a', profile('Ava')), b = w.addPlayer('b', profile('Ben'));
  a.snake.shield = b.snake.shield = 0;
  a.snake.mass = CFG.BOSSES[0].trigger + 5;
  var spawned = false;
  for (var t = 0; t < 400 && !spawned; t++) { w.update(1 / 30); w.events.forEach(function (e) { if (e.type === 'bossSpawn') spawned = true; }); w.events.length = 0; }
  check(spawned && w.boss, 'one player reaching the trigger size wakes the Boss for everyone');
  // Ben is small: the Boss is dangerous for Ben but not for big Ava
  check(SC.dangerFor(w.boss, b.snake, false) && !SC.dangerFor(w.boss, a.snake, false) === (a.snake.mass >= w.boss.mass), 'danger depends on each player\'s own size');
  a.snake.mass = w.boss.mass + 5; a.snake.radius = U.radiusFor(a.snake.mass);
  stackOn(w.boss, a.snake);
  var won = null;
  for (t = 0; t < 10 && !won; t++) { w.update(1 / 30); w.events.forEach(function (e) { if (e.type === 'bossDefeated') won = e; }); w.events.length = 0; }
  check(won && won.pid === 'a' && won.by === 'Ava', 'the player who beat the Boss gets the credit');
  check(a.match.multiplier === 2 && b.match.multiplier === 1 && w.bossLevel === 2, 'only the winner gets the multiplier; the arena moves on to Boss level 2');
})();

(function () {
  // Brave mode is a personal setting: it only affects the player who chose it
  var w = bareWorld(94);
  var a = w.addPlayer('a', profile('Ava', { difficulty: 'brave' })), b = w.addPlayer('b', profile('Ben'));
  a.snake.shield = b.snake.shield = 0;
  var big = w.snakes.filter(function (s) { return !s.isPlayer && !s.isKing; })[0];
  big.mass = 200; big.radius = U.radiusFor(200);
  w.king.mass = 300;
  check(w.isBigHunterFor(big, a.snake) && !w.isBigHunterFor(big, b.snake), 'a big computer snake is only dangerous to the Brave player');
  stackOn(a.snake, big); stackOn(b.snake, big);
  var deaths = [];
  w.update(1 / 30); w.events.forEach(function (e) { if (e.type === 'playerDied') deaths.push(e.pid); });
  check(deaths.length === 1 && deaths[0] === 'a', 'the Brave player is eaten, the Easy player is not (' + deaths.join(',') + ')');
})();

(function () {
  var w = bareWorld(95), a = w.addPlayer('a', profile('Ava')), b = w.addPlayer('b', profile('Ben'));
  var lb = w.leaderboard('a', 5);
  check(lb.rows.length >= 5 && lb.players === 2 && lb.rows.some(function (r) { return r.human; }) || lb.rank > 5, 'leaderboard lists players and computer snakes');
  check(w.leaderboard('b', 3).rank > 0 && w.leaderboard('a', 3).rank > 0, 'every player gets their own rank');
  // restart gives a fresh match
  a.match.score = 99; a.match.revivesUsed = 7;
  w.restartPlayer('a', profile('Ava'));
  check(a.match.score === 0 && a.match.revivesUsed === 0 && a.snake.alive, '"play again" starts a fresh match with all 29 revives');
})();

// ------------------------------------------------------------ 10. mystery boxes
section('10. Mystery boxes: 4 power-ups, 4 power-downs');
(function () {
  var effects = CFG.BOX_EFFECTS;
  check(effects.length === 8 && effects.filter(function (e) { return e.good; }).length === 4 && effects.filter(function (e) { return !e.good; }).length === 4, '8 effects: 4 good, 4 bad (' + effects.map(function (e) { return e.id; }).join(', ') + ')');

  // boxes appear regularly and disappear if nobody opens them
  var w = bareWorld(101), P = w.addPlayer('a', profile('Ava', { legged: false })).snake;
  P.shield = 99;
  // no computer snakes in this one, so nobody but the (parked) player could open a box
  w.snakes = w.snakes.filter(function (s) { return s.isPlayer; }); w.aiTarget = function () { return 0; }; w.king = null; w.updateCrown(true);
  var seen = {}, gone = 0, maxAlive = 0;
  w.boxes = [];
  for (var t = 0; t < 30 * 130; t++) {
    P.x = P.segs[0].x = 1999; P.y = P.segs[0].y = 0;                // parked far from the boxes (not in the way)
    w.update(1 / 30);
    w.events.forEach(function (e) { if (e.type === 'boxGone') gone++; });
    w.events.length = 0;
    w.boxes.forEach(function (b) { seen[b.id] = 1; });
    if (w.boxes.length > maxAlive) maxAlive = w.boxes.length;
  }
  var spawnedBoxes = Object.keys(seen).length;
  check(spawnedBoxes >= 15, 'boxes keep appearing: ' + spawnedBoxes + ' in 130 s (about one every ' + CFG.BOX_INTERVAL + ' s)');
  check(gone >= 8, 'boxes disappear when nobody opens them: ' + gone + ' vanished');
  check(maxAlive <= CFG.BOX_MAX, 'never more than ' + CFG.BOX_MAX + ' boxes at once (max seen ' + maxAlive + ')');
  var nearHuman = 0; // a good share appear within a short trip of a player
  var w2 = bareWorld(102), q = w2.addPlayer('a', profile('Ava')).snake; q.shield = 99;
  for (t = 0; t < 40; t++) { var bx = w2.spawnBox(); if (Math.hypot(bx.x - q.x, bx.y - q.y) < 1100) nearHuman++; }
  check(nearHuman >= 15, 'many boxes appear near players so they get found (' + nearHuman + ' of 40)');

  // opening one
  var w3 = bareWorld(103), A = w3.addPlayer('a', profile('Ava', { legged: false })).snake; A.shield = 99;
  var box = w3.spawnBox(); box.x = A.x; box.y = A.y;
  var opened = null; w3.update(1 / 30);
  w3.events.forEach(function (e) { if (e.type === 'boxOpen') opened = e; });
  check(opened && opened.pid === 'a' && effects.some(function (e) { return e.id === opened.eff; }) && w3.boxes.indexOf(box) < 0, 'a snake that reaches a box opens it and gets one of the effects (' + (opened && opened.eff) + ')');

  // curious computer snakes go and fetch boxes
  var w7 = bareWorld(105);
  w7.snakes = w7.snakes.filter(function (s) { return !s.isKing; }).slice(0, 1); w7.aiTarget = function () { return 1; }; w7.eggs = [];
  var seeker = w7.snakes[0]; seeker.ai.boxLover = true; seeker.ai.timid = false; seeker.x = 0; seeker.y = 0; seeker.angle = Math.PI;
  seeker.segs.forEach(function (sg) { sg.x = 0; sg.y = 0; });
  var far = w7.spawnBox(); far.x = 400; far.y = 0; far.life = 999; w7.boxTimer = 999; w7.king = null; w7.updateCrown(true);
  var fetched = false;
  for (t = 0; t < 30 * 8 && !fetched; t++) { w7.update(1 / 30); w7.events.forEach(function (e) { if (e.type === 'boxOpen' && e.sid === seeker.id) fetched = true; }); w7.events.length = 0; w7.eggs = []; }
  check(fetched, 'a curious computer snake turns around and fetches a box 400 units away');

  // computer snakes can open boxes too, but Bosses can't
  var w4 = bareWorld(104), ai = w4.snakes.filter(function (s) { return !s.isKing; })[0];
  var b4 = w4.spawnBox(); b4.x = ai.x; b4.y = ai.y; w4.boxTimer = 99;
  var aiOpened = null; w4.update(1 / 30); w4.events.forEach(function (e) { if (e.type === 'boxOpen') aiOpened = e; });
  check(aiOpened && aiOpened.sid === ai.id && aiOpened.pid === 0, 'computer snakes open boxes too');
  var boss = new SC.Snake({ name: 'B', skin: SC.skins.byId('ruby'), mass: 200, x: 500, y: 500, angle: 0, speed: 0, isBoss: true, bossLevel: 1 });
  w4.snakes.push(boss); var b5 = w4.spawnBox(); b5.x = 500; b5.y = 500; w4.boxTimer = 99;
  w4.update(1 / 30);
  check(w4.boxes.indexOf(b5) >= 0, 'a Boss cannot open a box');

  // the 8 effects, one by one
  function fresh(legged) { var ww = bareWorld(110), s = ww.addPlayer('a', profile('Ava', { legged: !!legged })).snake; s.shield = 99; s.mass = 100; s.radius = U.radiusFor(100); ww.king.ai.cool = 999; return { w: ww, s: s }; }
  var base = fresh(false), baseSpeed = base.s.speedNow();
  var f = fresh(false); f.w.applyEffect(f.s, 'speed');
  check(Math.abs(f.s.speedNow() / baseSpeed - CFG.FX_SPEED_MUL) < 1e-6, 'Speed Boost: x' + CFG.FX_SPEED_MUL + ' speed');
  f = fresh(false); f.w.applyEffect(f.s, 'slow');
  check(Math.abs(f.s.speedNow() / baseSpeed - CFG.FX_SLOW_MUL) < 1e-6, 'Slowpoke: x' + CFG.FX_SLOW_MUL + ' speed');
  f = fresh(false); f.w.applyEffect(f.s, 'speed'); f.w.applyEffect(f.s, 'slow');
  check(f.s.fx.speed === 0 && f.s.fx.slow > 0, 'speed boost and slowpoke cancel each other');
  f = fresh(false); var tr0 = f.s.turnRate(); f.w.applyEffect(f.s, 'legs');
  check(f.s.hasLegs() && !f.s.legged && f.s.speedNow() > baseSpeed && f.s.turnRate() > tr0, 'Crawly Legs: a legless snake grows legs, runs faster and turns tighter');
  f = fresh(false); var m0 = f.s.mass; f.w.applyEffect(f.s, 'grow');
  check(f.s.mass >= m0 * (1 + CFG.FX_GROW) - 1e-6, 'Mega Grow: +' + (CFG.FX_GROW * 100) + '% size (' + m0 + ' -> ' + f.s.mass.toFixed(0) + ')');
  f = fresh(false); m0 = f.s.mass; var eggs1 = f.w.eggs.length; f.w.applyEffect(f.s, 'shrink');
  check(Math.abs(f.s.mass - m0 * (1 - CFG.FX_SHRINK)) < 1e-6 && f.w.eggs.length > eggs1, 'Length Reducer: -' + (CFG.FX_SHRINK * 100) + '% size, the lost part becomes eggs');
  f = fresh(false); m0 = f.s.mass; eggs1 = f.w.eggs.length; f.w.applyEffect(f.s, 'blast');
  check(Math.abs(f.s.mass - m0 * (1 - CFG.FX_BLAST)) < 1e-6 && f.s.fx.stun > 0 && f.w.eggs.length > eggs1 && f.s.speedNow() < baseSpeed, 'Blast: -' + (CFG.FX_BLAST * 100) + '% size, eggs fly, brief stun');
  f = fresh(false); f.s.angle = 0; f.s.want = 0.6; f.w.applyEffect(f.s, 'dizzy'); f.w.move(f.s, 0.1);
  var g = fresh(false); g.s.angle = 0; g.s.want = 0.6; g.w.move(g.s, 0.1);
  check(g.s.angle > 0 && f.s.angle < 0, 'Dizzy: steering is flipped (normal turns ' + g.s.angle.toFixed(2) + ', dizzy turns ' + f.s.angle.toFixed(2) + ')');
  // Super Shine pulls eggs from further away
  f = fresh(false); f.w.eggs = []; var far = f.s.radius * 1.9 + 50;
  var egg1 = f.w.spawnEgg(f.s.x + far * 1.5, f.s.y, 1, false); var d0 = Math.hypot(egg1.x - f.s.x, egg1.y - f.s.y);
  f.w.updateEggs(0.1); var dPlain = Math.hypot(egg1.x - f.s.x, egg1.y - f.s.y);
  f.w.applyEffect(f.s, 'shine'); f.w.updateEggs(0.1); var dShine = Math.hypot(egg1.x - f.s.x, egg1.y - f.s.y);
  check(dPlain === d0 && dShine < d0, 'Super Shine: eggs are pulled in from twice as far');
  // can't shrink below the starting size
  f = fresh(false); f.s.mass = CFG.START_MASS + 1; f.w.applyEffect(f.s, 'blast');
  check(f.s.mass >= CFG.START_MASS, 'Length Reducer and Blast never go below the starting size');
  // effects wear off
  f = fresh(false); f.w.applyEffect(f.s, 'speed'); for (t = 0; t < 30 * 11; t++) f.w.move(f.s, 1 / 30);
  check(Math.abs(f.s.speedNow() - baseSpeed) < 1e-6, 'timed effects wear off');

  // roughly half good, half bad, and every effect shows up
  var counts = {}, good = 0, N = 4000, w6 = bareWorld(120), s6 = w6.addPlayer('a', profile('Ava')).snake;
  for (var i = 0; i < N; i++) { var bb = { id: i, x: 0, y: 0 }; w6.events.length = 0; w6.openBox(s6, bb); var ev = w6.events[0]; counts[ev.eff] = (counts[ev.eff] || 0) + 1; if (ev.good) good++; s6.mass = 100; }
  check(Object.keys(counts).length === 8 && Object.keys(counts).every(function (k) { return counts[k] > N / 8 * 0.8 && counts[k] < N / 8 * 1.2; }), 'all 8 effects come up about equally often: ' + JSON.stringify(counts));
  check(good > N * 0.46 && good < N * 0.54, 'about half are good (' + (good / N * 100).toFixed(0) + '%)');
})();

console.log('\n' + (failures ? failures + ' CHECK(S) FAILED' : 'ALL CHECKS PASSED'));
process.exit(failures ? 1 : 0);
