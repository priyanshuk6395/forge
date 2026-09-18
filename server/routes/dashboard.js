'use strict';

const express = require('express');
const db = require('../db');
const audit = require('../audit');

const router = express.Router();

router.get('/', (req, res) => {
  const store = db.get();
  const projects = store.projects;
  const servers = store.servers;

  const anyServerDown = servers.some((s) => s.status !== 'ready');
  const anyProjectUnhealthy = projects.some((p) => p.health && p.health.state === 'unhealthy');
  const anyOpenIncident = store.incidents.some((i) => i.status === 'open');
  const anyDeploymentBlockedOrFailed = store.deployments
    .slice(-20)
    .some((d) => d.status === 'blocked' || (d.status === 'failed' && d.trigger !== 'rollback'));

  let overall = 'healthy';
  if (anyOpenIncident || anyProjectUnhealthy) overall = 'critical';
  else if (anyServerDown || anyDeploymentBlockedOrFailed) overall = 'attention';

  const components = {
    application: anyProjectUnhealthy ? 'critical' : 'healthy',
    server: anyServerDown ? 'attention' : 'healthy',
    security: 'healthy',
    deployment: anyDeploymentBlockedOrFailed ? 'attention' : 'healthy',
  };

  res.json({
    overall,
    components,
    projectCount: projects.length,
    serverCount: servers.length,
    openIncidents: store.incidents.filter((i) => i.status === 'open'),
    recentActivity: audit.list({ limit: 10 }),
  });
});

module.exports = router;
