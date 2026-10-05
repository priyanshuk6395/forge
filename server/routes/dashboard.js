'use strict';

const express = require('express');
const db = require('../db');
const audit = require('../audit');

const router = express.Router();
const TELEMETRY_FRESH_MS = 3 * 60 * 1000;

function hasFreshTelemetry(server, now) {
  const checkedAt = new Date(server.telemetry?.checkedAt || '').getTime();
  const age = now - checkedAt;
  return Number.isFinite(checkedAt) && age >= -30_000 && age <= TELEMETRY_FRESH_MS;
}

function coveredSignal(servers, isAvailable, now) {
  if (!servers.length) return 'unknown';
  const observed = servers.filter((server) => hasFreshTelemetry(server, now) && isAvailable(server.telemetry));
  if (!observed.length) return 'unknown';
  return observed.length === servers.length ? 'healthy' : 'attention';
}

function telemetrySignals(servers, now = Date.now()) {
  if (!servers.length) return { agent: 'unknown', network: 'unknown', ssl: 'unknown' };

  const agentReady = servers.filter((server) =>
    server.agent?.state === 'ready' && hasFreshTelemetry(server, now)
  );
  const tlsReports = servers
    .filter((server) => hasFreshTelemetry(server, now))
    .map((server) => server.telemetry?.tls?.state);
  const ssl = tlsReports.includes('expired')
    ? 'critical'
    : tlsReports.includes('untrusted')
      ? 'attention'
    : tlsReports.length === servers.length && tlsReports.every((state) => state === 'valid')
      ? 'healthy'
      : tlsReports.some((state) => state === 'valid')
        ? 'attention'
        : 'unknown';

  return {
    agent: agentReady.length === servers.length ? 'healthy' : 'attention',
    network: coveredSignal(
      servers,
      (telemetry) => telemetry.network?.receivedBytes != null && telemetry.network?.sentBytes != null,
      now
    ),
    ssl,
  };
}

router.get('/', (req, res) => {
  const store = db.get();
  const projects = store.projects;
  const servers = store.servers;
  const deployments = store.deployments;
  const incidents = store.incidents.filter((incident) => incident.status === 'open');

  const anyServerDown = servers.some((server) => server.status !== 'ready');
  const projectHealth = (project) => {
    if (project.health && typeof project.health === 'object') return project.health.state || 'unknown';
    return project.health || 'unknown';
  };
  const anyProjectUnhealthy = projects.some((project) =>
    ['unhealthy', 'critical'].includes(projectHealth(project))
  );
  const anyProjectNeedsAttention = projects.some((project) => projectHealth(project) === 'attention');
  const anyDeploymentBlockedOrFailed = deployments
    .slice(-20)
    .some((d) => d.status === 'blocked' || (d.status === 'failed' && d.trigger !== 'rollback'));
  const hasUnobservedApplication = projects.some((project) => projectHealth(project) === 'unknown');
  const hasNoApplications = projects.length === 0;

  let overall = 'healthy';
  if (incidents.length || anyProjectUnhealthy) overall = 'critical';
  else if (anyServerDown || anyDeploymentBlockedOrFailed || anyProjectNeedsAttention) overall = 'attention';
  else if (hasNoApplications || hasUnobservedApplication) overall = 'unknown';

  const applications = projects.map((project) => {
    const history = deployments
      .filter((deployment) => deployment.projectId === project.id)
      .sort((left, right) => right.number - left.number);
    const current = history.find((deployment) => deployment.id === project.currentDeploymentId) || history[0] || null;
    const previousSuccess = history.find((deployment) => deployment.status === 'success' && deployment.id !== current?.id) || null;
    const health = project.health && typeof project.health === 'object' ? project.health : {};

    return {
      id: project.id,
      name: project.name,
      repoFullName: project.repoFullName,
      branch: project.branch,
      serverId: project.serverId,
      port: project.port,
      hostPort: project.hostPort,
      health: projectHealth(project),
      healthError: health.lastError || null,
      consecutiveFailures: health.consecutiveFailures || 0,
      lastCheckedAt: health.lastCheckedAt || null,
      lastDeployedAt: project.lastDeployedAt,
      currentDeployment: current && {
        id: current.id,
        number: current.number,
        status: current.status,
        commitSha: current.commitSha,
        startedAt: current.startedAt,
        error: current.error || null,
      },
      previousSuccessfulDeployment: previousSuccess && {
        id: previousSuccess.id,
        number: previousSuccess.number,
        commitSha: previousSuccess.commitSha,
      },
    };
  });

  const components = {
    forge: 'healthy',
    application: !projects.length || hasUnobservedApplication ? 'unknown' : anyProjectUnhealthy ? 'critical' : anyProjectNeedsAttention ? 'attention' : 'healthy',
    server: !servers.length ? 'unknown' : anyServerDown ? 'attention' : 'healthy',
    deployment: !deployments.length ? 'unknown' : anyDeploymentBlockedOrFailed ? 'attention' : 'healthy',
    ...telemetrySignals(servers),
    security: 'unknown',
  };

  res.json({
    generatedAt: new Date().toISOString(),
    overall,
    components,
    projectCount: projects.length,
    serverCount: servers.length,
    applications,
    openIncidents: incidents,
    recentActivity: audit.list({ limit: 10 }),
  });
});

module.exports = router;
module.exports.telemetrySignals = telemetrySignals;
