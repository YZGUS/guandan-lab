import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { describe, it } from 'node:test';
import { AuthService, DeploymentPolicy } from './auth.js';
import { MemoryEntityStore, type SessionRecord } from './storage.js';

function request(options: { cookie?: string; origin?: string; host?: string; ip?: string } = {}) {
  return {
    headers: {
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.origin ? { origin: options.origin } : {}),
      ...(options.host ? { host: options.host } : {}),
    },
    socket: { remoteAddress: options.ip ?? '192.0.2.10' },
  } as unknown as IncomingMessage;
}

describe('authentication modes', () => {
  it('restores a local anonymous identity from its session token', () => {
    const auth = new AuthService(new DeploymentPolicy({ GUANDAN_DEPLOYMENT_MODE: 'local' }), new MemoryEntityStore<SessionRecord>());
    const first = auth.establish(request());
    const resumed = auth.establish(request(), first.sessionId);
    assert.equal(resumed.principal.userId, first.principal.userId);
    assert.equal(resumed.resumed, true);
    assert.equal(auth.sessionToken(resumed), first.sessionId);
  });

  it('uses stable cloud invite identities and HttpOnly cookies', () => {
    const environment = {
      GUANDAN_DEPLOYMENT_MODE: 'cloud',
      GUANDAN_ALLOWED_ORIGINS: 'https://cards.example.com',
      GUANDAN_INVITE_CODES: 'Alice:secret-code',
    };
    const deployment = new DeploymentPolicy(environment);
    const auth = new AuthService(deployment, new MemoryEntityStore<SessionRecord>());
    const first = auth.login('secret-code', request());
    const second = auth.login('secret-code', request({ ip: '192.0.2.11' }));
    assert.equal(first.userId, second.userId);
    assert.notEqual(first.id, second.id);
    assert.match(auth.cookie(first.id, true), /HttpOnly; SameSite=Strict; Path=\/;.*Secure/);
    assert.equal(deployment.acceptsOrigin(request({ origin: 'https://cards.example.com' })), true);
    assert.equal(deployment.acceptsOrigin(request({ origin: 'https://evil.example' })), false);
  });
});
