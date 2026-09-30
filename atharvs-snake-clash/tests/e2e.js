/* Browser test: opens the real game in headless Chromium and checks the main screens and rules.
   Needs Playwright (dev only, the game itself needs nothing):   NODE_PATH=$(npm root -g) node tests/e2e.js */
'use strict';
const path = require('path');
const { chromium } = require('playwright');
const PAGE_URL = 'file://' + path.join(__dirname, '..', 'index.html');

let failures = 0;
function check(cond, msg) { if (!cond) { failures++; console.log('  FAIL: ' + msg); } else console.log('  ok: ' + msg); }

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const killByKing = () => ev(() => {
    const w = SC.game.world, P = w.player; P.shield = 0;
    let K = w.king;
    if (K.isPlayer) { P.mass = 5; w.kingTimer = 0; w.update(0.01, null); K = w.king; }
    K.x = P.x; K.y = P.y; K.segs.forEach(s => { s.x = K.x; s.y = K.y; });
  });

  console.log('Title + branding');
  await page.goto(PAGE_URL);
  await page.waitForTimeout(500);
  const titleText = await ev(() => document.getElementById('s-title').innerText);
  check(/Atharv's\s+Snake Clash/i.test(titleText), 'title shows "Atharv\'s Snake Clash"');
  check(titleText.includes('Made by Atharv Singh, Podar International School, Nerul'), 'title shows the credit line');
  check(/Atharv Singh presents/i.test(titleText), 'title says "Atharv Singh presents"');

  console.log('About screen');
  await page.click('#b-about');
  const about = await ev(() => document.getElementById('s-about').innerText);
  check(about.includes('Atharv Singh') && about.includes('Podar International School, Nerul'), 'about screen credits Atharv');
  await page.click('#a-back');

  console.log('Customize + saved settings');
  await page.click('#b-custom');
  await page.fill('#c-name', 'Atharv S');
  await page.click('#c-skins .skin[data-id="gold"]');
  await page.click('#c-legs button[data-v="0"]');
  await page.click('#c-diff button[data-v="brave"]');
  await page.click('#c-done');
  await page.reload();
  await page.waitForTimeout(400);
  const saved = await ev(() => ({ n: SC.game.profile.name, s: SC.game.profile.skin, l: SC.game.profile.legged, d: SC.game.profile.difficulty }));
  check(saved.n === 'Atharv S' && saved.s === 'gold' && saved.l === false && saved.d === 'brave', 'name, skin, legs and difficulty survive a reload: ' + JSON.stringify(saved));
  // back to defaults for the rest
  await page.click('#b-custom');
  await page.click('#c-skins .skin[data-id="sapphire"]');
  await page.click('#c-legs button[data-v="1"]');
  await page.click('#c-diff button[data-v="easy"]');
  await page.click('#c-done');

  console.log('First play shows the tutorial, then the match starts');
  await page.click('#b-play');
  check(await ev(() => document.getElementById('s-how').classList.contains('active')), 'tutorial opens on first play');
  for (let i = 0; i < 6; i++) await page.click('#how-next');
  await page.waitForTimeout(300);
  check((await ev(() => SC.game.state)) === 'playing', 'match is playing');
  check((await ev(() => document.getElementById('h-rev').textContent)) === '29/29', 'HUD shows "Revives left: 29/29"');
  check(await ev(() => document.body.innerText.includes('Podar International School, Nerul')), 'school badge is on the game screen');

  console.log('Every sound effect plays without errors');
  const sfxErrors = await ev(() => {
    const bad = [];
    SC.audio.init();
    Object.keys(SC.audio._sfx).forEach(n => { try { SC.audio._sfx[n](); } catch (e) { bad.push(n + ': ' + e.message); } });
    return bad;
  });
  check(sfxErrors.length === 0, 'all sound effects ran (' + (sfxErrors.join('; ') || 'no errors') + ')');

  console.log('Steering with keyboard');
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(700); await page.keyboard.up('ArrowUp');
  const a1 = await ev(() => SC.game.world.player.angle);
  check(Math.abs(Math.abs(a1) - Math.PI / 2) < 0.15, 'ArrowUp turns the snake to face up (' + a1.toFixed(2) + ')');

  console.log('Pause menu has the credit, and pausing stops the world');
  await page.click('#b-pause');
  const pauseTxt = await ev(() => document.getElementById('s-pause').innerText);
  check(pauseTxt.includes('Made by Atharv Singh, Podar International School, Nerul'), 'pause menu shows the credit line');
  const t0 = await ev(() => SC.game.world.time);
  await page.waitForTimeout(400);
  check((await ev(() => SC.game.world.time)) === t0, 'world is frozen while paused');
  await page.click('#p-resume');

  console.log('Death -> bonus point -> revive');
  await killByKing();
  await page.waitForTimeout(1500);
  check(await ev(() => document.getElementById('s-death').classList.contains('active')), 'death screen appears');
  check((await ev(() => SC.game.world.match.stars)) === 1, 'one bonus point awarded');
  check((await ev(() => document.getElementById('d-revive').innerText)).includes('29 left'), 'revive button says 29 left');
  await page.click('#d-revive');
  await page.waitForTimeout(300);
  check((await ev(() => document.getElementById('h-rev').textContent)) === '28/29', 'HUD now says 28/29');
  check(await ev(() => SC.game.world.player.shield > 2), 'revived snake has a safety bubble');

  console.log('Using up all 29 revives');
  await ev(() => { SC.game.world.match.revivesUsed = 28; });
  await page.waitForTimeout(3700);          // let the revive bubble wear off
  await killByKing(); await page.waitForTimeout(1500);
  check((await ev(() => document.getElementById('d-revive').innerText)).includes('1 left'), '1 revive left shown');
  await page.click('#d-revive'); await page.waitForTimeout(3700);
  check((await ev(() => SC.game.world.match.revivesUsed)) === 29, '29th revive used');
  const starsBefore = await ev(() => SC.game.world.match.stars);
  await killByKing(); await page.waitForTimeout(1500);
  check(await ev(() => document.getElementById('d-revive').classList.contains('hidden')), 'no revive button after the 29th revive');
  check((await ev(() => SC.game.world.match.stars)) === starsBefore, 'no bonus point for the death after the last revive');
  await page.click('#d-finish'); await page.waitForTimeout(400);
  check(await ev(() => document.getElementById('s-over').classList.contains('active')), 'results screen appears');
  check((await ev(() => document.getElementById('s-over').innerText)).includes('Total score'), 'results show the total score');
  const sharePng = await ev(() => document.getElementById('o-card').toDataURL('image/png').length);
  check(sharePng > 20000, 'share card picture was drawn (' + sharePng + ' chars)');
  check((await ev(() => SC.game.profile.best)) > 0, 'best score saved');

  console.log('Boss defeat -> multiplier -> Champion screen');
  await page.click('#o-again'); await page.waitForTimeout(300);
  check((await ev(() => SC.game.world.match.revivesUsed)) === 0, 'play again: fresh 29 revives');
  await ev(() => { const m = SC.game.world.match; m.bossLevel = 5; SC.game.world.player.mass = 1500; SC.game.world.player.shield = 0; });
  await page.waitForTimeout(400);
  const champ = await ev(async () => {
    const w = SC.game.world, P = w.player;
    w.bossWarn = 0.01;
    await new Promise(r => setTimeout(r, 300));
    const b = w.boss; if (!b) return 'noboss';
    P.mass = b.mass + 10; P.shield = 0;
    b.x = P.x + 5; b.y = P.y; b.segs.forEach(s => { s.x = b.x; s.y = b.y; });
    return 'ok';
  });
  check(champ === 'ok', 'final boss spawned');
  await page.waitForTimeout(5500);
  check(await ev(() => document.getElementById('s-win').classList.contains('active')), 'Champion screen appears after the last boss');
  check((await ev(() => SC.game.world.match.multiplier)) === 2, 'multiplier bonus awarded');
  await page.click('#w-go'); await page.waitForTimeout(200);
  check((await ev(() => SC.game.state)) === 'playing', 'can keep playing after winning');

  console.log('Console errors: ' + (errors.length ? JSON.stringify(errors) : 'none'));
  check(errors.length === 0, 'no console errors or warnings');
  await browser.close();
  console.log('\n' + (failures ? failures + ' CHECK(S) FAILED' : 'ALL BROWSER CHECKS PASSED'));
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
