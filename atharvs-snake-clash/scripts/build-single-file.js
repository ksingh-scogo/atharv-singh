/* Builds ONE html file with everything inside (styles, scripts), for the solo game.
   Handy for hosts that only take a single page. It has no game server, so it plays on your own.
     node scripts/build-single-file.js            writes  dist/atharvs-snake-clash.html
     node scripts/build-single-file.js --artifact also writes dist/artifact.html (for claude.ai artifacts, which add the
                                                  <html>/<head>/<body> wrapper themselves)                              */
'use strict';
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');

var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
var scripts = (html.match(/<script src="[^"]+"><\/script>/g) || []).map(function (tag) {
  var file = /src="([^"]+)"/.exec(tag)[1];
  return fs.readFileSync(path.join(root, file), 'utf8');
});
var js = scripts.join('\n');
if (/<\/script/i.test(js)) throw new Error('a script contains "</script": cannot inline it safely');

var out = html
  .replace(/<link rel="stylesheet" href="css\/style.css">/, function () { return '<style>\n' + css + '\n</style>'; })
  .replace(/\s*<script src="[^"]+"><\/script>/g, '')
  .replace('</body>', function () { return '  <script>window.SC_NO_SERVER = true;</script>\n  <script>\n' + js + '\n  </script>\n</body>'; });

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
var file = path.join(root, 'dist', 'atharvs-snake-clash.html');
fs.writeFileSync(file, out);
console.log('Wrote ' + path.relative(root, file) + ' (' + Math.round(out.length / 1024) + ' KB)');

if (process.argv.indexOf('--artifact') > 0) {
  var body = /<body>([\s\S]*)<\/body>/.exec(out)[1].trim();
  var style = /<style>[\s\S]*?<\/style>/.exec(out)[0];
  var title = /<title>[\s\S]*?<\/title>/.exec(out)[0];
  body = body.replace(style, '');
  var frag = title + '\n' + style + '\n' + body + '\n';
  var af = path.join(root, 'dist', 'artifact.html');
  fs.writeFileSync(af, frag);
  console.log('Wrote ' + path.relative(root, af) + ' (' + Math.round(frag.length / 1024) + ' KB)');
}
