'use strict';

const db = require('./db');
const audit = require('./audit');
const deploy = require('./deploy');

const CHECK_INTERVAL_MS = 30_000;
const FAILURE_THRESHOLD = 3; // consecutive failed checks before it's an incident
const HEAL_COOLDOWN_MS = 5 * 60 * 1000; // don't restart-loop a genuinely broken app

async function checkOne(project) {
  const server = db.get().servers.find((s) => s.id === project.serverId);
  if (!server || !project.currentDeploymentId) {
    project.health = { state: 'unknown', consecutiveFailures: 0, lastCheckedAt: new Date().toISOString() };
    return;
  }
  const hostPort = project.hostPort || project.port;
  const url = `http://${server.host}:${hostPort}${project.healthPath}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  const health = project.health || { state: 'unknown', consecutiveFailures: 0 };

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      health.state = 'healthy';
      health.consecutiveFailures = 0;
      health.lastError = null;
      await maybeResolveIncident(project);
    } else {
      throw new Error(`Health endpoint returned ${res.status}`);
    }
  } catch (e) {
    clearTimeout(timer);
    health.state = 'unhealthy';
    health.consecutiveFailures = (health.consecutiveFailures || 0) + 1;
    health.lastError = e.message;
    if (health.consecutiveFailures >= FAILURE_THRESHOLD) {
      await handleIncident(project, health);
    }
  }
  health.lastCheckedAt = new Date().toISOString();
  project.health = health;
  db.save();
}

async function handleIncident(project, health) {
  const store = db.get();
  let incident = store.incidents.find((i) => i.projectId === project.id && i.status === 'open');
  if (!incident) {
    incident = {
      id: db.nextId('inc'),
      projectId: project.id,
      startedAt: new Date().toISOString(),
      resolvedAt: null,
      status: 'open',
      cause: health.lastError,
      restartAttempts: 0,
    };
    store.incidents.push(incident);
    audit.record({
      actor: 'forge',
      action: 'incident.detected',
      resource: `project:${project.id}`,
      meta: { cause: health.lastError },
    });
  }

  if (!project.autoHeal) return;

  const lastHeal = incident.lastRestartAt ? new Date(incident.lastRestartAt).getTime() : 0;
  if (Date.now() - lastHeal < HEAL_COOLDOWN_MS) return;

  try {
    await deploy.restartContainer(project, { actor: 'forge' });
    incident.restartAttempts += 1;
    incident.lastRestartAt = new Date().toISOString();
    audit.record({
      actor: 'forge',
      action: 'incident.self_heal.restart',
      resource: `project:${project.id}`,
      meta: { attempt: incident.restartAttempts },
    });
  } catch (e) {
    audit.record({
      actor: 'forge',
      action: 'incident.self_heal.failed',
      resource: `project:${project.id}`,
      result: 'failure',
      meta: { error: e.message },
    });
  }
}

async function maybeResolveIncident(project) {
  const store = db.get();
  const incident = store.incidents.find((i) => i.projectId === project.id && i.status === 'open');
  if (incident) {
    incident.status = 'resolved';
    incident.resolvedAt = new Date().toISOString();
    audit.record({ actor: 'forge', action: 'incident.resolved', resource: `project:${project.id}` });
  }
}

let timer = null;

async function tick() {
  const projects = db.get().projects;
  for (const project of projects) {
    try {
      await checkOne(project);
    } catch {
      // one project's monitoring failure should never take down the loop
    }
  }
}

function start() {
  if (timer) return;
  tick();
  timer = setInterval(tick, CHECK_INTERVAL_MS);
}

function stop() {
  clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, tick };
