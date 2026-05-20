// src/routes/report.routes.js
const express = require('express');
const { query } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { requireRole } = require('../middleware/auth');
const router = express.Router();

// "Pour date" logic: slots 00:00–04:59 IST belong to the PREVIOUS calendar day.
// Achieved by subtracting 5 hours from the IST wall-clock time before extracting the date.
const POUR_DATE = `DATE((r.requested_start AT TIME ZONE 'Asia/Kolkata') - INTERVAL '5 hours')`;

// Resolve the effective package_id filter: PMs are always scoped to their own package.
async function resolvePackageId(req) {
  if (req.user.role === 'PM') {
    const { rows } = await query(
      'SELECT package_id FROM user_packages WHERE user_id = $1 LIMIT 1',
      [req.user.user_id]
    );
    return rows[0]?.package_id || null;
  }
  return req.query.package_id || null;
}

// SLA performance report
router.get('/sla', asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const packageId = await resolvePackageId(req);
  const { rows } = await query(
    `WITH reservation_stats AS (
       SELECT
         ${POUR_DATE} AS date,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE r.status IN ('Completed','Auto-completed')) AS completed,
         COUNT(*) FILTER (WHERE r.status = 'Cancelled') AS cancelled,
         COUNT(*) FILTER (WHERE r.status IN ('Completed','Auto-completed') AND r.completed_at <= r.requested_end) AS on_time,
         COALESCE(SUM(r.quantity_m3) FILTER (WHERE r.status NOT IN ('Cancelled', 'Rejected', 'Draft')), 0) AS total_requested_m3
       FROM reservations r
       WHERE ($1::date IS NULL OR ${POUR_DATE} >= $1)
         AND ($2::date IS NULL OR ${POUR_DATE} <= $2)
         AND ($3::uuid IS NULL OR r.package_id = $3)
       GROUP BY ${POUR_DATE}
     ),
     delivery_stats AS (
       SELECT
         DATE((d.delivered_at AT TIME ZONE 'Asia/Kolkata') - INTERVAL '7 hours') AS date,
         COALESCE(SUM(d.quantity_m3), 0) AS total_actual_m3
       FROM reservation_deliveries d
       JOIN reservations r ON d.reservation_id = r.reservation_id
       WHERE ($4::date IS NULL OR DATE((d.delivered_at AT TIME ZONE 'Asia/Kolkata') - INTERVAL '7 hours') >= $4)
         AND ($5::date IS NULL OR DATE((d.delivered_at AT TIME ZONE 'Asia/Kolkata') - INTERVAL '7 hours') <= $5)
         AND ($6::uuid IS NULL OR r.package_id = $6)
       GROUP BY DATE((d.delivered_at AT TIME ZONE 'Asia/Kolkata') - INTERVAL '7 hours')
     )
     SELECT
       COALESCE(rs.date, ds.date)              AS date,
       COALESCE(rs.total, 0)                   AS total,
       COALESCE(rs.completed, 0)               AS completed,
       COALESCE(rs.cancelled, 0)               AS cancelled,
       COALESCE(rs.on_time, 0)                 AS on_time,
       COALESCE(rs.total_requested_m3, 0)      AS total_requested_m3,
       COALESCE(ds.total_actual_m3, 0)         AS total_actual_m3
     FROM reservation_stats rs
     FULL OUTER JOIN delivery_stats ds ON rs.date = ds.date
     ORDER BY date`,
    [from || null, to || null, packageId, from || null, to || null, packageId]
  );
  res.json(rows);
}));

