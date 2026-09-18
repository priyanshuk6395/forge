'use strict';

const db = require('./db');
const ssh = require('./ssh');
const github = require('./github');
const audit = require('./audit');
const { decrypt } = require('./crypto');
const {
  assert,
  isValidSlug,
  isValidBranch,
  isValidPort,
  isValidHealthPath,
  isValidEnvKey,
} = require('./validate');

const MAX_LOG_CHARS = 300_000;

function appendLog(deployment, text, stream = 'stdout') {
  deployment.logs.push({ ts: new Date().toISOString(), stream, text });
  let total = deployment.logs.reduce((n, l) => n + l.text.length, 0);
  while (total > MAX_LOG_CHARS && deployment.logs.length > 1) {
    total -= deployment.logs.shift().text.length;
  }
  db.save();
}

function nextDeploymentNumber(projectId) {
  const store = db.get();
  return store.deployments.filter((d) => d.projectId === projectId).length + 1;
}

function buildEnvFileContent(envVars) {
  const lines = [];
  for (const [key, value] of Object.entries(envVars || {})) {
    assert(isValidEnvKey(key), `Invalid environment variable name: ${key}`);
    const safeValue = String(value).replace(/\r?\n/g, ' ');
    lines.push(`${key}=${safeValue}`);
  }
  return lines.join('\n') + '\n';
}

function containerName(slug) {
  return `forge-${slug}`;
}
function imageName(slug) {
  return `forge-img-${slug}`;
}
function appDirFor(slug) {
  return `/opt/forge-apps/${slug}`;
}

function buildDeployScript({ slug, cloneUrl, publicCloneUrl, branch, hostPort, containerPort, healthPath }) {
  const appDir = appDirFor(slug);
  const image = imageName(slug);
  const container = containerName(slug);
  const envFile = `${appDir}.env`;
  // Every value spliced in below is either already validated by validate.js
  // (slug/branch/ports/path) or comes straight from GitHub's own API
  // response (the repo full name), never raw free text off an HTTP body.
  return `#!/bin/bash
set -euo pipefail
APP_DIR="${appDir}"
mkdir -p "$APP_DIR"
cd "$APP_DIR"
if [ -d .git ]; then
  git remote set-url origin "${cloneUrl}"
  git fetch --all --prune
else
  git clone --origin origin "${cloneUrl}" .
fi
git checkout "${branch}"
git reset --hard "origin/${branch}"
git remote set-url origin "${publicCloneUrl}"

if [ ! -f Dockerfile ]; then
  echo "FORGE_DEPLOY_FAIL=no_dockerfile"
  exit 1
fi

COMMIT_SHA="$(git rev-parse --short HEAD)"
echo "FORGE_COMMIT=$COMMIT_SHA"

# --- Secret scan (PRD 9.15): block the deploy if a credential was committed
if command -v gitleaks >/dev/null 2>&1; then
  echo "Scanning commit history for leaked credentials..."
  if ! gitleaks detect --source . --no-banner --redact -v; then
    echo "FORGE_DEPLOY_FAIL=secret_detected"
    exit 3
  fi
  echo "FORGE_SECRET_SCAN=pass"
else
  echo "FORGE_SECRET_SCAN=skipped_not_installed"
fi

docker build -t "${image}:$COMMIT_SHA" -t "${image}:latest" .

# --- Vulnerability scan (PRD 9.11 / 9.20): block on CRITICAL findings only —
# HIGH/MEDIUM are logged but don't block, to keep the default path usable.
if command -v trivy >/dev/null 2>&1; then
  echo "Scanning image for critical vulnerabilities..."
  if ! trivy image --exit-code 1 --severity CRITICAL --quiet --timeout 5m "${image}:$COMMIT_SHA"; then
    echo "FORGE_DEPLOY_FAIL=critical_vulnerability"
    exit 3
  fi
  echo "FORGE_SECURITY_SCAN=pass"
else
  echo "FORGE_SECURITY_SCAN=skipped_not_installed"
fi

sudo ufw allow ${hostPort}/tcp >/dev/null 2>&1 || true

docker rm -f "${container}" >/dev/null 2>&1 || true

docker run -d \\
  --name "${container}" \\
  --restart unless-stopped \\
  -p ${hostPort}:${containerPort} \\
  --env-file "${envFile}" \\
  "${image}:$COMMIT_SHA"

rm -f "${envFile}"

ATTEMPTS=0
until curl -fsS "http://localhost:${hostPort}${healthPath}" >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS+1))
  if [ "$ATTEMPTS" -ge 15 ]; then
    echo "FORGE_DEPLOY_STATUS=unhealthy"
    exit 2
  fi
  sleep 2
done
echo "FORGE_DEPLOY_STATUS=healthy"
echo "FORGE_IMAGE_TAG=$COMMIT_SHA"
`;
}

