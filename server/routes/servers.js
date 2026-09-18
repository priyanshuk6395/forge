'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const ssh = require('../ssh');
const aws = require('../aws');
const audit = require('../audit');
const { encrypt, decrypt } = require('../crypto');
const { asyncHandler } = require('../utils');
const { assert, isValidHost, isValidSshUser, isValidPort, ValidationError } = require('../validate');

const router = express.Router();

const BOOTSTRAP_SCRIPT = fs.readFileSync(
  path.join(__dirname, '..', 'remote-scripts', 'bootstrap-server.sh'),
  'utf8'
);

function toPublic(server) {
  const { sshKeyEnc, sshPasswordEnc, ...rest } = server;
  return { ...rest, hasKey: !!sshKeyEnc, hasPassword: !!sshPasswordEnc };
}

router.get('/', (req, res) => {
  res.json({ servers: db.get().servers.map(toPublic) });
});

router.get('/:id', (req, res) => {
  const server = db.get().servers.find((s) => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found.' });
  res.json({ server: toPublic(server) });
});

async function waitForBootstrap(server, { timeoutMs = 3 * 60 * 1000 } = {}) {
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const result = await ssh.exec(
        server,
        'test -f /opt/forge-apps/.bootstrap-ok && echo ready || echo pending',
        { timeoutMs: 15000 }
      );
      if (result.stdout.includes('ready')) return true;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(
    `Server did not finish bootstrapping in time.${lastErr ? ' Last error: ' + lastErr.message : ''}`
  );
}

router.post(
  '/connect',
  asyncHandler(async (req, res) => {
    const { name, host, sshUser = 'ubuntu', sshPort = 22, privateKey, password } = req.body || {};
    assert(name && name.length <= 60, 'Name is required.');
    assert(isValidHost(host), 'Enter a valid IP address or hostname.');
    assert(isValidSshUser(sshUser), 'Invalid SSH username.');
    assert(isValidPort(sshPort), 'Invalid SSH port.');
    assert(privateKey || password, 'Provide an SSH private key or password.');

    const server = {
      id: db.nextId('srv'),
      name,
      host,
      sshUser,
      sshPort: Number(sshPort),
      provider: 'existing',
      status: 'connecting',
      createdAt: new Date().toISOString(),
    };
    if (privateKey) server.sshKeyEnc = encrypt(privateKey);
    if (password) server.sshPasswordEnc = encrypt(password);

    try {
      await ssh.testConnection(server); // throws with a clear message if unreachable
    } catch (e) {
      throw new ValidationError(`Could not connect over SSH: ${e.message}`);
    }

    // Bootstrap immediately — the user is already watching a spinner for
    // "connecting", and this only ever runs once per server.
    try {
      await ssh.uploadContent(server, BOOTSTRAP_SCRIPT, '/tmp/forge-bootstrap.sh', 0o700);
      await ssh.exec(server, 'bash /tmp/forge-bootstrap.sh && touch /opt/forge-apps/.bootstrap-ok', {
        timeoutMs: 5 * 60 * 1000,
      });
    } catch (e) {
      throw new ValidationError(`Connected, but the server setup script failed: ${e.message}`);
    }

    server.status = 'ready';
    db.get().servers.push(server);
    db.saveSync();
    audit.record({ actor: req.user.username, action: 'server.connected', resource: `server:${server.id}` });
    res.json({ server: toPublic(server) });
  })
);

router.post(
  '/provision',
  asyncHandler(async (req, res) => {
    const { name, instanceType = 't3.micro', sshCidr = '0.0.0.0/0', appPort } = req.body || {};
    assert(name && name.length <= 60, 'Name is required.');
    assert(/^[a-z][a-z0-9.]*$/.test(instanceType), 'Invalid instance type.');

    const provisioned = await aws.provisionServer({
      name,
      instanceType,
      sshCidr,
      appPort: appPort ? Number(appPort) : undefined,
      bootstrapUserData: BOOTSTRAP_SCRIPT + '\ntouch /opt/forge-apps/.bootstrap-ok\n',
    });

    const server = {
      id: db.nextId('srv'),
      name,
      host: provisioned.publicIp,
      sshUser: 'ubuntu',
      sshPort: 22,
      provider: 'ec2',
      instanceId: provisioned.instanceId,
      keyName: provisioned.keyName,
      region: aws.getRegion(),
      instanceType,
      sshKeyEnc: encrypt(provisioned.privateKey),
      status: 'provisioning',
      createdAt: new Date().toISOString(),
    };
    db.get().servers.push(server);
    db.saveSync();
    audit.record({
      actor: req.user.username,
      action: 'server.provisioned',
      resource: `server:${server.id}`,
      meta: { instanceId: server.instanceId },
    });

    try {
      await waitForBootstrap(server);
      server.status = 'ready';
    } catch (e) {
      server.status = 'bootstrap_failed';
      server.statusError = e.message;
    }
    db.saveSync();
    res.json({ server: toPublic(server) });
  })
);

router.post(
  '/:id/test',
  asyncHandler(async (req, res) => {
    const server = db.get().servers.find((s) => s.id === req.params.id);
    if (!server) return res.status(404).json({ error: 'Server not found.' });
    const output = await ssh.testConnection(server);
    res.json({ ok: true, output });
  })
);

router.get(
  '/:id/key',
  asyncHandler(async (req, res) => {
    const server = db.get().servers.find((s) => s.id === req.params.id);
    if (!server || !server.sshKeyEnc) return res.status(404).json({ error: 'No key on file for this server.' });
    audit.record({ actor: req.user.username, action: 'server.key.downloaded', resource: `server:${server.id}` });
    res.setHeader('Content-Disposition', `attachment; filename="${server.name}.pem"`);
    res.setHeader('Content-Type', 'application/x-pem-file');
    res.send(decrypt(server.sshKeyEnc));
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const store = db.get();
    const server = store.servers.find((s) => s.id === req.params.id);
    if (!server) return res.status(404).json({ error: 'Server not found.' });
    if (req.body?.confirm !== true) {
      throw new ValidationError('Deleting a server is a dangerous operation and requires confirm: true.');
    }
    const dependent = store.projects.filter((p) => p.serverId === server.id);
    if (dependent.length) {
      throw new ValidationError(
        `${dependent.length} project(s) still use this server. Reassign or delete them first.`
      );
    }
    if (server.provider === 'ec2' && req.body.terminateInstance) {
      await aws.terminateInstance(server.instanceId);
    }
    store.servers = store.servers.filter((s) => s.id !== server.id);
    db.saveSync();
    audit.record({ actor: req.user.username, action: 'server.deleted', resource: `server:${server.id}` });
    res.json({ ok: true });
  })
);

module.exports = router;
