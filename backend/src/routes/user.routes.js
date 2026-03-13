// src/routes/user.routes.js
const express = require('express');
const { query } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { requireRole } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

const router = express.Router();

router.get('/', requireRole('Admin', 'PMHead', 'VP'), asyncHandler(async (req, res) => {
  const { role } = req.query;
  let sql = `SELECT u.user_id, u.name, u.role, u.email, u.phone, u.active_flag, u.same_day_request_count,
                    ARRAY_AGG(DISTINCT p.package_name) FILTER (WHERE p.package_name IS NOT NULL) AS packages
             FROM users u
             LEFT JOIN user_packages up ON u.user_id = up.user_id
             LEFT JOIN packages p ON up.package_id = p.package_id`;
  const params = [];
  if (role) { params.push(role); sql += ` WHERE u.role = $1`; }
  sql += ` GROUP BY u.user_id ORDER BY u.name`;
  const { rows } = await query(sql, params);
  res.json(rows);
}));

router.post('/', requireRole('Admin'), asyncHandler(async (req, res) => {
  const { name, role, email, phone, password, packageIds } = req.body;
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await query(
    `INSERT INTO users (name, role, email, phone, password_hash) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [name, role, email, phone, hash]
  );
  const user = rows[0];
  if (packageIds?.length) {
    for (const pkgId of packageIds) {
      await query('INSERT INTO user_packages (user_id, package_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [user.user_id, pkgId]);
    }
  }
  res.status(201).json(user);
}));

router.patch('/:id', requireRole('Admin'), asyncHandler(async (req, res) => {
  const { name, phone, active_flag } = req.body;
  const { rows } = await query(
    `UPDATE users SET name = COALESCE($1, name), phone = COALESCE($2, phone),
     active_flag = COALESCE($3, active_flag) WHERE user_id = $4 RETURNING *`,
    [name, phone, active_flag, req.params.id]
  );
  if (!rows[0]) throw new AppError('User not found', 404);
  res.json(rows[0]);
}));

// Get site engineers by package
router.get('/engineers', asyncHandler(async (req, res) => {
  const { packageId } = req.query;
  const { rows } = await query(
    `SELECT * FROM site_engineers WHERE package_id = $1 AND active_flag = TRUE ORDER BY name`,
    [packageId]
  );
  res.json(rows);
}));

// Get contractors with search
router.get('/contractors', asyncHandler(async (req, res) => {
  const { search } = req.query;
  const { rows } = await query(
    `SELECT * FROM contractors WHERE active_flag = TRUE AND ($1::text IS NULL OR name ILIKE $1) ORDER BY name`,
    [search ? `%${search}%` : null]
  );
  res.json(rows);
}));

module.exports = router;
