'use strict';

const express = require('express');
const auth = require('../auth');
const { asyncHandler } = require('../utils');

const router = express.Router();

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  signed: true,
  secure: false,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  // `secure` is false for HTTP; `sameSite: 'lax'` works for same-origin on IP addresses
  // `domain` is not set to allow cookies on IP addresses and localhost
};

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
    res.cookie(auth.SESSION_COOKIE, sid, COOKIE_OPTS);
    res.json({ user: { id: user.id, username: user.username, role: user.role } });
  })
);

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = auth.login({ username, password });
  if (!user) return res.status(401).json({ error: 'Invalid username or password.' });
  const sid = auth.createSession(user.id);
  res.cookie(auth.SESSION_COOKIE, sid, COOKIE_OPTS);
  res.json({ user: { id: user.id, username: user.username, role: user.role } });
});

router.post('/logout', (req, res) => {
  const sid = req.signedCookies && req.signedCookies[auth.SESSION_COOKIE];
  if (sid) auth.destroySession(sid);
  res.clearCookie(auth.SESSION_COOKIE);
  res.json({ ok: true });
});

module.exports = router;
