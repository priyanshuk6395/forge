'use strict';

require('./setup'); // idempotent: creates .env with generated secrets if missing
require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const auth = require('./auth');
const monitor = require('./monitor');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true); // correct req.protocol/host if a proxy/load balancer sits in front

app.use(
  express.json({
    limit: '256kb',
    verify: (req, res, buf) => {
      req.rawBody = buf; // needed to verify the GitHub webhook HMAC signature
    },
  })
);
app.use(cookieParser(process.env.SESSION_SECRET));

// --- Unauthenticated routes ---
app.use('/webhook', require('./routes/webhooks'));
app.use('/api/auth', require('./routes/auth'));

// --- Everything past this point requires a logged-in session + the
// same-origin client header (cheap CSRF mitigation, see auth.js) ---
app.use('/api', auth.requireAuth, auth.requireXhr);
app.use('/api/settings', require('./routes/settings'));
app.use('/api/github', require('./routes/github'));
app.use('/api/servers', require('./routes/servers'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/dashboard', require('./routes/dashboard'));

// --- Static UI + SPA fallback ---
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR));
app.get(/^(?!\/api|\/webhook).*/, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// --- Error handler: every thrown error with a .status becomes clean JSON
// instead of an HTML stack trace, and secrets never leak into it because
// crypto.js only ever throws messages that don't include key material.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Internal error.' });
});

const PORT = Number(process.env.PORT) || 80;
app.listen(PORT, () => {
  console.log(`Forge listening on port ${PORT}`);
  monitor.start();
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});
