// src/db/migrate.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function runMigrations(reset = false) {
  const client = await pool.connect();
  try {
    if (reset) {
      console.log('🔴 Resetting database...');
      await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      console.log('Schema dropped and recreated');
    }

    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        run_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Get already-run migrations
    const { rows: ran } = await client.query('SELECT filename FROM _migrations');
    const ranSet = new Set(ran.map((r) => r.filename));

    // Get all migration files sorted
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (ranSet.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`  Running migration: ${file}`);
      await client.query(sql);
      await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
      count++;
    }

    if (count === 0) {
      console.log('✅ All migrations already up to date');
    } else {
      console.log(`✅ Ran ${count} migration(s)`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

const reset = process.argv.includes('--reset');
runMigrations(reset).catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
