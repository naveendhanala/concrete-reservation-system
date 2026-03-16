// src/services/capacity.service.js
// Core capacity validation and auto-split engine

const { query, withTransaction } = require('../config/db');
const { AppError } = require('../middleware/errorHandler');

function slotShiftName(startTime, endTime) {
  // startTime/endTime are plain strings: "YYYY-MM-DD HH:MM:SS"
  // Slice directly to avoid any timezone conversion.
  return `${String(startTime).slice(11, 16)}–${String(endTime).slice(11, 16)}`;
}

/**
 * Returns the two bookable dates:
 * - Today (only shifts whose start_time is still in the future)
 * - Tomorrow (all shifts)
 * Same-day bookings still go through VP approval flow.
 */
function getBookableDates() {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  return [todayStr, tomorrowStr];
}

/**
 * Get available predefined shifts for a given date.
 * Only returns shifts that:
 *   - Still have start_time in the future (for today)
 *   - Have remaining capacity > 0
 */
async function getAvailableSlotsForDate(date, batchingPlant) {
  const params = [date];
  let plantClause = '';
  if (batchingPlant) {
    params.push(batchingPlant);
    plantClause = `AND s.batching_plant = $${params.length}`;
  }

  const { rows } = await query(
    `SELECT
       s.slot_id,
       s.slot_date,
       s.start_time,
       s.end_time,
       s.capacity_m3,
       s.batching_plant,
       COALESCE(
         (SELECT SUM(rsm.allocated_m3)
          FROM reservation_slot_mappings rsm
          JOIN reservations r ON rsm.reservation_id = r.reservation_id
          WHERE rsm.slot_id = s.slot_id
            AND r.status NOT IN ('Rejected', 'Cancelled')),
         0
       ) AS booked_m3
     FROM slots s
     WHERE s.slot_date = $1::date
       AND s.is_active = TRUE
       AND s.end_time > (NOW() AT TIME ZONE 'Asia/Kolkata')
       ${plantClause}
     ORDER BY s.start_time`,
    params
  );

  return rows.map((r) => ({
    ...r,
    shift_name: slotShiftName(r.start_time, r.end_time),
    available_m3: parseFloat(r.capacity_m3) - parseFloat(r.booked_m3),
  })).filter((r) => r.available_m3 > 0);
}

/**
 * Get slots for a date range (used by calendar / P&M views).
 */
async function getAvailableSlotsRange(fromDate, toDate) {
  const { rows } = await query(
    `SELECT
       s.slot_id,
       s.slot_date,
       s.start_time,
       s.end_time,
       s.capacity_m3,
       s.batching_plant,
       COALESCE(
         (SELECT SUM(rsm.allocated_m3)
          FROM reservation_slot_mappings rsm
          JOIN reservations r ON rsm.reservation_id = r.reservation_id
          WHERE rsm.slot_id = s.slot_id
            AND r.status NOT IN ('Rejected', 'Cancelled')),
         0
       ) AS booked_m3
     FROM slots s
     WHERE s.slot_date BETWEEN $1::date AND $2::date
       AND s.is_active = TRUE
     ORDER BY s.slot_date, s.start_time`,
    [fromDate, toDate]
  );

  return rows.map((r) => ({
    ...r,
    shift_name: slotShiftName(r.start_time, r.end_time),
    available_m3: Math.max(0, parseFloat(r.capacity_m3) - parseFloat(r.booked_m3)),
  }));
}

/**
 * Auto-split: Given a requested quantity and a preferred start slot,
 * find how to allocate across consecutive slots.
 * Returns an array of { slot_id, allocated_m3 } or throws if not enough capacity.
 */
