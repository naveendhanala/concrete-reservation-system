// backend/src/controllers/delivery-logs.controller.js
const { query } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');

const listDeliveryLogs = asyncHandler(async (req, res) => {
  const { date, packageId, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const dateParam    = date      || null;
  const packageParam = packageId || null;

  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total
     FROM reservation_deliveries d
     JOIN reservations r ON d.reservation_id = r.reservation_id
     WHERE ($1::date IS NULL
            OR DATE((d.delivered_at AT TIME ZONE 'Asia/Kolkata') - INTERVAL '7 hours') = $1)
       AND ($2::uuid IS NULL OR r.package_id = $2)`,
    [dateParam, packageParam]
  );
  const total = countRows[0].total;

  const { rows } = await query(
    `SELECT
       sub.sr_no,
       sub.delivery_id,
       sub.reservation_number,
       sub.delivered_at,
       sub.package_name,
       sub.contractor,
       sub.chainage,
       sub.grade,
       sub.structure,
       sub.nature_of_work,
       sub.rfi_id,
       sub.quantity_m3,
       sub.tm_no,
       sub.driver_no,
       sub.batching_plant,
       sub.logged_by
     FROM (
       SELECT
         ROW_NUMBER() OVER (ORDER BY d.delivered_at DESC)::int AS sr_no,
         d.delivery_id,
         r.reservation_number,
         (d.delivered_at AT TIME ZONE 'Asia/Kolkata') AS delivered_at,
         p.package_name,
         COALESCE(c.name, '')       AS contractor,
         r.chainage,
         r.grade,
         r.structure,
         r.nature_of_work,
         COALESCE(r.rfi_id, '')    AS rfi_id,
         d.quantity_m3,
         d.tm_no,
         d.driver_no,
         d.batching_plant,
         u.name                    AS logged_by
       FROM reservation_deliveries d
       JOIN reservations r     ON d.reservation_id = r.reservation_id
       JOIN packages p         ON r.package_id     = p.package_id
       LEFT JOIN contractors c ON r.contractor_id  = c.contractor_id
       JOIN users u            ON d.delivered_by   = u.user_id
       WHERE ($1::date IS NULL
              OR DATE((d.delivered_at AT TIME ZONE 'Asia/Kolkata') - INTERVAL '7 hours') = $1)
         AND ($2::uuid IS NULL OR r.package_id = $2)
     ) sub
     ORDER BY sub.sr_no
     LIMIT $3 OFFSET $4`,
    [dateParam, packageParam, parseInt(limit), offset]
  );

  res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) });
});

module.exports = { listDeliveryLogs };
