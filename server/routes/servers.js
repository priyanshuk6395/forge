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
const RESOURCE_AGENT_SCRIPT = fs.readFileSync(
  path.join(__dirname, '..', 'remote-scripts', 'forge-resource-agent.sh'),
  'utf8'
);
const RESOURCE_AGENT_INSTALLER = fs.readFileSync(
  path.join(__dirname, '..', 'remote-scripts', 'install-resource-agent.sh'),
  'utf8'
);
const LOCAL_EMULATOR_BOOTSTRAP_ERROR =
  'The local AWS emulator accepted the EC2 launch request but does not boot a Linux guest for SSH setup. Use real AWS to provision a managed server, or connect an existing Linux host.';

const BOOTSTRAP_PREREQUISITES = new Set(['platform', 'privilege', 'apt-get', 'systemd']);
function toPublic(server) {
  const { sshKeyEnc, sshKeyPassphraseEnc, sshPasswordEnc, ...rest } = server;
  return { ...rest, hasKey: !!sshKeyEnc, hasPassword: !!sshPasswordEnc };
}

function failPendingEmulatorProvisioning() {
  if (!aws.isLocalEmulatorEndpoint()) return;

  const pending = db.get().servers.filter((server) =>
    server.provider === 'ec2' && (
      server.status === 'provisioning' ||
      (server.status === 'bootstrap_failed' && server.statusError?.startsWith('Server did not finish bootstrapping in time.'))
    )
  );
  if (!pending.length) return;

  for (const server of pending) {
    server.status = 'bootstrap_failed';
    server.statusError = LOCAL_EMULATOR_BOOTSTRAP_ERROR;
  }
  db.saveSync();
}

function checkFailures(check, ids) {
  return check.checks
    .filter((item) => (!ids || ids.has(item.id)) && item.state !== 'ready')
    .map((item) => item.label);
}

