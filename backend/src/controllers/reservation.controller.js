// src/controllers/reservation.controller.js
const { query, withTransaction } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const capacityService = require('../services/capacity.service');
const notificationService = require('../services/notification.service');
const auditService = require('../services/audit.service');
const { validationResult } = require('express-validator');

// ── HELPER: get package IDs for a PMManager (via their batching plant) ────────
async function getPMManagerPackageIds(userId) {
  const { rows } = await query(
    `SELECT p.package_id
     FROM packages p
     JOIN user_batching_plants ubp ON p.batching_plant_id = ubp.plant_id
     WHERE ubp.user_id = $1`,
    [userId]
  );
  return rows.map((r) => r.package_id);
}

// ── LIST ──────────────────────────────────────────────────────────────────────
exports.list = asyncHandler(async (req, res) => {
  const user = req.user;
  const { status, date, packageId, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  const params = [];

  // Row-level security
  if (user.role === 'PM') {
    params.push(user.user_id);
    whereClause += ` AND r.requester_id = $${params.length}`;
  } else if (user.role === 'ClusterHead') {
    const { rows: pkgs } = await query('SELECT package_id FROM user_packages WHERE user_id = $1', [user.user_id]);
    const ids = pkgs.map((p) => p.package_id);
    if (ids.length === 0) return res.json({ data: [], total: 0 });
    params.push(ids);
    whereClause += ` AND r.package_id = ANY($${params.length})`;
  } else if (user.role === 'PMManager') {
    const ids = await getPMManagerPackageIds(user.user_id);
    if (ids.length === 0) return res.json({ data: [], total: 0 });
    params.push(ids);
    whereClause += ` AND r.package_id = ANY($${params.length})`;
  }

  if (status) { params.push(status); whereClause += ` AND r.status = $${params.length}`; }
  if (date) { params.push(date); whereClause += ` AND DATE(r.requested_start) = $${params.length}`; }
  if (packageId) { params.push(packageId); whereClause += ` AND r.package_id = $${params.length}`; }

  const countResult = await query(
    `SELECT COUNT(*) FROM reservations r ${whereClause}`,
    params
  );

  params.push(limit, offset);
  const { rows } = await query(
    `SELECT
       r.*,
       u.name AS requester_name,
       pkg.package_name,
       se.name AS site_engineer_name, se.contact AS site_engineer_contact,
       c.name AS contractor_name
     FROM reservations r
     JOIN users u ON r.requester_id = u.user_id
     JOIN packages pkg ON r.package_id = pkg.package_id
     LEFT JOIN site_engineers se ON r.site_engineer_id = se.engineer_id
     LEFT JOIN contractors c ON r.contractor_id = c.contractor_id
     ${whereClause}
     ORDER BY r.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  res.json({ data: rows, total: parseInt(countResult.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
});

// ── GET BY ID ─────────────────────────────────────────────────────────────────
exports.getById = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT r.*,
       u.name AS requester_name,
       pkg.package_name,
       se.name AS site_engineer_name, se.contact AS site_engineer_contact,
       c.name AS contractor_name,
       ab.name AS acknowledged_by_name
     FROM reservations r
     JOIN users u ON r.requester_id = u.user_id
     JOIN packages pkg ON r.package_id = pkg.package_id
     LEFT JOIN site_engineers se ON r.site_engineer_id = se.engineer_id
     LEFT JOIN contractors c ON r.contractor_id = c.contractor_id
     LEFT JOIN users ab ON r.acknowledged_by = ab.user_id
     WHERE r.reservation_id = $1`,
    [req.params.id]
  );
  if (!rows[0]) throw new AppError('Reservation not found', 404);
  res.json(rows[0]);
});

// ── CREATE ────────────────────────────────────────────────────────────────────
exports.create = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new AppError(errors.array()[0].msg, 400);

  const user = req.user;
  const {
    slotId, quantity_m3, grade, structure, chainage,
    nature_of_work, pouring_type, site_engineer_id, contractor_id,
    rfi_id, batching_plant,
  } = req.body;

  // Get user's package
  const { rows: pkgRows } = await query(
    'SELECT package_id FROM user_packages WHERE user_id = $1 LIMIT 1',
    [user.user_id]
  );
  if (!pkgRows[0]) throw new AppError('PM not assigned to a package', 400);
  const packageId = pkgRows[0].package_id;

  // Get slot info
  const { rows: slotRows } = await query('SELECT * FROM slots WHERE slot_id = $1', [slotId]);
  if (!slotRows[0]) throw new AppError('Slot not found', 404);
  const slot = slotRows[0];

  // Compute allocation (handles auto-split)
  const allocation = await capacityService.computeSlotAllocation(slotId, quantity_m3);
  const isSameDay = capacityService.isSameDay(slot.start_time);

  const result = await withTransaction(async (client) => {
    // Create reservation
    const { rows: resRows } = await client.query(
      `INSERT INTO reservations
         (requester_id, package_id, quantity_m3, grade, structure, chainage,
          nature_of_work, pouring_type, site_engineer_id, contractor_id,
          priority_flag, status, requested_start, requested_end,
          is_split, rfi_id, batching_plant)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
               $13::TIMESTAMP AT TIME ZONE 'Asia/Kolkata',
               $14::TIMESTAMP AT TIME ZONE 'Asia/Kolkata',
               $15,$16,$17)
       RETURNING *`,
      [
        user.user_id, packageId, quantity_m3, grade, structure, chainage,
        nature_of_work, pouring_type, site_engineer_id, contractor_id,
        isSameDay ? 'SameDay' : 'Normal',
        isSameDay ? 'PendingApproval' : 'Submitted',
        slot.start_time, allocation.length > 1
          ? (await query('SELECT end_time FROM slots WHERE slot_id = $1', [allocation[allocation.length - 1].slot_id])).rows[0].end_time
          : slot.end_time,
        allocation.length > 1,
        rfi_id || null,
        batching_plant || null,
      ]
    );
    const reservation = resRows[0];

    // Apply slot allocations (with locking)
    await capacityService.applySlotAllocations(client, reservation.reservation_id, allocation);

    // If same-day, create VP approval task
    if (isSameDay) {
      const { rows: vpRows } = await client.query(`SELECT user_id FROM users WHERE role = 'VP' LIMIT 1`);
      if (vpRows[0]) {
        await client.query(
          `INSERT INTO approval_workflows
             (reservation_id, approver_id, approval_type, sla_due_at)
           VALUES ($1, $2, 'SameDay', NOW())`,
          [reservation.reservation_id, vpRows[0].user_id]
        );
      }
      // Increment same-day counter for PM
      await client.query(
        'UPDATE users SET same_day_request_count = same_day_request_count + 1 WHERE user_id = $1',
        [user.user_id]
      );
    }

    return reservation;
  });

  // Audit
  await auditService.log(user.user_id, 'reservations', result.reservation_id, 'Create', null, result);

  // Notifications
  await notificationService.notifyReservationCreated(result, user);

  res.status(201).json(result);
});

