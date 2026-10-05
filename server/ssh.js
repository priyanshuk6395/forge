'use strict';

const { Client } = require('ssh2');
const { decrypt, redact } = require('./crypto');

const REQUIREMENT_CHECK_COMMAND = [
  'if [ -r /etc/os-release ]; then . /etc/os-release; else ID=unknown; ID_LIKE=; fi',
  "printf 'FORGE_CHECK_CHECKED_AT=%s\\n' \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"",
  "printf 'FORGE_CHECK_PLATFORM=%s\\n' \"${ID:-unknown}\"",
  "printf 'FORGE_CHECK_PLATFORM_LIKE=%s\\n' \"${ID_LIKE:-}\"",
  "if [ \"$(id -u)\" -eq 0 ] || (command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1); then printf 'FORGE_CHECK_PRIVILEGE=ready\\n'; else printf 'FORGE_CHECK_PRIVILEGE=missing\\n'; fi",
  "if command -v apt-get >/dev/null 2>&1; then printf 'FORGE_CHECK_APT_GET=ready\\n'; else printf 'FORGE_CHECK_APT_GET=missing\\n'; fi",
  "if command -v systemctl >/dev/null 2>&1; then printf 'FORGE_CHECK_SYSTEMD=ready\\n'; else printf 'FORGE_CHECK_SYSTEMD=missing\\n'; fi",
  "if command -v docker >/dev/null 2>&1; then printf 'FORGE_CHECK_DOCKER=ready\\n'; if docker info >/dev/null 2>&1; then printf 'FORGE_CHECK_DOCKER_DAEMON=ready\\n'; else printf 'FORGE_CHECK_DOCKER_DAEMON=missing\\n'; fi; else printf 'FORGE_CHECK_DOCKER=missing\\nFORGE_CHECK_DOCKER_DAEMON=missing\\n'; fi",
  "if command -v git >/dev/null 2>&1; then printf 'FORGE_CHECK_GIT=ready\\n'; else printf 'FORGE_CHECK_GIT=missing\\n'; fi",
  "if command -v curl >/dev/null 2>&1; then printf 'FORGE_CHECK_CURL=ready\\n'; else printf 'FORGE_CHECK_CURL=missing\\n'; fi",
].join('\n');

const HOST_TELEMETRY_COMMAND = [
  "set -- $(awk '/^cpu / { print $2+$3+$4+$5+$6+$7+$8+$9, $5+$6 }' /proc/stat)",
  'total_before=$1',
  'idle_before=$2',
  'sleep 1',
  "set -- $(awk '/^cpu / { print $2+$3+$4+$5+$6+$7+$8+$9, $5+$6 }' /proc/stat)",
  'total_after=$1',
  'idle_after=$2',
  "cpu_percent=$(awk -v before_total=\"$total_before\" -v before_idle=\"$idle_before\" -v after_total=\"$total_after\" -v after_idle=\"$idle_after\" 'BEGIN { delta=after_total-before_total; if (delta <= 0) printf \"0.0\"; else printf \"%.1f\", 100*(delta-(after_idle-before_idle))/delta }')",
  "mem_total=$(awk '/^MemTotal:/ { print $2 * 1024 }' /proc/meminfo)",
  "mem_available=$(awk '/^MemAvailable:/ { print $2 * 1024 }' /proc/meminfo)",
  'mem_used=$((mem_total - mem_available))',
  "mem_percent=$(awk -v used=\"$mem_used\" -v total=\"$mem_total\" 'BEGIN { if (total > 0) printf \"%.1f\", used*100/total; else printf \"0.0\" }')",
  "set -- $(df -Pk / | awk 'NR == 2 { gsub(/%/, \"\", $5); print $3 * 1024, $2 * 1024, $5 }')",
  'disk_used=$1',
  'disk_total=$2',
  'disk_percent=$3',
  "set -- $(awk -F '[: ]+' 'NR > 2 && $2 != \"lo\" { rx += $3; tx += $11 } END { printf \"%.0f %.0f\", rx, tx }' /proc/net/dev)",
  'network_received=$1',
  'network_sent=$2',
  "printf 'FORGE_TELEMETRY_CHECKED_AT=%s\\n' \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"",
  "printf 'FORGE_TELEMETRY_CPU_PERCENT=%s\\n' \"$cpu_percent\"",
  "printf 'FORGE_TELEMETRY_MEMORY_USED_BYTES=%s\\n' \"$mem_used\"",
  "printf 'FORGE_TELEMETRY_MEMORY_TOTAL_BYTES=%s\\n' \"$mem_total\"",
  "printf 'FORGE_TELEMETRY_MEMORY_PERCENT=%s\\n' \"$mem_percent\"",
  "printf 'FORGE_TELEMETRY_DISK_USED_BYTES=%s\\n' \"$disk_used\"",
  "printf 'FORGE_TELEMETRY_DISK_TOTAL_BYTES=%s\\n' \"$disk_total\"",
  "printf 'FORGE_TELEMETRY_DISK_PERCENT=%s\\n' \"$disk_percent\"",
  "printf 'FORGE_TELEMETRY_NETWORK_RECEIVED_BYTES=%s\\n' \"$network_received\"",
  "printf 'FORGE_TELEMETRY_NETWORK_SENT_BYTES=%s\\n' \"$network_sent\"",
  'if command -v openssl >/dev/null 2>&1 && command -v timeout >/dev/null 2>&1; then',
  "  tls_end_date=$(timeout 8 sh -c 'openssl s_client -connect \"$FORGE_TELEMETRY_SERVER_NAME:443\" -servername \"$FORGE_TELEMETRY_SERVER_NAME\" </dev/null 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null' 2>/dev/null | sed -n 's/^notAfter=//p' | head -n 1)",
  "  if [ -n \"$tls_end_date\" ]; then printf 'FORGE_TELEMETRY_TLS_END_DATE=%s\\n' \"$tls_end_date\"; else printf 'FORGE_TELEMETRY_TLS_STATE=unavailable\\n'; fi",
  'else',
  "  printf 'FORGE_TELEMETRY_TLS_STATE=unavailable\\n'",
  'fi',
].join('\n');

