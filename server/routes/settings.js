'use strict';

const express = require('express');
const db = require('../db');
const github = require('../github');
const aws = require('../aws');
const audit = require('../audit');
const { encrypt } = require('../crypto');
const { asyncHandler } = require('../utils');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const settings = db.get().settings;
    let githubStatus = { connected: false };
    if (github.isConnected()) {
      try {
        const info = await github.verifyToken();
        githubStatus = { connected: true, login: info.login };
      } catch {
        githubStatus = { connected: false, error: 'Stored token is no longer valid.' };
      }
    }
    const localEndpoint = aws.getEndpoint();
    const hasStoredCredentials = !!(settings.awsAccessKeyIdEnc && settings.awsSecretAccessKeyEnc);
    const hasEnvironmentCredentials = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
    res.json({
      github: githubStatus,
      aws: {
        configured: hasStoredCredentials || hasEnvironmentCredentials,
        usingInstanceProfile: !hasStoredCredentials && !hasEnvironmentCredentials && !localEndpoint,
        region: aws.getRegion(),
        endpoint: localEndpoint,
      },
    });
  })
);

router.post(
  '/github',
  asyncHandler(async (req, res) => {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Token is required.' });
    github.setToken(token);
    try {
      const info = await github.verifyToken();
      audit.record({ actor: req.user.username, action: 'settings.github.connected', resource: 'settings' });
      res.json({ connected: true, login: info.login });
    } catch (e) {
      github.setToken(null);
      res.status(400).json({ error: 'That token did not work: ' + e.message });
    }
  })
);

router.delete('/github', (req, res) => {
  github.setToken(null);
  audit.record({ actor: req.user.username, action: 'settings.github.disconnected', resource: 'settings' });
  res.json({ ok: true });
});

router.post(
  '/aws',
  asyncHandler(async (req, res) => {
    const { accessKeyId, secretAccessKey, region } = req.body || {};
    const settings = db.get().settings;
    if (accessKeyId && secretAccessKey) {
      settings.awsAccessKeyIdEnc = encrypt(accessKeyId);
      settings.awsSecretAccessKeyEnc = encrypt(secretAccessKey);
    }
    if (region) settings.awsRegion = region;
    db.saveSync();
    audit.record({ actor: req.user.username, action: 'settings.aws.updated', resource: 'settings' });
    res.json({ ok: true, configured: !!(settings.awsAccessKeyIdEnc && settings.awsSecretAccessKeyEnc) });
  })
);

router.delete('/aws', (req, res) => {
  const settings = db.get().settings;
  delete settings.awsAccessKeyIdEnc;
  delete settings.awsSecretAccessKeyEnc;
  db.saveSync();
  audit.record({ actor: req.user.username, action: 'settings.aws.cleared', resource: 'settings' });
  res.json({ ok: true });
});

router.post(
  '/aws/test',
  asyncHandler(async (req, res) => {
    const ok = await aws.checkConnection();
    if (!ok) return res.status(400).json({ ok: false, error: 'AWS EC2 is not reachable with the configured credentials.' });
    res.json({ ok: true });
  })
);

module.exports = router;
