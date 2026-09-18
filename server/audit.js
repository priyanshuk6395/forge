'use strict';

const db = require('./db');

function record({ actor, action, resource, result = 'success', meta = {} }) {
  const store = db.get();
  store.audit.push({
    id: db.nextId('audit'),
    ts: new Date().toISOString(),
    actor,
    action,
    resource,
    result,
    meta,
  });
  // keep the log bounded so db.json doesn't grow forever on a long-lived box
  if (store.audit.length > 5000) {
    store.audit.splice(0, store.audit.length - 5000);
  }
  db.save();
}

function list({ limit = 200 } = {}) {
  const store = db.get();
  return store.audit.slice(-limit).reverse();
}

module.exports = { record, list };
