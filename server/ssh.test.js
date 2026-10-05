'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { parseRequirementReport } = require('./ssh');

function report(overrides = {}) {
  return {
    PLATFORM: 'ubuntu',
    PLATFORM_LIKE: 'debian',
    PRIVILEGE: 'ready',
    APT_GET: 'ready',
    SYSTEMD: 'ready',
    DOCKER: 'ready',
    DOCKER_DAEMON: 'ready',
    GIT: 'ready',
    CURL: 'ready',
    ...overrides,
  };
}

function output(values) {
  return Object.entries(values)
    .map(([key, value]) => `FORGE_CHECK_${key}=${value}`)
    .join('\n');
}

test('marks installable deployment tools missing before initialization', () => {
  const result = parseRequirementReport(output(report({ DOCKER: 'missing', DOCKER_DAEMON: 'missing' })));

  assert.equal(result.canInitialize, true);
  assert.equal(result.ready, false);
  assert.deepEqual(
    result.checks.filter((check) => check.state === 'missing').map((check) => check.id),
    ['docker', 'docker-daemon']
  );
});

test('blocks initialization when the host cannot run the bootstrap', () => {
  const result = parseRequirementReport(output(report({ PLATFORM: 'alpine', PLATFORM_LIKE: '', PRIVILEGE: 'missing' })));

  assert.equal(result.canInitialize, false);
  assert.equal(result.ready, false);
  assert.equal(result.checks.find((check) => check.id === 'platform').state, 'unsupported');
  assert.equal(result.checks.find((check) => check.id === 'privilege').state, 'missing');
});

test('marks a fully initialized host ready only when all deployment tools work', () => {
  const result = parseRequirementReport(output(report()), '2026-10-05T00:00:00.000Z');

  assert.equal(result.checkedAt, '2026-10-05T00:00:00.000Z');
  assert.equal(result.platform, 'ubuntu');
  assert.equal(result.canInitialize, true);
  assert.equal(result.ready, true);
});