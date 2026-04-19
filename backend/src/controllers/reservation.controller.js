// src/controllers/reservation.controller.js
const { query, withTransaction } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const capacityService = require('../services/capacity.service');
const notificationService = require('../services/notification.service');
const auditService = require('../services/audit.service');
const { validationResult } = require('express-validator');

// ── HELPER: get plant names for a PMManager ───────────────────────────────────
async function getPMManagerPlantNames(userId) {
  const { rows } = await query(
    `SELECT bp.plant_name
     FROM batching_plants bp
     JOIN user_batching_plants ubp ON bp.plant_id = ubp.plant_id
     WHERE ubp.user_id = $1`,
    [userId]
  );
  return rows.map((r) => r.plant_name);
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
    const plantNames = await getPMManagerPlantNames(user.user_id);
    if (plantNames.length === 0) return res.json({ data: [], total: 0 });
    params.push(plantNames);
    whereClause += ` AND r.batching_plant = ANY($${params.length})`;
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
       COALESCE(eu.name, se.name) AS site_engineer_name,
       COALESCE(eu.phone, se.contact) AS site_engineer_contact,
       c.name AS contractor_name
     FROM reservations r
     JOIN users u ON r.requester_id = u.user_id
     JOIN packages pkg ON r.package_id = pkg.package_id
     LEFT JOIN users eu ON r.engineer_user_id = eu.user_id
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
       COALESCE(eu.name, se.name) AS site_engineer_name,
       COALESCE(eu.phone, se.contact) AS site_engineer_contact,
       c.name AS contractor_name,
       ab.name AS acknowledged_by_name,
       vp.acted_at AS vp_approved_at,
       vp.approver_id AS vp_approver_id,
       vu.name AS vp_approved_by_name
     FROM reservations r
     JOIN users u ON r.requester_id = u.user_id
     JOIN packages pkg ON r.package_id = pkg.package_id
     LEFT JOIN users eu ON r.engineer_user_id = eu.user_id
     LEFT JOIN site_engineers se ON r.site_engineer_id = se.engineer_id
     LEFT JOIN contractors c ON r.contractor_id = c.contractor_id
     LEFT JOIN users ab ON r.acknowledged_by = ab.user_id
     LEFT JOIN LATERAL (
       SELECT acted_at, approver_id FROM approval_workflows
       WHERE reservation_id = r.reservation_id
         AND approval_type = 'SameDay' AND status = 'Approved'
       LIMIT 1
     ) vp ON TRUE
     LEFT JOIN users vu ON vp.approver_id = vu.user_id
     WHERE r.reservation_id = $1`,
    [req.params.id]
  );
  if (!rows[0]) throw new AppError('Reservation not found', 404);

  const { rows: deliveries } = await query(
    `SELECT d.delivery_id, d.quantity_m3, d.tm_no, d.driver_no, d.batching_plant, d.delivered_at, u.name AS delivered_by_name
     FROM reservation_deliveries d
     JOIN users u ON d.delivered_by = u.user_id
     WHERE d.reservation_id = $1
     ORDER BY d.delivered_at`,
    [req.params.id]
  );

  const { rows: modifications } = await query(
    `SELECT rh.created_at AS changed_at, rh.reason_text, u.name AS changed_by_name
     FROM reservation_history rh
     JOIN users u ON rh.changed_by = u.user_id
     WHERE rh.reservation_id = $1 AND rh.change_type = 'Modified'
     ORDER BY rh.created_at`,
    [req.params.id]
  );

  res.json({ ...rows[0], deliveries, modifications });
});

// ── CREATE ────────────────────────────────────────────────────────────────────
exports.create = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const e = errors.array()[0];
    throw new AppError(`Validation failed on field "${e.path}": ${e.msg} (received: ${JSON.stringify(e.value)})`, 400);
  }

  const user = req.user;
  const {
    slotId, quantity_m3, grade, structure, chainage,
    nature_of_work, pouring_type, engineer_user_id, contractor_id,
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

  // Validate slot has enough capacity for the full requested quantity
  const allocation = await capacityService.computeSlotAllocation(slotId, quantity_m3);
  const isSameDay = capacityService.isSameDay(slot.start_time);

  // Fetch freebie limit once outside the transaction
  const { rows: freebieConfig } = await query(`SELECT value FROM config WHERE key = 'same_day_freebie_limit'`);
  const freebieLimit = parseInt(freebieConfig[0]?.value || '3');

  const result = await withTransaction(async (client) => {
    // Determine if this same-day request qualifies as a freebie
    let isFreebie = false;
    if (isSameDay) {
      const { rows: fc } = await client.query(
        `SELECT COUNT(*) FROM reservations
         WHERE package_id = $1 AND same_day_freebie = TRUE
           AND status NOT IN ('Cancelled','Rejected')
           AND DATE(created_at AT TIME ZONE 'Asia/Kolkata') = CURRENT_DATE`,
        [packageId]
      );
      isFreebie = parseInt(fc[0].count) < freebieLimit;
    }

    const initialStatus = isSameDay ? (isFreebie ? 'Submitted' : 'PendingApproval') : 'Submitted';

    // Create reservation
    const { rows: resRows } = await client.query(
      `INSERT INTO reservations
         (requester_id, package_id, quantity_m3, grade, structure, chainage,
          nature_of_work, pouring_type, engineer_user_id, contractor_id,
          priority_flag, status, requested_start, requested_end,
          is_split, rfi_id, batching_plant, same_day_freebie)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
               $13::TIMESTAMP AT TIME ZONE 'Asia/Kolkata',
               $14::TIMESTAMP AT TIME ZONE 'Asia/Kolkata',
               $15,$16,$17,$18)
       RETURNING *`,
      [
        user.user_id, packageId, quantity_m3, grade, structure, chainage,
        nature_of_work, pouring_type, engineer_user_id || null, contractor_id,
        isSameDay ? 'SameDay' : 'Normal',
        initialStatus,
        slot.start_time, slot.end_time,
        false,
        rfi_id || null,
        batching_plant || null,
        isFreebie,
      ]
    );
    const reservation = resRows[0];

    // Apply slot allocations (with locking)
    await capacityService.applySlotAllocations(client, reservation.reservation_id, allocation);

    // If same-day and freebie budget exhausted, create VP approval task
    if (isSameDay && !isFreebie) {
      const { rows: vpRows } = await client.query(`SELECT user_id FROM users WHERE role = 'VP' LIMIT 1`);
      if (vpRows[0]) {
        await client.query(
          `INSERT INTO approval_workflows
             (reservation_id, approver_id, approval_type, sla_due_at)
           VALUES ($1, $2, 'SameDay', NOW())`,
          [reservation.reservation_id, vpRows[0].user_id]
        );
        reservation._vpUserId = vpRows[0].user_id;
      }
    }

    // Increment same-day counter for PM
    if (isSameDay) {
      await client.query(
        'UPDATE users SET same_day_request_count = same_day_request_count + 1 WHERE user_id = $1',
        [user.user_id]
      );
    }

    reservation._isFreebie = isFreebie;
    return reservation;
  });

  // Audit
  await auditService.log(user.user_id, 'reservations', result.reservation_id, 'Create', null, result);

  res.status(201).json(result);

  // Notifications (fire-and-forget — don't block the response)
  notificationService.notifyReservationCreated(result, user);
  notificationService.notifyClusterHeadReservationCreated(result, user.name);
  if (result._vpUserId) {
    notificationService.notifyApprovalRequested(result, result._vpUserId);
  }
});

// ── ACKNOWLEDGE ───────────────────────────────────────────────────────────────
exports.acknowledge = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  const { rows: existing } = await query('SELECT * FROM reservations WHERE reservation_id = $1', [id]);
  if (!existing[0]) throw new AppError('Reservation not found', 404);
  if (existing[0].status !== 'Submitted') throw new AppError('Only Submitted reservations can be acknowledged', 400);

  // PMManager can only acknowledge reservations for their batching plant
  if (user.role === 'PMManager') {
    const plantNames = await getPMManagerPlantNames(user.user_id);
    if (!plantNames.includes(existing[0].batching_plant)) throw new AppError('Not authorized for this batching plant', 403);
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
  res.json(rows[0]);
  notificationService.notifyReservationAcknowledged(rows[0]);
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
      [user.user_id, newSlot[0].start_time, newSlot[0].end_time, false, id]
    );

    // Log history
    await client.query(
      `INSERT INTO reservation_history (reservation_id, changed_by, change_type, reason_text, snapshot)
       VALUES ($1, $2, 'SlotChange', $3, $4)`,
      [id, user.user_id, reason, JSON.stringify(existing[0])]
    );
  });

  const { rows: updated } = await query('SELECT * FROM reservations WHERE reservation_id = $1', [id]);
  res.json(updated[0]);
  notificationService.notifySlotProposed(updated[0]);
});

// ── MODIFY ────────────────────────────────────────────────────────────────────
exports.modify = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;
  const { quantity_m3, slotId, reason, rfi_id, grade } = req.body;

  const { rows: existing } = await query('SELECT * FROM reservations WHERE reservation_id = $1', [id]);
  if (!existing[0]) throw new AppError('Reservation not found', 404);
  if (existing[0].requester_id !== user.user_id) throw new AppError('Not authorized', 403);
  if (['Completed', 'Cancelled', 'Rejected'].includes(existing[0].status)) {
    throw new AppError('Cannot modify a completed, cancelled, or rejected reservation', 400);
  }
  // Started reservations and PMs (who own the reservation) skip the cutoff check
  const skipCutoff = existing[0].status === 'Started' || user.role === 'PM' || user.role === 'PMHead';

  // Get first slot
  const { rows: mappings } = await query(
    'SELECT slot_id FROM reservation_slot_mappings WHERE reservation_id = $1 ORDER BY slot_id LIMIT 1',
    [id]
  );
  const firstSlotId = slotId || mappings[0]?.slot_id;

  if (!skipCutoff) {
    const isPastCutoff = await capacityService.isPastCutoff(firstSlotId);
    if (isPastCutoff) {
      throw new AppError('Modification is past cutoff. Please contact P&M for assistance.', 400);
    }
  }

  // Recompute allocation — exclude this reservation's own booking from the capacity check
  const targetSlotId = slotId || firstSlotId;
  const targetQty = quantity_m3 !== undefined ? parseFloat(quantity_m3) : existing[0].quantity_m3;
  const targetGrade = grade !== undefined ? grade : existing[0].grade;
  const targetRfiId = rfi_id !== undefined ? (rfi_id.trim() || null) : existing[0].rfi_id;
  const allocation = await capacityService.computeSlotAllocation(targetSlotId, targetQty, id);

  // Build a structured diff of what changed
  const changes = [];
  if (parseFloat(targetQty) !== parseFloat(existing[0].quantity_m3)) {
    changes.push({ field: 'Quantity (m³)', from: String(existing[0].quantity_m3), to: String(targetQty) });
  }
  if (targetGrade !== existing[0].grade) {
    changes.push({ field: 'Grade', from: existing[0].grade || '—', to: targetGrade || '—' });
  }
  if (targetRfiId !== (existing[0].rfi_id || null)) {
    changes.push({ field: 'RFI ID', from: existing[0].rfi_id || '—', to: targetRfiId || '—' });
  }

  await withTransaction(async (client) => {
    await client.query('DELETE FROM reservation_slot_mappings WHERE reservation_id = $1', [id]);
    await capacityService.applySlotAllocations(client, id, allocation);

    await client.query(
      `UPDATE reservations SET quantity_m3 = $1, grade = $2, rfi_id = $3, version = version + 1
       WHERE reservation_id = $4`,
      [targetQty, targetGrade, targetRfiId, id]
    );
    await client.query(
      `INSERT INTO reservation_history (reservation_id, changed_by, change_type, reason_text, snapshot)
       VALUES ($1, $2, 'Modified', $3, $4)`,
      [id, user.user_id, JSON.stringify({ reason, changes }), JSON.stringify(existing[0])]
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
    const plantNames = await getPMManagerPlantNames(user.user_id);
    canCancel = plantNames.includes(existing[0].batching_plant);
  }
  if (!canCancel) throw new AppError('Not authorized to cancel', 403);

  if (['Completed', 'Cancelled'].includes(existing[0].status)) {
    throw new AppError('Already completed or cancelled', 400);
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

  const cancelled = { ...existing[0], cancellation_reason: reason };
  res.json({ message: 'Reservation cancelled successfully' });
  notificationService.notifyClusterHeadReservationCancelled(cancelled);
  notificationService.notifyPMManagerReservationCancelled(cancelled);
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
    `UPDATE reservations SET status = 'Started', started_at = NOW() WHERE reservation_id = $1 RETURNING *`,
    [id]
  );

  await auditService.log(user.user_id, 'reservations', id, 'Update', existing[0], rows[0]);
  res.json(rows[0]);
  notificationService.notifyReservationStarted(rows[0]);
});

// ── ADD DELIVERY ──────────────────────────────────────────────────────────────
exports.addDelivery = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { quantity_m3, tm_no, driver_no, batching_plant } = req.body;
  const user = req.user;

  if (!quantity_m3 || isNaN(quantity_m3) || parseFloat(quantity_m3) <= 0) {
    throw new AppError('Valid quantity is required', 400);
  }
  if (!tm_no || !tm_no.trim()) throw new AppError('TM No. is required', 400);
  if (!driver_no || !driver_no.trim()) throw new AppError('Driver No. is required', 400);
  if (!batching_plant || !batching_plant.trim()) throw new AppError('Batching Plant is required', 400);

  const { rows: existing } = await query('SELECT * FROM reservations WHERE reservation_id = $1', [id]);
  if (!existing[0]) throw new AppError('Reservation not found', 404);
  if (existing[0].status !== 'Started') throw new AppError('Can only log deliveries for Started reservations', 400);

  if (user.role === 'PMManager') {
    const plantNames = await getPMManagerPlantNames(user.user_id);
    if (!plantNames.includes(existing[0].batching_plant)) throw new AppError('Not authorized for this batching plant', 403);
  }

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO reservation_deliveries (reservation_id, quantity_m3, delivered_by, tm_no, driver_no, batching_plant)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, parseFloat(quantity_m3), user.user_id, tm_no.trim(), driver_no.trim(), batching_plant.trim()]
    );
    await client.query(
      `UPDATE reservations SET actual_quantity_m3 = COALESCE(actual_quantity_m3, 0) + $1 WHERE reservation_id = $2`,
      [parseFloat(quantity_m3), id]
    );
  });

  const { rows: deliveries } = await query(
    `SELECT d.delivery_id, d.quantity_m3, d.tm_no, d.driver_no, d.batching_plant, d.delivered_at, u.name AS delivered_by_name
     FROM reservation_deliveries d
     JOIN users u ON d.delivered_by = u.user_id
     WHERE d.reservation_id = $1
     ORDER BY d.delivered_at`,
    [id]
  );

  res.json(deliveries);
  notificationService.notifyPMDeliveryLogged(
    existing[0],
    { quantity_m3: parseFloat(quantity_m3), tm_no: tm_no.trim(), batching_plant: batching_plant.trim() },
    user.name
  );
});

// ── EDIT DELIVERY ─────────────────────────────────────────────────────────────
exports.editDelivery = asyncHandler(async (req, res) => {
  const { id, deliveryId } = req.params;
  const { quantity_m3, tm_no, driver_no, batching_plant } = req.body;
  const user = req.user;

  if (!quantity_m3 || isNaN(quantity_m3) || parseFloat(quantity_m3) <= 0) {
    throw new AppError('Valid quantity is required', 400);
  }
  if (!tm_no || !tm_no.trim()) throw new AppError('TM No. is required', 400);
  if (!driver_no || !driver_no.trim()) throw new AppError('Driver No. is required', 400);
  if (!batching_plant || !batching_plant.trim()) throw new AppError('Batching Plant is required', 400);

  const { rows: existing } = await query('SELECT * FROM reservations WHERE reservation_id = $1', [id]);
  if (!existing[0]) throw new AppError('Reservation not found', 404);
  if (existing[0].status !== 'Started') throw new AppError('Can only edit deliveries for Started reservations', 400);

  if (user.role === 'PMManager') {
    const plantNames = await getPMManagerPlantNames(user.user_id);
    if (!plantNames.includes(existing[0].batching_plant)) throw new AppError('Not authorized for this batching plant', 403);
  }

  const { rows: delivery } = await query(
    'SELECT * FROM reservation_deliveries WHERE delivery_id = $1 AND reservation_id = $2',
    [deliveryId, id]
  );
  if (!delivery[0]) throw new AppError('Delivery not found', 404);

  const oldQty = parseFloat(delivery[0].quantity_m3);
  const newQty = parseFloat(quantity_m3);
  const diff = newQty - oldQty;

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE reservation_deliveries SET quantity_m3 = $1, tm_no = $2, driver_no = $3, batching_plant = $4 WHERE delivery_id = $5`,
      [newQty, tm_no.trim(), driver_no.trim(), batching_plant.trim(), deliveryId]
    );
    await client.query(
      `UPDATE reservations SET actual_quantity_m3 = COALESCE(actual_quantity_m3, 0) + $1 WHERE reservation_id = $2`,
      [diff, id]
    );
  });

  const { rows: deliveries } = await query(
    `SELECT d.delivery_id, d.quantity_m3, d.tm_no, d.driver_no, d.batching_plant, d.delivered_at, u.name AS delivered_by_name
     FROM reservation_deliveries d
     JOIN users u ON d.delivered_by = u.user_id
     WHERE d.reservation_id = $1
     ORDER BY d.delivered_at`,
    [id]
  );
  res.json(deliveries);
});

// ── COMPLETE ──────────────────────────────────────────────────────────────────
exports.complete = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  const { rows: existing } = await query('SELECT * FROM reservations WHERE reservation_id = $1', [id]);
  if (!existing[0]) throw new AppError('Reservation not found', 404);
  if (existing[0].status !== 'Started') throw new AppError('Only Started reservations can be marked as completed', 400);
  if (existing[0].requester_id !== user.user_id) throw new AppError('Only the requesting PM can mark as complete', 403);

  const { rows } = await query(
    `UPDATE reservations SET status = 'Completed', completed_at = NOW() WHERE reservation_id = $1 RETURNING *`,
    [id]
  );

  await auditService.log(user.user_id, 'reservations', id, 'Update', existing[0], rows[0]);
  res.json(rows[0]);
  notificationService.notifyPMManagerReservationCompleted(rows[0]);
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
