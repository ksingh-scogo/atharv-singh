/* Network test: starts the real game server and connects real clients (the same net.js and mirror.js code the
   browser uses) to check joining, names, seeing friends, eating, boxes, dying, reviving, leaving, safety,
   and that dozens of players at once are fine.   Run:  node tests/net.js        (no browser needed) */
'use strict';
var http = require('http');
var path = require('path');

var PORT = 32000 + Math.floor(Math.random() * 2000);
process.env.PORT = String(PORT);
var srv = require('../server/server.js');             // starts listening, loads SC (config, util, skins, world)
['mirror.js', 'net.js'].forEach(function (f) { require(path.join('..', 'js', f)); });
var SC = globalThis.SC, CFG = SC.CFG, U = SC.util;
var arena = srv.arena, world = arena.world;
var URL = 'ws://127.0.0.1:' + PORT + '/ws';

var failures = 0;
function check(c, msg) { if (!c) { failures++; console.log('  FAIL: ' + msg); } }
function section(t) { console.log('\n' + t); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
async function until(fn, ms, label) {
  var t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(15); }
  return false;
}
function get(p, headers) {
  return new Promise(function (resolve) {
    http.get({ host: '127.0.0.1', port: PORT, path: p, headers: headers || {} }, function (res) {
      var chunks = []; res.on('data', function (d) { chunks.push(d); });
      res.on('end', function () { resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }); });
    }).on('error', function () { resolve({ status: 0, headers: {}, body: Buffer.alloc(0) }); });
  });
}

// a player: real client code + a little loop that smooths the picture and steers
function player(name, opts) {
  opts = opts || {};
  var net = SC.createNet({ url: URL });
  var p = { net: net, name: name, mirror: net.mirror, steer: opts.steer == null ? 0 : opts.steer, bytes: 0, snaps: 0, timer: null };
  p.start = function () {
    p.timer = setInterval(function () {
      net.mirror.update(0.016);
      if (p.steer != null) net.input(typeof p.steer === 'function' ? p.steer() : p.steer);
    }, 16);
  };
  p.join = function () {
    return new Promise(function (resolve) {
      net.connect(function (ok) {
        if (!ok) return resolve(false);
        var ws = net._ws, orig = ws.onmessage;
        ws.onmessage = function (ev) { p.bytes += ev.data.length; var m; try { m = JSON.parse(ev.data); } catch (e) { m = {}; } if (m.t === 's') p.snaps++; orig(ev); };
        net.join({ name: name, skin: opts.skin || 'leaf', legged: !!opts.legged, difficulty: opts.difficulty || 'easy' }, function (ok2) { resolve(ok2); });
      });
    });
  };
  p.stop = function () { clearInterval(p.timer); net.leave(); };
  p.events = function (type) { return p.mirror.events.filter(function (e) { return e.type === type; }); };
  return p;
}
function serverSnake(p) { var slot = world.slotById[p.mirror.localId]; return slot && slot.snake; }

