'use strict';

const express = require('express');
const github = require('../github');
const { isValidRepoFullName, isValidBranch, ValidationError } = require('../validate');
const { asyncHandler } = require('../utils');

const router = express.Router();

router.get(
  '/repos',
  asyncHandler(async (req, res) => {
    const repos = await github.listRepos();
    res.json({ repos });
  })
);

router.get(
  '/repos/:owner/:repo/branches',
  asyncHandler(async (req, res) => {
    const fullName = `${req.params.owner}/${req.params.repo}`;
    if (!isValidRepoFullName(fullName)) throw new ValidationError('Invalid repository name.');
    const branches = await github.getBranches(fullName);
    res.json({ branches });
  })
);

router.get(
  '/repos/:owner/:repo/detect',
  asyncHandler(async (req, res) => {
    const fullName = `${req.params.owner}/${req.params.repo}`;
    const branch = req.query.branch || 'main';
    if (!isValidRepoFullName(fullName)) throw new ValidationError('Invalid repository name.');
    if (!isValidBranch(branch)) throw new ValidationError('Invalid branch name.');
    const detected = await github.detectApp(fullName, branch);
    res.json(detected);
  })
);

module.exports = router;
