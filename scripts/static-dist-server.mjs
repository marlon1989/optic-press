import { createReadStream, existsSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { createServer } from 'node:http';

const port = Number(process.argv[2] || 5174);
const distRoot = resolve('dist');

const mimeTypes = {
  '.css': 'text/css',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript',
  '.png': 'image/png',
};

function resolveStaticPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, `http://127.0.0.1:${port}`).pathname);
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = normalize(join(distRoot, relativePath));
  return filePath.startsWith(`${distRoot}${sep}`) ? filePath : null;
}

function sendStaticFile(response, filePath) {
  if (!filePath || !existsSync(filePath)) {
    response.writeHead(404);
    response.end('not found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
  });
  createReadStream(filePath).pipe(response);
}

const server = createServer((request, response) => {
  sendStaticFile(response, resolveStaticPath(request.url || '/'));
});

server.listen(port, '127.0.0.1', () => {
  console.log(`static dist server ready on http://127.0.0.1:${port}`);
});
