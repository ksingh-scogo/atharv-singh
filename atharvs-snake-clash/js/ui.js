/* Menus, the in-game display (HUD), messages, and the shareable score card. */
(function (root) {
  'use strict';
  var SC = root.SC = root.SC || {};
  var CFG = SC.CFG, U = SC.util;
  var doc = root.document;
  function $(id) { return doc.getElementById(id); }

  var DEFAULTS = {
    name: '', skin: 'sapphire', legged: true, difficulty: 'easy', sfx: true, music: true, seenHow: false,
    best: 0, bestSize: 0, bestBosses: 0, totalStars: 0, games: 0
  };
  var profile = Object.assign({}, DEFAULTS, SC.store.load());
  function saveProfile() {
    var mem = SC.store.load();
    Object.keys(profile).forEach(function (k) { mem[k] = profile[k]; });
    SC.store.save();
  }

  var SCREENS = ['name', 'title', 'custom', 'how', 'about', 'pause', 'death', 'over', 'win', 'lost'];
  var cache = {};
  function setText(id, v) {
    v = String(v);
    if (cache[id] === v) return;
    cache[id] = v;
    $(id).textContent = v;
  }
  function setClass(el, cls, on) { if (el) el.classList.toggle(cls, !!on); }

  var UI = SC.ui = {
    profile: profile,
    current: 'title',
    saveProfile: saveProfile,

    show: function (name) {
      SCREENS.forEach(function (s) { $('s-' + s).classList.toggle('active', s === name); });
      UI.current = name;
      if (name) {
        var first = doc.querySelector('#s-' + name + ' .btn.big') || doc.querySelector('#s-' + name + ' .btn');
        if (first && name !== 'custom') { try { first.focus({ preventScroll: true }); } catch (e) { /* ok */ } }
      }
    },
    hide: function () { UI.show(null); },
    showHud: function (on) { setClass($('hud'), 'hidden', !on); if (!on) UI.setDanger(0); },
    setDanger: function (v) { $('danger').style.opacity = v.toFixed(2); },

    // ---------------------------------------------------------------- messages
    toast: function (text, cls, ms) {
      var box = $('toast'), d = doc.createElement('div');
      d.className = 'toast-item ' + (cls || '');
      d.textContent = text;
      box.appendChild(d);
      while (box.children.length > 3) box.removeChild(box.firstChild);
      root.setTimeout(function () { d.classList.add('out'); root.setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 450); }, ms || 2600);
    },
    banner: function (big, small, cls, ms) {
      var b = $('banner');
      $('bn-1').textContent = big; $('bn-2').textContent = small || '';
      b.className = cls || '';
      // restart the pop animation
      b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
      root.clearTimeout(UI._bt);
      UI._bt = root.setTimeout(function () { b.classList.add('hidden'); }, ms || 2600);
    },

    // ---------------------------------------------------------------- HUD
    updateHud: function (world) {
      var m = world.match, P = world.player;
      if (!m) return;
      var alive = P && P.alive;
      setText('h-score', U.fmt(m.score));
      var multEl = $('h-mult');
      setClass(multEl, 'hidden', m.multiplier <= 1);
      setText('h-mult', 'x' + m.multiplier);
      if (alive) setText('h-size', U.fmt(P.mass));
      setText('h-rev', (CFG.MAX_REVIVES - m.revivesUsed) + '/' + CFG.MAX_REVIVES);
      setText('h-stars', m.stars);
      setClass($('h-king'), 'hidden', !(alive && P.isKing));

      // friends playing right now
      var count = world.playerCount();
      setClass($('h-online'), 'hidden', !(world.online || count > 1));
      setText('h-players', count);

      // leaderboard: the top of the match, and you
      var n = root.innerWidth < 520 ? 3 : 5, lb = world.leaderboard(world.localId, n), key = '';
      if (alive && lb.rank) setText('h-rank', '#' + lb.rank + '/' + lb.total);
      lb.rows.forEach(function (r) { key += r.id + ':' + r.king + ':' + r.mass + ':' + r.rank + ':' + r.me + ';'; });
      if (cache.board !== key) {
        cache.board = key;
        var ol = $('h-board'); ol.innerHTML = '';
        lb.rows.forEach(function (r) {
          var li = doc.createElement('li'), a = doc.createElement('span'), b = doc.createElement('b');
          a.textContent = (r.king ? '' : r.rank + '. ') + r.name; b.textContent = r.mass;
          li.appendChild(a); li.appendChild(b);
          li.className = (r.me ? 'me ' : '') + (r.king ? 'king ' : '') + (r.human && !r.me ? 'friend' : '');
          ol.appendChild(li);
        });
      }

      // boss bar
      var bar = $('h-boss'), bossLv = world.bossLevel, B = world.boss, def = CFG.BOSSES[bossLv - 1];
      if (B && B.alive && !B.eaten) {
        var ready = alive && P.mass >= B.mass;
        bar.className = 'boss-bar ' + (ready ? 'ready' : 'fight');
        setText('hb-title', 'Boss Lv ' + B.bossLevel + ': ' + B.name + ' (size ' + Math.floor(B.mass) + ')');
        $('hb-fill').style.width = Math.min(100, (alive ? P.mass : 0) / B.mass * 100) + '%';
        setText('hb-sub', !alive ? '' : ready ? 'You are big enough! Bump the Boss!' : 'Keep eating! You: ' + Math.floor(P.mass) + ' / ' + Math.floor(B.mass));
      } else if (def && alive && !world.bossWarn) {
        bar.className = 'boss-bar';
        setText('hb-title', 'Next Boss wakes up at size ' + def.trigger);
        $('hb-fill').style.width = Math.min(100, P.mass / def.trigger * 100) + '%';
        setText('hb-sub', 'Boss Lv ' + bossLv + ' of ' + CFG.BOSSES.length);
      } else {
        bar.className = 'boss-bar hidden';
      }

      UI.updateEffects(alive ? P : null);
    },

    // chips for the mystery box effects that are on right now, each with a shrinking timer bar
    updateEffects: function (P) {
      var box = $('h-fx'), chips = UI._fx = UI._fx || {};
      CFG.BOX_EFFECTS.forEach(function (def) {
        var left = P && P.fx ? P.fx[def.id] : 0, c = chips[def.id];
        if (left > 0 && def.dur > 0) {
          if (!c) {
            var el = doc.createElement('div'), ic = doc.createElement('span'), nm = doc.createElement('span'), bar = doc.createElement('span'), fill = doc.createElement('i');
            el.className = 'fx-chip ' + (def.good ? 'good' : 'bad');
            ic.className = 'ic'; ic.textContent = def.icon; nm.textContent = def.name; bar.className = 'bar';
            bar.appendChild(fill); el.appendChild(ic); el.appendChild(nm); el.appendChild(bar); box.appendChild(el);
            c = chips[def.id] = { el: el, fill: fill };
          }
          c.fill.style.width = Math.min(100, left / def.dur * 100) + '%';
        } else if (c) {
          if (c.el.parentNode) c.el.parentNode.removeChild(c.el);
          delete chips[def.id];
        }
      });
    },

    // ---------------------------------------------------------------- death
    showDeath: function (info, m) {
      var left = CFG.MAX_REVIVES - m.revivesUsed;
      var emoji = '👑', title, msg;
      if (info.byBoss) { emoji = '👹'; title = 'The Boss got you!'; msg = info.byName + ' was too big. Get bigger than the Boss, then bump it!'; }
      else if (info.byKing && info.byFriend) { title = info.byName + ' got you!'; msg = info.byName + ' is the King now, and the King can eat friends too. Grow bigger and take the crown!'; }
      else if (info.byKing) { title = 'The King got you!'; msg = info.byName + ' wears the crown. Stay away from the King!'; }
      else { emoji = '🐍'; title = 'A big snake got you!'; msg = info.byName + ' was much bigger than you.'; }
      if (!info.canRevive) { title = 'That was your last life!'; msg = 'You used all ' + CFG.MAX_REVIVES + ' revives. What a brave snake!'; }
      setDeath('d-emoji', emoji); $('d-title').textContent = title; $('d-msg').textContent = msg;
      setClass($('d-star'), 'hidden', !info.gotStar);
      var note = $('d-mult');
      if (info.lostMultiplier) { note.className = 'note bad'; note.textContent = 'Oh no! Your x' + info.prevMult + ' multiplier was lost.'; }
      else if (info.byBoss && m.multiplier > 1) { note.className = 'note good'; note.textContent = 'Your x' + m.multiplier + ' multiplier is safe!'; }
      else { note.className = 'note'; note.textContent = ''; }
      $('d-rev').textContent = info.canRevive ? 'Revives left: ' + left + ' of ' + CFG.MAX_REVIVES : 'Revives left: 0 of ' + CFG.MAX_REVIVES;
      setClass($('d-revive'), 'hidden', !info.canRevive);
      $('d-revive').textContent = '❤️ Revive! (' + left + ' left)';
      $('d-finish').textContent = info.canRevive ? 'Finish my run' : 'See my score card';
      var fin = $('d-finish');   // "Finish" becomes the main button when there is nothing to revive
      fin.classList.toggle('big', !info.canRevive);
      fin.classList.toggle('small', info.canRevive);
      fin.classList.toggle('ghost', info.canRevive);
      UI.show('death');
    },

    // ---------------------------------------------------------------- results + share card
    finalTotal: function (m) { return Math.floor(m.score) + m.stars * CFG.BONUS_STAR_VALUE; },

    showOver: function (m, name) {
      var total = UI.finalTotal(m), newBest = total > profile.best;
      var prevBest = profile.best;
      profile.best = Math.max(profile.best, total);
      profile.bestSize = Math.max(profile.bestSize, Math.floor(m.bestMass));
      profile.bestBosses = Math.max(profile.bestBosses, m.bossesDefeated);
      profile.totalStars += m.stars;
      profile.games++;
      saveProfile();
      var who = name || profile.name || 'Player';
      UI._last = { m: m, total: total, name: who };
      $('o-title').textContent = m.won ? 'Snake Champion ' + who + '!' : 'Great game, ' + who + '!';
      $('o-note').textContent = newBest && prevBest > 0 ? 'New best score!' : '';
      $('o-note').className = 'note good';
      $('o-stats').innerHTML = '';
      [['Total score', U.fmt(total)], ['Biggest size', U.fmt(m.bestMass)], ['Bosses beaten', m.bossesDefeated + '/' + CFG.BOSSES.length],
        ['Bonus points', m.stars], ['Snakes eaten', m.snakes], ['Best ever', U.fmt(profile.best)]].forEach(function (p) {
        var d = doc.createElement('div'); d.className = 'stat';
        d.appendChild(doc.createTextNode(p[0]));
        var b = doc.createElement('b'); b.textContent = p[1]; d.appendChild(b);
        $('o-stats').appendChild(d);
      });
      UI.drawCard($('o-card'), m, total);
      try { $('o-img').src = $('o-card').toDataURL('image/png'); } catch (e) { /* the canvas copy still works for Share */ }
      UI.show('over');
    },

    shareText: function () {
      var t = UI._last ? UI._last.total : 0;
      return 'I scored ' + U.fmt(t) + " in Atharv's Snake Clash! Can you beat me? Made by Atharv Singh, Podar International School, Nerul.";
    },

    drawCard: function (cv, m, total) {
      var c = cv.getContext('2d'), W = cv.width, H = cv.height, i;
      var g = c.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#3e2cae'); g.addColorStop(0.55, '#2a1d78'); g.addColorStop(1, '#8a2a78');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = 'rgba(255,255,255,0.07)';
      for (var y = 40; y < H; y += 90) for (var x = (y / 90 & 1) ? 85 : 40; x < W; x += 90) { c.beginPath(); c.arc(x, y, 6, 0, U.TAU); c.fill(); }
      c.strokeStyle = '#ff7ac6'; c.lineWidth = 14; c.strokeRect(14, 14, W - 28, H - 28);

      c.textAlign = 'center';
      c.fillStyle = '#7fd6ff'; c.font = '800 34px "Trebuchet MS", system-ui, sans-serif';
      c.fillText('ATHARV SINGH PRESENTS', W / 2, 92);
      var tg = c.createLinearGradient(200, 0, 880, 0);
      tg.addColorStop(0, '#ffe066'); tg.addColorStop(0.5, '#ff7ac6'); tg.addColorStop(1, '#7fd6ff');
      c.fillStyle = tg; c.font = '900 118px "Trebuchet MS", system-ui, sans-serif';
      c.fillText("Atharv's", W / 2, 205);
      c.font = '900 150px "Trebuchet MS", system-ui, sans-serif';
      c.fillText('Snake Clash', W / 2, 345);

      var tmp = doc.createElement('canvas'); tmp.width = 960; tmp.height = 260;
      SC.drawPreview(tmp, SC.skins.byId(profile.skin), profile.legged, 0.9, { r: 42, n: 18 });
      c.drawImage(tmp, (W - 960) / 2, 360);

      c.fillStyle = '#ffffff'; c.font = '800 44px "Trebuchet MS", system-ui, sans-serif';
      c.fillText((UI._last && UI._last.name || profile.name) + ' scored', W / 2, 660);
      c.fillStyle = '#ffd23f'; c.font = '900 190px "Trebuchet MS", system-ui, sans-serif';
      c.fillText(U.fmt(total), W / 2, 830);

      var stats = [['SIZE', U.fmt(m.bestMass)], ['BOSSES', m.bossesDefeated + '/' + CFG.BOSSES.length], ['BONUS', String(m.stars)]];
      for (i = 0; i < stats.length; i++) {
        var cx = 210 + i * 330;
        c.fillStyle = 'rgba(0,0,0,0.28)';
        c.beginPath(); c.moveTo(cx - 140 + 24, 870); c.arcTo(cx + 140, 870, cx + 140, 990, 24); c.arcTo(cx + 140, 990, cx - 140, 990, 24);
        c.arcTo(cx - 140, 990, cx - 140, 870, 24); c.arcTo(cx - 140, 870, cx + 140, 870, 24); c.fill();
        c.fillStyle = '#7fd6ff'; c.font = '800 28px "Trebuchet MS", system-ui, sans-serif'; c.fillText(stats[i][0], cx, 905);
        c.fillStyle = '#fff'; c.font = '900 56px "Trebuchet MS", system-ui, sans-serif'; c.fillText(stats[i][1], cx, 965);
      }
      c.fillStyle = 'rgba(255,255,255,0.9)'; c.font = '700 30px "Trebuchet MS", system-ui, sans-serif';
      c.fillText(CFG.CREDIT, W / 2, 1036);
    },

    share: function () {
      var cv = $('o-card'), text = UI.shareText(), note = $('o-note');
      function say(msg, cls) { note.className = 'note ' + (cls || 'good'); note.textContent = msg; }
      // Phone share sheets can be unavailable or refused (for example inside another page): fall back to copying the message.
      function copyInstead() {
        var nav = root.navigator;
        if (nav.clipboard && nav.clipboard.writeText) {
          nav.clipboard.writeText(text).then(
            function () { say('Message copied! Paste it to share. To keep the picture, press and hold it.'); },
            function () { say(text); });
        } else say(text);
      }
      function tried(err) { if (err && err.name === 'AbortError') return; copyInstead(); }   // AbortError = they closed the sheet
      cv.toBlob(function (blob) {
        var nav = root.navigator, file = null;
        try { file = new root.File([blob], 'atharvs-snake-clash-score.png', { type: 'image/png' }); } catch (e) { file = null; }
        try {
          if (file && nav.canShare && nav.canShare({ files: [file] })) {
            nav.share({ title: CFG.TITLE, text: text, files: [file] }).catch(tried);
          } else if (nav.share) {
            var data = { title: CFG.TITLE, text: text };
            if (/^https?:/.test(root.location.href)) data.url = root.location.href;
            nav.share(data).catch(tried);
          } else copyInstead();
        } catch (e) { copyInstead(); }
      }, 'image/png');
    },
    savePicture: function () {
      $('o-card').toBlob(function (blob) {
        UI.download(blob);
        // Some pages are not allowed to start downloads, so always say how to save by hand too.
        var n = $('o-note'); n.className = 'note good';
        n.textContent = 'Saving your picture... If nothing downloads, press and hold (or right-click) the picture and choose Save image.';
      }, 'image/png');
    },
    download: function (blob) {
      var a = doc.createElement('a');
      a.href = root.URL.createObjectURL(blob); a.download = 'atharvs-snake-clash-score.png';
      doc.body.appendChild(a); a.click(); doc.body.removeChild(a);
      root.setTimeout(function () { root.URL.revokeObjectURL(a.href); }, 4000);
    },

    // ---------------------------------------------------------------- name box + title + about
    // Shown every time the game opens, so friends always get to type who they are (the last name is filled in).
    showName: function () {
      var inp = $('n-input');
      inp.value = profile.name || '';
      setText('n-error', '');
      UI.show('name');
      try { inp.focus(); inp.select(); } catch (e) { /* ok */ }
    },
    // returns true if a good name was entered
    submitName: function () {
      var inp = $('n-input'), raw = inp.value.replace(/[<>]/g, '').trim();
      if (!raw) {
        setText('n-error', 'Please type your name first!');
        inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake');
        try { inp.focus(); } catch (e) { /* ok */ }
        return false;
      }
      profile.name = U.cleanName(raw);
      saveProfile();
      return true;
    },
    refreshTitle: function () {
      $('t-best').textContent = profile.best > 0 ? 'Your best score: ' + U.fmt(profile.best) : '';
      $('t-name').textContent = profile.name || 'Player';
      UI.refreshToggles();
    },
    // 'checking' | 'online' | 'solo'
    setServer: function (state, count) {
      var st = $('t-status'), play = $('b-play'), solo = $('b-solo');
      st.classList.toggle('on', state === 'online');
      if (state === 'online') {
        st.textContent = count > 0 ? count + (count === 1 ? ' player is' : ' players are') + ' in the arena now. Join them!' : 'The arena is open. Be the first!';
        play.textContent = '\u25B6 PLAY WITH FRIENDS';
        solo.classList.remove('hidden');
      } else {
        st.textContent = state === 'checking' ? 'Looking for friends...' : 'Playing on your own. Friends can join when the game runs on a game server.';
        play.textContent = '\u25B6 PLAY';
        solo.classList.add('hidden');
      }
    },
    refreshToggles: function () {
      ['t-sfx', 'p-sfx'].forEach(function (id) { setClass($(id), 'off', !profile.sfx); });
      ['t-music', 'p-music'].forEach(function (id) { setClass($(id), 'off', !profile.music); });
      $('b-sound').textContent = profile.sfx || profile.music ? '🔊' : '🔇';
    },
    showAbout: function () {
      var box = $('a-stats'); box.innerHTML = '';
      [['Best score', U.fmt(profile.best)], ['Biggest size', U.fmt(profile.bestSize)], ['Most Bosses', profile.bestBosses + '/' + CFG.BOSSES.length],
        ['Bonus points won', profile.totalStars], ['Games played', profile.games]].forEach(function (p) {
        var d = doc.createElement('div'); d.className = 'stat'; d.appendChild(doc.createTextNode(p[0]));
        var b = doc.createElement('b'); b.textContent = p[1]; d.appendChild(b); box.appendChild(d);
      });
      UI.show('about');
    },

    // ---------------------------------------------------------------- customize
    buildCustomize: function () {
      var grid = $('c-skins'); grid.innerHTML = '';
      [['common', 'Colors'], ['shiny', 'Shiny'], ['fancy', 'Fancy']].forEach(function (g) {
        var h = doc.createElement('div'); h.className = 'skin-group'; h.textContent = g[1]; grid.appendChild(h);
        var row = doc.createElement('div'); row.className = 'skin-row'; grid.appendChild(row);
        SC.skins.list.filter(function (s) { return s.tier === g[0]; }).forEach(function (sk) {
          var b = doc.createElement('button'); b.className = 'skin'; b.dataset.id = sk.id; b.title = sk.name;
          b.setAttribute('aria-label', sk.name + (sk.tier === 'common' ? '' : ' (' + sk.tier + ')'));
          var cv = doc.createElement('canvas'); cv.width = 116; cv.height = 80;
          SC.drawPreview(cv, sk, false, 0.7, { r: 11, n: 9 });
          b.appendChild(cv);
          b.addEventListener('click', function () { profile.skin = sk.id; saveProfile(); UI.syncCustomize(); SC.audio.play('click'); });
          row.appendChild(b);
        });
      });
      function seg(id, key, conv) {
        Array.prototype.forEach.call($(id).children, function (b) {
          b.addEventListener('click', function () { profile[key] = conv(b.dataset.v); saveProfile(); UI.syncCustomize(); SC.audio.play('click'); });
        });
      }
      seg('c-legs', 'legged', function (v) { return v === '1'; });
      seg('c-diff', 'difficulty', function (v) { return v; });
      $('c-name').addEventListener('input', function () {
        profile.name = this.value.replace(/[<>]/g, '').slice(0, 12); saveProfile();
      });
      $('c-name').addEventListener('blur', function () {
        profile.name = profile.name.trim() || 'Player'; this.value = profile.name; saveProfile();
      });
    },
    syncCustomize: function () {
      Array.prototype.forEach.call(doc.querySelectorAll('#c-skins .skin'), function (b) { setClass(b, 'sel', b.dataset.id === profile.skin); });
      Array.prototype.forEach.call($('c-legs').children, function (b) { setClass(b, 'sel', (b.dataset.v === '1') === profile.legged); });
      Array.prototype.forEach.call($('c-diff').children, function (b) { setClass(b, 'sel', b.dataset.v === profile.difficulty); });
      $('c-name').value = profile.name;
    },
    tick: function (t) {
      if (UI.current === 'title') SC.drawPreview($('t-snake'), SC.skins.byId(profile.skin), profile.legged, t, { r: 19, n: 16 });
      else if (UI.current === 'custom') SC.drawPreview($('c-preview'), SC.skins.byId(profile.skin), profile.legged, t, { r: 24, n: 16 });
    },

    // ---------------------------------------------------------------- how to play
    SLIDES: [
      { art: ['👆', '🖱️', '⌨️'], title: 'Steer your snake', text: 'Drag your finger, move the mouse, or use the arrow keys.' },
      { art: ['🥚', '✨', '🥚'], title: 'Eat eggs to grow', text: 'Golden eggs give you a bubble shield!' },
      { art: ['🐍', '➡️', '😋'], title: 'Bump snakes to eat them', text: 'Regular snakes are yummy. Go get them!' },
      { art: ['🎁', '❓', '✨'], title: 'Open mystery boxes!', text: 'Purple boxes give a surprise. Some are super, some are silly: speed, legs, shine, blasts and more!' },
      { art: ['👑', '😱', '⚠️'], title: 'Beware of the King!', text: 'The biggest snake wears the crown and can eat YOU. Follow the gold arrow to see where it is.' },
      { art: ['👹', '➡️', '🏆'], title: 'Beat the Boss!', text: 'Get bigger than the Boss, then bump it. You win a score multiplier!' },
      { art: ['❤️', '⭐', '❤️'], title: 'You get 29 revives', text: 'Eaten? You get a bonus point and can try again!' },
      { art: ['👋', '🐍', '👋'], title: 'Playing with friends?', text: 'Friends have blue names. You slide past each other, but whoever is King can eat everyone!' }
    ],
    how: { i: 0, then: null },
    startHow: function (then) {
      UI.how.i = 0; UI.how.then = then || null; UI.renderHow(); UI.show('how');
    },
    renderHow: function () {
      var s = UI.SLIDES[UI.how.i], art = $('how-art');
      art.innerHTML = '';
      s.art.forEach(function (e) { var sp = doc.createElement('span'); sp.textContent = e; art.appendChild(sp); });
      $('how-title').textContent = s.title; $('how-text').textContent = s.text;
      var dots = $('how-dots'); dots.innerHTML = '';
      UI.SLIDES.forEach(function (_, k) { var d = doc.createElement('i'); if (k === UI.how.i) d.className = 'on'; dots.appendChild(d); });
      $('how-next').textContent = UI.how.i === UI.SLIDES.length - 1 ? (UI.how.then ? "Let's go! ▶" : 'Got it! ✔') : 'Next ▶';
    },
    nextHow: function () {
      if (UI.how.i < UI.SLIDES.length - 1) { UI.how.i++; UI.renderHow(); } else UI.endHow();
    },
    endHow: function () {
      profile.seenHow = true; saveProfile();
      var then = UI.how.then; UI.how.then = null;
      if (then) then(); else UI.show(UI.how.back || 'title');
    }
  };

  function setDeath(id, txt) { $(id).textContent = txt; }
})(typeof window !== 'undefined' ? window : globalThis);
