'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-servers-route-test-'));
process.env.ENCRYPTION_KEY = '7'.repeat(64);
delete process.env.FORGE_AWS_ENDPOINT_URL;
delete process.env.AWS_ENDPOINT_URL;

const express = require('express');
const aws = require('../aws');
const { encrypt } = require('../crypto');
const db = require('../db');
const ssh = require('../ssh');
const serversRouter = require('./servers');

process.on('exit', () => {
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

function requirementOutput(overrides = {}) {
  const values = {
    CHECKED_AT: '2026-10-05T00:00:00Z',
    PLATFORM: 'ubuntu',
    PLATFORM_LIKE: 'debian',
    PRIVILEGE: 'ready',
    APT_GET: 'ready',
    SYSTEMD: 'ready',
    DOCKER: 'ready',
    DOCKER_DAEMON: 'ready',
    GIT: 'ready',
    CURL: 'ready',
    ...overrides,
  };
  return Object.entries(values)
    .map(([key, value]) => `FORGE_CHECK_${key}=${value}`)
    .join('\n');
}

function makeReport(overrides = {}) {
  return ssh.parseRequirementReport(requirementOutput(overrides));
}

function resetStore() {
  const store = db.get();
  store.servers = [];
  store.projects = [];
  store.deployments = [];
  store.incidents = [];
  store.audit = [];
  db.saveSync();
}

function mockSsh(t, overrides) {
  const original = { ...ssh };
  Object.assign(ssh, overrides);
  t.after(() => Object.assign(ssh, original));
}

function mockAws(t, overrides) {
  const original = { ...aws };
  Object.assign(aws, overrides);
  t.after(() => Object.assign(aws, original));
}

async function createApi(t) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { username: 'route-test' };
    next();
  });
  app.use('/api/servers', serversRouter);
  app.use((error, req, res, next) => {
    res.status(error.status || 500).json({ error: error.message });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

async function connect(baseUrl, credentials = {}) {
  return fetch(`${baseUrl}/api/servers/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Route test host',
      host: '192.0.2.20',
      sshUser: 'ubuntu',
      sshPort: 22,
      privateKey: 'test-only-private-key',
      ...credentials,
    }),
  });
}

test('telemetry report parses resource counters and certificate expiry', () => {
  const report = ssh.parseTelemetryReport([
    'FORGE_TELEMETRY_CHECKED_AT=2026-10-05T00:00:00Z',
    'FORGE_TELEMETRY_CHECKED_EPOCH=1',
    'FORGE_TELEMETRY_CPU_PERCENT=23.5',
    'FORGE_TELEMETRY_CPU_CORES=2',
    'FORGE_TELEMETRY_LOAD_ONE=0.25',
    'FORGE_TELEMETRY_LOAD_FIVE=0.2',
    'FORGE_TELEMETRY_LOAD_FIFTEEN=0.15',
    'FORGE_TELEMETRY_UPTIME_SECONDS=3600',
    'FORGE_TELEMETRY_PLATFORM=Ubuntu 24.04 LTS',
    'FORGE_TELEMETRY_MEMORY_USED_BYTES=5000000',
    'FORGE_TELEMETRY_MEMORY_TOTAL_BYTES=10000000',
    'FORGE_TELEMETRY_DISK_USED_BYTES=12000000',
    'FORGE_TELEMETRY_DISK_TOTAL_BYTES=100000000',
    'FORGE_TELEMETRY_NETWORK_RECEIVED_BYTES=1000000',
    'FORGE_TELEMETRY_NETWORK_SENT_BYTES=2000000',
    'FORGE_TELEMETRY_NETWORK_INTERFACES=2',
    'FORGE_TELEMETRY_NETWORK_RECEIVED_BPS=4096',
    'FORGE_TELEMETRY_NETWORK_SENT_BPS=1024',
    'FORGE_TELEMETRY_TLS_STATE=valid',
    'FORGE_TELEMETRY_TLS_END_DATE=Oct  5 00:00:00 2027 GMT',
  ].join('\n'), undefined, 'agent');

  assert.deepEqual(report, {
    checkedAt: '2026-10-05T00:00:00Z',
    checkedEpoch: 1,
    collector: 'agent',
    cpuPercent: 23.5,
    cpuCores: 2,
    loadAverage: { one: 0.25, five: 0.2, fifteen: 0.15 },
    uptimeSeconds: 3600,
    platform: 'Ubuntu 24.04 LTS',
    memory: { usedBytes: 5000000, totalBytes: 10000000, percent: 50 },
    disk: { usedBytes: 12000000, totalBytes: 100000000, percent: 12 },
    network: {
      receivedBytes: 1000000,
      sentBytes: 2000000,
      interfaces: 2,
      receivedBytesPerSecond: 4096,
      sentBytesPerSecond: 1024,
    },
    tls: { state: 'valid', expiresAt: '2027-10-05T00:00:00.000Z' },
  });
});

test('telemetry report preserves missing resource counters as unavailable', () => {
  const report = ssh.parseTelemetryReport([
    'FORGE_TELEMETRY_MEMORY_TOTAL_BYTES=10000000',
    'FORGE_TELEMETRY_DISK_USED_BYTES=5000000',
  ].join('\n'));

  assert.equal(report.cpuPercent, null);
  assert.equal(report.memory.percent, null);
  assert.equal(report.disk.percent, null);
  assert.equal(report.network.receivedBytes, null);
  assert.equal(report.tls.state, 'unavailable');
});

test('telemetry report distinguishes an untrusted certificate from a valid one', () => {
  const report = ssh.parseTelemetryReport([
    'FORGE_TELEMETRY_TLS_STATE=untrusted',
    'FORGE_TELEMETRY_TLS_END_DATE=Oct  5 00:00:00 2027 GMT',
  ].join('\n'));

  assert.equal(report.tls.state, 'untrusted');
  assert.equal(report.tls.expiresAt, '2027-10-05T00:00:00.000Z');
});

test('telemetry endpoint returns collected metrics without exposing SSH credentials', async (t) => {
  resetStore();
  const encryptedKey = encrypt('test-only-private-key');
  db.get().servers.push({
    id: 'srv_telemetry',
    name: 'Telemetry host',
    host: '192.0.2.30',
    sshUser: 'ubuntu',
    sshPort: 22,
    provider: 'existing',
    status: 'ready',
    sshKeyEnc: encryptedKey,
  });
  db.saveSync();

  const telemetry = ssh.parseTelemetryReport([
    'FORGE_TELEMETRY_CHECKED_AT=2026-10-05T00:00:00Z',
    'FORGE_TELEMETRY_CPU_PERCENT=23.5',
    'FORGE_TELEMETRY_MEMORY_USED_BYTES=5000000',
    'FORGE_TELEMETRY_MEMORY_TOTAL_BYTES=10000000',
    'FORGE_TELEMETRY_DISK_USED_BYTES=12000000',
    'FORGE_TELEMETRY_DISK_TOTAL_BYTES=100000000',
    'FORGE_TELEMETRY_NETWORK_RECEIVED_BYTES=1000000',
    'FORGE_TELEMETRY_NETWORK_SENT_BYTES=2000000',
    'FORGE_TELEMETRY_TLS_STATE=not_configured',
  ].join('\n'));
  let collectedServer;
  mockSsh(t, {
    collectTelemetry: async (server) => {
      collectedServer = server;
      return telemetry;
    },
  });

  const baseUrl = await createApi(t);
  const response = await fetch(`${baseUrl}/api/servers/srv_telemetry/telemetry`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { telemetry });
  assert.equal(collectedServer.sshKeyEnc, encryptedKey);
  assert.doesNotMatch(JSON.stringify(body), /test-only-private-key|sshKeyEnc/);
});

test('telemetry endpoint reads the installed agent snapshot', async (t) => {
  resetStore();
  db.get().servers.push({
    id: 'srv_agent',
    name: 'Agent host',
    host: '192.0.2.32',
    sshUser: 'ubuntu',
    sshPort: 22,
    provider: 'existing',
    status: 'ready',
    sshKeyEnc: encrypt('test-only-agent-key'),
    agent: { state: 'ready', installedAt: '2026-10-05T00:00:00Z' },
  });
  db.saveSync();

  const telemetry = ssh.parseTelemetryReport('FORGE_TELEMETRY_CPU_PERCENT=12.5', undefined, 'agent');
  let readCount = 0;
  mockSsh(t, {
    readAgentTelemetry: async () => { readCount++; return telemetry; },
    collectTelemetry: async () => { throw new Error('The direct SSH fallback should not run.'); },
  });

  const baseUrl = await createApi(t);
  const response = await fetch(`${baseUrl}/api/servers/srv_agent/telemetry`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(readCount, 1);
  assert.equal(body.telemetry.collector, 'agent');
  assert.equal(db.get().servers[0].agent.lastSeenAt, telemetry.checkedAt);
  assert.doesNotMatch(JSON.stringify(body), /test-only-agent-key|sshKeyEnc/);
});

test('telemetry endpoint falls back to SSH and marks an unresponsive agent stale', async (t) => {
  resetStore();
  db.get().servers.push({
    id: 'srv_stale_agent',
    name: 'Stale agent host',
    host: '192.0.2.34',
    sshUser: 'ubuntu',
    sshPort: 22,
    provider: 'existing',
    status: 'ready',
    sshKeyEnc: encrypt('test-only-stale-agent-key'),
    agent: { state: 'ready' },
  });
  db.saveSync();

  const fallback = ssh.parseTelemetryReport('FORGE_TELEMETRY_CPU_PERCENT=8.5');
  mockSsh(t, {
    readAgentTelemetry: async () => { throw new Error('Agent file missing.'); },
    collectTelemetry: async () => fallback,
  });

  const baseUrl = await createApi(t);
  const response = await fetch(`${baseUrl}/api/servers/srv_stale_agent/telemetry`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.telemetry.collector, 'ssh');
  assert.equal(db.get().servers[0].agent.state, 'stale');
  assert.match(db.get().servers[0].agent.lastError, /did not return a current snapshot/);
});

test('agent install transfers scripts over SFTP and persists only public status', async (t) => {
  resetStore();
  const encryptedKey = encrypt('test-only-agent-install-key');
  db.get().servers.push({
    id: 'srv_install_agent',
    name: 'Install agent host',
    host: '192.0.2.33',
    sshUser: 'ubuntu',
    sshPort: 22,
    provider: 'existing',
    status: 'ready',
    sshKeyEnc: encryptedKey,
  });
  db.saveSync();

  const uploads = [];
  const telemetry = ssh.parseTelemetryReport('FORGE_TELEMETRY_CPU_PERCENT=19.5', undefined, 'agent');
  let installCommand = '';
  mockSsh(t, {
    uploadContent: async (server, content, remotePath, mode) => uploads.push({ server, content, remotePath, mode }),
    exec: async (server, command) => {
      installCommand = command;
      return { code: 0, stdout: 'FORGE_AGENT_INSTALLED=ready', stderr: '' };
    },
    readAgentTelemetry: async () => telemetry,
  });

  const baseUrl = await createApi(t);
  const response = await fetch(`${baseUrl}/api/servers/srv_install_agent/agent/install`, { method: 'POST' });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(uploads.length, 2);
  assert.deepEqual(uploads.map((item) => item.remotePath), [
    '/tmp/forge-resource-agent.sh',
    '/tmp/forge-resource-agent-install.sh',
  ]);
  assert.match(installCommand, /'ubuntu' '192\.0\.2\.33'/);
  assert.equal(body.server.agent.state, 'ready');
  assert.equal(body.telemetry.collector, 'agent');
  assert.equal(db.get().servers[0].sshKeyEnc, encryptedKey);
  assert.doesNotMatch(JSON.stringify(body), /test-only-agent-install-key|sshKeyEnc/);
});

test('telemetry endpoint returns a safe unavailable response for invalid stored credentials', async (t) => {
  resetStore();
  db.get().servers.push({
    id: 'srv_invalid_telemetry',
    name: 'Invalid telemetry host',
    host: '192.0.2.31',
    sshUser: 'ubuntu',
    sshPort: 22,
    provider: 'existing',
    status: 'ready',
    sshKeyEnc: 'malformed-encrypted-value',
  });
  db.saveSync();

  const baseUrl = await createApi(t);
  const response = await fetch(`${baseUrl}/api/servers/srv_invalid_telemetry/telemetry`);
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.match(body.error, /Verify SSH access and stored credentials/);
  assert.doesNotMatch(JSON.stringify(body), /auth tag|ERR_CRYPTO|decrypt/i);
});

test('connect installs missing deployment tools and requires post-init readiness', async (t) => {
  resetStore();
  const events = [];
  const preInit = makeReport({ DOCKER: 'missing', DOCKER_DAEMON: 'missing' });
  const postInit = makeReport();
  let checkCount = 0;
  let bootstrapCommand = '';

  mockSsh(t, {
    testConnection: async () => { events.push('ssh'); return 'forge-ok'; },
    checkRequirements: async () => {
      events.push(checkCount++ === 0 ? 'preflight' : 'postflight');
      return checkCount === 1 ? preInit : postInit;
    },
    uploadContent: async () => { events.push('upload'); },
    exec: async (server, command) => {
      if (command.includes('bash /tmp/forge-bootstrap.sh')) {
        events.push('bootstrap');
        bootstrapCommand = command;
      } else {
        events.push('marker');
      }
      return { code: 0, stdout: '', stderr: '' };
    },
  });

  const baseUrl = await createApi(t);
  const response = await connect(baseUrl);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.server.status, 'ready');
  assert.equal(body.server.setupChecks.preInit.ready, false);
  assert.equal(body.server.setupChecks.preInit.canInitialize, true);
  assert.equal(body.server.setupChecks.postInit.ready, true);
  assert.equal(body.server.hasKey, true);
  assert.equal('sshKeyEnc' in body.server, false);
  assert.match(bootstrapCommand, /FORGE_SSH_USER=ubuntu FORGE_SSH_PASSWORD_AUTH=false/);
  assert.deepEqual(events, ['ssh', 'preflight', 'upload', 'bootstrap', 'postflight', 'marker']);
});

test('password-based SSH preserves password authentication during initialization', async (t) => {
  resetStore();
  let bootstrapCommand = '';
  mockSsh(t, {
    testConnection: async () => 'forge-ok',
    checkRequirements: async () => makeReport(),
    uploadContent: async () => {},
    exec: async (server, command) => {
      if (command.includes('bash /tmp/forge-bootstrap.sh')) bootstrapCommand = command;
      return { code: 0, stdout: '', stderr: '' };
    },
  });

  const baseUrl = await createApi(t);
  const response = await connect(baseUrl, {
    privateKey: undefined,
    password: 'test-only-password',
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.server.hasKey, false);
  assert.equal(body.server.hasPassword, true);
  assert.equal('sshPasswordEnc' in body.server, false);
  assert.match(bootstrapCommand, /FORGE_SSH_PASSWORD_AUTH=true/);
});

test('connect refuses unsupported hosts before uploading or running bootstrap', async (t) => {
  resetStore();
  const events = [];
  const preInit = makeReport({
    PLATFORM: 'alpine',
    PLATFORM_LIKE: '',
    APT_GET: 'missing',
    SYSTEMD: 'missing',
  });

  mockSsh(t, {
    testConnection: async () => { events.push('ssh'); return 'forge-ok'; },
    checkRequirements: async () => { events.push('preflight'); return preInit; },
    uploadContent: async () => { events.push('upload'); },
    exec: async () => { events.push('bootstrap'); return { code: 0, stdout: '', stderr: '' }; },
  });

  const baseUrl = await createApi(t);
  const response = await connect(baseUrl);
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /Debian or Ubuntu/);
  assert.deepEqual(events, ['ssh', 'preflight']);
  assert.equal(db.get().servers.length, 0);
});

test('connect does not mark a host ready if required tools remain missing afterward', async (t) => {
  resetStore();
  const preInit = makeReport({ DOCKER: 'missing', DOCKER_DAEMON: 'missing' });
  const postInit = makeReport({ DOCKER: 'missing', DOCKER_DAEMON: 'missing' });
  let checkCount = 0;
  let markerWritten = false;

  mockSsh(t, {
    testConnection: async () => 'forge-ok',
    checkRequirements: async () => checkCount++ === 0 ? preInit : postInit,
    uploadContent: async () => {},
    exec: async (server, command) => {
      if (command === 'touch /opt/forge-apps/.bootstrap-ok') markerWritten = true;
      return { code: 0, stdout: '', stderr: '' };
    },
  });

  const baseUrl = await createApi(t);
  const response = await connect(baseUrl);
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /Post-initialization checks failed: Docker Engine, Docker daemon/);
  assert.equal(markerWritten, false);
  assert.equal(db.get().servers.length, 0);
});

test('provisioned EC2 user-data runs preflight and the route verifies post-init before ready', async (t) => {
  resetStore();
  const preInitOutput = requirementOutput({ DOCKER: 'missing', DOCKER_DAEMON: 'missing' });
  const postInit = makeReport();
  let bootstrapUserData = '';

  mockAws(t, {
    provisionServer: async ({ bootstrapUserData: script }) => {
      bootstrapUserData = script;
      return { publicIp: '192.0.2.21', instanceId: 'i-route-test', keyName: 'forge-test', privateKey: 'test-key' };
    },
    getRegion: () => 'us-east-1',
    isLocalEmulatorEndpoint: () => false,
  });
  mockSsh(t, {
    exec: async (server, command) => {
      if (command.includes('.bootstrap-ok')) return { code: 0, stdout: 'ready\n', stderr: '' };
      if (command.includes('.forge-pre-init-checks')) return { code: 0, stdout: preInitOutput, stderr: '' };
      throw new Error(`Unexpected SSH command: ${command}`);
    },
    checkRequirements: async () => postInit,
  });

  const baseUrl = await createApi(t);
  const response = await fetch(`${baseUrl}/api/servers/provision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'EC2 route test' }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.server.status, 'ready');
  assert.equal(body.server.setupChecks.preInit.ready, false);
  assert.equal(body.server.setupChecks.postInit.ready, true);
  assert.match(bootstrapUserData, /^#!\/bin\/bash\nexport FORGE_SSH_USER=ubuntu/);
  assert.match(bootstrapUserData, /FORGE_SSH_PASSWORD_AUTH=false/);
  assert.match(bootstrapUserData, /FORGE_CHECK_CHECKED_AT/);
  assert.match(bootstrapUserData, /touch \/opt\/forge-apps\/\.bootstrap-ok/);
});