async function computeSlotAllocation(requestedSlotId, quantity) {
  // Get the requested slot and all subsequent slots on same day
  const { rows: requestedSlot } = await query(
    'SELECT slot_date, start_time FROM slots WHERE slot_id = $1',
    [requestedSlotId]
  );
  if (!requestedSlot[0]) throw new AppError('Slot not found', 404);

  const { slot_date, start_time } = requestedSlot[0];

  // Get all slots from the requested slot onward on that date
  const { rows: slots } = await query(
    `SELECT
       s.slot_id,
       s.capacity_m3,
       COALESCE(
         (SELECT SUM(rsm.allocated_m3)
          FROM reservation_slot_mappings rsm
          JOIN reservations r ON rsm.reservation_id = r.reservation_id
          WHERE rsm.slot_id = s.slot_id
            AND r.status NOT IN ('Rejected', 'Cancelled')),
         0
       ) AS booked_m3
     FROM slots s
     WHERE s.slot_date = $1
       AND s.start_time >= $2
       AND s.is_active = TRUE
     ORDER BY s.start_time`,
    [slot_date, start_time]
  );

  const allocation = [];
  let remaining = parseFloat(quantity);

  for (const slot of slots) {
    if (remaining <= 0) break;
    const available = parseFloat(slot.capacity_m3) - parseFloat(slot.booked_m3);
    if (available <= 0) continue;

    const allocate = Math.min(available, remaining);
    allocation.push({ slot_id: slot.slot_id, allocated_m3: allocate });
    remaining -= allocate;
  }

  if (remaining > 0) {
    throw new AppError(
      `Insufficient capacity. Only ${quantity - remaining} m³ available across remaining slots. ` +
      `Please choose a different date or reduce quantity.`,
      409
    );
  }

  return allocation;
}

/**
 * Lock and apply slot allocations within a transaction.
 * Uses SELECT FOR UPDATE to prevent concurrent double-booking.
 */
async function applySlotAllocations(client, reservationId, allocation) {
  for (const { slot_id, allocated_m3 } of allocation) {
    // Lock the slot row
    await client.query(
      'SELECT slot_id FROM slots WHERE slot_id = $1 FOR UPDATE',
      [slot_id]
    );

    // Recheck available capacity (double-check after lock)
    const { rows: check } = await client.query(
      `SELECT
         s.capacity_m3,
         COALESCE(SUM(rsm.allocated_m3), 0) AS booked_m3
       FROM slots s
       LEFT JOIN reservation_slot_mappings rsm ON s.slot_id = rsm.slot_id
       LEFT JOIN reservations r ON rsm.reservation_id = r.reservation_id
         AND r.status NOT IN ('Rejected', 'Cancelled')
       WHERE s.slot_id = $1
       GROUP BY s.capacity_m3`,
      [slot_id]
    );

    const available = parseFloat(check[0].capacity_m3) - parseFloat(check[0].booked_m3);
    if (available < allocated_m3) {
      throw new AppError(
        `Slot capacity changed. Please re-check availability and try again.`,
        409
      );
    }

    // Insert mapping
    await client.query(
      `INSERT INTO reservation_slot_mappings (reservation_id, slot_id, allocated_m3)
       VALUES ($1, $2, $3)`,
      [reservationId, slot_id, allocated_m3]
    );
  }
}

/**
 * Release slot allocations (on cancellation or rejection)
 */
async function releaseSlotAllocations(reservationId) {
  await query(
    'DELETE FROM reservation_slot_mappings WHERE reservation_id = $1',
    [reservationId]
  );
}

/**
 * Check if a request is for same-day (within today's remaining slots)
 */
function isSameDay(requestedStart) {
  const now = new Date();
  const requested = new Date(requestedStart);
  return (
    requested.getFullYear() === now.getFullYear() &&
    requested.getMonth() === now.getMonth() &&
    requested.getDate() === now.getDate()
  );
}

/**
 * Check if modification is past cutoff
 */
async function isPastCutoff(slotId) {
  const { rows: config } = await query(`SELECT value FROM config WHERE key = 'cutoff_hours'`);
  const cutoffHours = parseInt(config[0]?.value || '4');

  const { rows: slot } = await query('SELECT start_time FROM slots WHERE slot_id = $1', [slotId]);
  if (!slot[0]) return false;

  const cutoffTime = new Date(slot[0].start_time);
  cutoffTime.setHours(cutoffTime.getHours() - cutoffHours);

  return new Date() > cutoffTime;
}

module.exports = {
  getAvailableSlotsForDate,
  getAvailableSlotsRange,
  computeSlotAllocation,
  applySlotAllocations,
  releaseSlotAllocations,
  isSameDay,
  isPastCutoff,
};