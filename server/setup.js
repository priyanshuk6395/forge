'use strict';

// Idempotent: safe to run every time the service starts (userdata.sh does
// exactly that), only fills in what's missing.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const ENV_EXAMPLE_PATH = path.join(ROOT, '.env.example');

function readEnvFile(p) {
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function writeEnvFile(p, values) {
  const lines = Object.entries(values).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(p, lines.join('\n') + '\n', { mode: 0o600 });
}

function main() {
  const example = readEnvFile(ENV_EXAMPLE_PATH);
  const current = readEnvFile(ENV_PATH);
  const merged = { ...example, ...current };

  let changed = !fs.existsSync(ENV_PATH);

  if (!merged.ENCRYPTION_KEY) {
    merged.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    changed = true;
    console.log('[forge-setup] Generated ENCRYPTION_KEY.');
  }
  if (!merged.SESSION_SECRET) {
    merged.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
    changed = true;
    console.log('[forge-setup] Generated SESSION_SECRET.');
  }
  if (!merged.PORT) merged.PORT = '80';
  if (!merged.DATA_DIR) merged.DATA_DIR = './data';

  if (changed) {
    writeEnvFile(ENV_PATH, merged);
    console.log(`[forge-setup] Wrote ${ENV_PATH}`);
  } else {
    console.log('[forge-setup] .env already configured, nothing to do.');
  }

  fs.mkdirSync(path.join(ROOT, merged.DATA_DIR), { recursive: true, mode: 0o700 });
}

main();
