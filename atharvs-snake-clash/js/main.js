/* Puts everything together: the game loop, game states, and reactions to what happens in the arena.
   Two ways to play share this file:
     solo    - a World runs right here in the page (always works, even opened straight from a file)
     online  - a game server runs the arena and this page shows a Mirror of it (friends in the same arena)  */
(function (root) {
  'use strict';
  var SC = root.SC, CFG = SC.CFG, U = SC.util, UI = SC.ui, Audio = SC.audio, Input = SC.input, net = SC.net;
  var doc = root.document;
  function $(id) { return doc.getElementById(id); }

  var profile = UI.profile;
  var canvas = $('game');
  var soloWorld = new SC.World();
  var world = soloWorld;             // the world being shown: soloWorld, or net.mirror when playing online
  var renderer = new SC.Renderer(canvas, $('minimap'));
  var fx = new SC.FX();

  // states: menu | connecting | playing | paused | dead | modal | over | lost
  var game = SC.game = { state: 'menu', mode: 'solo', world: world, solo: soloWorld, net: net, renderer: renderer, fx: fx, profile: profile, t: 0 };
  var calm = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  fx.calm = calm;

  function later(ms, fn) { root.setTimeout(fn, ms); }
  function shake(px) { if (!calm) renderer.cam.shake = Math.max(renderer.cam.shake, px); }
  function buzz(ms) { try { if (root.navigator.vibrate) root.navigator.vibrate(ms); } catch (e) { /* ok */ } }
  function online() { return game.mode === 'online'; }
  function setWorld(w) { world = w; game.world = w; }
  function effectDef(id) { for (var i = 0; i < CFG.BOX_EFFECTS.length; i++) if (CFG.BOX_EFFECTS[i].id === id) return CFG.BOX_EFFECTS[i]; return null; }
  function me() { return world.localId; }
  function myProfile() { return { name: profile.name, skin: profile.skin, legged: profile.legged, difficulty: profile.difficulty }; }

  // ------------------------------------------------------------------ is there a game server?
  function probeServer() {
    if (net.state === 'open') { UI.setServer('online', net.online); return; }
    UI.setServer('checking');
    net.connect(function (ok) {
      if (game.mode !== 'solo' || game.state !== 'menu') return;
      if (ok) {
        UI.setServer('online', net.online);
        net.onClose = function () { if (game.state === 'menu') { UI.setServer('solo'); } };
      } else UI.setServer('solo');
    });
  }
  // keep the "N players in the arena" number fresh on the title screen
  root.setInterval(function () { if (game.state === 'menu' && net.state === 'open' && UI.current === 'title') UI.setServer('online', net.online); }, 3000);

  // ------------------------------------------------------------------ states
  function goMenu() {
    if (online()) net.leave();
    setWorld(soloWorld); game.mode = 'solo';
    world.startAttract();
    renderer.follow(world, 0, true);
    fx.list.length = 0;
    game.state = 'menu';
    Input.enabled = false; Input.joy = null;
    UI.showHud(false);
    UI.refreshTitle();
    UI.show('title');
    probeServer();
  }

  function startSolo() {
    Audio.init();
    Audio.startMusic();
    net.leave();
    setWorld(soloWorld); game.mode = 'solo';
    world.startMatch(myProfile());
    renderer.follow(world, 0, true);
    fx.list.length = 0;
    game.state = 'playing';
    Input.enabled = true;
    UI.hide();
    UI.showHud(true);
    UI.updateHud(world);
    UI.toast('Eat eggs to grow! Open purple mystery boxes! Stay away from the King!', '', 4200);
    Audio.play('revive');
  }

  // join the shared arena on the game server
  function startOnline() {
    Audio.init();
    Audio.startMusic();
    game.state = 'connecting'; Input.enabled = false;
    UI.hide();
    UI.toast('Joining the arena...', '', 2500);
    net.join(myProfile(), function (ok) {
      if (!ok) {
        UI.toast("Couldn't join the arena. Playing on your own instead.", 'bad', 3500);
        startSolo();
        return;
      }
      setWorld(net.mirror); game.mode = 'online';
      fx.list.length = 0;
      game.state = 'playing'; Input.enabled = true; game.waitSnap = true; game.joinedAt = game.t;
      net.onClose = function () { connectionLost('The game server stopped answering.'); };
      net.onKick = function (why) { connectionLost(why === 'idle' ? 'You were away for a while, so the game let your snake go.' : 'The game server closed your connection.'); };
      UI.showHud(true);
      UI.toast('You are in! Friends have blue names. Open purple mystery boxes!', '', 4200);
      Audio.play('join');
    });
  }

  function begin() {
    if (net.available && net.state === 'open') startOnline(); else startSolo();
  }

  function play() {
    if (!profile.seenHow) { UI.how.back = 'title'; UI.startHow(begin); }
    else begin();
  }

  function connectionLost(msg) {
    if (!online() || game.state === 'menu' || game.state === 'over' || game.state === 'lost') return;
    game.state = 'lost'; Input.enabled = false; Input.joy = null;
    UI.showHud(false);
    $('l-msg').textContent = msg;
    UI.show('lost');
  }

  function pause() {
    if (game.state !== 'playing') return;
    game.state = 'paused'; Input.enabled = false; Input.joy = null;
    if (online()) net.afk(true);                   // the arena keeps going; your snake stands still inside a bubble
    $('p-title').textContent = online() ? 'Menu' : 'Paused';
    $('p-note').textContent = online() ? 'Your snake is safe in a bubble while you are here. Your friends keep playing!' : '';
    $('p-restart').textContent = online() ? '🔄 New run' : '🔄 Restart';
    UI.refreshToggles();
    UI.show('pause');
  }
  function resume() {
    if (game.state !== 'paused') return;
    game.state = 'playing'; Input.enabled = true;
    if (online()) net.afk(false);
    UI.hide();
  }

  function finishRun() {
    game.state = 'over'; Input.enabled = false;
    UI.showHud(false);
    Audio.play('over');
    var m = world.match, name = online() ? world.myName : profile.name;
    if (online()) net.finish();
    UI.showOver(m, name);
  }

  function afterRevive() {
    var P = world.player;
    game.state = 'playing'; Input.enabled = true; game.reviving = false;
    UI.hide();
    renderer.follow(world, 0, true);
    if (P) fx.ring(P.x, P.y, '#7fe8ff', 140);
    UI.toast('Welcome back! Your bubble keeps you safe for a moment.', 'good', 2600);
    if (CFG.MAX_REVIVES - world.match.revivesUsed === 0) UI.toast('Last revive used!', 'bad', 2600);
  }

  function revive() {
    if (game.state !== 'dead' || game.reviving) return;
    if (online()) { game.reviving = true; net.revive(); return; }   // comes back as a "revived" event
    if (world.revive()) afterRevive();
  }

  // a new run: from "Play again", or from the menu while playing
  function newRun() {
    if (online() && net.state === 'open') {
      game.state = 'connecting'; Input.enabled = false; UI.hide();
      net.join(myProfile(), function (ok) {
        if (!ok) { connectionLost('Could not start a new run.'); return; }
        game.state = 'playing'; Input.enabled = true; game.waitSnap = true; game.joinedAt = game.t; UI.showHud(true);
        UI.toast('New run! Good luck!', 'good', 2400);
        Audio.play('revive');
      });
    } else if (online()) { startOnline(); }
    else startSolo();
  }

  // ------------------------------------------------------------------ reacting to what happens
  var lastCrownToast = -99;

  function handleEvents() {
    var ev = world.events, i, e, P = world.player, mine = me();
    if (game.state === 'menu') { ev.length = 0; return; }
    for (i = 0; i < ev.length; i++) {
      e = ev[i];
      switch (e.type) {
        case 'egg':
          if (e.pid !== mine) break;
          if (e.golden) {
            fx.burst(e.x, e.y, '#ffd23f', 18, 260, 6); fx.ring(e.x, e.y, '#ffe066', 110);
            fx.text(e.x, e.y - 16, 'Shield!', '#7fe8ff', 20); Audio.play('golden');
          } else {
            fx.burst(e.x, e.y, SC.EGG_COLORS[e.c], e.v >= 3 ? 9 : 4, 120, 4);
            Audio.play('egg');
          }
          break;
        case 'eatStart':
          if (e.pid === mine) { fx.ring(e.x, e.y, '#ffffff', 80); Audio.play('chomp'); shake(3); }
          break;
        case 'bite':
          if (e.pid === mine) {
            var eater = world.snakeById(e.eaterId);
            if (eater) fx.suck(e.x, e.y, eater, SC.skins.baseColor(SC.skins.byId(e.vSkin)), e.vBoss ? 12 : 8);
            if (e.vBoss) fx.confetti(e.x, e.y, 2, 240);
            Audio.play('bite');
          }
          break;
        case 'eaten':
          if (e.pid === mine && !e.vBoss && P) {
            fx.text(P.x, P.y - P.radius * 1.8, 'Yum! +10', '#ffe066', 22); Audio.play('yum');
          }
          break;
        case 'playerDied':
          if (e.pid === mine) onDeath(e);
          break;
        case 'revived':
          if (e.pid === mine && game.state === 'dead') afterRevive();
          break;
        case 'crown':
          if (game.state !== 'playing') break;
          if (e.pid === mine) {
            UI.toast('You are the KING now! Everyone else is yummy!', 'gold', 3200);
            Audio.play('crown'); if (P) fx.confetti(P.x, P.y, 50, 420);
          } else if (e.prevPid === mine) {
            UI.toast(e.name + ' took the crown! Watch out!', 'bad', 2800); Audio.play('crown');
          } else if (game.t - lastCrownToast > 8) {
            UI.toast((e.pid ? e.name + ' (a friend) is the new King!' : e.name + ' is the new King!'), '', 2200);
          }
          lastCrownToast = game.t;
          break;
        case 'bossWarning':
          UI.banner('BOSS COMING!', 'Level ' + e.level + ': ' + e.name, 'warn', CFG.BOSS_WARN * 1000);
          Audio.play('warn'); shake(4);
          break;
        case 'bossSpawn':
          UI.toast('Boss Lv ' + e.level + ' is here! Follow the arrow.', 'bad', 3200);
          Audio.play('roar'); shake(10);
          break;
        case 'bossDefeated': celebrate(e); break;
        case 'boxOpen': onBoxOpen(e); break;
        case 'boxGone':
          if (P && U.dist(P, e) < 900) fx.burst(e.x, e.y, '#c77dff', 8, 120, 4);
          break;
        case 'playerJoined':
          if (online() && e.pid !== mine && game.t - (game.joinedAt || 0) > 1.5 && game.state === 'playing') { UI.toast(e.name + ' joined the arena!', '', 2200); Audio.play('join'); }
          break;
        case 'playerLeft':
          if (online() && e.pid !== mine && game.state === 'playing') UI.toast(e.name + ' left.', '', 1800);
          break;
        default: break;
      }
    }
    ev.length = 0;
  }

  // somebody opened a mystery box
  function onBoxOpen(e) {
    var def = effectDef(e.eff), P = world.player, mine = e.pid === me();
    if (!def) return;
    var holder = world.snakeById(e.sid);
    var near = P && U.dist(P, e) < 900;
    if (mine) {
      fx.burst(e.x, e.y, def.good ? '#7dff9a' : '#ff6a6a', 26, 280, 7);
      fx.ring(e.x, e.y, def.good ? '#b8ff9a' : '#ff9a9a', 140);
      Audio.play(def.good ? 'boxGood' : 'boxBad');
      if (def.id === 'blast') { Audio.play('blast'); shake(14); buzz(120); fx.burst(e.x, e.y, '#ffb347', 30, 420, 8); }
      UI.toast(def.icon + ' ' + def.name + '! ' + def.text, def.good ? 'good' : 'bad', 3200);
      if (P) fx.text(P.x, P.y - P.radius * 2.2, def.icon + ' ' + def.name, def.good ? '#9dff9a' : '#ff9a9a', 20);
    } else if (near) {
      fx.burst(e.x, e.y, def.good ? '#7dff9a' : '#ff6a6a', 14, 200, 5);
      if (holder && holder.isPlayer) fx.text(holder.x, holder.y - holder.radius * 2.2, def.icon + ' ' + def.name, def.good ? '#9dff9a' : '#ff9a9a', 16);
    }
  }

  function onDeath(e) {
    Audio.play('die'); buzz(180); shake(12);
    var segs = e.segs || [], c = SC.skins.baseColor(SC.skins.byId(e.skinId)), k;
    for (k = 0; k < segs.length; k += 2) fx.burst(segs[k].x, segs[k].y, c, 5, 210, 7);
    fx.ring(e.x, e.y, '#ffffff', 200);
    game.state = 'dead'; Input.enabled = false; Input.joy = null; game.reviving = false;
    later(1000, function () {
      if (game.state !== 'dead') return;
      UI.showDeath(e, world.match);
      if (e.gotStar) Audio.play('star');
    });
  }

  function celebrate(e) {
    var P = world.player, mineWin = e.pid === me();
    if (!mineWin) {                                   // a friend beat the Boss: cheer for them
      Audio.play('win'); shake(5);
      UI.banner(e.by + ' beat the Boss!', e.name + ' is down. Boss level ' + (e.level + 1) + ' is next!', '', 3200);
      return;
    }
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
        if (online()) net.afk(true);
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

    if (online()) {
      // the server runs the arena; we only smooth what it sends and tell it where we want to go
      if (st !== 'lost') {
        world.update(dt);
        var P0 = world.player;
        if (game.waitSnap && world.snapCount > 0) { renderer.follow(world, 0, true); game.waitSnap = false; }
        if (st === 'playing' && P0) {
          var sp0 = renderer.toScreen(P0.x, P0.y);
          net.input(Input.steer(sp0.x, sp0.y));
        }
        handleEvents();
      }
    } else if (st === 'playing' || st === 'menu' || st === 'dead' || st === 'over') {
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

    var live = st === 'playing' || st === 'dead' || (online() && st === 'paused');
    if (live) {
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

  // name box
  function submitName() {
    if (!UI.submitName()) return;
    Audio.init(); Audio.play('click');
    UI.refreshTitle();
    UI.show('title');
  }
  on('n-go', submitName);
  $('n-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submitName(); } });
  on('b-rename', function () { UI.showName(); });

  on('b-play', play);
  on('b-solo', function () {
    if (!profile.seenHow) { UI.how.back = 'title'; UI.startHow(startSolo); } else startSolo();
  });
  on('b-custom', function () { UI.syncCustomize(); UI.show('custom'); });
  on('c-done', function () { UI.refreshTitle(); UI.show(game.state === 'paused' ? 'pause' : 'title'); });
  on('b-how', function () { UI.how.back = 'title'; UI.startHow(null); });
  on('b-about', function () { UI.showAbout(); });
  on('a-back', function () { UI.show('title'); });
  on('how-next', function () { UI.nextHow(); });
  on('how-skip', function () { UI.endHow(); });

  on('p-resume', resume);
  on('p-restart', function () { newRun(); });
  on('p-how', function () { UI.how.back = 'pause'; UI.startHow(null); });
  on('p-quit', goMenu);

  on('d-revive', revive);
  on('d-finish', finishRun);
  on('w-go', function () { game.state = 'playing'; Input.enabled = true; if (online()) net.afk(false); UI.hide(); });
  on('w-finish', finishRun);
  on('o-again', function () { newRun(); });
  on('o-home', goMenu);
  on('o-share', function () { UI.share(); });
  on('o-save', function () { UI.savePicture(); });

  on('l-retry', function () {
    $('l-msg').textContent = 'Trying to reconnect...';
    net.leave();
    net.connect(function (ok) {
      if (!ok) { $('l-msg').textContent = 'Still cannot reach the game server.'; return; }
      startOnline();
    });
  });
  on('l-solo', function () { startSolo(); });
  on('l-home', goMenu);

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
  root.addEventListener('pagehide', function () { if (online()) net.leave(); });

  // ------------------------------------------------------------------ go!
  Audio.configure(profile.sfx, profile.music);   // sound really starts on the first tap (browsers need a tap first)
  Input.init(canvas);
  UI.buildCustomize();
  UI.syncCustomize();
  goMenu();
  UI.showName();     // every visit starts by asking "What's your name?"
  root.requestAnimationFrame(frame);
})(window);
