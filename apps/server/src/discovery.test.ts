import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { discoveryDocument } from './discovery.js';

describe('Guandan endpoint discovery', () => {
  it('publishes validated, deduplicated endpoints', () => {
    const document = discoveryDocument({ headers: { host: 'ignored.example' } }, {
      GUANDAN_RELAY_ENDPOINTS: 'https://cards.example.com/guandan/,javascript:bad,https://cards.example.com/guandan/',
    });
    assert.deepEqual(document, {
      schemaVersion: 1,
      endpoints: [{ url: 'https://cards.example.com/guandan', label: 'Guandan Lab' }],
    });
  });

  it('infers a LAN endpoint from the current host', () => {
    const document = discoveryDocument({ headers: { host: '192.168.1.20:8788' } }, {});
    assert.deepEqual(document.endpoints, [{ url: 'http://192.168.1.20:8788', label: 'Guandan Lab' }]);
  });
});
