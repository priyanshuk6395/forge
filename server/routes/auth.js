'use strict';

const express = require('express');
const auth = require('../auth');
const { asyncHandler } = require('../utils');

const router = express.Router();

function sessionCookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    signed: true,
    secure: req.secure,
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  };
}

router.get('/status', (req, res) => {
  const user = auth.currentUser(req);
  res.json({
    needsSetup: !auth.hasAnyUser(),
    user: user ? { id: user.id, username: user.username, role: user.role } : null,
  });
});

// Debug endpoint to diagnose cookie/session issues
router.get('/debug', (req, res) => {
  const sid = req.signedCookies && req.signedCookies[auth.SESSION_COOKIE];
  const session = sid ? auth.getSession(sid) : null;
  const user = auth.currentUser(req);
  res.json({
    cookies: req.cookies,
    signedCookies: req.signedCookies,
    sessionId: sid,
    session: session ? { userId: session.userId, expires: session.expires } : null,
    user: user ? { id: user.id, username: user.username, role: user.role } : null,
    headers: {
      cookie: req.headers.cookie,
      'x-forge-client': req.headers['x-forge-client'],
    },
  });
});

router.post(
  '/setup',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    const user = auth.createFirstUser({ username, password });
    const sid = auth.createSession(user.id);
    res.cookie(auth.SESSION_COOKIE, sid, sessionCookieOptions(req));
    res.json({ user: { id: user.id, username: user.username, role: user.role } });
  })
);

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = auth.login({ username, password });
  if (!user) return res.status(401).json({ error: 'Invalid username or password.' });
  const sid = auth.createSession(user.id);
  res.cookie(auth.SESSION_COOKIE, sid, sessionCookieOptions(req));
  res.json({ user: { id: user.id, username: user.username, role: user.role } });
});

router.post('/logout', (req, res) => {
  const sid = req.signedCookies && req.signedCookies[auth.SESSION_COOKIE];
  if (sid) auth.destroySession(sid);
  res.clearCookie(auth.SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    path: '/',
  });
  res.json({ ok: true });
});

module.exports = router;
