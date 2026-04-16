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
    `SELECT
       ${POUR_DATE} AS date,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE r.status = 'Completed') AS completed,
       COUNT(*) FILTER (WHERE r.status = 'Cancelled') AS cancelled,
       COUNT(*) FILTER (WHERE r.status = 'Completed' AND r.completed_at <= r.requested_end) AS on_time,
       COALESCE(SUM(r.quantity_m3) FILTER (WHERE r.status NOT IN ('Cancelled', 'Rejected', 'Draft')), 0) AS total_requested_m3,
       COALESCE(SUM(r.actual_quantity_m3) FILTER (WHERE r.status = 'Completed'), 0) AS total_actual_m3
     FROM reservations r
     WHERE ($1::date IS NULL OR ${POUR_DATE} >= $1)
       AND ($2::date IS NULL OR ${POUR_DATE} <= $2)
       AND ($3::uuid IS NULL OR r.package_id = $3)
     GROUP BY ${POUR_DATE}
     ORDER BY date`,
    [from || null, to || null, packageId]
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
    `SELECT pkg.package_name,
       COUNT(r.reservation_id) AS total,
       COUNT(*) FILTER (WHERE r.status = 'Completed') AS completed,
       COUNT(*) FILTER (WHERE r.status = 'Cancelled') AS cancelled,
       COALESCE(SUM(r.quantity_m3) FILTER (WHERE r.status NOT IN ('Cancelled', 'Rejected', 'Draft')), 0) AS total_requested_m3,
       COALESCE(SUM(r.actual_quantity_m3) FILTER (WHERE r.status = 'Completed'), 0) AS total_actual_m3
     FROM packages pkg
     LEFT JOIN reservations r ON pkg.package_id = r.package_id
       AND ($1::date IS NULL OR ${POUR_DATE} >= $1)
       AND ($2::date IS NULL OR ${POUR_DATE} <= $2)
     WHERE ($3::uuid IS NULL OR pkg.package_id = $3)
     GROUP BY pkg.package_id, pkg.package_name
     ORDER BY total_requested_m3 DESC`,
    [from || null, to || null, packageId]
  );
  res.json(rows);
}));

// Daily pour report — PMHead, PM, Admin
router.get('/daily', requireRole('PMHead', 'PMManager', 'PM', 'Admin'), asyncHandler(async (req, res) => {
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

// Delivery log report — PMHead, PMManager, PM, Admin
router.get('/deliveries', requireRole('PMHead', 'PMManager', 'PM', 'Admin'), asyncHandler(async (req, res) => {
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
     WHERE ($1::date IS NULL OR DATE(d.delivered_at AT TIME ZONE 'Asia/Kolkata') >= $1)
       AND ($2::date IS NULL OR DATE(d.delivered_at AT TIME ZONE 'Asia/Kolkata') <= $2)
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

module.exports = router;
