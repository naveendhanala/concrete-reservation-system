// src/controllers/slot.controller.js
const { query } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const capacityService = require('../services/capacity.service');

// Helper: get local date string (YYYY-MM-DD) in server's timezone
function localDateStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Returns the 2 bookable dates (today + tomorrow) with their available shifts
exports.getBookableDates = asyncHandler(async (req, res) => {
  const { batchingPlant } = req.query;
  const todayStr    = localDateStr(0);
  const tomorrowStr = localDateStr(1);

  const [todaySlots, tomorrowSlots] = await Promise.all([
    capacityService.getAvailableSlotsForDate(todayStr, batchingPlant),
    capacityService.getAvailableSlotsForDate(tomorrowStr, batchingPlant),
  ]);

  res.json([
    { date: todayStr,    label: 'Today',    slots: todaySlots    },
    { date: tomorrowStr, label: 'Tomorrow', slots: tomorrowSlots },
  ]);
});

exports.getAvailable = asyncHandler(async (req, res) => {
  const { date, minQuantity } = req.query;
  if (!date) throw new AppError('date query param required (YYYY-MM-DD)', 400);

  const todayStr    = localDateStr(0);
  const tomorrowStr = localDateStr(1);
  if (date !== todayStr && date !== tomorrowStr) {
    throw new AppError('Slots are only available for today and tomorrow', 400);
  }

  const { batchingPlant } = req.query;
  const slots = await capacityService.getAvailableSlotsForDate(date, batchingPlant);

  const filtered = minQuantity
    ? slots.filter((s) => s.available_m3 >= parseFloat(minQuantity))
    : slots;

  res.json(filtered);
});

exports.getCalendar = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const fromDate = from || new Date().toISOString().split('T')[0];
  const toDate = to || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  const slots = await capacityService.getAvailableSlotsRange(fromDate, toDate);

  // Enrich with reservation counts
  const slotIds = slots.map((s) => s.slot_id);
  if (slotIds.length === 0) return res.json([]);

  const { rows: reservationCounts } = await query(
    `SELECT rsm.slot_id, COUNT(DISTINCT r.reservation_id) AS reservation_count,
            SUM(rsm.allocated_m3) AS total_allocated,
            COALESCE(SUM(r.actual_quantity_m3) FILTER (WHERE r.status = 'Completed'), 0) AS total_actual
     FROM reservation_slot_mappings rsm
     JOIN reservations r ON rsm.reservation_id = r.reservation_id
     WHERE rsm.slot_id = ANY($1)
       AND r.status NOT IN ('Rejected', 'Cancelled')
     GROUP BY rsm.slot_id`,
    [slotIds]
  );

  const countMap = {};
  reservationCounts.forEach((r) => {
    countMap[r.slot_id] = {
      count: r.reservation_count,
      allocated: parseFloat(r.total_allocated),
      actual: parseFloat(r.total_actual),
    };
  });

  const enriched = slots.map((s) => ({
    ...s,
    reservation_count: countMap[s.slot_id]?.count || 0,
    total_allocated: countMap[s.slot_id]?.allocated || 0,
    total_actual: countMap[s.slot_id]?.actual || 0,
    utilization_pct: Math.round(((countMap[s.slot_id]?.allocated || 0) / parseFloat(s.capacity_m3)) * 100),
  }));

  res.json(enriched);
});

exports.generateSlots = asyncHandler(async (req, res) => {
  const { fromDate, toDate } = req.body;
  const { generateSlotsForDate } = require('../config/shifts');

  let generated = 0;
  const start = new Date(fromDate);
  const end = new Date(toDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    for (const slot of generateSlotsForDate(dateStr)) {
      const { rowCount } = await query(
        `INSERT INTO slots (slot_date, start_time, end_time, capacity_m3, batching_plant)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (slot_date, start_time, batching_plant) DO NOTHING`,
        [slot.slot_date, slot.start_time, slot.end_time, slot.capacity_m3, slot.batching_plant]
      );
      generated += rowCount;
    }
  }

  res.json({ message: `Generated ${generated} new slots (5 shifts/day)`, generated });
});