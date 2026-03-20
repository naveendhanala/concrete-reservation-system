// src/config/db.js
const { Pool, types } = require('pg');

// Return TIMESTAMP WITHOUT TIMEZONE (OID 1114) and DATE (OID 1082) as plain strings
// so values are never shifted to UTC when serialised to JSON.
types.setTypeParser(1114, (val) => val); // TIMESTAMP WITHOUT TZ  → "YYYY-MM-DD HH:MM:SS"
types.setTypeParser(1082, (val) => val); // DATE                  → "YYYY-MM-DD"

// Return TIMESTAMPTZ (OID 1184) as an IST wall-clock string ("YYYY-MM-DD HH:MM:SS")
// PostgreSQL sends UTC e.g. "2026-03-17 01:30:00+00"; we shift to IST (+05:30)
// so that .slice(11,16) on the frontend always gives the correct local time.
types.setTypeParser(1184, (val) => {
  // val from pg: "2026-03-17 01:30:00+00" — fix offset to full ISO then parse
  const iso = val.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00').replace(/\+00:00$/, 'Z');
  const d = new Date(iso);
  const ist = new Date(d.getTime() + (5 * 60 + 30) * 60 * 1000); // shift to IST
  const pad = (n) => String(n).padStart(2, '0');
  return (
    ist.getUTCFullYear() + '-' +
    pad(ist.getUTCMonth() + 1) + '-' +
    pad(ist.getUTCDate()) + ' ' +
    pad(ist.getUTCHours()) + ':' +
    pad(ist.getUTCMinutes()) + ':' +
    pad(ist.getUTCSeconds())
  );
}); // TIMESTAMPTZ → "YYYY-MM-DD HH:MM:SS" in IST

const pool = new Pool(
  (process.env.DATABASE_URL || process.env.reservations_DATABASE_URL)
    ? {
        connectionString: process.env.DATABASE_URL || process.env.reservations_DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: parseInt(process.env.DB_POOL_MAX || '10'),
        idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000'),
        connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '2000'),
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'concrete_reservation',
        user: process.env.DB_USER || 'concrete_user',
        password: process.env.DB_PASSWORD || 'concrete_pass',
        max: parseInt(process.env.DB_POOL_MAX || '10'),
        idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000'),
        connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '2000'),
      }
);

pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err);
});

// Helper: run a query
const query = (text, params) => pool.query(text, params);

// Helper: get a client for transactions
const getClient = () => pool.connect();

// Helper: run a transaction
const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { pool, query, getClient, withTransaction };