function clientFor(server) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const connectOpts = {
      host: server.host,
      port: server.sshPort || 22,
      username: server.sshUser,
      readyTimeout: 20000,
      // Forge only ever connects to boxes the user explicitly registered by
      // IP/hostname — there is no host-key pinning store yet (roadmap), so
      // this is a known trust-on-first-use gap, called out in the README.
    };
    if (server.sshKeyEnc) {
      connectOpts.privateKey = decrypt(server.sshKeyEnc);
      if (server.sshKeyPassphraseEnc) {
        connectOpts.passphrase = decrypt(server.sshKeyPassphraseEnc);
      }
    } else if (server.sshPasswordEnc) {
      connectOpts.password = decrypt(server.sshPasswordEnc);
    } else {
      return reject(new Error('Server has no SSH credentials configured.'));
    }

    conn
      .on('ready', () => resolve(conn))
      .on('error', (err) => reject(err))
      .connect(connectOpts);
  });
}

// Runs a single command over SSH. `onLine` (optional) is called with each
// chunk of stdout/stderr as it streams in, for live deployment logs.
async function exec(server, command, { onLine, timeoutMs = 15 * 60 * 1000 } = {}) {
  const conn = await clientFor(server);
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error(`Command timed out after ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);

    conn.exec(command, (err, stream) => {
      if (err) {
        clearTimeout(timer);
        conn.end();
        return reject(err);
      }
      stream
        .on('close', (code) => {
          clearTimeout(timer);
          conn.end();
          resolve({ code, stdout: redact(stdout), stderr: redact(stderr) });
        })
        .on('data', (data) => {
          const text = redact(data.toString('utf8'));
          stdout += text;
          if (onLine) onLine(text, 'stdout');
        })
        .stderr.on('data', (data) => {
          const text = redact(data.toString('utf8'));
          stderr += text;
          if (onLine) onLine(text, 'stderr');
        });
    });
  });
}

// Uploads in-memory content to a remote path via SFTP, with explicit perms —
// used for the per-deploy env file and the generated deploy script.
async function uploadContent(server, content, remotePath, mode = 0o600) {
  const conn = await clientFor(server);
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) {
        conn.end();
        return reject(err);
      }
      const stream = sftp.createWriteStream(remotePath, { mode });
      stream.on('close', () => {
        conn.end();
        resolve();
      });
      stream.on('error', (e) => {
        conn.end();
        reject(e);
      });
      stream.end(content);
    });
  });
}

async function testConnection(server) {
  const result = await exec(server, 'echo forge-ok && uname -a', { timeoutMs: 15000 });
  if (result.code !== 0) {
    throw new Error(`SSH reached the host but the test command failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function parseRequirementReport(output, checkedAt = new Date().toISOString()) {
  const values = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^FORGE_CHECK_([A-Z_]+)=(.*)$/);
    if (match) values[match[1]] = match[2].trim();
  }

  const platformId = values.PLATFORM || 'unknown';
  const platformLike = (values.PLATFORM_LIKE || '').split(/\s+/);
  const supportedPlatforms = new Set(['debian', 'ubuntu']);
  const supportedPlatform = supportedPlatforms.has(platformId) || platformLike.some((id) => supportedPlatforms.has(id));
  const state = (value) => value === 'ready' ? 'ready' : 'missing';
  const checks = [
    { id: 'platform', label: 'Debian or Ubuntu', state: supportedPlatform ? 'ready' : 'unsupported' },
    { id: 'privilege', label: 'Root or passwordless sudo', state: state(values.PRIVILEGE) },
    { id: 'apt-get', label: 'APT package manager', state: state(values.APT_GET) },
    { id: 'systemd', label: 'systemd service manager', state: state(values.SYSTEMD) },
    { id: 'docker', label: 'Docker Engine', state: state(values.DOCKER) },
    { id: 'docker-daemon', label: 'Docker daemon', state: state(values.DOCKER_DAEMON) },
    { id: 'git', label: 'Git', state: state(values.GIT) },
    { id: 'curl', label: 'curl', state: state(values.CURL) },
  ];
  const initializationPrerequisites = new Set(['platform', 'privilege', 'apt-get', 'systemd']);
  const canInitialize = checks
    .filter((check) => initializationPrerequisites.has(check.id))
    .every((check) => check.state === 'ready');

  return {
    checkedAt: values.CHECKED_AT || checkedAt,
    platform: platformId,
    canInitialize,
    ready: canInitialize && checks.every((check) => check.state === 'ready'),
    checks,
  };
}

