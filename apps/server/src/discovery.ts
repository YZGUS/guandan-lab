import type { IncomingMessage } from 'node:http';

type Environment = Record<string, string | undefined>;

function normalize(raw: string) {
  try {
    const url = new URL(raw.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    return url.toString().replace(/\/$/, '');
  } catch { return null; }
}

export function discoveryDocument(request: Pick<IncomingMessage, 'headers'>, environment: Environment = process.env) {
  const configured = environment.GUANDAN_RELAY_ENDPOINTS ?? environment.GUANDAN_PUBLIC_URL ?? '';
  let endpoints = configured.split(',').map(normalize).filter((value): value is string => Boolean(value));
  if (!endpoints.length) {
    const host = Array.isArray(request.headers.host) ? request.headers.host[0] : request.headers.host;
    const protoHeader = request.headers['x-forwarded-proto'];
    const proto = (Array.isArray(protoHeader) ? protoHeader[0] : protoHeader)?.split(',')[0]?.trim() ?? 'http';
    const inferred = host ? normalize(`${proto}://${host}`) : null;
    if (inferred) endpoints = [inferred];
  }
  endpoints = [...new Set(endpoints)].slice(0, 20);
  return { schemaVersion: 1, endpoints: endpoints.map((url, index) => ({ url, label: index ? `Guandan Lab ${index + 1}` : 'Guandan Lab' })) };
}