// ── ACKNOWLEDGE ───────────────────────────────────────────────────────────────
exports.acknowledge = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  const { rows: existing } = await query('SELECT * FROM reservations WHERE reservation_id = $1', [id]);
  if (!existing[0]) throw new AppError('Reservation not found', 404);
  if (existing[0].status !== 'Submitted') throw new AppError('Only Submitted reservations can be acknowledged', 400);

  // PMManager can only acknowledge their batching plant's packages
  if (user.role === 'PMManager') {
    const ids = await getPMManagerPackageIds(user.user_id);
    if (!ids.includes(existing[0].package_id)) throw new AppError('Not authorized for this package', 403);
  }

  const { rows } = await query(
    `UPDATE reservations
     SET status = 'Acknowledged',
         acknowledged_by = $1,
         acknowledged_at = NOW(),
         acknowledged_start = requested_start,
         acknowledged_end = requested_end
     WHERE reservation_id = $2
     RETURNING *`,
    [user.user_id, id]
  );

  await auditService.log(user.user_id, 'reservations', id, 'Update', existing[0], rows[0]);
  await notificationService.notifyReservationAcknowledged(rows[0]);
  res.json(rows[0]);
});

// ── PROPOSE ALTERNATIVE ───────────────────────────────────────────────────────
exports.proposeAlternative = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { alternativeSlotId, reason } = req.body;
  const user = req.user;

  const { rows: existing } = await query('SELECT * FROM reservations WHERE reservation_id = $1', [id]);
  if (!existing[0]) throw new AppError('Reservation not found', 404);

  // Recompute allocation for new slot
  const allocation = await capacityService.computeSlotAllocation(alternativeSlotId, existing[0].quantity_m3);
  const { rows: newSlot } = await query('SELECT * FROM slots WHERE slot_id = $1', [alternativeSlotId]);

  await withTransaction(async (client) => {
    // Release old allocations
    await client.query('DELETE FROM reservation_slot_mappings WHERE reservation_id = $1', [id]);

    // Apply new allocations
    await capacityService.applySlotAllocations(client, id, allocation);

    // Update reservation
    await client.query(
      `UPDATE reservations
       SET status = 'Acknowledged',
           acknowledged_by = $1, acknowledged_at = NOW(),
           acknowledged_start = $2::TIMESTAMP AT TIME ZONE 'Asia/Kolkata',
           acknowledged_end   = $3::TIMESTAMP AT TIME ZONE 'Asia/Kolkata',
           requested_start    = $2::TIMESTAMP AT TIME ZONE 'Asia/Kolkata',
           requested_end      = $3::TIMESTAMP AT TIME ZONE 'Asia/Kolkata',
           is_split = $4
       WHERE reservation_id = $5`,
      [user.user_id, newSlot[0].start_time, newSlot[0].end_time, allocation.length > 1, id]
    );

    // Log history
    await client.query(
      `INSERT INTO reservation_history (reservation_id, changed_by, change_type, reason_text, snapshot)
       VALUES ($1, $2, 'SlotChange', $3, $4)`,
      [id, user.user_id, reason, JSON.stringify(existing[0])]
    );
  });

  const { rows: updated } = await query('SELECT * FROM reservations WHERE reservation_id = $1', [id]);
  await notificationService.notifySlotProposed(updated[0]);
  res.json(updated[0]);
});

