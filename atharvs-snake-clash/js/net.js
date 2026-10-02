/* The connection to the game server (when there is one).
   Online play needs the game to be served by `npm start` (or any host running server/server.js).
   Opened straight from a file, or from a plain web host, there is no server: the game plays solo. */
(function (root) {
  'use strict';
  var SC = root.SC = root.SC || {};
  var PROTOCOL = 1;

  // One connection. The game uses SC.net; tests make many with SC.createNet({ url }).
  function createNet(opts) {
  var net = {
    state: 'idle',        // idle | connecting | open | closed
    available: false,     // is there a game server to play on?
    online: 0,            // how many players are in the arena right now
    rtt: 0,               // round-trip time in ms
    mirror: new SC.Mirror(),
    url: opts && opts.url || null,
    onClose: null,        // called when an open connection drops
    onKick: null,
    _ws: null, _joinCb: null, _lastAngle: 99, _lastSent: 0, _timers: []
  };

  // Where would the game server be? Same place the page came from, or ?server=... in the address.
  net.serverUrl = function () {
    if (net.url) return net.url;
    if (root.SC_NO_SERVER) return null;      // the single-file build has no server to talk to
    var loc = root.location;
    if (!loc) return null;
    var q = /[?&]server=([^&]+)/.exec(loc.search || '');
    if (q) {
      var v = decodeURIComponent(q[1]);
      if (/^wss?:\/\//.test(v)) return v;
      return (loc.protocol === 'https:' ? 'wss://' : 'ws://') + v.replace(/^\/+/, '') + (/\/ws$/.test(v) ? '' : '/ws');
    }
    if (loc.protocol === 'http:' || loc.protocol === 'https:') return (loc.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + loc.host + '/ws';
    return null;
  };

  function clearTimers() { net._timers.forEach(function (t) { clearTimeout(t); clearInterval(t); }); net._timers = []; }

  // Try to reach the server. cb(true) once it says hello, cb(false) if nothing answers in a few seconds.
  net.connect = function (cb) {
    var url = net.serverUrl(), done = false, ws;
    function finish(ok) { if (done) return; done = true; net.available = ok; if (!ok && ws) { try { ws.close(); } catch (e) { /* ok */ } } if (cb) cb(ok); }
    if (!url || typeof root.WebSocket === 'undefined') { net.state = 'closed'; finish(false); return; }
    if (net._ws && net.state === 'open') { finish(true); return; }
    net.state = 'connecting';
    try { ws = new root.WebSocket(url); } catch (e) { net.state = 'closed'; finish(false); return; }
    net._ws = ws;
    var t = setTimeout(function () { if (net.state === 'connecting') { net.state = 'closed'; finish(false); } }, 3500);
    ws.onmessage = function (ev) {
      var msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
      switch (msg.t) {
        case 'hi':
          if (msg.v !== PROTOCOL) { net.state = 'closed'; finish(false); return; }
          clearTimeout(t); net.state = 'open'; net.online = msg.online; finish(true);
          net._timers.push(setInterval(function () { net.send({ t: 'ping', ts: Date.now() }); }, 5000));
          break;
        case 'joined':
          net.mirror.clear();
          net.mirror.localId = msg.id; net.mirror.myName = msg.name;
          if (net._joinCb) { var f = net._joinCb; net._joinCb = null; f(true, msg); }
          break;
        case 's': net.mirror.apply(msg); break;
        case 'pong': net.rtt = Math.max(0, Date.now() - msg.ts); if (typeof msg.online === 'number') net.online = msg.online; break;
        case 'kick': if (net.onKick) net.onKick(msg.why); break;
        default: break;
      }
    };
    ws.onclose = function () {
      clearTimeout(t); clearTimers();
      var was = net.state;
      net.state = 'closed'; net._ws = null;
      if (net._joinCb) { var f = net._joinCb; net._joinCb = null; f(false); }
      if (was === 'connecting') finish(false);
      else if (was === 'open' && net.onClose) net.onClose();
    };
    ws.onerror = function () { /* onclose follows */ };
  };

  net.send = function (obj) {
    if (net._ws && net.state === 'open' && net._ws.readyState === 1) { net._ws.send(JSON.stringify(obj)); return true; }
    return false;
  };

  // Join the arena (or start a new run). cb(ok, joinedMessage)
  net.join = function (profile, cb) {
    if (net.state !== 'open') { cb(false); return; }
    net._joinCb = cb;
    net.mirror.brave = profile.difficulty === 'brave';
    net.send({ t: 'join', name: profile.name, skin: profile.skin, legged: !!profile.legged, difficulty: profile.difficulty });
    net._timers.push(setTimeout(function () { if (net._joinCb === cb) { net._joinCb = null; cb(false); } }, 6000));
  };

  // Tell the server where I want to go (only when it changed, and not too often)
  net.input = function (angle) {
    if (angle == null) return;
    var now = Date.now();
    if (Math.abs(angle - net._lastAngle) < 0.035 && now - net._lastSent < 400) return;
    if (now - net._lastSent < 50) return;
    net._lastAngle = angle; net._lastSent = now;
    net.send({ t: 'in', a: Math.round(angle * 100) / 100 });
  };

  net.revive = function () { return net.send({ t: 'revive' }); };
  net.finish = function () { return net.send({ t: 'finish' }); };
  net.afk = function (on) { return net.send({ t: 'afk', on: !!on }); };

  net.leave = function () {
    clearTimers();
    var ws = net._ws; net._ws = null; net.state = 'idle'; net.onClose = null;
    if (ws) { ws.onclose = null; try { ws.close(); } catch (e) { /* ok */ } }
    net.available = false;
  };

  return net;
  }

  SC.createNet = createNet;
  SC.net = createNet();
})(typeof window !== 'undefined' ? window : globalThis);
