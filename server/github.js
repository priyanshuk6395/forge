'use strict';

const db = require('./db');
const { encrypt, decrypt } = require('./crypto');

const API = 'https://api.github.com';

function getToken() {
  const enc = db.get().settings.githubTokenEnc;
  return enc ? decrypt(enc) : null;
}

function setToken(token) {
  db.get().settings.githubTokenEnc = token ? encrypt(token) : null;
  db.saveSync();
}

function isConnected() {
  return !!getToken();
}

async function ghFetch(pathOrUrl, opts = {}) {
  const token = getToken();
  if (!token) {
    const err = new Error('GitHub is not connected. Add a personal access token in Settings.');
    err.status = 400;
    throw err;
  }
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${API}${pathOrUrl}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'forge-app',
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    const err = new Error('GitHub rejected the stored token. Reconnect GitHub in Settings.');
    err.status = 401;
    throw err;
  }
  return res;
}

async function verifyToken() {
  const res = await ghFetch('/user');
  if (!res.ok) {
    const err = new Error(`GitHub token check failed (${res.status}).`);
    err.status = res.status;
    throw err;
  }
  const user = await res.json();
  return { login: user.login, avatarUrl: user.avatar_url };
}

async function listRepos() {
  const repos = [];
  for (let page = 1; page <= 3; page++) {
    const res = await ghFetch(
      `/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`
    );
    if (!res.ok) break;
    const batch = await res.json();
    repos.push(
      ...batch.map((r) => ({
        fullName: r.full_name,
        private: r.private,
        defaultBranch: r.default_branch,
        language: r.language,
        pushedAt: r.pushed_at,
        htmlUrl: r.html_url,
        cloneUrl: r.clone_url,
      }))
    );
    if (batch.length < 100) break;
  }
  return repos;
}

async function getBranches(fullName) {
  const res = await ghFetch(`/repos/${fullName}/branches?per_page=100`);
  if (!res.ok) return [];
  const branches = await res.json();
  return branches.map((b) => b.name);
}

async function fileExists(fullName, branch, filePath) {
  const res = await ghFetch(
    `/repos/${fullName}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(branch)}`
  );
  return res.ok;
}

async function detectApp(fullName, branch) {
  const [repoRes, hasDockerfile, hasCompose] = await Promise.all([
    ghFetch(`/repos/${fullName}`),
    fileExists(fullName, branch, 'Dockerfile'),
    fileExists(fullName, branch, 'docker-compose.yml'),
  ]);
  const repo = repoRes.ok ? await repoRes.json() : {};
  return {
    language: repo.language || null,
    hasDockerfile,
    hasCompose,
    defaultBranch: repo.default_branch || branch,
  };
}

async function getLatestCommit(fullName, branch) {
  const res = await ghFetch(`/repos/${fullName}/commits/${encodeURIComponent(branch)}`);
  if (!res.ok) {
    const err = new Error(`Could not resolve latest commit on ${branch}.`);
    err.status = res.status;
    throw err;
  }
  const commit = await res.json();
  return {
    sha: commit.sha,
    shortSha: commit.sha.slice(0, 7),
    message: commit.commit && commit.commit.message,
    author: commit.commit && commit.commit.author && commit.commit.author.name,
  };
}

// Registers a push webhook on the repo pointing back at this Forge instance.
async function createWebhook(fullName, webhookUrl, secret) {
  const res = await ghFetch(`/repos/${fullName}/hooks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'web',
      active: true,
      events: ['push'],
      config: { url: webhookUrl, content_type: 'json', secret, insecure_ssl: '1' },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`Could not create GitHub webhook (${res.status}): ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Public repos clone anonymously; private repos need the token embedded in
// the URL for the one-shot `git clone`/`fetch` call. deploy.js always scrubs
// this back out of the remote's saved config immediately after.
function getCloneUrl(fullName, isPrivate) {
  if (!isPrivate) return `https://github.com/${fullName}.git`;
  const token = getToken();
  if (!token) {
    const err = new Error('This repository is private and GitHub is not connected.');
    err.status = 400;
    throw err;
  }
  return `https://x-access-token:${token}@github.com/${fullName}.git`;
}

module.exports = {
  setToken,
  isConnected,
  verifyToken,
  listRepos,
  getBranches,
  detectApp,
  getLatestCommit,
  createWebhook,
  getCloneUrl,
};
