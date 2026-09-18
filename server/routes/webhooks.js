'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const deploy = require('../deploy');
const audit = require('../audit');
const { decrypt } = require('../crypto');
const { asyncHandler } = require('../utils');

const router = express.Router();

function verifySignature(secret, rawBody, signatureHeader) {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody || Buffer.alloc(0)).digest('hex');
  const given = signatureHeader.slice('sha256='.length);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(given, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.post(
  '/github/:projectId',
  asyncHandler(async (req, res) => {
    const project = db.get().projects.find((p) => p.id === req.params.projectId);
    if (!project || !project.webhookSecretEnc) return res.status(404).end();

    const secret = decrypt(project.webhookSecretEnc);
    const ok = verifySignature(secret, req.rawBody, req.get('x-hub-signature-256'));
    if (!ok) return res.status(401).json({ error: 'Bad signature.' });

    const event = req.get('x-github-event');
    if (event !== 'push') return res.status(200).json({ ignored: true, reason: 'not a push event' });

    const ref = req.body && req.body.ref; // "refs/heads/main"
    const pushedBranch = typeof ref === 'string' ? ref.replace('refs/heads/', '') : null;
    if (pushedBranch !== project.branch) {
      return res.status(200).json({ ignored: true, reason: `push was to ${pushedBranch}, tracking ${project.branch}` });
    }
    if (!project.autoDeploy) {
      return res.status(200).json({ ignored: true, reason: 'auto-deploy disabled' });
    }

    const deployment = deploy.startDeployment(project, { actor: 'github', trigger: 'webhook' });
    audit.record({
      actor: 'github',
      action: 'webhook.push.triggered_deploy',
      resource: `project:${project.id}`,
      meta: { deploymentId: deployment.id },
    });
    res.status(202).json({ ok: true, deploymentId: deployment.id });
  })
);

module.exports = router;
