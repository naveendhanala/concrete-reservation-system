// src/routes/user.routes.js
const express = require('express');
const { query } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { requireRole } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

const router = express.Router();

// ── Static sub-routes FIRST (must come before /:id) ───────────────────────

// Get all batching plants (for dropdowns)
router.get('/meta/plants', asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `SELECT plant_id, plant_name FROM batching_plants WHERE active_flag = TRUE ORDER BY plant_name`
  );
  res.json(rows);
}));

// Get current user's packages (with IDs)
router.get('/my-packages', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT p.package_id, p.package_name FROM packages p
     JOIN user_packages up ON p.package_id = up.package_id
     WHERE up.user_id = $1 AND p.active_flag = TRUE
     ORDER BY p.package_name`,
    [req.user.user_id]
  );
  res.json(rows);
}));

// Get engineers (role=Engineer) by package from users table
router.get('/engineers', asyncHandler(async (req, res) => {
  const { packageId } = req.query;
  const { rows } = await query(
    `SELECT u.user_id AS engineer_id, u.name, u.phone AS contact, up.package_id
     FROM users u
     JOIN user_packages up ON u.user_id = up.user_id
     WHERE up.package_id = $1 AND u.role = 'Engineer' AND u.active_flag = TRUE
     ORDER BY u.name`,
    [packageId]
  );
  res.json(rows);
}));

// Get contractors with optional search
router.get('/contractors', asyncHandler(async (req, res) => {
  const { search } = req.query;
  const { rows } = await query(
    `SELECT * FROM contractors WHERE active_flag = TRUE AND ($1::text IS NULL OR name ILIKE $1) ORDER BY name`,
    [search ? `%${search}%` : null]
  );
  res.json(rows);
}));

// ── Collection routes ──────────────────────────────────────────────────────

// List all users
router.get('/', requireRole('Admin', 'PMHead', 'VP'), asyncHandler(async (req, res) => {
  const { role } = req.query;
  const isAdmin = req.user.role === 'Admin';
  let sql = `
    SELECT u.user_id, u.name, u.role, u.login_id, u.email, u.phone, u.active_flag,
           u.same_day_request_count,
           ${isAdmin ? 'u.plain_password,' : ''}
           ARRAY_AGG(DISTINCT p.package_name) FILTER (WHERE p.package_name IS NOT NULL) AS packages,
           ARRAY_AGG(DISTINCT bp.plant_name)  FILTER (WHERE bp.plant_name  IS NOT NULL) AS batching_plants
    FROM users u
    LEFT JOIN user_packages up         ON u.user_id  = up.user_id
    LEFT JOIN packages p               ON up.package_id = p.package_id
    LEFT JOIN user_batching_plants ubp ON u.user_id  = ubp.user_id
    LEFT JOIN batching_plants bp       ON ubp.plant_id = bp.plant_id`;
  const params = [];
  if (role) { params.push(role); sql += ` WHERE u.role = $1`; }
  sql += ` GROUP BY u.user_id ORDER BY
    CASE u.role
      WHEN 'VP'          THEN 1
      WHEN 'ClusterHead' THEN 2
      WHEN 'PM'          THEN 3
      WHEN 'Engineer'    THEN 4
      WHEN 'PMHead'      THEN 5
      WHEN 'PMManager'   THEN 6
      ELSE 7
    END, u.name`;
  const { rows } = await query(sql, params);
  res.json(rows);
}));

// Create user (Admin only)
router.post('/', requireRole('Admin'), asyncHandler(async (req, res) => {
  const { name, role, login_id, email, phone, password, packageIds, plantIds } = req.body;
  if (!name || !role || !login_id || !password) {
    throw new AppError('name, role, login_id and password are required', 400);
  }

  const { rows: existing } = await query(
    `SELECT 1 FROM users WHERE login_id = $1`, [login_id.toLowerCase().trim()]
  );
  if (existing.length) throw new AppError('Login ID already in use', 409);

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await query(
    `INSERT INTO users (name, role, login_id, email, phone, password_hash, plain_password)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [name, role, login_id.toLowerCase().trim(), email || null, phone || null, hash, password]
  );
  const user = rows[0];

  if (packageIds?.length) {
    for (const pkgId of packageIds) {
      await query(
        'INSERT INTO user_packages (user_id, package_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [user.user_id, pkgId]
      );
    }
  }
  if (plantIds?.length) {
    for (const plantId of plantIds) {
      await query(
        'INSERT INTO user_batching_plants (user_id, plant_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [user.user_id, plantId]
      );
    }
  }

  res.status(201).json(user);
}));