function postInitFailure(check) {
  const failures = checkFailures(check);
  return `Post-initialization checks failed: ${failures.join(', ')}. The server was not marked ready.`;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

async function installResourceAgent(server) {
  await ssh.uploadContent(server, RESOURCE_AGENT_SCRIPT, '/tmp/forge-resource-agent.sh', 0o700);
  await ssh.uploadContent(server, RESOURCE_AGENT_INSTALLER, '/tmp/forge-resource-agent-install.sh', 0o700);
  const command = [
    `bash /tmp/forge-resource-agent-install.sh ${shellQuote(server.sshUser || 'ubuntu')} ${shellQuote(server.host)}`,
    'install_status=$?',
    'rm -f /tmp/forge-resource-agent.sh /tmp/forge-resource-agent-install.sh',
    'exit "$install_status"',
  ].join('; ');
  const result = await ssh.exec(server, command, { timeoutMs: 60000 });
  if (result.code !== 0 || !result.stdout.includes('FORGE_AGENT_INSTALLED=ready')) {
    throw new Error('Agent installation did not complete. Check SSH access, passwordless sudo, and systemd.');
  }

  const telemetry = await ssh.readAgentTelemetry(server);
  const agent = {
    state: 'ready',
    installedAt: new Date().toISOString(),
    lastSeenAt: telemetry.checkedAt,
  };
  server.agent = agent;
  server.telemetry = telemetry;
  return { agent, telemetry };
}

failPendingEmulatorProvisioning();

router.get('/', (req, res) => {
  failPendingEmulatorProvisioning();
  res.json({ servers: db.get().servers.map(toPublic) });
});

router.get('/:id', (req, res) => {
  failPendingEmulatorProvisioning();
  const server = db.get().servers.find((s) => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found.' });
  res.json({ server: toPublic(server) });
});

router.get(
  '/:id/telemetry',
  asyncHandler(async (req, res) => {
    const server = db.get().servers.find((item) => item.id === req.params.id);
    if (!server) return res.status(404).json({ error: 'Server not found.' });
    try {
      let telemetry;
      if (server.agent?.state === 'ready') {
        try {
          telemetry = await ssh.readAgentTelemetry(server);
        } catch {
          server.agent = {
            ...server.agent,
            state: 'stale',
            lastError: 'The telemetry agent did not return a current snapshot.',
          };
        }
      }
      telemetry ||= await ssh.collectTelemetry(server);
      server.telemetry = telemetry;
      if (telemetry.collector === 'agent' && server.agent) server.agent.lastSeenAt = telemetry.checkedAt;
      db.save();
      res.json({ telemetry });
    } catch {
      res.status(503).json({
        error: 'Host telemetry is unavailable. Verify SSH access and stored credentials, then retry.',
      });
    }
  })
);

router.post(
  '/:id/agent/install',
  asyncHandler(async (req, res) => {
    const server = db.get().servers.find((item) => item.id === req.params.id);
    if (!server) return res.status(404).json({ error: 'Server not found.' });
    if (server.status !== 'ready') {
      return res.status(409).json({ error: 'Connect and prepare this server before installing the telemetry agent.' });
    }

    try {
      const result = await installResourceAgent(server);
      db.saveSync();
      audit.record({ actor: req.user.username, action: 'server.telemetry_agent.installed', resource: `server:${server.id}` });
      res.json({ server: toPublic(server), ...result });
    } catch {
      server.agent = { state: 'error', lastError: 'Installation failed. Verify SSH, passwordless sudo, and systemd.' };
      db.saveSync();
      res.status(503).json({ error: server.agent.lastError });
    }
  })
);

async function waitForBootstrap(server, { timeoutMs = 10 * 60 * 1000 } = {}) {
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeoutMs) {
    let bootstrapReady = false;
    try {
      const result = await ssh.exec(
        server,
        'test -f /opt/forge-apps/.bootstrap-ok && echo ready || echo pending',
        { timeoutMs: 15000 }
      );
      bootstrapReady = result.stdout.includes('ready');
    } catch (e) {
      lastErr = e;
    }

    if (bootstrapReady) {
      const preInitResult = await ssh.exec(server, 'cat /opt/forge-apps/.forge-pre-init-checks', { timeoutMs: 15000 });
      if (preInitResult.code !== 0) throw new Error('Bootstrap completed without a pre-initialization requirement report.');
      return {
        preInit: ssh.parseRequirementReport(preInitResult.stdout),
        postInit: await ssh.checkRequirements(server),
      };
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
    const { name, host, sshUser = 'ubuntu', sshPort = 22, privateKey, keyPassphrase, password } = req.body || {};
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
    if (privateKey) {
      server.sshKeyEnc = encrypt(privateKey);
      if (keyPassphrase) server.sshKeyPassphraseEnc = encrypt(keyPassphrase);
    }
    if (password) server.sshPasswordEnc = encrypt(password);

    try {
      await ssh.testConnection(server); // throws with a clear message if unreachable
    } catch (e) {
      throw new ValidationError(`Could not connect over SSH: ${e.message}`);
    }

    let preInit;
    try {
      preInit = await ssh.checkRequirements(server);
    } catch (e) {
      throw new ValidationError(`SSH connected, but the pre-initialization check failed: ${e.message}`);
    }
    if (!preInit.canInitialize) {
      const missing = checkFailures(preInit, BOOTSTRAP_PREREQUISITES);
      throw new ValidationError(
        `Forge cannot initialize this host. Missing prerequisites: ${missing.join(', ')}. Use Debian or Ubuntu with systemd and root or passwordless sudo.`
      );
    }

    try {
      await ssh.uploadContent(server, BOOTSTRAP_SCRIPT, '/tmp/forge-bootstrap.sh', 0o700);
      const passwordAuth = !server.sshKeyEnc && server.sshPasswordEnc ? 'true' : 'false';
      const installResult = await ssh.exec(server, `FORGE_SSH_USER=${server.sshUser} FORGE_SSH_PASSWORD_AUTH=${passwordAuth} bash /tmp/forge-bootstrap.sh`, {
        timeoutMs: 5 * 60 * 1000,
      });
      if (installResult.code !== 0) {
        throw new Error(installResult.stderr || `Initialization exited with code ${installResult.code}.`);
      }
      const postInit = await ssh.checkRequirements(server);
      server.setupChecks = { preInit, postInit };
      if (!postInit.ready) throw new Error(postInitFailure(postInit));
      const marker = await ssh.exec(server, 'touch /opt/forge-apps/.bootstrap-ok', { timeoutMs: 15000 });
      if (marker.code !== 0) throw new Error('Could not write the Forge bootstrap completion marker.');
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
      bootstrapUserData: BOOTSTRAP_SCRIPT.replace(
        '#!/bin/bash',
        '#!/bin/bash\nexport FORGE_SSH_USER=ubuntu\nexport FORGE_SSH_PASSWORD_AUTH=false'
      ) + '\ntouch /opt/forge-apps/.bootstrap-ok\n',
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

    if (aws.isLocalEmulatorEndpoint()) {
      failPendingEmulatorProvisioning();
      return res.json({ server: toPublic(server) });
    }

    try {
      server.setupChecks = await waitForBootstrap(server);
      if (!server.setupChecks.postInit.ready) throw new Error(postInitFailure(server.setupChecks.postInit));
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
