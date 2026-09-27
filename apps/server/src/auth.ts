import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { EntityStore, SessionRecord } from './storage.js';
import { RateLimitStore } from './storage.js';

type Environment = Record<string, string | undefined>;
export type DeploymentMode = 'local' | 'cloud';

export interface Principal {
  userId: string;
  displayName: string;
}

export interface RequestContext {
  principal: Principal;
  sessionId: string;
  resumed: boolean;
  ip: string;
}

export class AccessError extends Error {
  constructor(message: string, readonly statusCode = 403) { super(message); }
}

export class DeploymentPolicy {
  readonly mode: DeploymentMode;
  readonly maxPayloadBytes: number;
  readonly maxConnectionsPerIp: number;
  readonly maxConnectionsPerUser: number;
  readonly maxRooms: number;
  readonly maxRoomsPerUser: number;
  private readonly allowedOrigins: Set<string>;

  constructor(readonly environment: Environment = process.env) {
    this.mode = environment.GUANDAN_DEPLOYMENT_MODE === 'cloud' ? 'cloud' : 'local';
    this.maxPayloadBytes = bounded(environment.GUANDAN_MAX_MESSAGE_BYTES, 32_768, 4_096, 262_144);
    this.maxConnectionsPerIp = bounded(environment.GUANDAN_MAX_CONNECTIONS_PER_IP, this.mode === 'cloud' ? 12 : 50, 1, 500);
    this.maxConnectionsPerUser = bounded(environment.GUANDAN_MAX_CONNECTIONS_PER_USER, this.mode === 'cloud' ? 3 : 8, 1, 50);
    this.maxRooms = bounded(environment.GUANDAN_MAX_ROOMS, this.mode === 'cloud' ? 100 : 500, 1, 10_000);
    this.maxRoomsPerUser = bounded(environment.GUANDAN_MAX_ROOMS_PER_USER, 1, 1, 20);
    this.allowedOrigins = new Set((environment.GUANDAN_ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean));
  }

  acceptsOrigin(request: IncomingMessage) {
    if (this.mode === 'local') return true;
    const origin = request.headers.origin;
    if (!origin || Array.isArray(origin)) return false;
    if (this.allowedOrigins.has(origin)) return true;
    const proto = header(request, 'x-forwarded-proto') ?? 'https';
    const host = header(request, 'x-forwarded-host') ?? header(request, 'host');
    return Boolean(host && origin === `${proto}://${host}`);
  }
}

export class AuthService {
  private readonly ttlMs: number;
  private readonly inviteUsers: Array<{ name: string; code: string; userId: string }>;

  constructor(
    readonly deployment: DeploymentPolicy,
    private readonly sessions: EntityStore<SessionRecord>,
    private readonly limits = new RateLimitStore(),
    private readonly now: () => number = Date.now,
  ) {
    this.ttlMs = bounded(deployment.environment.GUANDAN_SESSION_TTL_MS, 86_400_000, 60_000, 30 * 86_400_000);
    this.inviteUsers = parseInvites(deployment.environment);
    if (deployment.mode === 'cloud' && !this.inviteUsers.length) throw new Error('云端模式必须配置 GUANDAN_INVITE_CODES');
  }

  establish(request: IncomingMessage, sessionToken?: string): RequestContext {
    const ip = clientIp(request, this.deployment.environment);
    if (this.deployment.mode === 'cloud') {
      const session = this.authenticateCloud(request);
      return { principal: principal(session), sessionId: session.id, resumed: true, ip };
    }
    const existing = sessionToken ? this.validSession(sessionToken) : undefined;
    if (existing) return { principal: principal(existing), sessionId: existing.id, resumed: true, ip };
    if (!this.limits.consume(`local-session:${ip}`, 30, 60 * 60_000, this.now())) throw new AccessError('本地会话创建过于频繁', 429);
    const record = this.createSession(`local:${randomUUID()}`, `玩家 ${Math.floor(Math.random() * 900 + 100)}`);
    return { principal: principal(record), sessionId: record.id, resumed: false, ip };
  }

  authorizeFrame(request: IncomingMessage) {
    const ip = clientIp(request, this.deployment.environment);
    if (!this.limits.consume(`frame:${ip}`, 180, 10_000, this.now())) throw new AccessError('消息过于频繁', 429);
  }

