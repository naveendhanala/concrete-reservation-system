require('dotenv').config();
const { pool } = require('./src/config/db');

async function check() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const dateStr = yyyy + '-' + mm + '-' + dd;

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yyyy2 = tomorrow.getFullYear();
  const mm2 = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const dd2 = String(tomorrow.getDate()).padStart(2, '0');
  const tomorrowStr = yyyy2 + '-' + mm2 + '-' + dd2;

  console.log('Today:', dateStr);
  console.log('Tomorrow:', tomorrowStr);

  const { rows: todaySlots } = await pool.query(
    'SELECT slot_date, start_time, end_time, capacity_m3 FROM slots WHERE slot_date = $1 ORDER BY start_time',
    [dateStr]
  );
  console.log('\nSlots found for TODAY:', todaySlots.length);
  console.table(todaySlots);

  const { rows: tomorrowSlots } = await pool.query(
    'SELECT slot_date, start_time, end_time, capacity_m3 FROM slots WHERE slot_date = $1 ORDER BY start_time',
    [tomorrowStr]
  );
  console.log('\nSlots found for TOMORROW:', tomorrowSlots.length);
  console.table(tomorrowSlots);

  const { rows: allSlots } = await pool.query(
    'SELECT slot_date, COUNT(*) as count FROM slots GROUP BY slot_date ORDER BY slot_date LIMIT 10'
  );
  console.log('\nAll slots in DB grouped by date:');
  console.table(allSlots);

  await pool.end();
}

check().catch(err => { console.error(err); process.exit(1); });