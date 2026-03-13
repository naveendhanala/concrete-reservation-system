// src/routes/package.routes.js
const express = require('express');
const { query } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireRole } = require('../middleware/auth');
const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await query(`SELECT * FROM packages WHERE active_flag = TRUE ORDER BY package_name`);
  res.json(rows);
}));

router.post('/', requireRole('Admin'), asyncHandler(async (req, res) => {
  const { package_name } = req.body;
  const { rows } = await query(`INSERT INTO packages (package_name) VALUES ($1) RETURNING *`, [package_name]);
  res.status(201).json(rows[0]);
}));

module.exports = router;
