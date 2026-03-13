// src/routes/config.routes.js
const express = require('express');
const { query } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireRole } = require('../middleware/auth');
const router = express.Router();

router.get('/', requireRole('Admin'), asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM config ORDER BY key');
  res.json(rows);
}));

router.patch('/:key', requireRole('Admin'), asyncHandler(async (req, res) => {
  const { value } = req.body;
  const { rows } = await query(
    `UPDATE config SET value = $1, updated_at = NOW() WHERE key = $2 RETURNING *`,
    [value, req.params.key]
  );
  res.json(rows[0]);
}));

module.exports = router;
