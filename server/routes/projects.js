'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const github = require('../github');
const deploy = require('../deploy');
const audit = require('../audit');
const { encrypt } = require('../crypto');
const { asyncHandler } = require('../utils');
const {
  assert,
  slugify,
  isValidRepoFullName,
  isValidBranch,
  isValidPort,
  isValidHealthPath,
  isValidEnvKey,
  ValidationError,
} = require('../validate');

const router = express.Router();

function uniqueSlug(base) {
  const store = db.get();
  let slug = base;
  let i = 2;
  while (store.projects.some((p) => p.slug === slug)) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

function toPublic(project) {
  const { envVarsEnc, webhookSecretEnc, ...rest } = project;
  return { ...rest, envKeys: Object.keys(envVarsEnc || {}) };
}

function findProjectOr404(req, res) {
  const project = db.get().projects.find((p) => p.id === req.params.id);
  if (!project) {
    res.status(404).json({ error: 'Project not found.' });
    return null;
  }
  return project;
}

router.get('/', (req, res) => {
  res.json({ projects: db.get().projects.map(toPublic) });
});

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const {
      name,
      repoFullName,
      repoPrivate = false,
      branch = 'main',
      port,
      healthPath = '/health',
      serverId,
      hostPort,
      autoHeal = false,
    } = req.body || {};

    assert(name && name.length <= 60, 'Name is required.');
    assert(isValidRepoFullName(repoFullName), 'Invalid repository (expected owner/repo).');
    assert(isValidBranch(branch), 'Invalid branch name.');
    assert(isValidPort(port), 'Invalid container port.');
    assert(isValidHealthPath(healthPath), 'Health check path must start with / .');
    const server = db.get().servers.find((s) => s.id === serverId);
    assert(server, 'Select a server for this project.');
    if (hostPort !== undefined) assert(isValidPort(hostPort), 'Invalid host port.');

    const project = {
      id: db.nextId('proj'),
      name,
      slug: uniqueSlug(slugify(name)),
      repoFullName,
      repoPrivate: !!repoPrivate,
      branch,
      port: Number(port),
      hostPort: hostPort ? Number(hostPort) : Number(port),
      healthPath,
      serverId,
      autoDeploy: false,
      autoHeal: !!autoHeal,
      envVarsEnc: {},
      currentDeploymentId: null,
      lastDeployedAt: null,
      health: { state: 'unknown', consecutiveFailures: 0 },
      createdAt: new Date().toISOString(),
    };
    db.get().projects.push(project);
    db.saveSync();
    audit.record({ actor: req.user.username, action: 'project.created', resource: `project:${project.id}` });
    res.status(201).json({ project: toPublic(project) });
  })
);

router.get('/:id', (req, res) => {
  const project = findProjectOr404(req, res);
  if (!project) return;
  const deployments = db
    .get()
    .deployments.filter((d) => d.projectId === project.id)
    .sort((a, b) => b.number - a.number)
    .map(({ logs, ...rest }) => rest); // list view omits full logs
  res.json({ project: toPublic(project), deployments });
});

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const project = findProjectOr404(req, res);
    if (!project) return;
    const { branch, port, hostPort, healthPath, serverId, autoHeal } = req.body || {};
    if (branch !== undefined) {
      assert(isValidBranch(branch), 'Invalid branch name.');
      project.branch = branch;
    }
    if (port !== undefined) {
      assert(isValidPort(port), 'Invalid container port.');
      project.port = Number(port);
    }
    if (hostPort !== undefined) {
      assert(isValidPort(hostPort), 'Invalid host port.');
      project.hostPort = Number(hostPort);
    }
    if (healthPath !== undefined) {
      assert(isValidHealthPath(healthPath), 'Health check path must start with / .');
      project.healthPath = healthPath;
    }
    if (serverId !== undefined) {
      const server = db.get().servers.find((s) => s.id === serverId);
      assert(server, 'Server not found.');
      project.serverId = serverId;
    }
    if (autoHeal !== undefined) project.autoHeal = !!autoHeal;
    db.saveSync();
    audit.record({ actor: req.user.username, action: 'project.updated', resource: `project:${project.id}` });
    res.json({ project: toPublic(project) });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const store = db.get();
    const project = store.projects.find((p) => p.id === req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    if (req.body?.confirm !== true) {
      throw new ValidationError('Deleting a project is a dangerous operation and requires confirm: true.');
    }
    store.projects = store.projects.filter((p) => p.id !== project.id);
    store.deployments = store.deployments.filter((d) => d.projectId !== project.id);
    db.saveSync();
    audit.record({ actor: req.user.username, action: 'project.deleted', resource: `project:${project.id}` });
    res.json({ ok: true });
  })
);

// --- Deployments ---

