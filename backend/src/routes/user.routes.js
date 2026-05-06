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
// Pass ?all=true to include inactive contractors (used by Contractors management page)
router.get('/contractors', asyncHandler(async (req, res) => {
  const { search, all } = req.query;
  const { rows } = await query(
    `SELECT contractor_id, name, contact, mobilized_by, active_flag, created_at
     FROM contractors
     WHERE ($1::boolean OR active_flag = TRUE)
       AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%')
     ORDER BY name`,
    [all === 'true', search || null]
  );
  res.json(rows);
}));

// ── Contractor daily-log routes ────────────────────────────────────────────

router.get('/contractors/daily-log', asyncHandler(async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError('date must be in YYYY-MM-DD format', 400);
  const { rows } = await query(
    `SELECT cdl.log_id, cdl.contractor_id, c.name AS contractor_name,
            cdl.package_id, p.package_name, cdl.type_of_work, cdl.date,
            cdl.available_count, cdl.additional_expected, cdl.expected_date
     FROM contractor_daily_log cdl
     JOIN contractors c ON c.contractor_id = cdl.contractor_id
     JOIN packages p ON p.package_id = cdl.package_id
     WHERE cdl.date = $1
     ORDER BY c.name, p.package_name, cdl.type_of_work`,
    [date]
  );
  res.json(rows);
}));

router.post('/contractors/daily-log', requireRole('Admin', 'LabourMob'), asyncHandler(async (req, res) => {
  const { contractor_id, package_id, type_of_work, available_count, additional_expected, expected_date } = req.body;
  if (!contractor_id || !package_id || !type_of_work) {
    throw new AppError('contractor_id, package_id, and type_of_work are required', 400);
  }
  const parsedCount = parseNonNegativeInt(available_count, 'available_count');
  const parsedExpected = (additional_expected != null && additional_expected !== '')
    ? parseNonNegativeInt(additional_expected, 'additional_expected')
    : null;
  try {
    const { rows } = await query(
      `INSERT INTO contractor_daily_log
         (contractor_id, package_id, type_of_work, available_count, additional_expected, expected_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING log_id, contractor_id, package_id, type_of_work, date,
                 available_count, additional_expected, expected_date`,
      [contractor_id, package_id, type_of_work, parsedCount, parsedExpected, expected_date || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') throw new AppError('An entry for this contractor, package, and type of work already exists for today', 409);
    if (err.code === '23503') throw new AppError('Invalid contractor_id or package_id', 400);
    throw err;
  }
}));

router.patch('/contractors/daily-log/:logId', requireRole('Admin', 'LabourMob'), asyncHandler(async (req, res) => {
  const { logId } = req.params;
  const { available_count, additional_expected, expected_date } = req.body;

  const fields = [];
  const values = [];
  let i = 1;

  if (available_count !== undefined) {
    fields.push(`available_count = $${i++}`);
    values.push(parseNonNegativeInt(available_count, 'available_count'));
  }
  if ('additional_expected' in req.body) {
    const val = (additional_expected === null || additional_expected === '')
      ? null
      : parseNonNegativeInt(additional_expected, 'additional_expected');
    fields.push(`additional_expected = $${i++}`);
    values.push(val);
  }
  if ('expected_date' in req.body) {
    fields.push(`expected_date = $${i++}`);
    values.push(expected_date || null);
  }
  if (fields.length === 0) throw new AppError('No fields to update', 400);
  fields.push(`updated_at = NOW()`);
  values.push(logId);

  const { rows } = await query(
    `UPDATE contractor_daily_log SET ${fields.join(', ')}
     WHERE log_id = $${i} AND date = CURRENT_DATE
     RETURNING *`,
    values
  );
  if (rows.length === 0) throw new AppError('Entry not found or cannot edit past entries', 404);
  res.json(rows[0]);
}));

router.delete('/contractors/daily-log/:logId', requireRole('Admin', 'LabourMob'), asyncHandler(async (req, res) => {
  const { logId } = req.params;
  const { rows } = await query(
    'DELETE FROM contractor_daily_log WHERE log_id = $1 AND date = CURRENT_DATE RETURNING log_id',
    [logId]
  );
  if (rows.length === 0) throw new AppError('Entry not found or cannot delete past entries', 404);
  res.status(204).end();
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

router.post('/contractors', requireRole('Admin', 'LabourMob'), asyncHandler(async (req, res) => {
  const { name, contact, mobilized_by } = req.body;
  if (!name) throw new AppError('name is required', 400);
  const { rows } = await query(
    `INSERT INTO contractors (name, contact, mobilized_by) VALUES ($1, $2, $3) RETURNING *`,
    [name, contact || null, mobilized_by || null]
  );
  res.status(201).json(rows[0]);
}));

router.patch('/contractors/:id', requireRole('Admin', 'LabourMob'), asyncHandler(async (req, res) => {
  const { name, contact, mobilized_by, active_flag } = req.body;
  const { rows } = await query(
    `UPDATE contractors
     SET name         = COALESCE($1, name),
         contact      = COALESCE($2, contact),
         mobilized_by = COALESCE($3, mobilized_by),
         active_flag  = COALESCE($4, active_flag)
     WHERE contractor_id = $5 RETURNING *`,
    [name || null, contact || null, mobilized_by ?? null, active_flag ?? null, req.params.id]
  );
  if (!rows[0]) throw new AppError('Contractor not found', 404);
  res.json(rows[0]);
}));

// ── Helper function ──────────────────────────────────────────────────────────

function parseNonNegativeInt(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new AppError(`${fieldName} must be a non-negative integer`, 400);
  }
  return n;
}

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
