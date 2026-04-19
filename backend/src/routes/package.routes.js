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

// GET /packages/freebie-status — returns same-day freebie usage for the requesting PM's package
router.get('/freebie-status', requireRole('PM'), asyncHandler(async (req, res) => {
  const { rows: pkgRows } = await query(
    'SELECT package_id FROM user_packages WHERE user_id = $1 LIMIT 1',
    [req.user.user_id]
  );
  if (!pkgRows[0]) return res.json({ limit: 3, used: 0, remaining: 3 });
  const packageId = pkgRows[0].package_id;

  const [{ rows: fc }, { rows: cfg }] = await Promise.all([
    query(
      `SELECT COUNT(*) FROM reservations
       WHERE package_id = $1 AND same_day_freebie = TRUE
         AND status NOT IN ('Cancelled','Rejected')
         AND DATE(created_at AT TIME ZONE 'Asia/Kolkata') = CURRENT_DATE`,
      [packageId]
    ),
    query(`SELECT value FROM config WHERE key = 'same_day_freebie_limit'`),
  ]);

  const limit = parseInt(cfg[0]?.value || '3');
  const used = parseInt(fc[0].count);
  res.json({ limit, used, remaining: Math.max(0, limit - used) });
}));

router.post('/', requireRole('Admin'), asyncHandler(async (req, res) => {
  const { package_name } = req.body;
  const { rows } = await query(`INSERT INTO packages (package_name) VALUES ($1) RETURNING *`, [package_name]);
  res.status(201).json(rows[0]);
}));

module.exports = router;