async function checkRequirements(server) {
  const result = await exec(server, REQUIREMENT_CHECK_COMMAND, { timeoutMs: 30000 });
  return parseRequirementReport(result.stdout);
}

function parseTelemetryReport(output, checkedAt = new Date().toISOString()) {
  const values = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^FORGE_TELEMETRY_([A-Z_]+)=(.*)$/);
    if (match) values[match[1]] = match[2].trim();
  }

  const number = (key) => {
    if (values[key] === undefined || values[key] === '') return null;
    const parsed = Number(values[key]);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };
  const percent = (value) => value === null ? null : Math.round(Math.min(100, value) * 10) / 10;
  const ratioPercent = (used, total) => used === null || total === null || total === 0
    ? null
    : percent((used / total) * 100);
  const memoryUsedBytes = number('MEMORY_USED_BYTES');
  const memoryTotalBytes = number('MEMORY_TOTAL_BYTES');
  const diskUsedBytes = number('DISK_USED_BYTES');
  const diskTotalBytes = number('DISK_TOTAL_BYTES');
  const rawTlsDate = values.TLS_END_DATE;
  const tlsDate = rawTlsDate ? new Date(rawTlsDate) : null;
  const tls = tlsDate && Number.isFinite(tlsDate.getTime())
    ? { state: tlsDate.getTime() > Date.now() ? 'valid' : 'expired', expiresAt: tlsDate.toISOString() }
    : { state: 'unavailable' };

  return {
    checkedAt: values.CHECKED_AT || checkedAt,
    collector: 'ssh',
    cpuPercent: percent(number('CPU_PERCENT')),
    memory: {
      usedBytes: memoryUsedBytes,
      totalBytes: memoryTotalBytes,
      percent: ratioPercent(memoryUsedBytes, memoryTotalBytes),
    },
    disk: {
      usedBytes: diskUsedBytes,
      totalBytes: diskTotalBytes,
      percent: ratioPercent(diskUsedBytes, diskTotalBytes),
    },
    network: {
      receivedBytes: number('NETWORK_RECEIVED_BYTES'),
      sentBytes: number('NETWORK_SENT_BYTES'),
    },
    tls,
  };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

async function collectTelemetry(server) {
  const command = `FORGE_TELEMETRY_SERVER_NAME=${shellQuote(server.host)}; export FORGE_TELEMETRY_SERVER_NAME\n${HOST_TELEMETRY_COMMAND}`;
  const result = await exec(server, command, { timeoutMs: 30000 });
  if (result.code !== 0) throw new Error(result.stderr || 'Host telemetry collection failed.');
  return parseTelemetryReport(result.stdout);
}

module.exports = {
  exec,
  uploadContent,
  testConnection,
  checkRequirements,
  parseRequirementReport,
  collectTelemetry,
  parseTelemetryReport,
};
