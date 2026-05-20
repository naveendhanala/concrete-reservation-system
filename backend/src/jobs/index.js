// src/jobs/index.js
const cron = require('node-cron');
const { query } = require('../config/db');
const logger = require('../config/logger');

function startJobs() {
  // Auto-complete reservations where quantity is fully delivered AND last delivery was 48h+ ago
  cron.schedule('0 * * * *', async () => {
    try {
      const { rows } = await query(`
        SELECT r.reservation_id, r.reservation_number
        FROM reservations r
        WHERE r.status = 'Started'
          AND r.actual_quantity_m3 IS NOT NULL
          AND r.actual_quantity_m3 >= r.quantity_m3
          AND (
            SELECT MAX(d.delivered_at)
            FROM reservation_deliveries d
            WHERE d.reservation_id = r.reservation_id
          ) < NOW() - INTERVAL '48 hours'
      `);

      for (const res of rows) {
        await query(
          `UPDATE reservations
           SET status = 'Auto-completed', completed_at = NOW()
           WHERE reservation_id = $1 AND status = 'Started'`,
          [res.reservation_id]
        );
        logger.info(`Auto-completed reservation ${res.reservation_number}`);
      }

      if (rows.length > 0) {
        logger.info(`Auto-complete job: completed ${rows.length} reservation(s)`);
      }
    } catch (err) {
      logger.error('Auto-complete job failed:', err.message);
    }
  });

  // Generate slots for next 14 days — runs daily at midnight
  cron.schedule('0 0 * * *', async () => {
    try {
      logger.info('Job: Generating slots for upcoming days');
      const { generateSlotsForDate } = require('../config/shifts');

      let count = 0;
      for (let d = 1; d <= 14; d++) {
        const date = new Date();
        date.setDate(date.getDate() + d);
        // Use local date to avoid UTC timezone mismatch
        const yyyy = date.getFullYear();
        const mm   = String(date.getMonth() + 1).padStart(2, '0');
        const dd   = String(date.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        for (const slot of generateSlotsForDate(dateStr)) {
          const { rowCount } = await query(
            `INSERT INTO slots (slot_date, start_time, end_time, capacity_m3)
             VALUES ($1,$2,$3,$4) ON CONFLICT (slot_date, start_time) DO NOTHING`,
            [slot.slot_date, slot.start_time, slot.end_time, slot.capacity_m3]
          );
          count += rowCount;
        }
      }
      logger.info(`Job: Created ${count} new slots`);
    } catch (err) {
      logger.error('Slot generation job failed:', err.message);
    }
  });

  logger.info('Cron jobs registered: auto-complete (hourly), slot-generation (daily)');
}

module.exports = { startJobs };