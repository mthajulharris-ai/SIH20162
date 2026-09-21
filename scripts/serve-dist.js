/* ==========================================================================
   Tiny dependency-free static server that serves the Vite build output
   (..\frontend\dist) with correct MIME types, including video/mp4 so the
   <video> galaxy background loads.
   ========================================================================== */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'frontend', 'dist');
const PORT = parseInt(process.env.PORT || '8090', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'application/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function safeResolve(urlPath) {
  const decoded = decodeURIComponent((urlPath || '/').split('?')[0]);
  const normalized = decoded.split('/').map((seg) => seg).filter((seg) => seg !== '' && seg !== '.' && seg !== '..');
  let target = ROOT;
  for (const seg of normalized) target = path.join(target, seg);
  // Ensure we stay within ROOT
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return path.join(ROOT, 'index.html');
  return target;
}

http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  let target = safeResolve(urlPath);
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }
  const ext = path.extname(target).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const stat = fs.statSync(target);
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache',
    'Accept-Ranges': 'bytes',
  });
  fs.createReadStream(target).pipe(res);
}).listen(PORT, () => {
  console.log('[serve-dist] serving ' + ROOT + ' -> http://localhost:' + PORT);
});
