// src/routes/machinery.routes.js
const express = require('express');
const { query } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const SELECT_MACHINERY = `
  SELECT m.machinery_id, m.description, m.make_model, m.reg_no,
         m.last_month_availability, m.last_month_utilization,
         m.created_at, m.assigned_to,
         p.package_name AS assigned_to_name,
         EXISTS(
           SELECT 1 FROM machinery_issues mi
           WHERE mi.machinery_id = m.machinery_id AND mi.status = 'Open'
         ) AS has_open_issue
  FROM machinery m
  LEFT JOIN packages p ON m.assigned_to = p.package_id
`;

// GET all machinery — all authenticated users
router.get('/', asyncHandler(async (_req, res) => {
  const { rows } = await query(SELECT_MACHINERY + ' ORDER BY m.created_at DESC');
  res.json(rows);
}));

// GET machinery requests — PM sees own; PMHead sees all
router.get('/requests', requireRole('PM', 'PMHead'), asyncHandler(async (req, res) => {
  if (req.user.role === 'PM') {
    const { rows } = await query(`
      SELECT r.request_id, r.machinery_name, r.machinery_type, r.remarks,
             r.status, r.created_at,
             p.package_name
      FROM machinery_requests r
      JOIN packages p ON r.package_id = p.package_id
      WHERE r.requested_by = $1
      ORDER BY r.created_at DESC
    `, [req.user.user_id]);
    return res.json(rows);
  }

  // PMHead: all requests
  const { rows } = await query(`
    SELECT r.request_id, r.machinery_name, r.machinery_type, r.remarks,
           r.status, r.created_at,
           p.package_name,
           u.name AS requested_by_name,
           u.login_id AS requested_by_login
    FROM machinery_requests r
    JOIN packages p ON r.package_id = p.package_id
    JOIN users u ON r.requested_by = u.user_id
    ORDER BY
      CASE r.status WHEN 'Pending' THEN 0 ELSE 1 END,
      r.created_at DESC
  `);
  res.json(rows);
}));

// POST new machinery request — PM only
router.post('/requests', requireRole('PM'), asyncHandler(async (req, res) => {
  const { machinery_name, machinery_type, remarks } = req.body;
  if (!machinery_name || !machinery_name.trim()) throw new AppError('machinery_name is required', 400);

  // Look up PM's package
  const { rows: pkgRows } = await query(
    'SELECT package_id FROM user_packages WHERE user_id = $1 LIMIT 1',
    [req.user.user_id]
  );
  if (!pkgRows[0]) throw new AppError('No package assigned to your account', 400);

  const { rows } = await query(
    `INSERT INTO machinery_requests (requested_by, package_id, machinery_name, machinery_type, remarks)
     VALUES ($1, $2, $3, $4, $5) RETURNING request_id`,
    [
      req.user.user_id,
      pkgRows[0].package_id,
      machinery_name.trim(),
      machinery_type?.trim() || null,
      remarks?.trim() || null,
    ]
  );
  res.status(201).json({ request_id: rows[0].request_id });
}));

// PATCH complete a machinery request — PMHead only
router.patch('/requests/:requestId/complete', requireRole('PMHead'), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `UPDATE machinery_requests
     SET status = 'Completed', completed_by = $1, completed_at = NOW()
     WHERE request_id = $2 AND status = 'Pending'
     RETURNING request_id`,
    [req.user.user_id, req.params.requestId]
  );
  if (!rows[0]) throw new AppError('Request not found or already completed', 404);
  res.json({ success: true });
}));

// GET all open issues — PMHead only
router.get('/issues', requireRole('PMHead'), asyncHandler(async (_req, res) => {
  const { rows } = await query(`
    SELECT
      mi.issue_id,
      mi.machinery_id,
      mi.remarks,
      mi.status,
      mi.created_at,
      m.description AS machinery_name,
      m.make_model  AS machinery_type,
      p.package_name,
      u.name  AS raised_by_name,
      u.login_id AS raised_by_login
    FROM machinery_issues mi
    JOIN machinery m ON mi.machinery_id = m.machinery_id
    LEFT JOIN packages p ON m.assigned_to = p.package_id
    JOIN users u ON mi.raised_by = u.user_id
    WHERE mi.status = 'Open'
    ORDER BY mi.created_at DESC
  `);
  res.json(rows);
}));

