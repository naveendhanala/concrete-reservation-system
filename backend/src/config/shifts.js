// src/config/shifts.js
// Single source of truth for all shift definitions, per batching plant.

const SHIFT_TIMES = [
  { name: 'Slot-1', start: '07:00', end: '10:00' },
  { name: 'Slot-2', start: '11:00', end: '15:00' },
  { name: 'Slot-3', start: '16:00', end: '19:00' },
  { name: 'Slot-4', start: '20:00', end: '00:00' },
  // Slot-5 runs 00:00–05:00 on D+1, stored under slot_date = D.
  { name: 'Slot-5', start: '00:00', end: '05:00', nextDay: true },
];

const PLANT_CAPACITIES = [
  {
    plant: 'Camp-1 M3',
    capacities: [180, 240, 180, 240, 300],
  },
  {
    plant: 'Camp-2 M3',
    capacities: [180, 240, 180, 240, 300],
  },
  {
    plant: 'Camp-3 M1',
    capacities: [120, 160, 120, 160, 200],
  },
  {
    plant: 'Camp-1 CP-30',
    capacities: [60, 80, 60, 80, 100],
  },
];

// Build SHIFTS as a flat list (used by seed / generateSlotsForDate)
const SHIFTS = PLANT_CAPACITIES.flatMap(({ plant, capacities }) =>
  SHIFT_TIMES.map((t, i) => ({
    name: t.name,
    start: t.start,
    end: t.end,
    nextDay: t.nextDay || false,
    capacity_m3: capacities[i],
    batching_plant: plant,
  }))
);

/**
 * Returns the next-day date string for a given YYYY-MM-DD string.
 */
function nextDayStr(dateStr) {
  const parts = dateStr.split('-').map(Number);
  const next = new Date(parts[0], parts[1] - 1, parts[2] + 1);
  return (
    next.getFullYear() + '-' +
    String(next.getMonth() + 1).padStart(2, '0') + '-' +
    String(next.getDate()).padStart(2, '0')
  );
}

/**
 * Generates slot rows for a given date across all batching plants.
 * Returns 20 rows per day (4 plants × 5 shifts).
 *
 * Slot-4 ends at midnight (next day 00:00).
 * Slot-5 spans 00:00–05:00 on the next calendar day but is stored under
 * slot_date = dateStr so it appears grouped with the other slots for that date.
 */
function generateSlotsForDate(dateStr) {
  const nextDay = nextDayStr(dateStr);

  return SHIFTS.map((shift) => {
    let startTime, endTime;

    if (shift.nextDay) {
      startTime = nextDay + ' ' + shift.start + ':00';
      endTime   = nextDay + ' ' + shift.end   + ':00';
    } else if (shift.end === '00:00') {
      startTime = dateStr + ' ' + shift.start + ':00';
      endTime   = nextDay + ' 00:00:00';
    } else {
      startTime = dateStr + ' ' + shift.start + ':00';
      endTime   = dateStr + ' ' + shift.end   + ':00';
    }

    return {
      slot_date:      dateStr,
      start_time:     startTime,
      end_time:       endTime,
      capacity_m3:    shift.capacity_m3,
      shift_name:     shift.name,
      batching_plant: shift.batching_plant,
    };
  });
}

module.exports = { SHIFTS, SHIFT_TIMES, PLANT_CAPACITIES, generateSlotsForDate };