// ── MODIFY ────────────────────────────────────────────────────────────────────
exports.modify = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;
  const { quantity_m3, slotId, reason } = req.body;

  const { rows: existing } = await query('SELECT * FROM reservations WHERE reservation_id = $1', [id]);
  if (!existing[0]) throw new AppError('Reservation not found', 404);
  if (existing[0].requester_id !== user.user_id) throw new AppError('Not authorized', 403);
  if (['Completed', 'Cancelled', 'Rejected'].includes(existing[0].status)) {
    throw new AppError('Cannot modify a completed, cancelled, or rejected reservation', 400);
  }

  // Get first slot
  const { rows: mappings } = await query(
    'SELECT slot_id FROM reservation_slot_mappings WHERE reservation_id = $1 ORDER BY slot_id LIMIT 1',
    [id]
  );
  const firstSlotId = slotId || mappings[0]?.slot_id;

  const isPastCutoff = await capacityService.isPastCutoff(firstSlotId);
  if (isPastCutoff) {
    throw new AppError('Modification is past cutoff. Please contact P&M for assistance.', 400);
  }

  // Recompute allocation
  const targetSlotId = slotId || firstSlotId;
  const targetQty = quantity_m3 || existing[0].quantity_m3;
  const allocation = await capacityService.computeSlotAllocation(targetSlotId, targetQty);

  await withTransaction(async (client) => {
    await client.query('DELETE FROM reservation_slot_mappings WHERE reservation_id = $1', [id]);
    await capacityService.applySlotAllocations(client, id, allocation);

    await client.query(
      `UPDATE reservations SET quantity_m3 = $1, version = version + 1, status = 'Submitted'
       WHERE reservation_id = $2`,
      [targetQty, id]
    );
    await client.query(
      `INSERT INTO reservation_history (reservation_id, changed_by, change_type, reason_text, snapshot)
       VALUES ($1, $2, 'QuantityChange', $3, $4)`,
      [id, user.user_id, reason, JSON.stringify(existing[0])]
    );
  });

  const { rows: updated } = await query('SELECT * FROM reservations WHERE reservation_id = $1', [id]);
  res.json(updated[0]);
});