// ── Per-user routes (/:id must come after static routes) ──────────────────

// Get single user with full assignment IDs
router.get('/:id', requireRole('Admin'), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT u.user_id, u.name, u.role, u.login_id, u.email, u.phone, u.active_flag, u.plain_password,
            ARRAY_AGG(DISTINCT up.package_id)  FILTER (WHERE up.package_id IS NOT NULL)  AS package_ids,
            ARRAY_AGG(DISTINCT p.package_name) FILTER (WHERE p.package_name IS NOT NULL) AS package_names,
            ARRAY_AGG(DISTINCT ubp.plant_id)   FILTER (WHERE ubp.plant_id IS NOT NULL)   AS plant_ids,
            ARRAY_AGG(DISTINCT bp.plant_name)  FILTER (WHERE bp.plant_name IS NOT NULL)  AS plant_names
     FROM users u
     LEFT JOIN user_packages up         ON u.user_id  = up.user_id
     LEFT JOIN packages p               ON up.package_id = p.package_id
     LEFT JOIN user_batching_plants ubp ON u.user_id  = ubp.user_id
     LEFT JOIN batching_plants bp       ON ubp.plant_id = bp.plant_id
     WHERE u.user_id = $1
     GROUP BY u.user_id`,
    [req.params.id]
  );
  if (!rows[0]) throw new AppError('User not found', 404);
  res.json(rows[0]);
}));

// Update user (Admin only) — no delete, use active_flag = false instead
router.patch('/:id', requireRole('Admin'), asyncHandler(async (req, res) => {
  const { name, role, login_id, email, phone, password, active_flag, packageIds, plantIds } = req.body;

  if (login_id !== undefined) {
    const { rows: existing } = await query(
      `SELECT 1 FROM users WHERE login_id = $1 AND user_id != $2`,
      [login_id.toLowerCase().trim(), req.params.id]
    );
    if (existing.length) throw new AppError('Login ID already in use', 409);
  }

  const extraFields = [];
  const params = [
    name, role, login_id?.toLowerCase().trim(), email, phone, active_flag, req.params.id,
  ];

  if (password) {
    const hash = await bcrypt.hash(password, 10);
    extraFields.push(`, password_hash = $${params.length + 1}`);
    params.push(hash);
    extraFields.push(`, plain_password = $${params.length + 1}`);
    params.push(password);
  }

  const { rows } = await query(
    `UPDATE users SET
       name        = COALESCE($1, name),
       role        = COALESCE($2, role),
       login_id    = COALESCE($3, login_id),
       email       = COALESCE($4, email),
       phone       = COALESCE($5, phone),
       active_flag = COALESCE($6, active_flag)
       ${extraFields.join('')}
     WHERE user_id = $7 RETURNING *`,
    params
  );
  if (!rows[0]) throw new AppError('User not found', 404);

  if (packageIds !== undefined) {
    await query('DELETE FROM user_packages WHERE user_id = $1', [req.params.id]);
    for (const pkgId of packageIds) {
      await query(
        'INSERT INTO user_packages (user_id, package_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [req.params.id, pkgId]
      );
    }
  }

  if (plantIds !== undefined) {
    await query('DELETE FROM user_batching_plants WHERE user_id = $1', [req.params.id]);
    for (const plantId of plantIds) {
      await query(
        'INSERT INTO user_batching_plants (user_id, plant_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [req.params.id, plantId]
      );
    }
  }

  res.json(rows[0]);
}));

// ── Contractor mutations (Admin only) ─────────────────────────────────────

router.post('/contractors', requireRole('Admin'), asyncHandler(async (req, res) => {
  const { name, contact } = req.body;
  if (!name) throw new AppError('name is required', 400);
  const { rows } = await query(
    `INSERT INTO contractors (name, contact) VALUES ($1, $2) RETURNING *`,
    [name, contact || null]
  );
  res.status(201).json(rows[0]);
}));

router.patch('/contractors/:id', requireRole('Admin'), asyncHandler(async (req, res) => {
  const { name, contact, active_flag } = req.body;
  const { rows } = await query(
    `UPDATE contractors
     SET name        = COALESCE($1, name),
         contact     = COALESCE($2, contact),
         active_flag = COALESCE($3, active_flag)
     WHERE contractor_id = $4 RETURNING *`,
    [name || null, contact || null, active_flag ?? null, req.params.id]
  );
  if (!rows[0]) throw new AppError('Contractor not found', 404);
  res.json(rows[0]);
}));

// ── Engineer mutations ─────────────────────────────────────────────────────

router.post('/engineers', requireRole('PM', 'PMHead', 'Admin'), asyncHandler(async (req, res) => {
  const { name, contact, package_id } = req.body;
  if (!name || !contact || !package_id) throw new AppError('name, contact and package_id are required', 400);
  if (req.user.role === 'PM') {
    const { rows: pkg } = await query(
      `SELECT 1 FROM user_packages WHERE user_id = $1 AND package_id = $2`,
      [req.user.user_id, package_id]
    );
    if (!pkg.length) throw new AppError('Not authorized for this package', 403);
  }
  const { rows } = await query(
    `INSERT INTO site_engineers (name, contact, package_id) VALUES ($1, $2, $3) RETURNING *`,
    [name, contact, package_id]
  );
  res.status(201).json(rows[0]);
}));

router.patch('/engineers/:id', requireRole('PM', 'PMHead', 'Admin'), asyncHandler(async (req, res) => {
  const { name, contact } = req.body;
  const { rows: eng } = await query(`SELECT * FROM site_engineers WHERE engineer_id = $1`, [req.params.id]);
  if (!eng[0]) throw new AppError('Engineer not found', 404);
  if (req.user.role === 'PM') {
    const { rows: pkg } = await query(
      `SELECT 1 FROM user_packages WHERE user_id = $1 AND package_id = $2`,
      [req.user.user_id, eng[0].package_id]
    );
    if (!pkg.length) throw new AppError('Not authorized', 403);
  }
  const { rows } = await query(
    `UPDATE site_engineers SET name = COALESCE($1, name), contact = COALESCE($2, contact) WHERE engineer_id = $3 RETURNING *`,
    [name, contact, req.params.id]
  );
  res.json(rows[0]);
}));

router.delete('/engineers/:id', requireRole('PM', 'PMHead', 'Admin'), asyncHandler(async (req, res) => {
  const { rows: eng } = await query(`SELECT * FROM site_engineers WHERE engineer_id = $1`, [req.params.id]);
  if (!eng[0]) throw new AppError('Engineer not found', 404);
  if (req.user.role === 'PM') {
    const { rows: pkg } = await query(
      `SELECT 1 FROM user_packages WHERE user_id = $1 AND package_id = $2`,
      [req.user.user_id, eng[0].package_id]
    );
    if (!pkg.length) throw new AppError('Not authorized', 403);
  }
  await query(`DELETE FROM site_engineers WHERE engineer_id = $1`, [req.params.id]);
  res.json({ success: true });
}));

module.exports = router;
