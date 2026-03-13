// src/services/audit.service.js
const { query } = require('../config/db');
const logger = require('../config/logger');

async function log(userId, entityName, entityId, action, oldValue, newValue) {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, entity_name, entity_id, action, old_value, new_value)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, entityName, entityId, action,
       oldValue ? JSON.stringify(oldValue) : null,
       newValue ? JSON.stringify(newValue) : null]
    );
  } catch (err) {
    logger.error('Audit log failed:', err.message);
  }
}

module.exports = { log };