// ── CANCEL ────────────────────────────────────────────────────────────────────
exports.cancel = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const user = req.user;

  const { rows: existing } = await query('SELECT * FROM reservations WHERE reservation_id = $1', [id]);
  if (!existing[0]) throw new AppError('Reservation not found', 404);

  let canCancel = user.role === 'PMHead' || existing[0].requester_id === user.user_id;
  if (user.role === 'PMManager') {
    const ids = await getPMManagerPackageIds(user.user_id);
    canCancel = ids.includes(existing[0].package_id);
  }
  if (!canCancel) throw new AppError('Not authorized to cancel', 403);

  if (['Completed', 'Cancelled'].includes(existing[0].status)) {
    throw new AppError('Already completed or cancelled', 400);
  }

  // Block PM cancellations past cutoff (PMHead can still cancel)
  if (user.role === 'PM') {
    const { rows: mappings } = await query(
      'SELECT slot_id FROM reservation_slot_mappings WHERE reservation_id = $1 ORDER BY slot_id LIMIT 1',
      [id]
    );
    if (mappings[0]) {
      const isPastCutoff = await capacityService.isPastCutoff(mappings[0].slot_id);
      if (isPastCutoff) {
        throw new AppError('Cancellation is past cutoff. Please contact P&M for assistance.', 400);
      }
    }
  }

  await withTransaction(async (client) => {
    await client.query('DELETE FROM reservation_slot_mappings WHERE reservation_id = $1', [id]);
    await client.query(
      `UPDATE reservations SET status = 'Cancelled', cancellation_reason = $1 WHERE reservation_id = $2`,
      [reason, id]
    );
    await client.query(
      `INSERT INTO reservation_history (reservation_id, changed_by, change_type, reason_text, snapshot)
       VALUES ($1, $2, 'Cancellation', $3, $4)`,
      [id, user.user_id, reason, JSON.stringify(existing[0])]
    );
  });

  await auditService.log(user.user_id, 'reservations', id, 'Delete', existing[0], null);
  res.json({ message: 'Reservation cancelled successfully' });
});

// ── START ──────────────────────────────────────────────────────────────────────
exports.start = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  const { rows: existing } = await query('SELECT * FROM reservations WHERE reservation_id = $1', [id]);
  if (!existing[0]) throw new AppError('Reservation not found', 404);
  if (existing[0].status !== 'Acknowledged') throw new AppError('Only Acknowledged reservations can be started', 400);
  if (existing[0].requester_id !== user.user_id) throw new AppError('Not authorized to start this reservation', 403);

  const { rows } = await query(
    `UPDATE reservations SET status = 'Started' WHERE reservation_id = $1 RETURNING *`,
    [id]
  );

  await auditService.log(user.user_id, 'reservations', id, 'Update', existing[0], rows[0]);
  res.json(rows[0]);
});

// ── COMPLETE ──────────────────────────────────────────────────────────────────
exports.complete = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { actual_quantity_m3 } = req.body;
  const user = req.user;

  if (!actual_quantity_m3 || isNaN(actual_quantity_m3) || parseFloat(actual_quantity_m3) <= 0) {
    throw new AppError('Valid actual quantity is required', 400);
  }

  const { rows: existing } = await query('SELECT * FROM reservations WHERE reservation_id = $1', [id]);
  if (!existing[0]) throw new AppError('Reservation not found', 404);
  if (existing[0].status !== 'Started') {
    throw new AppError('Only Started reservations can be marked as completed', 400);
  }

  // PMManager can only complete their batching plant's packages
  if (user.role === 'PMManager') {
    const ids = await getPMManagerPackageIds(user.user_id);
    if (!ids.includes(existing[0].package_id)) throw new AppError('Not authorized for this package', 403);
  }

  const { rows } = await query(
    `UPDATE reservations
     SET status = 'Completed', actual_quantity_m3 = $1, completed_at = NOW()
     WHERE reservation_id = $2
     RETURNING *`,
    [parseFloat(actual_quantity_m3), id]
  );

  await auditService.log(user.user_id, 'reservations', id, 'Update', existing[0], rows[0]);
  res.json(rows[0]);
});

// ── GET SLOT ALLOCATIONS ──────────────────────────────────────────────────────
exports.getSlotAllocations = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT rsm.*, s.start_time, s.end_time, s.capacity_m3
     FROM reservation_slot_mappings rsm
     JOIN slots s ON rsm.slot_id = s.slot_id
     WHERE rsm.reservation_id = $1
     ORDER BY s.start_time`,
    [req.params.id]
  );
  res.json(rows);
});
