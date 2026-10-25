import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.env.XD_LOCAL_PORT || 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
try {
  await stat(path.join(root, 'index.html'));
} catch {
  console.error('找不到 dist/index.html，請先執行 npm run build。');
  process.exit(1);
}
const server = createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }
  const expectedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  if (!expectedHosts.has(req.headers.host)) {
    res.writeHead(403);
    res.end('Local access only');
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root) || pathname.includes('\0')) {
      res.writeHead(403);
      res.end();
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('找不到檔案');
  }
});
server.on('error', (error) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? `連接埠 ${port} 已被使用；若工具已啟動，直接開啟下方網址即可。`
      : error.message
  );
  console.error(`http://127.0.0.1:${port}`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () =>
  console.log(
    `XD Local 已啟動：http://127.0.0.1:${port}\n所有設計檔案僅在瀏覽器本機處理。按 Ctrl+C 關閉服務。`
  )
);
