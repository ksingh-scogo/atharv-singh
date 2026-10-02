/* The game server: serves the game page and lets any number of friends play in one shared arena.

     npm install
     npm start            then open  http://localhost:3000   (or this computer's address, from a phone on the same Wi-Fi)

   Environment: PORT (default 3000). Nothing else is needed.
*/
'use strict';
var http = require('http');
var fs = require('fs');
var os = require('os');
var path = require('path');
var zlib = require('zlib');
var WebSocketServer = require('ws').WebSocketServer;
var Arena = require('./arena.js');

var CFG = globalThis.SC.CFG;
var ROOT = path.resolve(__dirname, '..');
var PORT = parseInt(process.env.PORT, 10) || 3000;
var STARTED = Date.now();

// ---------------------------------------------------------------- static files
// Only the game itself is served: index.html, css/ and js/ (never server code, tests or dotfiles).
var TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon'
};
var cache = {};

function servable(rel) {
  return rel === 'index.html' || /^(css|js)\/[A-Za-z0-9_.-]+\.(js|css)$/.test(rel);
}

function serveStatic(req, res) {
  var url = req.url.split('?')[0], rel;
  try { rel = decodeURIComponent(url); } catch (e) { rel = ''; }
  if (rel === '/' || rel === '') rel = '/index.html';
  rel = rel.replace(/^\/+/, '');
  if (rel.indexOf('..') >= 0 || !servable(rel)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
  var file = path.join(ROOT, rel), st;
  try { st = fs.statSync(file); } catch (e) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
  var etag = '"' + st.size + '-' + Math.floor(st.mtimeMs) + '"';
  var headers = {
    'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'ETag': etag,
    'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'
  };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return; }
  var entry = cache[file];
  if (!entry || entry.etag !== etag) {
    var raw = fs.readFileSync(file);
    entry = cache[file] = { etag: etag, raw: raw, gz: zlib.gzipSync(raw, { level: 9 }) };
  }
  var gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (gz) headers['Content-Encoding'] = 'gzip';
  headers['Vary'] = 'Accept-Encoding';
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : (gz ? entry.gz : entry.raw));
}

// ---------------------------------------------------------------- the arena
var arena = new Arena();

var server = http.createServer(function (req, res) {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, players: arena.playerCount(), uptimeSec: Math.round((Date.now() - STARTED) / 1000) }));
    return;
  }
  if (req.url === '/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      players: arena.playerCount(), connections: Object.keys(arena.clients).length, snakes: arena.world.snakes.length,
      msPerTick: +arena.stats.msPerTick.toFixed(2), tickBudgetMs: +(1000 / CFG.TICK_HZ).toFixed(1),
      kbSentTotal: Math.round(arena.stats.bytesOut / 1024), uptimeSec: Math.round((Date.now() - STARTED) / 1000)
    }));
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  serveStatic(req, res);
});

var wss = new WebSocketServer({ server: server, path: '/ws', maxPayload: 2048, perMessageDeflate: false });

wss.on('connection', function (ws) {
  ws.isAlive = true;
  ws.on('pong', function () { ws.isAlive = true; });
  var id = arena.addClient(function (text) {
    if (ws.readyState !== 1) return;
    if (ws.bufferedAmount > 4 * 1024 * 1024) { ws.terminate(); return; }   // far too slow to keep up
    if (ws.bufferedAmount > 256 * 1024) return;                            // a little behind: skip this one
    ws.send(text);
  });
  arena.clients[id].close = function () { try { ws.close(); } catch (e) { /* already closed */ } };
  ws.on('message', function (data) { arena.handle(id, data.toString()); });
  ws.on('close', function () { arena.removeClient(id); });
  ws.on('error', function () { /* the close event follows */ });
});

// drop connections that stopped answering
var beat = setInterval(function () {
  wss.clients.forEach(function (ws) {
    if (!ws.isAlive) { ws.terminate(); return; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) { /* closing */ }
  });
}, 20000);

// ---------------------------------------------------------------- the clock
var last = process.hrtime.bigint();
var clock = setInterval(function () {
  var now = process.hrtime.bigint();
  var dt = Math.min(0.05, Number(now - last) / 1e9);
  last = now;
  arena.tick(dt);
}, Math.round(1000 / CFG.TICK_HZ));

function lanAddresses() {
  var out = [], nets = os.networkInterfaces();
  Object.keys(nets).forEach(function (k) {
    nets[k].forEach(function (a) { if (a.family === 'IPv4' && !a.internal) out.push(a.address); });
  });
  return out;
}

server.listen(PORT, '0.0.0.0', function () {
  console.log("Atharv's Snake Clash is running!");
  console.log('  On this computer:    http://localhost:' + PORT);
  lanAddresses().forEach(function (ip) { console.log('  On the same Wi-Fi:   http://' + ip + ':' + PORT); });
  console.log('  Health check:        http://localhost:' + PORT + '/healthz');
});

function shutdown() {
  clearInterval(clock); clearInterval(beat);
  wss.clients.forEach(function (ws) { try { ws.close(1001); } catch (e) { /* ignore */ } });
  server.close(function () { process.exit(0); });
  setTimeout(function () { process.exit(0); }, 2000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = { server: server, arena: arena };
