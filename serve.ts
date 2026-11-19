// SOLARIS HEAT — tiny local development server.
//
// Serves this repository's game/ folder so the game can be played and
// screenshotted in a desktop browser with no build step:
//   node serve.ts              -> http://localhost:8080
//   node serve.ts --port 8137  -> http://localhost:8137
// It answers only files inside game/, sends the content types a browser game
// needs, and never serves anything outside that folder.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = resolve(fileURLToPath(new URL('./game', import.meta.url)));

function pickPort(argv: string[]): number {
  const at = argv.indexOf('--port');
  const value = at === -1 ? 8080 : Number(argv[at + 1]);
  return Number.isInteger(value) && value > 0 && value < 65_536 ? value : 8080;
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
};

function resolveInsideGame(pathname: string): string | null {
  const file = resolve(join(gameRoot, normalize(pathname)));
  if (file !== gameRoot && !file.startsWith(gameRoot + sep)) return null;
  return file;
}

createServer((request, response) => {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = resolveInsideGame(pathname);
  if (file === null) {
    response.writeHead(403).end('forbidden');
    return;
  }
  let size: number;
  try {
    const stats = statSync(file);
    if (!stats.isFile()) throw new Error('not a file');
    size = stats.size;
  } catch {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, {
    'content-type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
}).listen(pickPort(process.argv.slice(2)), '127.0.0.1', () => {
  console.log(`solaris-heat: game/ is on http://localhost:${pickPort(process.argv.slice(2))}`);
});