// Utilization report (slot-based — no pour-date shift needed)
router.get('/utilization', asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const { rows } = await query(
    `SELECT s.slot_date, s.start_time,
       s.capacity_m3,
       COALESCE(SUM(rsm.allocated_m3), 0) AS booked_m3,
       ROUND(COALESCE(SUM(rsm.allocated_m3), 0) / s.capacity_m3 * 100, 1) AS utilization_pct
     FROM slots s
     LEFT JOIN reservation_slot_mappings rsm ON s.slot_id = rsm.slot_id
     LEFT JOIN reservations r ON rsm.reservation_id = r.reservation_id AND r.status NOT IN ('Rejected','Cancelled')
     WHERE ($1::date IS NULL OR s.slot_date >= $1)
       AND ($2::date IS NULL OR s.slot_date <= $2)
     GROUP BY s.slot_id, s.slot_date, s.start_time, s.capacity_m3
     ORDER BY s.slot_date, s.start_time`,
    [from || null, to || null]
  );
  res.json(rows);
}));

// Package-wise quantity summary
router.get('/packages', asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const packageId = await resolvePackageId(req);
  const { rows } = await query(
    `WITH delivery_actuals AS (
       SELECT r.package_id,
         COALESCE(SUM(d.quantity_m3), 0) AS total_actual_m3
       FROM reservation_deliveries d
       JOIN reservations r ON d.reservation_id = r.reservation_id
       WHERE ($1::date IS NULL OR DATE((d.delivered_at AT TIME ZONE 'Asia/Kolkata') - INTERVAL '7 hours') >= $1)
         AND ($2::date IS NULL OR DATE((d.delivered_at AT TIME ZONE 'Asia/Kolkata') - INTERVAL '7 hours') <= $2)
         AND ($3::uuid IS NULL OR r.package_id = $3)
       GROUP BY r.package_id
     )
     SELECT pkg.package_name,
       COUNT(r.reservation_id) AS total,
       COUNT(*) FILTER (WHERE r.status IN ('Completed','Auto-completed')) AS completed,
       COUNT(*) FILTER (WHERE r.status = 'Cancelled') AS cancelled,
       COALESCE(SUM(r.quantity_m3) FILTER (WHERE r.status NOT IN ('Cancelled', 'Rejected', 'Draft')), 0) AS total_requested_m3,
       COALESCE(da.total_actual_m3, 0) AS total_actual_m3
     FROM packages pkg
     LEFT JOIN reservations r ON pkg.package_id = r.package_id
       AND ($4::date IS NULL OR ${POUR_DATE} >= $4)
       AND ($5::date IS NULL OR ${POUR_DATE} <= $5)
     LEFT JOIN delivery_actuals da ON da.package_id = pkg.package_id
     WHERE ($6::uuid IS NULL OR pkg.package_id = $6)
     GROUP BY pkg.package_id, pkg.package_name, da.total_actual_m3
     ORDER BY total_requested_m3 DESC`,
    [from || null, to || null, packageId, from || null, to || null, packageId]
  );
  res.json(rows);
}));

// Daily pour report — PMHead, PMManager, PM, Admin, ClusterHead, VP
router.get('/daily', requireRole('PMHead', 'PMManager', 'PM', 'Admin', 'ClusterHead', 'VP'), asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) throw new AppError('date query param is required (YYYY-MM-DD)', 400);

  const packageId = await resolvePackageId(req);

  const { rows } = await query(
    `SELECT
       ROW_NUMBER() OVER (ORDER BY r.requested_start) AS sr_no,
       ${POUR_DATE}                                    AS date,
       COALESCE(c.name, '')                            AS contractor,
       r.chainage,
       p.package_name,
       r.grade,
       r.actual_quantity_m3,
       r.structure,
       r.nature_of_work,
       COALESCE(r.rfi_id, '')                          AS rfi_id,
       COALESCE(
         STRING_AGG(DISTINCT d.tm_no, ', ')
           FILTER (WHERE d.tm_no IS NOT NULL AND d.tm_no <> ''),
         ''
       )                                               AS tm_nos,
       COALESCE(
         STRING_AGG(DISTINCT d.batching_plant, ', ')
           FILTER (WHERE d.batching_plant IS NOT NULL AND d.batching_plant <> ''),
         ''
       )                                               AS batching_plants
     FROM reservations r
     LEFT JOIN contractors c ON r.contractor_id = c.contractor_id
     JOIN  packages p        ON r.package_id    = p.package_id
     LEFT JOIN reservation_deliveries d ON d.reservation_id = r.reservation_id
     WHERE ${POUR_DATE} = $1::date
       AND r.status NOT IN ('Draft', 'Cancelled', 'Rejected')
       AND ($2::uuid IS NULL OR r.package_id = $2::uuid)
     GROUP BY r.reservation_id, c.name, p.package_name
     ORDER BY r.requested_start`,
    [date, packageId]
  );
  res.json(rows);
}));

