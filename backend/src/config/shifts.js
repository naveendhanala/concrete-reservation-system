// src/config/shifts.js
// Single source of truth for all shift definitions.

const SHIFTS = [
  { name: 'Shift 1', start: '07:00', end: '10:00', capacity_m3: 200 },
  { name: 'Shift 2', start: '10:00', end: '14:00', capacity_m3: 400 },
  { name: 'Shift 3', start: '14:00', end: '18:00', capacity_m3: 600 },
  { name: 'Shift 4', start: '18:00', end: '22:00', capacity_m3: 500 },
  { name: 'Shift 5', start: '22:00', end: '00:00', capacity_m3: 300 },
];

/**
 * Generates slot rows using plain local timestamp strings.
 * NO new Date() / toISOString() — avoids UTC timezone shifting.
 */
function generateSlotsForDate(dateStr) {
  return SHIFTS.map((shift) => {
    const startTime = dateStr + ' ' + shift.start + ':00';

    let endTime;
    if (shift.end === '00:00') {
      const parts = dateStr.split('-').map(Number);
      const next = new Date(parts[0], parts[1] - 1, parts[2] + 1);
      const ny = next.getFullYear();
      const nm = String(next.getMonth() + 1).padStart(2, '0');
      const nd = String(next.getDate()).padStart(2, '0');
      endTime = ny + '-' + nm + '-' + nd + ' 00:00:00';
    } else {
      endTime = dateStr + ' ' + shift.end + ':00';
    }

    return {
      slot_date:   dateStr,
      start_time:  startTime,
      end_time:    endTime,
      capacity_m3: shift.capacity_m3,
      shift_name:  shift.name,
    };
  });
}

module.exports = { SHIFTS, generateSlotsForDate };