// POST bulk upload machinery — PMHead only
router.post('/upload', requireRole('PMHead'), asyncHandler(async (req, res) => {
  const { records } = req.body;
  if (!Array.isArray(records) || records.length === 0) throw new AppError('records array is required', 400);

  const toNum = (v) => {
    if (v == null || v === '') return null;
    const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
    return isNaN(n) ? null : n;
  };

  // Filter to rows that have a description
  const validRows = records
    .map((r, i) => ({ ...r, _idx: i + 2 }))
    .filter((r) => r.description?.trim());

  if (validRows.length === 0) return res.json({ created: 0, updated: 0, errors: [] });

  // ── 1. Resolve all package names in ONE query ─────────────────────────────
  const pkgNames = [...new Set(
    validRows.map((r) => r.package_name?.trim()).filter(Boolean)
  )];
  const pkgMap = new Map(); // lower(name) → package_id
  if (pkgNames.length > 0) {
    const placeholders = pkgNames.map((_, i) => `$${i + 1}`).join(', ');
    const { rows: pkgRows } = await query(
      `SELECT package_id, LOWER(package_name) AS ln
       FROM packages
       WHERE LOWER(package_name) IN (${placeholders}) AND active_flag = TRUE`,
      pkgNames.map((n) => n.toLowerCase())
    );
    pkgRows.forEach((r) => pkgMap.set(r.ln, r.package_id));
  }

  // ── 2. Find all existing machinery by reg_no in ONE query ─────────────────
  const regNos = [...new Set(
    validRows.map((r) => r.reg_no?.trim()).filter(Boolean)
  )];
  const regMap = new Map(); // reg_no → machinery_id
  if (regNos.length > 0) {
    const placeholders = regNos.map((_, i) => `$${i + 1}`).join(', ');
    const { rows: existing } = await query(
      `SELECT machinery_id, reg_no FROM machinery WHERE reg_no IN (${placeholders})`,
      regNos
    );
    existing.forEach((r) => regMap.set(r.reg_no, r.machinery_id));
  }

  // ── 3. Split into updates and inserts ─────────────────────────────────────
  const toUpdate = [];
  const toInsert = [];

  for (const r of validRows) {
    const desc     = r.description.trim();
    const makeModel = r.make_model?.trim() || null;
    const regNo    = r.reg_no?.trim() || null;
    const pkgId    = r.package_name?.trim()
      ? (pkgMap.get(r.package_name.trim().toLowerCase()) ?? null)
      : null;
    const avail    = toNum(r.last_month_availability);
    const util     = toNum(r.last_month_utilization);

    if (regNo && regMap.has(regNo)) {
      toUpdate.push({ machinery_id: regMap.get(regNo), desc, makeModel, pkgId, avail, util });
    } else {
      toInsert.push({ desc, makeModel, regNo, pkgId, avail, util });
    }
  }

  // ── 4. Batch UPDATE via unnest ─────────────────────────────────────────────
  if (toUpdate.length > 0) {
    const ids     = toUpdate.map((r) => r.machinery_id);
    const descs   = toUpdate.map((r) => r.desc);
    const makes   = toUpdate.map((r) => r.makeModel);
    const pkgs    = toUpdate.map((r) => r.pkgId);
    const avails  = toUpdate.map((r) => r.avail);
    const utils   = toUpdate.map((r) => r.util);

    await query(
      `UPDATE machinery m
       SET description             = v.description,
           make_model              = NULLIF(v.make_model, ''),
           assigned_to             = NULLIF(v.pkg_id, '')::uuid,
           last_month_availability = NULLIF(v.avail, '')::numeric,
           last_month_utilization  = NULLIF(v.util,  '')::numeric
       FROM (
         SELECT
           unnest($1::uuid[])    AS machinery_id,
           unnest($2::text[])    AS description,
           unnest($3::text[])    AS make_model,
           unnest($4::text[])    AS pkg_id,
           unnest($5::text[])    AS avail,
           unnest($6::text[])    AS util
       ) v
       WHERE m.machinery_id = v.machinery_id`,
      [
        ids,
        descs,
        makes.map((v) => v ?? ''),
        pkgs.map((v) => v ?? ''),
        avails.map((v) => (v == null ? '' : String(v))),
        utils.map((v) => (v == null ? '' : String(v))),
      ]
    );
  }

  // ── 5. Batch INSERT ────────────────────────────────────────────────────────
  if (toInsert.length > 0) {
    const valuesList = [];
    const params = [];
    let p = 1;
    for (const r of toInsert) {
      valuesList.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
      params.push(r.desc, r.makeModel, r.regNo, r.pkgId, r.avail, r.util);
    }
    await query(
      `INSERT INTO machinery (description, make_model, reg_no, assigned_to, last_month_availability, last_month_utilization)
       VALUES ${valuesList.join(', ')}`,
      params
    );
  }

  res.json({ created: toInsert.length, updated: toUpdate.length, errors: [] });
}));

