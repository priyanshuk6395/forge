'use strict';

// Every one of these backs a value that eventually gets interpolated into a
// remote shell command (project slug -> directory/container names, branch
// name -> git checkout, port -> docker -p, env var keys -> an env file).
// Validating here, once, means deploy.js never has to trust a caller.

const RE_SLUG = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;
const RE_BRANCH = /^[A-Za-z0-9._/-]{1,200}$/;
const RE_REPO_FULL_NAME = /^[A-Za-z0-9._-]{1,100}\/[A-Za-z0-9._-]{1,100}$/;
const RE_ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const RE_HEALTH_PATH = /^\/[A-Za-z0-9._~/-]{0,255}$/;

function slugify(name) {
  const base = String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const slug = base || 'app';
  // pad to satisfy the 3-char minimum in RE_SLUG
  return slug.length < 3 ? `${slug}-app` : slug;
}

function isValidSlug(v) {
  return typeof v === 'string' && RE_SLUG.test(v);
}
function isValidBranch(v) {
  return typeof v === 'string' && RE_BRANCH.test(v) && !v.includes('..') && !v.startsWith('-');
}
function isValidRepoFullName(v) {
  return typeof v === 'string' && RE_REPO_FULL_NAME.test(v);
}
function isValidPort(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}
function isValidEnvKey(v) {
  return typeof v === 'string' && RE_ENV_KEY.test(v);
}
function isValidHealthPath(v) {
  return typeof v === 'string' && RE_HEALTH_PATH.test(v);
}
function isValidHost(v) {
  // IPv4 or a hostname — used for server public IP / DNS name.
  return (
    typeof v === 'string' &&
    v.length < 256 &&
    /^[A-Za-z0-9.-]+$/.test(v) &&
    !v.startsWith('-')
  );
}
function isValidSshUser(v) {
  return typeof v === 'string' && /^[a-z_][a-z0-9_-]{0,31}$/.test(v);
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

function assert(cond, message) {
  if (!cond) throw new ValidationError(message);
}

module.exports = {
  slugify,
  isValidSlug,
  isValidBranch,
  isValidRepoFullName,
  isValidPort,
  isValidEnvKey,
  isValidHealthPath,
  isValidHost,
  isValidSshUser,
  ValidationError,
  assert,
};
