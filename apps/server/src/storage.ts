import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface EntityStore<T extends { id: string }> {
  list(): T[];
  get(id: string): T | undefined;
  put(value: T): void;
  delete(id: string): void;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class MemoryEntityStore<T extends { id: string }> implements EntityStore<T> {
  private readonly values = new Map<string, T>();
  list() { return [...this.values.values()].map(clone); }
  get(id: string) { const value = this.values.get(id); return value ? clone(value) : undefined; }
  put(value: T) { this.values.set(value.id, clone(value)); }
  delete(id: string) { this.values.delete(id); }
}

export class JsonDirectoryStore<T extends { id: string }> implements EntityStore<T> {
  constructor(private readonly directory: string) {
    mkdirSync(directory, { recursive: true });
  }

  list() {
    return readdirSync(this.directory)
      .filter((name) => name.endsWith('.json'))
      .flatMap((name) => {
        try { return [JSON.parse(readFileSync(join(this.directory, name), 'utf8')) as T]; }
        catch { return []; }
      });
  }

  get(id: string) {
    try { return JSON.parse(readFileSync(this.path(id), 'utf8')) as T; }
    catch { return undefined; }
  }

  put(value: T) {
    const target = this.path(value.id);
    const temporary = `${target}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(value));
    renameSync(temporary, target);
  }

  delete(id: string) {
    rmSync(this.path(id), { force: true });
  }

  private path(id: string) {
    return join(this.directory, `${encodeURIComponent(id)}.json`);
  }
}

export interface SessionRecord {
  id: string;
  userId: string;
  displayName: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  revokedAt: number | null;
}

export class RateLimitStore {
  private readonly entries = new Map<string, number[]>();

  consume(key: string, limit: number, windowMs: number, now = Date.now()) {
    const threshold = now - windowMs;
    const recent = (this.entries.get(key) ?? []).filter((value) => value > threshold);
    if (recent.length >= limit) return false;
    recent.push(now);
    this.entries.set(key, recent);
    return true;
  }

  cleanup(now = Date.now()) {
    for (const [key, values] of this.entries) {
      const recent = values.filter((value) => value > now - 60 * 60_000);
      if (recent.length) this.entries.set(key, recent); else this.entries.delete(key);
    }
  }
}
