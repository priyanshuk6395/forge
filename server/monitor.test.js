'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-monitor-test-'));
process.env.ENCRYPTION_KEY = '8'.repeat(64);

const db = require('./db');
const ssh = require('./ssh');
const monitor = require('./monitor');

process.on('exit', () => {
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

test('telemetry scheduler refreshes, marks stale, and recovers installed agents', async (t) => {
  const server = {
    id: 'srv_monitor',
    name: 'Monitor test host',
    host: '192.0.2.40',
    status: 'ready',
    agent: { state: 'ready', installedAt: '2026-10-05T00:00:00Z' },
    telemetry: { checkedAt: '2026-10-04T00:00:00Z' },
  };
  db.get().servers = [server];
  db.saveSync();

  const originalReadAgentTelemetry = ssh.readAgentTelemetry;
  let shouldFail = false;
  let checkedAt = new Date().toISOString();
  ssh.readAgentTelemetry = async () => {
    if (shouldFail) throw new Error('SSH connection refused.');
    return {
      checkedAt,
      collector: 'agent',
      cpuPercent: 14,
      network: { receivedBytes: 500, sentBytes: 200 },
    };
  };
  t.after(() => { ssh.readAgentTelemetry = originalReadAgentTelemetry; });

  await monitor.tickTelemetry();
  assert.equal(server.agent.state, 'ready');
  assert.equal(server.telemetry.cpuPercent, 14);
  assert.ok(server.agent.lastSeenAt);

  checkedAt = '2026-10-01T00:00:00.000Z';
  await monitor.tickTelemetry();
  assert.equal(server.agent.state, 'stale');

  checkedAt = new Date().toISOString();
  await monitor.tickTelemetry();
  assert.equal(server.agent.state, 'ready');

  shouldFail = true;
  await monitor.tickTelemetry();
  assert.equal(server.agent.state, 'stale');
  assert.match(server.agent.lastError, /did not return a current snapshot/);

  shouldFail = false;
  await monitor.tickTelemetry();
  assert.equal(server.agent.state, 'ready');
  assert.equal(server.telemetry.collector, 'agent');
});