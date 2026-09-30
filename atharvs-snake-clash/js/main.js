/* Puts everything together: the game loop, game states, and reactions to what happens in the world. */
(function (root) {
  'use strict';
  var SC = root.SC, CFG = SC.CFG, U = SC.util, UI = SC.ui, Audio = SC.audio, Input = SC.input;
  var doc = root.document;
  function $(id) { return doc.getElementById(id); }

  var profile = UI.profile;
  var canvas = $('game');
  var world = new SC.World({ difficulty: profile.difficulty });
  var renderer = new SC.Renderer(canvas, $('minimap'));
  var fx = new SC.FX();

  // states: menu | playing | paused | dead | modal | over
  var game = SC.game = { state: 'menu', world: world, renderer: renderer, fx: fx, profile: profile, t: 0 };
  var calm = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  fx.calm = calm;

  function later(ms, fn) { root.setTimeout(fn, ms); }
  function shake(px) { if (!calm) renderer.cam.shake = Math.max(renderer.cam.shake, px); }
  function buzz(ms) { try { if (root.navigator.vibrate) root.navigator.vibrate(ms); } catch (e) { /* ok */ } }

  // ------------------------------------------------------------------ states
  function goMenu() {
    world.startAttract();
    renderer.follow(world, 0, true);
    fx.list.length = 0;
    game.state = 'menu';
    Input.enabled = false; Input.joy = null;
    UI.showHud(false);
    UI.refreshTitle();
    UI.show('title');
  }

  function startMatch() {
    Audio.init();
    Audio.startMusic();
    world.startMatch({ name: profile.name, skin: profile.skin, legged: profile.legged, difficulty: profile.difficulty });
    renderer.follow(world, 0, true);
    fx.list.length = 0;
    game.state = 'playing';
    Input.enabled = true;
    UI.hide();
    UI.showHud(true);
    UI.updateHud(world);
    UI.toast('Eat eggs to grow! Stay away from the King!', '', 3600);
    Audio.play('revive');
  }

  function play() {
    if (!profile.seenHow) { UI.how.back = 'title'; UI.startHow(startMatch); }
    else startMatch();
  }

  function pause() {
    if (game.state !== 'playing') return;
    game.state = 'paused'; Input.enabled = false; Input.joy = null;
    UI.refreshToggles();
    UI.show('pause');
  }
  function resume() {
    if (game.state !== 'paused') return;
    game.state = 'playing'; Input.enabled = true;
    UI.hide();
  }

  function finishRun() {
    game.state = 'over'; Input.enabled = false;
    UI.showHud(false);
    Audio.play('over');
    UI.showOver(world.match);
  }

  function revive() {
    if (game.state !== 'dead' || !world.revive()) return;
    game.state = 'playing'; Input.enabled = true;
    UI.hide();
    renderer.follow(world, 0, true);
    var P = world.player;
    fx.ring(P.x, P.y, '#7fe8ff', 140);
    UI.toast('Welcome back! Your bubble keeps you safe for a moment.', 'good', 2600);
    if (CFG.MAX_REVIVES - world.match.revivesUsed === 0) UI.toast('Last revive used!', 'bad', 2600);
  }

  // ------------------------------------------------------------------ reacting to the world
  var lastCrownToast = -99;

  function handleEvents() {
    var ev = world.events, i, e, P = world.player;
    if (game.state === 'menu') { ev.length = 0; return; }
    for (i = 0; i < ev.length; i++) {
      e = ev[i];
      switch (e.type) {
        case 'egg':
          if (e.golden) {
            fx.burst(e.x, e.y, '#ffd23f', 18, 260, 6); fx.ring(e.x, e.y, '#ffe066', 110);
            fx.text(e.x, e.y - 16, 'Shield!', '#7fe8ff', 20); Audio.play('golden');
          } else {
            fx.burst(e.x, e.y, SC.EGG_COLORS[e.c], e.v >= 3 ? 9 : 4, 120, 4);
            Audio.play('egg');
          }
          break;
        case 'eatStart':
          if (e.eater.isPlayer) { fx.ring(e.x, e.y, '#ffffff', 80); Audio.play('chomp'); shake(3); }
          break;
        case 'bite':
          if (e.eater.isPlayer) {
            fx.suck(e.x, e.y, e.eater, SC.skins.baseColor(e.victim.skin), e.victim.isBoss ? 12 : 8);
            if (e.victim.isBoss) fx.confetti(e.x, e.y, 2, 240);
            Audio.play('bite');
          }
          break;
        case 'eaten':
          if (e.eater.isPlayer && !e.victim.isBoss && P) {
            fx.text(P.x, P.y - P.radius * 1.8, 'Yum! +10', '#ffe066', 22); Audio.play('yum');
          }
          break;
        case 'playerDied': onDeath(e); break;
        case 'crown':
          if (game.state !== 'playing') break;
          if (e.snake.isPlayer) {
            UI.toast('You are the KING now! Everyone else is yummy!', 'gold', 3200);
            Audio.play('crown'); fx.confetti(e.snake.x, e.snake.y, 50, 420);
          } else if (e.prev && e.prev.isPlayer) {
            UI.toast(e.snake.name + ' took the crown! Watch out!', 'bad', 2800); Audio.play('crown');
          } else if (game.t - lastCrownToast > 8) {
            UI.toast(e.snake.name + ' is the new King!', '', 2200);
          }
          lastCrownToast = game.t;
          break;
        case 'shield': break;
        case 'bossWarning':
          UI.banner('BOSS COMING!', 'Level ' + e.level + ': ' + e.name, 'warn', CFG.BOSS_WARN * 1000);
          Audio.play('warn'); shake(4);
          break;
        case 'bossSpawn':
          UI.toast('Boss Lv ' + e.level + ' is here! Follow the arrow.', 'bad', 3200);
          Audio.play('roar'); shake(10);
          break;
        case 'bossDefeated': celebrate(e); break;
        default: break;
      }
    }
    ev.length = 0;
  }

  function onDeath(e) {
    Audio.play('die'); buzz(180); shake(12);
    var segs = e.segs, c = SC.skins.baseColor(e.skin), k;
    for (k = 0; k < segs.length; k += 2) fx.burst(segs[k].x, segs[k].y, c, 5, 210, 7);
    fx.ring(e.x, e.y, '#ffffff', 200);
    game.state = 'dead'; Input.enabled = false; Input.joy = null;
    later(1000, function () {
      if (game.state !== 'dead') return;
      UI.showDeath(e, world.match);
      if (e.gotStar) Audio.play('star');
    });
  }

  function celebrate(e) {
    var P = world.player;
    Audio.play('win'); shake(12);
    UI.banner('BOSS DEFEATED!', 'Multiplier x' + e.multiplier + '   +' + e.bonus + ' points', '', 3600);
    if (P) {
      fx.confetti(P.x, P.y, 90, 600);
      [300, 700, 1200, 1800].forEach(function (ms) {
        later(ms, function () {
          var Q = world.player;
          if (Q && Q.alive) fx.confetti(Q.x + U.rnd(-200, 200), Q.y + U.rnd(-200, 200), 50, 520);
        });
      });
    }
    if (e.final) {
      later(3400, function () {
        if (game.state !== 'playing') return;
        game.state = 'modal'; Input.enabled = false; Input.joy = null;
        Audio.play('champion');
        UI.show('win');
        var Q = world.player;
        if (Q) fx.confetti(Q.x, Q.y, 120, 700);
      });
    }
  }

  // ------------------------------------------------------------------ main loop
  var last = 0, hudAcc = 0, dangerAcc = 0, slowAvg = 1 / 60, slowAcc = 0, quality = 1;

  function frame(ts) {
    root.requestAnimationFrame(frame);
    var dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    if (!(dt > 0)) return;
    game.t += dt;
    var st = game.state;

    // if the device is slow, quietly draw at a lower resolution
    slowAvg += (dt - slowAvg) * 0.05; slowAcc += dt;
    if (slowAcc > 2.5) {
      slowAcc = 0;
      if (slowAvg > 0.036 && quality > 0.55 && !doc.hidden) { quality -= 0.15; renderer.setQuality(quality); }
    }

    if (st === 'playing' || st === 'menu' || st === 'dead' || st === 'over') {
      var steer = null, P = world.player;
      if (st === 'playing' && P && P.alive) {
        var sp = renderer.toScreen(P.x, P.y);
        steer = Input.steer(sp.x, sp.y);
      }
      world.update(dt, steer);
      handleEvents();
    }
    fx.update(dt);
    renderer.follow(world, dt, false);
    renderer.draw(world, fx, game.t, { joy: st === 'playing' && Input.joy, arrows: st === 'playing' });

    if (st === 'playing' || st === 'dead') {
      renderer.drawMinimap(world, game.t);
      hudAcc += dt; dangerAcc += dt;
      if (hudAcc > 0.12) { hudAcc = 0; UI.updateHud(world); }
      if (dangerAcc > 0.1) {
        dangerAcc = 0;
        var th = world.nearestThreat();
        UI.setDanger(st === 'playing' && th.snake ? U.clamp(1 - th.gap / 240, 0, 1) * 0.95 : 0);
      }
    } else if (st !== 'paused') {
      UI.setDanger(0);
    }
    UI.tick(game.t);
  }

  // ------------------------------------------------------------------ buttons
  function on(id, fn) {
    $(id).addEventListener('click', function () {
      Audio.init(); Audio.play('click');
      this.blur();   // so Space / Enter can never "press" a hidden button while playing
      fn();
    });
  }

  on('b-play', play);
  on('b-custom', function () { UI.syncCustomize(); UI.show('custom'); });
  on('c-done', function () { world.difficulty = profile.difficulty; UI.show(game.state === 'paused' ? 'pause' : 'title'); });
  on('b-how', function () { UI.how.back = 'title'; UI.startHow(null); });
  on('b-about', function () { UI.showAbout(); });
  on('a-back', function () { UI.show('title'); });
  on('how-next', function () { UI.nextHow(); });
  on('how-skip', function () { UI.endHow(); });

  on('p-resume', resume);
  on('p-restart', startMatch);
  on('p-how', function () { UI.how.back = 'pause'; UI.startHow(null); });
  on('p-quit', goMenu);

  on('d-revive', revive);
  on('d-finish', finishRun);
  on('w-go', function () { game.state = 'playing'; Input.enabled = true; UI.hide(); });
  on('w-finish', finishRun);
  on('o-again', startMatch);
  on('o-home', goMenu);
  on('o-share', function () { UI.share(); });
  on('o-save', function () { UI.savePicture(); });

  on('b-pause', function () { if (game.state === 'playing') pause(); else if (game.state === 'paused') resume(); });
  function toggleSfx() { profile.sfx = !profile.sfx; Audio.setSfx(profile.sfx); UI.saveProfile(); UI.refreshToggles(); }
  function toggleMusic() {
    profile.music = !profile.music; Audio.setMusic(profile.music);
    if (!profile.music) Audio.stopMusic();
    UI.saveProfile(); UI.refreshToggles();
  }
  $('t-sfx').addEventListener('click', toggleSfx); $('p-sfx').addEventListener('click', toggleSfx);
  $('t-music').addEventListener('click', toggleMusic); $('p-music').addEventListener('click', toggleMusic);
  // the speaker button in the game: everything on <-> everything off
  $('b-sound').addEventListener('click', function () {
    this.blur();
    var on2 = !(profile.sfx || profile.music);
    profile.sfx = profile.music = on2;
    Audio.setSfx(on2); Audio.setMusic(on2); if (!on2) Audio.stopMusic();
    UI.saveProfile(); UI.refreshToggles();
  });

  var fsBtn = $('t-full'), de = doc.documentElement;
  if (de.requestFullscreen && !/iPhone|iPod/.test(root.navigator.userAgent)) {
    fsBtn.classList.remove('hidden');
    fsBtn.addEventListener('click', function () {
      if (doc.fullscreenElement) doc.exitFullscreen(); else de.requestFullscreen().catch(function () { /* not allowed */ });
    });
  }

  // keyboard helpers
  Input.onPause = function () {
    if (game.state === 'playing') pause();
    else if (game.state === 'paused') resume();
  };
  Input.onConfirm = function () {
    if (UI.current === 'death' && !$('d-revive').classList.contains('hidden')) { revive(); return true; }
    if (UI.current === 'title' && doc.activeElement && doc.activeElement.tagName !== 'BUTTON') { play(); return true; }
    return false;
  };

  root.addEventListener('resize', function () { renderer.resize(); });
  root.addEventListener('orientationchange', function () { root.setTimeout(function () { renderer.resize(); }, 250); });
  doc.addEventListener('visibilitychange', function () { if (doc.hidden && game.state === 'playing') pause(); });

  // ------------------------------------------------------------------ go!
  Audio.configure(profile.sfx, profile.music);   // sound really starts on the first tap (browsers need a tap first)
  Input.init(canvas);
  UI.buildCustomize();
  UI.syncCustomize();
  goMenu();
  root.requestAnimationFrame(frame);
})(window);
