import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isLanAddress, pairingAddresses } from '../src/lib/pairing';
import type { PairingPayload } from '../src/lib/types';

const payload: PairingPayload = {
  type: 'dsh-pair',
  version: 1,
  proto: 2,
  instanceId: 'a1b2c3d4',
  ticket: 'A'.repeat(43),
  lanUrls: ['http://192.168.1.2:18787'],
  directUrl: 'http://100.100.1.2:18787',
  ipv6Candidates: ['http://[fd00::2]:18787'],
  relayUrl: 'https://public-relay.example.com',
  relayUrls: ['https://public-relay-2.example.com'],
};

test('LAN-only pairing never includes relay addresses', () => {
  assert.deepEqual(pairingAddresses(payload), [
    'http://192.168.1.2:18787',
    'http://100.100.1.2:18787',
    'http://[fd00::2]:18787',
  ]);
});

test('recognizes private, local and tailnet addresses but rejects public hosts', () => {
  for (const address of ['http://localhost:18787', 'http://10.0.0.2:18787', 'http://172.20.0.2:18787', 'http://192.168.1.2:18787', 'http://100.80.0.2:18787', 'http://host.local:18787', 'http://[fe80::1]:18787']) {
    assert.equal(isLanAddress(address), true, address);
  }
  for (const address of ['https://example.com', 'http://8.8.8.8', 'http://172.32.0.1', 'not a URL']) {
    assert.equal(isLanAddress(address), false, address);
  }
});
