'use strict';

const db = require('./db');
const { hashPassword, verifyPassword, randomToken } = require('./crypto');
const audit = require('./audit');

const SESSION_COOKIE = 'forge_sid';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hasAnyUser() {
  return db.get().users.length > 0;
}

function createFirstUser({ username, password }) {
  const store = db.get();
  if (store.users.length > 0) {
    const err = new Error('Setup has already been completed.');
    err.status = 409;
    throw err;
  }
  if (!username || username.length < 3) {
    const err = new Error('Username must be at least 3 characters.');
    err.status = 400;
    throw err;
  }
  if (!password || password.length < 10) {
    const err = new Error('Password must be at least 10 characters.');
    err.status = 400;
    throw err;
  }
  const user = {
    id: db.nextId('user'),
    username,
    passwordHash: hashPassword(password),
    role: 'owner',
    createdAt: new Date().toISOString(),
  };
  store.users.push(user);
  store.meta.initialized = true;
  db.saveSync();
  audit.record({ actor: username, action: 'setup.complete', resource: 'forge' });
  return user;
}

function findUserByUsername(username) {
  return db.get().users.find((u) => u.username === username);
}

function login({ username, password }) {
  const user = findUserByUsername(username);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return null;
  }
  return user;
}

function createSession(userId) {
  const store = db.get();
  const sid = randomToken(24);
  store.sessions[sid] = { userId, expires: Date.now() + SESSION_TTL_MS };
  db.save();
  return sid;
}

function destroySession(sid) {
  const store = db.get();
  delete store.sessions[sid];
  db.save();
}

function getSession(sid) {
  if (!sid) return null;
  const store = db.get();
  const session = store.sessions[sid];
  if (!session) return null;
  if (session.expires < Date.now()) {
    delete store.sessions[sid];
    db.save();
    return null;
  }
  return session;
}

function currentUser(req) {
  const sid = req.signedCookies && req.signedCookies[SESSION_COOKIE];
  const session = getSession(sid);
  if (!session) return null;
  return db.get().users.find((u) => u.id === session.userId) || null;
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  req.user = user;
  next();
}

// Cheap CSRF mitigation for a same-origin, cookie-authenticated SPA: state
// changing requests must carry this header, which a cross-site <form> POST
// or <img> tag cannot add.
function requireXhr(req, res, next) {
  if (req.get('X-Forge-Client') !== '1') {
    return res.status(403).json({ error: 'Missing client header.' });
  }
  next();
}

module.exports = {
  SESSION_COOKIE,
  hasAnyUser,
  createFirstUser,
  login,
  createSession,
  destroySession,
  currentUser,
  requireAuth,
  requireXhr,
};
