import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { AuthService, DeploymentPolicy } from './auth.js';
import { discoveryDocument } from './discovery.js';
import { GameServer } from './game-server.js';
import { RoomService, type PersistedRoom } from './room-service.js';
import { JsonDirectoryStore, type SessionRecord } from './storage.js';

const port = Number(process.env.PORT ?? 8788);
const host = process.env.HOST ?? '0.0.0.0';
const workspaceRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const dataDirectory = process.env.GUANDAN_DATA_DIR ?? join(workspaceRoot, '.data', 'guandan');
const webDist = process.env.GUANDAN_WEB_DIST ?? join(workspaceRoot, 'apps', 'web', 'dist');
const deployment = new DeploymentPolicy();
const roomStore = new JsonDirectoryStore<PersistedRoom>(join(dataDirectory, 'rooms'));
const sessionStore = new JsonDirectoryStore<SessionRecord>(join(dataDirectory, 'sessions'));
const auth = new AuthService(deployment, sessionStore);
const service = new RoomService(roomStore);

const mimeTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
};

const httpServer = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname === '/health') {
      json(response, 200, { ok: true, service: 'guandan-lab', rooms: service.roomCount(), mode: deployment.mode, lastActivityAt: service.lastActivityAt() });
      return;
    }
    if (url.pathname === '/.well-known/guandan-lab.json' && request.method === 'GET') {
      json(response, 200, discoveryDocument(request));
      return;
    }
    if (url.pathname === '/api/auth/status' && request.method === 'GET') {
      if (deployment.mode === 'local') { json(response, 200, { mode: 'local', authenticated: true }); return; }
      try { auth.authenticateCloud(request); json(response, 200, { mode: 'cloud', authenticated: true }); }
      catch { json(response, 200, { mode: 'cloud', authenticated: false }); }
      return;
    }
    if (url.pathname === '/api/auth/invite' && request.method === 'POST') {
      if (deployment.mode !== 'cloud') { json(response, 404, { error: '本地模式不需要登录' }); return; }
      const body = await readJsonBody(request, 4_096) as { code?: unknown };
      if (typeof body.code !== 'string') { json(response, 400, { error: '请输入邀请码' }); return; }
      const session = auth.login(body.code.trim(), request);
      response.setHeader('set-cookie', auth.cookie(session.id, secureCookie(request)));
      json(response, 200, { authenticated: true });
      return;
    }
    if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
      auth.logout(request);
      response.setHeader('set-cookie', auth.clearCookie(secureCookie(request)));
      json(response, 200, { authenticated: false });
      return;
    }
    await serveStatic(request, response);
  } catch (error) {
    const statusCode = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 500;
    json(response, statusCode, { error: error instanceof Error ? error.message : '请求失败' });
  }
});

const socketServer = new WebSocketServer({
  server: httpServer,
  path: '/ws',
  maxPayload: deployment.maxPayloadBytes,
  verifyClient(info, done) {
    try {
      if (!deployment.acceptsOrigin(info.req)) throw new Error('请求来源不被允许');
      if (deployment.mode === 'cloud') auth.authenticateCloud(info.req);
      done(true);
    } catch { done(false, 401, 'Unauthorized'); }
  },
});
const gameServer = new GameServer(socketServer, service, auth);

httpServer.on('listening', () => { console.log(`Guandan server listening on http://${host}:${port} (${deployment.mode})`); gameServer.start(); });
httpServer.on('close', () => gameServer.stop());
httpServer.listen(port, host);

async function serveStatic(request: IncomingMessage, response: ServerResponse) {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  const base = resolve(webDist);
  let path = resolve(base, relative);
  if (path !== base && !path.startsWith(`${base}${sep}`)) { response.writeHead(403).end(); return; }
  try {
    const data = await readFile(path);
    response.writeHead(200, { 'content-type': mimeTypes[extname(path)] ?? 'application/octet-stream' });
    response.end(data);
  } catch {
    path = join(base, 'index.html');
    try {
      const data = await readFile(path);
      response.writeHead(200, { 'content-type': mimeTypes['.html'], 'cache-control': 'no-cache' });
      response.end(data);
    } catch {
      response.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Web build is unavailable. Run npm run build first.');
    }
  }
}

function json(response: ServerResponse, statusCode: number, value: unknown) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function readJsonBody(request: IncomingMessage, limit: number) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw Object.assign(new Error('请求内容过大'), { statusCode: 413 });
    chunks.push(buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
  catch { throw Object.assign(new Error('请求格式无效'), { statusCode: 400 }); }
}

function secureCookie(request: IncomingMessage) {
  const forwarded = request.headers['x-forwarded-proto'];
  const proto = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return process.env.GUANDAN_COOKIE_SECURE === 'true' || proto === 'https';
}
