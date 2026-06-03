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

  logger.info('Cron jobs registered: auto-complete (hourly)');
}

module.exports = { startJobs };