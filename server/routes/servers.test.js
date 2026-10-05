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