  login(code: string, request: IncomingMessage) {
    const ip = clientIp(request, this.deployment.environment);
    if (!this.limits.consume(`login:${ip}`, 10, 15 * 60_000, this.now())) throw new AccessError('邀请码尝试过于频繁', 429);
    const match = this.inviteUsers.find((item) => safeEqual(item.code, code));
    if (!match) throw new AccessError('邀请码无效', 401);
    return this.createSession(match.userId, match.name);
  }

  authenticateCloud(request: IncomingMessage) {
    const id = parseCookies(request.headers.cookie ?? '').get('guandan_auth');
    const session = id ? this.validSession(id) : undefined;
    if (!session) throw new AccessError('请先使用邀请码登录', 401);
    return session;
  }

  validate(context: RequestContext) {
    const record = this.validSession(context.sessionId);
    if (!record || record.userId !== context.principal.userId) throw new AccessError('身份会话已过期', 401);
  }

  logout(request: IncomingMessage) {
    const id = parseCookies(request.headers.cookie ?? '').get('guandan_auth');
    if (!id) return;
    const record = this.sessions.get(id);
    if (record) this.sessions.put({ ...record, revokedAt: this.now() });
  }

  cookie(sessionId: string, secure: boolean) {
    return `guandan_auth=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(this.ttlMs / 1_000)}${secure ? '; Secure' : ''}`;
  }

  clearCookie(secure: boolean) {
    return `guandan_auth=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure ? '; Secure' : ''}`;
  }

  sessionToken(context: RequestContext) {
    return this.deployment.mode === 'local' ? context.sessionId : undefined;
  }

  cleanup() {
    const now = this.now();
    this.sessions.list().filter((record) => record.expiresAt <= now || record.revokedAt !== null).forEach((record) => this.sessions.delete(record.id));
    this.limits.cleanup(now);
  }

  private createSession(userId: string, displayName: string) {
    const now = this.now();
    const record: SessionRecord = { id: randomUUID(), userId, displayName, createdAt: now, lastSeenAt: now, expiresAt: now + this.ttlMs, revokedAt: null };
    this.sessions.put(record);
    return record;
  }

  private validSession(id: string) {
    const record = this.sessions.get(id);
    const now = this.now();
    if (!record || record.revokedAt !== null || record.expiresAt <= now) return undefined;
    const refreshed = { ...record, lastSeenAt: now, expiresAt: now + this.ttlMs };
    this.sessions.put(refreshed);
    return refreshed;
  }
}

function principal(record: SessionRecord): Principal {
  return { userId: record.userId, displayName: record.displayName };
}

function parseInvites(environment: Environment) {
  const raw = environment.GUANDAN_INVITE_CODES ?? (environment.GUANDAN_INVITE_CODE ? `玩家:${environment.GUANDAN_INVITE_CODE}` : '');
  return raw.split(',').map((value) => value.trim()).filter(Boolean).flatMap((entry) => {
    const separator = entry.indexOf(':');
    const name = separator > 0 ? entry.slice(0, separator).trim() : '玩家';
    const code = separator > 0 ? entry.slice(separator + 1).trim() : entry;
    if (!code) return [];
    const userId = `invite:${createHash('sha256').update(code).digest('hex').slice(0, 24)}`;
    return [{ name: name || '玩家', code, userId }];
  });
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseCookies(raw: string) {
  return new Map(raw.split(';').map((part) => part.trim().split('=')).filter((pair) => pair.length === 2).map(([key, value]) => [key, decodeURIComponent(value)]));
}

function header(request: IncomingMessage, key: string) {
  const value = request.headers[key];
  return Array.isArray(value) ? value[0] : value?.split(',')[0]?.trim();
}

export function clientIp(request: IncomingMessage, environment: Environment = process.env) {
  const remote = request.socket.remoteAddress ?? 'unknown';
  const trusted = new Set((environment.GUANDAN_TRUSTED_PROXIES ?? '').split(',').map((value) => value.trim()).filter(Boolean));
  const forwarded = header(request, 'x-forwarded-for');
  if (trusted.has(remote) && forwarded && !forwarded.includes(',')) return forwarded;
  return remote;
}

function bounded(raw: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, Math.round(parsed))) : fallback;
}