function buildRollbackScript({ slug, hostPort, containerPort, healthPath, targetTag }) {
  const image = imageName(slug);
  const container = containerName(slug);
  const envFile = `${appDirFor(slug)}.env`;
  return `#!/bin/bash
set -euo pipefail
if ! docker image inspect "${image}:${targetTag}" >/dev/null 2>&1; then
  echo "FORGE_ROLLBACK_FAIL=image_missing"
  exit 1
fi

docker rm -f "${container}" >/dev/null 2>&1 || true

docker run -d \\
  --name "${container}" \\
  --restart unless-stopped \\
  -p ${hostPort}:${containerPort} \\
  --env-file "${envFile}" \\
  "${image}:${targetTag}"

rm -f "${envFile}"

ATTEMPTS=0
until curl -fsS "http://localhost:${hostPort}${healthPath}" >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS+1))
  if [ "$ATTEMPTS" -ge 15 ]; then
    echo "FORGE_DEPLOY_STATUS=unhealthy"
    exit 2
  fi
  sleep 2
done
echo "FORGE_DEPLOY_STATUS=healthy"
echo "FORGE_IMAGE_TAG=${targetTag}"
`;
}

function decryptEnvVars(project) {
  const out = {};
  for (const [key, encValue] of Object.entries(project.envVarsEnc || {})) {
    out[key] = decrypt(encValue);
  }
  return out;
}

function getServerOrThrow(serverId) {
  const server = db.get().servers.find((s) => s.id === serverId);
  assert(server, 'Server not found.');
  return server;
}

function parseMarkers(output) {
  const markers = {};
  for (const line of output.split('\n')) {
    const m = line.match(/^FORGE_([A-Z_]+)=(.*)$/);
    if (m) markers[m[1]] = m[2].trim();
  }
  return markers;
}

async function runScriptDeployment(project, server, deployment, script) {
  const appDir = appDirFor(project.slug);
  const scriptPath = `${appDir}.deploy.sh`;

  appendLog(deployment, `Uploading deploy script to ${server.name} (${server.host})...\n`);
  await ssh.uploadContent(server, script, scriptPath, 0o700);

  appendLog(deployment, `Running deployment...\n`);
  const result = await ssh.exec(server, `bash "${scriptPath}"`, {
    onLine: (text) => appendLog(deployment, text),
    timeoutMs: 20 * 60 * 1000,
  });

  const combined = result.stdout + '\n' + result.stderr;
  const markers = parseMarkers(combined);
  deployment.commitSha = markers.COMMIT || deployment.commitSha;
  deployment.imageTag = markers.IMAGE_TAG || deployment.imageTag;

  const BLOCKING_REASONS = new Set(['secret_detected', 'critical_vulnerability']);
  if (result.code !== 0 || markers.DEPLOY_FAIL || markers.ROLLBACK_FAIL) {
    const reason = markers.DEPLOY_FAIL || markers.ROLLBACK_FAIL || `exit code ${result.code}`;
    deployment.status = BLOCKING_REASONS.has(reason) ? 'blocked' : 'failed';
    deployment.error = reason;
  } else if (markers.DEPLOY_STATUS === 'healthy') {
    deployment.status = 'success';
  } else {
    deployment.status = 'failed';
    deployment.error = 'Health check did not pass in time.';
  }
  deployment.finishedAt = new Date().toISOString();
  db.saveSync();
  return deployment;
}

// Kicks a deployment off in the background and returns immediately with the
// "building" record so the caller can respond to the HTTP request right
// away and let the client poll for progress — this is what makes the
// pipeline view in the UI feel alive instead of hanging a request for
// however long `docker build` takes.
function startDeployment(project, { actor, trigger = 'manual' } = {}) {
  assert(isValidSlug(project.slug), 'Project has an invalid slug.');
  assert(isValidBranch(project.branch), 'Project has an invalid branch.');
  assert(isValidPort(project.port), 'Project has an invalid container port.');
  assert(isValidHealthPath(project.healthPath), 'Project has an invalid health check path.');
  assert(project.serverId, 'Project has no server assigned. Connect a server first.');
  const hostPort = project.hostPort || project.port;
  assert(isValidPort(hostPort), 'Project has an invalid host port.');
  const server = getServerOrThrow(project.serverId);

  const deployment = {
    id: db.nextId('dep'),
    projectId: project.id,
    number: nextDeploymentNumber(project.id),
    branch: project.branch,
    commitSha: null,
    status: 'building',
    trigger,
    actor,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    imageTag: null,
    error: null,
    logs: [],
  };
  db.get().deployments.push(deployment);
  db.saveSync();

  executeDeploy(project, server, deployment, hostPort).catch((e) => {
    deployment.status = 'failed';
    deployment.error = e.message;
    deployment.finishedAt = new Date().toISOString();
    appendLog(deployment, `\nDeploy failed: ${e.message}\n`, 'stderr');
    db.saveSync();
    audit.record({
      actor,
      action: 'deployment.failed',
      resource: `project:${project.id}`,
      result: 'failure',
      meta: { error: e.message, deploymentId: deployment.id },
    });
  });

  return deployment;
}

