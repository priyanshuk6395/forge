'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_DATA = {
  meta: { schemaVersion: 1, initialized: false },
  users: [],
  settings: {}, // { githubToken, awsAccessKeyId, awsSecretAccessKey, awsRegion }
  servers: [], // connected/provisioned target machines
  projects: [], // { id, name, repoFullName, branch, ... }
  deployments: [], // release history, newest last
  incidents: [], // health-check driven incident records
  sessions: {}, // sid -> { userId, expires }
  audit: [], // { id, ts, actor, action, resource, result, meta }
};

let data = null;
let saveTimer = null;

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
}

function load() {
  ensureDataDir();
  if (fs.existsSync(DB_FILE)) {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    try {
      data = { ...structuredClone(DEFAULT_DATA), ...JSON.parse(raw) };
    } catch (e) {
      throw new Error(`Forge database at ${DB_FILE} is corrupt: ${e.message}`);
    }
  } else {
    data = structuredClone(DEFAULT_DATA);
    persistNow();
  }
  return data;
}

function persistNow() {
  ensureDataDir();
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, DB_FILE);
}

// Debounced save so bursts of writes (e.g. streaming deployment log lines)
// don't hit the disk on every single line.
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistNow();
  }, 150);
}

function saveSync() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  persistNow();
}

function get() {
  if (!data) load();
  return data;
}

function nextId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

process.on('exit', () => {
  if (saveTimer) persistNow();
});

module.exports = { get, save, saveSync, nextId, DATA_DIR };