router.post(
  '/:id/deploy',
  asyncHandler(async (req, res) => {
    const project = findProjectOr404(req, res);
    if (!project) return;
    const deployment = deploy.startDeployment(project, { actor: req.user.username, trigger: 'manual' });
    res.status(202).json({ deployment });
  })
);

router.get('/:id/deployments', (req, res) => {
  const project = findProjectOr404(req, res);
  if (!project) return;
  const deployments = db
    .get()
    .deployments.filter((d) => d.projectId === project.id)
    .sort((a, b) => b.number - a.number)
    .map(({ logs, ...rest }) => rest);
  res.json({ deployments });
});

router.get('/:id/deployments/:depId', (req, res) => {
  const project = findProjectOr404(req, res);
  if (!project) return;
  const deployment = db.get().deployments.find((d) => d.id === req.params.depId && d.projectId === project.id);
  if (!deployment) return res.status(404).json({ error: 'Deployment not found.' });
  res.json({ deployment });
});

router.post(
  '/:id/deployments/:depId/rollback',
  asyncHandler(async (req, res) => {
    const project = findProjectOr404(req, res);
    if (!project) return;
    const target = db.get().deployments.find((d) => d.id === req.params.depId && d.projectId === project.id);
    if (!target) return res.status(404).json({ error: 'Release not found.' });
    const deployment = deploy.startRollback(project, target, { actor: req.user.username });
    res.status(202).json({ deployment });
  })
);

// --- Live container ops ---

router.get(
  '/:id/logs',
  asyncHandler(async (req, res) => {
    const project = findProjectOr404(req, res);
    if (!project) return;
    const output = await deploy.getContainerLogs(project, req.query.lines);
    res.json({ logs: output });
  })
);

router.get(
  '/:id/container-status',
  asyncHandler(async (req, res) => {
    const project = findProjectOr404(req, res);
    if (!project) return;
    const status = await deploy.getContainerStatus(project);
    res.json({ status });
  })
);

router.post(
  '/:id/restart',
  asyncHandler(async (req, res) => {
    const project = findProjectOr404(req, res);
    if (!project) return;
    await deploy.restartContainer(project, { actor: req.user.username });
    res.json({ ok: true });
  })
);

// --- Secrets (env vars) ---

router.get('/:id/secrets', (req, res) => {
  const project = findProjectOr404(req, res);
  if (!project) return;
  res.json({ keys: Object.keys(project.envVarsEnc || {}) });
});

router.put(
  '/:id/secrets',
  asyncHandler(async (req, res) => {
    const project = findProjectOr404(req, res);
    if (!project) return;
    const { key, value } = req.body || {};
    assert(isValidEnvKey(key), 'Invalid environment variable name.');
    assert(typeof value === 'string' && value.length < 20000, 'Value is required.');
    project.envVarsEnc = project.envVarsEnc || {};
    project.envVarsEnc[key] = encrypt(value);
    db.saveSync();
    audit.record({
      actor: req.user.username,
      action: 'project.secrets.set',
      resource: `project:${project.id}`,
      meta: { key },
    });
    res.json({ keys: Object.keys(project.envVarsEnc) });
  })
);

router.delete('/:id/secrets/:key', (req, res) => {
  const project = findProjectOr404(req, res);
  if (!project) return;
  if (project.envVarsEnc) delete project.envVarsEnc[req.params.key];
  db.saveSync();
  audit.record({
    actor: req.user.username,
    action: 'project.secrets.removed',
    resource: `project:${project.id}`,
    meta: { key: req.params.key },
  });
  res.json({ keys: Object.keys(project.envVarsEnc || {}) });
});

// --- Auto-deploy webhook registration ---

router.post(
  '/:id/webhook',
  asyncHandler(async (req, res) => {
    const project = findProjectOr404(req, res);
    if (!project) return;
    if (!github.isConnected()) throw new ValidationError('Connect GitHub in Settings first.');
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const secret = crypto.randomBytes(24).toString('hex');
    await github.createWebhook(project.repoFullName, `${baseUrl}/webhook/github/${project.id}`, secret);
    project.webhookSecretEnc = encrypt(secret);
    project.autoDeploy = true;
    db.saveSync();
    audit.record({ actor: req.user.username, action: 'project.autodeploy.enabled', resource: `project:${project.id}` });
    res.json({ ok: true, autoDeploy: true });
  })
);

router.delete('/:id/webhook', (req, res) => {
  const project = findProjectOr404(req, res);
  if (!project) return;
  project.autoDeploy = false;
  delete project.webhookSecretEnc;
  db.saveSync();
  audit.record({ actor: req.user.username, action: 'project.autodeploy.disabled', resource: `project:${project.id}` });
  res.json({ ok: true, autoDeploy: false });
});

module.exports = router;
