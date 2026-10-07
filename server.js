/* Minimal static server for local use on the sales-gallery network.
   node server.js [port]   →   http://localhost:8080  */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.argv[2] || process.env.PORT || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon'
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel.endsWith('/')) rel += 'index.html';          // '/' and '/admin/'
  else if (!path.extname(rel)) rel += '/index.html';   // '/admin'

  const file = path.join(ROOT, path.normalize(rel));
  // never serve outside the project directory
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      // the service worker must always be revalidated, or iPads pin an old build
      'Cache-Control': path.basename(file) === 'sw.js' ? 'no-cache' : 'no-cache'
    }).end(buf);
  });
}).listen(PORT, () => {
  console.log('Anyara Hills proposal app → http://localhost:' + PORT);
});