async function executeDeploy(project, server, deployment, hostPort) {
  const cloneUrl = github.getCloneUrl(project.repoFullName, project.repoPrivate);
  const publicCloneUrl = `https://github.com/${project.repoFullName}.git`;
  const envFile = buildEnvFileContent(decryptEnvVars(project));
  await ssh.uploadContent(server, envFile, `${appDirFor(project.slug)}.env`, 0o600);

  const script = buildDeployScript({
    slug: project.slug,
    cloneUrl,
    publicCloneUrl,
    branch: project.branch,
    hostPort,
    containerPort: project.port,
    healthPath: project.healthPath,
  });

  appendLog(deployment, `Deploying ${project.repoFullName}@${project.branch} to ${server.name}...\n`);
  await runScriptDeployment(project, server, deployment, script);

  if (deployment.status === 'success') {
    project.currentDeploymentId = deployment.id;
    project.lastDeployedAt = deployment.finishedAt;
    db.saveSync();
  }
  audit.record({
    actor: deployment.actor,
    action: 'deployment.' + deployment.status,
    resource: `project:${project.id}`,
    result: deployment.status === 'success' ? 'success' : 'failure',
    meta: { deploymentId: deployment.id, number: deployment.number, commit: deployment.commitSha },
  });
}

function startRollback(project, targetDeployment, { actor } = {}) {
  assert(targetDeployment && targetDeployment.imageTag, 'Target release has no image to roll back to.');
  const server = getServerOrThrow(project.serverId);
  const hostPort = project.hostPort || project.port;

  const deployment = {
    id: db.nextId('dep'),
    projectId: project.id,
    number: nextDeploymentNumber(project.id),
    branch: project.branch,
    commitSha: targetDeployment.commitSha,
    status: 'building',
    trigger: 'rollback',
    actor,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    imageTag: null,
    error: null,
    rollbackFrom: project.currentDeploymentId,
    rollbackTo: targetDeployment.id,
    logs: [],
  };
  db.get().deployments.push(deployment);
  db.saveSync();

  executeRollback(project, server, deployment, targetDeployment, hostPort).catch((e) => {
    deployment.status = 'failed';
    deployment.error = e.message;
    deployment.finishedAt = new Date().toISOString();
    appendLog(deployment, `\nRollback failed: ${e.message}\n`, 'stderr');
    db.saveSync();
  });

  return deployment;
}

async function executeRollback(project, server, deployment, targetDeployment, hostPort) {
  const envFile = buildEnvFileContent(decryptEnvVars(project));
  await ssh.uploadContent(server, envFile, `${appDirFor(project.slug)}.env`, 0o600);

  const script = buildRollbackScript({
    slug: project.slug,
    hostPort,
    containerPort: project.port,
    healthPath: project.healthPath,
    targetTag: targetDeployment.imageTag,
  });

  appendLog(deployment, `Rolling back to release #${targetDeployment.number} (${targetDeployment.imageTag})...\n`);
  await runScriptDeployment(project, server, deployment, script);

  if (deployment.status === 'success') {
    project.currentDeploymentId = deployment.id;
    db.saveSync();
  }
  audit.record({
    actor: deployment.actor,
    action: 'deployment.rollback.' + deployment.status,
    resource: `project:${project.id}`,
    result: deployment.status === 'success' ? 'success' : 'failure',
    meta: { from: deployment.rollbackFrom, to: deployment.rollbackTo },
  });
}

async function getContainerLogs(project, lines = 200) {
  const server = getServerOrThrow(project.serverId);
  const safeLines = Math.min(Math.max(Number(lines) || 200, 10), 2000);
  const result = await ssh.exec(
    server,
    `docker logs --tail ${safeLines} ${containerName(project.slug)} 2>&1 || echo "(no container running yet)"`,
    { timeoutMs: 30000 }
  );
  return result.stdout;
}

async function getContainerStatus(project) {
  const server = getServerOrThrow(project.serverId);
  const result = await ssh.exec(
    server,
    `docker inspect -f '{{.State.Status}}|{{.State.Health.Status}}|{{.RestartCount}}' ${containerName(
      project.slug
    )} 2>/dev/null || echo "missing|none|0"`,
    { timeoutMs: 15000 }
  );
  const [status, health, restarts] = result.stdout.trim().split('|');
  return { status, health, restarts: Number(restarts) || 0 };
}

async function restartContainer(project, { actor } = {}) {
  const server = getServerOrThrow(project.serverId);
  await ssh.exec(server, `docker restart ${containerName(project.slug)}`, { timeoutMs: 60000 });
  audit.record({ actor, action: 'container.restart', resource: `project:${project.id}` });
}

module.exports = {
  startDeployment,
  startRollback,
  getContainerLogs,
  getContainerStatus,
  restartContainer,
  buildEnvFileContent,
  buildDeployScript,
  buildRollbackScript,
  containerName,
  imageName,
  decryptEnvVars,
};
