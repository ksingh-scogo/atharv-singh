/* Two real browsers (a desktop and a phone) play together on the real game server.
   Needs Playwright (dev only):   NODE_PATH=$(npm root -g) node tests/e2e-online.js
   Set SHOTS=/some/folder to also save screenshots.                                          */
'use strict';
var path = require('path');
var cp = require('child_process');
var http = require('http');
var { chromium } = require('playwright');

var ROOT = path.join(__dirname, '..');
var SHOTS = process.env.SHOTS || '';
var SMOKE_PORT = 34000 + Math.floor(Math.random() * 700);
var PORT = 35000 + Math.floor(Math.random() * 700);
var failures = 0;
function check(c, msg) { if (!c) { failures++; console.log('  FAIL: ' + msg); } else console.log('  ok: ' + msg); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function getJson(port, p) {
  return new Promise(function (resolve, reject) {
    http.get({ host: '127.0.0.1', port: port, path: p }, function (res) {
      var b = ''; res.on('data', function (d) { b += d; }); res.on('end', function () { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

(async function () {
  // ---- 1. start the server exactly the way a user would: npm start
  console.log('Starting the server with "npm start"');
  var proc = cp.spawn('npm', ['start'], { cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(SMOKE_PORT) }), stdio: ['ignore', 'pipe', 'pipe'] });
  var out = ''; proc.stdout.on('data', function (d) { out += d; }); proc.stderr.on('data', function (d) { out += d; });
  for (var i = 0; i < 100 && !/running/.test(out); i++) await sleep(100);
  check(/running/.test(out) && /localhost:/.test(out), 'npm start brings the server up and prints the address');
  check((await getJson(SMOKE_PORT, '/healthz')).ok === true, '/healthz answers');
  proc.kill('SIGTERM');

  // ---- 2. the real scenario: the server runs inside this test so we can place snakes and trigger things
  process.env.PORT = String(PORT);
  var srv = require('../server/server.js');
  var SC = globalThis.SC, CFG = SC.CFG, U = SC.util, arena = srv.arena, world = arena.world;
  for (i = 0; i < 50 && !srv.server.listening; i++) await sleep(50);

  var browser = await chromium.launch({ args: ['--no-sandbox'] });
  function watch(page) { var errs = []; page.on('console', function (m) { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); }); page.on('pageerror', function (e) { errs.push('PAGEERROR ' + e.message); }); return errs; }
  var skipTutorial = function () { try { localStorage.setItem('atharvs-snake-clash-v1', JSON.stringify({ seenHow: true })); } catch (e) { /* ok */ } };
  var ctxA = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  var ctxB = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  var A = await ctxA.newPage(), B = await ctxB.newPage();
  await A.addInitScript(skipTutorial); await B.addInitScript(skipTutorial);
  var errsA = watch(A), errsB = watch(B);
  var url = 'http://127.0.0.1:' + PORT + '/';
  var ev = function (page, fn, arg) { return page.evaluate(fn, arg); };
  var shot = async function (page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
  function snakeOf(name) { var s = world.players.filter(function (p) { return p.name === name; })[0]; return s && s.snake; }
  function place(s, x, y) { s.x = x; s.y = y; s.segs.forEach(function (sg) { sg.x = x; sg.y = y; }); }

  console.log('\nFriend 1 opens the link');
  await A.goto(url); await A.waitForTimeout(600);
  check(await ev(A, function () { return document.getElementById('s-name').classList.contains('active'); }), 'asks "What\'s your name?"');
  await A.fill('#n-input', 'Atharv'); await A.click('#n-go'); await A.waitForTimeout(900);
  var statusA = await ev(A, function () { return document.getElementById('t-status').textContent; });
  check(/arena|Join|first/i.test(statusA), 'the title says the arena is open: "' + statusA + '"');
  check((await ev(A, function () { return document.getElementById('b-play').textContent; })).indexOf('FRIENDS') > 0, 'the button says PLAY WITH FRIENDS');
  check(await ev(A, function () { return !document.getElementById('b-solo').classList.contains('hidden'); }), 'a "play on your own" option is offered too');
  await shot(A, 'online-1-title');
  await A.click('#b-play'); await A.waitForTimeout(900);
  check((await ev(A, function () { return SC.game.mode + '/' + SC.game.state; })) === 'online/playing', 'friend 1 is in the arena');

  console.log('\nFriend 2 (on a phone) opens the same link');
  await B.goto(url); await B.waitForTimeout(600);
  await B.fill('#n-input', 'Rhea'); await B.tap('#n-go'); await B.waitForTimeout(900);
  var statusB = await ev(B, function () { return document.getElementById('t-status').textContent; });
  check(/1 player/.test(statusB), 'the title shows who is already playing: "' + statusB + '"');
  await B.tap('#b-play'); await B.waitForTimeout(900);
  check((await ev(B, function () { return SC.game.mode + '/' + SC.game.state; })) === 'online/playing', 'friend 2 is in the arena');
  check(world.players.length === 2 && snakeOf('Atharv') && snakeOf('Rhea'), 'the server has both players by name');

  console.log('\nThey see each other, with names');
  var sa = snakeOf('Atharv'), sb = snakeOf('Rhea'); sa.shield = sb.shield = 99;
  world.king.ai.cool = 999; world.king.x = -1500; world.king.y = 1500; world.king.segs.forEach(function (sg) { sg.x = -1500; sg.y = 1500; });
  place(sa, 0, 0); place(sb, 260, 120);
  await A.waitForTimeout(900); await B.waitForTimeout(100);
  var seenOnA = await ev(A, function () { return SC.game.world.snakes.filter(function (s) { return s.isPlayer && !s.isMe; }).map(function (s) { return s.name; }); });
  var seenOnB = await ev(B, function () { return SC.game.world.snakes.filter(function (s) { return s.isPlayer && !s.isMe; }).map(function (s) { return s.name; }); });
  check(seenOnA.join() === 'Rhea' && seenOnB.join() === 'Atharv', 'each sees the other snake by name (A sees ' + seenOnA + ', B sees ' + seenOnB + ')');
  var chip = await ev(A, function () { return document.getElementById('h-online').innerText.replace(/\n/g, ' '); });
  check(/2/.test(chip) && await ev(A, function () { return !document.getElementById('h-online').classList.contains('hidden'); }), 'the HUD says "2 playing": "' + chip + '"');
  var board = await ev(A, function () { return Array.prototype.map.call(document.querySelectorAll('#h-board li'), function (li) { return li.innerText.replace(/\n/g, ' '); }); });
  check(board.length >= 3, 'the leaderboard is filled in: ' + board.join(' | '));
  await shot(A, 'online-2-desktop'); await shot(B, 'online-2-phone');

  // my snake moves when I steer (a real touch drag on the phone and the keyboard on the desktop)
  var cdp = await ctxB.newCDPSession(B);
  var tp = function (type, x, y) { return cdp.send('Input.dispatchTouchEvent', { type: type, touchPoints: type === 'touchEnd' ? [] : [{ x: x, y: y, id: 1 }] }); };
  var yb0 = sb.y;
  await tp('touchStart', 195, 520);
  for (i = 1; i <= 10; i++) { await tp('touchMove', 195, 520 + i * 8); await B.waitForTimeout(40); }   // drag downwards
  await B.waitForTimeout(900); await tp('touchEnd');
  check(sb.y > yb0 + 60, "dragging down on the phone moves Rhea's snake down on the server (" + Math.round(sb.y - yb0) + ' units)');
  var xa0 = sa.x;
  await A.keyboard.down('ArrowRight'); await A.waitForTimeout(900); await A.keyboard.up('ArrowRight');
  check(sa.x > xa0 + 60, "arrow keys on the desktop move Atharv's snake (" + Math.round(sa.x - xa0) + ' units)');

  console.log('\nMystery box and eating, seen on the screens');
  sa.shield = 99; place(sa, 0, -500); place(sb, 900, 500); await A.waitForTimeout(500);
  var bx = world.spawnBox(); bx.x = sa.x; bx.y = sa.y;
  await A.waitForTimeout(700);
  var toast = await ev(A, function () { return document.getElementById('toast').innerText; });
  check(/!/.test(toast) && CFG.BOX_EFFECTS.some(function (e) { return toast.indexOf(e.name) >= 0; }), 'Atharv opens a box and the message says what he got: "' + toast.replace(/\n/g, ' ') + '"');
  world.applyEffect(sa, 'speed'); await A.waitForTimeout(500);
  check(/Speed Boost/.test(await ev(A, function () { return document.getElementById('h-fx').innerText; })), 'the Speed Boost chip shows on Atharv\'s screen');
  sa.fx.speed = 0;
  var s0 = await ev(A, function () { return SC.game.world.match.score; });
  world.spawnEgg(sa.x + 3, sa.y, 3, false); await A.waitForTimeout(500);
  check((await ev(A, function () { return SC.game.world.match.score; })) > s0, 'eating an egg raises the score on screen');

  console.log('\nThe King eats a player; revive; the friend who is King');
  sa.shield = 0; place(sa, 0, 0); sa.mass = 80; sa.radius = U.radiusFor(80);
  var K = world.king; K.mass = 250; K.ai.cool = 999; place(K, 0, 0);
  await A.waitForTimeout(1900);
  check(await ev(A, function () { return document.getElementById('s-death').classList.contains('active'); }), 'Atharv sees the "eaten" screen');
  var dtxt = await ev(A, function () { return document.getElementById('s-death').innerText.replace(/\n/g, ' '); });
  check(/King/.test(dtxt) && /Bonus point/.test(dtxt) && /29 left/.test(dtxt), 'it explains what happened: "' + dtxt.slice(0, 90) + '..."');
  await shot(A, 'online-3-death');
  place(K, -1500, 1500); K.ai.cool = 5;
  await A.click('#d-revive'); await A.waitForTimeout(900);
  check((await ev(A, function () { return SC.game.state + '/' + document.getElementById('h-rev').textContent; })) === 'playing/28/29', 'reviving brings Atharv back (28/29 revives)');
  sa = snakeOf('Atharv'); sb = snakeOf('Rhea'); sa.shield = 0; sb.shield = 0;
  sb.mass = 700; sb.radius = U.radiusFor(700); world.kingTimer = 0; place(sb, 400, 400); place(sa, 400, 400);
  await B.waitForTimeout(500);
  check(await ev(B, function () { return !document.getElementById('h-king').classList.contains('hidden'); }), 'Rhea becomes King and her phone says "You are the KING!"');
  await A.waitForTimeout(1900);
  var dtxt2 = await ev(A, function () { return document.getElementById('s-death').innerText.replace(/\n/g, ' '); });
  check(/Rhea/.test(dtxt2) && /King/.test(dtxt2), 'Atharv is told his friend Rhea (the King) got him: "' + dtxt2.slice(0, 80) + '..."');
  await A.click('#d-revive'); await A.waitForTimeout(700);

  console.log('\nOpening the menu is safe; leaving; coming back');
  sb = snakeOf('Rhea');
  await B.tap('#b-pause'); await B.waitForTimeout(500);
  check(await ev(B, function () { return document.getElementById('s-pause').classList.contains('active') && /bubble/.test(document.getElementById('p-note').textContent); }), 'the menu says the snake is safe while it is open');
  var xb = sb.x, yb = sb.y; await B.waitForTimeout(600);
  check(Math.hypot(sb.x - xb, sb.y - yb) < 5 && sb.shield > 0, 'Rhea\'s snake stands still, protected');
  await B.tap('#p-resume'); await B.waitForTimeout(500);
  await A.click('#b-pause'); await A.click('#p-quit'); await A.waitForTimeout(900);
  check(world.players.length === 1, 'when Atharv goes Home he leaves the arena');
  await B.waitForTimeout(300);
  check(await ev(B, function () { return /left/.test(document.getElementById('toast').innerText); }), 'Rhea is told that Atharv left');
  await A.click('#n-go').catch(function () {});
  check(/1 player/.test(await ev(A, function () { return document.getElementById('t-status').textContent; })), 'the title shows 1 player still in the arena');
  await A.click('#b-play'); await A.waitForTimeout(900);
  check(world.players.length === 2 && (await ev(A, function () { return SC.game.state; })) === 'playing', 'Atharv can join again');

  console.log('\nFinishing a run shows the score card with the player\'s name');
  await A.click('#b-pause'); await A.waitForTimeout(300);
  await A.evaluate(function () { SC.game.world.match.score = 1234; });
  await A.click('#p-resume');
  await A.evaluate(function () { document.getElementById('d-finish').click(); });   // (the death screen button)
  await A.waitForTimeout(300);
  if (!(await ev(A, function () { return document.getElementById('s-over').classList.contains('active'); }))) {
    var sa2 = snakeOf('Atharv'); sa2.shield = 0; place(sa2, 0, 0); var K2 = world.king; K2.mass = 400; place(K2, 0, 0); K2.ai.cool = 999;
    await A.waitForTimeout(1900);
    await A.click('#d-finish'); await A.waitForTimeout(500);
  }
  check(await ev(A, function () { return document.getElementById('s-over').classList.contains('active'); }), 'results screen appears');
  check(/Atharv/.test(await ev(A, function () { return document.getElementById('o-title').textContent; })), 'it is addressed to Atharv');
  await shot(A, 'online-4-results');
  await A.click('#o-again'); await A.waitForTimeout(900);
  check((await ev(A, function () { return SC.game.mode + '/' + SC.game.state + '/' + document.getElementById('h-rev').textContent; })) === 'online/playing/29/29', '"Play again" starts a fresh run in the arena with 29 revives');

  console.log('\nThe server goes away');
  wss_closeAll();
  await A.waitForTimeout(1200);
  check(await ev(A, function () { return document.getElementById('s-lost').classList.contains('active'); }), 'Atharv sees a "Lost the connection" screen');
  await shot(A, 'online-5-lost');
  await A.click('#l-solo'); await A.waitForTimeout(700);
  check((await ev(A, function () { return SC.game.mode + '/' + SC.game.state; })) === 'solo/playing', '"Play on my own" carries on in solo mode');

  console.log('\nConsole errors');
  check(errsA.length === 0, 'desktop page: ' + (errsA.join(' ; ') || 'none'));
  check(errsB.length === 0, 'phone page: ' + (errsB.join(' ; ') || 'none'));

  await browser.close();
  console.log('\n' + (failures ? failures + ' CHECK(S) FAILED' : 'ALL ONLINE BROWSER CHECKS PASSED'));
  process.exit(failures ? 1 : 0);

  function wss_closeAll() { Object.keys(arena.clients).forEach(function (id) { var c = arena.clients[id]; if (c.close) c.close(); }); }
})().catch(function (e) { console.error(e); process.exit(1); });