// POST create machinery — PMHead only
router.post('/', requireRole('PMHead'), asyncHandler(async (req, res) => {
  const { description, make_model, reg_no, last_month_availability, last_month_utilization } = req.body;
  if (!description || !description.trim()) throw new AppError('description is required', 400);

  const { rows } = await query(
    `INSERT INTO machinery (description, make_model, reg_no, last_month_availability, last_month_utilization)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [description.trim(), make_model?.trim() || null, reg_no?.trim() || null,
     last_month_availability || null, last_month_utilization || null]
  );

  const { rows: full } = await query(
    SELECT_MACHINERY + ' WHERE m.machinery_id = $1',
    [rows[0].machinery_id]
  );
  res.status(201).json(full[0]);
}));

// POST raise issue — PM only
router.post('/:id/issues', requireRole('PM'), asyncHandler(async (req, res) => {
  const { remarks } = req.body;
  if (!remarks || !remarks.trim()) throw new AppError('remarks is required', 400);

  const { rows: existing } = await query(
    'SELECT * FROM machinery WHERE machinery_id = $1', [req.params.id]
  );
  if (!existing[0]) throw new AppError('Machinery not found', 404);

  // Check for existing open issue
  const { rows: openIssues } = await query(
    `SELECT issue_id FROM machinery_issues WHERE machinery_id = $1 AND status = 'Open'`,
    [req.params.id]
  );
  if (openIssues[0]) throw new AppError('An open issue already exists for this machinery', 400);

  const { rows } = await query(
    `INSERT INTO machinery_issues (machinery_id, raised_by, remarks)
     VALUES ($1, $2, $3) RETURNING issue_id`,
    [req.params.id, req.user.user_id, remarks.trim()]
  );
  res.status(201).json({ issue_id: rows[0].issue_id });
}));

// PATCH resolve issue — PMHead only
router.patch('/issues/:issueId/resolve', requireRole('PMHead'), asyncHandler(async (req, res) => {
  const { resolution_remarks } = req.body;
  if (!resolution_remarks || !resolution_remarks.trim()) throw new AppError('resolution_remarks is required', 400);

  const { rows } = await query(
    `UPDATE machinery_issues
     SET status = 'Resolved',
         resolved_by = $1,
         resolved_at = NOW(),
         resolution_remarks = $2
     WHERE issue_id = $3 AND status = 'Open'
     RETURNING machinery_id`,
    [req.user.user_id, resolution_remarks.trim(), req.params.issueId]
  );
  if (!rows[0]) throw new AppError('Issue not found or already resolved', 404);
  res.json({ success: true, machinery_id: rows[0].machinery_id });
}));

// PATCH update / assign machinery — PMHead only
router.patch('/:id', requireRole('PMHead'), asyncHandler(async (req, res) => {
  const { description, make_model, reg_no, last_month_availability, last_month_utilization, assigned_to } = req.body;

  const { rows: existing } = await query(
    'SELECT * FROM machinery WHERE machinery_id = $1', [req.params.id]
  );
  if (!existing[0]) throw new AppError('Machinery not found', 404);

  // Validate assigned_to is a valid active package if provided
  if (assigned_to) {
    const { rows: pkg } = await query(
      `SELECT package_id FROM packages WHERE package_id = $1 AND active_flag = TRUE`,
      [assigned_to]
    );
    if (!pkg[0]) throw new AppError('Assigned package not found or inactive', 400);
  }

  await query(
    `UPDATE machinery
     SET description             = COALESCE($1, description),
         make_model              = COALESCE($2, make_model),
         reg_no                  = COALESCE($3, reg_no),
         last_month_availability = COALESCE($4, last_month_availability),
         last_month_utilization  = COALESCE($5, last_month_utilization),
         assigned_to             = $6
     WHERE machinery_id = $7`,
    [
      description?.trim() || null,
      make_model?.trim() || null,
      reg_no?.trim() || null,
      last_month_availability != null ? parseFloat(last_month_availability) : null,
      last_month_utilization  != null ? parseFloat(last_month_utilization)  : null,
      assigned_to === '' ? null : (assigned_to ?? existing[0].assigned_to),
      req.params.id,
    ]
  );

  const { rows: full } = await query(
    SELECT_MACHINERY + ' WHERE m.machinery_id = $1',
    [req.params.id]
  );
  res.json(full[0]);
}));

// DELETE machinery — PMHead only
router.delete('/:id', requireRole('PMHead'), asyncHandler(async (req, res) => {
  const { rows } = await query(
    'DELETE FROM machinery WHERE machinery_id = $1 RETURNING machinery_id',
    [req.params.id]
  );
  if (!rows[0]) throw new AppError('Machinery not found', 404);
  res.json({ success: true });
}));

module.exports = router;