// Delivery log report — PMHead, PMManager, PM, Admin, ClusterHead, VP
router.get('/deliveries', requireRole('PMHead', 'PMManager', 'PM', 'Admin', 'ClusterHead', 'VP'), asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const packageId = await resolvePackageId(req);

  const { rows } = await query(
    `SELECT
       ROW_NUMBER() OVER (ORDER BY d.delivered_at) AS sr_no,
       (d.delivered_at AT TIME ZONE 'Asia/Kolkata')  AS delivered_at,
       r.reservation_number,
       COALESCE(c.name, '')                           AS contractor,
       r.chainage,
       p.package_name,
       r.grade,
       r.structure,
       r.nature_of_work,
       COALESCE(r.rfi_id, '')                         AS rfi_id,
       d.quantity_m3,
       d.tm_no,
       d.driver_no,
       d.batching_plant,
       u.name                                         AS logged_by
     FROM reservation_deliveries d
     JOIN reservations r     ON d.reservation_id  = r.reservation_id
     JOIN packages p         ON r.package_id      = p.package_id
     LEFT JOIN contractors c ON r.contractor_id   = c.contractor_id
     JOIN users u            ON d.delivered_by    = u.user_id
     WHERE ($1::date IS NULL OR DATE((d.delivered_at AT TIME ZONE 'Asia/Kolkata') - INTERVAL '7 hours') >= $1)
       AND ($2::date IS NULL OR DATE((d.delivered_at AT TIME ZONE 'Asia/Kolkata') - INTERVAL '7 hours') <= $2)
       AND ($3::uuid IS NULL OR r.package_id = $3)
     ORDER BY d.delivered_at`,
    [from || null, to || null, packageId]
  );
  res.json(rows);
}));

// Audit log
router.get('/audit', requireRole('Admin'), asyncHandler(async (req, res) => {
  const { entity, userId, from, to } = req.query;
  const { rows } = await query(
    `SELECT al.*, u.name AS user_name
     FROM audit_logs al LEFT JOIN users u ON al.user_id = u.user_id
     WHERE ($1::text IS NULL OR al.entity_name = $1)
       AND ($2::uuid IS NULL OR al.user_id = $2)
       AND ($3::date IS NULL OR DATE(al.created_at) >= $3)
       AND ($4::date IS NULL OR DATE(al.created_at) <= $4)
     ORDER BY al.created_at DESC LIMIT 500`,
    [entity || null, userId || null, from || null, to || null]
  );
  res.json(rows);
}));

