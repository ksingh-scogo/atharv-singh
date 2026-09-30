/* Sounds and music, all made with WebAudio (no files to download, works offline). */
(function (root) {
  'use strict';
  var SC = root.SC = root.SC || {};

  var ac = null, master = null, sfxBus = null, musBus = null;
  var sfxOn = true, musicOn = true, musicTimer = null, step = 0, nextT = 0, lastEgg = 0, lastBite = 0;

  function ensure() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return true; }
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    try {
      ac = new AC();
      master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
      sfxBus = ac.createGain(); sfxBus.gain.value = sfxOn ? 1 : 0; sfxBus.connect(master);
      musBus = ac.createGain(); musBus.gain.value = musicOn ? 0.5 : 0; musBus.connect(master);
    } catch (e) { ac = null; return false; }
    return true;
  }

  function tone(freq, dur, type, vol, slideTo, delay, bus) {
    if (!ac) return;
    var t = ac.currentTime + (delay || 0);
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(dur, vol, freq, delay) {
    if (!ac) return;
    var t = ac.currentTime + (delay || 0), len = Math.floor(ac.sampleRate * dur);
    var buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq || 1800;
    g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t);
  }

  function arp(notes, gap, type, vol, dur) {
    for (var i = 0; i < notes.length; i++) tone(notes[i], dur || 0.18, type || 'triangle', vol, null, i * gap);
  }

  var SFX = {
    click: function () { tone(660, 0.07, 'square', 0.05, 880); },
    egg: function () {
      var n = ac.currentTime; if (n - lastEgg < 0.05) return; lastEgg = n;
      tone(520 + Math.random() * 120, 0.08, 'sine', 0.09, 900);
    },
    golden: function () { arp([784, 988, 1175, 1568], 0.06, 'triangle', 0.12, 0.2); },
    chomp: function () { tone(220, 0.14, 'sawtooth', 0.09, 520); noise(0.08, 0.1, 1200); },
    bite: function () {
      var n = ac.currentTime; if (n - lastBite < 0.045) return; lastBite = n;
      tone(380 + Math.random() * 160, 0.06, 'triangle', 0.07, 700);
    },
    yum: function () { arp([523, 659, 784], 0.07, 'triangle', 0.1, 0.16); },
    die: function () { tone(440, 0.6, 'sawtooth', 0.12, 70); noise(0.35, 0.14, 900); },
    revive: function () { arp([392, 523, 659, 784], 0.09, 'triangle', 0.12, 0.22); },
    star: function () { arp([988, 1319], 0.1, 'sine', 0.12, 0.3); },
    crown: function () { arp([659, 880], 0.12, 'triangle', 0.1, 0.25); },
    warn: function () { for (var i = 0; i < 6; i++) tone(i % 2 ? 330 : 494, 0.22, 'square', 0.06, null, i * 0.26); },
    roar: function () { tone(120, 0.7, 'sawtooth', 0.15, 55); noise(0.6, 0.16, 500); },
    shield: function () { arp([659, 880, 1046], 0.05, 'sine', 0.1, 0.2); },
    win: function () {
      noise(0.25, 0.14, 4000);
      arp([523, 659, 784, 1046], 0.11, 'triangle', 0.15, 0.3);
      arp([784, 988, 1175, 1568], 0.11, 'triangle', 0.12, 0.5);
      tone(1046, 1.1, 'triangle', 0.14, null, 0.6);
      tone(1319, 1.1, 'triangle', 0.1, null, 0.6);
      tone(1568, 1.1, 'triangle', 0.09, null, 0.6);
    },
    champion: function () {
      var seq = [523, 523, 659, 784, 659, 784, 1046, 1046, 1175, 1319, 1568];
      for (var i = 0; i < seq.length; i++) tone(seq[i], 0.3, 'triangle', 0.13, null, i * 0.16);
      noise(0.4, 0.14, 5000, 1.5);
    },
    over: function () { arp([392, 330, 262], 0.16, 'triangle', 0.11, 0.3); }
  };

  // ---- a gentle looping tune ----
  var SCALE = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25]; // C major pentatonic-ish
  var BASS = [130.81, 130.81, 174.61, 196];
  var melody = [0, 2, 4, 2, 5, 4, 2, 1, 0, 2, 4, 7, 5, 4, 2, 0];

  function scheduleMusic() {
    if (!ac) return;
    while (nextT < ac.currentTime + 0.4) {
      var bar = Math.floor(step / 8) % 4, n = melody[step % 16];
      if (step % 2 === 0 || Math.random() < 0.4) tone(SCALE[n], 0.28, 'triangle', 0.05, null, Math.max(0, nextT - ac.currentTime), musBus);
      if (step % 4 === 0) tone(BASS[bar], 0.5, 'sine', 0.07, null, Math.max(0, nextT - ac.currentTime), musBus);
      nextT += 0.25; step++;
    }
  }

  SC.audio = {
    _sfx: SFX,   // exposed so tests can try every sound
    init: function () { return ensure(); },
    configure: function (sfx, music) { sfxOn = !!sfx; musicOn = !!music; },
    play: function (name) {
      if (!sfxOn || !ensure() || !SFX[name]) return;
      try { SFX[name](); } catch (e) { /* ignore audio errors */ }
    },
    setSfx: function (on) { sfxOn = !!on; if (sfxBus) sfxBus.gain.value = sfxOn ? 1 : 0; },
    setMusic: function (on) {
      musicOn = !!on;
      if (musBus) musBus.gain.value = musicOn ? 0.5 : 0;
      if (musicOn && ac) this.startMusic();
    },
    startMusic: function () {
      if (!musicOn || !ensure() || musicTimer) return;
      nextT = ac.currentTime + 0.1;
      musicTimer = setInterval(scheduleMusic, 120);
    },
    stopMusic: function () { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } },
    isSfx: function () { return sfxOn; },
    isMusic: function () { return musicOn; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