(async function main() {
  await until(function () { return srv.server.listening; }, 3000);

  // ------------------------------------------------------------ 1. the server hands out only the game
  section('1. The web server');
  var r = await get('/');
  check(r.status === 200 && /text\/html/.test(r.headers['content-type']) && r.body.toString().indexOf("Atharv's Snake Clash") >= 0, 'serves the game page');
  r = await get('/', { 'accept-encoding': 'gzip' });
  check(r.headers['content-encoding'] === 'gzip' && r.body.length < 20000, 'compresses it (' + r.body.length + ' bytes)');
  var etag = r.headers.etag; r = await get('/', { 'if-none-match': etag });
  check(r.status === 304, 'answers "not modified" for a repeat visit');
  check((await get('/js/world.js')).status === 200 && (await get('/css/style.css')).status === 200, 'serves the scripts and styles');
  ['/server/arena.js', '/package.json', '/tests/net.js', '/.claude/settings.json', '/node_modules/ws/package.json', '/js/../package.json', '/%2e%2e/package.json', '/js/%2e%2e/server/arena.js'].forEach(function (p) {});
  var blocked = true;
  for (var bp of ['/server/arena.js', '/package.json', '/tests/net.js', '/.claude/settings.json', '/node_modules/ws/package.json', '/js/../package.json', '/%2e%2e/package.json', '/js/%2e%2e/server/arena.js', '/README.md']) {
    var br = await get(bp); if (br.status !== 404) { blocked = false; console.log('    exposed: ' + bp + ' -> ' + br.status); }
  }
  check(blocked, 'never serves server code, tests, settings, node_modules or the readme');
  r = await get('/healthz'); check(r.status === 200 && JSON.parse(r.body).ok === true, '/healthz works');

  // ------------------------------------------------------------ 2. joining
  section('2. Friends join (no limit) and are told apart by name');
  var a = player('Ava'), b = player('Ava'), c = player('Ben', { legged: true });
  check(await a.join() && await b.join() && await c.join(), 'three players joined');
  [a, b, c].forEach(function (p) { p.start(); });
  check(a.mirror.myName === 'Ava' && b.mirror.myName === 'Ava 2' && c.mirror.myName === 'Ben', 'two Avas become "Ava" and "Ava 2": ' + [a, b, c].map(function (p) { return p.mirror.myName; }).join(', '));
  check(world.players.length === 3, 'the arena has 3 players');
  await until(function () { return a.mirror.snapCount > 8 && a.mirror.lbData; }, 3000);
  check(!!a.mirror.player && a.mirror.player.alive && a.mirror.player.isMe, 'my snake exists on my screen and is marked as mine');

  // ------------------------------------------------------------ 3. seeing each other
  section('3. Players see each other and the same world');
  // park everybody near each other so they are in range
  [a, b, c].forEach(function (p, i) { var s = serverSnake(p); s.x = 200 + i * 150; s.y = 100; s.segs.forEach(function (sg) { sg.x = s.x; sg.y = s.y; }); s.shield = 99; });
  await sleep(500);
  var seenByA = a.mirror.snakes.filter(function (s) { return s.isPlayer && !s.isMe; }).map(function (s) { return s.name; }).sort();
  check(seenByA.join(',') === 'Ava 2,Ben', 'A sees the friends "Ava 2" and "Ben" with their names (' + seenByA.join(',') + ')');
  var ben = a.mirror.snakes.filter(function (s) { return s.name === 'Ben'; })[0];
  check(ben && ben.hasLegs() && !ben.isMe, "A sees Ben's legs");
  var lb = a.mirror.leaderboard(null, 5);
  check(lb.rows.length >= 3 && lb.players === 3 && lb.rows.some(function (r) { return r.human; }) || lb.rank > 5, 'the leaderboard arrives (players: ' + lb.players + ', my rank ' + lb.rank + ' of ' + lb.total + ')');
  check(a.mirror.mapDots.length >= 25 && a.mirror.eggs.length > 20, 'minimap dots and eggs arrive (' + a.mirror.mapDots.length + ' dots, ' + a.mirror.eggs.length + ' eggs near me)');
  check(a.mirror.king && a.mirror.king.isKing !== undefined, 'the King is known');

  // movement and body shape match the server
  a.steer = 0; await sleep(1500);
  var ss = serverSnake(a), ms = a.mirror.player;
  var dHead = Math.hypot(ss.x - ms.x, ss.y - ms.y);
  var dev = 0; for (var i = 0; i < Math.min(ss.segs.length, ms.segs.length); i++) dev = Math.max(dev, Math.hypot(ss.segs[i].x - ms.segs[i].x, ss.segs[i].y - ms.segs[i].y));
  check(dHead < 60, "my head on screen is close to the server's (" + dHead.toFixed(0) + ' units off)');
  check(dev < 80 && ms.segs.length === ss.segs.length, 'body shape matches the server (worst segment ' + dev.toFixed(0) + ' units off, ' + ms.segs.length + '/' + ss.segs.length + ' segments)');
  var dx0 = ms.x; await sleep(600);
  check(Math.abs(a.mirror.player.angle) < 0.4, 'steering east turned my snake east');

  // ------------------------------------------------------------ 4. a player far away is not sent in detail
  section('4. Interest management: far-away snakes are not sent in detail');
  var far = player('Zed'); await far.join(); far.start();
  var zs = serverSnake(far); zs.x = -1700; zs.y = -900; zs.segs.forEach(function (sg) { sg.x = zs.x; sg.y = zs.y; }); zs.shield = 99;
  await sleep(700);
  var zOnA = a.mirror.snakes.some(function (s) { return s.name === 'Zed'; });
  check(!zOnA, 'A (far from Zed) does not get Zed\'s snake');
  check(a.mirror.mapDots.some(function (d) { return d[3] === zs.id; }), "...but Zed is on A's minimap");
  check(far.mirror.snakes.length < world.snakes.length, 'Zed only gets the snakes near him (' + far.mirror.snakes.length + ' of ' + world.snakes.length + ')');

  // ------------------------------------------------------------ 5. eating an egg, opening a box
  section('5. Eggs and mystery boxes over the wire');
  var sa = serverSnake(a); sa.shield = 0;
  var score0 = a.mirror.match.score;
  world.spawnEgg(sa.x + 2, sa.y, 3, false);
  await until(function () { return a.events('egg').length > 0; }, 1500);
  check(a.events('egg').length > 0, 'I get my "egg eaten" event');
  check([a, b, c, far].every(function (p) { return p.events('egg').every(function (e) { return e.pid === p.mirror.localId; }); }), "nobody is sent another player's egg events");
  await sleep(200);
  check(a.mirror.match.score > score0, 'my score went up (' + score0 + ' -> ' + a.mirror.match.score + ')');
  a.mirror.events.length = 0; c.mirror.events.length = 0; far.mirror.events.length = 0;
  var bx = world.spawnBox(); bx.x = sa.x; bx.y = sa.y;
  await until(function () { return a.events('boxOpen').length > 0; }, 1500);
  var bo = a.events('boxOpen')[0];
  check(bo && bo.pid === a.mirror.localId && CFG.BOX_EFFECTS.some(function (e) { return e.id === bo.eff; }), 'I am told which box effect I got: ' + (bo && bo.eff));
  check(c.events('boxOpen').length > 0, 'a friend standing nearby sees it too');
  check(far.events('boxOpen').length === 0, 'someone far away does not');
  world.applyEffect(sa, 'speed'); await sleep(250);
  check(a.mirror.player.fx.speed > 5 && a.mirror.player.speedNow !== undefined, 'my "Speed Boost" timer reaches my screen (' + a.mirror.player.fx.speed.toFixed(1) + ' s left)');
  check(c.mirror.snakes.filter(function (s) { return s.name === 'Ava'; })[0].fx.speed > 0, 'and my friends see the speed effect on me');
  world.applyEffect(sa, 'legs'); await sleep(250);
  check(c.mirror.snakes.filter(function (s) { return s.name === 'Ava'; })[0].hasLegs(), 'friends see my legs from a Crawly Legs box');
  sa.fx.speed = sa.fx.legs = 0;

  // ------------------------------------------------------------ 6. dying and reviving
  section('6. Dying, bonus point, reviving');
  sa.shield = 0; sa.mass = 60; sa.radius = U.radiusFor(60);
  var K = world.king; if (K === sa) { K = world.snakes.filter(function (s) { return !s.isPlayer; })[0]; }
  K.mass = 200; K.ai.cool = 999; K.x = sa.x; K.y = sa.y; K.segs.forEach(function (sg) { sg.x = K.x; sg.y = K.y; }); world.updateCrown(true);
  K.isKing = true; world.king = K;
  a.mirror.events.length = 0;
  await until(function () { return a.events('playerDied').length > 0; }, 2000);
  var died = a.events('playerDied')[0];
  check(died && died.pid === a.mirror.localId && died.byKing && died.canRevive && died.gotStar && died.segs.length > 3, 'I am told I was eaten by the King (and get a bonus point)');
  check(a.mirror.deathInfo && a.mirror.deathInfo.mass > 50, 'the death info is kept for my death screen');
  check(b.events('playerDied').length === 0, 'my friend is not told');
  await sleep(300);
  check(a.mirror.state === 'dead' && !a.mirror.player && a.mirror.match.stars === 1, 'my screen knows I am down, with 1 bonus point');
  a.net.revive(); await until(function () { return a.events('revived').length > 0 && a.mirror.player; }, 2000);
  check(!!a.mirror.player && a.mirror.player.alive && a.mirror.match.revivesUsed === 1 && a.mirror.player.shield > 1, 'revived with a bubble; 1 revive used');
  K.ai.cool = 5; K.x = -1500; K.y = 1500; K.segs.forEach(function (sg) { sg.x = K.x; sg.y = K.y; });

  // a friend becomes King and can eat friends
  var sb = serverSnake(b), sc = serverSnake(c); sb.shield = 0; sc.shield = 0;
  sb.mass = 500; sb.radius = U.radiusFor(500); sc.x = sb.x; sc.y = sb.y; sc.segs.forEach(function (sg) { sg.x = sb.x; sg.y = sb.y; });
  c.mirror.events.length = 0; world.kingTimer = 0;
  await until(function () { return c.events('playerDied').length > 0; }, 2500);
  var cd = c.events('playerDied')[0];
  check(cd && cd.byFriend && cd.byKing && cd.byName === 'Ava 2', 'Ben was eaten by his friend the King "Ava 2"');
  c.net.revive();

  // ------------------------------------------------------------ 7. stepping away, finishing, leaving
  section('7. Stepping away, finishing a run, leaving');
  var before = serverSnake(a); var x0 = before.x, y0 = before.y;
  a.steer = 1; a.net.afk(true); await sleep(500);
  check(Math.hypot(before.x - x0, before.y - y0) < 5 && before.shield > 0, 'a player with the menu open stands still, protected');
  a.net.afk(false); await sleep(400);
  check(Math.hypot(before.x - x0, before.y - y0) > 20, 'and moves again afterwards');
  b.mirror.events.length = 0;
  a.net.finish();
  await until(function () { return b.events('playerLeft').length > 0; }, 1500);
  check(b.events('playerLeft').some(function (e) { return e.name === 'Ava'; }) && !world.slotById[a.mirror.localId], 'finishing a run removes the player; friends are told');
  b.mirror.events.length = 0;
  c.stop(); await until(function () { return b.events('playerLeft').length > 0; }, 2000);
  check(b.events('playerLeft').some(function (e) { return e.name === 'Ben' || e.name === 'Ben'; }), 'closing the page removes the player too');
  var onlineLeft = world.players.length;
  check(onlineLeft === 2, 'the arena now has 2 players (' + onlineLeft + ')');

  // ------------------------------------------------------------ 8. nasty input
  section('8. Bad messages do not hurt');
  var ws = new WebSocket(URL);
  await new Promise(function (r) { ws.onopen = r; });
  ['not json', '{"t":5}', '{"t":"join","name":{"x":1},"skin":99,"legged":"yes","difficulty":[]}', '{"t":"in","a":"up"}', '{"t":"in","a":1e999}', '{"t":"nope"}', 'null', '[]', '{"t":"revive"}'].forEach(function (m) { ws.send(m); });
  await sleep(300);
  var weird = world.players.filter(function (p) { return p.name === 'Player'; });
  check(weird.length === 1 && weird[0].profile.skin === 'sapphire' && weird[0].profile.difficulty === 'easy', 'an odd join becomes a safe "Player" with default look');
  ws.send('x'.repeat(5000)); await sleep(300);
  check(ws.readyState !== 1, 'a huge message closes that connection');
  check((await get('/healthz')).status === 200, 'the server is still fine');
  var longName = player('<script>alert(1)</script>'.repeat(3)); await longName.join();
  check(!/[<>]/.test(longName.mirror.myName) && Array.from(longName.mirror.myName).length <= CFG.NAME_MAX, 'markup in a name is removed and the name is shortened (' + longName.mirror.myName + ')');
  longName.stop();

  // ------------------------------------------------------------ 9. many players
  section('9. A crowd: 80 players at once');
  var crowd = [];
  for (var k = 0; k < 80; k++) crowd.push(player('Kid' + k, { steer: function () { return Math.random() * 6.28 - 3.14; } }));
  var joined = 0;
  for (k = 0; k < crowd.length; k++) { if (await crowd[k].join()) joined++; crowd[k].start(); }
  check(joined === 80, 'all 80 joined (no player limit) - arena has ' + world.players.length + ' players');
  crowd.forEach(function (p) { p.bytes = 0; p.snaps = 0; });
  arena.stats.msPerTick = 0;
  var T0 = Date.now(); await sleep(6000); var secs = (Date.now() - T0) / 1000;
  var avgKB = crowd.reduce(function (s, p) { return s + p.bytes; }, 0) / crowd.length / secs / 1024;
  var minSnaps = Math.min.apply(null, crowd.map(function (p) { return p.snaps; })) / secs;
  console.log('  server work per tick: ' + arena.stats.msPerTick.toFixed(2) + ' ms (budget ' + (1000 / CFG.TICK_HZ).toFixed(0) + ' ms); each player receives ' + avgKB.toFixed(1) + ' KB/s, ' + minSnaps.toFixed(1) + ' updates/s');
  check(arena.stats.msPerTick < 1000 / CFG.TICK_HZ * 0.6, 'the server keeps up with 80 players');
  check(minSnaps > CFG.SNAP_HZ * 0.7, 'every player gets about ' + CFG.SNAP_HZ + ' updates a second (slowest: ' + minSnaps.toFixed(1) + ')');
  check(avgKB < 60, 'each player downloads under 60 KB/s (' + avgKB.toFixed(1) + ')');
  var sane = world.snakes.every(function (s) { return isFinite(s.x) && isFinite(s.y) && isFinite(s.mass) && s.x * s.x + s.y * s.y < (CFG.ARENA_R + 5) * (CFG.ARENA_R + 5); });
  check(sane, 'every snake is still inside the arena with sane numbers');
  var seesOthers = crowd.filter(function (p) { return p.mirror.snakes.some(function (s) { return s.isPlayer && !s.isMe; }); }).length;
  console.log('  ' + seesOthers + ' of 80 currently see at least one friend nearby');

  // the crowd leaves; the arena goes back to sleep when empty
  crowd.forEach(function (p) { p.stop(); }); a.stop(); b.stop(); far.stop();
  await until(function () { return world.players.length === 0; }, 3000);
  check(world.players.length === 0, 'when everyone has left the arena is empty');

  console.log('\n' + (failures ? failures + ' CHECK(S) FAILED' : 'ALL NETWORK CHECKS PASSED'));
  process.exit(failures ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