// Labour mobilization: labour totals grouped three ways, with a per-date pivot
// of additional_expected for each mobilizer
router.get('/labour-mobilization', requireRole('Admin', 'LabourMob'), asyncHandler(async (req, res) => {
  const { date: rawDate } = req.query;
  let date;
  if (rawDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) throw new AppError('date must be in YYYY-MM-DD format', 400);
    const parsed = new Date(rawDate);
    if (isNaN(parsed.getTime())) throw new AppError('date must be a valid calendar date', 400);
    date = rawDate;
  } else {
    const { rows: maxRows } = await query(
      `SELECT COALESCE(MAX(date)::text, CURRENT_DATE::text) AS date FROM contractor_daily_log`
    );
    date = maxRows[0].date;
  }

  const ACTIVE = 'c.active_flag = TRUE';

  const [
    { rows: byPackage },
    { rows: byTypeOfWork },
    { rows: mobilizerTotals },
    { rows: mobilizerDateRows },
    { rows: allDates },
    { rows: totalRow },
  ] = await Promise.all([
    query(
      `SELECT p.package_id, p.package_name, COALESCE(SUM(cdl.available_count), 0)::int AS labour_count
         FROM contractor_daily_log cdl
         JOIN packages p ON p.package_id = cdl.package_id
         JOIN contractors c ON c.contractor_id = cdl.contractor_id
        WHERE ${ACTIVE} AND cdl.date = $1
        GROUP BY p.package_id, p.package_name
        ORDER BY p.package_name`,
      [date]
    ),
    query(
      `SELECT cdl.type_of_work, COALESCE(SUM(cdl.available_count), 0)::int AS labour_count
         FROM contractor_daily_log cdl
         JOIN contractors c ON c.contractor_id = cdl.contractor_id
        WHERE ${ACTIVE} AND cdl.date = $1
        GROUP BY cdl.type_of_work
        ORDER BY cdl.type_of_work`,
      [date]
    ),
    query(
      `SELECT COALESCE(NULLIF(c.mobilized_by, ''), 'Unspecified') AS mobilized_by,
              COALESCE(SUM(cdl.available_count), 0)::int AS labour_count
         FROM contractor_daily_log cdl
         JOIN contractors c ON c.contractor_id = cdl.contractor_id
        WHERE ${ACTIVE} AND cdl.date = $1
        GROUP BY 1
        ORDER BY 1`,
      [date]
    ),
    query(
      `SELECT COALESCE(NULLIF(c.mobilized_by, ''), 'Unspecified') AS mobilized_by,
              to_char(cdl.expected_date, 'YYYY-MM-DD') AS expected_date,
              COALESCE(SUM(cdl.additional_expected), 0)::int AS additional_expected
         FROM contractor_daily_log cdl
         JOIN contractors c ON c.contractor_id = cdl.contractor_id
        WHERE ${ACTIVE} AND cdl.date = $1 AND cdl.expected_date IS NOT NULL AND cdl.additional_expected IS NOT NULL
        GROUP BY 1, 2`,
      [date]
    ),
    query(
      `SELECT DISTINCT to_char(cdl.expected_date, 'YYYY-MM-DD') AS expected_date
         FROM contractor_daily_log cdl
         JOIN contractors c ON c.contractor_id = cdl.contractor_id
        WHERE ${ACTIVE} AND cdl.date = $1 AND cdl.expected_date IS NOT NULL AND cdl.additional_expected IS NOT NULL
        ORDER BY 1`,
      [date]
    ),
    query(
      `SELECT COALESCE(SUM(cdl.available_count), 0)::int AS total_labour
         FROM contractor_daily_log cdl
         JOIN contractors c ON c.contractor_id = cdl.contractor_id
        WHERE ${ACTIVE} AND cdl.date = $1`,
      [date]
    ),
  ]);

  // Pivot mobilizerDateRows into { [mobilized_by]: { [date]: sum } }
  const pivot = new Map();
  for (const row of mobilizerDateRows) {
    if (!pivot.has(row.mobilized_by)) pivot.set(row.mobilized_by, {});
    pivot.get(row.mobilized_by)[row.expected_date] = row.additional_expected;
  }

  const by_mobilized_by = mobilizerTotals.map((m) => ({
    mobilized_by: m.mobilized_by,
    labour_count: m.labour_count,
    additional_expected_by_date: pivot.get(m.mobilized_by) || {},
  }));

  res.json({
    effectiveDate: date,
    total_labour: totalRow[0]?.total_labour || 0,
    by_package: byPackage,
    by_type_of_work: byTypeOfWork,
    by_mobilized_by,
    mobilized_by_dates: allDates.map((r) => r.expected_date),
  });
}));

module.exports = router;
