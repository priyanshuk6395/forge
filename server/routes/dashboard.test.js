'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { telemetrySignals } = require('./dashboard');

function serverWithTelemetry(checkedAt, { agent = 'ready', tls = 'valid', network = true } = {}) {
  return {
    status: 'ready',
    agent: { state: agent },
    telemetry: {
      checkedAt: new Date(checkedAt).toISOString(),
      network: network ? { receivedBytes: 100, sentBytes: 200 } : {},
      tls: { state: tls },
    },
  };
}

test('dashboard reports healthy agent, network, and TLS signals from fresh snapshots', () => {
  const now = Date.now();
  assert.deepEqual(telemetrySignals([serverWithTelemetry(now - 30_000)], now), {
    agent: 'healthy',
    network: 'healthy',
    ssl: 'healthy',
  });
});

test('dashboard marks incomplete and stale host coverage accurately', () => {
  const now = Date.now();
  const fresh = serverWithTelemetry(now - 30_000);
  const stale = serverWithTelemetry(now - 5 * 60_000);

  assert.deepEqual(telemetrySignals([fresh, stale], now), {
    agent: 'attention',
    network: 'attention',
    ssl: 'attention',
  });
  assert.deepEqual(telemetrySignals([stale], now), {
    agent: 'attention',
    network: 'unknown',
    ssl: 'unknown',
  });
});

test('dashboard marks expired TLS critical, untrusted TLS attention, and unverified TLS unknown', () => {
  const now = Date.now();
  assert.equal(telemetrySignals([serverWithTelemetry(now, { tls: 'expired' })], now).ssl, 'critical');
  assert.equal(telemetrySignals([serverWithTelemetry(now, { tls: 'untrusted' })], now).ssl, 'attention');
  assert.equal(telemetrySignals([serverWithTelemetry(now, { tls: 'unavailable' })], now).ssl, 'unknown');
  assert.deepEqual(telemetrySignals([], now), { agent: 'unknown', network: 'unknown', ssl: 'unknown' });
});