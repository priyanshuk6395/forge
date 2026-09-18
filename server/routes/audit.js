'use strict';

const express = require('express');
const audit = require('../audit');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ events: audit.list({ limit: Number(req.query.limit) || 200 }) });
});

module.exports = router;
